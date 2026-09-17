import browser from "webextension-polyfill";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { aiErrorMessage } from "@/lib/ai-errors";
import { t } from "@/lib/i18n";
import type { useClipper } from "./use-clipper";

export function AiNotice({ clipper: c }: { clipper: ReturnType<typeof useClipper> }) {
  if (c.ai.status === "off" || c.ai.status === "loading") return null;
  return (
    <div className="shrink-0 space-y-1.5 rounded-lg border bg-muted/30 px-2.5 py-2 text-xs">
      <div role="status" className="flex items-start gap-2 leading-4">
        {c.ai.status === "generating" ? <Spinner className="mt-0.5 size-3 shrink-0" /> : null}
        <span>
          {c.ai.status === "generating"
            ? t("aiGenerating")
            : c.ai.status === "error" && c.ai.error
              ? aiErrorMessage(c.ai.error)
              : c.ai.status === "idle"
                ? t("aiIdle")
                : t(c.aiApplied ? (c.ai.fromCache ? "aiReused" : "aiApplied") : "aiReady")}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {c.ai.status === "generating" ? (
          <Button variant="ghost" size="sm" onClick={c.ai.cancel}>
            {t("commonCancel")}
          </Button>
        ) : c.ai.status === "idle" || c.ai.status === "ready" ? (
          <Button variant="ghost" size="sm" disabled={c.busy} onClick={c.ai.retry}>
            {t(c.ai.clip ? "aiRegenerate" : "aiGenerate")}
          </Button>
        ) : null}
        {c.canUndoAi ? (
          <Button variant="ghost" size="sm" disabled={c.busy} onClick={c.undoAi}>
            {t("aiUndo")}
          </Button>
        ) : null}
      </div>
      {c.ai.status === "error" ? (
        <div className="flex gap-2">
          {c.ai.error !== "no-content" && c.ai.error !== "too-long" ? (
            <Button variant="ghost" size="sm" disabled={c.busy} onClick={c.ai.retry}>
              {t("commonTryAgain")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void browser.runtime.openOptionsPage()}>
            {t("commonOpenSettings")}
          </Button>
        </div>
      ) : null}
      {c.ai.clip ? (
        <div className="space-y-1">
          <details>
            <summary className="cursor-pointer py-1 font-medium">{t("aiReview")}</summary>
            <Textarea
              aria-label={t("aiReview")}
              value={c.aiContent}
              readOnly
              className="my-1 h-28 resize-none text-xs field-sizing-fixed"
            />
            <Button variant="outline" size="sm" disabled={c.busy || c.aiApplied} onClick={c.applyAi}>
              {t("aiApply")}
            </Button>
          </details>
          <Button variant="ghost" size="sm" disabled={c.busy} onClick={c.restoreOriginal}>
            {t("aiRestore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
