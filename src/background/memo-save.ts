import browser from "webextension-polyfill";
import { getOAuthUser, OAuthUnavailableError, type OAuthUser } from "@/auth/oauth-session";
import { readCredentials } from "@/lib/connection";
import { toSaveErrorKind } from "@/lib/errors";
import { composeMemoContent, toQuotedMarkdown } from "@/lib/format";
import {
  createAttachment,
  createMemo,
  getCurrentUser,
  listRecentMemos,
  type MemosCredentials,
  memoWebUrl,
  type Visibility,
} from "@/lib/memos-client";
import type { SaveResult, SelectionClip } from "@/lib/messages";

export type SaveExpectation = { userId: string; instanceUrl: string };
export type SaveOperation = { requestId: string; startedAt: number; serverMemoId?: string };

export const SAVE_ATTEMPTS_KEY = "memoSaveAttemptsV1";
const ATTEMPT_TTL_MS = 15 * 60_000;
const RECONCILIATION_CLOCK_SKEW_MS = 5_000;

type AttemptRecord = {
  fingerprint: string;
  startedAt: number;
  attachmentNames?: string[];
  failedImages?: number;
  result?: Extract<SaveResult, { ok: true }>;
};

type AttemptStore = Record<string, AttemptRecord>;
const inFlight = new Map<string, Promise<SaveResult>>();

export async function clearMemoSaveAttempts(): Promise<void> {
  inFlight.clear();
  await browser.storage.local.remove(SAVE_ATTEMPTS_KEY);
}

function saveFingerprint(content: string, visibility: Visibility, expected: SaveExpectation, images: string[]): string {
  const value = [content, visibility, expected.userId, expected.instanceUrl, ...images].join("\u0000");
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length.toString(36)}_${(hash >>> 0).toString(36)}`;
}

async function readAttempts(): Promise<AttemptStore> {
  const stored = await browser.storage.local.get(SAVE_ATTEMPTS_KEY);
  const raw = stored[SAVE_ATTEMPTS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(raw as AttemptStore).filter(([, attempt]) => attempt && now - attempt.startedAt <= ATTEMPT_TTL_MS),
  );
}

async function writeAttempt(requestId: string, attempt: AttemptRecord | null): Promise<void> {
  const attempts = await readAttempts();
  if (attempt) attempts[requestId] = attempt;
  else delete attempts[requestId];
  await browser.storage.local.set({ [SAVE_ATTEMPTS_KEY]: attempts });
}

/** Source fresh credentials and reject stale optimistic identity before any external write. */
export async function savePopupMemo(
  content: string,
  visibility: Visibility,
  images: string[],
  expected: SaveExpectation,
  operation: SaveOperation = { requestId: `legacy_${Date.now()}_${Math.random().toString(36).slice(2)}`, startedAt: Date.now() },
): Promise<SaveResult> {
  let user: OAuthUser | null;
  try {
    user = await getOAuthUser();
  } catch (error) {
    if (error instanceof OAuthUnavailableError) return { ok: false, errorKind: "auth-unavailable" };
    throw error;
  }
  const credentials = readCredentials(user?.unsafeMetadata);
  if (!credentials) return { ok: false, errorKind: "not-configured" };
  if (user?.id !== expected.userId || credentials.instanceUrl !== expected.instanceUrl) {
    return { ok: false, errorKind: "auth-changed" };
  }
  const running = inFlight.get(operation.requestId);
  if (running) return running;

  const save = savePopupMemoOnce(content, visibility, images, expected, operation, credentials).finally(() => {
    inFlight.delete(operation.requestId);
  });
  inFlight.set(operation.requestId, save);
  return save;
}

async function savePopupMemoOnce(
  content: string,
  visibility: Visibility,
  images: string[],
  expected: SaveExpectation,
  operation: SaveOperation,
  credentials: MemosCredentials,
): Promise<SaveResult> {
  const fingerprint = saveFingerprint(content, visibility, expected, images);
  const previous = (await readAttempts())[operation.requestId];
  if (previous && previous.fingerprint !== fingerprint) return { ok: false, errorKind: "bad-response" };
  if (previous?.result) return previous.result;

  // An existing unfinished record means an earlier POST may have succeeded without its response
  // reaching the popup (or the MV3 worker may have stopped immediately afterward). Reconcile first.
  if (previous) {
    try {
      const currentUser = await getCurrentUser(credentials);
      const recent = await listRecentMemos(credentials, 20, currentUser.name);
      const match = recent.find(
        (memo) =>
          memo.content === content &&
          memo.visibility === visibility &&
          Date.parse(memo.createTime) >= operation.startedAt - RECONCILIATION_CLOCK_SKEW_MS,
      );
      if (match) {
        const result: Extract<SaveResult, { ok: true }> = {
          ok: true,
          webUrl: memoWebUrl(credentials.instanceUrl, match),
          ...(previous.failedImages ? { failedImages: previous.failedImages } : {}),
        };
        await writeAttempt(operation.requestId, { ...previous, result });
        return result;
      }
    } catch (error) {
      // Do not issue another create while reconciliation itself is unavailable.
      return { ok: false, errorKind: toSaveErrorKind(error) };
    }
  }

  let attempt: AttemptRecord = previous ?? { fingerprint, startedAt: operation.startedAt };
  await writeAttempt(operation.requestId, attempt);

  let names = attempt.attachmentNames;
  let failed = attempt.failedImages ?? 0;
  if (!names) {
    const uploaded = await uploadImages(images, credentials);
    names = uploaded.names;
    failed = uploaded.failed;
    attempt = { ...attempt, attachmentNames: names, failedImages: failed };
    await writeAttempt(operation.requestId, attempt);
  }

  const result = await createMemoWithAttachments(content, names, credentials, visibility, operation.serverMemoId);
  if (result.ok) {
    const success = failed > 0 ? { ...result, failedImages: failed } : result;
    await writeAttempt(operation.requestId, { ...attempt, result: success });
    return success;
  }

  // Keep only outcomes where the POST may have reached the server. Definite precondition/auth
  // failures start a clean operation on the next attempt.
  if (!new Set(["timeout", "cors", "unreachable", "bad-response"]).has(result.errorKind)) {
    await writeAttempt(operation.requestId, null);
  }
  return result;
}

const MAX_IMAGES_PER_CLIP = 10;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024;
const SAFE_IMAGE_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const PRIVATE_HOST_SUFFIXES = [".corp", ".home", ".internal", ".lan", ".local", ".localdomain"];

function blockedIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function blockedImageHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return true;
  }
  if (blockedIpv4(host)) return true;
  // Single-label hostnames normally resolve through a private DNS search domain. IPv4-mapped
  // IPv6 literals are blocked as a class so alternate spellings cannot bypass the IPv4 ranges.
  if (!host.includes(".") && !host.includes(":")) return true;
  return host === "::" || host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || /(^|:)ffff:/.test(host);
}

function validImageSource(srcUrl: string): URL | null {
  if (!srcUrl || srcUrl.length > MAX_DATA_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(srcUrl);
  } catch {
    return null;
  }
  if (url.protocol === "data:") return /^data:image\/[a-z0-9.+-]+[;,]/i.test(srcUrl) ? url : null;
  if (url.protocol !== "https:" || url.username || url.password || blockedImageHostname(url.hostname)) return null;
  return url;
}

async function readImageBytes(response: Response): Promise<{ bytes: Uint8Array; type: string } | null> {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  // SVG and arbitrary image/* subtypes can carry active content. Only passive raster formats
  // that browsers and Memos serve safely are accepted as attachments.
  if (!SAFE_IMAGE_TYPES.has(type)) return null;

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) return null;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength <= MAX_IMAGE_BYTES ? { bytes, type } : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, type };
}

async function uploadImages(images: string[], credentials: MemosCredentials): Promise<{ names: string[]; failed: number }> {
  const capped = images.slice(0, MAX_IMAGES_PER_CLIP);
  const names: string[] = [];
  // Sequential downloads keep the peak memory bounded to one decoded/base64 image.
  for (const src of capped) {
    const name = await uploadImageAttachment(src, credentials);
    if (name) names.push(name);
  }
  return { names, failed: images.length - names.length };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function imageFilename(srcUrl: string, type: string): string {
  try {
    const base = new URL(srcUrl).pathname.split("/").pop();
    if (base && /\.\w+$/.test(base)) return decodeURIComponent(base);
  } catch {
    // data: URL or non-URL — fall through to a generated name.
  }
  const ext = type.split("/")[1]?.split("+")[0] || "png";
  return `clip.${ext}`;
}

async function uploadImageAttachment(srcUrl: string, credentials: MemosCredentials): Promise<string | null> {
  const source = validImageSource(srcUrl);
  if (!source) return null;
  try {
    const res = await fetch(source, {
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const image = await readImageBytes(res);
    if (!image) return null;
    const content = bytesToBase64(image.bytes);
    const attachment = await createAttachment(credentials, {
      filename: imageFilename(source.toString(), image.type),
      type: image.type,
      content,
    });
    return attachment.name;
  } catch (error) {
    const errorName = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "Error";
    console.warn("[memos-web-clipper] image attachment failed", { origin: source.origin, errorName });
    return null;
  }
}

export async function saveSelectionClip(
  clip: SelectionClip,
  title: string,
  url: string,
  credentials: MemosCredentials,
  template: string | null,
): Promise<SaveResult> {
  const { names, failed } = await uploadImages(clip.images, credentials);
  if (!clip.markdown && names.length === 0) return { ok: false, errorKind: "bad-response" };
  const content = composeMemoContent({
    bodyMarkdown: toQuotedMarkdown(clip.markdown),
    title,
    url,
    description: clip.description,
    template,
  });
  const result = await createMemoWithAttachments(content, names, credentials, "PRIVATE");
  return result.ok && failed > 0 ? { ...result, failedImages: failed } : result;
}

async function createMemoWithAttachments(
  content: string,
  attachmentNames: string[],
  credentials: MemosCredentials,
  visibility: Visibility,
  memoId?: string,
): Promise<SaveResult> {
  try {
    const memo = await createMemo(credentials, {
      content,
      visibility,
      ...(memoId ? { memoId } : {}),
      ...(attachmentNames.length ? { attachments: attachmentNames.map((name) => ({ name })) } : {}),
    });
    return { ok: true, webUrl: memoWebUrl(credentials.instanceUrl, memo) };
  } catch (error) {
    const errorKind = toSaveErrorKind(error);
    const errorName = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "Error";
    console.error("[memos-web-clipper] save failed", { errorKind, errorName });
    return { ok: false, errorKind };
  }
}
