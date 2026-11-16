import { describe, expect, it, vi } from "vitest";
import { saveSelectionClip } from "@/background/memo-save";
import { type DestinationConnection, destinationStorageKey, quickSaveDestinationStorageKey } from "@/lib/memo-destination";
import {
  QUICK_SAVE_SETTINGS_KEY,
  readQuickSaveSettingsState,
  resolveQuickSaveDestination,
  writeQuickSaveCustomDestination,
  writeQuickSaveMode,
} from "@/lib/quick-save-settings";
import { browserMock, seedStorage } from "@/test/browser-mock";
import { jsonResponse, testCreds } from "@/test/fixtures";

const usememosConn: DestinationConnection = {
  source: "usememos",
  connectionId: "user_123",
  instanceUrl: testCreds.instanceUrl,
};

const directConn: DestinationConnection = {
  source: "direct",
  connectionId: "direct_123",
  instanceUrl: testCreds.instanceUrl,
  accountId: "users/steven",
};

describe("quick-save settings", () => {
  it("defaults to custom Private without writing to storage", async () => {
    await expect(readQuickSaveSettingsState(usememosConn, true)).resolves.toEqual({
      mode: "custom",
      customDestination: { visibility: "PRIVATE" },
      popupDestination: { visibility: "PRIVATE" },
    });
    await expect(resolveQuickSaveDestination(usememosConn, true)).resolves.toEqual({ visibility: "PRIVATE" });
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("persists disconnected custom visibility and clears fallback once customized on a connection", async () => {
    await writeQuickSaveCustomDestination(null, { visibility: "PUBLIC" });
    await expect(resolveQuickSaveDestination(usememosConn, true)).resolves.toEqual({ visibility: "PUBLIC" });

    await writeQuickSaveCustomDestination(usememosConn, { visibility: "SPACE", space: "spaces/team" });
    await expect(resolveQuickSaveDestination(usememosConn, true)).resolves.toEqual({
      visibility: "SPACE",
      space: "spaces/team",
    });
    await expect(resolveQuickSaveDestination(directConn, true)).resolves.toEqual({ visibility: "PRIVATE" });
  });

  it("isolates custom destinations per account and adapts to servers without Spaces", async () => {
    const key = quickSaveDestinationStorageKey(directConn)!;
    await writeQuickSaveCustomDestination(directConn, { visibility: "SPACE", space: "spaces/team" });
    expect(browserMock.storage.local.set).toHaveBeenCalledWith({
      [key]: { visibility: "SPACE", space: "spaces/team" },
    });

    await expect(resolveQuickSaveDestination(directConn, true)).resolves.toEqual({
      visibility: "SPACE",
      space: "spaces/team",
    });
    await expect(resolveQuickSaveDestination(directConn, false)).resolves.toEqual({ visibility: "PRIVATE" });
    await expect(resolveQuickSaveDestination(usememosConn, true)).resolves.toEqual({ visibility: "PRIVATE" });

    await writeQuickSaveCustomDestination(directConn, { visibility: "PUBLIC", space: "spaces/team" });
    await expect(resolveQuickSaveDestination(directConn, false)).resolves.toEqual({ visibility: "PUBLIC" });
  });

  it("follows the current connection's last popup destination when follow-popup mode is enabled", async () => {
    const popupKey = destinationStorageKey(usememosConn)!;
    seedStorage({ [popupKey]: { visibility: "SPACE", space: "spaces/news" } });

    await writeQuickSaveMode("follow-popup");
    await expect(readQuickSaveSettingsState(usememosConn, true)).resolves.toEqual({
      mode: "follow-popup",
      customDestination: { visibility: "PRIVATE" },
      popupDestination: { visibility: "SPACE", space: "spaces/news" },
    });
    await expect(resolveQuickSaveDestination(usememosConn, true)).resolves.toEqual({
      visibility: "SPACE",
      space: "spaces/news",
    });
    await expect(resolveQuickSaveDestination(usememosConn, false)).resolves.toEqual({ visibility: "PRIVATE" });
    await expect(resolveQuickSaveDestination(directConn, true)).resolves.toEqual({ visibility: "PRIVATE" });
  });

  it("peeks legacy popup visibility in settings without mutating storage", async () => {
    seedStorage({
      [QUICK_SAVE_SETTINGS_KEY]: { mode: "follow-popup", visibility: "PRIVATE" },
      lastSuccessfulVisibilityV1: "PROTECTED",
    });

    await expect(readQuickSaveSettingsState(usememosConn, true)).resolves.toEqual({
      mode: "follow-popup",
      customDestination: { visibility: "PRIVATE" },
      popupDestination: { visibility: "PROTECTED" },
    });
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    "SPACE",
    "",
    "invalid",
    42,
    { mode: "unknown", visibility: "SECRET" },
    { visibility: "SPACE" },
    { visibility: "SPACE", space: "spaces/../../bad" },
  ])("falls back to custom Private without rewriting invalid values (%j)", async (value) => {
    const customKey = quickSaveDestinationStorageKey(usememosConn)!;
    seedStorage({ [QUICK_SAVE_SETTINGS_KEY]: value, [customKey]: value });

    await expect(resolveQuickSaveDestination(usememosConn, true)).resolves.toEqual({ visibility: "PRIVATE" });
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("propagates storage read errors and preserves stored state when a write fails", async () => {
    const readError = new Error("read failed");
    browserMock.storage.local.get.mockRejectedValueOnce(readError);
    await expect(readQuickSaveSettingsState(usememosConn, true)).rejects.toBe(readError);

    seedStorage({ [QUICK_SAVE_SETTINGS_KEY]: { mode: "custom", visibility: "PROTECTED" } });
    const writeError = new Error("write failed");
    browserMock.storage.local.set.mockRejectedValueOnce(writeError);
    await expect(writeQuickSaveMode("follow-popup")).rejects.toBe(writeError);
    await expect(resolveQuickSaveDestination(null, false)).resolves.toEqual({ visibility: "PROTECTED" });
  });

  it("keeps selection saves Private when destination is omitted and validates Space before uploading images", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/7" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveSelectionClip({ markdown: "hello", images: [] }, "Post", "https://example.com", testCreds, null)).resolves.toEqual({
      ok: true,
      webUrl: "https://memos.example.com/memos/7",
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      content: "> hello\n\n[Post](https://example.com)",
      visibility: "PRIVATE",
    });

    const missingSpaceFetch = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/spaces/deleted")) return jsonResponse({}, 404);
      return jsonResponse({ name: "memos/7" });
    });
    vi.stubGlobal("fetch", missingSpaceFetch);

    await expect(
      saveSelectionClip(
        { markdown: "hello", images: ["https://cdn.example.com/pic.png"] },
        "Post",
        "https://example.com",
        testCreds,
        null,
        { visibility: "SPACE", space: "spaces/deleted" },
      ),
    ).resolves.toEqual({ ok: false, errorKind: "space-unavailable" });
    expect(missingSpaceFetch.mock.calls.every(([url]) => String(url).endsWith("/spaces/deleted"))).toBe(true);

    const spaceFetch = vi.fn(async (url: unknown, _init?: RequestInit) => {
      if (String(url).endsWith("/api/spaces/team")) return jsonResponse({ name: "spaces/team", title: "Team" });
      return jsonResponse({ name: "memos/8" });
    });
    vi.stubGlobal("fetch", spaceFetch);

    await expect(
      saveSelectionClip({ markdown: "hello", images: [] }, "Post", "https://example.com", testCreds, null, {
        visibility: "SPACE",
        space: "spaces/team",
      }),
    ).resolves.toEqual({ ok: true, webUrl: "https://memos.example.com/memos/8" });
    expect(JSON.parse(spaceFetch.mock.calls[1]![1]!.body as string)).toMatchObject({ visibility: "SPACE", space: "spaces/team" });
  });
});
