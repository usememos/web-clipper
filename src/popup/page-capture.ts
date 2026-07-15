import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { htmlToMarkdown, toQuotedMarkdown } from "@/lib/format";
import type { CapturePayload } from "@/lib/messages";

/** The raw capture, template-independent — composed into the editor prefill once the template loads. */
export type PageCapture = {
  title: string;
  url: string;
  description?: string;
  /** The selection as quoted Markdown ("" when there's no selection). */
  selectionMarkdown: string;
  /** Absolute image URLs from the selection, to upload as attachments. */
  images: string[];
  /** Why capture degraded, so the popup can explain a link-only/manual result. */
  fallbackReason?: CaptureFallbackReason;
};

export type CaptureFallbackReason = "no-description" | "restricted" | "timed-out" | "unavailable";

/** Keeps total capture comfortably inside the MVP's five-second interaction budget. */
export const TAB_QUERY_TIMEOUT_MS = 750;
export const PAGE_INJECTION_TIMEOUT_MS = 2_000;

class CaptureTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new CaptureTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Runs INSIDE the page via scripting.executeScript, so it must be fully self-contained (Chrome
 * serializes the function; it can't reference imports). Injected fresh on every popup open, it
 * works even when the tab's content script is stale (tab opened before an extension update).
 */
function capturePage(): CapturePayload {
  const selection = window.getSelection();
  let selectionHtml = "";
  let images: string[] = [];
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    // Keep this self-contained: Chrome serializes only `capturePage`, not imported helpers.
    const inlineTags = new Set([
      "A",
      "ABBR",
      "B",
      "BDI",
      "BDO",
      "CITE",
      "CODE",
      "DATA",
      "DEL",
      "DFN",
      "EM",
      "I",
      "INS",
      "KBD",
      "MARK",
      "Q",
      "RUBY",
      "S",
      "SAMP",
      "SMALL",
      "SPAN",
      "STRONG",
      "SUB",
      "SUP",
      "TIME",
      "U",
      "VAR",
    ]);
    const range = selection.getRangeAt(0);
    let ancestor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    let wrapped: Node = range.cloneContents();
    while (ancestor && inlineTags.has(ancestor.tagName)) {
      const clone = ancestor.cloneNode(false) as Element;
      clone.appendChild(wrapped);
      wrapped = clone;
      ancestor = ancestor.parentElement;
    }
    const container = document.createElement("div");
    container.appendChild(wrapped);
    // Images become attachments, never hotlinked markdown: pull them out (absolute URLs the
    // background can fetch) and drop the nodes so Turndown doesn't also emit inline images.
    const imgs = Array.from(container.querySelectorAll("img"));
    images = imgs.map((img) => img.src).filter((src) => /^(https?|data):/i.test(src));
    for (const img of imgs) img.remove();
    selectionHtml = container.innerHTML;
  }
  const normalized = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() || undefined;
  const meta = (s: string) => normalized(document.querySelector<HTMLMetaElement>(s)?.content);
  const firstReadableParagraph = () => {
    for (const paragraph of document.querySelectorAll("p")) {
      if (
        paragraph.hidden ||
        paragraph.getAttribute("aria-hidden") === "true" ||
        paragraph.closest('nav,header,footer,aside,menu,form,dialog,[role="navigation"],[aria-hidden="true"]')
      ) {
        continue;
      }
      const style = getComputedStyle(paragraph);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const text = normalized(paragraph.textContent);
      if (text && text.length >= 40) return text;
    }
    return undefined;
  };
  const description = meta('meta[property="og:description"]') ?? meta('meta[name="description"]') ?? firstReadableParagraph();
  return {
    title: document.title,
    url: location.href,
    selectionHtml: selectionHtml || undefined,
    description,
    images,
  };
}

async function capture(): Promise<PageCapture> {
  let tab: Awaited<ReturnType<typeof browser.tabs.query>>[number] | undefined;
  try {
    [tab] = await withTimeout(browser.tabs.query({ active: true, currentWindow: true }), TAB_QUERY_TIMEOUT_MS);
  } catch (error) {
    return {
      title: "",
      url: "",
      description: undefined,
      selectionMarkdown: "",
      images: [],
      fallbackReason: error instanceof CaptureTimeoutError ? "timed-out" : "unavailable",
    };
  }
  // The tab is the source of truth for title/url; the injected capture enhances it with the
  // selection + description.
  let title = tab?.title ?? "";
  let url = tab?.url ?? "";
  let description: string | undefined;
  let selectionMarkdown = "";
  if (tab?.id !== undefined) {
    try {
      const [injection] = await withTimeout(
        browser.scripting.executeScript({ target: { tabId: tab.id }, func: capturePage }),
        PAGE_INJECTION_TIMEOUT_MS,
      );
      const cap = injection?.result as CapturePayload | null | undefined;
      if (cap) {
        title = title || cap.title;
        url = url || cap.url;
        description = cap.description;
        if (cap.selectionHtml) selectionMarkdown = toQuotedMarkdown(htmlToMarkdown(cap.selectionHtml));
        return {
          title,
          url,
          description,
          selectionMarkdown,
          images: cap.images ?? [],
          ...(!description ? { fallbackReason: "no-description" as const } : {}),
        };
      }
    } catch (error) {
      // Injection refused (chrome://, Web Store…) — the prefill degrades to a link note.
      return {
        title,
        url,
        description,
        selectionMarkdown,
        images: [],
        fallbackReason: error instanceof CaptureTimeoutError ? "timed-out" : "restricted",
      };
    }
  }
  return { title, url, description, selectionMarkdown, images: [], fallbackReason: "unavailable" };
}

/**
 * Runs the capture on first mount and returns it (null while pending). Called at the top of the
 * popup App — above the session-loading gate — so capture proceeds in parallel with session
 * hydration instead of waiting for the signed-in view to mount. By the time the editor renders,
 * the prefill data is usually already here.
 */
export function usePageCapture(): PageCapture | null {
  const [result, setResult] = useState<PageCapture | null>(null);
  useEffect(() => {
    let active = true;
    void capture().then((c) => {
      if (active) setResult(c);
    });
    return () => {
      active = false;
    };
  }, []);
  return result;
}
