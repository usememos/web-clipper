import { useCallback, useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { AI_SETTINGS_KEY, type AiPreferences, type AiSettings, DEFAULT_AI_PREFERENCES, parsePreferredTags } from "@/lib/ai";
import { aiErrorMessage } from "@/lib/ai-errors";
import { t } from "@/lib/i18n";
import { sendBackgroundRequest } from "@/lib/runtime-client";

function Choice({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  choices: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
      >
        {choices.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
export function AiSettingsEditor() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [tags, setTags] = useState("");
  const [preferences, setPreferences] = useState<AiPreferences>({ ...DEFAULT_AI_PREFERENCES });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [external, setExternal] = useState(false);
  const dirty = Boolean(
    settings &&
      (enabled !== settings.enabled ||
        apiKey.trim() ||
        JSON.stringify(parsePreferredTags(tags)) !== JSON.stringify(settings.preferredTags) ||
        JSON.stringify(preferences) !== JSON.stringify(settings.preferences)),
  );
  const dirtyRef = useRef(dirty);
  const revisionRef = useRef(-1);
  const mutatingRef = useRef(false);
  dirtyRef.current = dirty;
  const adopt = useCallback((value: AiSettings) => {
    const normalized = { ...value, preferences: value.preferences ?? { ...DEFAULT_AI_PREFERENCES }, revision: value.revision ?? 0 };
    revisionRef.current = normalized.revision;
    dirtyRef.current = false;
    setSettings(normalized);
    setEnabled(normalized.enabled);
    setTags(value.preferredTags.join(", "));
    setPreferences(normalized.preferences);
    setApiKey("");
    setExternal(false);
    setError("");
  }, []);
  const reload = useCallback(async () => {
    setError("");
    try {
      const result = await sendBackgroundRequest({ type: "GET_AI_SETTINGS" });
      if (result?.ok) {
        adopt(result.settings);
        setSaved(false);
      } else setError(aiErrorMessage("settings"));
    } catch {
      setError(aiErrorMessage("settings"));
    }
  }, [adopt]);
  const syncSettings = useCallback(
    async (isActive: () => boolean = () => true) => {
      try {
        const result = await sendBackgroundRequest({ type: "GET_AI_SETTINGS" });
        if (!isActive() || mutatingRef.current) return;
        if (result?.ok) {
          if (result.settings.revision <= revisionRef.current) return;
          if (dirtyRef.current) setExternal(true);
          else adopt(result.settings);
        } else setError(aiErrorMessage("settings"));
      } catch {
        if (isActive()) setError(aiErrorMessage("settings"));
      }
    },
    [adopt],
  );
  useEffect(() => {
    let active = true;
    const load = () => void syncSettings(() => active);
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && AI_SETTINGS_KEY in changes) void load();
    };
    void load();
    browser.storage.onChanged.addListener(changed);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(changed);
    };
  }, [syncSettings]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const changePreference = <K extends keyof AiPreferences>(key: K, value: AiPreferences[K]) => {
    setPreferences((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  };
  const save = async (removeKey = false) => {
    setError("");
    setSaved(false);
    const preferredTags = parsePreferredTags(tags);
    if (!removeKey && !preferredTags) {
      setError(t("aiTagsInvalid"));
      return;
    }
    if (!removeKey && preferences.tagCount > 0 && preferences.tagMode === "only" && !preferredTags?.length) {
      setError(t("aiEmptyTags"));
      return;
    }
    if (!removeKey && enabled && !apiKey.trim() && !settings?.hasApiKey) {
      setError(aiErrorMessage("missing-key"));
      return;
    }
    setBusy(true);
    mutatingRef.current = true;
    try {
      const result = await sendBackgroundRequest(
        removeKey
          ? { type: "REMOVE_AI_KEY", expectedRevision: settings?.revision }
          : {
              type: "SAVE_AI_SETTINGS",
              enabled,
              preferredTags: preferredTags ?? [],
              preferences,
              expectedRevision: settings?.revision,
              ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
            },
      );
      if (result?.ok) {
        if (removeKey) {
          revisionRef.current = result.settings.revision;
          setSettings(result.settings);
          setEnabled(false);
          setApiKey("");
          setExternal(false);
        } else {
          adopt(result.settings);
          setSaved(true);
        }
      } else {
        setError(aiErrorMessage(result?.error ?? "settings"));
        if (result?.error === "settings-conflict") setExternal(true);
      }
    } catch {
      setError(aiErrorMessage("settings"));
    } finally {
      mutatingRef.current = false;
      setBusy(false);
      void syncSettings();
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("aiDescription")}</p>
      {!settings && !error ? <Spinner /> : null}
      {settings ? (
        <fieldset disabled={busy} className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked);
                setSaved(false);
              }}
              className="size-4 accent-primary"
            />
            {t("aiEnable")}
          </label>
          <Choice
            id="ai-trigger"
            label={t("aiTrigger")}
            value={preferences.automatic ? "auto" : "manual"}
            onChange={(value) => changePreference("automatic", value === "auto")}
            choices={[
              ["auto", t("aiAutomatic")],
              ["manual", t("aiManual")],
            ]}
          />
          <div className="space-y-1.5">
            <label htmlFor="deepseek-key" className="text-sm font-medium">
              {t("aiApiKey")}
            </label>
            <input
              id="deepseek-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={512}
              value={apiKey}
              placeholder={settings.hasApiKey ? t("aiKeyStored") : "sk-…"}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSaved(false);
              }}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm"
            />
            {settings.hasApiKey ? (
              <Button size="sm" variant="ghost" onClick={() => void save(true)}>
                {t("aiRemoveKey")}
              </Button>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ai-preferred-tags" className="text-sm font-medium">
              {t("aiPreferredTags")}
            </label>
            <Textarea
              id="ai-preferred-tags"
              value={tags}
              onChange={(event) => {
                setTags(event.target.value);
                setSaved(false);
              }}
              maxLength={3000}
              placeholder={t("aiTagsExample")}
              className="min-h-20"
              aria-describedby="ai-tags-help"
            />
            <p id="ai-tags-help" className="text-xs text-muted-foreground">
              {t("aiTagsHelp")}
            </p>
          </div>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t("aiOutputSettings")}</summary>
            <div className="mt-4 space-y-4">
              <Choice
                id="ai-content-mode"
                label={t("aiContentMode")}
                value={preferences.contentMode}
                onChange={(value) => changePreference("contentMode", value as AiPreferences["contentMode"])}
                choices={[
                  ["cleaned", t("aiContentCleaned")],
                  ["original", t("aiContentOriginal")],
                  ["summary", t("aiContentSummary")],
                ]}
              />
              <Choice
                id="ai-summary-language"
                label={t("aiSummaryLanguage")}
                value={preferences.summaryLanguage}
                onChange={(value) => changePreference("summaryLanguage", value as AiPreferences["summaryLanguage"])}
                choices={[
                  ["zh-CN", "简体中文"],
                  ["zh-TW", "繁體中文"],
                  ["en", "English"],
                  ["source", t("aiSourceLanguage")],
                ]}
              />
              <Choice
                id="ai-summary-length"
                label={t("aiSummaryLength")}
                value={preferences.summaryLength}
                onChange={(value) => changePreference("summaryLength", value as AiPreferences["summaryLength"])}
                choices={[
                  ["short", t("aiLengthShort")],
                  ["standard", t("aiLengthStandard")],
                  ["detailed", t("aiLengthDetailed")],
                ]}
              />
              <Choice
                id="ai-tag-count"
                label={t("aiTagCount")}
                value={String(preferences.tagCount)}
                onChange={(value) => changePreference("tagCount", Number(value))}
                choices={Array.from({ length: 11 }, (_, i) => [String(i), i ? String(i) : t("aiNoTags")])}
              />
              <Choice
                id="ai-tag-mode"
                label={t("aiTagMode")}
                value={preferences.tagMode}
                onChange={(value) => changePreference("tagMode", value as AiPreferences["tagMode"])}
                choices={[
                  ["prefer", t("aiTagsPrefer")],
                  ["only", t("aiTagsOnly")],
                ]}
              />
              <Choice
                id="ai-model"
                label={t("aiModel")}
                value={preferences.model}
                onChange={(value) => changePreference("model", value as AiPreferences["model"])}
                choices={[
                  ["deepseek-flash", "deepseek-flash"],
                  ["deepseek-v4-pro", "deepseek-v4-pro"],
                ]}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreferences({ ...DEFAULT_AI_PREFERENCES });
                  setSaved(false);
                }}
              >
                {t("aiResetPreferences")}
              </Button>
            </div>
          </details>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("aiPrivacy")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!dirty || external} onClick={() => void save()}>
              {busy ? t("commonSaving") : t("aiSaveSettings")}
            </Button>
            <span role="status" className="text-sm text-muted-foreground">
              {saved && !dirty ? t("templateSavedBrowser") : dirty ? t("templateUnsavedChanges") : ""}
            </span>
          </div>
        </fieldset>
      ) : null}
      {external ? (
        <div role="status" className="space-y-2 text-sm">
          <p>{t("aiSettingsConflict")}</p>
          <Button disabled={busy} variant="outline" size="sm" onClick={() => void reload()}>
            {t("aiReloadSettings")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!settings && error ? (
        <Button variant="outline" onClick={() => void reload()}>
          {t("commonTryAgain")}
        </Button>
      ) : null}
    </div>
  );
}
