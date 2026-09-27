import compareSemVer from "semver/functions/compare";
import parseSemVer from "semver/functions/parse";

/** Immutable source snapshots currently published in usememos/dotcom/openapi (newest first). */
export const OPENAPI_SNAPSHOT_VERSIONS = ["0.30.0", "0.29.1", "0.28.0", "0.27.1", "0.26.2"] as const;

type MemosVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

const MIN_SUPPORTED_VERSION = "0.26.0";

/** The minor-series compatibility floor shown to users. */
export const MIN_SUPPORTED_VERSION_LABEL = "0.26.x";

/**
 * Memos releases after 0.31 use calendar versions: `YY.MM[.N][-rc.N]` (e.g. 26.10, 26.10.1,
 * 26.10-rc.1). Mirrors `parse_release_tag` in usememos/memos scripts/release_version.sh.
 */
const CALVER_PATTERN = /^([1-9][0-9])\.(0[1-9]|1[0-2])(?:\.([1-9][0-9]*))?(?:-rc\.([1-9][0-9]*))?$/;

/**
 * Maps a calendar version onto SemVer (26.09-rc.1 → 26.9.0-rc.1) so both schemes share one
 * precedence order. Every calendar release sorts after the legacy 0.x line. Other input passes
 * through unchanged.
 */
function toSemVer(version: string): string {
  const match = CALVER_PATTERN.exec(version);
  if (!match) return version;
  const [, year, month, point = "0", rc] = match;
  return `${year}.${Number(month)}.${point}${rc ? `-rc.${rc}` : ""}`;
}

/** Parses a SemVer (leading `v` permitted) or calendar Memos release string. */
export function parseVersion(version: string): MemosVersion | null {
  const parsed = parseSemVer(toSemVer(version));
  if (!parsed) return null;
  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease.map(String),
  };
}

/** Extracts the minor (the month, for calendar versions) from a complete Memos release string. */
export function parseMinor(version: string): number | null {
  return parseVersion(version)?.minor ?? null;
}

/** Precedence comparison across both schemes. Returns null when either operand is not a complete version. */
export function compareVersions(left: string, right: string): number | null {
  const a = parseSemVer(toSemVer(left));
  const b = parseSemVer(toSemVer(right));
  if (!a || !b) return null;
  return compareSemVer(a, b);
}

/**
 * The 0.26 snapshot documents the complete 0.26.x series. Accept stable Memos releases from
 * 0.26.0 onward within the audited 0.x line, plus release candidates for a newer compatible
 * 0.x release. Calendar releases and their release candidates continue that line; Memos calls
 * out breaking changes in upgrade notes rather than in the version number. Other prereleases
 * and SemVer majors require a fresh contract audit.
 */
export function isSupportedVersion(version: string): boolean {
  if (CALVER_PATTERN.test(version)) return true;
  const parsed = parseVersion(version);
  const precedence = compareVersions(version, MIN_SUPPORTED_VERSION);
  const isRelease = parsed?.prerelease.length === 0;
  const isReleaseCandidate = parsed?.prerelease[0]?.toLowerCase() === "rc";
  return parsed?.major === 0 && (isRelease || isReleaseCandidate) && precedence !== null && precedence >= 0;
}
