import { type ReactNode, StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { AI_SETTINGS_KEY, type AiResult, DEFAULT_AI_PREFERENCES } from "@/lib/ai";
import { browserMock } from "@/test/browser-mock";
import { act, renderHook, waitFor } from "@/test/render";
import type { PageCapture } from "../page-capture";
import { useClipper } from "../use-clipper";

const capture: PageCapture = {
  title: "Post",
  url: "https://example.com/post",
  articleMarkdown: "Subscribe\n\nFacts and code",
  selectionMarkdown: "",
  description: "Ad",
  images: [],
};
const expectation = { source: "direct" as const, connectionId: "one", instanceUrl: "https://memos.example.com" };
const success: AiResult = {
  ok: true,
  preferences: DEFAULT_AI_PREFERENCES,
  clip: { content: "Facts and code", summary: "中文摘要。", tags: ["编程"] },
};
function wire(result: Promise<AiResult> | AiResult = success, enabled = true, automatic = true) {
  browserMock.runtime.sendMessage.mockImplementation(async (request: any) => {
    if (request.type === "GET_AI_SETTINGS")
      return {
        ok: true,
        settings: { enabled, hasApiKey: true, preferredTags: [], preferences: { ...DEFAULT_AI_PREFERENCES, automatic }, revision: 0 },
      };
    if (request.type === "GENERATE_AI_CLIP") return result;
    if (request.type === "SAVE_MEMO") return { ok: true, webUrl: "https://memos.example.com/memos/1" };
    return null;
  });
}
function deferred() {
  let resolve!: (value: AiResult) => void;
  const promise = new Promise<AiResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const useReady = (page = capture) => useClipper(page, null, true, expectation);
const generatingCalls = () => browserMock.runtime.sendMessage.mock.calls.filter(([m]) => (m as any).type === "GENERATE_AI_CLIP");

describe("automatic AI clipping", () => {
  it("organizes once even in StrictMode, saves exactly the preview, and can restore the original", async () => {
    wire();
    const { result } = renderHook(() => useReady(), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.aiApplied).toBe(true));
    expect(generatingCalls()).toHaveLength(1);
    expect(result.current.content).toContain("中文摘要。");
    expect(result.current.content).not.toContain("Subscribe");
    expect(result.current.content).not.toContain("Ad");
    await act(async () => {
      await result.current.save();
    });
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SAVE_MEMO", content: result.current.content }),
    );
    act(() => result.current.restoreOriginal());
    expect(result.current.content).toContain("Subscribe");
    expect(result.current.content).not.toContain("中文摘要。");
  });

  it("only sends the explicit selection, without the surrounding article or metadata", async () => {
    wire();
    renderHook(() => useReady({ ...capture, selectionMarkdown: "> selected facts" }));
    await waitFor(() => expect(generatingCalls()).toHaveLength(1));
    expect(generatingCalls()[0]![0]).toEqual(
      expect.objectContaining({
        type: "GENERATE_AI_CLIP",
        title: "Post",
        content: "> selected facts",
        requestId: expect.any(String),
        bypassCache: false,
      }),
    );
  });

  it("does not call AI when disabled or when only a title and page description exist", async () => {
    wire(success, false);
    const { result, unmount } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.ai.status).toBe("off"));
    expect(generatingCalls()).toHaveLength(0);
    unmount();
    wire();
    const second = renderHook(() => useReady({ ...capture, articleMarkdown: "" }));
    await waitFor(() => expect(second.result.current.ai.error).toBe("no-content"));
    expect(generatingCalls()).toHaveLength(0);
  });

  it("keeps manual edits, including an empty draft, when the response arrives late", async () => {
    const pending = deferred();
    wire(pending.promise);
    const { result } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.ai.status).toBe("generating"));
    act(() => result.current.setContent(""));
    await act(async () => pending.resolve(success));
    expect(result.current.content).toBe("");
    expect(result.current.aiApplied).toBe(false);
    expect(result.current.aiContent).toContain("中文摘要。");
    act(() => result.current.applyAi());
    expect(result.current.content).toContain("中文摘要。");
  });

  it("keeps saved content unchanged when generation completes after Save", async () => {
    const pending = deferred();
    wire(pending.promise);
    const { result } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.ai.status).toBe("generating"));
    const saved = result.current.content;
    await act(async () => {
      await result.current.save();
    });
    await act(async () => pending.resolve(success));
    expect(result.current.content).toBe(saved);
    expect(result.current.aiApplied).toBe(false);
  });

  it("stops showing generation when the connection becomes unavailable", async () => {
    const pending = deferred();
    wire(pending.promise);
    const { result, rerender } = renderHook(({ ready }) => useClipper(capture, null, true, ready ? expectation : null), {
      initialProps: { ready: true },
    });
    await waitFor(() => expect(result.current.ai.status).toBe("generating"));
    rerender({ ready: false });
    await act(async () => pending.resolve(success));
    expect(result.current.ai.status).toBe("off");
    expect(result.current.content).toContain("Subscribe");
  });

  it("leaves the original usable on failure and only retries explicitly", async () => {
    wire({ ok: false, error: "timeout" });
    const { result } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.ai.error).toBe("timeout"));
    expect(result.current.content).toContain("Facts and code");
    expect(generatingCalls()).toHaveLength(1);
    wire();
    act(() => result.current.ai.retry());
    await waitFor(() => expect(result.current.aiApplied).toBe(true));
  });
});

describe("AI clipping interactions", () => {
  it("waits for explicit generation in manual mode and bypasses cache on regeneration", async () => {
    wire(success, true, false);
    const { result } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.ai.status).toBe("idle"));
    expect(generatingCalls()).toHaveLength(0);
    act(() => result.current.ai.retry());
    await waitFor(() => expect(result.current.aiApplied).toBe(true));
    expect(generatingCalls()[0]![0]).toMatchObject({ bypassCache: true });
    act(() => result.current.ai.retry());
    await waitFor(() => expect(generatingCalls()).toHaveLength(2));
  });

  it.each(["cancel", "pagehide", "unmount"])("sends cancellation and ignores late responses after %s", async (action) => {
    const pending = deferred();
    wire(pending.promise);
    const { result, unmount } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.ai.status).toBe("generating"));
    const request = generatingCalls()[0]![0] as { requestId: string };
    act(() => {
      if (action === "unmount") unmount();
      else if (action === "pagehide") window.dispatchEvent(new Event("pagehide"));
      else result.current.ai.cancel();
    });
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: "CANCEL_AI_CLIP", requestId: request.requestId });
    await act(async () => pending.resolve(success));
    if (action !== "unmount") {
      expect(result.current.ai.status).toBe("idle");
      expect(result.current.content).toContain("Subscribe");
    }
  });

  it("restores a manual draft after applying AI or restoring the original", async () => {
    wire();
    const { result } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.aiApplied).toBe(true));
    act(() => result.current.setContent("My own draft"));
    act(() => result.current.applyAi());
    expect(result.current.aiApplied).toBe(true);
    act(() => result.current.undoAi());
    expect(result.current.content).toBe("My own draft");
    act(() => result.current.restoreOriginal());
    expect(result.current.content).toContain("Subscribe");
    act(() => result.current.undoAi());
    expect(result.current.content).toBe("My own draft");
  });

  it("reacts to saved settings changes without overwriting a manual draft", async () => {
    wire();
    const { result } = renderHook(() => useReady());
    await waitFor(() => expect(result.current.aiApplied).toBe(true));
    act(() => result.current.setContent("Keep this"));
    wire(success, false);
    await act(async () => {
      await browserMock.storage.onChanged.emit({ [AI_SETTINGS_KEY]: {} }, "local");
    });
    await waitFor(() => expect(result.current.ai.status).toBe("off"));
    expect(result.current.content).toBe("Keep this");
  });
});
