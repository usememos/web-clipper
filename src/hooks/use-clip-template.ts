import { useCallback, useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { t } from "@/lib/i18n";
import { CLIP_TEMPLATE_KEY, readClipTemplate, writeClipTemplate } from "@/lib/template-settings";

type TemplateStorageErrorKey = "templateReadError" | "templateStorageError";

export function useClipTemplate() {
  const [template, setTemplate] = useState<string | null>();
  const [errorKey, setErrorKey] = useState<TemplateStorageErrorKey | null>(null);

  useEffect(() => {
    let active = true;
    void readClipTemplate()
      .then((stored) => {
        if (active) {
          setTemplate(stored);
          setErrorKey(null);
        }
      })
      .catch(() => {
        if (active) {
          setTemplate(null);
          setErrorKey("templateReadError");
        }
      });

    const onChanged = (changes: Record<string, browser.Storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || !changes[CLIP_TEMPLATE_KEY]) return;
      const next = changes[CLIP_TEMPLATE_KEY].newValue;
      setTemplate(typeof next === "string" && next.trim() ? next : null);
      setErrorKey(null);
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
      setErrorKey(null);
    } catch (cause) {
      setErrorKey("templateStorageError");
      throw cause;
    }
  }, []);

  return {
    isLoaded: template !== undefined,
    template: template ?? null,
    error: errorKey ? t(errorKey) : null,
    saveTemplate,
  };
}
