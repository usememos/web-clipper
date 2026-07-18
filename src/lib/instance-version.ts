import browser from "webextension-polyfill";
import { InstanceError, type InstanceErrorKind } from "./errors";
import { getInstanceProfile, type InstanceFetchDeps, type MemosCredentials } from "./memos-client";

/**
 * The instance version is runtime state of the *server*, not user config, so it lives in a
 * per-device local cache (keyed by instance URL) rather than synced account metadata.
 * That keeps a value that can drift (server upgrades) out of the synced identity record, where
 * a stale entry would wrongly gate the clipper across every device.
 */

/** Exported so tests seed the cache through the same contract the code reads. */
export const VERSION_CACHE_KEY = "memosInstanceVersion";
type CachedVersion = { instanceUrl: string; version: string };

/**
 * `storage.local` is async, so a page can't read the cached version on its first paint — which
 * makes even a known-good connection flash a "checking" spinner every popup open. We mirror the
 * cache into `localStorage`, which is synchronous and shared across the extension's page origin
 * (popup + options), purely so the UI can seed a synchronous initial value. `storage.local`
 * stays the source of truth (the service worker has no `localStorage`); this is a read cache.
 */
function pageLocalStorage(): Storage | null {
  // Guard on `window`: page contexts (popup/options) have it; the service worker does not, so
  // background callers safely get null and stick to `storage.local`.
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Access can throw in restricted contexts — treat as unavailable.
    return null;
  }
}

/** Synchronous best-effort read of the mirrored version for this URL (page contexts only). */
export function readCachedVersionSync(instanceUrl: string): string | null {
  const ls = pageLocalStorage();
  if (!ls) return null;
  try {
    const rec = JSON.parse(ls.getItem(VERSION_CACHE_KEY) ?? "null") as CachedVersion | null;
    return rec && rec.instanceUrl === instanceUrl && rec.version ? rec.version : null;
  } catch {
    return null;
  }
}

function mirror(rec: CachedVersion | null): void {
  const ls = pageLocalStorage();
  if (!ls) return;
  try {
    if (rec) ls.setItem(VERSION_CACHE_KEY, JSON.stringify(rec));
    else ls.removeItem(VERSION_CACHE_KEY);
  } catch {
    // A full/blocked localStorage just means no fast path next open — not fatal.
  }
}

/** The cached version for this instance URL, or null when absent or recorded for a different URL. */
export async function readCachedVersion(instanceUrl: string): Promise<string | null> {
  const got = await browser.storage.local.get(VERSION_CACHE_KEY);
  const rec = got[VERSION_CACHE_KEY] as CachedVersion | undefined;
  return rec && rec.instanceUrl === instanceUrl && rec.version ? rec.version : null;
}

/** Records a version already fetched elsewhere (e.g. connect's verification) without re-fetching. */
export async function writeCachedVersion(instanceUrl: string, version: string): Promise<void> {
  const rec: CachedVersion = { instanceUrl, version };
  await browser.storage.local.set({ [VERSION_CACHE_KEY]: rec });
  mirror(rec);
}

/** Forgets the cached version (used on disconnect). */
export async function clearCachedVersion(): Promise<void> {
  await browser.storage.local.remove(VERSION_CACHE_KEY);
  mirror(null);
}

/**
 * The instance version, self-populating: returns the cache when present, otherwise fetches the
 * live `/instance/profile` and caches it. Pass `refresh` to force a re-fetch (connect / options
 * reload). Falls back to the cache on a transient fetch failure, and null when nothing is known.
 */
export async function resolveVersion(
  creds: MemosCredentials,
  opts: { refresh?: boolean } = {},
  deps?: InstanceFetchDeps,
): Promise<string | null> {
  return (await checkVersion(creds, opts, deps)).version;
}

export type VersionCheckResult = {
  version: string | null;
  /** Set when the live check failed. A cached version may still be present. */
  errorKind: InstanceErrorKind | null;
  fromCache: boolean;
};

/**
 * The options page needs to distinguish "old version" from "could not verify". Keep
 * resolveVersion's compact cache-fallback contract for save gates, and expose this richer
 * result for settings UI and recovery behavior.
 */
export async function checkVersion(
  creds: MemosCredentials,
  opts: { refresh?: boolean } = {},
  deps?: InstanceFetchDeps,
): Promise<VersionCheckResult> {
  if (!opts.refresh) {
    const cached = await readCachedVersion(creds.instanceUrl);
    if (cached) return { version: cached, errorKind: null, fromCache: true };
  }
  try {
    const { version } = await getInstanceProfile(creds, deps);
    if (version) await writeCachedVersion(creds.instanceUrl, version);
    return { version: version || null, errorKind: null, fromCache: false };
  } catch (error) {
    const cached = await readCachedVersion(creds.instanceUrl);
    return {
      version: cached,
      errorKind: error instanceof InstanceError ? error.kind : "bad-response",
      fromCache: Boolean(cached),
    };
  }
}
