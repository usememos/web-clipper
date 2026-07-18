import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemosConnection } from "@/hooks/use-memos-connection";
import { VERSION_CACHE_KEY } from "@/lib/instance-version";
import { oauthUserWithMemos, setMockOAuthUser } from "@/test/auth-mock";
import { seedStorage } from "@/test/browser-mock";
import { renderHook, waitFor } from "@/test/render";

vi.mock("@/auth/auth-provider", () => import("@/test/auth-mock"));

describe("useMemosConnection", () => {
  beforeEach(() => setMockOAuthUser(null));
  afterEach(() => vi.unstubAllGlobals());

  it("reads credentials from OAuth unsafe metadata", async () => {
    setMockOAuthUser({
      ...oauthUserWithMemos(),
      unsafeMetadata: {
        memos: {
          instanceUrl: "https://memos.example.com",
          accessToken: "tok",
        },
      },
    });
    window.localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify({ instanceUrl: "https://memos.example.com", version: "0.29.1" }));
    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.credentials).toEqual({ instanceUrl: "https://memos.example.com", accessToken: "tok" });
  });

  it("is read-only and disconnected when userinfo has no Memos settings", () => {
    setMockOAuthUser({ ...oauthUserWithMemos(), unsafeMetadata: {} });
    const { result } = renderHook(() => useMemosConnection());
    expect(result.current.status).toBe("disconnected");
    expect(result.current).not.toHaveProperty("connect");
    expect(result.current).not.toHaveProperty("disconnect");
  });

  it("classifies malformed synced metadata without crashing the options page", () => {
    setMockOAuthUser({
      ...oauthUserWithMemos(),
      unsafeMetadata: { memos: { instanceUrl: "not a url", accessToken: "tok" } },
    });
    const { result } = renderHook(() => useMemosConnection());
    expect(result.current.credentials).toBeNull();
    expect(result.current.status).toBe("invalid");
  });

  it("keeps a supported cached version usable while reporting a live timeout", async () => {
    const user = oauthUserWithMemos();
    setMockOAuthUser(user);
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: "https://memos.example.com", version: "0.29.1" } });
    window.localStorage.setItem(VERSION_CACHE_KEY, JSON.stringify({ instanceUrl: "https://memos.example.com", version: "0.29.1" }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));

    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.status).toBe("ready");
    expect(result.current.verificationError).toBe("timeout");
    expect(result.current.isUsingCachedVersion).toBe(true);
  });

  it("reports a verification error instead of calling an unreachable instance unsupported", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));

    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.verificationError).toBe("timeout");
    expect(result.current.version).toBeNull();
  });
});
