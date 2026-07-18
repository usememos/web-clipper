import { isValidInstanceUrl, type MemosCredentials, normalizeInstanceUrl } from "./memos-client";
import { isSupportedVersion } from "./versions";

/** The raw Clerk metadata `memos` object, or null — the one place that owns this shape. */
export function readMemosObject(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const memos = (metadata as Record<string, unknown>).memos;
  return typeof memos === "object" && memos !== null ? (memos as Record<string, unknown>) : null;
}

/** Reads the Memos connection from a Clerk metadata object, or null when unset/incomplete. */
export function readCredentials(metadata: unknown): MemosCredentials | null {
  const memos = readMemosObject(metadata);
  if (!memos) return null;
  const { instanceUrl, accessToken } = memos;
  if (typeof instanceUrl === "string" && isValidInstanceUrl(instanceUrl) && typeof accessToken === "string" && accessToken.trim()) {
    return { instanceUrl: normalizeInstanceUrl(instanceUrl), accessToken };
  }
  return null;
}

export type ConnectionStatus = "disconnected" | "checking" | "unsupported" | "ready";

/**
 * The gate the connection is at: no creds → disconnected, creds + supported version → ready.
 * The version is a local, instance-derived cache (see instance-version.ts), passed in rather than
 * read from synced metadata — so a null version (never verified on this device) reads as unsupported
 * until it's resolved.
 */
export function connectionStatus(credentials: MemosCredentials | null, version: string | null | undefined): ConnectionStatus {
  if (!credentials) return "disconnected";
  if (version === undefined) return "checking";
  return version && isSupportedVersion(version) ? "ready" : "unsupported";
}
