import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { DEFAULT_TEMPLATE, renderTemplate } from "./template";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
// GFM additions — most importantly tables, which plain Turndown flattens to loose text.
turndown.use(gfm);

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  return turndown.turndown(html).trim();
}

/** Marks captured page text as quoted material: every line becomes a Markdown blockquote line. */
export function toQuotedMarkdown(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return "";
  return trimmed
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

/** A long page description is context, not content — keep the memo feed-sized. (The options page documents this cap.) */
export const DESCRIPTION_MAX_CHARS = 500;

export type ComposeInput = {
  bodyMarkdown: string;
  title: string;
  url: string;
  /** The page's own summary (og:description / meta description). */
  description?: string;
  /** User template from settings; falls back to DEFAULT_TEMPLATE when absent/blank. */
  template?: string | null;
};

/**
 * Every `{{var}}` the template engine fills — the options UI derives its chip list from this.
 * Deliberately few: the capture data the default template actually needs. Tags are not a
 * variable — default tags are literal #tags written in the template itself.
 */
export const TEMPLATE_VAR_NAMES = ["content", "title", "url", "description"] as const;
export type TemplateVarName = (typeof TEMPLATE_VAR_NAMES)[number];

/** Renders the memo body through the user's template (or the default). */
export function composeMemoContent({ bodyMarkdown, title, url, description, template }: ComposeInput): string {
  const vars: Record<TemplateVarName, string> = {
    content: bodyMarkdown.trim(),
    title: title || url,
    url,
    description: (description ?? "").trim().slice(0, DESCRIPTION_MAX_CHARS),
  };
  return renderTemplate(template?.trim() ? template : DEFAULT_TEMPLATE, vars);
}
