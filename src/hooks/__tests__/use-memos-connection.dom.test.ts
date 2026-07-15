import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemosConnection } from "@/hooks/use-memos-connection";
import { VERSION_CACHE_KEY } from "@/lib/instance-version";
import { oauthUserWithMemos, setMockOAuthUser } from "@/test/auth-mock";
import { renderHook, waitFor } from "@/test/render";

vi.mock("@/auth/auth-provider", () => import("@/test/auth-mock"));

describe("useMemosConnection", () => {
  beforeEach(() => setMockOAuthUser(null));

  it("reads credentials and template from OAuth unsafe metadata", async () => {
    setMockOAuthUser({
      ...oauthUserWithMemos(),
      unsafeMetadata: {
        memos: {
          instanceUrl: "https://memos.example.com",
          accessToken: "tok",
          template: "{{content}}",
        },
      },
    });
    window.localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify({ instanceUrl: "https://memos.example.com", version: "0.29.1" }));
    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.credentials).toEqual({ instanceUrl: "https://memos.example.com", accessToken: "tok" });
    expect(result.current.template).toBe("{{content}}");
  });

  it("is read-only and disconnected when userinfo has no Memos settings", () => {
    setMockOAuthUser({ ...oauthUserWithMemos(), unsafeMetadata: {} });
    const { result } = renderHook(() => useMemosConnection());
    expect(result.current.status).toBe("disconnected");
    expect(result.current).not.toHaveProperty("connect");
    expect(result.current).not.toHaveProperty("disconnect");
  });
});
