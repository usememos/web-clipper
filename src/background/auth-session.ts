import { getOAuthUser, type OAuthUser } from "@/auth/oauth-session";
import { readCredentials, readMemosObject } from "@/lib/connection";
import { checkVersion, resolveVersion } from "@/lib/instance-version";
import type { ConnectionStateResult, PopupStateResult } from "@/lib/messages";
import { writePopupState } from "@/lib/popup-state";
import { readClipTemplate } from "@/lib/template-settings";
import { isSupportedVersion } from "@/lib/versions";

async function getPopupState(signedInUser?: OAuthUser): Promise<PopupStateResult> {
  const user = signedInUser ?? (await getOAuthUser());
  const updatedAt = Date.now();
  if (!user) {
    const state: PopupStateResult = { status: "signed-out", updatedAt };
    await writePopupState(state);
    return state;
  }

  const identity = {
    userId: user.id,
    displayName: user.displayName,
    ...(user.imageUrl ? { imageUrl: user.imageUrl } : {}),
  };
  const template = await readClipTemplate();
  const credentials = readCredentials(user.unsafeMetadata);
  if (!credentials) {
    const state: PopupStateResult = { status: "disconnected", identity, template, updatedAt };
    await writePopupState(state);
    return state;
  }

  const version = await resolveVersion(credentials);
  const state: PopupStateResult =
    version && isSupportedVersion(version)
      ? { status: "ready", identity, template, instanceUrl: credentials.instanceUrl, version, updatedAt }
      : { status: "unsupported", identity, template, instanceUrl: credentials.instanceUrl, version, updatedAt };
  await writePopupState(state);
  return state;
}

let popupStatePromise: Promise<PopupStateResult> | undefined;

export function reconcilePopupState(signedInUser?: OAuthUser): Promise<PopupStateResult> {
  // Sign-in already fetched userinfo, so reuse that in-memory result instead of
  // immediately requesting the same endpoint again.
  if (signedInUser) return getPopupState(signedInUser);
  popupStatePromise ??= getPopupState().finally(() => {
    popupStatePromise = undefined;
  });
  return popupStatePromise;
}

/** Live, sanitized connection diagnostics for Options. Memos credentials stay in this worker. */
export async function getOptionsConnectionState(refresh = true): Promise<ConnectionStateResult> {
  const user = await getOAuthUser();
  if (!user) {
    return { instanceUrl: null, version: null, status: "disconnected", verificationError: null, isUsingCachedVersion: false };
  }

  const memosObject = readMemosObject(user.unsafeMetadata);
  const credentials = readCredentials(user.unsafeMetadata);
  if (!credentials) {
    return {
      instanceUrl: null,
      version: null,
      status: memosObject ? "invalid" : "disconnected",
      verificationError: null,
      isUsingCachedVersion: false,
    };
  }

  const result = await checkVersion(credentials, { refresh });
  const status = result.version && isSupportedVersion(result.version) ? "ready" : result.errorKind ? "error" : "unsupported";
  return {
    instanceUrl: credentials.instanceUrl,
    version: result.version,
    status,
    verificationError: result.errorKind,
    isUsingCachedVersion: result.fromCache,
  };
}
