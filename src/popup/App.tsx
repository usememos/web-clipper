import { Button, buttonClasses, Link, Spinner, Tooltip } from "@usememos/ui";
import { CheckCircle2Icon, GlobeIcon, HistoryIcon, PaperclipIcon, SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { AccountBadge } from "@/components/account-badge";
import { AppBrand } from "@/components/app-brand";
import { InlineStatus } from "@/components/inline-status";
import { describeSaveError, type SaveErrorDetail } from "@/lib/errors";
import { formatDateTime, t, tp } from "@/lib/i18n";
import type { PopupIdentity, PopupState } from "@/lib/popup-state";
import { supportsSpaces } from "@/lib/versions";
import { AudienceMenu } from "./audience-menu";
import { MemoEditor } from "./memo-editor";
import { usePageCapture } from "./page-capture";
import { useClipper } from "./use-clipper";
import { usePopupState } from "./use-popup-state";

const SAVED_AT_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const SAVED_CONFIRMATION_MS = 1_400;

function openOptions() {
  void browser.runtime.openOptionsPage();
}

function openHistory() {
  void browser.tabs.create({ url: browser.runtime.getURL("src/options/index.html?view=history") });
}

function HeaderActionTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Popup side="bottom" align="end" role="tooltip">
        {label}
      </Tooltip.Popup>
    </Tooltip.Root>
  );
}

/**
 * Slim toolbar shared by every popup view: identity on the left, quick links on the right —
 * the user's instance (when connected) and the options page.
 */
function Header({ left, instanceUrl }: { left: React.ReactNode; instanceUrl?: string | null }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b pe-2 ps-3">
      <div className="min-w-0">{left}</div>
      <Tooltip.Provider>
        <div className="flex shrink-0 items-center gap-(--mu-inset)">
          {instanceUrl ? (
            <HeaderActionTooltip label={t("popupOpenInstance")}>
              <a
                className={buttonClasses({ variant: "ghost", size: "sm", iconOnly: true })}
                href={instanceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t("popupOpenInstance")}
              >
                <GlobeIcon />
              </a>
            </HeaderActionTooltip>
          ) : null}
          <HeaderActionTooltip label={t("popupOpenHistory")}>
            <Button variant="ghost" size="sm" icon={<HistoryIcon />} onClick={() => openHistory()} aria-label={t("popupOpenHistory")} />
          </HeaderActionTooltip>
          <HeaderActionTooltip label={t("popupExtensionSettings")}>
            <Button variant="ghost" size="sm" icon={<SettingsIcon />} onClick={openOptions} aria-label={t("popupExtensionSettings")} />
          </HeaderActionTooltip>
        </div>
      </Tooltip.Provider>
    </header>
  );
}

function IdentityBadge({ identity }: { identity: PopupIdentity }) {
  return <AccountBadge compact identity={identity} />;
}

// Fills the fixed popup size (set in index.html) so every view has identical dimensions.
function Frame({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full w-full flex-col bg-mu-canvas text-mu-ink">{children}</div>;
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
        {title ? <p className="mu-label">{title}</p> : null}
        <p className="mu-body text-mu-ink-muted">{body}</p>
        {learnMore ? (
          <Link href={learnMore.url} external className="mu-body">
            {learnMore.label}
          </Link>
        ) : null}
        <Button variant="primary" className="mt-2 w-full" onClick={openOptions}>
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
  const opensSettings = error.primaryAction === "settings";
  return (
    <InlineStatus
      tone="danger"
      className="shrink-0"
      title={error.title}
      action={
        <>
          {opensSettings && (
            <Button size="sm" onClick={openOptions}>
              {t("commonOpenSettings")}
            </Button>
          )}
          {error.kind !== "unauthorized" ? (
            <Button
              size="sm"
              variant={opensSettings ? "ghost" : "neutral"}
              loading={busy}
              loadingLabel={t("commonRetrying")}
              onClick={onRetry}
            >
              {t("commonTryAgain")}
            </Button>
          ) : null}
        </>
      }
    >
      <p>
        {error.kind !== "unauthorized" ? `${error.why} ` : null}
        {error.howToFix[0]}
        {error.learnMore ? (
          <>
            {" "}
            <Link href={error.learnMore.url} target="_blank" rel="noreferrer" underline="always">
              {error.learnMore.label}
            </Link>
          </>
        ) : null}
      </p>
    </InlineStatus>
  );
}

type ClipperState = ReturnType<typeof useClipper>;
type ReadyPopupState = Extract<PopupState, { status: "ready" }>;
type BlockedPopupState = Exclude<PopupState, { status: "ready" }>;

function ReconciliationBar({ state }: { state: BlockedPopupState }) {
  const signedOut = state.status === "signed-out";
  return (
    <InlineStatus
      tone="warning"
      role="alert"
      title={signedOut ? t("popupSignedOut") : state.status === "disconnected" ? t("popupDisconnected") : t("popupNeedsUpgrade")}
      action={
        <Button size="sm" onClick={openOptions}>
          {t("commonOpenSettings")}
        </Button>
      }
    >
      <p>{t("popupDraftPreserved")}</p>
    </InlineStatus>
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
        : reason === "no-article"
          ? t("popupCaptureNoArticle")
          : reason === "no-description"
            ? hasSelection
              ? t("popupCaptureNoDescriptionSelection")
              : t("popupCaptureNoDescription")
            : hasSource
              ? t("popupCaptureContentUnavailable")
              : t("popupCaptureFailed");
  return (
    <p role="status" className="mu-caption text-mu-ink-muted">
      {text}
    </p>
  );
}

function SignedInView({ c, state, blocked }: { c: ClipperState; state: ReadyPopupState; blocked?: BlockedPopupState }) {
  const [error, setError] = useState<SaveErrorDetail | null>(null);
  const [failedImageCount, setFailedImageCount] = useState<number | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionError = c.tokenRejected ? describeSaveError("unauthorized", state.source) : error?.kind === "unauthorized" ? error : null;

  useEffect(() => {
    setError(null);
  }, [state.source, state.identity.userId, state.instanceUrl]);

  const clearRecoverableError = () => setError((current) => (current?.kind === "unauthorized" ? current : null));

  useEffect(
    () => () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    },
    [],
  );

  const clearSavedConfirmation = () => {
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = null;
    setJustSaved(false);
  };
  const onSave = async () => {
    clearSavedConfirmation();
    setFailedImageCount(null);
    const result = await c.save();
    if (result.ok) {
      setError(null);
      setFailedImageCount(result.failedImages ?? null);
      setJustSaved(true);
      confirmationTimer.current = setTimeout(() => {
        confirmationTimer.current = null;
        setJustSaved(false);
      }, SAVED_CONFIRMATION_MS);
    } else {
      // Persistent inline state, not a toast: the error stays until it's acted on.
      setError(describeSaveError(result.errorKind, state.source));
    }
  };
  const savedAt = c.savedClip ? formatDateTime(c.savedClip.savedAt, SAVED_AT_FORMAT) : "";
  const saveButtonLabel = c.busy
    ? t("commonSaving")
    : justSaved
      ? t("popupSavedToMemos")
      : c.savedClip
        ? t("popupSaveAgain")
        : t("popupSaveToMemos");

  return (
    <Frame>
      <Header left={<IdentityBadge identity={state.identity} />} instanceUrl={state.instanceUrl} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {connectionError && <ErrorBar error={connectionError} busy={c.busy} onRetry={onSave} />}
        <MemoEditor
          label={t("popupMemoContent")}
          value={c.content}
          onChange={(markdown) => {
            clearSavedConfirmation();
            c.setContent(markdown);
            clearRecoverableError();
          }}
          placeholder={t("popupEmptyCapturePlaceholder")}
        />
        <CaptureNotice reason={c.captureFallbackReason} hasSelection={c.hasSelection} hasSource={c.hasSource} />
        {c.spaceUnavailable ? (
          <p role="status" className="mu-caption text-mu-danger">
            {t("errorSpaceUnavailableFix")}
          </p>
        ) : null}
        {blocked ? <ReconciliationBar state={blocked} /> : null}
        {error && !connectionError && <ErrorBar error={error} busy={c.busy} onRetry={onSave} />}
        {failedImageCount ? (
          <InlineStatus tone="warning" className="shrink-0">
            {tp("popupFailedImages", failedImageCount)}
          </InlineStatus>
        ) : null}
        {c.savedClip || c.imageCount > 0 ? (
          <div className="mu-caption flex shrink-0 items-center justify-between gap-3 overflow-hidden text-mu-ink-muted">
            {c.savedClip ? (
              <div role="status" className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
                <HistoryIcon aria-hidden="true" className="mu-icon mu-s-sm shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t("popupSavedAt", savedAt)}</span>
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
                <Link
                  href={c.savedClip.memoUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={t("popupOpenMemo")}
                  className="max-w-[45%] shrink-0 truncate"
                >
                  {t("popupOpenMemo")}
                </Link>
              </div>
            ) : null}
            {c.imageCount > 0 ? (
              <span className="flex shrink-0 items-center gap-1 font-mu-mono" title={tp("popupSelectionImages", c.imageCount)}>
                <PaperclipIcon aria-hidden="true" className="mu-icon mu-s-sm" />
                <span aria-hidden="true">{c.imageCount}</span>
                <span className="sr-only">{tp("popupSelectionImages", c.imageCount)}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <AudienceMenu
            visibility={c.visibility}
            space={c.space}
            spaces={c.spaces}
            supportsSpaces={supportsSpaces(state.version)}
            disabled={c.busy || !!blocked}
            onVisibilityChange={(value) => {
              clearSavedConfirmation();
              clearRecoverableError();
              c.setVisibility(value);
            }}
            onSpaceChange={(space) => {
              clearSavedConfirmation();
              clearRecoverableError();
              c.setSpace(space);
            }}
            onRetry={c.reloadSpaces}
            onOpenSettings={() => void browser.runtime.openOptionsPage()}
          />
          <Button
            variant="primary"
            className={`min-w-0 flex-1 overflow-hidden ${justSaved ? "data-disabled:opacity-100" : ""}`}
            icon={justSaved ? <CheckCircle2Icon /> : undefined}
            loading={c.busy}
            loadingLabel={t("commonSaving")}
            disabled={justSaved || !!blocked || !!connectionError || c.spaceUnavailable || !c.content.trim()}
            onClick={onSave}
            title={saveButtonLabel}
          >
            <span className="truncate">{saveButtonLabel}</span>
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
    state?.status === "ready"
      ? {
          source: state.source,
          connectionId: state.identity.userId,
          instanceUrl: state.instanceUrl,
          accountId: state.identity.memosUserName,
        }
      : null;
  // This hook stays mounted while cached auth is reconciled, so a gate transition cannot erase
  // edits made during the optimistic window.
  const clipper = useClipper(
    capture,
    template,
    templateReady,
    expectation,
    Boolean(state?.status === "ready" && supportsSpaces(state.version)),
  );

  if (!state) {
    return (
      <Frame>
        <Header left={<AppBrand />} />
        <div className="flex flex-1 items-center justify-center">
          <Spinner label={t("commonLoading")} />
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
          <p className="mu-body text-mu-ink-muted">{t("popupChooseConnection")}</p>
          <Button variant="primary" className="mt-2 w-full" onClick={openOptions}>
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
