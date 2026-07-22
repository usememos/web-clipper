import browser from "webextension-polyfill";
import { isValidInstanceUrl, normalizeInstanceUrl } from "./memos-client";

export const CONNECTION_CONFIG_KEY = "memosConnectionConfigV1";

export type ConnectionSource = "direct" | "usememos";

export type VerifiedMemosUser = {
  name: string;
  displayName?: string;
  username?: string;
};

export type DirectConnection = {
  connectionId: string;
  instanceUrl: string;
  accessToken: string;
  user: VerifiedMemosUser;
  verifiedAt: number;
};

export type StoredConnectionConfig =
  | { schemaVersion: 1; activeSource: null }
  | { schemaVersion: 1; activeSource: "usememos" }
  | { schemaVersion: 1; activeSource: "direct"; direct: DirectConnection };

export type ConnectionConfigRead = { kind: "missing" } | { kind: "invalid" } | { kind: "valid"; config: StoredConnectionConfig };

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function readVerifiedUser(value: unknown): VerifiedMemosUser | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!nonEmptyString(raw.name)) return null;
  if (raw.displayName !== undefined && typeof raw.displayName !== "string") return null;
  if (raw.username !== undefined && typeof raw.username !== "string") return null;
  return {
    name: raw.name,
    ...(nonEmptyString(raw.displayName) ? { displayName: raw.displayName } : {}),
    ...(nonEmptyString(raw.username) ? { username: raw.username } : {}),
  };
}

export function parseConnectionConfig(value: unknown): StoredConnectionConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return null;
  if (raw.activeSource === null) return { schemaVersion: 1, activeSource: null };
  if (raw.activeSource === "usememos") return { schemaVersion: 1, activeSource: "usememos" };
  if (raw.activeSource !== "direct" || !raw.direct || typeof raw.direct !== "object") return null;

  const direct = raw.direct as Record<string, unknown>;
  const user = readVerifiedUser(direct.user);
  if (
    !nonEmptyString(direct.connectionId) ||
    !nonEmptyString(direct.instanceUrl) ||
    !isValidInstanceUrl(direct.instanceUrl) ||
    normalizeInstanceUrl(direct.instanceUrl) !== direct.instanceUrl ||
    !nonEmptyString(direct.accessToken) ||
    typeof direct.verifiedAt !== "number" ||
    !Number.isFinite(direct.verifiedAt) ||
    direct.verifiedAt <= 0 ||
    !user
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    activeSource: "direct",
    direct: {
      connectionId: direct.connectionId,
      instanceUrl: direct.instanceUrl,
      accessToken: direct.accessToken,
      user,
      verifiedAt: direct.verifiedAt,
    },
  };
}

export async function readConnectionConfig(): Promise<ConnectionConfigRead> {
  const stored = await browser.storage.local.get(CONNECTION_CONFIG_KEY);
  if (!(CONNECTION_CONFIG_KEY in stored)) return { kind: "missing" };
  const config = parseConnectionConfig(stored[CONNECTION_CONFIG_KEY]);
  return config ? { kind: "valid", config } : { kind: "invalid" };
}

export async function writeConnectionConfig(config: StoredConnectionConfig): Promise<void> {
  await browser.storage.local.set({ [CONNECTION_CONFIG_KEY]: config });
}

/** Missing is the pre-feature legacy state, whose only possible source was usememos.com. */
export function activeSourceFromConfig(result: ConnectionConfigRead): ConnectionSource | null {
  if (result.kind === "missing") return "usememos";
  if (result.kind === "invalid") return null;
  return result.config.activeSource;
}
