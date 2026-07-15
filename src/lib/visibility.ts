import browser from "webextension-polyfill";
import type { Visibility } from "./memos-client";

export const LAST_VISIBILITY_KEY = "lastSuccessfulVisibilityV1";
const VISIBILITIES = new Set<Visibility>(["PRIVATE", "PROTECTED", "PUBLIC"]);

/** Private is the safe default; the stored value changes only after a confirmed successful save. */
export async function readLastVisibility(): Promise<Visibility> {
  const stored = await browser.storage.local.get(LAST_VISIBILITY_KEY);
  const value = stored[LAST_VISIBILITY_KEY];
  return VISIBILITIES.has(value as Visibility) ? (value as Visibility) : "PRIVATE";
}

export async function writeLastVisibility(visibility: Visibility): Promise<void> {
  await browser.storage.local.set({ [LAST_VISIBILITY_KEY]: visibility });
}
