import { describe, expect, it } from "vitest";
import { browserMock } from "@/test/browser-mock";
import { renderHook, waitFor } from "@/test/render";
import { usePageCapture } from "../page-capture";

type CorpusCase = {
  name: string;
  head?: string;
  body: string;
  expectedDescription?: string;
};

const longParagraph = `A long article paragraph ${"continues with useful context ".repeat(40)}`.trim();

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
  },
  {
    name: "documentation structure",
    body: "<nav><p>Navigation documentation links that are not article content.</p></nav><main><h1>API</h1><p>This documentation paragraph explains the API clearly enough to become useful capture context.</p><pre><code>curl /api</code></pre></main>",
    expectedDescription: "This documentation paragraph explains the API clearly enough to become useful capture context.",
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
  it.each(corpus)("produces useful context or an intentional link fallback: $name", async (fixture) => {
    document.head.innerHTML = `<title>Corpus page</title>${fixture.head ?? ""}`;
    document.body.innerHTML = fixture.body;
    browserMock.tabs.query.mockResolvedValue([{ id: 7, title: "Corpus page", url: "https://example.com/corpus" }]);
    browserMock.scripting.executeScript.mockImplementation(async (options: unknown) => [
      { result: (options as { func: () => unknown }).func() },
    ]);

    const { result } = renderHook(() => usePageCapture());
    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current?.url).toBe("https://example.com/corpus");
    if (fixture.expectedDescription) {
      expect(result.current?.description).toBe(fixture.expectedDescription);
      expect(result.current?.fallbackReason).toBeUndefined();
    } else {
      expect(result.current?.description).toBeUndefined();
      expect(result.current?.fallbackReason).toBe("no-description");
    }
  });
});
