import { htmlToMarkdown } from "./format";

/**
 * Below this, whatever was found is navigation, a paywall stub, or a card grid — not an article.
 * Falling back to the page description reads better than a truncated fragment of page chrome.
 */
export const MIN_ARTICLE_CHARS = 200;

/** Carries no readable content, but dominates the byte size and parse cost of a modern page. */
const NON_CONTENT_SELECTOR = "script,noscript,template,iframe,object,embed,canvas,svg";

/**
 * Points relative URLs at the page they came from. The popup parses this HTML in the extension's
 * own origin, so without a base every `/appendix` link would resolve to `chrome-extension://`.
 * A base the page declared itself wins, but is made absolute first — a relative one is just as
 * wrong here as no base at all.
 */
function applyBaseUrl(doc: Document, pageUrl: string): void {
  const existing = doc.querySelector("base[href]");
  if (existing) {
    try {
      existing.setAttribute("href", new URL(existing.getAttribute("href") ?? "", pageUrl).href);
      return;
    } catch {
      existing.remove();
    }
  }
  const base = doc.createElement("base");
  base.setAttribute("href", pageUrl);
  doc.head.insertBefore(base, doc.head.firstChild);
}

/**
 * Extracts the page's main content as Markdown, or null when the page has no article worth
 * capturing. The caller hands over a serialized document, so this is testable without a live tab
 * and never touches the page the user is on.
 *
 * The extractor is loaded on demand. It is by far the largest thing the popup can pull in, and a
 * clip started from a selection never needs it — keeping it out of the popup's initial parse is
 * the difference between the popup opening instantly and opening noticeably.
 *
 * Images are dropped rather than kept. The clipper uploads images as memo attachments and never
 * hotlinks them, and a long article can carry dozens — uploading them all on every clip is a
 * separate decision from extracting the text. Figure captions survive, so the prose still reads.
 */
export async function extractArticle(pageHtml: string, pageUrl: string): Promise<string | null> {
  if (!pageHtml.trim()) return null;
  try {
    // Inert document: page-controlled markup is never assigned into a live tree, and nothing in it
    // can execute. Same posture as the context-menu selection path in content.ts.
    const doc = new DOMParser().parseFromString(pageHtml, "text/html");
    if (!doc.head || !doc.body) return null;
    for (const element of doc.querySelectorAll(NON_CONTENT_SELECTOR)) element.remove();
    applyBaseUrl(doc, pageUrl);

    const { default: Defuddle } = await import("defuddle");
    const markdown = htmlToMarkdown(new Defuddle(doc, { url: pageUrl, removeImages: true }).parse()?.content ?? "");
    return markdown.length < MIN_ARTICLE_CHARS ? null : markdown;
  } catch {
    // Extraction is an enhancement layered on the link capture. A page that defeats it — or an
    // extractor chunk that fails to load — degrades to the page description, exactly as before
    // this existed. It must never fail the clip.
    return null;
  }
}
