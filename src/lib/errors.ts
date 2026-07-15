import { MIN_SUPPORTED_VERSION_LABEL } from "./versions";

/** Failure modes of an actual HTTP request to the user's Memos instance. */
export type InstanceErrorKind =
  | "mixed-content"
  | "cors"
  | "unreachable"
  | "unauthorized"
  | "timeout"
  | "bad-response"
  | "unsupported-version";

/** Client-side preconditions that fail before any request is made. */
export type ClientErrorKind = "not-configured" | "auth-changed" | "extension-error" | "invalid-url";

/** Everything a save attempt can report back to the UI. */
export type SaveErrorKind = InstanceErrorKind | ClientErrorKind;

export type SaveErrorDetail = {
  kind: SaveErrorKind;
  title: string;
  why: string;
  howToFix: string[];
  /**
   * Where the fix lives, so the UI can offer a button instead of prose:
   * "settings" → the connection/config is broken (reconnect in options); "retry" → transient, try again.
   */
  primaryAction: "settings" | "retry";
  /** Optional external guide (e.g. the upgrade docs) surfaced as a link by the UI. */
  learnMore?: { label: string; url: string };
};

/** The Memos self-host upgrade guide, linked when the instance is too old. */
export const MEMOS_UPGRADE_DOCS_URL = "https://www.usememos.com/docs/operations/upgrade";

export class InstanceError extends Error {
  readonly kind: InstanceErrorKind;
  constructor(kind: InstanceErrorKind) {
    super(kind);
    this.name = "InstanceError";
    this.kind = kind;
  }
}

/** Maps a thrown error to the SaveErrorKind the UI can describe. */
export function toSaveErrorKind(error: unknown): SaveErrorKind {
  return error instanceof InstanceError ? error.kind : "bad-response";
}

export function describeSaveError(kind: SaveErrorKind): SaveErrorDetail {
  switch (kind) {
    case "invalid-url":
      return {
        kind,
        primaryAction: "settings",
        title: "Invalid instance URL",
        why: "The destination must be a complete http:// or https:// address without embedded credentials, a query, or a fragment.",
        howToFix: ["Enter the address you use to open Memos, such as https://memos.example.com."],
      };
    case "extension-error":
      return {
        kind,
        primaryAction: "retry",
        title: "The extension stopped responding",
        why: "The popup couldn't reach its background service worker, so the save result is unknown.",
        howToFix: ["Keep this popup open and try again; your draft is still here."],
      };
    case "auth-changed":
      return {
        kind,
        primaryAction: "retry",
        title: "Your account changed",
        why: "The signed-in account or Memos destination changed after this popup opened.",
        howToFix: ["Review the current account, then try saving again."],
      };
    case "not-configured":
      return {
        kind,
        primaryAction: "settings",
        title: "No Memos instance connected",
        why: "You haven't connected a Memos instance to the clipper yet.",
        howToFix: ["Open the extension settings and connect your instance URL and access token."],
      };
    case "mixed-content":
      return {
        kind,
        primaryAction: "settings",
        title: "Your instance uses http://",
        why: "Browsers block https pages from calling http:// addresses.",
        howToFix: ["Serve your Memos instance over https.", "Reconnect after switching to the https URL."],
      };
    case "cors":
      return {
        kind,
        primaryAction: "settings",
        title: "Your instance blocked the request (CORS)",
        why: "The server is reachable but didn't allow the extension to read the response.",
        howToFix: ["Confirm the instance is online and reachable.", "Try reconnecting from usememos.com."],
      };
    case "unreachable":
      return {
        kind,
        primaryAction: "retry",
        title: "Couldn't reach your instance",
        why: "The request never got a response from the server.",
        howToFix: ["Check the instance is online.", "Open the instance URL in a tab to confirm it loads."],
      };
    case "unauthorized":
      return {
        kind,
        primaryAction: "settings",
        title: "Access token rejected",
        why: "The instance returned 401/403 — the token is invalid or expired.",
        howToFix: ["Sign in to usememos.com and reconnect.", "If it persists, regenerate your access token in Memos settings."],
      };
    case "timeout":
      return {
        kind,
        primaryAction: "retry",
        title: "Your instance timed out",
        why: "The server didn't respond in time.",
        howToFix: ["Check the server is online and not overloaded.", "Try again in a moment."],
      };
    case "unsupported-version":
      return {
        kind,
        primaryAction: "settings",
        title: "Unsupported Memos version",
        why: `This clipper needs Memos ${MIN_SUPPORTED_VERSION_LABEL} or a newer stable 0.x release to match the API it uses.`,
        howToFix: [`Update your Memos instance to ${MIN_SUPPORTED_VERSION_LABEL} or a newer stable 0.x release, then reconnect.`],
        learnMore: { label: "How to upgrade Memos", url: MEMOS_UPGRADE_DOCS_URL },
      };
    case "bad-response":
      return {
        kind: "bad-response",
        primaryAction: "settings",
        title: "Unexpected response",
        why: "The instance returned something that isn't a valid API response.",
        howToFix: ["Confirm the URL points at your Memos API.", "If your server redirects, use the final URL."],
      };
    default: {
      // Exhaustiveness guard: if a new InstanceErrorKind is added without a case, this fails to compile.
      const _exhaustive: never = kind;
      void _exhaustive;
      return describeSaveError("bad-response");
    }
  }
}
