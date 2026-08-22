import { describe, expect, it } from "vitest";
import { browserMock } from "@/test/browser-mock";
import { renderHook, waitFor } from "@/test/render";
import { usePageCapture } from "../page-capture";

type CorpusCase = {
  name: string;
  head?: string;
  body: string;
  expectedDescription?: string;
  /** Whether the page has main content worth extracting. When false, the clip falls back to the description. */
  expectsArticle?: boolean;
  /** A phrase the extracted article must contain, and one it must not. */
  articleContains?: string;
  articleOmits?: string;
};

const longParagraph = `A long article paragraph ${"continues with useful context ".repeat(40)}`.trim();
const prose = (label: string) => `${label} ${"The paragraph continues with enough substance to read as body copy. ".repeat(8)}`.trim();

const corpus: CorpusCase[] = [
  {
    name: "blog with inline image and caption",
    head: '<meta name="description" content="A photo essay with captions and supporting context.">',
    body: '<article><figure><img src="https://cdn.example.com/photo.jpg"><figcaption>A descriptive caption.</figcaption></figure></article>',
    expectedDescription: "A photo essay with captions and supporting context.",
  },
  {
    name: "news metadata",
    head: '<meta property="og:description" content="A concise report about a current event.">',
    body: "<article><p>Article body that should lose to the publisher summary metadata.</p></article>",
    expectedDescription: "A concise report about a current event.",
  },
  {
    name: "long article",
    body: `<main><p>${longParagraph}</p></main>`,
    expectedDescription: longParagraph,
    expectsArticle: true,
    articleContains: "A long article paragraph",
  },
  {
    name: "news article with full page chrome",
    head: '<meta property="og:description" content="A concise report about a current event.">',
    body: `
      <nav><a href="/">Home</a><a href="/world">World</a></nav>
      <article>
        <h1>The Headline</h1>
        <p>${prose("Reporters described the scene at length.")}</p>
        <h2>Background</h2>
        <p>${prose("The history behind the event matters here.")}</p>
      </article>
      <aside><p>Sign up for our newsletter to receive more coverage like this every morning.</p></aside>
      <footer><p>Copyright the publisher, all rights reserved worldwide.</p></footer>`,
    expectedDescription: "A concise report about a current event.",
    expectsArticle: true,
    articleContains: "Reporters described the scene at length.",
    articleOmits: "newsletter",
  },
  {
    name: "documentation structure",
    body: "<nav><p>Navigation documentation links that are not article content.</p></nav><main><h1>API</h1><p>This documentation paragraph explains the API clearly enough to become useful capture context.</p><pre><code>curl /api</code></pre></main>",
    expectedDescription: "This documentation paragraph explains the API clearly enough to become useful capture context.",
  },
  {
    name: "documentation page with reference body",
    body: `
      <nav><p>Navigation documentation links that are not article content.</p></nav>
      <main>
        <h1>Clipping API</h1>
        <p>${prose("The endpoint accepts a serialized document.")}</p>
        <pre><code>POST /api/v1/clips</code></pre>
        <p>${prose("Responses carry the created memo.")}</p>
      </main>`,
    // No meta description, so the description falls back to the first readable paragraph.
    expectedDescription: prose("The endpoint accepts a serialized document."),
    expectsArticle: true,
    articleContains: "POST /api/v1/clips",
    articleOmits: "Navigation documentation links",
  },
  {
    name: "client-rendered application",
    body: '<div id="app"><main><p>This client-rendered view now contains a meaningful paragraph after hydration completes.</p></main></div>',
    expectedDescription: "This client-rendered view now contains a meaningful paragraph after hydration completes.",
  },
  {
    name: "navigation and card page",
    body: "<main><section><div>Card one</div><div>Card two</div></section></main>",
  },
  {
    name: "login-gated visible content",
    body: "<main><p>This visible introduction remains capturable even though the rest of the article requires an account.</p></main>",
    expectedDescription: "This visible introduction remains capturable even though the rest of the article requires an account.",
  },
  {
    name: "non-Latin article",
    body: "<main><p>这是一个用于测试网页剪藏器的中文段落，它包含足够多的可读内容，可以作为页面摘要安全地保存下来。</p></main>",
    expectedDescription: "这是一个用于测试网页剪藏器的中文段落，它包含足够多的可读内容，可以作为页面摘要安全地保存下来。",
  },
];

describe("fixed capture corpus", () => {
  it.each(corpus)("captures the best available content or an intentional fallback: $name", async (fixture) => {
    document.head.innerHTML = `<title>Corpus page</title>${fixture.head ?? ""}`;
    document.body.innerHTML = fixture.body;
    browserMock.tabs.query.mockResolvedValue([{ id: 7, title: "Corpus page", url: "https://example.com/corpus" }]);
    browserMock.scripting.executeScript.mockImplementation(async (options: unknown) => {
      const { func, args } = options as { func: (...a: unknown[]) => unknown; args?: unknown[] };
      return [{ result: func(...(args ?? [])) }];
    });

    const { result } = renderHook(() => usePageCapture());
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current?.url).toBe("https://example.com/corpus");
    expect(result.current?.description).toBe(fixture.expectedDescription);

    if (fixture.expectsArticle) {
      expect(result.current?.articleMarkdown).not.toBe("");
      if (fixture.articleContains) expect(result.current?.articleMarkdown).toContain(fixture.articleContains);
      if (fixture.articleOmits) expect(result.current?.articleMarkdown).not.toContain(fixture.articleOmits);
      // An extracted article is the complete result — there is nothing left to warn about.
      expect(result.current?.fallbackReason).toBeUndefined();
    } else {
      expect(result.current?.articleMarkdown).toBe("");
      expect(result.current?.fallbackReason).toBe(fixture.expectedDescription ? "no-article" : "no-description");
    }
  });
});
