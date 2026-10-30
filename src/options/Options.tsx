import { Badge, Button, buttonClasses, Field, Input, Link, Select, Separator, Spinner, Tooltip } from "@usememos/ui";
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
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { openSignIn } from "@/auth/actions";
import { useAuth } from "@/auth/auth-provider";
import { AppBrand } from "@/components/app-brand";
import { InlineStatus } from "@/components/inline-status";
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
  const localeItems: Record<LocalePreference, string> = { ...LOCALE_AUTONYMS, browser: t("localeBrowserDefault") };
  return (
    <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <AppBrand size="md" sub={sub} />
      <div className="flex items-center gap-1">
        <a href={browser.runtime.getURL("src/options/index.html?view=history")} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          <HistoryIcon />
          {t("historyTitle")}
        </a>
        <Select.Root
          size="sm"
          items={localeItems}
          value={locale}
          onValueChange={(value) => {
            if (value) onLocaleChange(value as LocalePreference);
          }}
        >
          <Select.Trigger aria-label={t("optionsLanguage")} className="max-w-48">
            <LanguagesIcon aria-hidden="true" className="mu-icon text-mu-ink-muted" />
            <Select.Value className="truncate" />
          </Select.Trigger>
          <Select.Popup align="end">
            <Select.Item value="browser">{t("localeBrowserDefault")}</Select.Item>
            {SUPPORTED_LOCALES.map((supportedLocale) => (
              <Select.Item key={supportedLocale} value={supportedLocale}>
                {LOCALE_AUTONYMS[supportedLocale]}
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Root>
      </div>
    </div>
  );
}

function LocalTemplateStep({ enabled }: { enabled: boolean }) {
  const clipTemplate = useClipTemplate();
  return (
    <StepRow n={2} state={enabled ? "active" : "locked"} title={t("optionsClipTemplate")} last>
      {!enabled ? (
        <p className="mu-body text-mu-ink-muted">{t("optionsTemplateLocked")}</p>
      ) : clipTemplate.isLoaded ? (
        <div className="space-y-5">
          <p className="mu-body text-mu-ink-muted">{t("optionsTemplateDescription")}</p>
          <TemplateEditor
            initial={clipTemplate.template ?? DEFAULT_TEMPLATE}
            onSave={clipTemplate.saveTemplate}
            storageError={clipTemplate.error}
          />
        </div>
      ) : (
        <div className="mu-body flex items-center gap-2 text-mu-ink-muted" aria-live="polite">
          <Spinner label={t("commonLoading")} />
          {t("optionsLoadingTemplate")}
        </div>
      )}
    </StepRow>
  );
}

/** One way to connect: an icon, a title, what it means, and the button that starts it. */
function MethodOption({
  icon,
  title,
  badge,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-mu-lg bg-mu-well text-mu-ink-muted">{icon}</span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mu-label">{title}</p>
            {badge}
          </div>
          <p className="mu-body mt-1 text-mu-ink-muted">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

function MethodChoice({ busy, onUseMemos, onDirect }: { busy: boolean; onUseMemos: () => void; onDirect: () => void }) {
  return (
    <div className="space-y-5">
      <MethodOption
        icon={<LogInIcon className="mu-icon" />}
        title={t("optionsSignInTitle")}
        badge={<Badge>{t("commonRecommended")}</Badge>}
        description={t("optionsAccountConnectionDescription")}
        action={
          <Button variant="primary" loading={busy} onClick={onUseMemos}>
            {t("optionsContinueUseMemos")}
          </Button>
        }
      />
      <Separator />
      <MethodOption
        icon={<ServerIcon className="mu-icon" />}
        title={t("optionsDirectConnection")}
        description={t("optionsDirectDescription")}
        action={
          <Button disabled={busy} onClick={onDirect}>
            {t("optionsConnectDirectly")}
          </Button>
        }
      />
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
      <Button variant="ghost" size="sm" icon={<ArrowLeftIcon />} disabled={busy} onClick={onBack}>
        {t("optionsBackToMethods")}
      </Button>
      <div>
        <p className="mu-label">{t("optionsConnectDirectly")}</p>
        <p className="mu-body mt-1 text-mu-ink-muted">{t("optionsDirectSetupDescription")}</p>
      </div>
      <Field.Root invalid={fieldError === "url"}>
        <Field.Label>{t("optionsInstanceUrl")}</Field.Label>
        <Input
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
          readOnly={busy}
        />
      </Field.Root>
      <Field.Root invalid={fieldError === "token"}>
        <div className="flex items-center justify-between gap-3">
          <Field.Label>{t("optionsAccessToken")}</Field.Label>
          {tokenSettingsUrl ? (
            <Link href={tokenSettingsUrl} external muted className="mu-caption">
              {t("optionsCreateToken")}
            </Link>
          ) : (
            <span className="mu-caption text-mu-ink-muted">{t("optionsEnterUrlForTokenSettings")}</span>
          )}
        </div>
        <Input
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
          className="font-mu-mono"
          readOnly={busy}
          suffix={
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={showToken ? <EyeOffIcon /> : <EyeIcon />}
                    onClick={() => setShowToken((value) => !value)}
                    disabled={busy}
                    aria-label={showToken ? t("optionsHideAccessToken") : t("optionsShowAccessToken")}
                    aria-pressed={showToken}
                  />
                }
              />
              <Tooltip.Popup role="tooltip">{showToken ? t("optionsHideAccessToken") : t("optionsShowAccessToken")}</Tooltip.Popup>
            </Tooltip.Root>
          }
        />
        <Field.Description>{t("optionsTokenAdvice")}</Field.Description>
      </Field.Root>
      {fieldError ? (
        <p role="alert" className="mu-body text-mu-danger">
          {t(fieldError === "url" ? "optionsInvalidUrlField" : "optionsMissingTokenField")}
        </p>
      ) : null}
      {confirmHttp ? (
        <InlineStatus
          tone="warning"
          role="alert"
          title={t("optionsUnencryptedTitle")}
          action={
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirmHttp(false)}>
                {t("commonCancel")}
              </Button>
              <Button size="sm" onClick={() => void connect(true)}>
                {t("optionsContinueHttp")}
              </Button>
            </>
          }
        >
          {t("optionsUnencryptedBody")}
        </InlineStatus>
      ) : null}
      {connectionError ? <ErrorNotice kind={connectionError.errorKind} version={connectionError.version} source="direct" /> : null}
      <Button
        variant="primary"
        icon={<KeyRoundIcon />}
        loading={busy}
        loadingLabel={t("optionsTestingConnection")}
        onClick={() => void connect(false)}
      >
        {t("optionsTestAndSave")}
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
      <Button variant="ghost" size="sm" icon={<ArrowLeftIcon />} onClick={onBack}>
        {t("optionsBackToMethods")}
      </Button>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mu-label">{t("optionsSignInTitle")}</p>
          <Badge>{t("commonRecommended")}</Badge>
        </div>
        <p className="mu-body mt-1 text-mu-ink-muted">{t("optionsUseMemosSetupDescription")}</p>
      </div>
      {!isLoaded ? (
        <div className="mu-body flex items-center gap-2 text-mu-ink-muted">
          <Spinner label={t("commonLoading")} />
          {t("optionsCheckingAccount")}
        </div>
      ) : !isSignedIn ? (
        <Button variant="primary" icon={<LogInIcon />} loading={busy} onClick={() => void signIn()}>
          {t("optionsSignInTitle")}
        </Button>
      ) : (
        <div className="space-y-3">
          <UserBadge compact />
          {candidate.status === "ready" ? (
            <div className="space-y-3">
              <div className="mu-body flex flex-wrap items-center gap-2">
                <span className="text-fact text-mu-ink">
                  {safeHost(candidate.instanceUrl)} · {candidate.version}
                </span>
                <Badge tone="success" icon={<CheckIcon />}>
                  {t("optionsSupported")}
                </Badge>
              </div>
              <Button variant="primary" loading={busy} onClick={() => void activate()}>
                {replacing ? t("optionsUseThisConnection") : t("optionsFinishSetup")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {candidate.status === "invalid" ? (
                <p role="alert" className="mu-body text-mu-danger">
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
                <p role="alert" className="mu-body text-mu-danger">
                  {t("optionsNoConnectionFound")}
                </p>
              ) : null}
              <p className="mu-body text-mu-ink-muted">{t("optionsRepairDestination")}</p>
              <div className="flex flex-wrap gap-2">
                <a
                  className={buttonClasses({ variant: "primary" })}
                  href={MEMOS_SETUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    writePendingSetup(true);
                    setPendingSetup(true);
                  }}
                >
                  {pendingSetup ? t("optionsWaitingForConnection") : t("optionsConnectOnUseMemos")}
                  <ExternalLinkIcon aria-hidden="true" />
                </a>
                <Button
                  variant="ghost"
                  icon={<RefreshCwIcon />}
                  loading={busy || candidate.isChecking}
                  loadingLabel={t("commonChecking")}
                  onClick={() => void refresh(false)}
                >
                  {t("optionsCheckAgain")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {authError || signInErrorKey ? (
        <p role="alert" className="mu-body text-mu-danger">
          {signInErrorKey ? t(signInErrorKey) : authError}
        </p>
      ) : null}
      {activationError ? <ErrorNotice kind={activationError.errorKind} version={activationError.version} source="usememos" /> : null}
      {user && replacing ? <p className="mu-caption text-mu-ink-muted">{t("optionsCurrentConnectionActive")}</p> : null}
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
      <div className="mu-body flex flex-wrap items-center gap-2 text-mu-ink-muted">
        <span className="inline-flex items-center gap-1 text-fact text-mu-ink">
          {connection.instanceUrl ? (
            <Link href={connection.instanceUrl} external muted className="text-mu-ink">
              {host}
            </Link>
          ) : (
            <span>{host}</span>
          )}
          <span aria-hidden="true">·</span>
          <span>{connection.version}</span>
        </span>
        {connection.verificationError ? <Badge tone="outline">{t("optionsLastVerified")}</Badge> : null}
        <Badge tone="outline">{connection.source === "direct" ? t("commonDirect") : "usememos.com"}</Badge>
      </div>
      {connection.source === "usememos" && isSignedIn ? (
        <UserBadge compact />
      ) : connection.displayName ? (
        <p className="mu-body text-mu-ink-muted">{t("optionsConnectedAs", connection.displayName)}</p>
      ) : null}
      {connection.source === "direct" ? <p className="mu-body text-mu-ink-muted">{t("optionsTokenSaved")}</p> : null}
      {insecureHttp ? <HttpConnectionWarning /> : null}
      {connection.verificationError && connection.verificationError !== "mixed-content" ? (
        <ErrorNotice kind={connection.verificationError} source={connection.source} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<RefreshCwIcon />}
          loading={connection.isChecking}
          loadingLabel={t("commonChecking")}
          onClick={() => void connection.reverify()}
        >
          {t("optionsCheckConnection")}
        </Button>
        <Button variant="ghost" onClick={onChange}>
          {t("optionsChangeConnection")}
        </Button>
        {/* Destructive, but confirmed in the next step, so not a danger key on the first click. */}
        <Button variant="ghost" className="text-mu-danger" onClick={onDisconnect}>
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
          <p role="alert" className="mu-body -mt-5 mb-5 text-mu-danger">
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
            <div className="mu-body flex items-center gap-2 text-mu-ink-muted">
              <Spinner label={t("commonLoading")} />
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
