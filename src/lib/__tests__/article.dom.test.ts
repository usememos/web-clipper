import { describe, expect, it } from "vitest";
import { extractArticle, MIN_ARTICLE_CHARS } from "../article";

const PAGE_URL = "https://example.com/posts/how-clippers-work";

const prose = (label: string, times = 8) =>
  `${label} ${"Additional sentences give the extractor enough weight to score this block. ".repeat(times)}`.trim();

function page(body: string, head = ""): string {
  return `<!doctype html><html><head><title>How Clippers Work | Example Blog</title>${head}</head><body>${body}</body></html>`;
}

const ARTICLE_BODY = `
  <nav><a href="/">Home</a><a href="/archive">Archive</a></nav>
  <header><h1>How Clippers Work</h1></header>
  <article>
    <p>${prose("Deciding what counts as content is the whole problem.")}</p>
    <h2>Extraction</h2>
    <p>${prose("The readability pass is the heart of it.")}</p>
    <ul><li>Extraction decides what on the page counts as the content.</li><li>Transformation converts that HTML into Markdown.</li><li>Routing picks where the result is stored.</li></ul>
    <pre><code>const clipped = true;</code></pre>
    <table><thead><tr><th>Mode</th><th>Kept</th></tr></thead><tbody><tr><td>Article</td><td>Yes</td></tr></tbody></table>
  </article>
  <aside><p>Related reading that has no business appearing inside the clipped article body.</p></aside>
  <footer><p>Copyright notice that is likewise not part of the article.</p></footer>
`;

describe("extractArticle", () => {
  it("returns the article body as markdown and drops page chrome", async () => {
    const markdown = await extractArticle(page(ARTICLE_BODY), PAGE_URL);

    expect(markdown).not.toBeNull();
    expect(markdown).toContain("Deciding what counts as content is the whole problem.");
    expect(markdown).toContain("The readability pass is the heart of it.");
    expect(markdown).not.toContain("Related reading");
    expect(markdown).not.toContain("Copyright notice");
    expect(markdown).not.toContain("Archive");
  });

  it("preserves the markdown structures the clipper already converts", async () => {
    const markdown = (await extractArticle(page(ARTICLE_BODY), PAGE_URL)) ?? "";

    expect(markdown).toContain("## Extraction");
    expect(markdown).toContain("-   Extraction decides what on the page counts as the content.");
    expect(markdown).toContain("const clipped = true;");
    expect(markdown).toContain("| Mode | Kept |");
  });

  it("drops images rather than hotlinking them, but keeps their captions", async () => {
    const withFigure = page(`
      <article>
        <p>${prose("An illustrated article.")}</p>
        <figure><img src="/img/diagram.png" alt="A diagram"><figcaption>The extraction pipeline.</figcaption></figure>
      </article>
    `);
    const markdown = (await extractArticle(withFigure, PAGE_URL)) ?? "";

    expect(markdown).not.toContain("diagram.png");
    expect(markdown).not.toMatch(/!\[/);
    expect(markdown).toContain("The extraction pipeline.");
  });

  it("resolves relative links against the page, not the extension origin", async () => {
    const withLink = page(`<article><p>${prose('See the <a href="/appendix">appendix</a> for detail.')}</p></article>`);
    const markdown = (await extractArticle(withLink, PAGE_URL)) ?? "";

    expect(markdown).toContain("https://example.com/appendix");
    expect(markdown).not.toContain("chrome-extension");
  });

  it("honors a base element the page declared itself", async () => {
    const withBase = page(
      `<article><p>${prose('See the <a href="appendix">appendix</a>.')}</p></article>`,
      '<base href="https://cdn.example.com/docs/">',
    );
    const markdown = (await extractArticle(withBase, PAGE_URL)) ?? "";

    expect(markdown).toContain("https://cdn.example.com/docs/appendix");
  });

  it("makes a relative base element absolute before using it", async () => {
    const relativeBase = page(`<article><p>${prose('See the <a href="appendix">appendix</a>.')}</p></article>`, '<base href="/docs/">');
    const markdown = (await extractArticle(relativeBase, PAGE_URL)) ?? "";

    expect(markdown).toContain("https://example.com/docs/appendix");
    expect(markdown).not.toContain("chrome-extension");
  });

  it("returns null for a page whose main content is too thin to be an article", async () => {
    expect(await extractArticle(page("<main><section><div>Card one</div><div>Card two</div></section></main>"), PAGE_URL)).toBeNull();
  });

  it("returns null rather than a fragment just under the useful threshold", async () => {
    const stub = page(`<article><p>${"x".repeat(MIN_ARTICLE_CHARS - 50)}</p></article>`);
    expect(await extractArticle(stub, PAGE_URL)).toBeNull();
  });

  it("returns null for empty or blank input", async () => {
    expect(await extractArticle("", PAGE_URL)).toBeNull();
    expect(await extractArticle("   \n  ", PAGE_URL)).toBeNull();
  });

  it("resolves rather than rejecting on malformed markup or a malformed page URL", async () => {
    await expect(extractArticle("<html><body><div><p>unclosed", PAGE_URL)).resolves.toBeDefined();
    await expect(extractArticle(page(ARTICLE_BODY), "not a url")).resolves.toBeDefined();
  });

  it("extracts non-Latin articles", async () => {
    const chinese = "这是一个用于测试网页剪藏器的中文段落，它包含足够多的可读内容，可以作为页面正文安全地保存下来。".repeat(6);
    expect(await extractArticle(page(`<article><p>${chinese}</p></article>`), PAGE_URL)).toContain("网页剪藏器");
  });
});
