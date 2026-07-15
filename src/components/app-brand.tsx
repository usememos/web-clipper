/**
 * Brand lockup: the extension's parrot mark plus a lowercase wordmark. `sub` adds a
 * status line under the wordmark (options page); the popup omits it and uses the
 * compact size to fit its slim toolbar.
 */
export function AppBrand({ sub, size = "sm" }: { sub?: string; size?: "sm" | "md" }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img src="/icons/icon-128.png" alt="" className={size === "md" ? "size-8 rounded-full" : "size-5 rounded-full"} />
      <span className="min-w-0">
        <span className={`block leading-tight font-semibold tracking-tight ${size === "md" ? "text-[15px]" : "text-sm"}`}>
          memos web clipper
        </span>
        {sub ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  );
}
