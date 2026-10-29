import {
  ArrowLeftIcon,
  CheckIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  KeyRoundIcon,
  LanguagesIcon,
  LogInIcon,
  RefreshCwIcon,
  ServerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { openSignIn } from "@/auth/actions";
import { useAuth } from "@/auth/auth-provider";
import { AppBrand } from "@/components/app-brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { UserBadge } from "@/components/user-badge";
import { WEB_APP_URL } from "@/config/env";
import { useClipTemplate } from "@/hooks/use-clip-template";
import { useMemosConnection } from "@/hooks/use-memos-connection";
import {
  getLocalePreference,
  LOCALE_AUTONYMS,
  type LocalePreference,
  localizeDocument,
  SUPPORTED_LOCALES,
  t,
  updateLocalePreference,
} from "@/lib/i18n";
import { isValidInstanceUrl, normalizeInstanceUrl, requiresInsecureHttpConfirmation } from "@/lib/memos-client";
import type { ConnectionActionResult } from "@/lib/messages";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import { DEFAULT_TEMPLATE } from "@/lib/template";
import { ErrorNotice, HttpConnectionWarning, StepRow } from "./connection-controls";
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

function OptionsHeader({
  sub,
  locale,
  onLocaleChange,
}: {
  sub: string;
  locale: LocalePreference;
  onLocaleChange: (locale: LocalePreference) => void;
}) {
  const localeLabel = locale === "browser" ? t("localeBrowserDefault") : LOCALE_AUTONYMS[locale];
  return (
    <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <AppBrand size="md" sub={sub} />
      <div className="flex items-center gap-1">
        <a
          href={browser.runtime.getURL("src/options/index.html?view=history")}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <HistoryIcon />
          {t("historyTitle")}
        </a>
        <Select value={locale} onValueChange={(value) => onLocaleChange(value as LocalePreference)}>
          <SelectTrigger aria-label={t("optionsLanguage")} className="max-w-48" size="sm">
            <LanguagesIcon />
            <span className="truncate">{localeLabel}</span>
          </SelectTrigger>
          <SelectContent align="end" className="min-w-48">
            <SelectItem value="browser">{t("localeBrowserDefault")}</SelectItem>
            {SUPPORTED_LOCALES.map((supportedLocale) => (
              <SelectItem key={supportedLocale} value={supportedLocale}>
                {LOCALE_AUTONYMS[supportedLocale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function LocalTemplateStep({ enabled }: { enabled: boolean }) {
  const clipTemplate = useClipTemplate();
  return (
    <StepRow n={2} state={enabled ? "active" : "locked"} title={t("optionsClipTemplate")} last>
      {!enabled ? (
        <p className="text-sm text-ink-muted">{t("optionsTemplateLocked")}</p>
      ) : clipTemplate.isLoaded ? (
        <div className="space-y-5">
          <p className="text-sm text-ink-muted">{t("optionsTemplateDescription")}</p>
          <TemplateEditor
            initial={clipTemplate.template ?? DEFAULT_TEMPLATE}
            onSave={clipTemplate.saveTemplate}
            storageError={clipTemplate.error}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-ink-muted" aria-live="polite">
          <Spinner />
          {t("optionsLoadingTemplate")}
        </div>
      )}
    </StepRow>
  );
}

function MethodChoice({ busy, onUseMemos, onDirect }: { busy: boolean; onUseMemos: () => void; onDirect: () => void }) {
  return (
    <div className="space-y-3">
      <Card size="sm" className="ring-highlight/55">
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--clip-highlight-wash) text-(--clip-highlight-deep)">
              <LogInIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{t("optionsSignInTitle")}</p>
                <Badge>{t("commonRecommended")}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{t("optionsAccountConnectionDescription")}</p>
            </div>
          </div>
          <Button disabled={busy} onClick={onUseMemos}>
            {busy ? <Spinner /> : null}
            {t("optionsContinueUseMemos")}
          </Button>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-well text-ink-muted">
              <ServerIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("optionsDirectConnection")}</p>
              <p className="mt-1 text-sm text-ink-muted">{t("optionsDirectDescription")}</p>
            </div>
          </div>
          <Button variant="outline" disabled={busy} onClick={onDirect}>
            {t("optionsConnectDirectly")}
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
  const [connectionError, setConnectionError] = useState<Extract<ConnectionActionResult, { ok: false }> | null>(null);
  const [fieldError, setFieldError] = useState<"url" | "token" | null>(null);
  const [confirmHttp, setConfirmHttp] = useState(false);

  const normalizedUrl = normalizeInstanceUrl(instanceUrl.trim());
  const validUrl = isValidInstanceUrl(normalizedUrl);
  const tokenSettingsUrl = validUrl ? `${normalizedUrl}/setting#access-token` : null;

  const connect = async (allowInsecureHttp = false) => {
    setFieldError(null);
    setConnectionError(null);
    if (!validUrl) {
      setFieldError("url");
      return;
    }
    if (!accessToken.trim()) {
      setFieldError("token");
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
      setConnectionError(result);
      return;
    }
    setAccessToken("");
    onConnected();
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" disabled={busy} onClick={onBack}>
        <ArrowLeftIcon />
        {t("optionsBackToMethods")}
      </Button>
      <div>
        <p className="font-medium">{t("optionsConnectDirectly")}</p>
        <p className="mt-1 text-sm text-ink-muted">{t("optionsDirectSetupDescription")}</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="instance-url" className="text-sm font-medium">
          {t("optionsInstanceUrl")}
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
            setConnectionError(null);
          }}
          placeholder="https://memos.example.com"
          className="h-9 w-full rounded-lg border border-edge bg-canvas px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-invalid={fieldError === "url" || undefined}
          readOnly={busy}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="access-token" className="text-sm font-medium">
            {t("optionsAccessToken")}
          </label>
          {tokenSettingsUrl ? (
            <a
              href={tokenSettingsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink hover:underline"
            >
              {t("optionsCreateToken")}
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : (
            <span className="text-xs text-ink-muted">{t("optionsEnterUrlForTokenSettings")}</span>
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
              setConnectionError(null);
            }}
            className="h-9 w-full rounded-lg border border-edge bg-canvas px-3 pe-10 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-invalid={fieldError === "token" || undefined}
            readOnly={busy}
          />
          <button
            type="button"
            className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-ink-muted hover:text-ink"
            onClick={() => setShowToken((value) => !value)}
            disabled={busy}
            aria-label={showToken ? t("optionsHideAccessToken") : t("optionsShowAccessToken")}
            aria-pressed={showToken}
          >
            {showToken ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-ink-muted">{t("optionsTokenAdvice")}</p>
      </div>
      {fieldError ? (
        <p role="alert" className="text-sm text-danger">
          {t(fieldError === "url" ? "optionsInvalidUrlField" : "optionsMissingTokenField")}
        </p>
      ) : null}
      {confirmHttp ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>{t("optionsUnencryptedTitle")}</AlertTitle>
          <AlertDescription>
            {t("optionsUnencryptedBody")}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmHttp(false)}>
                {t("commonCancel")}
              </Button>
              <Button size="sm" onClick={() => void connect(true)}>
                {t("optionsContinueHttp")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      {connectionError ? <ErrorNotice kind={connectionError.errorKind} version={connectionError.version} source="direct" /> : null}
      <Button disabled={busy} onClick={() => void connect(false)}>
        {busy ? <Spinner /> : <KeyRoundIcon />}
        {busy ? t("optionsTestingConnection") : t("optionsTestAndSave")}
      </Button>
      <span className="sr-only" aria-live="polite">
        {busy ? t("optionsTestingDirectConnection") : ""}
      </span>
    </div>
  );
}

function UseMemosSetup({ replacing, onBack, onConnected }: { replacing: boolean; onBack: () => void; onConnected: () => void }) {
  const { error: authError, isLoaded, isSignedIn, reload, user } = useAuth();
  const candidate = useMemosConnection("usememos");
  const [signInErrorKey, setSignInErrorKey] = useState<"optionsRefreshConnectionError" | "optionsSignInError" | null>(null);
  const [activationError, setActivationError] = useState<Extract<ConnectionActionResult, { ok: false }> | null>(null);
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
      setActivationError(result);
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
        setSignInErrorKey("optionsRefreshConnectionError");
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
    setSignInErrorKey(null);
    try {
      await openSignIn();
      await refresh(false);
    } catch {
      setSignInErrorKey("optionsSignInError");
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeftIcon />
        {t("optionsBackToMethods")}
      </Button>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{t("optionsSignInTitle")}</p>
          <Badge>{t("commonRecommended")}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{t("optionsUseMemosSetupDescription")}</p>
      </div>
      {!isLoaded ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner />
          {t("optionsCheckingAccount")}
        </div>
      ) : !isSignedIn ? (
        <Button disabled={busy} onClick={() => void signIn()}>
          {busy ? <Spinner /> : <LogInIcon />}
          {t("optionsSignInTitle")}
        </Button>
      ) : (
        <div className="space-y-3">
          <UserBadge compact />
          {candidate.status === "ready" ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-fact text-ink">
                  {safeHost(candidate.instanceUrl)} · {candidate.version}
                </span>
                <Badge variant="success">
                  <CheckIcon className="size-3" />
                  {t("optionsSupported")}
                </Badge>
              </div>
              <Button disabled={busy} onClick={() => void activate()}>
                {busy ? <Spinner /> : null}
                {replacing ? t("optionsUseThisConnection") : t("optionsFinishSetup")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {candidate.status === "invalid" ? (
                <p role="alert" className="text-sm text-danger">
                  {t("optionsSavedConnectionIncomplete")}
                </p>
              ) : null}
              {candidate.status === "unsupported" ? (
                <ErrorNotice kind="unsupported-version" version={candidate.version} source="usememos" />
              ) : null}
              {candidate.status === "error" && candidate.verificationError ? (
                <ErrorNotice kind={candidate.verificationError} source="usememos" />
              ) : null}
              {setupReturnedWithoutConnection ? (
                <p role="alert" className="text-sm text-danger">
                  {t("optionsNoConnectionFound")}
                </p>
              ) : null}
              <p className="text-sm text-ink-muted">{t("optionsRepairDestination")}</p>
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
                  {pendingSetup ? t("optionsWaitingForConnection") : t("optionsConnectOnUseMemos")}
                  <ExternalLinkIcon />
                </a>
                <Button variant="ghost" disabled={busy || candidate.isChecking} onClick={() => void refresh(false)}>
                  {busy || candidate.isChecking ? <Spinner /> : <RefreshCwIcon />}
                  {busy || candidate.isChecking ? t("commonChecking") : t("optionsCheckAgain")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {authError || signInErrorKey ? (
        <p role="alert" className="text-sm text-danger">
          {signInErrorKey ? t(signInErrorKey) : authError}
        </p>
      ) : null}
      {activationError ? <ErrorNotice kind={activationError.errorKind} version={activationError.version} source="usememos" /> : null}
      {user && replacing ? <p className="text-xs text-ink-muted">{t("optionsCurrentConnectionActive")}</p> : null}
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
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5 text-fact text-ink">
          {connection.instanceUrl ? (
            <a
              className="group inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={connection.instanceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {host}
              <ExternalLinkIcon aria-hidden="true" className="size-3 text-ink-muted transition-colors group-hover:text-ink" />
            </a>
          ) : (
            <span>{host}</span>
          )}
          <span aria-hidden="true">·</span>
          <span>{connection.version}</span>
        </span>
        {connection.verificationError ? <Badge variant="outline">{t("optionsLastVerified")}</Badge> : null}
        <Badge variant="outline">{connection.source === "direct" ? t("commonDirect") : "usememos.com"}</Badge>
      </div>
      {connection.source === "usememos" && isSignedIn ? (
        <UserBadge compact />
      ) : connection.displayName ? (
        <p className="text-sm text-ink-muted">{t("optionsConnectedAs", connection.displayName)}</p>
      ) : null}
      {connection.source === "direct" ? <p className="text-sm text-ink-muted">{t("optionsTokenSaved")}</p> : null}
      {insecureHttp ? <HttpConnectionWarning /> : null}
      {connection.verificationError && connection.verificationError !== "mixed-content" ? (
        <ErrorNotice kind={connection.verificationError} source={connection.source} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={connection.isChecking} onClick={() => void connection.reverify()}>
          {connection.isChecking ? <Spinner /> : <RefreshCwIcon />}
          {connection.isChecking ? t("commonChecking") : t("optionsCheckConnection")}
        </Button>
        <Button variant="ghost" onClick={onChange}>
          {t("optionsChangeConnection")}
        </Button>
        <Button variant="destructive" onClick={onDisconnect}>
          {t("optionsDisconnect")}
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
  const [localePreference, setLocalePreference] = useState<LocalePreference>(getLocalePreference);
  const [localeError, setLocaleError] = useState(false);
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
    if (!window.confirm(t("optionsDisconnectConfirm"))) return;
    await sendBackgroundRequest({ type: "DISCONNECT_CONNECTION" });
    writePendingSetup(false);
    await reload().catch(() => null);
    await active.reverify();
    setView("choice");
  };

  const changeLocale = async (nextLocale: LocalePreference) => {
    setLocaleError(false);
    try {
      await updateLocalePreference(nextLocale);
      setLocalePreference(nextLocale);
      localizeDocument("optionsDocumentTitle");
    } catch {
      setLocaleError(true);
    }
  };

  const sub = ready && host && !active.verificationError ? t("optionsConnectedToHost", host) : t("optionsSetupClipper");
  const connectionTitle =
    ready && !effectiveView
      ? t(active.verificationError ? "optionsConnectToMemos" : "optionsMemosConnected")
      : effectiveView === "choice"
        ? t("optionsChooseHowToConnect")
        : t("optionsConnectToMemos");

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <div>
        <OptionsHeader sub={sub} locale={localePreference} onLocaleChange={changeLocale} />
        {localeError ? (
          <p role="alert" className="-mt-5 mb-5 text-sm text-danger">
            {t("optionsLanguageSaveError")}
          </p>
        ) : null}
        <StepRow
          n={1}
          state={ready && !effectiveView && !active.verificationError ? "done" : "active"}
          title={connectionTitle}
          summary={ready && !effectiveView ? undefined : <span>{t("optionsConnectionSummary")}</span>}
        >
          {active.isChecking && active.source === null && view === null ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Spinner />
              {t("optionsCheckingConnection")}
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
        <LocalTemplateStep enabled={ready && active.verificationError !== "unauthorized"} />
      </div>
    </div>
  );
}
