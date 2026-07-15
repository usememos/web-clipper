import { InstanceError } from "./errors";

export type MemosCredentials = { instanceUrl: string; accessToken: string };
export type Visibility = "PRIVATE" | "PROTECTED" | "PUBLIC";

export const INSTANCE_REQUEST_TIMEOUT_MS = 8000;

/** The CORS-vs-unreachable probe uses a short fixed budget, independent of the caller's timeout. */
const PROBE_TIMEOUT_MS = 3000;

export type InstanceFetchDeps = {
  fetchImpl?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  pageProtocol?: string;
  timeoutMs?: number;
};

/** Strips trailing slashes so a base URL can be concatenated with an absolute path. */
export function normalizeInstanceUrl(instanceUrl: string): string {
  return instanceUrl.replace(/\/+$/, "");
}

export function isValidInstanceUrl(instanceUrl: string): boolean {
  try {
    const url = new URL(instanceUrl);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function buildUrl(instanceUrl: string, path: string): string {
  return `${normalizeInstanceUrl(instanceUrl)}${path}`;
}

function currentProtocol(deps: InstanceFetchDeps): string {
  if (deps.pageProtocol) return deps.pageProtocol;
  return typeof self !== "undefined" && "location" in self ? self.location.protocol : "https:";
}

async function isReachable(instanceUrl: string, deps: InstanceFetchDeps): Promise<boolean> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    await fetchImpl(buildUrl(instanceUrl, "/api/v1/instance/profile"), {
      method: "GET",
      mode: "no-cors",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

type RequestOptions = { method: "GET" | "POST"; body?: unknown };

async function instanceFetchJson(
  creds: MemosCredentials,
  path: string,
  options: RequestOptions,
  deps: InstanceFetchDeps = {},
): Promise<unknown> {
  if (currentProtocol(deps) === "https:" && creds.instanceUrl.startsWith("http:")) {
    throw new InstanceError("mixed-content");
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(buildUrl(creds.instanceUrl, path), {
      method: options.method,
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(deps.timeoutMs ?? INSTANCE_REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
  } catch (error) {
    const name = typeof error === "object" && error !== null && "name" in error ? (error as { name?: unknown }).name : undefined;
    if (name === "TimeoutError" || name === "AbortError") throw new InstanceError("timeout");
    console.error("[memos-web-clipper] fetch threw", { path, method: options.method, error: String(error) });
    throw new InstanceError((await isReachable(creds.instanceUrl, deps)) ? "cors" : "unreachable");
  }

  if (!response.ok || response.type === "opaqueredirect" || response.status === 0) {
    const detail = await response.text().catch(() => "");
    console.error("[memos-web-clipper] request not ok", {
      path,
      method: options.method,
      status: response.status,
      type: response.type,
      detail: detail.slice(0, 300),
    });
    if (response.status === 401 || response.status === 403) throw new InstanceError("unauthorized");
    throw new InstanceError("bad-response");
  }
  const text = await response.text();
  if (!text) return null; // some endpoints (e.g. SetMemoAttachments) return an empty body
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("[memos-web-clipper] JSON parse failed", { path, method: options.method, error: String(e) });
    throw new InstanceError("bad-response");
  }
}

export type InstanceProfile = { version: string };
export type CurrentMemosUser = { name: string };

function badResponse(): never {
  throw new InstanceError("bad-response");
}

/** Reads the instance version from `/api/v1/instance/profile` (used to gate on version at connect). */
export async function getInstanceProfile(creds: MemosCredentials, deps?: InstanceFetchDeps): Promise<InstanceProfile> {
  const raw = await instanceFetchJson(creds, "/api/v1/instance/profile", { method: "GET" }, deps);
  if (typeof raw !== "object" || raw === null || !("version" in raw) || typeof (raw as { version?: unknown }).version !== "string") {
    return badResponse();
  }
  const version = (raw as { version: string }).version.trim();
  if (!version) return badResponse();
  return { version };
}

/** Validates the access token and returns the authenticated Memos resource identity. */
export async function getCurrentUser(creds: MemosCredentials, deps?: InstanceFetchDeps): Promise<CurrentMemosUser> {
  const raw = await instanceFetchJson(creds, "/api/v1/auth/me", { method: "GET" }, deps);
  if (typeof raw !== "object" || raw === null || typeof (raw as { user?: unknown }).user !== "object") return badResponse();
  const user = (raw as { user: Record<string, unknown> }).user;
  if (typeof user.name !== "string" || !user.name.trim()) return badResponse();
  return { name: user.name };
}

export type CreatedMemo = { name: string; uid?: string };

export async function createMemo(
  creds: MemosCredentials,
  input: { content: string; visibility: Visibility; memoId?: string; attachments?: Array<{ name: string }> },
  deps?: InstanceFetchDeps,
): Promise<CreatedMemo> {
  const { memoId, ...body } = input;
  const path = memoId ? `/api/v1/memos?memoId=${encodeURIComponent(memoId)}` : "/api/v1/memos";
  const raw = await instanceFetchJson(creds, path, { method: "POST", body }, deps);
  if (typeof raw !== "object" || raw === null) return badResponse();
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return badResponse();
  return { name: obj.name, uid: typeof obj.uid === "string" && obj.uid ? obj.uid : undefined };
}

export type MemoSummary = CreatedMemo & {
  creator: string;
  content: string;
  visibility: Visibility;
  createTime: string;
};

/** Newest memos used to reconcile a POST whose response may have been lost. */
export async function listRecentMemos(
  creds: MemosCredentials,
  pageSize = 20,
  creator?: string,
  deps?: InstanceFetchDeps,
): Promise<MemoSummary[]> {
  const params = new URLSearchParams({ pageSize: String(pageSize), orderBy: "create_time desc" });
  const raw = await instanceFetchJson(creds, `/api/v1/memos?${params}`, { method: "GET" }, deps);
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { memos?: unknown }).memos)) return badResponse();

  return (raw as { memos: unknown[] }).memos
    .map((value) => {
      if (typeof value !== "object" || value === null) return badResponse();
      const memo = value as Record<string, unknown>;
      if (
        typeof memo.name !== "string" ||
        !memo.name ||
        typeof memo.creator !== "string" ||
        !memo.creator ||
        typeof memo.content !== "string" ||
        (memo.visibility !== "PRIVATE" && memo.visibility !== "PROTECTED" && memo.visibility !== "PUBLIC") ||
        typeof memo.createTime !== "string" ||
        !Number.isFinite(Date.parse(memo.createTime))
      ) {
        return badResponse();
      }
      return {
        name: memo.name,
        uid: typeof memo.uid === "string" && memo.uid ? memo.uid : undefined,
        creator: memo.creator,
        content: memo.content,
        visibility: memo.visibility as Visibility,
        createTime: memo.createTime,
      };
    })
    .filter((memo) => !creator || memo.creator === creator);
}

export type CreatedAttachment = { name: string };

/** Uploads bytes as a Memos attachment. `content` is base64-encoded (the API's bytes format). */
export async function createAttachment(
  creds: MemosCredentials,
  input: { filename: string; type: string; content: string },
  deps?: InstanceFetchDeps,
): Promise<CreatedAttachment> {
  const raw = await instanceFetchJson(creds, "/api/v1/attachments", { method: "POST", body: input }, deps);
  if (typeof raw !== "object" || raw === null) return badResponse();
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return badResponse();
  return { name: obj.name };
}

export function memoWebUrl(instanceUrl: string, memo: CreatedMemo): string {
  const base = normalizeInstanceUrl(instanceUrl);
  // Modern Memos routes memo detail at /memos/{uid}; `name` is "memos/{uid}", so its id is the uid.
  const id = memo.uid || memo.name.split("/").pop();
  return id ? `${base}/memos/${id}` : base;
}
