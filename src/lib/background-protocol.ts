import type { Visibility } from "./memos-client";
import type { Request } from "./messages";

export type BackgroundRequest = Extract<Request, { type: "GET_POPUP_STATE" | "OPEN_SIGN_IN" | "SIGN_OUT" | "GET_AUTH_USER" | "SAVE_MEMO" }>;
export type RuntimeSender = { id?: string; url?: string };

const VISIBILITIES = new Set<Visibility>(["PRIVATE", "PROTECTED", "PUBLIC"]);

/** Parse the untrusted JSON boundary before the service worker dispatches privileged work. */
export function parseBackgroundRequest(value: unknown): BackgroundRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Record<string, unknown>;
  if (
    request.type === "GET_POPUP_STATE" ||
    request.type === "OPEN_SIGN_IN" ||
    request.type === "SIGN_OUT" ||
    request.type === "GET_AUTH_USER"
  ) {
    return { type: request.type };
  }
  if (request.type !== "SAVE_MEMO") return null;

  if (typeof request.content !== "string" || !VISIBILITIES.has(request.visibility as Visibility)) return null;
  if (typeof request.expectedUserId !== "string" || !request.expectedUserId) return null;
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
  }

  return {
    type: "SAVE_MEMO",
    content: request.content,
    visibility: request.visibility as Visibility,
    expectedUserId: request.expectedUserId,
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

  if (request.type === "OPEN_SIGN_IN" || request.type === "SIGN_OUT" || request.type === "GET_AUTH_USER") {
    return path === "/src/popup/index.html" || path === "/src/options/index.html";
  }
  return path === "/src/popup/index.html";
}
