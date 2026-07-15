import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserMock } from "@/test/browser-mock";
import { act, renderHook, waitFor } from "@/test/render";
import { PAGE_INJECTION_TIMEOUT_MS, usePageCapture } from "../page-capture";

describe("usePageCapture", () => {
  beforeEach(() => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7, title: "Hello World", url: "https://example.com/post" }]);
    browserMock.scripting.executeScript.mockResolvedValue([
      {
        result: {
          title: "Hello World",
          url: "https://example.com/post",
          selectionHtml: "<h1>Hello</h1><p>Body text</p>",
          description: "A page about greetings",
          images: ["https://cdn.example.com/a.png"],
        },
      },
    ]);
  });

  it("injects into the active tab and returns the selection as quoted markdown plus metadata", async () => {
    const { result } = renderHook(() => usePageCapture());
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }));
    expect(result.current?.selectionMarkdown).toBe("> # Hello\n>\n> Body text");
    expect(result.current?.title).toBe("Hello World");
    expect(result.current?.url).toBe("https://example.com/post");
    expect(result.current?.description).toBe("A page about greetings");
    expect(result.current?.images).toEqual(["https://cdn.example.com/a.png"]);
  });

  it("falls back to the tab title/url with no selection when injection is refused", async () => {
    browserMock.scripting.executeScript.mockRejectedValue(new Error("cannot access page"));
    const { result } = renderHook(() => usePageCapture());
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current).toEqual({
      title: "Hello World",
      url: "https://example.com/post",
      description: undefined,
      selectionMarkdown: "",
      images: [],
      fallbackReason: "restricted",
    });
  });

  it("falls back from metadata to the first readable content paragraph", async () => {
    document.head.innerHTML = "<title>Article</title>";
    document.body.innerHTML = `
      <nav><p>This navigation paragraph is intentionally long enough to be ignored.</p></nav>
      <main><p>This is the first meaningful article paragraph and it contains enough text to be useful.</p></main>
    `;
    browserMock.scripting.executeScript.mockImplementation(async (options: unknown) => {
      const func = (options as { func: () => unknown }).func;
      return [{ result: func() }];
    });

    const { result } = renderHook(() => usePageCapture());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.description).toBe("This is the first meaningful article paragraph and it contains enough text to be useful.");
    expect(result.current?.fallbackReason).toBeUndefined();
  });

  it("returns a link fallback when page injection exceeds its time budget", async () => {
    vi.useFakeTimers();
    browserMock.scripting.executeScript.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => usePageCapture());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAGE_INJECTION_TIMEOUT_MS);
    });

    expect(result.current).toMatchObject({
      title: "Hello World",
      url: "https://example.com/post",
      fallbackReason: "timed-out",
    });
    vi.useRealTimers();
  });
});
