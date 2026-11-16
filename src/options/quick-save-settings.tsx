import { Field, Fieldset, Radio, RadioGroup } from "@usememos/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { AudienceMenu, formatAudienceSummary } from "@/components/audience-menu";
import { useSpaceList } from "@/hooks/use-space-list";
import { t } from "@/lib/i18n";
import {
  applySpaceChange,
  applyVisibilityChange,
  type DestinationConnection,
  destinationStorageKey,
  type MemoDestination,
  quickSaveDestinationStorageKey,
} from "@/lib/memo-destination";
import {
  QUICK_SAVE_SETTINGS_KEY,
  type QuickSaveMode,
  type QuickSaveSettingsState,
  readQuickSaveSettingsState,
  writeQuickSaveCustomDestination,
  writeQuickSaveMode,
} from "@/lib/quick-save-settings";

type Props = {
  connection: DestinationConnection | null;
  supportsSpaces: boolean;
};

const INITIAL_STATE: QuickSaveSettingsState = {
  mode: "custom",
  customDestination: { visibility: "PRIVATE" },
  popupDestination: { visibility: "PRIVATE" },
};

export function QuickSaveSettings({ connection, supportsSpaces }: Props) {
  const [state, setState] = useState<QuickSaveSettingsState>(INITIAL_STATE);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"optionsQuickSaveReadError" | "optionsQuickSaveWriteError" | null>(null);
  const savingRef = useRef(false);
  const { spaces, reloadSpaces } = useSpaceList(connection, supportsSpaces);

  const connectionKey = connection ? destinationStorageKey(connection) : null;
  const customKey = connection ? quickSaveDestinationStorageKey(connection) : null;

  const refreshState = useCallback(
    async (isInitial: boolean) => {
      const next = await readQuickSaveSettingsState(connection, supportsSpaces);
      setState(next);
      if (isInitial) setLoaded(true);
    },
    [connection?.accountId, connection?.connectionId, connection?.instanceUrl, connection?.source, supportsSpaces],
  );

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError(null);
    void readQuickSaveSettingsState(connection, supportsSpaces)
      .then((stored) => {
        if (active) {
          setState(stored);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setError("optionsQuickSaveReadError");
      });
    return () => {
      active = false;
    };
  }, [connection?.accountId, connection?.connectionId, connection?.instanceUrl, connection?.source, supportsSpaces]);

  useEffect(() => {
    let active = true;
    const onChanged = (changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== "local" || savingRef.current) return;
      const watchedKeys = [QUICK_SAVE_SETTINGS_KEY, connectionKey, customKey].filter((key): key is string => Boolean(key));
      if (!watchedKeys.some((key) => key in changes)) return;
      void refreshState(false).catch(() => {
        if (active) setError("optionsQuickSaveReadError");
      });
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [connectionKey, customKey, refreshState]);

  const saveMode = async (value: unknown) => {
    if (value !== "follow-popup" && value !== "custom") return;
    const nextMode: QuickSaveMode = value;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await writeQuickSaveMode(nextMode);
      setState((previous) => ({ ...previous, mode: nextMode }));
    } catch {
      setError("optionsQuickSaveWriteError");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const saveCustomDestination = async (next: MemoDestination) => {
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await writeQuickSaveCustomDestination(connection, next);
      setState((previous) => ({ ...previous, customDestination: next }));
    } catch {
      setError("optionsQuickSaveWriteError");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const activeDestination = state.mode === "follow-popup" ? state.popupDestination : state.customDestination;
  const activeSpaceUnavailable = Boolean(
    supportsSpaces &&
      activeDestination.space &&
      spaces.status === "ready" &&
      !spaces.items.some((item) => item.name === activeDestination.space),
  );
  const customSummary = formatAudienceSummary(state.customDestination.visibility, state.customDestination.space, spaces.items);
  const popupSummary = formatAudienceSummary(state.popupDestination.visibility, state.popupDestination.space, spaces.items);

  return (
    <Field.Root name="quick-save-destination">
      <Fieldset.Root
        render={
          <RadioGroup
            value={state.mode}
            onValueChange={(value) => void saveMode(value)}
            disabled={!loaded || saving}
            aria-busy={(!loaded && !error) || saving}
          />
        }
      >
        <Fieldset.Legend>{t("optionsQuickSaveDestination")}</Fieldset.Legend>
        <Field.Description>{t("optionsQuickSaveDescription")}</Field.Description>
        <Field.Item className="flex-col items-start gap-1">
          <Field.Label>
            <Radio value="follow-popup" /> {t("optionsQuickSaveFollowPopup")}
          </Field.Label>
          <p className="mu-caption ps-6 text-mu-ink-muted">{t("optionsQuickSaveFollowPopupDescription")}</p>
          {state.mode === "follow-popup" && loaded && connectionKey ? (
            <p className="mu-caption ps-6 text-mu-ink-muted">{t("optionsQuickSaveCurrentPopup", popupSummary)}</p>
          ) : null}
        </Field.Item>
        <Field.Item className="flex-col items-start gap-1">
          <Field.Label>
            <Radio value="custom" /> {t("optionsQuickSaveCustom")}
          </Field.Label>
          <p className="mu-caption ps-6 text-mu-ink-muted">{t("optionsQuickSaveCustomDescription")}</p>
        </Field.Item>
      </Fieldset.Root>
      {state.mode === "custom" ? (
        <div className="mt-3 ps-6">
          <AudienceMenu
            visibility={state.customDestination.visibility}
            space={state.customDestination.space}
            spaces={spaces}
            supportsSpaces={supportsSpaces}
            popupSide="bottom"
            triggerClassName="min-w-0 max-w-72 justify-start"
            triggerAriaLabel={t("popupAudienceLabel", [t("optionsQuickSaveCustomLabel"), customSummary])}
            disabled={!loaded || saving}
            onVisibilityChange={(value) => void saveCustomDestination(applyVisibilityChange(state.customDestination, value))}
            onSpaceChange={(space) => void saveCustomDestination(applySpaceChange(state.customDestination, space))}
            onRetry={reloadSpaces}
          />
        </div>
      ) : null}
      {activeSpaceUnavailable ? (
        <p role="status" className="mu-caption mt-2 ps-6 text-mu-danger">
          {t("errorSpaceUnavailableFix")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mu-caption mt-2 text-mu-danger">
          {t(error)}
        </p>
      ) : null}
    </Field.Root>
  );
}
