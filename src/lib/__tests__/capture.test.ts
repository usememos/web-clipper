// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { selectionToHtml } from "@/lib/capture";

describe("selectionToHtml", () => {
  it("serializes a selection's range to HTML", () => {
    document.body.innerHTML = "<p id='p'>hello <b>world</b></p>";
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("p")!);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(selectionToHtml(sel)).toContain("<b>world</b>");
  });

  it("preserves inline ancestors around a partial selection", () => {
    document.body.innerHTML = '<p>Read <a href="https://example.com"><em>this link</em></a> now</p>';
    const text = document.querySelector("em")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    expect(selectionToHtml(sel)).toBe('<a href="https://example.com"><em>this</em></a>');
  });

  it("returns empty string when nothing is selected", () => {
    window.getSelection()!.removeAllRanges();
    expect(selectionToHtml(window.getSelection())).toBe("");
  });
});
