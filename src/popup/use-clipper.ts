import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipSaveStatus } from "@/lib/clip-records";
import { composeMemoContent } from "@/lib/format";
import { type DestinationConnection, writeMemoDestination } from "@/lib/memo-destination";
import type { Visibility } from "@/lib/memos-client";
import type { SaveResult } from "@/lib/messages";
import { sendBackgroundRequest } from "@/lib/runtime-client";
import type { PageCapture } from "./page-capture";
import { useMemoDestination } from "./use-memo-destination";

/**
 * The popup's clip state. `capture` is the page capture (started at App mount, in parallel with
 * session loading); this hook composes it into the editor prefill once both the capture and the
 * user's template are available.
 */
type SaveOperation = { requestId: string; startedAt: number };

function newSaveOperation(): SaveOperation {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `clip_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return { requestId, startedAt: Date.now() };
}

export function useClipper(
  capture: PageCapture | null,
  template: string | null,
  templateReady: boolean,
  expectation: DestinationConnection | null,
  supportsSpaces = false,
) {
  const [content, setContent] = useState("");
  const destination = useMemoDestination(expectation, supportsSpaces);
  const { visibility, space, destinationKey } = destination;
  const [busy, setBusy] = useState(false);
  const [savedClip, setSavedClip] = useState<ClipSaveStatus | null>(null);
  const initialized = useRef(false);
  const operation = useRef<SaveOperation | null>(null);
  const images = capture?.images ?? [];

  useEffect(() => {
    if (!capture || !templateReady || initialized.current) return;
    // The rendered template — quoted selection or extracted article, description, linked title —
    // is the editor prefill: what you see is exactly what saves. A selection always wins: it is an
    // explicit choice, where the article is the clipper's guess at what the page is about.
    const prefill = composeMemoContent({
      bodyMarkdown: capture.selectionMarkdown || capture.articleMarkdown,
      title: capture.title,
      url: capture.url,
      description: capture.description,
      template,
    });
    initialized.current = true;
    setContent(prefill);
  }, [capture, template, templateReady]);

  const lookupSavedClip = useCallback(async () => {
    if (!capture?.url || !expectation) {
      return null;
    }
    try {
      return await sendBackgroundRequest({
        type: "GET_CLIP_STATUS",
        sourceUrl: capture.url,
        expectedSource: expectation.source,
        expectedConnectionId: expectation.connectionId,
        expectedInstanceUrl: expectation.instanceUrl,
      });
    } catch {
      return null;
    }
  }, [capture?.url, expectation?.connectionId, expectation?.instanceUrl, expectation?.source]);

  useEffect(() => {
    let active = true;
    setSavedClip(null);
    void lookupSavedClip().then((record) => {
      if (active && record) setSavedClip(record);
    });
    return () => {
      active = false;
    };
  }, [lookupSavedClip]);

  const editContent = useCallback((next: string) => {
    // A late capture/template must never replace typing, including an intentional empty value.
    initialized.current = true;
    operation.current = null;
    setContent(next);
  }, []);

  const changeVisibility = useCallback(
    (next: Visibility) => {
      operation.current = null;
      destination.changeVisibility(next);
    },
    [destination.changeVisibility],
  );

  const changeSpace = useCallback(
    (next?: string) => {
      operation.current = null;
      destination.changeSpace(next);
    },
    [destination.changeSpace],
  );

  const save = useCallback(async (): Promise<SaveResult> => {
    if (!expectation) return { ok: false, errorKind: "not-configured" };
    destination.markTouched();
    if (destination.spaceUnavailable) return { ok: false, errorKind: "space-unavailable" };
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
          ...(space ? { space } : {}),
          expectedSource: expectation.source,
          expectedConnectionId: expectation.connectionId,
          expectedInstanceUrl: expectation.instanceUrl,
          ...(capture?.url
            ? {
                clip: {
                  sourceUrl: capture.url,
                  sourceTitle: capture.title,
                  ...(capture.selectionMarkdown ? { selectionMarkdown: capture.selectionMarkdown } : {}),
                  imageCount: images.length,
                },
              }
            : {}),
          saveRequestId: currentOperation.requestId,
          saveStartedAt: currentOperation.startedAt,
          ...(images.length ? { images } : {}),
        });
      } catch {
        result = { ok: false, errorKind: "extension-error" };
      }
      if (result.ok) {
        operation.current = null;
        if (destinationKey) await writeMemoDestination(destinationKey, { visibility, ...(space ? { space } : {}) }).catch(() => {});
        setSavedClip({ memoUrl: result.webUrl, savedAt: Date.now() });
      }
      return result;
    } finally {
      setBusy(false);
    }
  }, [capture, content, expectation, images, visibility, space, destinationKey, destination.spaceUnavailable]);

  return {
    content,
    setContent: editContent,
    imageCount: images.length,
    captureFallbackReason: capture?.fallbackReason,
    hasSelection: Boolean(capture?.selectionMarkdown),
    hasSource: Boolean(capture?.title || capture?.url),
    visibility,
    setVisibility: changeVisibility,
    space,
    setSpace: changeSpace,
    spaces: destination.spaces,
    spaceUnavailable: destination.spaceUnavailable,
    reloadSpaces: destination.reloadSpaces,
    busy,
    savedClip,
    save,
  };
}
