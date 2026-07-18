import { CheckIcon, LockIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserBadge } from "@/components/user-badge";
import { DESCRIPTION_MAX_CHARS, TEMPLATE_VAR_NAMES, type TemplateVarName } from "@/lib/format";
import { DEFAULT_TEMPLATE, renderTemplate, splitTemplateTokens } from "@/lib/template";

// Record<TemplateVarName, …> keeps the preview in sync with the template engine.
// Tags are not a variable — default tags are literal #tags typed into the template body.
const PREVIEW_VARS: Record<TemplateVarName, string> = {
  content: "> The quick brown fox jumps over the lazy dog.",
  title: "Example Article",
  url: "https://example.com/post",
  description: "A short summary of the page.",
};

// The reference table's examples come from PREVIEW_VARS, so the table can never disagree
// with the live preview below it; `example` here is only for deliberate overrides.
const PLACEHOLDER_META: Record<TemplateVarName, { meaning: string; source: string; example?: string }> = {
  content: {
    meaning: "Selected text as quoted Markdown",
    source: "Your selection on the page",
    example: "> The quick brown fox…",
  },
  description: {
    meaning: `Page summary, up to ${DESCRIPTION_MAX_CHARS} characters`,
    source: "Open Graph → meta description → first readable paragraph",
  },
  title: {
    meaning: "Page title, or URL as fallback",
    source: "Browser tab → document title",
  },
  url: {
    meaning: "Exact page address",
    source: "Current browser tab",
  },
};

/** The micro-label voice, shared by section labels and the reference table's headers. */
const SECTION_LABEL_CLASS = "font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase text-muted-foreground";

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={SECTION_LABEL_CLASS}>{children}</div>;
}

/** The editor text with {{tokens}} wrapped for the amber wash — rendered in the overlay layer. */
function HighlightedTemplate({ text }: { text: string }) {
  return (
    <>
      {/* splitTemplateTokens interleaves segments: odd indices are whole tokens */}
      {splitTemplateTokens(text).map((part, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by construction
          <span key={i} className="rounded-sm bg-highlight-wash text-highlight-deep">
            {part}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by construction
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * A textarea with a highlight layer painted behind it: both layers render the same string
 * with identical box metrics and font, the textarea's own glyphs are transparent, and the
 * caret/selection stay native. field-sizing-content keeps the textarea unscrollable, so
 * the layers can never drift.
 */
const EDITOR_TEXT = "px-2.5 py-2 font-mono text-xs leading-relaxed";
function TemplateInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-lg border border-transparent whitespace-pre-wrap break-words ${EDITOR_TEXT}`}
      >
        <HighlightedTemplate text={value} />
      </div>
      <Textarea
        aria-label="Template"
        className={`relative min-h-24 break-words text-transparent caret-foreground selection:bg-highlight/25 selection:text-transparent md:text-xs ${EDITOR_TEXT}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </div>
  );
}

/** Inline renderer for the one markdown form templates produce: [text](url), shown with its host. */
function InlineMarkdown({ text }: { text: string }) {
  // Split on capture groups (same trick as HighlightedTemplate): segments repeat as
  // [plain, label, url, plain, ...] — index % 3 says which role a segment plays.
  const parts = text.split(/\[([^\]]+)\]\(([^)\s]+)\)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 3 === 2) return null; // the url — consumed by its label's segment below
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by construction
        if (i % 3 === 0) return <Fragment key={i}>{part}</Fragment>;
        const url = parts[i + 1] ?? "";
        let host = "";
        try {
          host = new URL(url).host;
        } catch {
          // not a URL — the anchor still renders, just without a host hint
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional by construction
          <Fragment key={i}>
            <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-highlight-deep hover:underline">
              {part}
            </a>
            {host ? <span className="ml-1.5 text-xs text-muted-foreground">{host}</span> : null}
          </Fragment>
        );
      })}
    </>
  );
}

/** Renders the composed memo the way Memos will: quotes as quotes, links as links. */
function MemoBody({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let quote: string[] = [];

  const flushQuote = (key: number) => {
    if (!quote.length) return;
    blocks.push(
      <blockquote key={`q${key}`} className="border-l-[3px] border-highlight pl-3 text-sm leading-relaxed">
        {quote.map((q, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: quote lines are positional
          <p key={i}>
            <InlineMarkdown text={q} />
          </p>
        ))}
      </blockquote>,
    );
    quote = [];
  };

  lines.forEach((line, i) => {
    if (line.startsWith("> ") || line === ">") {
      quote.push(line.replace(/^> ?/, ""));
      return;
    }
    flushQuote(i);
    if (!line.trim()) return;
    blocks.push(
      // biome-ignore lint/suspicious/noArrayIndexKey: preview lines are positional and re-render wholesale
      <p key={i} className="text-sm leading-relaxed">
        <InlineMarkdown text={line} />
      </p>,
    );
  });
  flushQuote(lines.length);

  if (!blocks.length) {
    return <p className="text-sm text-muted-foreground">Nothing to preview — the template is empty.</p>;
  }
  return <div className="space-y-2.5">{blocks}</div>;
}

export function TemplateEditor({
  initial,
  onSave,
  storageError,
}: {
  initial: string;
  onSave: (template: string | null) => Promise<void>;
  storageError?: string | null;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const previousInitial = useRef(initial);

  useEffect(() => {
    if (previousInitial.current === initial) return;
    const previous = previousInitial.current;
    previousInitial.current = initial;
    // Adopt external changes only while this editor is clean. If another options page saves
    // while this page has a draft, preserve the draft and make the conflict explicit.
    if (draft === initial) {
      setExternalUpdate(false);
    } else if (draft === previous) {
      setDraft(initial);
      setSaved(false);
      setSaveError(null);
      setExternalUpdate(false);
    } else {
      setExternalUpdate(true);
    }
  }, [draft, initial]);

  const dirty = draft !== initial;

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setSaveError(null);
    try {
      const useDefault = !draft.trim() || draft.trim() === DEFAULT_TEMPLATE.trim();
      await onSave(useDefault ? null : draft);
      if (useDefault) setDraft(DEFAULT_TEMPLATE);
      setSaved(true);
      setExternalUpdate(false);
    } catch {
      setSaveError("The template wasn't saved. Your draft is still here—try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Editor</SectionLabel>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(DEFAULT_TEMPLATE);
              setSaved(false);
              setSaveError(null);
              setExternalUpdate(false);
            }}
          >
            Reset to default
          </Button>
        </div>
        <TemplateInput
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
            setSaveError(null);
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Every clip is composed through this template before it reaches the editor. Plain text — including{" "}
          <span className="font-mono text-foreground/80">#tags</span> — is kept as written.
        </p>
      </div>

      <div>
        <SectionLabel>Placeholder reference</SectionLabel>
        <table className="mt-2 w-full table-fixed text-left text-xs">
          <thead>
            <tr className="border-b border-input">
              {(
                [
                  ["Placeholder", "w-[30%]"],
                  ["What it adds", "w-[40%]"],
                  ["Captured from", "w-[30%]"],
                ] as const
              ).map(([label, width]) => (
                <th key={label} className={`${width} px-1 py-2 ${SECTION_LABEL_CLASS}`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_VAR_NAMES.map((name) => {
              const meta = PLACEHOLDER_META[name];
              return (
                <tr key={name} className="border-b align-top last:border-b-0">
                  <td className="px-1 py-2.5">
                    <code className="inline-flex whitespace-nowrap rounded-md bg-highlight-wash px-2 py-1 font-mono text-xs text-highlight-deep">
                      {`{{${name}}}`}
                    </code>
                  </td>
                  <td className="px-1 py-2.5">
                    <span className="block leading-4.5 text-foreground">{meta.meaning}</span>
                    <span className="mt-0.5 block leading-4.5 text-muted-foreground">Example: {meta.example ?? PREVIEW_VARS[name]}</span>
                  </td>
                  <td className="px-1 py-2.5 leading-4.5 text-muted-foreground">{meta.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <SectionLabel>Preview — how it lands in Memos</SectionLabel>
        <div className="mt-2 rounded-xl border bg-card p-4 shadow-xs">
          <div className="mb-2.5 flex items-center gap-2">
            <UserBadge compact />
            <span className="text-xs text-muted-foreground">just now</span>
            <span className="flex-1" />
            <Badge variant="outline" className="text-muted-foreground">
              <LockIcon className="size-2.5" />
              Private
            </Badge>
          </div>
          <MemoBody markdown={renderTemplate(draft, PREVIEW_VARS)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving…" : "Save template"}
        </Button>
        <span aria-live="polite" className="text-sm">
          {saved ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <CheckIcon className="size-3.5" />
              Saved in this browser
            </span>
          ) : dirty ? (
            <span className="text-muted-foreground">Unsaved changes</span>
          ) : null}
        </span>
      </div>
      {externalUpdate ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <span>A different settings page saved another template. Your unsaved draft is still here.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(initial);
              setSaved(false);
              setSaveError(null);
              setExternalUpdate(false);
            }}
          >
            Load saved version
          </Button>
        </div>
      ) : null}
      {saveError || storageError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError ?? storageError}
        </p>
      ) : null}
    </div>
  );
}
