import { ExternalLinkIcon, GlobeIcon, PaperclipIcon, SettingsIcon, TriangleAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import browser from "webextension-polyfill";
import { openSignIn } from "@/auth/actions";
import { AccountBadge } from "@/components/account-badge";
import { AppBrand } from "@/components/app-brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { describeSaveError, type SaveErrorDetail } from "@/lib/errors";
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
    <header className="flex h-11 shrink-0 items-center justify-between border-b pr-2 pl-3">
      <div className="min-w-0">{left}</div>
      <div className="flex shrink-0 items-center gap-0.5">
        {instanceUrl ? (
          <Button
            variant="ghost"
            size="icon-sm"
            render={<a href={instanceUrl} target="_blank" rel="noreferrer" />}
            aria-label="Open your Memos instance"
          >
            <GlobeIcon />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" onClick={openOptions} aria-label="Extension settings">
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
          Open settings
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
            Open settings
          </Button>
        )}
        <Button size="xs" variant={error.primaryAction === "settings" ? "ghost" : "default"} disabled={busy} onClick={onRetry}>
          {busy ? "Retrying…" : "Try again"}
        </Button>
      </div>
    </Alert>
  );
}

type ClipperState = ReturnType<typeof useClipper>;
type ReadyPopupState = Extract<PopupState, { status: "ready" }>;
type BlockedPopupState = Exclude<PopupState, { status: "ready" }>;

const VISIBILITY_LABELS: Record<Visibility, string> = {
  PRIVATE: "Private",
  PROTECTED: "Protected",
  PUBLIC: "Public",
};

function ReconciliationBar({ state }: { state: BlockedPopupState }) {
  const signedOut = state.status === "signed-out";
  return (
    <Alert>
      <AlertTitle>
        {signedOut ? "You’re signed out" : state.status === "disconnected" ? "Memos is disconnected" : "Memos needs an upgrade"}
      </AlertTitle>
      <AlertDescription>Your draft is preserved, but it can’t be saved until the connection is ready.</AlertDescription>
      <Button size="xs" className="mt-2 w-fit" onClick={() => (signedOut ? void openSignIn().catch(() => {}) : openOptions())}>
        {signedOut ? "Sign in" : "Open settings"}
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
      ? "Only the page link was captured — Chrome blocks page access here."
      : reason === "timed-out"
        ? "Only the page link was captured — page capture timed out."
        : reason === "no-description"
          ? hasSelection
            ? "The selection and page link were captured — no readable description was found."
            : "Only the page link was captured — no readable description was found."
          : hasSource
            ? "Only the page link was captured — page content was unavailable."
            : "This page could not be captured. You can write the memo manually.";
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function SignedInView({ c, state, blocked }: { c: ClipperState; state: ReadyPopupState; blocked?: BlockedPopupState }) {
  const [error, setError] = useState<SaveErrorDetail | null>(null);

  const onSave = async () => {
    const result = await c.save();
    if (result.ok) {
      setError(null);
      toast.success("Saved to Memos", {
        // Success is never silently partial: a dropped image is named.
        description: result.failedImages
          ? `${result.failedImages} image${result.failedImages > 1 ? "s" : ""} couldn't be uploaded`
          : undefined,
        action: { label: "Open", onClick: () => window.open(result.webUrl) },
      });
    } else {
      // Persistent inline state, not a toast: the error stays until it's acted on.
      setError(describeSaveError(result.errorKind));
    }
  };

  return (
    <Frame>
      <Header left={<IdentityBadge identity={state.identity} />} instanceUrl={state.instanceUrl} />
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <Textarea
          aria-label="Memo content"
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
          placeholder="Nothing could be captured from this page — write your memo here"
        />
        <CaptureNotice reason={c.captureFallbackReason} hasSelection={c.hasSelection} hasSource={c.hasSource} />
        {blocked ? <ReconciliationBar state={blocked} /> : null}
        {error && <ErrorBar error={error} busy={c.busy} onRetry={onSave} />}
        {c.imageCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PaperclipIcon className="h-3 w-3" />
            {c.imageCount} image{c.imageCount > 1 ? "s" : ""} from your selection will be attached
          </p>
        )}
        <div className="flex items-center gap-2">
          <Select items={VISIBILITY_LABELS} value={c.visibility} onValueChange={(v) => c.setVisibility(v as Visibility)}>
            <SelectTrigger className="w-30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIVATE">{VISIBILITY_LABELS.PRIVATE}</SelectItem>
              <SelectItem value="PROTECTED">{VISIBILITY_LABELS.PROTECTED}</SelectItem>
              <SelectItem value="PUBLIC">{VISIBILITY_LABELS.PUBLIC}</SelectItem>
            </SelectContent>
          </Select>
          <Button className="flex-1" disabled={c.busy || !!blocked || !c.content.trim()} onClick={onSave}>
            {c.busy ? "Saving…" : "Save to Memos"}
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
  const expectation = state?.status === "ready" ? { userId: state.identity.userId, instanceUrl: state.instanceUrl } : null;
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
          <p className="text-sm text-muted-foreground">
            Sign in with your usememos.com account to start clipping. Your saved Memos connection will load automatically.
          </p>
          <Button className="mt-2 w-full" onClick={() => void openSignIn().catch(() => {})}>
            Sign in with usememos.com
          </Button>
        </div>
      </Frame>
    );
  }
  if (state.status === "disconnected") {
    return <GatePrompt body="Connect your Memos instance to start clipping." identity={state.identity} />;
  }
  if (state.status === "unsupported") {
    // errors.ts owns the copy for this condition (the options page renders the same detail);
    // only the detected-version parenthetical is local knowledge.
    const detail = describeSaveError("unsupported-version");
    return (
      <GatePrompt
        title={detail.title}
        body={`${state.version ? `Your instance is running ${state.version}. ` : ""}${detail.why} ${detail.howToFix[0] ?? ""}`}
        learnMore={detail.learnMore}
        instanceUrl={state.instanceUrl}
        identity={state.identity}
      />
    );
  }
  return <SignedInView c={clipper} state={state} />;
}
