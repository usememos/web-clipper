import { MemosLockup } from "@/components/memos-lockup";

/** Official Memos lockup with a separate extension label and optional status line. */
export function AppBrand({ sub, size = "sm" }: { sub?: string; size?: "sm" | "md" }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex flex-wrap items-center gap-x-1">
        <MemosLockup className={size === "md" ? "h-[30px] w-auto shrink-0" : "h-6 w-auto shrink-0"} />
        <span className="mu-label-sm whitespace-nowrap text-mu-ink-muted">Web Clipper</span>
      </span>
      {sub ? <span className="mu-caption block truncate text-mu-ink-muted">{sub}</span> : null}
    </span>
  );
}
