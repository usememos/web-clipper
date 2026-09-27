import { describe, expect, it } from "vitest";
import { compareVersions, isSupportedVersion, OPENAPI_SNAPSHOT_VERSIONS, parseMinor, parseVersion } from "@/lib/versions";

describe("parseVersion", () => {
  it("parses release prefixes and suffixes without accepting partial versions", () => {
    expect(parseVersion("v0.26.2")).toEqual({ major: 0, minor: 26, patch: 2, prerelease: [] });
    expect(parseVersion("0.30.0-dev.1+build.7")).toEqual({ major: 0, minor: 30, patch: 0, prerelease: ["dev", "1"] });
    expect(parseVersion("0.29")).toBeNull();
    expect(parseVersion("0.026.0")).toBeNull();
    expect(parseVersion("0.26.0-rc.01")).toBeNull();
    expect(parseVersion("canary")).toBeNull();
  });

  it("parses calendar versions onto the same shape", () => {
    expect(parseVersion("26.10")).toEqual({ major: 26, minor: 10, patch: 0, prerelease: [] });
    expect(parseVersion("26.09.1")).toEqual({ major: 26, minor: 9, patch: 1, prerelease: [] });
    expect(parseVersion("26.10-rc.1")).toEqual({ major: 26, minor: 10, patch: 0, prerelease: ["rc", "1"] });
    expect(parseVersion("26.9")).toBeNull();
    expect(parseVersion("26.13")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("uses SemVer precedence, including prereleases and build metadata", () => {
    expect(compareVersions("0.26.0", "0.26.0-rc.1")).toBe(1);
    expect(compareVersions("0.26.1", "0.26.0")).toBe(1);
    expect(compareVersions("0.26.0+build.2", "0.26.0+build.1")).toBe(0);
    expect(compareVersions("bad", "0.26.0")).toBeNull();
  });

  it("orders calendar releases after the 0.x line and by date, point release, and RC", () => {
    expect(compareVersions("26.09", "0.31.0")).toBe(1);
    expect(compareVersions("26.10", "26.09.3")).toBe(1);
    expect(compareVersions("26.10.1", "26.10")).toBe(1);
    expect(compareVersions("26.10", "26.10-rc.2")).toBe(1);
    expect(compareVersions("26.10-rc.2", "26.10-rc.1")).toBe(1);
    expect(compareVersions("27.01", "26.12")).toBe(1);
  });
});

describe("parseMinor", () => {
  it("extracts the minor version", () => {
    expect(parseMinor("0.29.1")).toBe(29);
    expect(parseMinor("v0.26.2")).toBe(26);
    expect(parseMinor("26.09")).toBe(9);
    expect(parseMinor("canary")).toBeNull();
  });
});

describe("isSupportedVersion", () => {
  it("accepts all of 0.26.x, every documented snapshot, and newer 0.x releases", () => {
    expect(isSupportedVersion("0.26.0")).toBe(true);
    expect(isSupportedVersion("0.26.1")).toBe(true);
    for (const version of OPENAPI_SNAPSHOT_VERSIONS) expect(isSupportedVersion(version)).toBe(true);
    expect(isSupportedVersion("0.30.0")).toBe(true);
    expect(isSupportedVersion("0.30.0-rc.1")).toBe(true);
    expect(isSupportedVersion("v0.30.0-RC.2+build.7")).toBe(true);
    expect(isSupportedVersion("0.31.0-rc.1")).toBe(true);
    expect(isSupportedVersion("0.31.0")).toBe(true);
    expect(isSupportedVersion("0.32.5")).toBe(true);
  });

  it("accepts calendar releases, point releases, and release candidates", () => {
    expect(isSupportedVersion("26.10")).toBe(true);
    expect(isSupportedVersion("26.10.1")).toBe(true);
    expect(isSupportedVersion("26.10-rc.1")).toBe(true);
    expect(isSupportedVersion("26.10.2-rc.1")).toBe(true);
    expect(isSupportedVersion("27.04")).toBe(true);
  });

  it("rejects releases before 0.26.x, non-RC prereleases, and unaudited majors", () => {
    expect(isSupportedVersion("0.25.99")).toBe(false);
    expect(isSupportedVersion("0.26.0-rc.1")).toBe(false);
    expect(isSupportedVersion("0.30.0-dev.1")).toBe(false);
    expect(isSupportedVersion("0.30.0-beta.1")).toBe(false);
    expect(isSupportedVersion("1.0.0")).toBe(false);
    expect(isSupportedVersion("garbage")).toBe(false);
  });

  it("rejects strings outside the calendar release format", () => {
    expect(isSupportedVersion("26.9")).toBe(false);
    expect(isSupportedVersion("26.10.0")).toBe(false);
    expect(isSupportedVersion("v26.10")).toBe(false);
    expect(isSupportedVersion("26.10-beta.1")).toBe(false);
    expect(isSupportedVersion("dev")).toBe(false);
    expect(isSupportedVersion("manual-abc1234")).toBe(false);
  });
});

describe("OPENAPI_SNAPSHOT_VERSIONS", () => {
  it("keeps immutable documentation snapshots separate from the supported series floor", () => {
    expect(OPENAPI_SNAPSHOT_VERSIONS).toEqual(["0.30.0", "0.29.1", "0.28.0", "0.27.1", "0.26.2"]);
  });
});
