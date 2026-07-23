import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "@/auth/auth-provider";
import { applyLocalePreference } from "@/lib/i18n";
import { browserMock } from "@/test/browser-mock";
import { act, renderHook, waitFor } from "@/test/render";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("AuthProvider recovery", () => {
  it("finishes loading and exposes a retryable error when the background request fails", async () => {
    browserMock.runtime.sendMessage.mockRejectedValueOnce(new Error("service worker unavailable"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.error).toMatch(/couldn't refresh/i);
  });

  it("coalesces overlapping account refreshes", async () => {
    let finish!: (value: null) => void;
    browserMock.runtime.sendMessage.mockImplementationOnce(() => new Promise<null>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useAuth(), { wrapper });

    const first = result.current.reload();
    const second = result.current.reload();
    expect(first).toBe(second);
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledOnce();

    await act(async () => {
      finish(null);
      await first;
    });
    expect(result.current.isLoaded).toBe(true);
  });

  it("retranslates a visible error after the locale changes", async () => {
    browserMock.runtime.sendMessage.mockRejectedValueOnce(new Error("service worker unavailable"));
    const { result, rerender } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.error).toMatch(/couldn't refresh/i));
    applyLocalePreference("es");
    rerender();

    expect(result.current.error).toBe("La extensión no ha podido actualizar tu cuenta usememos.com.");
  });
});
