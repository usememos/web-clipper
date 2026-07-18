import { useCallback, useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { CLIP_TEMPLATE_KEY, readClipTemplate, writeClipTemplate } from "@/lib/template-settings";

export function useClipTemplate() {
  const [template, setTemplate] = useState<string | null>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readClipTemplate()
      .then((stored) => {
        if (active) {
          setTemplate(stored);
          setError(null);
        }
      })
      .catch(() => {
        if (active) {
          setTemplate(null);
          setError("The saved template couldn't be read. The default is shown for now.");
        }
      });

    const onChanged = (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || !changes[CLIP_TEMPLATE_KEY]) return;
      const next = changes[CLIP_TEMPLATE_KEY].newValue;
      setTemplate(typeof next === "string" && next.trim() ? next : null);
      setError(null);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const saveTemplate = useCallback(async (next: string | null) => {
    const normalized = next?.trim() ? next : null;
    try {
      await writeClipTemplate(normalized);
      setTemplate(normalized);
      setError(null);
    } catch (cause) {
      setError("The template couldn't be saved to this browser. Please try again.");
      throw cause;
    }
  }, []);

  return { isLoaded: template !== undefined, template: template ?? null, error, saveTemplate };
}
