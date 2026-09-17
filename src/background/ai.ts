import browser from "webextension-polyfill";
import {
  AI_MAX_INPUT_CHARS,
  AI_SETTINGS_KEY,
  type AiClip,
  type AiInput,
  type AiPreferences,
  type AiResult,
  type AiSettings,
  type AiSettingsResult,
  type AiSettingsUpdate,
  DEFAULT_AI_PREFERENCES,
  normalizeTag,
  parseAiSettingsUpdate,
  uniqueTags,
  validTag,
} from "@/lib/ai";
import { aiSystemPrompt } from "@/lib/ai-prompt";

export { AI_SETTINGS_KEY } from "@/lib/ai";
// Stay below the MV3 worker's 30-second fetch-response deadline.
export const AI_TIMEOUT_MS = 25_000;
export const AI_CACHE_KEY = "aiRecentResultV1";
export const AI_CACHE_TTL_MS = 5 * 60_000;
type StoredSettings = {
  schemaVersion: 1;
  enabled: boolean;
  apiKey: string;
  preferredTags: string[];
  preferences: AiPreferences;
  revision: number;
};
const DEFAULTS: StoredSettings = {
  schemaVersion: 1,
  enabled: false,
  apiKey: "",
  preferredTags: [],
  preferences: { ...DEFAULT_AI_PREFERENCES },
  revision: 0,
};
const activeRequests = new Map<string, AbortController>();

async function readSettings(): Promise<StoredSettings> {
  const value = (await browser.storage.local.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY] as unknown;
  if (value === undefined) return { ...DEFAULTS };
  if (!value || typeof value !== "object") throw new Error("Invalid AI settings");
  const raw = value as Record<string, unknown>;
  const parsed = parseAiSettingsUpdate({ ...raw, apiKey: raw.apiKey === "" ? undefined : raw.apiKey });
  if (raw.schemaVersion !== 1 || typeof raw.apiKey !== "string" || !parsed) throw new Error("Invalid AI settings");
  if (raw.revision !== undefined && (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0))
    throw new Error("Invalid AI revision");
  return {
    schemaVersion: 1,
    enabled: parsed.enabled,
    preferredTags: parsed.preferredTags,
    apiKey: parsed.apiKey ?? "",
    preferences: parsed.preferences ?? { ...DEFAULT_AI_PREFERENCES },
    revision: (raw.revision as number | undefined) ?? 0,
  };
}
function publicSettings(s: StoredSettings): AiSettings {
  return {
    enabled: s.enabled,
    hasApiKey: Boolean(s.apiKey),
    preferredTags: s.preferredTags,
    preferences: s.preferences,
    revision: s.revision,
  };
}
export async function getAiSettings(): Promise<AiSettingsResult> {
  try {
    return { ok: true, settings: publicSettings(await readSettings()) };
  } catch {
    return { ok: false, error: "settings" };
  }
}
let mutation = Promise.resolve();
function mutateSettings(operation: () => Promise<AiSettingsResult>): Promise<AiSettingsResult> {
  const result = mutation.then(operation, operation);
  mutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
async function persistSettings(next: StoredSettings): Promise<AiSettingsResult> {
  await browser.storage.local.set({ [AI_SETTINGS_KEY]: next });
  for (const controller of activeRequests.values()) controller.abort("settings-changed");
  await browser.storage.session?.remove(AI_CACHE_KEY).catch(() => {});
  return { ok: true, settings: publicSettings(next) };
}
export function saveAiSettings(update: AiSettingsUpdate): Promise<AiSettingsResult> {
  return mutateSettings(async () => {
    try {
      const parsed = parseAiSettingsUpdate(update);
      if (!parsed) return { ok: false, error: "settings" };
      const previous = await readSettings();
      if (parsed.expectedRevision !== undefined && parsed.expectedRevision !== previous.revision)
        return { ok: false, error: "settings-conflict" };
      const next: StoredSettings = {
        ...previous,
        enabled: parsed.enabled,
        preferredTags: parsed.preferredTags,
        apiKey: parsed.apiKey ?? previous.apiKey,
        preferences: parsed.preferences ?? previous.preferences,
        revision: previous.revision + 1,
      };
      if (next.enabled && !next.apiKey) return { ok: false, error: "missing-key" };
      if (next.preferences.tagCount > 0 && next.preferences.tagMode === "only" && !next.preferredTags.length)
        return { ok: false, error: "empty-tags" };
      return await persistSettings(next);
    } catch {
      return { ok: false, error: "settings" };
    }
  });
}
export function removeAiKey(expectedRevision?: number): Promise<AiSettingsResult> {
  return mutateSettings(async () => {
    try {
      const previous = await readSettings();
      if (expectedRevision !== undefined && expectedRevision !== previous.revision) return { ok: false, error: "settings-conflict" };
      return await persistSettings({ ...previous, enabled: false, apiKey: "", revision: previous.revision + 1 });
    } catch {
      return { ok: false, error: "settings" };
    }
  });
}
export function cancelAiClip(requestId: string): void {
  activeRequests.get(requestId)?.abort("cancelled");
}

function parseClip(value: unknown, settings: StoredSettings): AiClip | "insufficient" | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.status === "insufficient" && raw.content === "" && raw.summary === "" && Array.isArray(raw.tags) && raw.tags.length === 0)
    return "insufficient";
  if (
    raw.status !== "ok" ||
    typeof raw.content !== "string" ||
    raw.content.length > 60_000 ||
    (settings.preferences.contentMode === "cleaned" && !raw.content.trim()) ||
    typeof raw.summary !== "string" ||
    !raw.summary.trim() ||
    raw.summary.length > 4_000 ||
    !Array.isArray(raw.tags) ||
    raw.tags.length > 30 ||
    !raw.tags.every((tag): tag is string => typeof tag === "string" && validTag(normalizeTag(tag)))
  )
    return null;
  const vocabulary = new Map(settings.preferredTags.map((tag) => [tag.toLocaleLowerCase("en"), tag]));
  // The candidate-only rule is enforced locally, even if the model ignores it. Empty matches are valid.
  const tags = uniqueTags(raw.tags)
    .filter((tag) => settings.preferences.tagMode !== "only" || vocabulary.has(tag.toLocaleLowerCase("en")))
    .map((tag) => vocabulary.get(tag.toLocaleLowerCase("en")) ?? tag)
    .slice(0, settings.preferences.tagCount);
  return { content: settings.preferences.contentMode === "cleaned" ? raw.content.trim() : "", summary: raw.summary.trim(), tags };
}
async function cacheKey(input: AiInput, settings: StoredSettings): Promise<string> {
  const data = JSON.stringify([
    input.title,
    input.content,
    settings.apiKey,
    settings.revision,
    settings.preferences,
    settings.preferredTags,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
async function readCached(key: string, settings: StoredSettings): Promise<AiClip | null> {
  try {
    const value = (await browser.storage.session?.get(AI_CACHE_KEY))?.[AI_CACHE_KEY];
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (
      !raw ||
      raw.key !== key ||
      typeof raw.createdAt !== "number" ||
      raw.createdAt > Date.now() ||
      Date.now() - raw.createdAt >= AI_CACHE_TTL_MS
    )
      return null;
    if (!raw.clip || typeof raw.clip !== "object") return null;
    const clip = parseClip({ ...raw.clip, status: "ok" }, settings);
    return clip === "insufficient" ? null : clip;
  } catch {
    return null;
  }
}

export async function generateAiClip(input: AiInput): Promise<AiResult> {
  const requestId = input.requestId ?? crypto.randomUUID();
  if (activeRequests.has(requestId)) return { ok: false, error: "unavailable" };
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let settings: StoredSettings;
    try {
      settings = await readSettings();
    } catch {
      return { ok: false, error: "settings" };
    }
    if (!settings.enabled) return { ok: false, error: "disabled" };
    if (!settings.apiKey) return { ok: false, error: "missing-key" };
    if (!input.content.trim()) return { ok: false, error: "no-content" };
    if (input.content.length > AI_MAX_INPUT_CHARS) return { ok: false, error: "too-long" };
    controller.signal.throwIfAborted();
    const key = await cacheKey(input, settings);
    const cached = input.bypassCache ? null : await readCached(key, settings);
    controller.signal.throwIfAborted();
    if (cached) return { ok: true, clip: cached, preferences: settings.preferences, fromCache: true };
    timer = setTimeout(() => controller.abort("timeout"), AI_TIMEOUT_MS);
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.preferences.model,
        messages: [
          { role: "system", content: aiSystemPrompt(settings.preferences) },
          { role: "user", content: JSON.stringify({ title: input.title, content: input.content, preferredTags: settings.preferredTags }) },
        ],
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        max_tokens: settings.preferences.contentMode === "cleaned" ? 16_384 : 4_096,
        stream: false,
      }),
    });
    if (response.status === 401 || response.status === 403) return { ok: false, error: "invalid-key" };
    if (response.status === 402) return { ok: false, error: "quota" };
    if (response.status === 429) return { ok: false, error: "rate-limit" };
    if (!response.ok) return { ok: false, error: "unavailable" };
    const data = await response.json();
    const choice = data?.choices?.[0];
    if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string") return { ok: false, error: "invalid-response" };
    const clip = parseClip(JSON.parse(choice.message.content), settings);
    if (clip === "insufficient") return { ok: false, error: "no-content" };
    if (!clip) return { ok: false, error: "invalid-response" };
    controller.signal.throwIfAborted();
    const current = await readSettings();
    if (!current.enabled || current.apiKey !== settings.apiKey || current.revision !== settings.revision)
      return { ok: false, error: "settings-changed" };
    // At most one result, in session storage only; it survives worker sleep, not a browser restart.
    await browser.storage.session?.set({ [AI_CACHE_KEY]: { key, clip, createdAt: Date.now() } }).catch(() => {});
    controller.signal.throwIfAborted();
    return { ok: true, clip, preferences: settings.preferences };
  } catch (error) {
    const reason = controller.signal.reason;
    return {
      ok: false,
      error: controller.signal.aborted
        ? reason === "settings-changed" || reason === "cancelled"
          ? reason
          : "timeout"
        : error instanceof SyntaxError
          ? "invalid-response"
          : "unavailable",
    };
  } finally {
    if (timer) clearTimeout(timer);
    activeRequests.delete(requestId);
  }
}
