import { tags } from "@usememos/editor";
import { MarkdownEditor } from "@usememos/editor/react";
import "@usememos/editor/style.css";

// Memos' own note dialect: a single newline is a line break, `Title`⏎`---` is a paragraph and a
// divider, and #tags are highlighted. Module constants so the editor is never recreated on render.
export const MEMO_MARKDOWN = { breaks: true, setext: false };
export const MEMO_EXTENSIONS = [tags()];

// The editor reads @usememos/ui tokens, so light/dark follows the data-theme next-themes puts
// on <html>. 14/20 matches the textarea's text-sm it replaces.
const THEME = {
  tokens: {
    colors: {
      text: "var(--mu-ink)",
      muted: "var(--mu-ink-muted)",
      // The frame below paints the field's background, as the textarea did.
      background: "transparent",
      accent: "var(--mu-accent)",
      codeBackground: "var(--mu-well)",
      border: "var(--mu-edge)",
      popupBackground: "var(--mu-surface)",
      popupBorder: "var(--mu-line)",
      hover: "var(--mu-hover)",
      danger: "var(--mu-danger)",
    },
    font: "inherit",
    mono: "var(--mu-font-mono)",
    fontSize: 14,
    lineHeight: 20,
    radius: "var(--mu-radius-md)",
  },
};

export function MemoEditor({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    // The frame looks like a ui Input (surface, edge, ui's focus ring), and scrolls internally
    // so a long clip never pushes Save off the fixed-height popup.
    <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-edge bg-surface px-2.5 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--mu-focus)">
      <MarkdownEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        attributes={{ "aria-label": label }}
        markdown={MEMO_MARKDOWN}
        extensions={MEMO_EXTENSIONS}
        theme={THEME}
        // Source mode: the memo stays visible as its Markdown text, with the syntax highlighted.
        // Rich mode can't edit a quoted clip (the default template's `> {{content}}`) as blocks,
        // and source mode also never loads the clipped page's images into the popup.
        mode="source"
        className="min-h-full"
      />
    </div>
  );
}
