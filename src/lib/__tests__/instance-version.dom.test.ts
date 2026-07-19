import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkVersion, clearCachedVersion, readCachedVersion, resolveVersion, VERSION_CACHE_KEY } from "@/lib/instance-version";
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

  it("reports a live-check failure separately from its cached fallback", async () => {
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: creds.instanceUrl, version: "0.29.1" } });
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    await expect(checkVersion(creds, { refresh: true }, { fetchImpl })).resolves.toEqual({
      version: "0.29.1",
      errorKind: "timeout",
      fromCache: true,
    });
  });
});

describe("clearCachedVersion", () => {
  it("removes the cached version", async () => {
    seedStorage({ [VERSION_CACHE_KEY]: { instanceUrl: creds.instanceUrl, version: "0.29.1" } });
    await clearCachedVersion();
    expect(await readCachedVersion(creds.instanceUrl)).toBeNull();
  });
});
