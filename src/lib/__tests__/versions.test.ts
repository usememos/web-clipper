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
});

describe("compareVersions", () => {
  it("uses SemVer precedence, including prereleases and build metadata", () => {
    expect(compareVersions("0.26.0", "0.26.0-rc.1")).toBe(1);
    expect(compareVersions("0.26.1", "0.26.0")).toBe(1);
    expect(compareVersions("0.26.0+build.2", "0.26.0+build.1")).toBe(0);
    expect(compareVersions("bad", "0.26.0")).toBeNull();
  });
});

describe("parseMinor", () => {
  it("extracts the minor version", () => {
    expect(parseMinor("0.29.1")).toBe(29);
    expect(parseMinor("v0.26.2")).toBe(26);
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
  });

  it("rejects releases before 0.26.x, non-RC prereleases, and unaudited majors", () => {
    expect(isSupportedVersion("0.25.99")).toBe(false);
    expect(isSupportedVersion("0.26.0-rc.1")).toBe(false);
    expect(isSupportedVersion("0.30.0-dev.1")).toBe(false);
    expect(isSupportedVersion("0.30.0-beta.1")).toBe(false);
    expect(isSupportedVersion("1.0.0")).toBe(false);
    expect(isSupportedVersion("garbage")).toBe(false);
  });
});

describe("OPENAPI_SNAPSHOT_VERSIONS", () => {
  it("keeps immutable documentation snapshots separate from the supported series floor", () => {
    expect(OPENAPI_SNAPSHOT_VERSIONS).toEqual(["0.29.1", "0.28.0", "0.27.1", "0.26.2"]);
  });
});
