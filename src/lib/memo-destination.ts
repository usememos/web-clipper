import browser from "webextension-polyfill";
import type { ConnectionSource } from "./connection-config";
import { isSpaceName, isVisibility, type Visibility } from "./memos-client";

export type MemoDestination = { visibility: Visibility; space?: string };
export type DestinationConnection = { source: ConnectionSource; connectionId: string; instanceUrl: string; accountId?: string };

/**
 * Preferences are keyed by the stable account, not the per-connect id. A direct connection's
 * account arrives with the live popup state; a snapshot cached by an older release has none, so
 * the key is unknown (null) until then rather than a throwaway one that would strand the choice.
 */
export function destinationStorageKey(connection: DestinationConnection, prefix = "memoDestinationV1"): string | null {
  const accountId = connection.source === "direct" ? connection.accountId : connection.connectionId;
  if (!accountId) return null;
  return `${prefix}:${JSON.stringify([connection.source, connection.instanceUrl, accountId])}`;
}

export function quickSaveDestinationStorageKey(connection: DestinationConnection): string | null {
  return destinationStorageKey(connection, "quickSaveDestinationV1");
}

export function normalizeMemoDestination(value: unknown): MemoDestination {
  if (!value || typeof value !== "object") return { visibility: "PRIVATE" };
  const candidate = value as Partial<MemoDestination>;
  if (!isVisibility(candidate.visibility) || (candidate.space !== undefined && !isSpaceName(candidate.space))) {
    return { visibility: "PRIVATE" };
  }
  if (candidate.visibility === "SPACE" && !candidate.space) return { visibility: "PRIVATE" };
  return { visibility: candidate.visibility, ...(candidate.space ? { space: candidate.space } : {}) };
}

export function adaptDestinationForVersion(destination: MemoDestination, supportsSpaces: boolean): MemoDestination {
  return supportsSpaces ? destination : { visibility: destination.visibility === "SPACE" ? "PRIVATE" : destination.visibility };
}

export function applyVisibilityChange(current: MemoDestination, visibility: Visibility): MemoDestination {
  if (visibility === "SPACE" && !current.space) return current;
  return { ...current, visibility };
}

export function applySpaceChange(current: MemoDestination, space?: string): MemoDestination {
  return {
    visibility: !space && current.visibility === "SPACE" ? "PRIVATE" : current.visibility,
    ...(space ? { space } : {}),
  };
}

export async function peekMemoDestination(key: string): Promise<MemoDestination> {
  const legacyKey = "lastSuccessfulVisibilityV1";
  const stored = await browser.storage.local.get([key, legacyKey]);
  if (stored[key] === undefined && isVisibility(stored[legacyKey]) && stored[legacyKey] !== "SPACE") {
    return { visibility: stored[legacyKey] };
  }
  return normalizeMemoDestination(stored[key]);
}

export async function readMemoDestination(key: string): Promise<MemoDestination> {
  const legacyKey = "lastSuccessfulVisibilityV1";
  const stored = await browser.storage.local.get([key, legacyKey]);
  // Transfer the old successful choice once, so it cannot leak into later connections.
  if (stored[key] === undefined && isVisibility(stored[legacyKey]) && stored[legacyKey] !== "SPACE") {
    const destination = { visibility: stored[legacyKey] };
    await browser.storage.local.set({ [key]: destination });
    await browser.storage.local.remove(legacyKey);
    return destination;
  }
  return normalizeMemoDestination(stored[key]);
}

/** Persist only after the server confirms the save. */
export async function writeMemoDestination(key: string, destination: MemoDestination): Promise<void> {
  await browser.storage.local.set({ [key]: destination });
}
