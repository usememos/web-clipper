import type { ClipCaptureInput } from "./clip-records";
import type { ConnectionSource } from "./connection-config";
import type { Visibility } from "./memos-client";
import type { Request } from "./messages";

export type BackgroundRequest = Extract<
  Request,
  {
    type:
      | "GET_POPUP_STATE"
      | "OPEN_SIGN_IN"
      | "SIGN_OUT"
      | "SELECT_USEMEMOS_SOURCE"
      | "ACTIVATE_USEMEMOS_CONNECTION"
      | "CONNECT_DIRECT"
      | "DISCONNECT_CONNECTION"
      | "GET_AUTH_USER"
      | "GET_CONNECTION_STATE"
      | "GET_CLIP_STATUS"
      | "LIST_CLIP_RECORDS"
      | "SAVE_MEMO";
  }
>;
export type RuntimeSender = { id?: string; url?: string };

const VISIBILITIES = new Set<Visibility>(["PRIVATE", "PROTECTED", "PUBLIC"]);
const MAX_REMOTE_IMAGE_URL_CHARS = 8_192;
const MAX_DATA_IMAGE_URL_CHARS = 14 * 1024 * 1024;
const MAX_TOTAL_IMAGE_SOURCE_CHARS = 16 * 1024 * 1024;
const MAX_CLIP_SOURCE_URL_CHARS = 8_192;
const MAX_CLIP_TITLE_CHARS = 4_096;
const MAX_CLIP_SELECTION_CHARS = 2 * 1024 * 1024;

type ExpectedConnection = {
  expectedSource: ConnectionSource;
  expectedConnectionId: string;
  expectedInstanceUrl: string;
};

function parseExpectedConnection(request: Record<string, unknown>): ExpectedConnection | null {
  if (request.expectedSource !== "direct" && request.expectedSource !== "usememos") return null;
  if (typeof request.expectedConnectionId !== "string" || !request.expectedConnectionId) return null;
  if (typeof request.expectedInstanceUrl !== "string" || !request.expectedInstanceUrl) return null;
  return {
    expectedSource: request.expectedSource,
    expectedConnectionId: request.expectedConnectionId,
    expectedInstanceUrl: request.expectedInstanceUrl,
  };
}

function parseClipCapture(value: unknown): ClipCaptureInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const clip = value as Record<string, unknown>;
  const selectionMarkdown = clip.selectionMarkdown;
  if (typeof clip.sourceUrl !== "string" || clip.sourceUrl.length > MAX_CLIP_SOURCE_URL_CHARS) return null;
  if (typeof clip.sourceTitle !== "string" || clip.sourceTitle.length > MAX_CLIP_TITLE_CHARS) return null;
  if (selectionMarkdown !== undefined && (typeof selectionMarkdown !== "string" || selectionMarkdown.length > MAX_CLIP_SELECTION_CHARS)) {
    return null;
  }
  if (typeof clip.imageCount !== "number" || !Number.isInteger(clip.imageCount) || clip.imageCount < 0 || clip.imageCount > 100) {
    return null;
  }
  return {
    sourceUrl: clip.sourceUrl,
    sourceTitle: clip.sourceTitle,
    ...(selectionMarkdown !== undefined ? { selectionMarkdown } : {}),
    imageCount: clip.imageCount,
  };
}

/** Parse the untrusted JSON boundary before the service worker dispatches privileged work. */
export function parseBackgroundRequest(value: unknown): BackgroundRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Record<string, unknown>;
  if (
    request.type === "GET_POPUP_STATE" ||
    request.type === "OPEN_SIGN_IN" ||
    request.type === "SIGN_OUT" ||
    request.type === "GET_AUTH_USER" ||
    request.type === "LIST_CLIP_RECORDS" ||
    request.type === "SELECT_USEMEMOS_SOURCE" ||
    request.type === "ACTIVATE_USEMEMOS_CONNECTION" ||
    request.type === "DISCONNECT_CONNECTION"
  ) {
    return { type: request.type };
  }
  if (request.type === "CONNECT_DIRECT") {
    if (typeof request.instanceUrl !== "string" || request.instanceUrl.length > 2_048) return null;
    if (typeof request.accessToken !== "string" || request.accessToken.length > 8_192) return null;
    if (request.allowInsecureHttp !== undefined && typeof request.allowInsecureHttp !== "boolean") return null;
    return {
      type: "CONNECT_DIRECT",
      instanceUrl: request.instanceUrl,
      accessToken: request.accessToken,
      ...(request.allowInsecureHttp !== undefined ? { allowInsecureHttp: request.allowInsecureHttp } : {}),
    };
  }
  if (request.type === "GET_CONNECTION_STATE") {
    if (request.refresh !== undefined && typeof request.refresh !== "boolean") return null;
    if (request.source !== undefined && request.source !== "active" && request.source !== "usememos") return null;
    return {
      type: "GET_CONNECTION_STATE",
      ...(request.refresh !== undefined ? { refresh: request.refresh } : {}),
      ...(request.source !== undefined ? { source: request.source } : {}),
    };
  }
  if (request.type === "GET_CLIP_STATUS") {
    if (typeof request.sourceUrl !== "string" || request.sourceUrl.length > MAX_CLIP_SOURCE_URL_CHARS) return null;
    const expected = parseExpectedConnection(request);
    if (!expected) return null;
    return {
      type: "GET_CLIP_STATUS",
      sourceUrl: request.sourceUrl,
      ...expected,
    };
  }
  if (request.type !== "SAVE_MEMO") return null;

  if (typeof request.content !== "string" || !VISIBILITIES.has(request.visibility as Visibility)) return null;
  const expected = parseExpectedConnection(request);
  if (!expected) return null;
  if (
    request.saveRequestId !== undefined &&
    (typeof request.saveRequestId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(request.saveRequestId))
  ) {
    return null;
  }
  if (
    request.saveStartedAt !== undefined &&
    (typeof request.saveStartedAt !== "number" || !Number.isFinite(request.saveStartedAt) || request.saveStartedAt <= 0)
  ) {
    return null;
  }
  if (request.images !== undefined) {
    if (!Array.isArray(request.images) || request.images.length > 100 || !request.images.every((image) => typeof image === "string")) {
      return null;
    }
    const images = request.images as string[];
    if (
      images.some((image) => image.length > (image.startsWith("data:") ? MAX_DATA_IMAGE_URL_CHARS : MAX_REMOTE_IMAGE_URL_CHARS)) ||
      images.reduce((total, image) => total + image.length, 0) > MAX_TOTAL_IMAGE_SOURCE_CHARS
    ) {
      return null;
    }
  }
  const clip = request.clip === undefined ? undefined : parseClipCapture(request.clip);
  if (request.clip !== undefined && !clip) return null;

  return {
    type: "SAVE_MEMO",
    content: request.content,
    visibility: request.visibility as Visibility,
    ...expected,
    ...(clip ? { clip } : {}),
    ...(request.images ? { images: request.images as string[] } : {}),
    ...(request.saveRequestId ? { saveRequestId: request.saveRequestId } : {}),
    ...(request.saveStartedAt ? { saveStartedAt: request.saveStartedAt } : {}),
  };
}

/** Content scripts share the extension ID, so privileged popup commands also require a page URL. */
export function isTrustedBackgroundRequest(request: BackgroundRequest, sender: RuntimeSender, runtimeId: string): boolean {
  if (sender.id !== runtimeId || !sender.url) return false;
  let path: string;
  try {
    const url = new URL(sender.url);
    if (url.protocol === "chrome-extension:") {
      if (url.hostname !== runtimeId) return false;
    } else if (url.protocol !== "moz-extension:") {
      return false;
    }
    path = url.pathname;
  } catch {
    return false;
  }

  if (
    request.type === "GET_CONNECTION_STATE" ||
    request.type === "SELECT_USEMEMOS_SOURCE" ||
    request.type === "ACTIVATE_USEMEMOS_CONNECTION" ||
    request.type === "CONNECT_DIRECT" ||
    request.type === "DISCONNECT_CONNECTION" ||
    request.type === "LIST_CLIP_RECORDS"
  ) {
    return path === "/src/options/index.html";
  }
  if (request.type === "OPEN_SIGN_IN" || request.type === "SIGN_OUT" || request.type === "GET_AUTH_USER") {
    return path === "/src/popup/index.html" || path === "/src/options/index.html";
  }
  return path === "/src/popup/index.html";
}
