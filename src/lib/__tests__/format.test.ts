// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { composeMemoContent, htmlToMarkdown, toQuotedMarkdown } from "@/lib/format";

describe("htmlToMarkdown", () => {
  it("converts basic HTML to markdown", () => {
    expect(htmlToMarkdown("<h1>Hi</h1><p>a <strong>b</strong></p>")).toContain("# Hi");
    expect(htmlToMarkdown("<a href='https://x.com'>x</a>")).toBe("[x](https://x.com)");
  });

  it("preserves the MVP selection structures as readable Markdown", () => {
    const markdown = htmlToMarkdown(`
      <h2>Heading</h2>
      <p>A <a href="https://example.com">linked <em>emphasis</em></a> and <strong>strong text</strong>.</p>
      <ul><li>First</li><li>Second</li></ul>
      <blockquote><p>Quoted text</p></blockquote>
      <pre><code class="language-ts">const value = 1;</code></pre>
    `);
    expect(markdown).toContain("## Heading");
    expect(markdown).toContain("[linked _emphasis_](https://example.com)");
    expect(markdown).toContain("**strong text**");
    expect(markdown).toMatch(/-\s+First/);
    expect(markdown).toContain("> Quoted text");
    expect(markdown).toContain("```ts");
  });
  it("returns empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });
  it("converts tables to GFM markdown tables", () => {
    const out = htmlToMarkdown(
      "<table><thead><tr><th>Name</th><th>Age</th></tr></thead><tbody><tr><td>Ada</td><td>36</td></tr></tbody></table>",
    );
    expect(out).toContain("| Name | Age |");
    expect(out).toContain("| Ada | 36 |");
  });
});

describe("toQuotedMarkdown", () => {
  it("prefixes every line, keeping blank separators as bare markers", () => {
    expect(toQuotedMarkdown("# Hi\n\nBody text")).toBe("> # Hi\n>\n> Body text");
  });
  it("returns empty string for blank input", () => {
    expect(toQuotedMarkdown("  \n ")).toBe("");
  });
});

describe("composeMemoContent", () => {
  it("renders the default template: content, description, then source link", () => {
    const out = composeMemoContent({
      bodyMarkdown: "> Some quote",
      title: "Title",
      url: "https://example.com/a",
      description: "A summary",
    });
    expect(out).toBe("> Some quote\n\nA summary\n\n[Title](https://example.com/a)");
  });

  it("degrades to a plain link note when there is no content and no description", () => {
    const out = composeMemoContent({ bodyMarkdown: "", title: "T", url: "https://e.com" });
    expect(out).toBe("[T](https://e.com)");
  });

  it("caps an oversized description at 500 characters", () => {
    const out = composeMemoContent({
      bodyMarkdown: "",
      title: "T",
      url: "https://e.com",
      description: "x".repeat(900),
    });
    expect(out).toContain("x".repeat(500));
    expect(out).not.toContain("x".repeat(501));
  });

  it("keeps literal template tags — the extension-level default tags", () => {
    const out = composeMemoContent({
      bodyMarkdown: "Body",
      title: "T",
      url: "https://e.com",
      template: "{{content}}\n\n[{{title}}]({{url}}) #clippings",
    });
    expect(out).toContain("#clippings");
  });

  it("drops template lines whose variables are missing", () => {
    const out = composeMemoContent({
      bodyMarkdown: "Body",
      title: "T",
      url: "https://e.com",
      template: "{{content}}\n{{description}} ·",
    });
    expect(out).toBe("Body");
  });

  it("renders a legacy {{tags}} variable as empty without leaving debris", () => {
    const out = composeMemoContent({
      bodyMarkdown: "Body",
      title: "T",
      url: "https://e.com",
      template: "{{content}}\n\n[{{title}}]({{url}}) {{tags}}",
    });
    expect(out).toBe("Body\n\n[T](https://e.com)");
  });
});
