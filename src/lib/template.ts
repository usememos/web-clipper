/**
 * Minimal memo template engine (approach A): `{{var}}` substitution with multiline blockquote support plus one rule
 * that does the work of conditionals — a line whose variables all resolve empty and which
 * has no other meaningful text (letters/digits) is dropped. Literal lines are kept as-is.
 */

// Single source of the `{{var}}` grammar: the engine's substitution regex and the options
// editor's token highlighting are both derived from it, so they can never disagree.
const VAR_NAME_SOURCE = "[a-zA-Z][\\w-]*";
const VAR_RE = new RegExp(`\\{\\{\\s*(${VAR_NAME_SOURCE})\\s*\\}\\}`, "g");
// A quoted placeholder occupies a whole template line, so its prefix applies to every
// expanded line, including blank lines and any blockquotes already present in the source.
const QUOTED_VAR_RE = new RegExp(`^([ \t]*(?:>[ \t]*)+)\\{\\{\\s*(${VAR_NAME_SOURCE})\\s*\\}\\}[ \t]*$`);
const TOKEN_SPLIT_RE = new RegExp(`(\\{\\{\\s*${VAR_NAME_SOURCE}\\s*\\}\\})`, "g");

/** Splits text so whole `{{var}}` tokens occupy the odd indices (split-on-capture-group). */
export function splitTemplateTokens(text: string): string[] {
  return text.split(TOKEN_SPLIT_RE);
}

/**
 * The out-of-the-box template: the captured content as a quote first, the page's own
 * description second, provenance last. Default tags are literal #tags users add here —
 * there is no per-clip tag input. Empty-variable lines drop, so every combination stays clean.
 */
export const DEFAULT_TEMPLATE = `> {{content}}

{{description}}

[{{title}}]({{url}})`;

export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  const rendered = template
    .split("\n")
    .map((line) => {
      const quoted = QUOTED_VAR_RE.exec(line);
      if (quoted?.[1] && quoted[2]) {
        const prefix = quoted[1];
        const value = vars[quoted[2]]?.trim() ?? "";
        if (!value) return null;
        return value
          .split("\n")
          .map((part) => (part.trim() ? `${prefix}${part}` : prefix.trimEnd()))
          .join("\n");
      }
      let hadVar = false;
      let hadResolvedVar = false;
      const out = line.replace(VAR_RE, (_match, name: string) => {
        hadVar = true;
        const value = vars[name]?.trim() ?? "";
        if (value) hadResolvedVar = true;
        return value;
      });
      // Drop punctuation-only scaffolding only when every variable on the line resolved empty.
      if (hadVar && !hadResolvedVar && !/[\p{L}\p{N}]/u.test(out)) return null;
      return out;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
  return rendered.replace(/\n{3,}/g, "\n\n").trim();
}
