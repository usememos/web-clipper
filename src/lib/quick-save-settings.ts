import browser from "webextension-polyfill";
import type { Visibility } from "./memos-client";

export const QUICK_SAVE_VISIBILITY_KEY = "quickSaveVisibilityV1";
export type QuickSaveVisibility = Exclude<Visibility, "SPACE">;

/** https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/get */
export async function readQuickSaveVisibility(): Promise<QuickSaveVisibility> {
  const value = (await browser.storage.local.get(QUICK_SAVE_VISIBILITY_KEY))[QUICK_SAVE_VISIBILITY_KEY];
  return value === "PROTECTED" || value === "PUBLIC" ? value : "PRIVATE";
}

/** https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/set */
export async function writeQuickSaveVisibility(visibility: QuickSaveVisibility): Promise<void> {
  await browser.storage.local.set({ [QUICK_SAVE_VISIBILITY_KEY]: visibility });
}
