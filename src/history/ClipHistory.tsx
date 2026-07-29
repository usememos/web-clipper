import { ArrowLeftIcon, ChevronDownIcon, ExternalLinkIcon, FileTextIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import browser from "webextension-polyfill";
import { AppBrand } from "@/components/app-brand";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ClipRecord } from "@/lib/clip-records";
import { t, tp } from "@/lib/i18n";
import { sendBackgroundRequest } from "@/lib/runtime-client";

const FULL_TIMESTAMP = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const SHORT_TIMESTAMP = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const SECTION_LABEL_CLASS = "font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-muted-foreground";

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
  return t(visibility === "PRIVATE" ? "commonPrivate" : visibility === "PROTECTED" ? "commonProtected" : "commonPublic");
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
    <div className="border-t py-2.5 first:border-t-0">
      <dt className="text-[11px] leading-4 text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-words font-mono text-[12px] leading-5 text-foreground/85 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function ClipDetail({ record }: { record: ClipRecord }) {
  return (
    <article className="min-w-0 overflow-y-auto bg-card">
      <div className="mx-auto max-w-5xl px-5 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-mono text-[12px] leading-4 text-muted-foreground">{host(record.sourceUrl)}</p>
            <h2 className="mt-1.5 text-[22px] font-semibold leading-7 tracking-[-0.025em]">{record.sourceTitle || record.sourceUrl}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <a className={buttonVariants({ variant: "outline", size: "sm" })} href={record.sourceUrl} target="_blank" rel="noreferrer">
              {t("historyOpenSource")}
              <ExternalLinkIcon />
            </a>
            <a className={buttonVariants({ variant: "default", size: "sm" })} href={record.memoUrl} target="_blank" rel="noreferrer">
              {t("historyOpenMemo")}
              <ExternalLinkIcon />
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
                    <span className="text-[11px] text-muted-foreground">{tp("historySelectedImages", record.selection.imageCount)}</span>
                  ) : null}
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border-s-2 border-highlight bg-highlight-wash/35 px-4 py-3 font-sans text-[13px] leading-[1.65]">
                  {record.selection.markdown || t("historyImageOnlySelection")}
                </pre>
              </section>
            ) : null}

            <section>
              <h3 className={`mb-2 ${SECTION_LABEL_CLASS}`}>{t("historyMemoContent")}</h3>
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/15 px-4 py-3.5 font-sans text-[13px] leading-[1.65]">
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
                <DetailRow label={t("historySavedAt")} value={FULL_TIMESTAMP.format(record.savedAt)} />
              </dl>
            </section>

            <details className="group mt-5 border-t pt-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-2.5 text-[12px] font-medium marker:hidden">
                {t("historyTechnicalDetails")}
                <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <dl className="border-y">
                <DetailRow label={t("historyRecordId")} value={record.id} />
                <DetailRow label={t("historyDedupeKey")} value={record.dedupeKey} />
                <DetailRow label={t("historyMemoName")} value={record.memoName} />
              </dl>
            </details>
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
        <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={browser.runtime.getURL("src/options/index.html")}>
          <ArrowLeftIcon />
          {t("historySettings")}
        </a>
      </header>

      <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.025em]">{t("historyTitle")}</h1>
          {records ? <p className="text-[12px] text-muted-foreground">{tp("historyCount", records.length)}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <label className="relative block">
            <SearchIcon aria-hidden="true" className="absolute start-2.5 top-2 size-3.5 text-muted-foreground" />
            <span className="sr-only">{t("historySearch")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("historySearch")}
              className="h-8 w-full rounded-md border border-input bg-background ps-8 pe-3 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-64"
            />
          </label>
          {destinations.length > 1 ? (
            <select
              aria-label={t("historyDestinationFilter")}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">{t("historyAllDestinations")}</option>
              {destinations.map((value) => (
                <option key={value} value={value}>
                  {host(value)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {records === null ? (
        <div className="flex min-h-72 flex-1 items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Spinner />
          {t("commonLoading")}
        </div>
      ) : records.length === 0 ? (
        <div className="flex min-h-80 flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-highlight-wash text-highlight-deep">
            <FileTextIcon className="size-5" />
          </span>
          <p className="text-[14px] font-medium">{t("historyEmptyTitle")}</p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{t("historyEmptyDescription")}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-72 flex-1 items-center justify-center rounded-xl border border-dashed text-[13px] text-muted-foreground">
          {t("historyNoResults")}
        </div>
      ) : (
        <div className="grid min-h-[32rem] flex-1 overflow-hidden rounded-xl border bg-card shadow-xs md:h-[calc(100dvh-9.75rem)] md:flex-none md:grid-cols-[19rem_minmax(0,1fr)]">
          <nav
            aria-label={t("historyTitle")}
            className="max-h-80 overflow-y-auto border-b bg-muted/10 md:max-h-none md:border-e md:border-b-0"
          >
            {filtered.map((record) => {
              const active = selected?.id === record.id;
              return (
                <button
                  type="button"
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  className={`relative block w-full border-b px-3.5 py-2.5 text-start last:border-b-0 hover:bg-muted/45 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    active ? "bg-highlight-wash/55" : ""
                  }`}
                  aria-current={active ? "true" : undefined}
                >
                  {active ? <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-e bg-highlight-deep" /> : null}
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="truncate font-mono text-[11px] leading-4 text-muted-foreground">{host(record.sourceUrl)}</span>
                    <span className="shrink-0 font-mono text-[10px] leading-4 text-muted-foreground">
                      {SHORT_TIMESTAMP.format(record.savedAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] font-medium leading-5">{record.sourceTitle || record.sourceUrl}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.45] text-muted-foreground">{preview(record)}</p>
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
