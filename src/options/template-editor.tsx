import { Badge, Button, badgeClasses, Table, Textarea } from "@usememos/ui";
import { CheckIcon, LockIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { InlineStatus } from "@/components/inline-status";
import { UserBadge } from "@/components/user-badge";
import { DESCRIPTION_MAX_CHARS, TEMPLATE_VAR_NAMES, type TemplateVarName } from "@/lib/format";
import { t } from "@/lib/i18n";
import { DEFAULT_TEMPLATE, renderTemplate, splitTemplateTokens } from "@/lib/template";

// Record<TemplateVarName, …> keeps the preview in sync with the template engine.
// Tags are not a variable — default tags are literal #tags typed into the template body.
function previewVars(): Record<TemplateVarName, string> {
  return {
    content: t("templatePreviewContent"),
    title: t("templatePreviewTitle"),
    url: "https://example.com/post",
    description: t("templatePreviewDescription"),
  };
}

// The reference table's examples come from PREVIEW_VARS, so the table can never disagree
// with the live preview below it; `example` here is only for deliberate overrides.
function placeholderMeta(): Record<TemplateVarName, { meaning: string; source: string; example?: string }> {
  return {
    content: {
      meaning: t("templateContentMeaning"),
      source: t("templateContentSource"),
      example: t("templateContentExample"),
    },
    description: {
      meaning: t("templateDescriptionMeaning", DESCRIPTION_MAX_CHARS),
      source: t("templateDescriptionSource"),
    },
    title: {
      meaning: t("templateTitleMeaning"),
      source: t("templateTitleSource"),
    },
    url: {
      meaning: t("templateUrlMeaning"),
      source: t("templateUrlSource"),
    },
  };
}

/** A section title inside the step: ui's label style, set apart by space rather than size. */
const SECTION_LABEL_CLASS = "mu-label";

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
          <span key={i} className="rounded-mu-sm bg-(--clip-highlight-wash) text-(--clip-highlight-deep)">
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
const EDITOR_TEXT = "text-fact px-3 py-2";
function TemplateInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    // The wrapper paints the field's surface; the textarea stays transparent so the layer shows.
    <div className="relative rounded-mu-md bg-mu-surface">
      <div aria-hidden className={`pointer-events-none absolute inset-0 whitespace-pre-wrap break-words ${EDITOR_TEXT}`}>
        <HighlightedTemplate text={value} />
      </div>
      <Textarea
        aria-label={t("templateAriaLabel")}
        className={`relative field-sizing-content bg-transparent min-h-24 resize-none break-words text-transparent caret-mu-ink selection:bg-(--mu-selection) selection:text-transparent ${EDITOR_TEXT}`}
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
            <a href={url} target="_blank" rel="noreferrer" className="mu-label text-(--clip-highlight-deep) hover:underline">
              {part}
            </a>
            {host ? <span className="mu-caption ms-1 text-mu-ink-muted">{host}</span> : null}
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
      <blockquote key={`q${key}`} className="mu-body border-s-[3px] border-(--clip-highlight) ps-3">
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
      <p key={i} className="mu-body">
        <InlineMarkdown text={line} />
      </p>,
    );
  });
  flushQuote(lines.length);

  if (!blocks.length) {
    return <p className="mu-body text-mu-ink-muted">{t("templateEmptyPreview")}</p>;
  }
  return <div className="space-y-2">{blocks}</div>;
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
  const [saveFailed, setSaveFailed] = useState(false);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const previousInitial = useRef(initial);
  const localizedPreviewVars = previewVars();
  const localizedPlaceholderMeta = placeholderMeta();

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
      setSaveFailed(false);
      setExternalUpdate(false);
    } else {
      setExternalUpdate(true);
    }
  }, [draft, initial]);

  const dirty = draft !== initial;

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setSaveFailed(false);
    try {
      const useDefault = !draft.trim() || draft.trim() === DEFAULT_TEMPLATE.trim();
      await onSave(useDefault ? null : draft);
      if (useDefault) setDraft(DEFAULT_TEMPLATE);
      setSaved(true);
      setExternalUpdate(false);
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>{t("templateEditor")}</SectionLabel>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(DEFAULT_TEMPLATE);
              setSaved(false);
              setSaveFailed(false);
              setExternalUpdate(false);
            }}
          >
            {t("templateResetDefault")}
          </Button>
        </div>
        <TemplateInput
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setSaved(false);
            setSaveFailed(false);
          }}
        />
        <p className="mu-caption mt-2 text-mu-ink-muted">{t("templateHelp")}</p>
      </div>

      <div>
        <SectionLabel>{t("templatePlaceholderReference")}</SectionLabel>
        <Table.Root size="sm" className="mt-2 table-fixed" aria-label={t("templatePlaceholderReference")}>
          <Table.Header>
            <Table.Row>
              {(
                [
                  [t("templateColumnPlaceholder"), "w-[30%]"],
                  [t("templateColumnAdds"), "w-[40%]"],
                  [t("templateColumnSource"), "w-[30%]"],
                ] as const
              ).map(([label, width]) => (
                <Table.Head key={label} className={width}>
                  {label}
                </Table.Head>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {TEMPLATE_VAR_NAMES.map((name) => {
              const meta = localizedPlaceholderMeta[name];
              return (
                <Table.Row key={name}>
                  <Table.Cell className="align-top">
                    {/* A badge in the clipper's content color: the token reads as the mark it leaves in the template. */}
                    <code
                      className={`${badgeClasses()} bg-(--clip-highlight-wash) font-mu-mono text-(--clip-highlight-deep)`}
                    >{`{{${name}}}`}</code>
                  </Table.Cell>
                  <Table.Cell className="align-top">
                    <span className="block">{meta.meaning}</span>
                    <span className="block text-mu-ink-muted">{t("templateExample", meta.example ?? localizedPreviewVars[name])}</span>
                  </Table.Cell>
                  <Table.Cell muted className="align-top">
                    {meta.source}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </div>

      <div>
        <SectionLabel>{t("templatePreviewSection")}</SectionLabel>
        <div className="mt-2 rounded-mu-xl border bg-mu-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <UserBadge compact />
            <span className="mu-caption text-mu-ink-muted">{t("templateJustNow")}</span>
            <span className="flex-1" />
            <Badge tone="outline" icon={<LockIcon />}>
              {t("commonPrivate")}
            </Badge>
          </div>
          <MemoBody markdown={renderTemplate(draft, localizedPreviewVars)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" loading={busy} loadingLabel={t("commonSaving")} disabled={!dirty} onClick={save}>
          {t("templateSave")}
        </Button>
        <span aria-live="polite" className="mu-body">
          {saved ? (
            <span className="mu-label inline-flex items-center gap-1 text-mu-success">
              <CheckIcon aria-hidden="true" className="mu-icon mu-s-sm" />
              {t("templateSavedBrowser")}
            </span>
          ) : dirty ? (
            <span className="text-mu-ink-muted">{t("templateUnsavedChanges")}</span>
          ) : null}
        </span>
      </div>
      {externalUpdate ? (
        <InlineStatus
          tone="warning"
          action={
            <Button
              size="sm"
              onClick={() => {
                setDraft(initial);
                setSaved(false);
                setSaveFailed(false);
                setExternalUpdate(false);
              }}
            >
              {t("templateLoadSaved")}
            </Button>
          }
        >
          {t("templateExternalUpdate")}
        </InlineStatus>
      ) : null}
      {saveFailed || storageError ? (
        <p role="alert" className="mu-body text-mu-danger">
          {saveFailed ? t("templateSaveError") : storageError}
        </p>
      ) : null}
    </div>
  );
}
