import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, renderTemplate } from "@/lib/template";

describe("renderTemplate", () => {
  it("substitutes variables", () => {
    expect(renderTemplate("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
  });

  it("treats unknown variables as empty", () => {
    expect(renderTemplate("a {{nope}} b", {})).toBe("a  b");
  });

  it("drops a line whose variables all resolve empty", () => {
    const out = renderTemplate("{{content}}\n{{tags}}", { content: "body", tags: "" });
    expect(out).toBe("body");
  });

  it("drops var-only lines with punctuation residue but keeps literal lines", () => {
    const out = renderTemplate("{{content}}\n---\n— [{{title}}]({{url}})", { content: "x", title: "", url: "" });
    // The link line drops (only punctuation residue); the literal --- stays.
    expect(out).toBe("x\n---");
  });

  it("keeps a line when any of its variables resolved", () => {
    const out = renderTemplate("[{{title}}]({{url}})", { title: "", url: "https://x.com" });
    expect(out).toBe("[](https://x.com)");
  });

  it("keeps resolved variables containing only emoji or punctuation", () => {
    expect(renderTemplate("{{content}}", { content: "🎉" })).toBe("🎉");
    expect(renderTemplate("{{content}}", { content: "---" })).toBe("---");
  });

  it("collapses runs of blank lines left by dropped lines", () => {
    const out = renderTemplate("{{content}}\n\n{{description}}\n\n{{tags}}", { content: "body", description: "", tags: "#t" });
    expect(out).toBe("body\n\n#t");
  });

  it("DEFAULT_TEMPLATE renders content, description, then the source link", () => {
    const out = renderTemplate(DEFAULT_TEMPLATE, {
      content: "> Some quote",
      description: "A summary",
      title: "Title",
      url: "https://example.com/a",
    });
    expect(out).toBe("> Some quote\n\nA summary\n\n[Title](https://example.com/a)");
  });

  it("DEFAULT_TEMPLATE degrades to a link note when content and description are empty", () => {
    const out = renderTemplate(DEFAULT_TEMPLATE, {
      content: "",
      description: "",
      title: "Title",
      url: "https://example.com/a",
    });
    expect(out).toBe("[Title](https://example.com/a)");
  });
});
