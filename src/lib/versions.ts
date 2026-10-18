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
 * Memos releases after 0.31 use calendar versions: `YY.MM.N[-rc.K]`, including N = 0.
 * Keep accepting earlier `YY.MM[-rc.K]` versions too.
 */
const CALVER_PATTERN = /^([1-9][0-9])\.(0[1-9]|1[0-2])(?:\.(0|[1-9][0-9]*))?(?:-rc\.([1-9][0-9]*))?$/;

/** Development builds use the UTC commit date and short revision: `YY.MM.D-dev.<sha7>`. */
const CALVER_DEV_PATTERN = /^([1-9][0-9])\.(0[1-9]|1[0-2])\.(0|[1-9][0-9]*)-dev\.([0-9a-f]{7})$/;

/**
 * Maps a calendar version onto SemVer (26.09-rc.1 → 26.9.0-rc.1) so both schemes share one
 * precedence order. Every calendar release sorts after the legacy 0.x line. Other input passes
 * through unchanged.
 */
function toSemVer(version: string): string {
  const development = CALVER_DEV_PATTERN.exec(version);
  if (development) {
    const [, year, month, day, revision] = development;
    // Keep numeric revisions with leading zeros valid as SemVer identifiers.
    return `${year}.${Number(month)}.${day}-dev.g${revision}`;
  }
  const match = CALVER_PATTERN.exec(version);
  if (!match) return version;
  const [, year, month, point = "0", rc] = match;
  return `${year}.${Number(month)}.${point}${rc ? `-rc.${rc}` : ""}`;
}

/** Parses a SemVer (leading `v` permitted) or calendar Memos release/development string. */
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

/** Spaces shipped with the 0.31 series and remain available in calendar releases. */
export function supportsSpaces(version: string): boolean {
  const comparison = compareVersions(version, "0.31.0-0");
  return comparison !== null && comparison >= 0;
}

/**
 * The 0.26 snapshot documents the complete 0.26.x series. Accept stable Memos releases from
 * 0.26.0 onward within the audited 0.x line, plus release candidates for a newer compatible
 * 0.x release. Calendar releases, release candidates, and dated development builds continue
 * that line; Memos calls out breaking changes in upgrade notes rather than in the version
 * number. Other prereleases and SemVer majors require a fresh contract audit.
 */
export function isSupportedVersion(version: string): boolean {
  if (CALVER_PATTERN.test(version) || CALVER_DEV_PATTERN.test(version)) return true;
  const parsed = parseVersion(version);
  const precedence = compareVersions(version, MIN_SUPPORTED_VERSION);
  const isRelease = parsed?.prerelease.length === 0;
  const isReleaseCandidate = parsed?.prerelease[0]?.toLowerCase() === "rc";
  return parsed?.major === 0 && (isRelease || isReleaseCandidate) && precedence !== null && precedence >= 0;
}
