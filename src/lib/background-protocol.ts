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
      | "SAVE_MEMO";
  }
>;
export type RuntimeSender = { id?: string; url?: string };

const VISIBILITIES = new Set<Visibility>(["PRIVATE", "PROTECTED", "PUBLIC"]);
const MAX_REMOTE_IMAGE_URL_CHARS = 8_192;
const MAX_DATA_IMAGE_URL_CHARS = 14 * 1024 * 1024;
const MAX_TOTAL_IMAGE_SOURCE_CHARS = 16 * 1024 * 1024;

/** Parse the untrusted JSON boundary before the service worker dispatches privileged work. */
export function parseBackgroundRequest(value: unknown): BackgroundRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Record<string, unknown>;
  if (
    request.type === "GET_POPUP_STATE" ||
    request.type === "OPEN_SIGN_IN" ||
    request.type === "SIGN_OUT" ||
    request.type === "GET_AUTH_USER" ||
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
  if (request.type !== "SAVE_MEMO") return null;

  if (typeof request.content !== "string" || !VISIBILITIES.has(request.visibility as Visibility)) return null;
  if (request.expectedSource !== "direct" && request.expectedSource !== "usememos") return null;
  if (typeof request.expectedConnectionId !== "string" || !request.expectedConnectionId) return null;
  if (typeof request.expectedInstanceUrl !== "string" || !request.expectedInstanceUrl) return null;
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

  return {
    type: "SAVE_MEMO",
    content: request.content,
    visibility: request.visibility as Visibility,
    expectedSource: request.expectedSource,
    expectedConnectionId: request.expectedConnectionId,
    expectedInstanceUrl: request.expectedInstanceUrl,
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
    request.type === "DISCONNECT_CONNECTION"
  ) {
    return path === "/src/options/index.html";
  }
  if (request.type === "OPEN_SIGN_IN" || request.type === "SIGN_OUT" || request.type === "GET_AUTH_USER") {
    return path === "/src/popup/index.html" || path === "/src/options/index.html";
  }
  return path === "/src/popup/index.html";
}
