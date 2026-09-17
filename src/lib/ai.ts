/** Public AI types. Saved credentials live only in background/ai.ts. */
export const AI_MAX_INPUT_CHARS = 40_000;
export const AI_MAX_TAGS = 50;
export const AI_MAX_TAG_CHARS = 40;
export const AI_SETTINGS_KEY = "aiSettingsV1";
export type AiPreferences = {
  model: "deepseek-flash" | "deepseek-v4-pro";
  automatic: boolean;
  contentMode: "cleaned" | "original" | "summary";
  summaryLanguage: "zh-CN" | "zh-TW" | "en" | "source";
  summaryLength: "short" | "standard" | "detailed";
  tagCount: number;
  tagMode: "prefer" | "only";
};
export const DEFAULT_AI_PREFERENCES: Readonly<AiPreferences> = {
  model: "deepseek-flash",
  automatic: true,
  contentMode: "cleaned",
  summaryLanguage: "zh-CN",
  summaryLength: "standard",
  tagCount: 5,
  tagMode: "prefer",
};

export function parseAiPreferences(value: unknown): AiPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = { ...DEFAULT_AI_PREFERENCES, ...value };
  if (
    !["deepseek-flash", "deepseek-v4-pro"].includes(raw.model) ||
    typeof raw.automatic !== "boolean" ||
    !["cleaned", "original", "summary"].includes(raw.contentMode) ||
    !["zh-CN", "zh-TW", "en", "source"].includes(raw.summaryLanguage) ||
    !["short", "standard", "detailed"].includes(raw.summaryLength) ||
    !Number.isInteger(raw.tagCount) ||
    raw.tagCount < 0 ||
    raw.tagCount > 10 ||
    !["prefer", "only"].includes(raw.tagMode)
  )
    return null;
  return {
    model: raw.model,
    automatic: raw.automatic,
    contentMode: raw.contentMode,
    summaryLanguage: raw.summaryLanguage,
    summaryLength: raw.summaryLength,
    tagCount: raw.tagCount,
    tagMode: raw.tagMode,
  };
}

export type AiSettings = { enabled: boolean; hasApiKey: boolean; preferredTags: string[]; preferences: AiPreferences; revision: number };
export type AiSettingsUpdate = {
  enabled: boolean;
  apiKey?: string;
  preferredTags: string[];
  preferences?: AiPreferences;
  expectedRevision?: number;
};
export type AiInput = { title: string; content: string; requestId?: string; bypassCache?: boolean };
export type AiClip = { content: string; summary: string; tags: string[] };
export type AiError =
  | "settings"
  | "settings-conflict"
  | "settings-changed"
  | "empty-tags"
  | "missing-key"
  | "invalid-key"
  | "quota"
  | "rate-limit"
  | "timeout"
  | "unavailable"
  | "invalid-response"
  | "too-long"
  | "no-content";
export type AiResult =
  | { ok: true; clip: AiClip; preferences: AiPreferences; fromCache?: boolean }
  | { ok: false; error: AiError | "disabled" | "cancelled" | "settings-changed" };
export type AiSettingsResult =
  | { ok: true; settings: AiSettings }
  | { ok: false; error: "settings" | "missing-key" | "settings-conflict" | "empty-tags" };

/** Simple Memos hashtag vocabulary: no spaces, Markdown punctuation, or empty path segments. */
export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").normalize("NFC");
}

export function validTag(value: string): boolean {
  return value.length > 0 && value.length <= AI_MAX_TAG_CHARS && /^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(value);
}

export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.map(normalizeTag).filter((tag) => {
    const key = tag.toLocaleLowerCase("en");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parsePreferredTags(text: string): string[] | null {
  const tags = uniqueTags(
    text
      .split(/[,，\n]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
  return tags.length <= AI_MAX_TAGS && tags.every(validTag) ? tags : null;
}

export function parseAiSettingsUpdate(value: Record<string, unknown>): AiSettingsUpdate | null {
  if (typeof value.enabled !== "boolean" || !Array.isArray(value.preferredTags) || value.preferredTags.length > AI_MAX_TAGS) return null;
  if (!value.preferredTags.every((tag): tag is string => typeof tag === "string" && validTag(normalizeTag(tag)))) return null;
  if (value.apiKey !== undefined && (typeof value.apiKey !== "string" || !/^[\x21-\x7e]{1,512}$/.test(value.apiKey.trim()))) return null;
  const preferences = value.preferences === undefined ? undefined : parseAiPreferences(value.preferences);
  if (preferences === null) return null;
  if (value.expectedRevision !== undefined && (!Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0))
    return null;
  return {
    enabled: value.enabled,
    preferredTags: uniqueTags(value.preferredTags),
    ...(typeof value.apiKey === "string" ? { apiKey: value.apiKey.trim() } : {}),
    ...(preferences ? { preferences } : {}),
    ...(typeof value.expectedRevision === "number" ? { expectedRevision: value.expectedRevision } : {}),
  };
}
