import { useCallback, useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { AI_MAX_INPUT_CHARS, AI_SETTINGS_KEY, type AiClip, type AiError, type AiPreferences, DEFAULT_AI_PREFERENCES } from "@/lib/ai";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import type { PageCapture } from "./page-capture";

export type AiState = {
  status: "off" | "loading" | "idle" | "generating" | "ready" | "error";
  clip?: AiClip;
  preferences?: AiPreferences;
  error?: AiError;
  fromCache?: boolean;
};
export function useAiClip(capture: PageCapture | null, ready: boolean) {
  const [state, setState] = useState<AiState>({ status: "off" });
  const [attempt, setAttempt] = useState(0);
  const [settingsEpoch, setSettingsEpoch] = useState(0);
  const currentRun = useRef(0);
  const request = useRef<string | null>(null);
  const sourceContent = capture?.selectionMarkdown || capture?.articleMarkdown || "";
  const title = capture?.title ?? "";
  const hasCapture = capture !== null;

  const cancel = useCallback(() => {
    currentRun.current += 1;
    if (request.current) void sendBackgroundRequest({ type: "CANCEL_AI_CLIP", requestId: request.current }).catch(() => {});
    request.current = null;
    setState((previous) => ({ ...previous, status: "idle", error: undefined }));
  }, []);
  useEffect(() => {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && AI_SETTINGS_KEY in changes) {
        setAttempt(0);
        setSettingsEpoch((value) => value + 1);
      }
    };
    browser.storage.onChanged.addListener(changed);
    window.addEventListener("pagehide", cancel);
    return () => {
      browser.storage.onChanged.removeListener(changed);
      window.removeEventListener("pagehide", cancel);
    };
  }, [cancel]);

  useEffect(() => {
    const version = ++currentRun.current;
    let active = true;
    let ownedRequest: string | null = null;
    const isCurrent = () => active && currentRun.current === version;
    if (!hasCapture || !ready) {
      setState({ status: "off" });
      return;
    }
    setState((previous) => ({ ...previous, status: "loading", error: undefined }));
    void (async () => {
      try {
        const settings = await sendBackgroundRequest({ type: "GET_AI_SETTINGS" });
        if (!isCurrent()) return;
        if (!settings?.ok) {
          setState(settings ? { status: "error", error: "settings" } : { status: "off" });
          return;
        }
        if (!settings.settings.enabled) {
          setState({ status: "off" });
          return;
        }
        const preferences = settings.settings.preferences ?? DEFAULT_AI_PREFERENCES;
        if (!sourceContent.trim()) {
          setState({ status: "error", error: "no-content" });
          return;
        }
        if (sourceContent.length > AI_MAX_INPUT_CHARS) {
          setState({ status: "error", error: "too-long" });
          return;
        }
        if (!preferences.automatic && attempt === 0) {
          setState({ status: "idle" });
          return;
        }
        setState((previous) => ({ ...previous, status: "generating", error: undefined }));
        ownedRequest = crypto.randomUUID();
        request.current = ownedRequest;
        const result = await sendBackgroundRequest({
          type: "GENERATE_AI_CLIP",
          title,
          content: sourceContent,
          requestId: ownedRequest,
          bypassCache: attempt > 0,
        });
        if (request.current === ownedRequest) request.current = null;
        ownedRequest = null;
        if (!isCurrent()) return;
        if (result?.ok) setState({ status: "ready", clip: result.clip, preferences: result.preferences, fromCache: result.fromCache });
        else if (result?.error === "disabled") setState({ status: "off" });
        else if (result?.error === "cancelled") setState((previous) => ({ ...previous, status: "idle" }));
        else {
          const error = result?.error ?? "unavailable";
          setState((previous) => ({ ...previous, status: "error", error }));
        }
      } catch {
        if (isCurrent()) setState((previous) => ({ ...previous, status: "error", error: "unavailable" }));
      }
    })();
    return () => {
      active = false;
      // No request starts until the settings await resolves, so StrictMode's initial cleanup
      // cannot cancel or duplicate the actual request. A real popup close aborts its request.
      if (ownedRequest) {
        void sendBackgroundRequest({ type: "CANCEL_AI_CLIP", requestId: ownedRequest }).catch(() => {});
        if (request.current === ownedRequest) request.current = null;
      }
    };
  }, [hasCapture, ready, sourceContent, title, attempt, settingsEpoch]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry, cancel };
}
