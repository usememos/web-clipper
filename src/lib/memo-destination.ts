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
export function destinationStorageKey(connection: DestinationConnection): string | null {
  const accountId = connection.source === "direct" ? connection.accountId : connection.connectionId;
  if (!accountId) return null;
  return `memoDestinationV1:${JSON.stringify([connection.source, connection.instanceUrl, accountId])}`;
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
  const value = stored[key] as Partial<MemoDestination> | undefined;
  if (!value || !isVisibility(value.visibility) || (value.space !== undefined && !isSpaceName(value.space)))
    return { visibility: "PRIVATE" };
  if (value.visibility === "SPACE" && !value.space) return { visibility: "PRIVATE" };
  return { visibility: value.visibility, ...(value.space ? { space: value.space } : {}) };
}

/** Persist only after the server confirms the save. */
export async function writeMemoDestination(key: string, destination: MemoDestination): Promise<void> {
  await browser.storage.local.set({ [key]: destination });
}
