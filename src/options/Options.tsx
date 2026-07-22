import {
  ArrowLeftIcon,
  CheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LogInIcon,
  RefreshCwIcon,
  ServerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { openSignIn } from "@/auth/actions";
import { useAuth } from "@/auth/auth-provider";
import { AppBrand } from "@/components/app-brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { UserBadge } from "@/components/user-badge";
import { WEB_APP_URL } from "@/config/env";
import { useClipTemplate } from "@/hooks/use-clip-template";
import { useMemosConnection } from "@/hooks/use-memos-connection";
import type { SaveErrorKind } from "@/lib/errors";
import { isValidInstanceUrl, normalizeInstanceUrl, requiresInsecureHttpConfirmation } from "@/lib/memos-client";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import { DEFAULT_TEMPLATE } from "@/lib/template";
import { ErrorNotice, StepRow } from "./connection-controls";
import { TemplateEditor } from "./template-editor";

const SETUP_PENDING_KEY = "memosConnectionSetupStartedAt";
const SETUP_PENDING_TTL_MS = 15 * 60_000;

export const MEMOS_SETUP_URL = (() => {
  const url = new URL("/settings/connections", WEB_APP_URL);
  url.searchParams.set("source", "web-clipper");
  return url.toString();
})();

type SetupView = "choice" | "usememos" | "direct";

function safeHost(instanceUrl?: string | null): string {
  if (!instanceUrl) return "";
  try {
    return new URL(instanceUrl).host;
  } catch {
    return "";
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
    // Return detection is best-effort; Check again remains available.
  }
}

function OptionsHeader({ sub, instanceUrl }: { sub: string; instanceUrl?: string | null }) {
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

function LocalTemplateStep({ enabled }: { enabled: boolean }) {
  const clipTemplate = useClipTemplate();
  return (
    <StepRow
      n={2}
      state={enabled ? "active" : "locked"}
      title="Clip template"
      last
      summary={enabled ? <Badge variant="outline">This browser</Badge> : undefined}
    >
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          Connect a supported Memos instance first; then you can configure how clips are formatted.
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

function MethodChoice({ busy, onUseMemos, onDirect }: { busy: boolean; onUseMemos: () => void; onDirect: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose where the clipper should get your connection information.</p>
      <Card size="sm" className="ring-highlight/55">
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-highlight-wash text-highlight-deep">
              <LogInIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">Sign in with usememos.com</p>
                <Badge>Recommended</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Save your connection to your account and use it after signing in on other devices.
              </p>
            </div>
          </div>
          <Button disabled={busy} onClick={onUseMemos}>
            {busy ? <Spinner /> : null}
            Continue with usememos.com
          </Button>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ServerIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Direct connection</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect this browser with an instance URL and personal access token. No usememos.com account is required.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Connection information stays in this browser.</p>
            </div>
          </div>
          <Button variant="outline" disabled={busy} onClick={onDirect}>
            Connect directly
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DirectSetup({ initialUrl, onBack, onConnected }: { initialUrl?: string | null; onBack: () => void; onConnected: () => void }) {
  const [instanceUrl, setInstanceUrl] = useState(initialUrl ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKind, setErrorKind] = useState<SaveErrorKind | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirmHttp, setConfirmHttp] = useState(false);

  const normalizedUrl = normalizeInstanceUrl(instanceUrl.trim());
  const validUrl = isValidInstanceUrl(normalizedUrl);
  const tokenSettingsUrl = validUrl ? `${normalizedUrl}/setting#access-token` : null;

  const connect = async (allowInsecureHttp = false) => {
    setFieldError(null);
    setErrorKind(null);
    if (!validUrl) {
      setFieldError("Enter a complete http:// or https:// Memos address.");
      return;
    }
    if (!accessToken.trim()) {
      setFieldError("Enter a personal access token.");
      return;
    }
    if (requiresInsecureHttpConfirmation(normalizedUrl) && !allowInsecureHttp) {
      setConfirmHttp(true);
      return;
    }

    setConfirmHttp(false);
    setBusy(true);
    const result = await sendBackgroundRequest({
      type: "CONNECT_DIRECT",
      instanceUrl: normalizedUrl,
      accessToken,
      ...(allowInsecureHttp ? { allowInsecureHttp: true } : {}),
    }).catch(() => ({ ok: false as const, errorKind: "extension-error" as const }));
    setBusy(false);
    if (!result.ok) {
      setErrorKind(result.errorKind);
      return;
    }
    setAccessToken("");
    onConnected();
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" disabled={busy} onClick={onBack}>
        <ArrowLeftIcon />
        Back to connection methods
      </Button>
      <div>
        <p className="font-medium">Connect directly</p>
        <p className="mt-1 text-sm text-muted-foreground">Enter the address of your Memos instance and a personal access token.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="instance-url" className="text-sm font-medium">
          Instance URL
        </label>
        <input
          id="instance-url"
          type="url"
          autoComplete="url"
          spellCheck={false}
          value={instanceUrl}
          onChange={(event) => {
            setInstanceUrl(event.target.value);
            setFieldError(null);
            setErrorKind(null);
          }}
          placeholder="https://memos.example.com"
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-invalid={fieldError?.startsWith("Enter a complete") || undefined}
          readOnly={busy}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="access-token" className="text-sm font-medium">
            Access token
          </label>
          {tokenSettingsUrl ? (
            <a
              href={tokenSettingsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Create a token in Memos settings
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">Enter the instance URL to open token settings</span>
          )}
        </div>
        <div className="relative">
          <input
            id="access-token"
            type={showToken ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={accessToken}
            onChange={(event) => {
              setAccessToken(event.target.value);
              setFieldError(null);
              setErrorKind(null);
            }}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 pr-10 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-invalid={fieldError?.startsWith("Enter a personal") || undefined}
            readOnly={busy}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => setShowToken((value) => !value)}
            disabled={busy}
            aria-label={showToken ? "Hide access token" : "Show access token"}
            aria-pressed={showToken}
          >
            {showToken ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Use a dedicated token named “Web Clipper” and prefer an expiration date.</p>
      </div>
      {fieldError ? (
        <p role="alert" className="text-sm text-destructive">
          {fieldError}
        </p>
      ) : null}
      {confirmHttp ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>This connection is not encrypted</AlertTitle>
          <AlertDescription>
            Your access token and future clips will travel over HTTP. Use HTTPS unless this is a network you trust.
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmHttp(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void connect(true)}>
                Continue with HTTP
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {errorKind ? <ErrorNotice kind={errorKind} source="direct" /> : null}
      <Button disabled={busy} onClick={() => void connect(false)}>
        {busy ? <Spinner /> : <KeyRoundIcon />}
        {busy ? "Testing connection…" : "Test and save"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {busy ? "Testing the direct Memos connection" : ""}
      </span>
    </div>
  );
}

function UseMemosSetup({ replacing, onBack, onConnected }: { replacing: boolean; onBack: () => void; onConnected: () => void }) {
  const { error: authError, isLoaded, isSignedIn, reload, user } = useAuth();
  const candidate = useMemosConnection("usememos");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<SaveErrorKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingSetup, setPendingSetup] = useState(readPendingSetup);
  const [setupReturnedWithoutConnection, setSetupReturnedWithoutConnection] = useState(false);

  const activate = useCallback(async () => {
    setActivationError(null);
    setBusy(true);
    const result = await sendBackgroundRequest({ type: "ACTIVATE_USEMEMOS_CONNECTION" }).catch(() => ({
      ok: false as const,
      errorKind: "extension-error" as const,
    }));
    setBusy(false);
    if (result.ok) {
      writePendingSetup(false);
      setPendingSetup(false);
      onConnected();
    } else {
      setActivationError(result.errorKind);
    }
    return result;
  }, [onConnected]);

  const refresh = useCallback(
    async (fromReturn = false) => {
      if (busy) return;
      setBusy(true);
      setActivationError(null);
      setSetupReturnedWithoutConnection(false);
      try {
        const nextUser = await reload();
        const state = nextUser ? await candidate.reverify() : null;
        if (state?.status === "ready") {
          await activate();
          return;
        }
        if (fromReturn && nextUser) {
          writePendingSetup(false);
          setPendingSetup(false);
          setSetupReturnedWithoutConnection(true);
        }
      } catch {
        setSignInError("Couldn't refresh your usememos.com connection. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [activate, busy, candidate, reload],
  );

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "hidden" && pendingSetup && isSignedIn) void refresh(true);
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [isSignedIn, pendingSetup, refresh]);

  const signIn = async () => {
    setSignInError(null);
    try {
      await openSignIn();
      await refresh(false);
    } catch {
      setSignInError("Sign-in was cancelled or couldn't be completed. You can try again.");
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeftIcon />
        Back to connection methods
      </Button>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">Sign in with usememos.com</p>
          <Badge>Recommended</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account keeps the connection information available when you sign in on another device.
        </p>
      </div>
      {!isLoaded ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Checking your account…
        </div>
      ) : !isSignedIn ? (
        <Button disabled={busy} onClick={() => void signIn()}>
          {busy ? <Spinner /> : <LogInIcon />}
          Sign in with usememos.com
        </Button>
      ) : (
        <div className="space-y-3">
          <UserBadge compact />
          {candidate.status === "ready" ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-fact text-foreground">
                  {safeHost(candidate.instanceUrl)} · {candidate.version}
                </span>
                <Badge variant="success">
                  <CheckIcon className="size-3" />
                  Supported
                </Badge>
              </div>
              <Button disabled={busy} onClick={() => void activate()}>
                {busy ? <Spinner /> : null}
                {replacing ? "Use this connection" : "Finish setup"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {candidate.status === "invalid" ? (
                <p role="alert" className="text-sm text-destructive">
                  The saved connection is incomplete. Repair it on usememos.com.
                </p>
              ) : null}
              {candidate.status === "unsupported" ? <ErrorNotice kind="unsupported-version" source="usememos" /> : null}
              {candidate.status === "error" && candidate.verificationError ? (
                <ErrorNotice kind={candidate.verificationError} source="usememos" />
              ) : null}
              {setupReturnedWithoutConnection ? (
                <p role="alert" className="text-sm text-destructive">
                  No connection was found for this account. Make sure usememos.com uses the same account.
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Connect or repair your destination on usememos.com, then return here to check it.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  className={buttonVariants({ variant: "default" })}
                  href={MEMOS_SETUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    writePendingSetup(true);
                    setPendingSetup(true);
                  }}
                >
                  {pendingSetup ? "Waiting for connection" : "Connect on usememos.com"}
                  <ExternalLinkIcon />
                </a>
                <Button variant="ghost" disabled={busy || candidate.isChecking} onClick={() => void refresh(false)}>
                  {busy || candidate.isChecking ? <Spinner /> : <RefreshCwIcon />}
                  {busy || candidate.isChecking ? "Checking…" : "Check again"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {authError || signInError ? (
        <p role="alert" className="text-sm text-destructive">
          {signInError ?? authError}
        </p>
      ) : null}
      {activationError ? <ErrorNotice kind={activationError} source="usememos" /> : null}
      {user && replacing ? (
        <p className="text-xs text-muted-foreground">Your current connection remains active until this one is verified.</p>
      ) : null}
    </div>
  );
}

type ActiveConnection = ReturnType<typeof useMemosConnection>;

function ConnectedSummary({
  connection,
  onChange,
  onDisconnect,
}: {
  connection: ActiveConnection;
  onChange: () => void;
  onDisconnect: () => void;
}) {
  const { isSignedIn } = useAuth();
  const host = safeHost(connection.instanceUrl);
  const insecureHttp = connection.instanceUrl?.startsWith("http://") ?? false;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="text-fact text-foreground">
          {host} · {connection.version}
        </span>
        {connection.verificationError ? (
          <Badge variant="outline">Last verified</Badge>
        ) : (
          <Badge variant="success">
            <CheckIcon className="size-3" />
            Connected
          </Badge>
        )}
        <Badge variant="outline">{connection.source === "direct" ? "Direct" : "usememos.com"}</Badge>
      </div>
      {connection.source === "usememos" && isSignedIn ? (
        <UserBadge compact />
      ) : connection.displayName ? (
        <p className="text-sm text-muted-foreground">
          Connected as <span className="font-medium text-foreground">{connection.displayName}</span>
        </p>
      ) : null}
      {connection.source === "direct" ? <p className="text-sm text-muted-foreground">Access token saved in this browser.</p> : null}
      {insecureHttp ? <ErrorNotice kind="mixed-content" source={connection.source} /> : null}
      {connection.verificationError && connection.verificationError !== "mixed-content" ? (
        <ErrorNotice kind={connection.verificationError} source={connection.source} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={connection.isChecking} onClick={() => void connection.reverify()}>
          {connection.isChecking ? <Spinner /> : <RefreshCwIcon />}
          {connection.isChecking ? "Checking…" : "Check connection"}
        </Button>
        <Button variant="ghost" onClick={onChange}>
          Change connection
        </Button>
        <Button variant="destructive" onClick={onDisconnect}>
          Disconnect
        </Button>
      </div>
    </div>
  );
}

export function Options() {
  const active = useMemosConnection("active");
  const { reload } = useAuth();
  const [view, setView] = useState<SetupView | null>(null);
  const [choosingBusy, setChoosingBusy] = useState(false);
  const ready = active.status === "ready";
  const host = safeHost(active.instanceUrl);

  useEffect(() => {
    if (ready) setView(null);
  }, [ready]);

  const effectiveView: SetupView | null = view ?? (ready ? null : active.source === "usememos" ? "usememos" : "choice");
  const chooseUseMemos = async () => {
    setChoosingBusy(true);
    if (!ready) await sendBackgroundRequest({ type: "SELECT_USEMEMOS_SOURCE" }).catch(() => {});
    setChoosingBusy(false);
    setView("usememos");
  };

  const connected = async () => {
    await reload().catch(() => null);
    await active.reverify();
    setView(null);
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect this browser from Memos? This does not revoke a direct token on the Memos server.")) return;
    await sendBackgroundRequest({ type: "DISCONNECT_CONNECTION" });
    writePendingSetup(false);
    await reload().catch(() => null);
    await active.reverify();
    setView("choice");
  };

  const sub = ready && host ? `Connected · clipping to ${host}` : "Set up your clipper";
  const connectionTitle =
    ready && !effectiveView ? "Memos connected" : effectiveView === "choice" ? "Choose how to connect" : "Connect to Memos";

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div>
        <OptionsHeader sub={sub} instanceUrl={ready ? active.instanceUrl : null} />
        <StepRow
          n={1}
          state={ready && !effectiveView ? "done" : "active"}
          title={connectionTitle}
          summary={ready && !effectiveView ? undefined : <span>Choose one source for the instance URL and access token.</span>}
        >
          {active.isChecking && active.source === null && view === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Checking your connection…
            </div>
          ) : ready && !effectiveView ? (
            <ConnectedSummary connection={active} onChange={() => setView("choice")} onDisconnect={() => void disconnect()} />
          ) : effectiveView === "choice" ? (
            <MethodChoice busy={choosingBusy} onUseMemos={() => void chooseUseMemos()} onDirect={() => setView("direct")} />
          ) : effectiveView === "direct" ? (
            <DirectSetup
              initialUrl={ready && active.source === "direct" ? active.instanceUrl : null}
              onBack={() => setView(ready ? null : "choice")}
              onConnected={() => void connected()}
            />
          ) : (
            <UseMemosSetup
              replacing={ready && active.source !== "usememos"}
              onBack={() => setView(ready ? null : "choice")}
              onConnected={() => void connected()}
            />
          )}
        </StepRow>
        <LocalTemplateStep enabled={ready} />
      </div>
    </div>
  );
}
