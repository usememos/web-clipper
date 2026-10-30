import { Link } from "@usememos/ui";
import { CheckIcon, LockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { InlineStatus } from "@/components/inline-status";
import type { ConnectionSource } from "@/lib/connection-config";
import { describeSaveError, type SaveErrorKind } from "@/lib/errors";
import { t } from "@/lib/i18n";

type StepState = "done" | "active" | "locked";

/**
 * Done steps carry a success check, the active step is ink ("you are here"), and locked
 * steps are dashed outlines. The number is set in mono —
 * machine facts (step numbers, hosts, versions) share that voice across the page.
 */
export function StepRow({
  n,
  state,
  title,
  summary,
  children,
  last,
}: {
  n: number;
  state: StepState;
  title: string;
  summary?: ReactNode;
  children?: ReactNode;
  last?: boolean;
}) {
  const markBase = "mu-label-sm flex size-6 shrink-0 items-center justify-center rounded-mu-full border font-mu-mono";
  const mark =
    state === "done"
      ? "border-transparent bg-mu-success-soft text-mu-success"
      : state === "active"
        ? "border-transparent bg-mu-primary text-mu-on-primary"
        : "border-[1.5px] border-dashed border-mu-edge bg-transparent text-mu-ink-muted";

  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-x-3">
      <div className="flex flex-col items-center">
        <div className={`${markBase} ${mark}`}>
          {state === "done" ? <CheckIcon className="mu-icon mu-s-sm" /> : state === "locked" ? <LockIcon className="mu-icon mu-s-xs" /> : n}
        </div>
        {last ? null : <div className="my-1 w-px flex-1 bg-mu-line" />}
      </div>
      <div className="min-w-0 pb-8">
        <div className={`mu-title ${state === "locked" ? "text-mu-ink-muted" : ""}`}>{title}</div>
        {summary ? <div className="mu-body mt-1 flex flex-wrap items-center gap-2 text-mu-ink-muted">{summary}</div> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </div>
  );
}

export function HttpConnectionWarning() {
  return (
    <InlineStatus tone="warning" title={t("optionsHttpWarningTitle")}>
      {t("optionsHttpWarningBody")}
    </InlineStatus>
  );
}

export function ErrorNotice({
  kind,
  source,
  version,
  className,
}: {
  kind: SaveErrorKind;
  source?: ConnectionSource | null;
  version?: string | null;
  className?: string;
}) {
  const detail = describeSaveError(kind, source);
  // An instance that is too old needs an upgrade, not a repair: a warning, still announced at once.
  return (
    <InlineStatus className={className} tone={kind === "unsupported-version" ? "warning" : "danger"} role="alert" title={detail.title}>
      {kind === "unsupported-version" && version ? <p className="break-words">{t("errorUnsupportedRunningVersion", version)}</p> : null}
      <p>{detail.why}</p>
      <ul className="list-disc ps-4">
        {detail.howToFix.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      {detail.learnMore ? (
        <Link href={detail.learnMore.url} external>
          {detail.learnMore.label}
        </Link>
      ) : null}
    </InlineStatus>
  );
}
