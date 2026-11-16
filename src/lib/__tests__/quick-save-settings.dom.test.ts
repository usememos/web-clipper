import { describe, expect, it, vi } from "vitest";
import { saveSelectionClip } from "@/background/memo-save";
import { QUICK_SAVE_VISIBILITY_KEY, readQuickSaveVisibility, writeQuickSaveVisibility } from "@/lib/quick-save-settings";
import { browserMock, seedStorage } from "@/test/browser-mock";
import { jsonResponse, testCreds } from "@/test/fixtures";

describe("quick-save settings", () => {
  it.each(["PRIVATE", "PROTECTED", "PUBLIC"] as const)("persists an explicit %s choice locally", async (visibility) => {
    await writeQuickSaveVisibility(visibility);

    expect(browserMock.storage.local.set).toHaveBeenCalledWith({ [QUICK_SAVE_VISIBILITY_KEY]: visibility });
    await expect(readQuickSaveVisibility()).resolves.toBe(visibility);
  });

  it.each([
    undefined,
    null,
    "SPACE",
    "public",
    "",
    "invalid",
    42,
    true,
    [],
    { visibility: "PUBLIC" },
  ])("falls back to Private without rewriting an absent or invalid value (%j)", async (value) => {
    seedStorage({ [QUICK_SAVE_VISIBILITY_KEY]: value });

    await expect(readQuickSaveVisibility()).resolves.toBe("PRIVATE");
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("propagates a storage read error", async () => {
    const error = new Error("storage unavailable");
    browserMock.storage.local.get.mockRejectedValueOnce(error);

    await expect(readQuickSaveVisibility()).rejects.toBe(error);
  });

  it("keeps the stored choice when a write fails", async () => {
    seedStorage({ [QUICK_SAVE_VISIBILITY_KEY]: "PROTECTED" });
    const error = new Error("storage unavailable");
    browserMock.storage.local.set.mockRejectedValueOnce(error);

    await expect(writeQuickSaveVisibility("PUBLIC")).rejects.toBe(error);
    await expect(readQuickSaveVisibility()).resolves.toBe("PROTECTED");
  });

  it("keeps selection saves Private when the optional visibility is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ name: "memos/7" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveSelectionClip({ markdown: "hello", images: [] }, "Post", "https://example.com", testCreds, null)).resolves.toEqual({
      ok: true,
      webUrl: "https://memos.example.com/memos/7",
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).visibility).toBe("PRIVATE");
  });
});
