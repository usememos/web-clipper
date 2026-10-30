import { buttonClasses, Collapsible, Input, Select, Spinner } from "@usememos/ui";
import { ArrowLeftIcon, ExternalLinkIcon, FileTextIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import browser from "webextension-polyfill";
import { AppBrand } from "@/components/app-brand";
import type { ClipRecord } from "@/lib/clip-records";
import { formatDateTime, t, tp } from "@/lib/i18n";
import { sendBackgroundRequest } from "@/lib/runtime-client";

const FULL_TIMESTAMP: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const SHORT_TIMESTAMP: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
const SECTION_LABEL_CLASS = "mu-label";

function host(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function preview(record: ClipRecord): string {
  return (record.selection?.markdown || record.memoContent).replace(/\s+/g, " ").replace(/^>\s*/, "").trim();
}

function visibilityLabel(visibility: ClipRecord["visibility"]): string {
  return t(
    visibility === "PRIVATE"
      ? "commonPrivate"
      : visibility === "PROTECTED"
        ? "commonProtected"
        : visibility === "SPACE"
          ? "commonSpaceVisibility"
          : "commonPublic",
  );
}

function recordMatches(record: ClipRecord, query: string): boolean {
  if (!query) return true;
  return [record.sourceTitle, record.sourceUrl, record.selection?.markdown ?? "", record.memoContent, record.instanceUrl, record.memoName]
    .join("\n")
    .toLocaleLowerCase()
    .includes(query);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t py-2 first:border-t-0">
      <dt className="mu-caption text-mu-ink-muted">{label}</dt>
      <dd className="text-fact min-w-0 break-words text-mu-ink [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function ClipDetail({ record }: { record: ClipRecord }) {
  return (
    <article className="min-w-0 overflow-y-auto bg-mu-surface">
      <div className="mx-auto max-w-5xl px-5 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-fact truncate text-mu-ink-muted">{host(record.sourceUrl)}</p>
            <h2 className="mu-title mt-1">{record.sourceTitle || record.sourceUrl}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a className={buttonClasses({ size: "sm" })} href={record.sourceUrl} target="_blank" rel="noreferrer">
              {t("historyOpenSource")}
              <ExternalLinkIcon aria-hidden="true" />
            </a>
            <a className={buttonClasses({ variant: "primary", size: "sm" })} href={record.memoUrl} target="_blank" rel="noreferrer">
              {t("historyOpenMemo")}
              <ExternalLinkIcon aria-hidden="true" />
            </a>
          </div>
        </header>

        <div className="grid gap-7 pt-6 xl:grid-cols-[minmax(0,1fr)_17rem] xl:gap-8">
          <div className="min-w-0 space-y-6">
            {record.selection ? (
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className={SECTION_LABEL_CLASS}>{t("historySelection")}</h3>
                  {record.selection.imageCount ? (
                    <span className="mu-caption text-mu-ink-muted">{tp("historySelectedImages", record.selection.imageCount)}</span>
                  ) : null}
                </div>
                <pre className="mu-body max-h-56 overflow-auto whitespace-pre-wrap rounded-mu-md border-s-2 border-(--clip-highlight) bg-(--clip-highlight-wash)/35 px-4 py-3">
                  {record.selection.markdown || t("historyImageOnlySelection")}
                </pre>
              </section>
            ) : null}

            <section>
              <h3 className={`mb-2 ${SECTION_LABEL_CLASS}`}>{t("historyMemoContent")}</h3>
              <pre className="mu-body max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-mu-md border bg-mu-well/15 px-4 py-3">
                {record.memoContent}
              </pre>
            </section>
          </div>

          <aside className="border-t pt-5 xl:border-t-0 xl:border-s xl:ps-6 xl:pt-0">
            <section>
              <h3 className={`mb-1 ${SECTION_LABEL_CLASS}`}>{t("historyDetails")}</h3>
              <dl>
                <DetailRow label={t("historySourceUrl")} value={record.sourceUrl} />
                <DetailRow label={t("historyDestination")} value={record.instanceUrl} />
                <DetailRow label={t("popupVisibility")} value={visibilityLabel(record.visibility)} />
                {record.space ? <DetailRow label={t("historySpace")} value={record.spaceTitle ?? record.space} /> : null}
                <DetailRow label={t("historySavedAt")} value={formatDateTime(record.savedAt, FULL_TIMESTAMP)} />
              </dl>
            </section>

            <Collapsible.Root size="sm" className="mt-5 border-t pt-2">
              <Collapsible.Trigger>{t("historyTechnicalDetails")}</Collapsible.Trigger>
              <Collapsible.Panel>
                <dl className="mt-1 border-y">
                  <DetailRow label={t("historyRecordId")} value={record.id} />
                  <DetailRow label={t("historyDedupeKey")} value={record.dedupeKey} />
                  <DetailRow label={t("historyMemoName")} value={record.memoName} />
                </dl>
              </Collapsible.Panel>
            </Collapsible.Root>
          </aside>
        </div>
      </div>
    </article>
  );
}

export function ClipHistory() {
  const [records, setRecords] = useState<ClipRecord[] | null>(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void sendBackgroundRequest({ type: "LIST_CLIP_RECORDS" })
      .then((next) => {
        if (!active) return;
        setRecords(next);
      })
      .catch(() => {
        if (active) setRecords([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const destinations = useMemo(() => Array.from(new Set((records ?? []).map((record) => record.instanceUrl))).sort(), [records]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (records ?? []).filter(
      (record) => (destination === "all" || record.instanceUrl === destination) && recordMatches(record, normalizedQuery),
    );
  }, [destination, query, records]);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 sm:py-6">
      <header className="mb-5 flex items-center justify-between gap-4">
        <AppBrand size="md" sub={t("historyStoredLocally")} />
        <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={browser.runtime.getURL("src/options/index.html")}>
          <ArrowLeftIcon />
          {t("historySettings")}
        </a>
      </header>

      <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-2">
          <h1 className="mu-heading">{t("historyTitle")}</h1>
          {records ? <p className="mu-caption text-mu-ink-muted">{tp("historyCount", records.length)}</p> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="search"
            prefix={<SearchIcon aria-hidden="true" />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("historySearch")}
            aria-label={t("historySearch")}
            className="sm:w-64"
          />
          {destinations.length > 1 ? (
            <Select.Root
              items={{ all: t("historyAllDestinations"), ...Object.fromEntries(destinations.map((value) => [value, host(value)])) }}
              value={destination}
              onValueChange={(value) => setDestination(value ?? "all")}
            >
              <Select.Trigger aria-label={t("historyDestinationFilter")}>
                <Select.Value />
              </Select.Trigger>
              <Select.Popup>
                <Select.Item value="all">{t("historyAllDestinations")}</Select.Item>
                {destinations.map((value) => (
                  <Select.Item key={value} value={value}>
                    {host(value)}
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Root>
          ) : null}
        </div>
      </div>

      {records === null ? (
        <div className="mu-caption flex min-h-72 flex-1 items-center justify-center gap-2 text-mu-ink-muted">
          <Spinner label={t("commonLoading")} />
          {t("commonLoading")}
        </div>
      ) : records.length === 0 ? (
        <div className="flex min-h-80 flex-1 flex-col items-center justify-center rounded-mu-xl border border-dashed px-6 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-mu-full bg-mu-well text-mu-ink-muted">
            <FileTextIcon className="mu-icon" />
          </span>
          <p className="mu-title">{t("historyEmptyTitle")}</p>
          <p className="mu-body mt-1 max-w-sm text-mu-ink-muted">{t("historyEmptyDescription")}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mu-caption flex min-h-72 flex-1 items-center justify-center rounded-mu-xl border border-dashed text-mu-ink-muted">
          {t("historyNoResults")}
        </div>
      ) : (
        <div className="grid min-h-[32rem] flex-1 overflow-hidden rounded-mu-xl border bg-mu-surface md:h-[calc(100dvh-9.75rem)] md:flex-none md:grid-cols-[19rem_minmax(0,1fr)]">
          <nav
            aria-label={t("historyTitle")}
            className="max-h-80 overflow-y-auto border-b bg-mu-well/10 md:max-h-none md:border-e md:border-b-0"
          >
            {filtered.map((record) => {
              const active = selected?.id === record.id;
              return (
                <button
                  type="button"
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  className={`relative block w-full border-b px-3 py-2 text-start last:border-b-0 mu-focus hover:bg-mu-hover focus-visible:z-10 focus-visible:-outline-offset-2 ${
                    active ? "bg-mu-hover" : ""
                  }`}
                  aria-current={active ? "true" : undefined}
                >
                  {active ? <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-e-mu-sm bg-mu-primary" /> : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-fact truncate text-mu-ink-muted">{host(record.sourceUrl)}</span>
                    <span className="text-fact shrink-0 text-mu-ink-muted">{formatDateTime(record.savedAt, SHORT_TIMESTAMP)}</span>
                  </div>
                  <p className="mu-label truncate">{record.sourceTitle || record.sourceUrl}</p>
                  <p className="mu-caption line-clamp-2 text-mu-ink-muted">{preview(record)}</p>
                </button>
              );
            })}
          </nav>
          {selected ? <ClipDetail record={selected} /> : null}
        </div>
      )}
    </div>
  );
}
