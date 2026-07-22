import { beforeEach, describe, expect, it } from "vitest";
import { LAST_VISIBILITY_KEY } from "@/lib/visibility";
import { browserMock, seedStorage } from "@/test/browser-mock";
import { act, renderHook, waitFor } from "@/test/render";
import type { PageCapture } from "../page-capture";
import { useClipper } from "../use-clipper";

const capture: PageCapture = {
  title: "Hello World",
  url: "https://example.com/post",
  description: "A page about greetings",
  selectionMarkdown: "> # Hello\n>\n> Body text",
  images: [],
};
const expectation = { source: "usememos" as const, connectionId: "user_123", instanceUrl: "https://memos.example.com" };
const useReadyClipper = (cap: PageCapture | null = capture) => useClipper(cap, null, true, expectation);

function wireRuntime(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    SAVE_MEMO: { ok: true, webUrl: "https://memos.example.com/memos/1" },
    ...overrides,
  };
  browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => responses[(msg as { type: string }).type]);
}

describe("useClipper", () => {
  beforeEach(() => {
    wireRuntime();
  });

  it("prefills the editor with the rendered template: quoted selection, description, linked title", async () => {
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.content).toContain("> # Hello"));
    expect(result.current.content).toContain("> Body text");
    expect(result.current.content).toContain("A page about greetings");
    expect(result.current.content).toContain("[Hello World](https://example.com/post)");
  });

  it("prefills a link note when the capture has no selection and no description", async () => {
    const linkOnly: PageCapture = { title: "Hello World", url: "https://example.com/post", selectionMarkdown: "", images: [] };
    const { result } = renderHook(() => useReadyClipper(linkOnly));
    await waitFor(() => expect(result.current.content).toBe("[Hello World](https://example.com/post)"));
  });

  it("exposes the captured image count and carries the URLs through to SAVE_MEMO", async () => {
    const withImages: PageCapture = { ...capture, images: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"] };
    const { result } = renderHook(() => useReadyClipper(withImages));
    expect(result.current.imageCount).toBe(2);
    await waitFor(() => expect(result.current.content).toContain("> # Hello"));

    await act(async () => {
      await result.current.save();
    });
    const saveCall = browserMock.runtime.sendMessage.mock.calls.find(([m]) => (m as { type: string }).type === "SAVE_MEMO");
    expect((saveCall![0] as { images?: string[] }).images).toEqual(["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"]);
  });

  it("never overwrites text the user typed before the capture arrived", async () => {
    const { result, rerender } = renderHook(({ cap }: { cap: PageCapture | null }) => useReadyClipper(cap), {
      initialProps: { cap: null as PageCapture | null },
    });

    act(() => result.current.setContent("my own words"));
    rerender({ cap: capture });
    await waitFor(() => expect(browserMock.tabs.query).toBeDefined());
    expect(result.current.content).toBe("my own words");
  });

  it("save() sends the editor content verbatim and binds it to the rendered account", async () => {
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.content).toContain("Body text"));

    act(() => result.current.setVisibility("PUBLIC"));

    let res: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      res = await result.current.save();
    });

    expect(res!.ok).toBe(true);
    const saveCall = browserMock.runtime.sendMessage.mock.calls.find(([m]) => (m as { type: string }).type === "SAVE_MEMO");
    const sent = saveCall![0] as Record<string, unknown>;
    expect(sent.visibility).toBe("PUBLIC");
    // The editor is the memo: exactly what's on screen is what saves.
    expect(sent.content).toBe(result.current.content);
    expect(sent).not.toHaveProperty("credentials");
    expect(sent).toMatchObject({
      expectedSource: "usememos",
      expectedConnectionId: "user_123",
      expectedInstanceUrl: "https://memos.example.com",
    });
    expect(sent.saveRequestId).toMatch(/^(?:[0-9a-f-]{36}|clip_)/);
    expect(sent.saveStartedAt).toEqual(expect.any(Number));
  });

  it("reuses one operation id when retrying an ambiguous save", async () => {
    let attempts = 0;
    browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
      if ((msg as { type: string }).type !== "SAVE_MEMO") return undefined;
      attempts += 1;
      return attempts === 1 ? { ok: false, errorKind: "timeout" } : { ok: true, webUrl: "https://memos.example.com/memos/1" };
    });
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.content).toContain("Body text"));

    await act(async () => void (await result.current.save()));
    await act(async () => void (await result.current.save()));

    const saves = browserMock.runtime.sendMessage.mock.calls.map(([message]) => message as { saveRequestId?: string });
    expect(saves[0]?.saveRequestId).toBe(saves[1]?.saveRequestId);
  });

  it("restores the last successful visibility and persists a new one after success", async () => {
    seedStorage({ [LAST_VISIBILITY_KEY]: "PUBLIC" });
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.visibility).toBe("PUBLIC"));

    act(() => result.current.setVisibility("PROTECTED"));
    await act(async () => void (await result.current.save()));
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [LAST_VISIBILITY_KEY]: "PROTECTED" });
  });

  it("maps a runtime transport rejection to a recoverable extension error", async () => {
    browserMock.runtime.sendMessage.mockRejectedValue(new Error("worker stopped"));
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.content).toContain("Body text"));

    let response: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      response = await result.current.save();
    });
    expect(response!).toEqual({ ok: false, errorKind: "extension-error" });
    expect(result.current.content).toContain("Body text");
  });

  it("toggles busy around a save", async () => {
    let resolveSave: (v: unknown) => void = () => {};
    browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
      if ((msg as { type: string }).type === "SAVE_MEMO") return new Promise((r) => (resolveSave = r));
      return undefined;
    });

    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.content).toContain("Body text"));

    let savePromise: Promise<unknown>;
    act(() => {
      savePromise = result.current.save();
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      resolveSave({ ok: true, webUrl: "https://memos.example.com/memos/1" });
      await savePromise;
    });
    expect(result.current.busy).toBe(false);
  });

  it("returns not-configured when there is no connection", async () => {
    const { result } = renderHook(() => useClipper(capture, null, true, null));

    let res: Awaited<ReturnType<typeof result.current.save>>;
    await act(async () => {
      res = await result.current.save();
    });
    expect(res!).toEqual({ ok: false, errorKind: "not-configured" });
  });
});
