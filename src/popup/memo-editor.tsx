import { tags } from "@usememos/editor";
import { MarkdownEditor } from "@usememos/editor/react";
import "@usememos/editor/style.css";

// Memos' own note dialect: a single newline is a line break, `Title`⏎`---` is a paragraph and a
// divider, and #tags are highlighted. Module constants so the editor is never recreated on render.
export const MEMO_MARKDOWN = { breaks: true, setext: false };
export const MEMO_EXTENSIONS = [tags()];

// The editor follows the app's shadcn variables, so light/dark comes with the `.dark` class
// next-themes puts on <html>. 14/20 matches the textarea's text-sm it replaces.
const THEME = {
  tokens: {
    colors: {
      text: "var(--foreground)",
      muted: "var(--muted-foreground)",
      // The frame below paints the field's background, as the textarea did.
      background: "transparent",
      accent: "var(--primary)",
      codeBackground: "var(--muted)",
      border: "var(--border)",
      popupBackground: "var(--popover)",
      popupBorder: "var(--border)",
      hover: "var(--accent)",
      danger: "var(--destructive)",
    },
    font: "inherit",
    mono: "var(--font-mono)",
    fontSize: 14,
    lineHeight: 20,
    radius: "calc(var(--radius) - 2px)",
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
    // The frame owns the border and focus ring the textarea used to draw, and scrolls internally
    // so a long clip never pushes Save off the fixed-height popup.
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-input px-2.5 py-2 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
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
