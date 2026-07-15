import browser from "webextension-polyfill";
import { selectionToHtml } from "@/lib/capture";
import type { Request, SelectionClip } from "@/lib/messages";

// The popup's capture doesn't go through this script — it injects its own function via
// scripting.executeScript so it works even when this script is stale (pre-update tabs).
// This script serves the context-menu flow: selection→markdown, clearing, and the save toast.

/**
 * Renders the current selection for a context-menu save. Images are pulled out (as absolute URLs,
 * for the background to upload as attachments) and removed from the HTML so they aren't also emitted
 * as inline remote-image markdown — the memo carries them as real attachments instead.
 */
async function clipSelection(): Promise<SelectionClip> {
  const html = selectionToHtml(window.getSelection());
  if (!html) return { markdown: "", images: [] };
  const container = document.createElement("div");
  container.innerHTML = html;
  const imgs = Array.from(container.querySelectorAll("img"));
  // img.src resolves to an absolute URL; keep only what the background can fetch (http(s)/data:).
  const images = imgs.map((img) => img.src).filter((src) => /^(https?|data):/i.test(src));
  for (const img of imgs) img.remove();
  // Turndown is loaded lazily: this script runs on every page, but markdown conversion is only
  // needed on the rare context-menu save — keep the per-page cost to this thin shell.
  const { htmlToMarkdown } = await import("@/lib/format");
  // Same {{description}} source as the popup capture, so both paths compose identically.
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
  return { markdown: htmlToMarkdown(container.innerHTML), images, description };
}

let toastHost: HTMLElement | null = null;

/**
 * In-page save feedback for the context-menu flow (the toolbar badge alone is too easy to miss).
 * Rendered in a shadow root so page CSS can't restyle it and ours can't leak out; follows the
 * page's own light/dark preference. Warm theme to match the extension.
 */
function showSaveToast({ ok, title, webUrl }: { ok: boolean; title: string; webUrl?: string }): void {
  toastHost?.remove();
  const host = document.createElement("div");
  toastHost = host;
  host.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .toast{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;color:#1f1e1d;
      border:1px solid rgba(31,30,29,.12);border-radius:10px;box-shadow:0 6px 24px rgba(31,30,29,.14);
      font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      opacity:0;transform:translateY(8px);transition:opacity .18s ease-out,transform .18s ease-out}
    .toast.show{opacity:1;transform:none}
    .dot{display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;
      background:#c96442;color:#fff;font-size:11px;flex:none}
    .err .dot{background:#dc2626}
    a{color:#c96442;font-weight:500;text-decoration:none;margin-left:2px}
    a:hover{text-decoration:underline}
    @media (prefers-color-scheme:dark){
      .toast{background:#30302e;color:#f5f4ef;border-color:rgba(245,244,239,.14);box-shadow:0 6px 24px rgba(0,0,0,.4)}
      a{color:#e08d6d}
    }`;
  const toast = document.createElement("div");
  toast.className = ok ? "toast" : "toast err";
  toast.setAttribute("role", "status");
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.textContent = ok ? "✓" : "!";
  const text = document.createElement("span");
  text.textContent = title;
  toast.append(dot, text);
  if (webUrl) {
    const open = document.createElement("a");
    open.href = webUrl;
    open.target = "_blank";
    open.rel = "noreferrer";
    open.textContent = "Open";
    toast.append(open);
  }
  shadow.append(style, toast);
  document.documentElement.appendChild(host);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(
    () => {
      toast.classList.remove("show");
      setTimeout(() => host.remove(), 200);
    },
    ok ? 3500 : 6000,
  );
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const req = message as Request;
  if (req?.type === "GET_SELECTION") {
    return clipSelection();
  }
  if (req?.type === "SHOW_SAVE_RESULT") {
    showSaveToast(req);
    return undefined;
  }
  if (req?.type === "CLEAR_SELECTION") {
    // Drop the highlight and unfocus after a save so the page returns to a clean state.
    window.getSelection()?.removeAllRanges();
    (document.activeElement as HTMLElement | null)?.blur?.();
    return undefined;
  }
  return undefined;
});
