/**
 * Minimal memo template engine (approach A): plain `{{var}}` substitution plus one rule
 * that does the work of conditionals — a line whose variables all resolve empty and which
 * has no other meaningful text (letters/digits) is dropped. Literal lines are kept as-is.
 */

// Single source of the `{{var}}` grammar: the engine's substitution regex and the options
// editor's token highlighting are both derived from it, so they can never disagree.
const VAR_NAME_SOURCE = "[a-zA-Z][\\w-]*";
const VAR_RE = new RegExp(`\\{\\{\\s*(${VAR_NAME_SOURCE})\\s*\\}\\}`, "g");
const TOKEN_SPLIT_RE = new RegExp(`(\\{\\{\\s*${VAR_NAME_SOURCE}\\s*\\}\\})`, "g");

/** Splits text so whole `{{var}}` tokens occupy the odd indices (split-on-capture-group). */
export function splitTemplateTokens(text: string): string[] {
  return text.split(TOKEN_SPLIT_RE);
}

/**
 * AI summary first, content, description, provenance, then AI tags. Empty fields drop,
 * preserving the original format when AI is off. Literal fixed tags remain supported.
 */
export const DEFAULT_TEMPLATE = `{{summary}}

{{content}}

{{description}}

[{{title}}]({{url}})

{{tags}}`;

export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  const rendered = template
    .split("\n")
    .map((line) => {
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
