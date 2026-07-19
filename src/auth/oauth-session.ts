import browser from "webextension-polyfill";
import { CLERK_OAUTH_CLIENT_ID, CLERK_OAUTH_ISSUER } from "@/config/env";

const SESSION_KEY = "clerkOAuthSessionV2";
const LEGACY_SESSION_KEY = "clerkOAuthSessionV1";
const EXPIRY_SKEW_MS = 60_000;
const OAUTH_REQUEST_TIMEOUT_MS = 15_000;
const MAX_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export type OAuthIdentity = {
  id: string;
  displayName: string;
  imageUrl?: string;
};

/** Full userinfo is background-only because unsafeMetadata contains the Memos access token. */
export type OAuthUser = OAuthIdentity & {
  unsafeMetadata: Record<string, unknown>;
};

type UserInfoResponse = {
  sub?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  picture?: unknown;
  unsafe_metadata?: unknown;
};

type StoredSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  /** Identifies one storage write so a superseded request never removes a newer session. */
  writeId?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

let sessionGeneration = 0;
let authAbortController = new AbortController();
let refreshFlight: { generation: number; promise: Promise<StoredSession | null> } | undefined;

// V1 cached the complete userinfo object, including unsafe_metadata. Migrate only the
// OAuth token set and delete that legacy copy before any public session operation runs.
let legacySessionMigration: Promise<void> | undefined;

function migrateLegacySession(): Promise<void> {
  legacySessionMigration ??= (async () => {
    const stored = await browser.storage.local.get([SESSION_KEY, LEGACY_SESSION_KEY]);
    const current = stored[SESSION_KEY];
    const legacy = stored[LEGACY_SESSION_KEY];
    if (!current && legacy && typeof legacy === "object") {
      const value = legacy as Record<string, unknown>;
      if (
        typeof value.accessToken === "string" &&
        value.accessToken &&
        typeof value.expiresAt === "number" &&
        Number.isFinite(value.expiresAt)
      ) {
        await browser.storage.local.set({
          [SESSION_KEY]: {
            accessToken: value.accessToken,
            expiresAt: value.expiresAt,
            ...(typeof value.refreshToken === "string" && value.refreshToken ? { refreshToken: value.refreshToken } : {}),
            writeId: crypto.randomUUID(),
          } satisfies StoredSession,
        });
      }
    }
    await browser.storage.local.remove(LEGACY_SESSION_KEY);
  })();
  return legacySessionMigration;
}

export class OAuthUnavailableError extends Error {
  constructor(message = "OAuth service is temporarily unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "OAuthUnavailableError";
  }
}

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
  let issuer: URL;
  try {
    issuer = new URL(CLERK_OAUTH_ISSUER);
  } catch {
    throw new Error("Clerk OAuth issuer is not a valid URL");
  }
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) {
    throw new Error("Clerk OAuth issuer must be a credential-free https URL");
  }
  return new URL(path, `${issuer.origin}/`).toString();
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

function beginSessionGeneration(): number {
  sessionGeneration += 1;
  authAbortController.abort();
  authAbortController = new AbortController();
  refreshFlight = undefined;
  return sessionGeneration;
}

function requestSignal(generation: number): AbortSignal {
  if (generation !== sessionGeneration) return AbortSignal.abort();
  return AbortSignal.any([authAbortController.signal, AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS)]);
}

async function readSession(): Promise<StoredSession | null> {
  const value = (await browser.storage.local.get(SESSION_KEY))[SESSION_KEY];
  if (!value || typeof value !== "object") return null;
  const session = value as StoredSession;
  return typeof session.accessToken === "string" &&
    session.accessToken &&
    typeof session.expiresAt === "number" &&
    Number.isFinite(session.expiresAt)
    ? session
    : null;
}

async function writeSession(session: StoredSession, generation: number): Promise<boolean> {
  if (generation !== sessionGeneration) return false;
  const next = { ...session, writeId: crypto.randomUUID() };
  await browser.storage.local.set({ [SESSION_KEY]: next });
  if (generation === sessionGeneration) return true;

  // A sign-out may have raced the storage write. Remove only this stale write, never
  // a newer account session that won the race afterward.
  const current = await readSession();
  if (current?.writeId === next.writeId) await browser.storage.local.remove(SESSION_KEY);
  return false;
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (!value || typeof value !== "object") throw new Error("OAuth token response was not an object");
  const token = value as Record<string, unknown>;
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("OAuth token response did not include an access token");
  }
  if (typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer") {
    throw new Error("OAuth token response did not use the Bearer token type");
  }
  if (
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    token.expires_in > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error("OAuth token response included an invalid expiry");
  }
  if (token.refresh_token !== undefined && (typeof token.refresh_token !== "string" || !token.refresh_token)) {
    throw new Error("OAuth token response included an invalid refresh token");
  }
  return {
    access_token: token.access_token,
    token_type: token.token_type,
    expires_in: token.expires_in,
    ...(typeof token.refresh_token === "string" ? { refresh_token: token.refresh_token } : {}),
  };
}

async function requestToken(body: URLSearchParams, generation: number): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(issuerUrl("/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: requestSignal(generation),
    });
  } catch (error) {
    if (generation !== sessionGeneration) throw error;
    throw new OAuthUnavailableError("OAuth token request failed", { cause: error });
  }
  if (!response.ok) throw new OAuthResponseError("OAuth token request failed", response.status);
  try {
    return parseTokenResponse(await response.json());
  } catch (error) {
    throw new OAuthUnavailableError("OAuth token response was invalid", { cause: error });
  }
}

function isRejectedGrant(error: unknown): boolean {
  return error instanceof OAuthResponseError && (error.status === 400 || error.status === 401 || error.status === 403);
}

function isSameStoredSession(left: StoredSession, right: StoredSession): boolean {
  if (left.writeId || right.writeId) return left.writeId === right.writeId;
  return left.accessToken === right.accessToken && left.refreshToken === right.refreshToken && left.expiresAt === right.expiresAt;
}

async function clearSessionIfCurrent(generation: number, observed?: StoredSession): Promise<void> {
  if (generation !== sessionGeneration) return;
  if (observed) {
    const current = await readSession();
    if (generation !== sessionGeneration || !current || !isSameStoredSession(current, observed)) return;
  }
  beginSessionGeneration();
  await browser.storage.local.remove(SESSION_KEY);
}

async function refreshSession(session: StoredSession, generation: number): Promise<StoredSession | null> {
  if (!session.refreshToken) {
    await clearSessionIfCurrent(generation, session);
    return null;
  }
  try {
    const token = await requestToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLERK_OAUTH_CLIENT_ID,
        refresh_token: session.refreshToken,
      }),
      generation,
    );
    const next: StoredSession = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return (await writeSession(next, generation)) ? next : null;
  } catch (error) {
    if (generation !== sessionGeneration) return null;
    if (isRejectedGrant(error)) {
      await clearSessionIfCurrent(generation, session);
      return null;
    }
    if (error instanceof OAuthUnavailableError) throw error;
    throw new OAuthUnavailableError("OAuth refresh failed", { cause: error });
  }
}

function renewSession(session: StoredSession, generation: number): Promise<StoredSession | null> {
  if (refreshFlight?.generation === generation) return refreshFlight.promise;
  const promise = refreshSession(session, generation).finally(() => {
    if (refreshFlight?.promise === promise) refreshFlight = undefined;
  });
  refreshFlight = { generation, promise };
  return promise;
}

/** Re-read before refreshing so a delayed caller never refreshes (or invalidates) an older token set. */
async function renewLatestSession(observed: StoredSession, generation: number, forceIfUnchanged: boolean): Promise<StoredSession | null> {
  const current = await readSession();
  if (generation !== sessionGeneration || !current) return null;
  const unchanged = isSameStoredSession(current, observed);
  if (current.expiresAt > Date.now() + EXPIRY_SKEW_MS && (!unchanged || !forceIfUnchanged)) return current;
  return renewSession(current, generation);
}

async function activeSession(generation: number): Promise<StoredSession | null> {
  const session = await readSession();
  if (generation !== sessionGeneration || !session) return null;
  if (session.expiresAt > Date.now() + EXPIRY_SKEW_MS) return session;
  return renewLatestSession(session, generation, false);
}

async function fetchUserInfo(accessToken: string, generation: number): Promise<OAuthUser> {
  let response: Response;
  try {
    response = await fetch(issuerUrl("/oauth/userinfo"), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: requestSignal(generation),
    });
  } catch (error) {
    if (generation !== sessionGeneration) throw error;
    throw new OAuthUnavailableError("OAuth user info request failed", { cause: error });
  }
  if (!response.ok) throw new OAuthResponseError("OAuth user info request failed", response.status);

  let info: UserInfoResponse;
  try {
    info = (await response.json()) as UserInfoResponse;
  } catch (error) {
    throw new OAuthUnavailableError("OAuth user info response was invalid", { cause: error });
  }
  if (typeof info.sub !== "string" || !info.sub) throw new OAuthUnavailableError("OAuth user info did not include a subject");
  const givenName = typeof info.given_name === "string" ? info.given_name : undefined;
  const familyName = typeof info.family_name === "string" ? info.family_name : undefined;
  const fullName = typeof info.name === "string" ? info.name : [givenName, familyName].filter(Boolean).join(" ");
  const metadata =
    info.unsafe_metadata && typeof info.unsafe_metadata === "object" && !Array.isArray(info.unsafe_metadata)
      ? (info.unsafe_metadata as Record<string, unknown>)
      : {};
  return {
    id: info.sub,
    displayName: fullName || "Account",
    ...(typeof info.picture === "string" && info.picture ? { imageUrl: info.picture } : {}),
    unsafeMetadata: metadata,
  };
}

export function toOAuthIdentity(user: OAuthUser): OAuthIdentity {
  return {
    id: user.id,
    displayName: user.displayName,
    ...(user.imageUrl ? { imageUrl: user.imageUrl } : {}),
  };
}

export async function beginOAuthSignIn(): Promise<OAuthUser> {
  await migrateLegacySession();
  const generation = beginSessionGeneration();
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
  if (generation !== sessionGeneration) throw new Error("OAuth sign-in was superseded");
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
    generation,
  );
  const user = await fetchUserInfo(token.access_token, generation);
  const stored = await writeSession(
    {
      accessToken: token.access_token,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      expiresAt: Date.now() + token.expires_in * 1000,
    },
    generation,
  );
  if (!stored) throw new Error("OAuth sign-in was superseded");
  return user;
}

export async function getOAuthUser(): Promise<OAuthUser | null> {
  await migrateLegacySession();
  const generation = sessionGeneration;
  const session = await activeSession(generation);
  if (!session || generation !== sessionGeneration) return null;
  try {
    return await fetchUserInfo(session.accessToken, generation);
  } catch (error) {
    if (generation !== sessionGeneration) return null;
    if (!(error instanceof OAuthResponseError) || (error.status !== 401 && error.status !== 403)) {
      if (error instanceof OAuthUnavailableError) throw error;
      throw new OAuthUnavailableError("OAuth user verification failed", { cause: error });
    }

    const renewed = await renewLatestSession(session, generation, true);
    if (!renewed || generation !== sessionGeneration) return null;
    try {
      return await fetchUserInfo(renewed.accessToken, generation);
    } catch (retryError) {
      if (generation !== sessionGeneration) return null;
      if (retryError instanceof OAuthResponseError && (retryError.status === 401 || retryError.status === 403)) {
        await clearSessionIfCurrent(generation, renewed);
        return null;
      }
      if (retryError instanceof OAuthUnavailableError) throw retryError;
      throw new OAuthUnavailableError("OAuth user verification failed after refresh", { cause: retryError });
    }
  }
}

export async function clearOAuthSession(): Promise<void> {
  await migrateLegacySession();
  beginSessionGeneration();
  await browser.storage.local.remove([SESSION_KEY, LEGACY_SESSION_KEY]);
}
