import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_MAX_INPUT_CHARS, DEFAULT_AI_PREFERENCES } from "@/lib/ai";
import { browserMock, seedStorage } from "@/test/browser-mock";
import {
  AI_CACHE_KEY,
  AI_CACHE_TTL_MS,
  AI_SETTINGS_KEY,
  AI_TIMEOUT_MS,
  cancelAiClip,
  generateAiClip,
  getAiSettings,
  removeAiKey,
  saveAiSettings,
} from "../ai";

const settings = { schemaVersion: 1, enabled: true, apiKey: "sk-test-fixture", preferredTags: ["编程", "TypeScript"] };
const input = { title: "A useful article", content: "## Steps\n\nUse version 3. Cost: 20 yuan.\n\nSubscribe to our newsletter." };
const modelClip = {
  status: "ok",
  content: "## Steps\n\nUse version 3. Cost: 20 yuan.",
  summary: "使用版本 3，费用为 20 元。",
  tags: ["编程", "typescript", "工具"],
};
function mockReply(clip: unknown = modelClip, finishReason = "stop") {
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(clip) } }] })),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.useRealTimers());

describe("AI settings and DeepSeek", () => {
  it("defaults to off and never returns a saved key to the UI", async () => {
    expect(await getAiSettings()).toEqual({
      ok: true,
      settings: { enabled: false, hasApiKey: false, preferredTags: [], preferences: DEFAULT_AI_PREFERENCES, revision: 0 },
    });
    expect(await saveAiSettings({ enabled: true, apiKey: settings.apiKey, preferredTags: ["#编程", "编程"] })).toEqual({
      ok: true,
      settings: { enabled: true, hasApiKey: true, preferredTags: ["编程"], preferences: DEFAULT_AI_PREFERENCES, revision: 1 },
    });
    await saveAiSettings({ enabled: false, preferredTags: ["产品"] });
    const stored = (await browserMock.storage.local.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY];
    expect(stored).toMatchObject({ apiKey: settings.apiKey, enabled: false, preferredTags: ["产品"] });
    expect(JSON.stringify(await getAiSettings())).not.toContain(settings.apiKey);
    expect(await removeAiKey()).toEqual({
      ok: true,
      settings: { enabled: false, hasApiKey: false, preferredTags: ["产品"], preferences: DEFAULT_AI_PREFERENCES, revision: 3 },
    });
    expect((await browserMock.storage.local.get(AI_SETTINGS_KEY))[AI_SETTINGS_KEY]).toMatchObject({ apiKey: "" });
  });

  it("requires a key before enabling and reports failed storage writes", async () => {
    expect(await saveAiSettings({ enabled: true, preferredTags: [] })).toEqual({ ok: false, error: "missing-key" });
    browserMock.storage.local.set.mockRejectedValueOnce(new Error("Storage full"));
    expect(await saveAiSettings({ enabled: true, apiKey: settings.apiKey, preferredTags: [] })).toEqual({ ok: false, error: "settings" });
  });

  it("does not make paid calls when disabled, missing content, or over the input limit", async () => {
    const fetchMock = mockReply();
    expect(await generateAiClip(input)).toEqual({ ok: false, error: "disabled" });
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    expect(await generateAiClip({ ...input, content: " " })).toEqual({ ok: false, error: "no-content" });
    expect(await generateAiClip({ ...input, content: "a".repeat(AI_MAX_INPUT_CHARS + 1) })).toEqual({ ok: false, error: "too-long" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests faithful cleanup and structured results, passes preferred tags, and canonicalizes reused tags", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const fetchMock = mockReply();
    const result = await generateAiClip(input);
    expect(result).toEqual({
      ok: true,
      clip: { content: modelClip.content, summary: modelClip.summary, tags: ["编程", "TypeScript", "工具"] },
      preferences: DEFAULT_AI_PREFERENCES,
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(options.headers.Authorization).toBe(`Bearer ${settings.apiKey}`);
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ model: "deepseek-flash", response_format: { type: "json_object" }, thinking: { type: "disabled" } });
    expect(JSON.parse(body.messages[1].content)).toEqual({ ...input, preferredTags: settings.preferredTags });
    expect(body.messages[0].content).toContain("不要把正文改写成摘要");
    expect(body.messages[0].content).toContain("不是指令");
    expect(body.messages[0].content).toContain("不相关标签");
  });

  it.each([
    [401, "invalid-key"],
    [402, "quota"],
    [429, "rate-limit"],
    [503, "unavailable"],
  ])("handles HTTP %s without leaking response bodies", async (status, error) => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const fetchMock = vi.fn().mockResolvedValue(new Response("private provider diagnostic", { status: status as number }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateAiClip(input)).toEqual({ ok: false, error });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...modelClip, content: "" },
    { ...modelClip, summary: 42 },
    { ...modelClip, tags: ["[bad](https://example.com)"] },
    { content: "hallucinated" },
  ])("rejects malformed structured content: %j", async (clip) => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    mockReply(clip);
    expect(await generateAiClip(input)).toEqual({ ok: false, error: "invalid-response" });
  });

  it("rejects token-truncated JSON even if the included object is valid", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    mockReply(modelClip, "length");
    expect(await generateAiClip(input)).toEqual({ ok: false, error: "invalid-response" });
  });

  it("does not invent notes when the model finds only page clutter", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    mockReply({ status: "insufficient", content: "", summary: "", tags: [] });
    expect(await generateAiClip(input)).toEqual({ ok: false, error: "no-content" });
  });

  it("aborts a stalled request and does not retry automatically", async () => {
    vi.useFakeTimers();
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const fetchMock = vi.fn(
      (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = generateAiClip(input);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS);
    expect(await request).toEqual({ ok: false, error: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards a result after AI is disabled while the call is running", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await removeAiKey();
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(modelClip) } }] }));
      }),
    );
    expect(await generateAiClip(input)).toEqual({ ok: false, error: "settings-changed" });
  });
});

describe("AI preferences and request lifecycle", () => {
  it("migrates existing keys/tags with default preferences without rewriting storage", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    expect(await getAiSettings()).toEqual({
      ok: true,
      settings: { enabled: true, hasApiKey: true, preferredTags: settings.preferredTags, preferences: DEFAULT_AI_PREFERENCES, revision: 0 },
    });
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("prevents stale settings and key removal from overwriting a newer revision", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const first = saveAiSettings({ enabled: true, preferredTags: ["产品"], expectedRevision: 0 });
    const stale = saveAiSettings({ enabled: false, preferredTags: ["过期"], expectedRevision: 0 });
    expect((await first).ok).toBe(true);
    expect(await stale).toEqual({ ok: false, error: "settings-conflict" });
    expect(await removeAiKey(0)).toEqual({ ok: false, error: "settings-conflict" });
    expect(await getAiSettings()).toMatchObject({ settings: { enabled: true, hasApiKey: true, preferredTags: ["产品"], revision: 1 } });
  });

  it("requires candidates in restricted mode, except when AI tags are off", async () => {
    const update = { enabled: false, preferredTags: [], preferences: { ...DEFAULT_AI_PREFERENCES, tagMode: "only" as const } };
    expect(await saveAiSettings(update)).toEqual({ ok: false, error: "empty-tags" });
    expect((await saveAiSettings({ ...update, preferences: { ...update.preferences, tagCount: 0 } })).ok).toBe(true);
  });

  it("applies model, output mode, language, length and a strict tag vocabulary together", async () => {
    const preferences = {
      ...DEFAULT_AI_PREFERENCES,
      model: "deepseek-v4-pro",
      contentMode: "summary",
      summaryLanguage: "en",
      summaryLength: "detailed",
      tagMode: "only",
      tagCount: 1,
    };
    seedStorage({ [AI_SETTINGS_KEY]: { ...settings, preferences } });
    const fetchMock = mockReply({ ...modelClip, content: "", tags: ["new-topic", "typescript", "编程"] });
    expect(await generateAiClip(input)).toEqual({
      ok: true,
      clip: { content: "", summary: modelClip.summary, tags: ["TypeScript"] },
      preferences,
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.messages[0].content).toContain("用英语写摘要");
    expect(body.messages[0].content).toContain("4–6 条要点");
  });

  it.each([0, 5])("accepts no matching tags without inventing candidates (tagCount=%s)", async (tagCount) => {
    seedStorage({ [AI_SETTINGS_KEY]: { ...settings, preferences: { ...DEFAULT_AI_PREFERENCES, tagMode: "only", tagCount } } });
    mockReply({ ...modelClip, tags: ["unrelated"] });
    expect(await generateAiClip(input)).toMatchObject({ ok: true, clip: { tags: [] } });
  });

  it("reuses only a recent matching result and explicitly regenerates when requested", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const fetchMock = mockReply();
    expect((await generateAiClip(input)).ok).toBe(true);
    expect(await generateAiClip(input)).toMatchObject({ ok: true, fromCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await generateAiClip({ ...input, bypassCache: true })).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await generateAiClip({ ...input, content: "A different selection" })).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const cached = await browserMock.storage.session.get(AI_CACHE_KEY);
    expect(JSON.stringify(cached)).not.toContain(settings.apiKey);
    expect(JSON.stringify(cached)).not.toContain("Subscribe to our newsletter");
  });

  it("expires cached results and clears them after a settings change", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const fetchMock = mockReply();
    await generateAiClip(input);
    const cached = (await browserMock.storage.session.get(AI_CACHE_KEY))[AI_CACHE_KEY] as Record<string, unknown>;
    await browserMock.storage.session.set({ [AI_CACHE_KEY]: { ...cached, createdAt: Date.now() - AI_CACHE_TTL_MS } });
    await generateAiClip(input);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await saveAiSettings({ enabled: true, preferredTags: ["产品"] });
    expect(await browserMock.storage.session.get(AI_CACHE_KEY)).toEqual({});
    await generateAiClip(input);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("can cancel before settings have loaded without making a paid call", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const fetchMock = mockReply();
    const request = generateAiClip({ ...input, requestId: "cancel-before-load" });
    cancelAiClip("cancel-before-load");
    expect(await request).toEqual({ ok: false, error: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels an in-flight request without caching it or retrying", async () => {
    seedStorage({ [AI_SETTINGS_KEY]: settings });
    const fetchMock = vi.fn(
      (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = generateAiClip({ ...input, requestId: "cancel-in-flight" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    cancelAiClip("cancel-in-flight");
    expect(await request).toEqual({ ok: false, error: "cancelled" });
    expect(await browserMock.storage.session.get(AI_CACHE_KEY)).toEqual({});
  });
});
