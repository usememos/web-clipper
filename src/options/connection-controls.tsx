import { CheckIcon, ExternalLinkIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ConnectionSource } from "@/lib/connection-config";
import { describeSaveError, type SaveErrorKind } from "@/lib/errors";

type StepState = "done" | "active" | "locked";

/**
 * One color per meaning: done steps are ink, the active step is the page's only amber
 * mark ("you are here"), locked steps are dashed outlines. The number is set in mono —
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
  const markBase = "flex size-6.5 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold";
  const mark =
    state === "done"
      ? "border-transparent bg-primary text-primary-foreground"
      : state === "active"
        ? "border-transparent bg-highlight text-highlight-foreground ring-4 ring-highlight-wash"
        : "border-[1.5px] border-dashed border-input bg-transparent text-muted-foreground";

  return (
    <div className="grid grid-cols-[1.625rem_1fr] gap-x-3.5">
      <div className="flex flex-col items-center">
        <div className={`${markBase} ${mark}`}>
          {state === "done" ? <CheckIcon className="size-3.5" /> : state === "locked" ? <LockIcon className="size-3" /> : n}
        </div>
        {last ? null : <div className="my-1.5 w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 pb-8">
        <div
          className={`text-base leading-6.5 tracking-[-0.01em] ${state === "locked" ? "font-medium text-muted-foreground" : "font-semibold"}`}
        >
          {title}
        </div>
        {summary ? <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{summary}</div> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </div>
  );
}

export function ErrorNotice({ kind, source, className }: { kind: SaveErrorKind; source?: ConnectionSource | null; className?: string }) {
  const detail = describeSaveError(kind, source);
  const danger = kind !== "unsupported-version";
  return (
    <Alert className={className} variant={danger ? "destructive" : "default"}>
      <TriangleAlertIcon />
      <AlertTitle>{detail.title}</AlertTitle>
      <AlertDescription>
        <p>{detail.why}</p>
        <ul className="list-disc pl-4">
          {detail.howToFix.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        {detail.learnMore ? (
          <a href={detail.learnMore.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium">
            {detail.learnMore.label}
            <ExternalLinkIcon />
          </a>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
