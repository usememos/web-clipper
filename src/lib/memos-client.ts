import { InstanceError } from "./errors";

export type MemosCredentials = { instanceUrl: string; accessToken: string };
export type Visibility = "PRIVATE" | "PROTECTED" | "PUBLIC" | "SPACE";

export function isVisibility(value: unknown): value is Visibility {
  return value === "PRIVATE" || value === "PROTECTED" || value === "PUBLIC" || value === "SPACE";
}

export function isSpaceName(value: unknown): value is string {
  return typeof value === "string" && /^spaces\/[a-zA-Z0-9]([a-zA-Z0-9-]{0,34}[a-zA-Z0-9])?$/.test(value);
}

/** Only emoji icons are rendered; a Space with a Lucide icon falls back to the generic mark. */
export type SpaceSummary = { name: string; title: string; icon?: { emoji: string } };

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

function isLoopbackHttp(instanceUrl: string): boolean {
  const url = new URL(instanceUrl);
  if (url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  const octets = host.split(".").map(Number);
  return octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && octets[0] === 127;
}

/** Plaintext HTTP to a non-loopback host sends the access token unencrypted; the user must opt in. */
export function requiresInsecureHttpConfirmation(instanceUrl: string): boolean {
  try {
    const normalized = normalizeInstanceUrl(instanceUrl.trim());
    return new URL(normalized).protocol === "http:" && !isLoopbackHttp(normalized);
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
    await fetchImpl(buildUrl(instanceUrl, "/api/instance/profile"), {
      method: "GET",
      mode: "no-cors",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Memos serves its REST API under `/api` since it dropped the version marker (usememos/memos#6447);
 * earlier releases serve only `/api/v1`, and the new ones answer `/api/v1` with 410 Gone.
 */
type ApiPrefix = "/api" | "/api/v1";

/**
 * The prefix each instance last answered on, keyed by normalized instance URL. Memory only: after a
 * worker restart the first request re-detects it, and a server upgrade or downgrade flips it.
 */
const apiPrefixByInstance = new Map<string, ApiPrefix>();

/** The route does not exist under this prefix: a 404, the 410 for removed `/api/v1`, or an SPA fallback page. */
function isMissingApiRoute(response: Response): boolean {
  if (response.status === 404 || response.status === 410) return true;
  return response.ok && (response.headers.get("content-type") ?? "").includes("text/html");
}

type RequestOptions = { method: "GET" | "POST"; body?: unknown };

async function instanceFetch(creds: MemosCredentials, path: string, options: RequestOptions, deps: InstanceFetchDeps): Promise<Response> {
  if (currentProtocol(deps) === "https:" && creds.instanceUrl.startsWith("http:")) {
    throw new InstanceError("mixed-content");
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    return await fetchImpl(buildUrl(creds.instanceUrl, path), {
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
    const errorName = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "Error";
    console.error("[memos-web-clipper] fetch threw", { path, method: options.method, errorName });
    throw new InstanceError((await isReachable(creds.instanceUrl, deps)) ? "cors" : "unreachable");
  }
}

/**
 * Requests `path` (relative to the API root, e.g. `/memos`) under the prefix this instance last
 * answered on, defaulting to `/api`. When the route is missing there, retries once under the other
 * prefix; a missing route had no side effects, so a POST is safe to repeat.
 */
async function apiFetchJson(
  creds: MemosCredentials,
  path: string,
  options: RequestOptions,
  deps: InstanceFetchDeps = {},
): Promise<unknown> {
  const key = normalizeInstanceUrl(creds.instanceUrl);
  let prefix = apiPrefixByInstance.get(key) ?? "/api";
  let response = await instanceFetch(creds, `${prefix}${path}`, options, deps);
  if (isMissingApiRoute(response)) {
    prefix = prefix === "/api" ? "/api/v1" : "/api";
    response = await instanceFetch(creds, `${prefix}${path}`, options, deps);
  }
  if (!isMissingApiRoute(response)) apiPrefixByInstance.set(key, prefix);

  if (!response.ok || response.type === "opaqueredirect" || response.status === 0) {
    console.error("[memos-web-clipper] request not ok", {
      path: `${prefix}${path}`,
      method: options.method,
      status: response.status,
      type: response.type,
    });
    if (response.status === 401 || response.status === 403) throw new InstanceError("unauthorized", response.status);
    throw new InstanceError("bad-response", response.status);
  }
  const text = await response.text();
  if (!text) return null; // some endpoints (e.g. SetMemoAttachments) return an empty body
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("[memos-web-clipper] JSON parse failed", { path: `${prefix}${path}`, method: options.method, error: String(e) });
    throw new InstanceError("bad-response");
  }
}

export type InstanceProfile = { version: string };
export type CurrentMemosUser = { name: string; displayName?: string; username?: string };

/** Human-readable name for a Memos user, falling back to the id in the `users/<id>` resource name. */
export function memosUserDisplayName(user: CurrentMemosUser): string {
  return user.displayName || user.username || user.name.replace(/^users\//, "");
}

function badResponse(): never {
  throw new InstanceError("bad-response");
}

/** Reads the instance version from `/instance/profile` (used to gate on version at connect). */
export async function getInstanceProfile(creds: MemosCredentials, deps?: InstanceFetchDeps): Promise<InstanceProfile> {
  const raw = await apiFetchJson(creds, "/instance/profile", { method: "GET" }, deps);
  if (typeof raw !== "object" || raw === null || !("version" in raw) || typeof (raw as { version?: unknown }).version !== "string") {
    return badResponse();
  }
  const version = (raw as { version: string }).version.trim();
  if (!version) return badResponse();
  return { version };
}

/** Validates the access token and returns the authenticated Memos resource identity. */
export async function getCurrentUser(creds: MemosCredentials, deps?: InstanceFetchDeps): Promise<CurrentMemosUser> {
  const raw = await apiFetchJson(creds, "/auth/me", { method: "GET" }, deps);
  if (typeof raw !== "object" || raw === null || typeof (raw as { user?: unknown }).user !== "object") return badResponse();
  const user = (raw as { user: Record<string, unknown> }).user;
  if (typeof user.name !== "string" || !user.name.trim()) return badResponse();
  return {
    name: user.name,
    ...(typeof user.displayName === "string" && user.displayName.trim() ? { displayName: user.displayName } : {}),
    ...(typeof user.username === "string" && user.username.trim() ? { username: user.username } : {}),
  };
}

export type CreatedMemo = { name: string; uid?: string };

function parseSpace(raw: unknown): SpaceSummary {
  if (!raw || typeof raw !== "object") return badResponse();
  const space = raw as Record<string, unknown>;
  if (!isSpaceName(space.name) || typeof space.title !== "string" || !space.title.trim()) return badResponse();
  const emoji = (space.icon as { emoji?: unknown } | undefined)?.emoji;
  return { name: space.name, title: space.title, ...(typeof emoji === "string" && emoji ? { icon: { emoji } } : {}) };
}

/** Rethrows a response that says the Space is gone or closed to this user as `space-unavailable`. */
function rethrowMissingSpace(error: unknown, statuses: number[]): never {
  if (error instanceof InstanceError && error.status !== undefined && statuses.includes(error.status)) {
    throw new InstanceError("space-unavailable", error.status);
  }
  throw error;
}

/** List every Space the authenticated user belongs to, including paginated results. */
export async function listSpaces(creds: MemosCredentials, deps?: InstanceFetchDeps): Promise<SpaceSummary[]> {
  const spaces = new Map<string, SpaceSummary>();
  const seenTokens = new Set<string>();
  let token = "";
  do {
    const params = new URLSearchParams({ pageSize: "100", ...(token ? { pageToken: token } : {}) });
    const raw = await apiFetchJson(creds, `/spaces?${params}`, { method: "GET" }, deps);
    if (!raw || typeof raw !== "object") return badResponse();
    const page = raw as { spaces?: unknown; nextPageToken?: unknown };
    if (page.spaces !== undefined && !Array.isArray(page.spaces)) return badResponse();
    for (const value of (page.spaces ?? []) as unknown[]) {
      const space = parseSpace(value);
      spaces.set(space.name, space);
    }
    if (page.nextPageToken !== undefined && typeof page.nextPageToken !== "string") return badResponse();
    token = (page.nextPageToken as string | undefined) ?? "";
    if (token && seenTokens.has(token)) return badResponse();
    seenTokens.add(token);
  } while (token);
  return [...spaces.values()];
}

export async function getSpace(creds: MemosCredentials, name: string, deps?: InstanceFetchDeps): Promise<SpaceSummary> {
  if (!isSpaceName(name)) throw new InstanceError("space-unavailable");
  const raw = await apiFetchJson(creds, `/${name}`, { method: "GET" }, deps).catch((error) => rethrowMissingSpace(error, [403, 404]));
  const space = parseSpace(raw);
  if (space.name !== name) return badResponse();
  return space;
}

export async function createMemo(
  creds: MemosCredentials,
  input: { content: string; visibility: Visibility; space?: string; memoId?: string; attachments?: Array<{ name: string }> },
  deps?: InstanceFetchDeps,
): Promise<CreatedMemo> {
  const { memoId, ...body } = input;
  const path = memoId ? `/memos?memoId=${encodeURIComponent(memoId)}` : "/memos";
  // The Space was verified just before this call, so only a 404 (deleted in between) is attributed
  // to it; a 403 here is a token or permission problem and keeps its `unauthorized` meaning.
  const raw = await apiFetchJson(creds, path, { method: "POST", body }, deps).catch((error) =>
    rethrowMissingSpace(error, input.space ? [404] : []),
  );
  if (typeof raw !== "object" || raw === null) return badResponse();
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return badResponse();
  return { name: obj.name, uid: typeof obj.uid === "string" && obj.uid ? obj.uid : undefined };
}

export type MemoSummary = CreatedMemo & {
  creator: string;
  content: string;
  visibility: Visibility;
  space?: string;
  createTime: string;
};

/**
 * Newest memos used to reconcile a POST whose response may have been lost.
 * Unknown future visibility values cannot be a lost clip, so they are skipped.
 */
export async function listRecentMemos(
  creds: MemosCredentials,
  pageSize = 20,
  creator?: string,
  deps?: InstanceFetchDeps,
): Promise<MemoSummary[]> {
  const params = new URLSearchParams({ pageSize: String(pageSize), orderBy: "create_time desc" });
  const raw = await apiFetchJson(creds, `/memos?${params}`, { method: "GET" }, deps);
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { memos?: unknown }).memos)) return badResponse();

  return (raw as { memos: unknown[] }).memos
    .flatMap((value): MemoSummary[] => {
      if (typeof value !== "object" || value === null) return badResponse();
      const memo = value as Record<string, unknown>;
      if (
        typeof memo.name !== "string" ||
        !memo.name ||
        typeof memo.creator !== "string" ||
        !memo.creator ||
        typeof memo.content !== "string" ||
        typeof memo.visibility !== "string" ||
        typeof memo.createTime !== "string" ||
        !Number.isFinite(Date.parse(memo.createTime))
      ) {
        return badResponse();
      }
      if (!isVisibility(memo.visibility)) return [];
      if (memo.space !== undefined && !isSpaceName(memo.space)) return badResponse();
      return [
        {
          name: memo.name,
          uid: typeof memo.uid === "string" && memo.uid ? memo.uid : undefined,
          creator: memo.creator,
          content: memo.content,
          visibility: memo.visibility as Visibility,
          ...(memo.space ? { space: memo.space as string } : {}),
          createTime: memo.createTime,
        },
      ];
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
  const raw = await apiFetchJson(creds, "/attachments", { method: "POST", body: input }, deps);
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
