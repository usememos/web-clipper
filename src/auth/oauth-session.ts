import browser from "webextension-polyfill";
import { CLERK_OAUTH_CLIENT_ID, CLERK_OAUTH_ISSUER } from "@/config/env";

const SESSION_KEY = "clerkOAuthSessionV1";
const EXPIRY_SKEW_MS = 60_000;

export type OAuthUser = {
  id: string;
  displayName: string;
  imageUrl?: string;
  unsafeMetadata: Record<string, unknown>;
};

type UserInfoResponse = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  unsafe_metadata?: Record<string, unknown>;
};

type StoredSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user?: OAuthUser;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

let refreshPromise: Promise<StoredSession | null> | undefined;

class OAuthResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(`${message} (${status})`);
  }
}

function issuerUrl(path: string): string {
  if (!CLERK_OAUTH_ISSUER || !CLERK_OAUTH_CLIENT_ID) {
    throw new Error("Clerk OAuth is not configured. Set VITE_CLERK_OAUTH_ISSUER and VITE_CLERK_OAUTH_CLIENT_ID.");
  }
  return `${CLERK_OAUTH_ISSUER.replace(/\/$/, "")}${path}`;
}

function randomBase64Url(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(data);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

async function readSession(): Promise<StoredSession | null> {
  const value = (await browser.storage.local.get(SESSION_KEY))[SESSION_KEY];
  if (!value || typeof value !== "object") return null;
  const session = value as StoredSession;
  return typeof session.accessToken === "string" && typeof session.expiresAt === "number" ? session : null;
}

async function writeSession(session: StoredSession): Promise<void> {
  await browser.storage.local.set({ [SESSION_KEY]: session });
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(issuerUrl("/oauth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new OAuthResponseError("OAuth token request failed", response.status);
  const token = (await response.json()) as Partial<TokenResponse>;
  if (!token.access_token) throw new Error("OAuth token response did not include an access token");
  return token as TokenResponse;
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  if (!session.refreshToken) return null;
  try {
    const token = await requestToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLERK_OAUTH_CLIENT_ID,
        refresh_token: session.refreshToken,
      }),
    );
    const next: StoredSession = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + (token.expires_in ?? 86_400) * 1000,
      user: session.user,
    };
    await writeSession(next);
    return next;
  } catch {
    await clearOAuthSession();
    return null;
  }
}

async function activeSession(): Promise<StoredSession | null> {
  const session = await readSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + EXPIRY_SKEW_MS) return session;
  refreshPromise ??= refreshSession(session).finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

async function fetchUserInfo(accessToken: string): Promise<OAuthUser> {
  const response = await fetch(issuerUrl("/oauth/userinfo"), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new OAuthResponseError("OAuth user info request failed", response.status);
  const info = (await response.json()) as UserInfoResponse;
  if (!info.sub) throw new Error("OAuth user info did not include a subject");
  const fullName = info.name ?? [info.given_name, info.family_name].filter(Boolean).join(" ");
  return {
    id: info.sub,
    displayName: fullName || "Account",
    ...(info.picture ? { imageUrl: info.picture } : {}),
    unsafeMetadata: info.unsafe_metadata ?? {},
  };
}

export async function beginOAuthSignIn(): Promise<OAuthUser> {
  const redirectUri = browser.identity.getRedirectURL("oauth2");
  const state = randomBase64Url();
  const verifier = randomBase64Url(48);
  const authorize = new URL(issuerUrl("/oauth/authorize"));
  authorize.search = new URLSearchParams({
    client_id: CLERK_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    // Clerk's public_metadata scope exposes both public and unsafe metadata. The extension
    // intentionally remains read-only; usememos.com owns all unsafe_metadata writes.
    scope: "openid profile public_metadata",
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();

  const callbackUrl = await browser.identity.launchWebAuthFlow({ url: authorize.toString(), interactive: true });
  if (!callbackUrl) throw new Error("OAuth sign-in was cancelled");
  const callback = new URL(callbackUrl);
  const expected = new URL(redirectUri);
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) throw new Error("OAuth redirect URI did not match");
  if (callback.searchParams.get("state") !== state) throw new Error("OAuth state did not match");
  const oauthError = callback.searchParams.get("error");
  if (oauthError) throw new Error(callback.searchParams.get("error_description") ?? oauthError);
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("OAuth redirect did not include an authorization code");

  const token = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLERK_OAUTH_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  );
  const user = await fetchUserInfo(token.access_token);
  await writeSession({
    accessToken: token.access_token,
    ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
    expiresAt: Date.now() + (token.expires_in ?? 86_400) * 1000,
    user,
  });
  return user;
}

export async function getOAuthUser(): Promise<OAuthUser | null> {
  const session = await activeSession();
  if (!session) return null;
  try {
    const user = await fetchUserInfo(session.accessToken);
    await writeSession({ ...session, user });
    return user;
  } catch (error) {
    if (error instanceof OAuthResponseError && (error.status === 401 || error.status === 403)) {
      const renewed = await refreshSession(session);
      if (!renewed) {
        await clearOAuthSession();
        return null;
      }
      try {
        const user = await fetchUserInfo(renewed.accessToken);
        await writeSession({ ...renewed, user });
        return user;
      } catch {
        await clearOAuthSession();
        return null;
      }
    }
    return session.user ?? null;
  }
}

export async function clearOAuthSession(): Promise<void> {
  await browser.storage.local.remove(SESSION_KEY);
}
