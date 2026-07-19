import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemosConnection } from "@/hooks/use-memos-connection";
import type { ConnectionStateResult } from "@/lib/messages";
import { oauthUserWithMemos, setMockOAuthUser } from "@/test/auth-mock";
import { browserMock } from "@/test/browser-mock";
import { renderHook, waitFor } from "@/test/render";

vi.mock("@/auth/auth-provider", () => import("@/test/auth-mock"));

const connection = (over: Partial<ConnectionStateResult> = {}): ConnectionStateResult => ({
  instanceUrl: null,
  version: null,
  status: "disconnected",
  verificationError: null,
  isUsingCachedVersion: false,
  ...over,
});

describe("useMemosConnection", () => {
  beforeEach(() => {
    setMockOAuthUser(null);
    browserMock.runtime.sendMessage.mockResolvedValue(connection());
  });

  it("reads sanitized connection state without exposing credentials", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    browserMock.runtime.sendMessage.mockResolvedValue(
      connection({ instanceUrl: "https://memos.example.com", version: "0.29.1", status: "ready" }),
    );

    const { result } = renderHook(() => useMemosConnection());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.instanceUrl).toBe("https://memos.example.com");
    expect(result.current).not.toHaveProperty("credentials");
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "GET_CONNECTION_STATE", refresh: true });
  });

  it("is read-only and disconnected when the background has no Memos settings", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.status).toBe("disconnected");
    expect(result.current).not.toHaveProperty("connect");
    expect(result.current).not.toHaveProperty("disconnect");
  });

  it("reports malformed background-owned metadata as invalid", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    browserMock.runtime.sendMessage.mockResolvedValue(connection({ status: "invalid" }));
    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.status).toBe("invalid"));
    expect(result.current.instanceUrl).toBeNull();
  });

  it("keeps sanitized cached diagnostics while reporting a live timeout", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    browserMock.runtime.sendMessage.mockResolvedValue(
      connection({
        instanceUrl: "https://memos.example.com",
        version: "0.29.1",
        status: "ready",
        verificationError: "timeout",
        isUsingCachedVersion: true,
      }),
    );
    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.status).toBe("ready");
    expect(result.current.verificationError).toBe("timeout");
    expect(result.current.isUsingCachedVersion).toBe(true);
  });

  it("fails closed when the background cannot verify the account", async () => {
    setMockOAuthUser(oauthUserWithMemos());
    browserMock.runtime.sendMessage.mockRejectedValue(new Error("oauth unavailable"));
    const { result } = renderHook(() => useMemosConnection());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.verificationError).toBe("auth-unavailable");
    expect(result.current.version).toBeNull();
  });
});
