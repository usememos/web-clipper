import { tags } from "@usememos/editor";
import { MarkdownEditor } from "@usememos/editor/react";
import "@usememos/editor/style.css";
import { textareaClasses } from "@usememos/ui";

// Memos' own note dialect: a single newline is a line break, `Title`⏎`---` is a paragraph and a
// divider, and #tags are highlighted. Module constants so the editor is never recreated on render.
export const MEMO_MARKDOWN = { breaks: true, setext: false };
export const MEMO_EXTENSIONS = [tags()];

// The editor reads @usememos/ui tokens, so light/dark follows the data-theme next-themes puts
// on <html>. 14/20 is ui's body text.
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
    mono: "var(--mu-font-mu-mono)",
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
    // The frame is a ui Textarea around the editor (textareaClasses), and scrolls internally so a
    // long clip never pushes Save off the fixed-height popup. ui draws the textarea ring on :focus
    // only; the editable element sits inside the frame, so focus-within adds the same ring.
    <div
      className={`${textareaClasses()} min-h-0 flex-1 resize-none overflow-y-auto focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mu-focus`}
    >
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
