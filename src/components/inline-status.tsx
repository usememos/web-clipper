import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import type { AriaRole, ReactNode } from "react";

type Tone = "danger" | "warning" | "success";

const TONES: Record<Tone, { box: string; accent: string; icon: typeof CircleAlertIcon }> = {
  danger: { box: "bg-danger-soft", accent: "text-danger", icon: CircleAlertIcon },
  warning: { box: "bg-warning-soft", accent: "text-warning", icon: TriangleAlertIcon },
  success: { box: "bg-success-soft", accent: "text-success", icon: CircleCheckIcon },
};

/**
 * A status that stays in place until it's acted on: an icon, an optional title, the text, and the
 * fix as a Button in `action`. @usememos/ui has no Alert yet, so this is the clipper's stand-in.
 * Errors are announced at once (`role="alert"`); anything else is a polite status.
 */
export function InlineStatus({
  tone,
  title,
  children,
  action,
  role = tone === "danger" ? "alert" : "status",
  className = "",
}: {
  tone: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: AriaRole;
  className?: string;
}) {
  const { box, accent, icon: Icon } = TONES[tone];
  return (
    <div role={role} className={`grid grid-cols-[auto_1fr] gap-x-2 rounded-lg p-3 text-sm text-ink ${box} ${className}`}>
      <Icon aria-hidden="true" className={`mu-icon mt-0.5 ${accent}`} />
      <div className="min-w-0 space-y-1">
        {title ? <div className={`font-medium ${accent}`}>{title}</div> : null}
        {children ? <div className="space-y-1 break-words">{children}</div> : null}
        {action ? <div className="flex flex-wrap items-center gap-2 pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
