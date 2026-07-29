import browser from "webextension-polyfill";
import type { VerifiedMemosUser } from "./connection-config";
import { type MemosCredentials, normalizeInstanceUrl, type Visibility } from "./memos-client";

export const CLIP_RECORDS_KEY = "clipRecordsV1";

export type ClipSelection = {
  markdown: string;
  imageCount: number;
};

export type ClipRecord = {
  schemaVersion: 1;
  id: string;
  dedupeKey: string;
  instanceUrl: string;
  sourceUrl: string;
  sourceTitle: string;
  selection?: ClipSelection;
  memoContent: string;
  visibility: Visibility;
  memoName: string;
  memoUrl: string;
  savedAt: number;
};

export type ClipSaveStatus = Pick<ClipRecord, "memoUrl" | "savedAt">;

export type ClipCaptureInput = {
  sourceUrl: string;
  sourceTitle: string;
  selectionMarkdown?: string;
  imageCount: number;
};

export type ClipConnection =
  | {
      source: "direct";
      connectionId: string;
      credentials: MemosCredentials;
      user: VerifiedMemosUser;
    }
  | {
      source: "usememos";
      connectionId: string;
      credentials: MemosCredentials;
    };

type ClipRecordStore = Record<string, ClipRecord>;

let storageMutation = Promise.resolve();

function queueStorageMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageMutation.then(operation, operation);
  storageMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function isVisibility(value: unknown): value is Visibility {
  return value === "PRIVATE" || value === "PROTECTED" || value === "PUBLIC";
}

function isClipRecord(value: unknown): value is ClipRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.dedupeKey !== "string" ||
    !record.dedupeKey.startsWith("v1:") ||
    typeof record.instanceUrl !== "string" ||
    typeof record.sourceUrl !== "string" ||
    typeof record.sourceTitle !== "string" ||
    typeof record.memoContent !== "string" ||
    !isVisibility(record.visibility) ||
    typeof record.memoName !== "string" ||
    typeof record.memoUrl !== "string" ||
    typeof record.savedAt !== "number" ||
    !Number.isFinite(record.savedAt)
  ) {
    return false;
  }
  if (record.selection === undefined) return true;
  if (!record.selection || typeof record.selection !== "object") return false;
  const selection = record.selection as Record<string, unknown>;
  return (
    typeof selection.markdown === "string" &&
    typeof selection.imageCount === "number" &&
    Number.isInteger(selection.imageCount) &&
    selection.imageCount >= 0
  );
}

async function readClipRecordStore(): Promise<ClipRecordStore> {
  const stored = await browser.storage.local.get(CLIP_RECORDS_KEY);
  const raw = stored[CLIP_RECORDS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, ClipRecord] => isClipRecord(entry[1])),
  );
}

/** User-visible history, newest first. Invalid/corrupt entries are ignored at the storage boundary. */
export async function listClipRecords(): Promise<ClipRecord[]> {
  return Object.values(await readClipRecordStore()).sort((left, right) => right.savedAt - left.savedAt);
}

const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "dclid", "msclkid"]);

/** Conservative v1 URL identity: preserve page semantics and remove only known tracking noise. */
export function normalizeClipSourceUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (!(url.hash.startsWith("#/") || url.hash.startsWith("#!"))) url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function clipDedupeKey(connection: ClipConnection, sourceUrl: string): Promise<string> {
  const accountId = connection.source === "direct" ? connection.user.name : connection.connectionId;
  const identity = [
    connection.source,
    accountId,
    normalizeInstanceUrl(connection.credentials.instanceUrl),
    normalizeClipSourceUrl(sourceUrl),
  ].join("\u0000");
  return `v1:${await sha256Hex(identity)}`;
}

export async function findLatestClipStatus(connection: ClipConnection, sourceUrl: string): Promise<ClipSaveStatus | null> {
  if (!sourceUrl.trim()) return null;
  const records = await listClipRecords();
  if (!records.length) return null;
  const dedupeKey = await clipDedupeKey(connection, sourceUrl);
  const record = records.find((candidate) => candidate.dedupeKey === dedupeKey);
  return record ? { memoUrl: record.memoUrl, savedAt: record.savedAt } : null;
}

export async function recordSuccessfulClip(input: {
  connection: ClipConnection;
  capture: ClipCaptureInput;
  recordId: string;
  memoContent: string;
  visibility: Visibility;
  memoUrl: string;
  savedAt?: number;
}): Promise<void> {
  if (!input.capture.sourceUrl.trim()) return;
  const dedupeKey = await clipDedupeKey(input.connection, input.capture.sourceUrl);
  const selectionMarkdown = input.capture.selectionMarkdown?.trim() ?? "";
  const hasSelection = Boolean(selectionMarkdown || input.capture.imageCount);
  const record: ClipRecord = {
    schemaVersion: 1,
    id: input.recordId,
    dedupeKey,
    instanceUrl: normalizeInstanceUrl(input.connection.credentials.instanceUrl),
    sourceUrl: input.capture.sourceUrl,
    sourceTitle: input.capture.sourceTitle,
    ...(hasSelection ? { selection: { markdown: selectionMarkdown, imageCount: input.capture.imageCount } } : {}),
    memoContent: input.memoContent,
    visibility: input.visibility,
    // Popup saves send recordId as the server's memoId, while memoUrl may use a
    // different public UID. Do not infer the API resource name from the web URL.
    memoName: `memos/${input.recordId}`,
    memoUrl: input.memoUrl,
    savedAt: input.savedAt ?? Date.now(),
  };

  await queueStorageMutation(async () => {
    const records = await readClipRecordStore();
    const previous = records[record.id];
    records[record.id] = previous ? { ...record, savedAt: previous.savedAt } : record;
    await browser.storage.local.set({ [CLIP_RECORDS_KEY]: records });
  });
}
