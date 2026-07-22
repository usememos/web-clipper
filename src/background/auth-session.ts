import { getOAuthUser, type OAuthUser } from "@/auth/oauth-session";
import { getActiveConnectionContext, type ResolvedConnection } from "@/background/connection-source";
import { readCredentials, readMemosObject } from "@/lib/connection";
import type { ConnectionSource } from "@/lib/connection-config";
import { type SaveErrorKind, toSaveErrorKind } from "@/lib/errors";
import { checkVersion, resolveVersion } from "@/lib/instance-version";
import { getCurrentUser, memosUserDisplayName } from "@/lib/memos-client";
import type { ConnectionStateResult, PopupStateResult } from "@/lib/messages";
import { writePopupState } from "@/lib/popup-state";
import { readClipTemplate } from "@/lib/template-settings";
import { isSupportedVersion } from "@/lib/versions";

function disconnected(source: ConnectionSource | null, status: "disconnected" | "invalid" = "disconnected"): ConnectionStateResult {
  return {
    source,
    instanceUrl: null,
    version: null,
    displayName: null,
    status,
    verificationError: null,
    isUsingCachedVersion: false,
  };
}

async function getPopupState(signedInUser?: OAuthUser): Promise<PopupStateResult> {
  const context = await getActiveConnectionContext(signedInUser);
  const updatedAt = Date.now();
  if (!context.source) {
    const state: PopupStateResult = { status: "signed-out", source: null, updatedAt };
    await writePopupState(state);
    return state;
  }

  let identity: { userId: string; displayName: string; imageUrl?: string };
  let credentials: ReturnType<typeof readCredentials>;
  if (context.source === "direct") {
    const { connection } = context;
    identity = { userId: connection.connectionId, displayName: memosUserDisplayName(connection.user) };
    credentials = connection.credentials;
  } else {
    const { user } = context;
    if (!user) {
      const state: PopupStateResult = { status: "signed-out", source: "usememos", updatedAt };
      await writePopupState(state);
      return state;
    }
    identity = {
      userId: user.id,
      displayName: user.displayName,
      ...(user.imageUrl ? { imageUrl: user.imageUrl } : {}),
    };
    credentials = context.connection?.credentials ?? null;
  }
  const source = context.source;

  const template = await readClipTemplate();
  if (!credentials) {
    const state: PopupStateResult = { status: "disconnected", source, identity, template, updatedAt };
    await writePopupState(state);
    return state;
  }

  const version = await resolveVersion(credentials);
  const state: PopupStateResult =
    version && isSupportedVersion(version)
      ? { status: "ready", source, identity, template, instanceUrl: credentials.instanceUrl, version, updatedAt }
      : { status: "unsupported", source, identity, template, instanceUrl: credentials.instanceUrl, version, updatedAt };
  await writePopupState(state);
  return state;
}

let popupStatePromise: Promise<PopupStateResult> | undefined;

export function reconcilePopupState(signedInUser?: OAuthUser): Promise<PopupStateResult> {
  if (signedInUser) return getPopupState(signedInUser);
  popupStatePromise ??= getPopupState().finally(() => {
    popupStatePromise = undefined;
  });
  return popupStatePromise;
}

/** Live, sanitized connection diagnostics for Options. Secrets stay in the worker. */
export async function getOptionsConnectionState(
  refresh = true,
  requestedSource: "active" | "usememos" = "active",
): Promise<ConnectionStateResult> {
  let source: ConnectionSource;
  let user: OAuthUser | null = null;
  let direct: Extract<ResolvedConnection, { source: "direct" }> | null = null;
  if (requestedSource === "usememos") {
    source = "usememos";
    user = await getOAuthUser();
  } else {
    const context = await getActiveConnectionContext();
    if (!context.source) return disconnected(null);
    source = context.source;
    if (context.source === "direct") direct = context.connection;
    else user = context.user;
  }

  let credentials: ReturnType<typeof readCredentials>;
  let displayName: string | null;
  if (direct) {
    credentials = direct.credentials;
    displayName = memosUserDisplayName(direct.user);
  } else {
    if (!user) return disconnected(source);
    displayName = user.displayName;
    const memosObject = readMemosObject(user.unsafeMetadata);
    credentials = readCredentials(user.unsafeMetadata);
    if (!credentials) return disconnected(source, memosObject ? "invalid" : "disconnected");
  }

  const result = await checkVersion(credentials, { refresh });
  let verificationError: SaveErrorKind | null = result.errorKind;
  if (source === "direct" && refresh && !verificationError && result.version && isSupportedVersion(result.version)) {
    try {
      displayName = memosUserDisplayName(await getCurrentUser(credentials));
    } catch (error) {
      verificationError = toSaveErrorKind(error);
    }
  }
  const status = result.version && isSupportedVersion(result.version) ? "ready" : verificationError ? "error" : "unsupported";
  return {
    source,
    instanceUrl: credentials.instanceUrl,
    version: result.version,
    displayName,
    status,
    verificationError,
    isUsingCachedVersion: result.fromCache,
  };
}
