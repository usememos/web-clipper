import browser from "webextension-polyfill";

export const CLIP_TEMPLATE_KEY = "clipTemplateV1";

/** Returns the device-local template, or null when the built-in default is selected. */
export async function readClipTemplate(): Promise<string | null> {
  const value = (await browser.storage.local.get(CLIP_TEMPLATE_KEY))[CLIP_TEMPLATE_KEY];
  return typeof value === "string" ? value : null;
}

/** Stores only custom templates; null removes the override and restores the default. */
export async function writeClipTemplate(template: string | null): Promise<void> {
  // Whitespace-only templates render as the built-in default during clipping. Normalize them
  // here too so storage, the editor, and the actual clip result cannot disagree.
  if (template === null || !template.trim()) {
    await browser.storage.local.remove(CLIP_TEMPLATE_KEY);
    return;
  }
  await browser.storage.local.set({ [CLIP_TEMPLATE_KEY]: template });
}
