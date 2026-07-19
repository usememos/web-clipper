import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserMock, seedStorage } from "@/test/browser-mock";

vi.mock("@/config/env", () => ({
  CLERK_OAUTH_CLIENT_ID: "oauth_app_test",
  CLERK_OAUTH_ISSUER: "https://clerk.example.com",
}));

import { beginOAuthSignIn, clearOAuthSession, getOAuthUser, OAuthUnavailableError } from "@/auth/oauth-session";

describe("Clerk OAuth PKCE session", () => {
  beforeEach(() => {
    browserMock.identity.launchWebAuthFlow.mockImplementation(async (details: unknown) => {
      const authorize = new URL((details as { url: string }).url);
      return `https://test-id.chromiumapp.org/oauth2?code=auth_code&state=${authorize.searchParams.get("state")}`;
    });
  });

  it("migrates a V1 session without retaining cached unsafe metadata", async () => {
    seedStorage({
      clerkOAuthSessionV1: {
        accessToken: "legacy-access",
        refreshToken: "legacy-refresh",
        expiresAt: Date.now() + 3_600_000,
        user: {
          id: "user_123",
          displayName: "Cached",
          unsafeMetadata: { memos: { instanceUrl: "https://memos.example.com", accessToken: "memos-secret" } },
        },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sub: "user_123", name: "Steven", unsafe_metadata: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(getOAuthUser()).resolves.toMatchObject({ id: "user_123" });
    const stored = await browserMock.storage.local.get(["clerkOAuthSessionV1", "clerkOAuthSessionV2"]);
    expect(stored).not.toHaveProperty("clerkOAuthSessionV1");
    expect(stored).toMatchObject({ clerkOAuthSessionV2: { accessToken: "legacy-access", refreshToken: "legacy-refresh" } });
    expect(JSON.stringify(stored)).not.toContain("memos-secret");
    vi.unstubAllGlobals();
  });

  it("uses Authorization Code + PKCE and reads unsafe metadata with public_metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: "user_123",
            name: "Steven Li",
            email: "steven@example.com",
            unsafe_metadata: { memos: { instanceUrl: "https://memos.example.com", accessToken: "tok" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const user = await beginOAuthSignIn();
    const authorize = new URL((browserMock.identity.launchWebAuthFlow.mock.calls[0]![0] as { url: string }).url);
    expect(authorize.origin + authorize.pathname).toBe("https://clerk.example.com/oauth/authorize");
    expect(authorize.searchParams.get("scope")).toBe("openid profile public_metadata");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorize.searchParams.has("client_secret")).toBe(false);

    const tokenBody = fetchMock.mock.calls[0]![1]!.body as URLSearchParams;
    expect(tokenBody.get("grant_type")).toBe("authorization_code");
    expect(tokenBody.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(user.unsafeMetadata).toEqual({ memos: { instanceUrl: "https://memos.example.com", accessToken: "tok" } });
    const stored = await browserMock.storage.local.get("clerkOAuthSessionV2");
    expect(JSON.stringify(stored)).not.toContain("unsafeMetadata");
    expect(JSON.stringify(stored)).not.toContain('"tok"');
    vi.unstubAllGlobals();
  });

  it("refreshes an expired access token without a client secret", async () => {
    seedStorage({
      clerkOAuthSessionV2: { accessToken: "expired", refreshToken: "refresh", expiresAt: 1 },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600, token_type: "Bearer" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sub: "user_123", name: "Steven", unsafe_metadata: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getOAuthUser()).resolves.toMatchObject({ id: "user_123" });
    const body = fetchMock.mock.calls[0]![1]!.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("oauth_app_test");
    expect(body.has("client_secret")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("rejects a callback with the wrong state", async () => {
    browserMock.identity.launchWebAuthFlow.mockResolvedValue("https://test-id.chromiumapp.org/oauth2?code=x&state=wrong");
    await expect(beginOAuthSignIn()).rejects.toThrow(/state did not match/i);
  });

  it("fails closed instead of returning cached credentials when userinfo is unavailable", async () => {
    seedStorage({
      clerkOAuthSessionV2: {
        accessToken: "access",
        expiresAt: Date.now() + 3_600_000,
        user: {
          id: "user_123",
          displayName: "Cached",
          unsafeMetadata: { memos: { instanceUrl: "https://memos.example.com", accessToken: "tok" } },
        },
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(getOAuthUser()).rejects.toBeInstanceOf(OAuthUnavailableError);
    vi.unstubAllGlobals();
  });

  it("does not restore a session when sign-out races an in-flight refresh", async () => {
    seedStorage({ clerkOAuthSessionV2: { accessToken: "expired", refreshToken: "refresh", expiresAt: 1 } });
    let finishRefresh!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => (finishRefresh = resolve)));
    vi.stubGlobal("fetch", fetchMock);

    const pending = getOAuthUser();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await clearOAuthSession();
    finishRefresh(
      new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600, token_type: "Bearer" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(pending).resolves.toBeNull();
    await expect(browserMock.storage.local.get("clerkOAuthSessionV2")).resolves.toEqual({});
    vi.unstubAllGlobals();
  });

  it("does not run a second refresh when a delayed verifier observed the old session", async () => {
    seedStorage({
      clerkOAuthSessionV2: {
        accessToken: "old-access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        writeId: "old-write",
      },
    });
    let oldUserInfoCalls = 0;
    let finishDelayedVerification!: (response: Response) => void;
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("Authorization");
      if (String(url).endsWith("/oauth/userinfo") && authorization === "Bearer old-access") {
        oldUserInfoCalls += 1;
        if (oldUserInfoCalls === 1) return Promise.resolve(new Response(null, { status: 401 }));
        return new Promise<Response>((resolve) => (finishDelayedVerification = resolve));
      }
      if (String(url).endsWith("/oauth/token")) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: "fresh-access", expires_in: 3600, token_type: "Bearer" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      if (String(url).endsWith("/oauth/userinfo") && authorization === "Bearer fresh-access") {
        return Promise.resolve(
          new Response(JSON.stringify({ sub: "user_123", name: "Steven", unsafe_metadata: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = getOAuthUser();
    const delayed = getOAuthUser();
    await vi.waitFor(() => expect(oldUserInfoCalls).toBe(2));
    await expect(first).resolves.toMatchObject({ id: "user_123" });
    finishDelayedVerification(new Response(null, { status: 401 }));
    await expect(delayed).resolves.toMatchObject({ id: "user_123" });

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/oauth/token"))).toHaveLength(1);
    await expect(browserMock.storage.local.get("clerkOAuthSessionV2")).resolves.toMatchObject({
      clerkOAuthSessionV2: { accessToken: "fresh-access" },
    });
    vi.unstubAllGlobals();
  });

  it("rejects a token response without a valid Bearer type and expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(beginOAuthSignIn()).rejects.toBeInstanceOf(OAuthUnavailableError);
    vi.unstubAllGlobals();
  });
});
