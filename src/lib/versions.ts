import compareSemVer from "semver/functions/compare";
import parseSemVer from "semver/functions/parse";

/** Immutable source snapshots currently published in usememos/dotcom/openapi (newest first). */
export const OPENAPI_SNAPSHOT_VERSIONS = ["0.29.1", "0.28.0", "0.27.1", "0.26.2"] as const;

type MemosVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const MIN_SUPPORTED_VERSION = "0.26.0";

/** The minor-series compatibility floor shown to users. */
export const MIN_SUPPORTED_VERSION_LABEL = "0.26.x";

/** Parses a SemVer release string, permitting Memos' conventional leading `v`. */
export function parseVersion(version: string): MemosVersion | null {
  const parsed = parseSemVer(version);
  if (!parsed) return null;
  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease.map(String),
  };
}

/** Extracts the minor from a complete Memos SemVer release string. */
export function parseMinor(version: string): number | null {
  return parseVersion(version)?.minor ?? null;
}

/** SemVer precedence comparison. Returns null when either operand is not a complete version. */
export function compareVersions(left: string, right: string): number | null {
  const a = parseSemVer(left);
  const b = parseSemVer(right);
  if (!a || !b) return null;
  return compareSemVer(a, b);
}

/**
 * The 0.26 snapshot documents the complete 0.26.x series. Accept stable Memos releases from
 * 0.26.0 onward within the audited 0.x line, plus release candidates for a newer compatible
 * 0.x release. Other prereleases and major versions require a fresh contract audit.
 */
export function isSupportedVersion(version: string): boolean {
  const parsed = parseVersion(version);
  const precedence = compareVersions(version, MIN_SUPPORTED_VERSION);
  const isRelease = parsed?.prerelease.length === 0;
  const isReleaseCandidate = parsed?.prerelease[0]?.toLowerCase() === "rc";
  return parsed?.major === 0 && (isRelease || isReleaseCandidate) && precedence !== null && precedence >= 0;
}
