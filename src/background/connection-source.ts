import browser from "webextension-polyfill";
import { getOAuthUser, type OAuthUser } from "@/auth/oauth-session";
import { readCredentials } from "@/lib/connection";
import {
  activeSourceFromConfig,
  CONNECTION_CONFIG_KEY,
  type ConnectionSource,
  type DirectConnection,
  readConnectionConfig,
  type StoredConnectionConfig,
  type VerifiedMemosUser,
} from "@/lib/connection-config";
import { ClientError, InstanceError } from "@/lib/errors";
import { VERSION_CACHE_KEY } from "@/lib/instance-version";
import {
  getCurrentUser,
  getInstanceProfile,
  isValidInstanceUrl,
  type MemosCredentials,
  normalizeInstanceUrl,
  requiresInsecureHttpConfirmation,
} from "@/lib/memos-client";
import { isSupportedVersion } from "@/lib/versions";

export type ResolvedConnection =
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
      displayName: string;
    };

export type VerifiedConnection = ResolvedConnection & { version: string };

let activationGeneration = 0;
let connectionMutation = Promise.resolve();

function mutateConnection<T>(operation: () => Promise<T>): Promise<T> {
  const result = connectionMutation.then(operation, operation);
  connectionMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function commitVerifiedConnection(
  generation: number,
  config: StoredConnectionConfig,
  instanceUrl: string,
  version: string,
): Promise<void> {
  await mutateConnection(async () => {
    if (generation !== activationGeneration) throw new ClientError("auth-changed");
    try {
      // Commit the source and its matching version in one storage operation. The mutation
      // queue ensures a later disconnect/source switch is always the final writer.
      await browser.storage.local.set({
        [CONNECTION_CONFIG_KEY]: config,
        [VERSION_CACHE_KEY]: { instanceUrl, version },
      });
    } catch {
      throw new ClientError("storage-error");
    }
  });
}

export type ActiveConnectionContext =
  | { source: null }
  | { source: "direct"; connection: Extract<ResolvedConnection, { source: "direct" }> }
  | { source: "usememos"; user: OAuthUser | null; connection: Extract<ResolvedConnection, { source: "usememos" }> | null };

/**
 * Resolves the active source and its connection in one storage read and at most one OAuth
 * userinfo fetch (skipped entirely for direct connections, reused from `signedInUser` when
 * the caller already fetched it).
 */
export async function getActiveConnectionContext(signedInUser?: OAuthUser): Promise<ActiveConnectionContext> {
  const stored = await readConnectionConfig();
  if (stored.kind === "valid" && stored.config.activeSource === "direct") {
    const { direct } = stored.config;
    return {
      source: "direct",
      connection: {
        source: "direct",
        connectionId: direct.connectionId,
        credentials: { instanceUrl: direct.instanceUrl, accessToken: direct.accessToken },
        user: direct.user,
      },
    };
  }
  if (activeSourceFromConfig(stored) !== "usememos") return { source: null };
  const user = signedInUser ?? (await getOAuthUser());
  const credentials = readCredentials(user?.unsafeMetadata);
  // A missing config is the pre-feature state, where usememos only counts once actually connected.
  if (stored.kind === "missing" && !credentials) return { source: null };
  return {
    source: "usememos",
    user,
    connection: user && credentials ? { source: "usememos", connectionId: user.id, credentials, displayName: user.displayName } : null,
  };
}

export async function resolveUseMemosConnection(): Promise<Extract<ResolvedConnection, { source: "usememos" }> | null> {
  const user = await getOAuthUser();
  const credentials = readCredentials(user?.unsafeMetadata);
  return user && credentials ? { source: "usememos", connectionId: user.id, credentials, displayName: user.displayName } : null;
}

export async function resolveActiveConnection(): Promise<ResolvedConnection | null> {
  const context = await getActiveConnectionContext();
  return context.source ? context.connection : null;
}

async function verifyCredentials(credentials: MemosCredentials): Promise<{ version: string; user: VerifiedMemosUser }> {
  const profile = await getInstanceProfile(credentials);
  if (!isSupportedVersion(profile.version)) throw new InstanceError("unsupported-version");
  const user = await getCurrentUser(credentials);
  return { version: profile.version, user };
}

export async function verifyAndActivateDirectConnection(input: {
  instanceUrl: string;
  accessToken: string;
  allowInsecureHttp?: boolean;
}): Promise<VerifiedConnection> {
  const generation = ++activationGeneration;
  const instanceUrl = normalizeInstanceUrl(input.instanceUrl.trim());
  const accessToken = input.accessToken.trim();
  if (!isValidInstanceUrl(instanceUrl)) throw new ClientError("invalid-url");
  if (!accessToken) throw new InstanceError("unauthorized");
  if (requiresInsecureHttpConfirmation(instanceUrl) && !input.allowInsecureHttp) throw new InstanceError("mixed-content");

  const credentials = { instanceUrl, accessToken };
  const verified = await verifyCredentials(credentials);
  if (generation !== activationGeneration) throw new ClientError("auth-changed");
  const direct: DirectConnection = {
    connectionId: crypto.randomUUID(),
    instanceUrl,
    accessToken,
    user: verified.user,
    verifiedAt: Date.now(),
  };

  await commitVerifiedConnection(generation, { schemaVersion: 1, activeSource: "direct", direct }, instanceUrl, verified.version);
  return {
    source: "direct",
    connectionId: direct.connectionId,
    credentials,
    user: verified.user,
    version: verified.version,
  };
}

export async function verifyAndActivateUseMemosConnection(): Promise<VerifiedConnection> {
  const generation = ++activationGeneration;
  const connection = await resolveUseMemosConnection();
  if (!connection) throw new InstanceError("unauthorized");
  const verified = await verifyCredentials(connection.credentials);
  if (generation !== activationGeneration) throw new ClientError("auth-changed");
  await commitVerifiedConnection(
    generation,
    { schemaVersion: 1, activeSource: "usememos" },
    connection.credentials.instanceUrl,
    verified.version,
  );
  return { ...connection, version: verified.version };
}

/** Remembers an explicit first-time choice without displacing an active direct connection. */
export async function selectUseMemosSource(): Promise<void> {
  activationGeneration += 1;
  await mutateConnection(async () => {
    const stored = await readConnectionConfig();
    if (stored.kind === "valid" && stored.config.activeSource === "direct") return;
    await browser.storage.local.set({ [CONNECTION_CONFIG_KEY]: { schemaVersion: 1, activeSource: "usememos" } });
  });
}

export async function clearActiveConnectionConfig(options: { preserveDirect?: boolean } = {}): Promise<ConnectionSource | null> {
  activationGeneration += 1;
  return mutateConnection(async () => {
    // Local-only source detection (missing config reads as pre-feature usememos), so this
    // destructive path never needs live OAuth.
    const source = activeSourceFromConfig(await readConnectionConfig());
    if (!(options.preserveDirect && source === "direct")) {
      await browser.storage.local.set({ [CONNECTION_CONFIG_KEY]: { schemaVersion: 1, activeSource: null } });
    }
    return source;
  });
}
