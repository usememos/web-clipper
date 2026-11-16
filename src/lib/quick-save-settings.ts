import browser from "webextension-polyfill";
import {
  adaptDestinationForVersion,
  type DestinationConnection,
  destinationStorageKey,
  type MemoDestination,
  normalizeMemoDestination,
  peekMemoDestination,
  quickSaveDestinationStorageKey,
  readMemoDestination,
} from "./memo-destination";
import type { Visibility } from "./memos-client";

export const QUICK_SAVE_SETTINGS_KEY = "quickSaveSettingsV1";
export type QuickSaveMode = "follow-popup" | "custom";
export type QuickSaveVisibility = Exclude<Visibility, "SPACE">;

type StoredQuickSaveSettings = {
  mode: QuickSaveMode;
  visibility: QuickSaveVisibility;
};

export type QuickSaveSettingsState = {
  mode: QuickSaveMode;
  customDestination: MemoDestination;
  popupDestination: MemoDestination;
};

let storageMutation = Promise.resolve();

function queueStorageMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageMutation.then(operation, operation);
  storageMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function parseStoredQuickSaveSettings(raw: unknown): StoredQuickSaveSettings {
  if (!raw || typeof raw !== "object") return { mode: "custom", visibility: "PRIVATE" };
  const record = raw as Record<string, unknown>;
  const mode: QuickSaveMode = record.mode === "follow-popup" ? "follow-popup" : "custom";
  const visibility: QuickSaveVisibility =
    record.visibility === "PROTECTED" || record.visibility === "PUBLIC" ? record.visibility : "PRIVATE";
  return { mode, visibility };
}

export async function readQuickSaveSettingsState(
  connection: DestinationConnection | null,
  supportsSpaces: boolean,
): Promise<QuickSaveSettingsState> {
  const customKey = connection ? quickSaveDestinationStorageKey(connection) : null;
  const popupKey = connection ? destinationStorageKey(connection) : null;
  const keys = [QUICK_SAVE_SETTINGS_KEY, ...(customKey ? [customKey] : [])];
  const [stored, rawPopup] = await Promise.all([
    browser.storage.local.get(keys),
    popupKey ? peekMemoDestination(popupKey) : Promise.resolve({ visibility: "PRIVATE" as const }),
  ]);
  const settings = parseStoredQuickSaveSettings(stored[QUICK_SAVE_SETTINGS_KEY]);
  const rawCustom =
    customKey && stored[customKey] !== undefined ? normalizeMemoDestination(stored[customKey]) : { visibility: settings.visibility };
  return {
    mode: settings.mode,
    customDestination: adaptDestinationForVersion(rawCustom, supportsSpaces),
    popupDestination: adaptDestinationForVersion(rawPopup, supportsSpaces),
  };
}

export function writeQuickSaveMode(mode: QuickSaveMode): Promise<void> {
  return queueStorageMutation(async () => {
    const stored = await browser.storage.local.get(QUICK_SAVE_SETTINGS_KEY);
    const current = parseStoredQuickSaveSettings(stored[QUICK_SAVE_SETTINGS_KEY]);
    await browser.storage.local.set({ [QUICK_SAVE_SETTINGS_KEY]: { mode, visibility: current.visibility } });
  });
}

export function writeQuickSaveCustomDestination(connection: DestinationConnection | null, destination: MemoDestination): Promise<void> {
  return queueStorageMutation(async () => {
    const normalized = normalizeMemoDestination(destination);
    const customKey = connection ? quickSaveDestinationStorageKey(connection) : null;
    const stored = await browser.storage.local.get(QUICK_SAVE_SETTINGS_KEY);
    const current = parseStoredQuickSaveSettings(stored[QUICK_SAVE_SETTINGS_KEY]);
    if (customKey) {
      const updates: Record<string, unknown> = { [customKey]: normalized };
      if (current.visibility !== "PRIVATE") {
        updates[QUICK_SAVE_SETTINGS_KEY] = { mode: current.mode, visibility: "PRIVATE" };
      }
      await browser.storage.local.set(updates);
      return;
    }
    const visibility: QuickSaveVisibility =
      normalized.visibility === "PROTECTED" || normalized.visibility === "PUBLIC" ? normalized.visibility : "PRIVATE";
    await browser.storage.local.set({ [QUICK_SAVE_SETTINGS_KEY]: { mode: current.mode, visibility } });
  });
}

export async function resolveQuickSaveDestination(
  connection: DestinationConnection | null,
  supportsSpaces: boolean,
): Promise<MemoDestination> {
  const customKey = connection ? quickSaveDestinationStorageKey(connection) : null;
  const keys = [QUICK_SAVE_SETTINGS_KEY, ...(customKey ? [customKey] : [])];
  const stored = await browser.storage.local.get(keys);
  const settings = parseStoredQuickSaveSettings(stored[QUICK_SAVE_SETTINGS_KEY]);
  if (settings.mode === "follow-popup") {
    const popupKey = connection ? destinationStorageKey(connection) : null;
    const destination = popupKey ? await readMemoDestination(popupKey) : { visibility: "PRIVATE" as const };
    return adaptDestinationForVersion(destination, supportsSpaces);
  }
  const destination =
    customKey && stored[customKey] !== undefined ? normalizeMemoDestination(stored[customKey]) : { visibility: settings.visibility };
  return adaptDestinationForVersion(destination, supportsSpaces);
}
