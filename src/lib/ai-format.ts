import { type AiClip, type AiPreferences, DEFAULT_AI_PREFERENCES } from "./ai";
import { type ComposeInput, composeMemoContent } from "./format";

/** Older custom templates still get the new summary and tags without rewriting the saved template. */
export function composeAiMemo(input: ComposeInput, clip: AiClip, preferences: AiPreferences = DEFAULT_AI_PREFERENCES): string {
  const heading = preferences.summaryLanguage.startsWith("zh") ? "摘要" : "Summary";
  const summary = `**${heading}**\n\n${clip.summary}`;
  const content = preferences.contentMode === "original" ? input.bodyMarkdown : preferences.contentMode === "summary" ? "" : clip.content;
  const body = composeMemoContent({ ...input, bodyMarkdown: content, description: "", summary, tags: clip.tags });
  const template = input.template?.trim();
  return [
    template && !/\{\{\s*summary\s*\}\}/.test(template) ? summary : "",
    body,
    template && !/\{\{\s*tags\s*\}\}/.test(template) ? clip.tags.map((tag) => `#${tag}`).join(" ") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
