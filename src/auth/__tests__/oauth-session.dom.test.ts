import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserMock, seedStorage } from "@/test/browser-mock";

vi.mock("@/config/env", () => ({
  CLERK_OAUTH_CLIENT_ID: "oauth_app_test",
  CLERK_OAUTH_ISSUER: "https://clerk.example.com",
}));

import { beginOAuthSignIn, getOAuthUser } from "@/auth/oauth-session";

describe("Clerk OAuth PKCE session", () => {
  beforeEach(() => {
    browserMock.identity.launchWebAuthFlow.mockImplementation(async (details: unknown) => {
      const authorize = new URL((details as { url: string }).url);
      return `https://test-id.chromiumapp.org/oauth2?code=auth_code&state=${authorize.searchParams.get("state")}`;
    });
  });

  it("uses Authorization Code + PKCE and reads unsafe metadata with public_metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }), {
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
    vi.unstubAllGlobals();
  });

  it("refreshes an expired access token without a client secret", async () => {
    seedStorage({
      clerkOAuthSessionV1: { accessToken: "expired", refreshToken: "refresh", expiresAt: 1 },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), {
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
});
