const INLINE_TAGS = new Set([
  "A",
  "ABBR",
  "B",
  "BDI",
  "BDO",
  "CITE",
  "CODE",
  "DATA",
  "DEL",
  "DFN",
  "EM",
  "I",
  "INS",
  "KBD",
  "MARK",
  "Q",
  "RUBY",
  "S",
  "SAMP",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TIME",
  "U",
  "VAR",
]);

/**
 * `Range.cloneContents()` omits an inline ancestor when the selection sits wholly inside it.
 * Re-wrap the fragment up to the nearest block so links and emphasis survive Markdown conversion.
 */
function cloneRangePreservingInlineAncestors(range: Range): Node {
  let ancestor =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  let wrapped: Node = range.cloneContents();

  while (ancestor && INLINE_TAGS.has(ancestor.tagName)) {
    const clone = ancestor.cloneNode(false) as Element;
    clone.appendChild(wrapped);
    wrapped = clone;
    ancestor = ancestor.parentElement;
  }
  return wrapped;
}

/** Serializes the current selection's first range to an HTML string ("" when empty). */
export function selectionToHtml(selection: Selection | null): string {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  const container = document.createElement("div");
  container.appendChild(cloneRangePreservingInlineAncestors(selection.getRangeAt(0)));
  return container.innerHTML;
}
