import {
  EarthIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LockIcon,
  PaperclipIcon,
  SettingsIcon,
  TriangleAlertIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import browser from "webextension-polyfill";
import { AccountBadge } from "@/components/account-badge";
import { AppBrand } from "@/components/app-brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { describeSaveError, type SaveErrorDetail } from "@/lib/errors";
import { t, tp } from "@/lib/i18n";
import type { Visibility } from "@/lib/memos-client";
import type { PopupIdentity, PopupState } from "@/lib/popup-state";
import { usePageCapture } from "./page-capture";
import { useClipper } from "./use-clipper";
import { usePopupState } from "./use-popup-state";

function openOptions() {
  void browser.runtime.openOptionsPage();
}

/**
 * Slim toolbar shared by every popup view: identity on the left, quick links on the right —
 * the user's instance (when connected) and the options page.
 */
function Header({ left, instanceUrl }: { left: React.ReactNode; instanceUrl?: string | null }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b pe-2 ps-3">
      <div className="min-w-0">{left}</div>
      <div className="flex shrink-0 items-center gap-0.5">
        {instanceUrl ? (
          <a
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            href={instanceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("popupOpenInstance")}
          >
            <GlobeIcon />
          </a>
        ) : null}
        <Button variant="ghost" size="icon-sm" onClick={openOptions} aria-label={t("popupExtensionSettings")}>
          <SettingsIcon />
        </Button>
      </div>
    </header>
  );
}

function IdentityBadge({ identity }: { identity: PopupIdentity }) {
  return <AccountBadge compact identity={identity} />;
}

// Fills the fixed popup size (set in index.html) so every view has identical dimensions.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      {children}
      <Toaster />
    </div>
  );
}

function GatePrompt({
  title,
  body,
  learnMore,
  instanceUrl,
  identity,
}: {
  title?: string;
  body: string;
  learnMore?: { label: string; url: string };
  instanceUrl?: string | null;
  identity?: PopupIdentity;
}) {
  return (
    <Frame>
      <Header left={identity ? <IdentityBadge identity={identity} /> : <AppBrand />} instanceUrl={instanceUrl} />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        {title ? <p className="text-sm font-medium">{title}</p> : null}
        <p className="text-sm text-muted-foreground">{body}</p>
        {learnMore ? (
          <a
            href={learnMore.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {learnMore.label}
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <Button className="mt-2 w-full" onClick={openOptions}>
          {t("commonOpenSettings")}
        </Button>
      </div>
    </Frame>
  );
}

/**
 * Persistent in-popup failure state: title + why + the fix as a button, not prose. A toast
 * auto-dismisses — wrong for an error that needs reading and action. Retry reuses the intact
 * editor content; the bar clears when the user edits or a retry succeeds.
 */
function ErrorBar({ error, busy, onRetry }: { error: SaveErrorDetail; busy: boolean; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription>
        {error.why} {error.howToFix[0]}
        {error.learnMore ? (
          <>
            {" "}
            <a href={error.learnMore.url} target="_blank" rel="noreferrer" className="font-medium">
              {error.learnMore.label}
            </a>
          </>
        ) : null}
      </AlertDescription>
      <div className="col-start-2 mt-2 flex items-center gap-2">
        {error.primaryAction === "settings" && (
          <Button size="xs" onClick={openOptions}>
            {t("commonOpenSettings")}
          </Button>
        )}
        <Button size="xs" variant={error.primaryAction === "settings" ? "ghost" : "default"} disabled={busy} onClick={onRetry}>
          {busy ? t("commonRetrying") : t("commonTryAgain")}
        </Button>
      </div>
    </Alert>
  );
}

type ClipperState = ReturnType<typeof useClipper>;
type ReadyPopupState = Extract<PopupState, { status: "ready" }>;
type BlockedPopupState = Exclude<PopupState, { status: "ready" }>;

function ReconciliationBar({ state }: { state: BlockedPopupState }) {
  const signedOut = state.status === "signed-out";
  return (
    <Alert>
      <AlertTitle>
        {signedOut ? t("popupSignedOut") : state.status === "disconnected" ? t("popupDisconnected") : t("popupNeedsUpgrade")}
      </AlertTitle>
      <AlertDescription>{t("popupDraftPreserved")}</AlertDescription>
      <Button size="xs" className="mt-2 w-fit" onClick={openOptions}>
        {t("commonOpenSettings")}
      </Button>
    </Alert>
  );
}

function CaptureNotice({
  reason,
  hasSelection,
  hasSource,
}: {
  reason: ClipperState["captureFallbackReason"];
  hasSelection: boolean;
  hasSource: boolean;
}) {
  if (!reason) return null;
  const text =
    reason === "restricted"
      ? t("popupCaptureRestricted")
      : reason === "timed-out"
        ? t("popupCaptureTimedOut")
        : reason === "no-description"
          ? hasSelection
            ? t("popupCaptureNoDescriptionSelection")
            : t("popupCaptureNoDescription")
          : hasSource
            ? t("popupCaptureContentUnavailable")
            : t("popupCaptureFailed");
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function SignedInView({ c, state, blocked }: { c: ClipperState; state: ReadyPopupState; blocked?: BlockedPopupState }) {
  const [error, setError] = useState<SaveErrorDetail | null>(null);
  const visibilityOptions = {
    PRIVATE: {
      label: t("commonPrivate"),
      description: t("popupPrivateDescription"),
      icon: LockIcon,
    },
    PROTECTED: {
      label: t("commonProtected"),
      description: t("popupProtectedDescription"),
      icon: UsersRoundIcon,
    },
    PUBLIC: {
      label: t("commonPublic"),
      description: t("popupPublicDescription"),
      icon: EarthIcon,
    },
  } satisfies Record<Visibility, { label: string; description: string; icon: typeof LockIcon }>;
  const selectedVisibility = visibilityOptions[c.visibility];
  const SelectedVisibilityIcon = selectedVisibility.icon;
  const visibilityValues = Object.keys(visibilityOptions) as Visibility[];
  const visibilityItems = {
    PRIVATE: visibilityOptions.PRIVATE.label,
    PROTECTED: visibilityOptions.PROTECTED.label,
    PUBLIC: visibilityOptions.PUBLIC.label,
  };

  const onSave = async () => {
    const result = await c.save();
    if (result.ok) {
      setError(null);
      toast.success(t("popupSavedToMemos"), {
        // Success is never silently partial: a dropped image is named.
        description: result.failedImages ? tp("popupFailedImages", result.failedImages) : undefined,
        action: { label: t("commonOpen"), onClick: () => window.open(result.webUrl) },
      });
    } else {
      // Persistent inline state, not a toast: the error stays until it's acted on.
      setError(describeSaveError(result.errorKind, state.source));
    }
  };

  return (
    <Frame>
      <Header left={<IdentityBadge identity={state.identity} />} instanceUrl={state.instanceUrl} />
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <Textarea
          aria-label={t("popupMemoContent")}
          // field-sizing-fixed overrides the component's default `field-sizing-content` (which would
          // auto-grow with the memo and push Save off the fixed-height popup); flex-1 + min-h-0 give
          // it a bounded height that scrolls internally instead. The named utility (not the arbitrary
          // [field-sizing:fixed]) is required: Tailwind emits it after field-sizing-content, so it wins.
          className="min-h-0 flex-1 resize-none overflow-y-auto text-sm field-sizing-fixed"
          value={c.content}
          onChange={(e) => {
            c.setContent(e.target.value);
            setError(null);
          }}
          placeholder={t("popupEmptyCapturePlaceholder")}
        />
        <CaptureNotice reason={c.captureFallbackReason} hasSelection={c.hasSelection} hasSource={c.hasSource} />
        {blocked ? <ReconciliationBar state={blocked} /> : null}
        {error && <ErrorBar error={error} busy={c.busy} onRetry={onSave} />}
        {c.imageCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PaperclipIcon className="h-3 w-3" />
            {tp("popupSelectionImages", c.imageCount)}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Select items={visibilityItems} value={c.visibility} onValueChange={(v) => c.setVisibility(v as Visibility)}>
            <SelectTrigger aria-label={t("popupVisibility")} className="w-32 justify-start bg-muted/60 hover:bg-muted">
              <SelectedVisibilityIcon aria-hidden="true" className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top" sideOffset={4} align="start" alignItemWithTrigger={false} className="min-w-64 p-1">
              {visibilityValues.map((visibility) => {
                const option = visibilityOptions[visibility];
                const VisibilityIcon = option.icon;
                return (
                  <SelectItem key={visibility} value={visibility} className="items-start py-1.5 pe-8 ps-2">
                    <VisibilityIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="text-[13px] font-medium leading-4 text-foreground">{option.label}</span>
                      <span className="text-[11px] leading-4 text-muted-foreground">{option.description}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button className="flex-1" disabled={c.busy || !!blocked || !c.content.trim()} onClick={onSave}>
            {c.busy ? t("commonSaving") : t("popupSaveToMemos")}
          </Button>
        </div>
      </div>
    </Frame>
  );
}

export function App() {
  const capture = usePageCapture();
  const state = usePopupState();
  const lastReady = useRef<ReadyPopupState | null>(null);
  if (state?.status === "ready") lastReady.current = state;
  const templateReady = state !== null && state.status !== "signed-out";
  const template = state && state.status !== "signed-out" ? state.template : null;
  const expectation =
    state?.status === "ready" ? { source: state.source, connectionId: state.identity.userId, instanceUrl: state.instanceUrl } : null;
  // This hook stays mounted while cached auth is reconciled, so a gate transition cannot erase
  // edits made during the optimistic window.
  const clipper = useClipper(capture, template, templateReady, expectation);

  if (!state) {
    return (
      <Frame>
        <Header left={<AppBrand />} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      </Frame>
    );
  }

  // If cached-ready state is invalidated while the user is editing, show the real gate state
  // without unmounting the editor. Save is disabled and the draft remains accessible.
  if (state.status !== "ready" && lastReady.current) {
    return <SignedInView c={clipper} state={lastReady.current} blocked={state} />;
  }

  if (state.status === "signed-out") {
    return (
      <Frame>
        <Header left={<AppBrand />} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm text-muted-foreground">{t("popupChooseConnection")}</p>
          <Button className="mt-2 w-full" onClick={openOptions}>
            {t("commonOpenSettings")}
          </Button>
        </div>
      </Frame>
    );
  }
  if (state.status === "disconnected") {
    return <GatePrompt body={t("popupConnectToStart")} identity={state.identity} />;
  }
  if (state.status === "unsupported") {
    // errors.ts owns the copy for this condition (the options page renders the same detail);
    // only the detected-version parenthetical is local knowledge.
    const detail = describeSaveError("unsupported-version");
    return (
      <GatePrompt
        title={detail.title}
        body={
          state.version
            ? t("popupUnsupportedWithVersion", [state.version, detail.why, detail.howToFix[0] ?? ""])
            : t("popupUnsupportedWithoutVersion", [detail.why, detail.howToFix[0] ?? ""])
        }
        learnMore={detail.learnMore}
        instanceUrl={state.instanceUrl}
        identity={state.identity}
      />
    );
  }
  return <SignedInView c={clipper} state={state} />;
}
