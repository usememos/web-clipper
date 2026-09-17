import { describe, expect, it } from "vitest";
import { DEFAULT_AI_PREFERENCES, parsePreferredTags } from "../ai";
import { composeAiMemo } from "../ai-format";
import { isTrustedBackgroundRequest, parseBackgroundRequest } from "../background-protocol";

describe("AI tags, formatting, and trust boundary", () => {
  it("normalizes optional hashes and deduplicates vocabulary without changing tag spelling", () => {
    expect(parsePreferredTags("#编程，TypeScript\ntypescript, 技术/前端")).toEqual(["编程", "TypeScript", "技术/前端"]);
    expect(parsePreferredTags("has spaces")).toBeNull();
    expect(parsePreferredTags("a//b")).toBeNull();
    expect(parsePreferredTags(Array.from({ length: 51 }, (_, i) => `tag${i}`).join(","))).toBeNull();
  });

  it("replaces noisy descriptions, preserves source links and fixed tags, and supports older templates", () => {
    const input = { bodyMarkdown: "Ad\nBody", title: "Title", url: "https://example.com/a", description: "Subscribe today!" };
    const clip = { content: "Body with facts", summary: "正文摘要。", tags: ["编程"] };
    const output = composeAiMemo(input, clip);
    expect(output).toBe("**摘要**\n\n正文摘要。\n\nBody with facts\n\n[Title](https://example.com/a)\n\n#编程");
    const legacy = composeAiMemo({ ...input, template: "{{content}}\n\n{{description}}\n[{{title}}]({{url}}) #fixed" }, clip);
    expect(legacy).toContain("#fixed");
    expect(legacy).toContain("#编程");
    expect(legacy).toContain("正文摘要。");
    expect(legacy).not.toContain("Subscribe");
  });

  it("does not accept settings writes from the popup or AI requests from content scripts", () => {
    const save = parseBackgroundRequest({ type: "SAVE_AI_SETTINGS", enabled: true, apiKey: "sk-fixture", preferredTags: ["编程"] })!;
    const generate = parseBackgroundRequest({ type: "GENERATE_AI_CLIP", title: "Title", content: "Body", apiKey: "ignored" })!;
    expect(generate).not.toHaveProperty("apiKey");
    expect(isTrustedBackgroundRequest(save, { id: "test", url: "chrome-extension://test/src/options/index.html" }, "test")).toBe(true);
    expect(isTrustedBackgroundRequest(save, { id: "test", url: "chrome-extension://test/src/popup/index.html" }, "test")).toBe(false);
    expect(isTrustedBackgroundRequest(generate, { id: "test", url: "https://example.com" }, "test")).toBe(false);
    expect(parseBackgroundRequest({ type: "SAVE_AI_SETTINGS", enabled: true, apiKey: "sk-\r\nheader", preferredTags: [] })).toBeNull();
    expect(parseBackgroundRequest({ type: "GENERATE_AI_CLIP", title: "Title", content: null })).toBeNull();
  });
});

describe("configurable AI output", () => {
  const input = { bodyMarkdown: "Original body\n```ts\nlet n = 3;\n```", title: "Source", url: "https://example.com", description: "Ad" };
  const clip = { content: "Cleaned body", summary: "A concise summary.", tags: [] };
  it("preserves the original text verbatim when requested, omits it in summary mode, and keeps attribution", () => {
    const original = composeAiMemo(input, clip, { ...DEFAULT_AI_PREFERENCES, contentMode: "original", summaryLanguage: "en" });
    expect(original).toContain(input.bodyMarkdown);
    expect(original).toContain("**Summary**");
    expect(original).not.toContain(clip.content);
    const summary = composeAiMemo(input, clip, { ...DEFAULT_AI_PREFERENCES, contentMode: "summary" });
    expect(summary).toContain(clip.summary);
    expect(summary).toContain("[Source](https://example.com)");
    expect(summary).not.toContain(input.bodyMarkdown);
    expect(summary).not.toContain(clip.content);
  });
  it.each([
    { tagCount: -1 },
    { tagCount: 11 },
    { tagCount: 2.5 },
    { model: "unknown" },
    { summaryLanguage: "invalid" },
    { contentMode: "rewrite" },
    { automatic: "true" },
    { tagMode: "anything" },
  ])("rejects invalid configuration %j", (preferences) => {
    expect(parseBackgroundRequest({ type: "SAVE_AI_SETTINGS", enabled: false, preferredTags: [], preferences })).toBeNull();
  });
  it("accepts cancellation only from the popup and validates the request identifier", () => {
    const request = parseBackgroundRequest({ type: "CANCEL_AI_CLIP", requestId: "test-request-1" })!;
    expect(isTrustedBackgroundRequest(request, { id: "test", url: "chrome-extension://test/src/popup/index.html" }, "test")).toBe(true);
    expect(isTrustedBackgroundRequest(request, { id: "test", url: "https://example.com" }, "test")).toBe(false);
    expect(parseBackgroundRequest({ type: "CANCEL_AI_CLIP", requestId: "" })).toBeNull();
    expect(parseBackgroundRequest({ type: "GENERATE_AI_CLIP", title: "T", content: "B", bypassCache: "true" })).toBeNull();
  });
});
