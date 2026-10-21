import { beforeEach, describe, expect, it } from "vitest";
import { type DestinationConnection, destinationStorageKey } from "@/lib/memo-destination";
import { browserMock, seedStorage } from "@/test/browser-mock";
import { act, renderHook, waitFor } from "@/test/render";
import type { PageCapture } from "../page-capture";
import { useClipper } from "../use-clipper";

const capture: PageCapture = {
  title: "Hello World",
  url: "https://example.com/post",
  description: "A page about greetings",
  selectionMarkdown: "# Hello\n\nBody text",
  articleMarkdown: "",
  images: [],
};
const expectation = { source: "usememos" as const, connectionId: "user_123", instanceUrl: "https://memos.example.com" };
const destinationKey = destinationStorageKey(expectation) as string;
const useReadyClipper = (cap: PageCapture | null = capture) => useClipper(cap, null, true, expectation);

function wireRuntime(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    SAVE_MEMO: { ok: true, webUrl: "https://memos.example.com/memos/1" },
    LIST_SPACES: { ok: true, spaces: [{ name: "spaces/team", title: "Team" }] },
    ...overrides,
  };
  browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => responses[(msg as { type: string }).type]);
}

describe("useClipper", () => {
  beforeEach(() => {
    wireRuntime();
  });

  it("preserves a Space-list authentication failure for the recovery action", async () => {
    wireRuntime({ LIST_SPACES: { ok: false, errorKind: "unauthorized" } });
    const { result } = renderHook(() => useClipper(capture, null, true, expectation, true));
    await waitFor(() => expect(result.current.spaces).toMatchObject({ status: "error", errorKind: "unauthorized", items: [] }));
    await act(async () => expect(await result.current.save()).toEqual({ ok: false, errorKind: "unauthorized" }));
    expect(browserMock.runtime.sendMessage.mock.calls.some(([message]) => (message as { type: string }).type === "SAVE_MEMO")).toBe(false);
  });

  it("prefills the editor with the rendered template: quoted selection, description, linked title", async () => {
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.content).toContain("> # Hello"));
    expect(result.current.content).toContain("> Body text");
    expect(result.current.content).toContain("A page about greetings");
    expect(result.current.content).toContain("[Hello World](https://example.com/post)");
  });

  it("leaves a selection unquoted when the template uses a plain content placeholder", async () => {
    const raw = { ...capture, selectionMarkdown: "## Heading\n\n- Item\n\n> Original quote\n\n```\ncode\n```" };
    const { result } = renderHook(() => useClipper(raw, "{{content}}", true, expectation));
    await waitFor(() => expect(result.current.content).toBe(raw.selectionMarkdown));
    await act(async () => void (await result.current.save()));
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SAVE_MEMO", content: raw.selectionMarkdown }),
    );
  });

  it("leaves an extracted article unquoted when the template uses a plain content placeholder", async () => {
    const article = { ...capture, selectionMarkdown: "", articleMarkdown: "## Article\n\nBody text" };
    const { result } = renderHook(() => useClipper(article, "{{content}}", true, expectation));
    await waitFor(() => expect(result.current.content).toBe(article.articleMarkdown));
  });

  it("prefills a link note when the capture has no selection and no description", async () => {
    const linkOnly: PageCapture = {
      title: "Hello World",
      url: "https://example.com/post",
      selectionMarkdown: "",
      articleMarkdown: "",
      images: [],
    };
    const { result } = renderHook(() => useReadyClipper(linkOnly));
    await waitFor(() => expect(result.current.content).toBe("[Hello World](https://example.com/post)"));
  });

  it("prefills the editor with the extracted article when nothing was selected", async () => {
    const article: PageCapture = {
      ...capture,
      selectionMarkdown: "",
      articleMarkdown: "## Extraction\n\nThe readability pass is the heart of it.",
    };
    const { result } = renderHook(() => useReadyClipper(article));

    await waitFor(() => expect(result.current.content).toContain("The readability pass is the heart of it."));
    expect(result.current.content).toContain("## Extraction");
    expect(result.current.content).toContain("A page about greetings");
    expect(result.current.content).toContain("[Hello World](https://example.com/post)");
  });

  it("prefers an explicit selection over the extracted article", async () => {
    const both: PageCapture = { ...capture, articleMarkdown: "The whole article body, which the selection overrides." };
    const { result } = renderHook(() => useReadyClipper(both));

    await waitFor(() => expect(result.current.content).toContain("> # Hello"));
    expect(result.current.content).not.toContain("which the selection overrides");
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

    const saves = browserMock.runtime.sendMessage.mock.calls
      .map(([message]) => message as { type?: string; saveRequestId?: string })
      .filter((message) => message.type === "SAVE_MEMO");
    expect(saves[0]?.saveRequestId).toBe(saves[1]?.saveRequestId);
  });

  it("restores the last successful visibility and persists a new one after success", async () => {
    seedStorage({ [destinationKey]: { visibility: "PUBLIC" } });
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.visibility).toBe("PUBLIC"));

    act(() => result.current.setVisibility("PROTECTED"));
    await act(async () => void (await result.current.save()));
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [destinationKey]: { visibility: "PROTECTED" } });
  });

  it("migrates the legacy visibility once without sharing it with another account", async () => {
    seedStorage({ lastSuccessfulVisibilityV1: "PUBLIC" });
    const { result, rerender } = renderHook(({ connection }) => useClipper(capture, null, true, connection), {
      initialProps: { connection: expectation },
    });
    await waitFor(() => expect(result.current.visibility).toBe("PUBLIC"));
    expect(await browserMock.storage.local.get("lastSuccessfulVisibilityV1")).toEqual({});
    rerender({ connection: { ...expectation, connectionId: "other-user" } });
    await waitFor(() => expect(result.current.visibility).toBe("PRIVATE"));
  });

  it("keeps the user's choice across a gate transition instead of reloading the stored one", async () => {
    seedStorage({ [destinationKey]: { visibility: "PROTECTED" } });
    const { result, rerender } = renderHook(
      ({ connection }: { connection: typeof expectation | null }) => useClipper(capture, null, true, connection, true),
      { initialProps: { connection: expectation as typeof expectation | null } },
    );
    await waitFor(() => expect(result.current.visibility).toBe("PROTECTED"));
    act(() => result.current.setVisibility("PUBLIC"));
    rerender({ connection: null });
    expect(result.current.visibility).toBe("PRIVATE");
    rerender({ connection: expectation });
    expect(result.current.visibility).toBe("PUBLIC");
    await act(async () => {});
    expect(result.current.visibility).toBe("PUBLIC");
  });

  it("waits for a direct connection's account before reading or migrating preferences", async () => {
    seedStorage({ lastSuccessfulVisibilityV1: "PUBLIC" });
    const direct: DestinationConnection = { source: "direct", connectionId: "conn-uuid", instanceUrl: "https://memos.example.com" };
    const { result, rerender } = renderHook(
      ({ connection }: { connection: DestinationConnection }) => useClipper(capture, null, true, connection, true),
      { initialProps: { connection: direct } },
    );
    await waitFor(() => expect(result.current.content).toContain("Body text"));
    expect(result.current.visibility).toBe("PRIVATE");
    expect(await browserMock.storage.local.get("lastSuccessfulVisibilityV1")).toEqual({ lastSuccessfulVisibilityV1: "PUBLIC" });
    expect(browserMock.runtime.sendMessage.mock.calls.some(([msg]) => (msg as { type: string }).type === "LIST_SPACES")).toBe(false);
    rerender({ connection: { ...direct, accountId: "users/1" } });
    await waitFor(() => expect(result.current.visibility).toBe("PUBLIC"));
    expect(await browserMock.storage.local.get("lastSuccessfulVisibilityV1")).toEqual({});
    await waitFor(() => expect(result.current.spaces.status).toBe("ready"));
  });

  it("does not replace the user's selection when stored preferences arrive late", async () => {
    let resolveStored: (value: Record<string, unknown>) => void = () => {};
    browserMock.storage.local.get.mockImplementation(
      async () =>
        new Promise((resolve) => {
          resolveStored = resolve;
        }),
    );
    const { result } = renderHook(() => useClipper(capture, null, true, expectation, true));
    await waitFor(() => expect(result.current.spaces.status).toBe("ready"));
    act(() => result.current.setSpace("spaces/team"));
    await act(async () => resolveStored({ [destinationKey]: { visibility: "PUBLIC", space: "spaces/other" } }));
    expect(result.current.visibility).toBe("PRIVATE");
    expect(result.current.space).toBe("spaces/team");
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

  it("restores and saves a Space destination, then resets Space audience when removing it", async () => {
    const key = destinationKey;
    seedStorage({ [key]: { visibility: "SPACE", space: "spaces/team" } });
    const { result } = renderHook(() => useClipper(capture, null, true, expectation, true));
    await waitFor(() => expect(result.current.space).toBe("spaces/team"));
    expect(result.current.visibility).toBe("SPACE");
    await act(async () => void (await result.current.save()));
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SAVE_MEMO", space: "spaces/team", visibility: "SPACE" }),
    );
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [key]: { visibility: "SPACE", space: "spaces/team" } });
    act(() => result.current.setSpace(undefined));
    expect(result.current.space).toBeUndefined();
    expect(result.current.visibility).toBe("PRIVATE");
  });

  it("keeps visibility when assigning a Space and remembers nothing after a failed save", async () => {
    wireRuntime({ SAVE_MEMO: { ok: false, errorKind: "timeout" } });
    const { result } = renderHook(() => useClipper(capture, null, true, expectation, true));
    await waitFor(() => expect(result.current.spaces.status).toBe("ready"));
    act(() => result.current.setSpace("spaces/team"));
    expect(result.current.visibility).toBe("PRIVATE");
    await act(async () => void (await result.current.save()));
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("blocks a remembered unavailable Space and offers removal without changing it silently", async () => {
    seedStorage({ [destinationKey]: { visibility: "SPACE", space: "spaces/deleted" } });
    const { result } = renderHook(() => useClipper(capture, null, true, expectation, true));
    await waitFor(() => expect(result.current.spaceUnavailable).toBe(true));
    expect(result.current.space).toBe("spaces/deleted");
    await act(async () => expect(await result.current.save()).toEqual({ ok: false, errorKind: "space-unavailable" }));
    expect(browserMock.runtime.sendMessage.mock.calls.some(([msg]) => (msg as { type: string }).type === "SAVE_MEMO")).toBe(false);
  });

  it("isolates saved choices by account and discards an old account's late Space response", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    browserMock.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
      if ((msg as { type: string }).type !== "LIST_SPACES") return null;
      return (msg as { expectedConnectionId: string }).expectedConnectionId === expectation.connectionId
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : { ok: true, spaces: [{ name: "spaces/other", title: "Other" }] };
    });
    seedStorage({ [destinationKey]: { visibility: "SPACE", space: "spaces/team" } });
    const { result, rerender } = renderHook(({ connection }) => useClipper(capture, null, true, connection, true), {
      initialProps: { connection: expectation },
    });
    await waitFor(() => expect(result.current.space).toBe("spaces/team"));
    rerender({ connection: { ...expectation, connectionId: "other-user" } });
    await waitFor(() => expect(result.current.spaces.items[0]?.name).toBe("spaces/other"));
    await act(async () => resolveOld({ ok: true, spaces: [{ name: "spaces/team", title: "Team" }] }));
    expect(result.current.space).toBeUndefined();
    expect(result.current.visibility).toBe("PRIVATE");
    expect(result.current.spaces.items[0]?.name).toBe("spaces/other");
  });

  it("hides stored Space placement and resets its audience on older servers without fetching Spaces", async () => {
    seedStorage({ [destinationKey]: { visibility: "SPACE", space: "spaces/team" } });
    const { result } = renderHook(() => useReadyClipper());
    await waitFor(() => expect(result.current.content).toContain("Body text"));
    expect(result.current.space).toBeUndefined();
    expect(result.current.visibility).toBe("PRIVATE");
    expect(browserMock.runtime.sendMessage.mock.calls.some(([msg]) => (msg as { type: string }).type === "LIST_SPACES")).toBe(false);
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
