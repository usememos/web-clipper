import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionSource } from "@/lib/connection-config";
import { composeMemoContent } from "@/lib/format";
import type { Visibility } from "@/lib/memos-client";
import type { SaveResult } from "@/lib/messages";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import { readLastVisibility, writeLastVisibility } from "@/lib/visibility";
import type { PageCapture } from "./page-capture";

/**
 * The popup's clip state. `capture` is the page capture (started at App mount, in parallel with
 * session loading); this hook composes it into the editor prefill once both the capture and the
 * user's template are available.
 */
type SaveExpectation = { source: ConnectionSource; connectionId: string; instanceUrl: string };
type SaveOperation = { requestId: string; startedAt: number };

function newSaveOperation(): SaveOperation {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `clip_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return { requestId, startedAt: Date.now() };
}

export function useClipper(
  capture: PageCapture | null,
  template: string | null,
  templateReady: boolean,
  expectation: SaveExpectation | null,
) {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const visibilityTouched = useRef(false);
  const operation = useRef<SaveOperation | null>(null);
  const images = capture?.images ?? [];

  useEffect(() => {
    let active = true;
    void readLastVisibility().then((stored) => {
      if (active && !visibilityTouched.current) setVisibility(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!capture || !templateReady || initialized.current) return;
    // The rendered template — quoted selection (when present), description, linked title — is the
    // editor prefill: what you see is exactly what saves.
    const prefill = composeMemoContent({
      bodyMarkdown: capture.selectionMarkdown,
      title: capture.title,
      url: capture.url,
      description: capture.description,
      template,
    });
    initialized.current = true;
    setContent(prefill);
  }, [capture, template, templateReady]);

  const editContent = useCallback((next: string) => {
    // A late capture/template must never replace typing, including an intentional empty value.
    initialized.current = true;
    operation.current = null;
    setContent(next);
  }, []);

  const changeVisibility = useCallback((next: Visibility) => {
    visibilityTouched.current = true;
    operation.current = null;
    setVisibility(next);
  }, []);

  const save = useCallback(async (): Promise<SaveResult> => {
    if (!expectation) return { ok: false, errorKind: "not-configured" };
    if (!operation.current) operation.current = newSaveOperation();
    const currentOperation = operation.current;
    setBusy(true);
    try {
      // The editor is the memo: send it verbatim, plus captured images for the background to
      // upload as attachments. The background sources credentials itself from OAuth userinfo.
      let result: SaveResult;
      try {
        result = await sendBackgroundRequest({
          type: "SAVE_MEMO",
          content,
          visibility,
          expectedSource: expectation.source,
          expectedConnectionId: expectation.connectionId,
          expectedInstanceUrl: expectation.instanceUrl,
          saveRequestId: currentOperation.requestId,
          saveStartedAt: currentOperation.startedAt,
          ...(images.length ? { images } : {}),
        });
      } catch {
        result = { ok: false, errorKind: "extension-error" };
      }
      if (result.ok) {
        operation.current = null;
        await writeLastVisibility(visibility).catch(() => {});
      }
      return result;
    } finally {
      setBusy(false);
    }
  }, [content, expectation, images, visibility]);

  return {
    content,
    setContent: editContent,
    imageCount: images.length,
    captureFallbackReason: capture?.fallbackReason,
    hasSelection: Boolean(capture?.selectionMarkdown),
    hasSource: Boolean(capture?.title || capture?.url),
    visibility,
    setVisibility: changeVisibility,
    busy,
    save,
  };
}
