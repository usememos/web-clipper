import { Editor } from "@usememos/editor";
import { describe, expect, it, vi } from "vitest";
import { composeMemoContent, htmlToMarkdown } from "@/lib/format";
import { render, screen } from "@/test/render";
import { MEMO_EXTENSIONS, MEMO_MARKDOWN, MemoEditor } from "../memo-editor";

// Representative clipped HTML: what Turndown hands the template, then the editor.
const pages = {
  prose:
    "<p>Plain paragraph with <strong>bold</strong>, <em>italic</em> and a <a href='https://example.com/a'>link</a>.</p><p>Second paragraph.</p>",
  structured:
    "<h2>Background</h2><p>Intro text.</p><ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul><ol><li>First</li><li>Second</li></ol><pre><code class='language-js'>const a = 1;\nconsole.log(a);</code></pre>",
  table:
    "<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr><tr><td>b | c</td><td>2</td></tr></tbody></table>",
  image:
    "<figure><img src='https://cdn.example.com/photo.jpg' alt='A photo' title='Shot'><figcaption>Caption.</figcaption></figure><p>After the image.</p>",
  escapes: "<p>Prices: $5 and $10. Use *stars* and _underscores_ literally. 1. Not a list. #hashtag-like</p>",
};

const templates = { default: null, plain: "{{content}}\n\n[{{title}}]({{url}}) #clip" };

function compose(html: string, template: string | null) {
  return composeMemoContent({
    bodyMarkdown: htmlToMarkdown(html),
    title: "Hello World",
    url: "https://example.com/post",
    description: "A short summary.",
    template,
  });
}

describe("MemoEditor", () => {
  it("shows the prefill as its Markdown source without emitting a change", async () => {
    const onChange = vi.fn();
    render(<MemoEditor value={compose(pages.prose, null)} onChange={onChange} label="Memo content" placeholder="Empty" />);

    const editor = await screen.findByRole("textbox", { name: "Memo content" });
    expect(editor).toHaveTextContent("> Plain paragraph with **bold**, _italic_ and a [link](https://example.com/a).");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(onChange).not.toHaveBeenCalled();
  });

  // The memo saves what the editor emits, so an untouched clip must come back byte for byte.
  for (const [pageName, html] of Object.entries(pages)) {
    for (const [templateName, template] of Object.entries(templates)) {
      it(`round-trips an unedited ${pageName} clip through the ${templateName} template`, () => {
        const markdown = compose(html, template);
        const element = document.createElement("div");
        const editor = new Editor({
          element,
          content: markdown,
          mode: "source",
          markdown: MEMO_MARKDOWN,
          extensions: MEMO_EXTENSIONS,
        });
        expect(editor.getMarkdown()).toBe(markdown);
        editor.destroy();
      });
    }
  }
});
