import { CheckIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { openSignIn } from "@/auth/actions";
import { useAuth } from "@/auth/auth-provider";
import { AppBrand } from "@/components/app-brand";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { UserBadge } from "@/components/user-badge";
import { WEB_APP_URL } from "@/config/env";
import { useClipTemplate } from "@/hooks/use-clip-template";
import { useMemosConnection } from "@/hooks/use-memos-connection";
import { DEFAULT_TEMPLATE } from "@/lib/template";
import { ErrorNotice, StepRow } from "./connection-controls";
import { TemplateEditor } from "./template-editor";

const SETUP_PENDING_KEY = "memosConnectionSetupStartedAt";
const SETUP_PENDING_TTL_MS = 15 * 60_000;
const PASSIVE_REFRESH_INTERVAL_MS = 60_000;
const METADATA_RETRY_DELAYS_MS = [0, 700, 1_800] as const;

export const MEMOS_SETUP_URL = (() => {
  const url = new URL("/settings/connections", WEB_APP_URL);
  url.searchParams.set("source", "web-clipper");
  return url.toString();
})();

function safeHost(instanceUrl?: string): string {
  if (!instanceUrl) return "";
  try {
    return new URL(instanceUrl).host;
  } catch {
    return "";
  }
}

function usesInsecureHttp(instanceUrl?: string): boolean {
  if (!instanceUrl) return false;
  try {
    return new URL(instanceUrl).protocol === "http:";
  } catch {
    return false;
  }
}

function readPendingSetup(): boolean {
  try {
    const startedAt = Number(sessionStorage.getItem(SETUP_PENDING_KEY));
    const active = Number.isFinite(startedAt) && startedAt > Date.now() - SETUP_PENDING_TTL_MS && startedAt <= Date.now();
    if (!active) sessionStorage.removeItem(SETUP_PENDING_KEY);
    return active;
  } catch {
    return false;
  }
}

function writePendingSetup(started: boolean): void {
  try {
    if (started) sessionStorage.setItem(SETUP_PENDING_KEY, String(Date.now()));
    else sessionStorage.removeItem(SETUP_PENDING_KEY);
  } catch {
    // A blocked sessionStorage only disables return detection; manual checking still works.
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function OptionsHeader({ sub, instanceUrl }: { sub: string; instanceUrl?: string }) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <AppBrand size="md" sub={sub} />
      {instanceUrl ? (
        <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={instanceUrl} target="_blank" rel="noreferrer">
          Open Memos
          <ExternalLinkIcon />
        </a>
      ) : null}
    </div>
  );
}

function LocalTemplateStep({ enabled, isSignedIn }: { enabled: boolean; isSignedIn: boolean }) {
  const clipTemplate = useClipTemplate();
  return (
    <StepRow
      n={3}
      state={enabled ? "active" : "locked"}
      title="Clip template"
      last
      summary={enabled ? <Badge variant="outline">This browser</Badge> : undefined}
    >
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          {isSignedIn
            ? "Connect a supported Memos instance first; then you can configure how clips are formatted."
            : "Sign in and connect your Memos instance first; then you can configure how clips are formatted."}
        </p>
      ) : clipTemplate.isLoaded ? (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Customize how every clip is formatted before it reaches Memos. This setting is saved only in this browser.
          </p>
          <TemplateEditor
            initial={clipTemplate.template ?? DEFAULT_TEMPLATE}
            onSave={clipTemplate.saveTemplate}
            storageError={clipTemplate.error}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Spinner />
          Loading your template…
        </div>
      )}
    </StepRow>
  );
}

export function Options() {
  const { error: authError, isLoaded, isSignedIn, reload, signOut, user } = useAuth();
  const { instanceUrl, isChecking, reverify, status, verificationError, version } = useMemosConnection();
  const [signInError, setSignInError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [pendingSetup, setPendingSetup] = useState(readPendingSetup);
  const [setupReturnedWithoutConnection, setSetupReturnedWithoutConnection] = useState(false);
  const [refreshingAccount, setRefreshingAccount] = useState(false);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const lastRefreshAt = useRef(0);
  const resumePendingOnMount = useRef(pendingSetup);

  const host = safeHost(instanceUrl ?? undefined);
  const insecureHttp = usesInsecureHttp(instanceUrl ?? undefined);
  const ready = status === "ready";
  const setupBusy = refreshingAccount || isChecking;

  const clearPending = useCallback(() => {
    writePendingSetup(false);
    setPendingSetup(false);
  }, []);

  const refreshConnection = useCallback(
    (retryMissing = false): Promise<void> => {
      if (refreshPromise.current) return refreshPromise.current;
      setRefreshingAccount(true);
      setRefreshError(null);
      setSetupReturnedWithoutConnection(false);

      const task = (async () => {
        const delays = retryMissing ? METADATA_RETRY_DELAYS_MS : ([0] as const);
        let nextUser = user;
        let nextConnection = null;
        for (const delay of delays) {
          if (delay) await wait(delay);
          nextUser = await reload();
          if (!nextUser) break;
          nextConnection = await reverify();
          if (nextConnection && nextConnection.status !== "disconnected" && nextConnection.status !== "invalid") break;
        }

        lastRefreshAt.current = Date.now();
        if (nextConnection?.instanceUrl) {
          clearPending();
          return;
        }
        if (retryMissing && nextUser) {
          clearPending();
          setSetupReturnedWithoutConnection(true);
        }
      })()
        .catch(() => setRefreshError("Couldn't refresh your account. Check your connection and try again."))
        .finally(() => {
          setRefreshingAccount(false);
          refreshPromise.current = null;
        });
      refreshPromise.current = task;
      return task;
    },
    [clearPending, reload, reverify, user],
  );

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "hidden" || !isLoaded || !isSignedIn) return;
      const stale = Date.now() - lastRefreshAt.current > PASSIVE_REFRESH_INTERVAL_MS;
      if (pendingSetup || stale) void refreshConnection(pendingSetup);
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    // A newly opened/reloaded options page is already focused, so it will not receive a
    // "return" focus event. Resume only a handoff restored from sessionStorage; a handoff
    // started by the current click waits for the user to actually return.
    if (resumePendingOnMount.current && document.visibilityState !== "hidden" && isLoaded && isSignedIn) {
      resumePendingOnMount.current = false;
      void refreshConnection(true);
    }
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [isLoaded, isSignedIn, pendingSetup, refreshConnection]);

  const beginSetup = () => {
    writePendingSetup(true);
    setPendingSetup(true);
    setSetupReturnedWithoutConnection(false);
    setRefreshError(null);
  };

  const signIn = async () => {
    setSignInError(null);
    try {
      await openSignIn();
    } catch {
      setSignInError("Sign-in was cancelled or couldn't be completed. You can try again.");
    }
  };

  const sub = ready && host ? `Connected · clipping to ${host}` : "Set up your clipper";

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div>
        <OptionsHeader sub={sub} instanceUrl={instanceUrl ?? undefined} />

        <StepRow n={1} state={isSignedIn ? "done" : "active"} title={isSignedIn ? "Signed in" : "Sign in"}>
          {!isLoaded ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Spinner />
              Checking your account…
            </div>
          ) : isSignedIn ? (
            <div className="flex items-center justify-between gap-3">
              <UserBadge compact />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearPending();
                  void signOut().catch(() => {});
                }}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <Card size="sm">
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Sign in with your usememos.com account. The browser handles the OAuth return securely.
                </p>
                <Button onClick={() => void signIn()}>Sign in with usememos.com</Button>
              </CardContent>
            </Card>
          )}
          {authError || signInError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {signInError ?? authError}
            </p>
          ) : null}
        </StepRow>

        <StepRow
          n={2}
          state={ready ? "done" : isSignedIn ? "active" : "locked"}
          title={ready ? "Instance connected" : "Connect your Memos instance"}
          summary={
            instanceUrl && version ? (
              <>
                <span className="text-fact">{`${host || "Connected instance"} · ${version}`}</span>
                {ready && verificationError ? (
                  <Badge variant="outline">Last verified</Badge>
                ) : ready ? (
                  <Badge variant="success">
                    <CheckIcon className="size-3" />
                    Supported
                  </Badge>
                ) : null}
              </>
            ) : undefined
          }
        >
          {!isLoaded ? null : !isSignedIn ? (
            <p className="text-sm text-muted-foreground">Sign in first; your destination is attached to that usememos.com account.</p>
          ) : (
            <div className="space-y-3">
              {status === "invalid" ? (
                <div role="alert" className="rounded-lg border border-destructive/35 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium">The saved connection is incomplete</p>
                  <p className="mt-1 text-muted-foreground">
                    Reconnect it on usememos.com. The extension will never expose or edit the saved access token here.
                  </p>
                </div>
              ) : null}
              {insecureHttp ? <ErrorNotice kind="mixed-content" /> : null}
              {status === "unsupported" ? <ErrorNotice kind="unsupported-version" /> : null}
              {status === "error" && verificationError && verificationError !== "mixed-content" ? (
                <ErrorNotice kind={verificationError} />
              ) : null}
              {ready && verificationError && verificationError !== "mixed-content" ? <ErrorNotice kind={verificationError} /> : null}
              {setupReturnedWithoutConnection ? (
                <div role="alert" className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">No connection was found for this account.</p>
                  <p className="mt-1 text-muted-foreground">Make sure usememos.com is signed in with the same account.</p>
                </div>
              ) : null}
              {refreshError ? (
                <p role="alert" className="text-sm text-destructive">
                  {refreshError}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {pendingSetup
                  ? "Finish setup in the usememos.com tab. This page will check again when you return."
                  : ready
                    ? "Connection details are managed on usememos.com. This extension only reads them through OAuth."
                    : "Add or repair the destination on usememos.com. The clip template unlocks after a supported instance is connected."}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  className={buttonVariants({ variant: ready ? "outline" : "default" })}
                  href={MEMOS_SETUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={beginSetup}
                >
                  {pendingSetup ? "Waiting for connection" : ready ? "Manage connection" : "Connect on usememos.com"}
                  <ExternalLinkIcon />
                </a>
                <Button variant="ghost" disabled={setupBusy} onClick={() => void refreshConnection(false)}>
                  {setupBusy ? <Spinner /> : <RefreshCwIcon />}
                  {setupBusy ? "Checking…" : "Check again"}
                </Button>
              </div>
              <span className="sr-only" aria-live="polite">
                {setupBusy ? "Checking your usememos.com connection" : ""}
              </span>
            </div>
          )}
        </StepRow>

        <LocalTemplateStep enabled={ready} isSignedIn={isSignedIn} />
      </div>
    </div>
  );
}
