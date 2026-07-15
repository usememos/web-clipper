import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedVersion,
  readCachedVersion,
  readCachedVersionSync,
  resolveVersion,
  VERSION_CACHE_KEY,
  writeCachedVersion,
} from "@/lib/instance-version";
import { browserMock, seedStorage } from "@/test/browser-mock";
import { testCreds as creds, jsonResponse } from "@/test/fixtures";

beforeEach(() => browserMock.storage.local.clear());

describe("readCachedVersion", () => {
  it("returns the cached version only when the instance URL matches", async () => {
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: creds.instanceUrl, version: "0.29.1" } });
    expect(await readCachedVersion(creds.instanceUrl)).toBe("0.29.1");
    expect(await readCachedVersion("https://other.example.com")).toBeNull();
  });

  it("returns null when nothing is cached", async () => {
    expect(await readCachedVersion(creds.instanceUrl)).toBeNull();
  });
});

describe("resolveVersion", () => {
  it("returns the cache without fetching when present", async () => {
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: creds.instanceUrl, version: "0.28.0" } });
    const fetchImpl = vi.fn();
    expect(await resolveVersion(creds, {}, { fetchImpl })).toBe("0.28.0");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches and caches the live version when the cache is empty", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: "0.29.1" }));
    expect(await resolveVersion(creds, {}, { fetchImpl })).toBe("0.29.1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    // Cached for next time.
    expect(await readCachedVersion(creds.instanceUrl)).toBe("0.29.1");
  });

  it("refetches past a stale cache when refresh is set", async () => {
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: creds.instanceUrl, version: "0.26.2" } });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ version: "0.29.1" }));
    expect(await resolveVersion(creds, { refresh: true }, { fetchImpl })).toBe("0.29.1");
    expect(await readCachedVersion(creds.instanceUrl)).toBe("0.29.1");
  });

  it("falls back to the cache when the live fetch fails", async () => {
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: creds.instanceUrl, version: "0.27.1" } });
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await resolveVersion(creds, { refresh: true }, { fetchImpl })).toBe("0.27.1");
  });
});

describe("clearCachedVersion", () => {
  it("removes the cached version", async () => {
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: creds.instanceUrl, version: "0.29.1" } });
    await clearCachedVersion();
    expect(await readCachedVersion(creds.instanceUrl)).toBeNull();
  });
});

describe("readCachedVersionSync (page-side mirror, removes the checking-spinner flash)", () => {
  it("reads back a version written by writeCachedVersion, matched by URL", async () => {
    await writeCachedVersion(creds.instanceUrl, "0.29.1");
    expect(readCachedVersionSync(creds.instanceUrl)).toBe("0.29.1");
    expect(readCachedVersionSync("https://other.example.com")).toBeNull();
  });

  it("returns null before anything is cached, and after a disconnect clears it", async () => {
    expect(readCachedVersionSync(creds.instanceUrl)).toBeNull();
    await writeCachedVersion(creds.instanceUrl, "0.29.1");
    await clearCachedVersion();
    expect(readCachedVersionSync(creds.instanceUrl)).toBeNull();
  });
});
