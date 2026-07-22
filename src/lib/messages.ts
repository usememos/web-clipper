import type { OAuthIdentity } from "@/auth/oauth-session";
import type { ConnectionSource } from "./connection-config";
import type { SaveErrorKind } from "./errors";
import type { Visibility } from "./memos-client";
import type { PopupState } from "./popup-state";

export type CapturePayload = {
  title: string;
  url: string;
  selectionHtml?: string;
  /** The page's own summary (og:description / meta description). */
  description?: string;
  /** Absolute URLs of images found in the selection — uploaded as attachments, never hotlinked. */
  images?: string[];
};

/** The current selection rendered for the context-menu save: text as markdown, images pulled out
 * so the background can upload them as memo attachments (absolute URLs; markdown has no `<img>`).
 * Carries the page description so both capture paths compose identically. */
export type SelectionClip = { markdown: string; images: string[]; description?: string };

export type Request =
  | { type: "GET_SELECTION" } // background → content script: markdown + image URLs for the selection
  | { type: "CLEAR_SELECTION" } // background → content script: drop the page selection after a save
  | { type: "SHOW_SAVE_RESULT"; ok: boolean; title: string; webUrl?: string } // background → content script: in-page toast
  | { type: "OPEN_SIGN_IN" }
  | { type: "SIGN_OUT" }
  | { type: "SELECT_USEMEMOS_SOURCE" }
  | { type: "ACTIVATE_USEMEMOS_CONNECTION" }
  | { type: "CONNECT_DIRECT"; instanceUrl: string; accessToken: string; allowInsecureHttp?: boolean }
  | { type: "DISCONNECT_CONNECTION" }
  | { type: "GET_AUTH_USER" }
  | { type: "GET_CONNECTION_STATE"; refresh?: boolean; source?: "active" | "usememos" }
  | { type: "GET_POPUP_STATE" }
  | { type: "AUTH_CHANGED" } // background → extension pages: OAuth session or settings changed
  // Credentials are NOT part of save messages: the background sources them from the active provider.
  | {
      type: "SAVE_MEMO";
      content: string;
      visibility: Visibility;
      images?: string[];
      expectedSource: ConnectionSource;
      expectedConnectionId: string;
      expectedInstanceUrl: string;
      /** Stable across retries of one logical save; lets the worker reconcile an ambiguous POST. */
      saveRequestId?: string;
      /** Wall-clock start of the first attempt, used to identify a newly-created exact match. */
      saveStartedAt?: number;
    };

export type PopupStateResult = PopupState;

export type AuthUserResult = OAuthIdentity | null;

export type MemosConnectionStatus = "disconnected" | "invalid" | "unsupported" | "error" | "ready";

/** Sanitized options-page state: credentials never leave the background service worker. */
export type ConnectionStateResult = {
  source: ConnectionSource | null;
  instanceUrl: string | null;
  version: string | null;
  displayName: string | null;
  status: MemosConnectionStatus;
  verificationError: SaveErrorKind | null;
  isUsingCachedVersion: boolean;
};

export type ConnectionActionResult = { ok: true; state: ConnectionStateResult } | { ok: false; errorKind: SaveErrorKind };

export type SaveResult =
  // failedImages: how many captured images could not be uploaded — surfaced so success is never silently partial.
  { ok: true; webUrl: string; failedImages?: number } | { ok: false; errorKind: SaveErrorKind };
