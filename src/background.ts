import browser from "webextension-polyfill";
import { beginOAuthSignIn, clearOAuthSession, getOAuthUser, OAuthUnavailableError, toOAuthIdentity } from "@/auth/oauth-session";
import { getOptionsConnectionState, reconcilePopupState } from "@/background/auth-session";
import {
  clearActiveConnectionConfig,
  resolveActiveConnection,
  selectUseMemosSource,
  type VerifiedConnection,
  verifyAndActivateDirectConnection,
  verifyAndActivateUseMemosConnection,
} from "@/background/connection-source";
import { clearMemoSaveAttempts, savePopupMemo, saveSelectionClip } from "@/background/memo-save";
import { isTrustedBackgroundRequest, parseBackgroundRequest, type RuntimeSender } from "@/lib/background-protocol";
import { describeSaveError, type SaveErrorKind, toSaveErrorKind } from "@/lib/errors";
import { applyLocalePreference, getTextDirection, initializeLocalePreference, LOCALE_PREFERENCE_KEY, t, tp } from "@/lib/i18n";
import { clearCachedVersion, resolveVersion } from "@/lib/instance-version";
import { memosUserDisplayName } from "@/lib/memos-client";
import type { ConnectionStateResult, Request, SaveResult, SelectionClip } from "@/lib/messages";
import { clearPopupState } from "@/lib/popup-state";
import { readClipTemplate } from "@/lib/template-settings";
import { isSupportedVersion } from "@/lib/versions";

type RestrictableStorageArea = typeof browser.storage.local & {
  setAccessLevel?: (options: { accessLevel: "TRUSTED_CONTEXTS" }) => Promise<void>;
};

const localeReady = initializeLocalePreference();

// storage.local is exposed to content scripts by default. No content script in this
// extension needs storage, so keep OAuth and Memos credentials in trusted contexts only.
async function restrictLocalStorage(): Promise<void> {
  try {
    await (browser.storage.local as RestrictableStorageArea).setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // Firefox versions without this Chromium API still keep page scripts outside the
    // content-script isolated world; the optional call is defense in depth where available.
  }
}
void restrictLocalStorage();

/** Runs Clerk's public OAuth application through the browser identity API with PKCE. */
async function openSignInFlow(): Promise<void> {
  const user = await beginOAuthSignIn();
  await reconcilePopupState(user);
  await broadcastAuthChanged();
  await browser.runtime.openOptionsPage();
}

async function broadcastAuthChanged(): Promise<void> {
  const authChanged: Request = { type: "AUTH_CHANGED" };
  await browser.runtime.sendMessage(authChanged).catch(() => {});
}

async function getAuthIdentity() {
  const user = await getOAuthUser();
  return user ? toOAuthIdentity(user) : null;
}

function stateFromVerifiedConnection(connection: VerifiedConnection): ConnectionStateResult {
  const displayName = connection.source === "direct" ? memosUserDisplayName(connection.user) : connection.displayName;
  return {
    source: connection.source,
    instanceUrl: connection.credentials.instanceUrl,
    version: connection.version,
    displayName,
    status: "ready",
    verificationError: null,
    isUsingCachedVersion: true,
  };
}

async function finishConnectionActivation(connection: VerifiedConnection): Promise<void> {
  await Promise.allSettled([clearPopupState(), clearMemoSaveAttempts(), ...(connection.source === "direct" ? [clearOAuthSession()] : [])]);
  await reconcilePopupState().catch(() => undefined);
  await broadcastAuthChanged();
}

async function activateConnection(verify: () => Promise<VerifiedConnection>) {
  let connection: VerifiedConnection;
  try {
    connection = await verify();
  } catch (error) {
    return { ok: false, errorKind: toSaveErrorKind(error) } as const;
  }
  await finishConnectionActivation(connection);
  return { ok: true, state: stateFromVerifiedConnection(connection) } as const;
}

browser.runtime.onMessage.addListener((message: unknown, sender: RuntimeSender) => {
  const req = parseBackgroundRequest(message);
  if (!req || !isTrustedBackgroundRequest(req, sender, browser.runtime.id)) return undefined;
  if (req?.type === "GET_POPUP_STATE") return reconcilePopupState();
  if (req?.type === "GET_AUTH_USER") return getAuthIdentity();
  if (req?.type === "GET_CONNECTION_STATE") return getOptionsConnectionState(req.refresh ?? true, req.source ?? "active");
  if (req?.type === "SELECT_USEMEMOS_SOURCE") {
    return selectUseMemosSource().then(broadcastAuthChanged);
  }
  if (req?.type === "CONNECT_DIRECT") return activateConnection(() => verifyAndActivateDirectConnection(req));
  if (req?.type === "ACTIVATE_USEMEMOS_CONNECTION") return activateConnection(verifyAndActivateUseMemosConnection);
  if (req?.type === "DISCONNECT_CONNECTION") {
    return (async () => {
      const source = await clearActiveConnectionConfig();
      if (source !== "direct") await clearOAuthSession();
      await Promise.all([clearPopupState(), clearCachedVersion(), clearMemoSaveAttempts()]);
      await broadcastAuthChanged();
    })();
  }
  if (req?.type === "SAVE_MEMO") {
    return savePopupMemo(
      req.content,
      req.visibility,
      req.images ?? [],
      {
        source: req.expectedSource,
        connectionId: req.expectedConnectionId,
        instanceUrl: req.expectedInstanceUrl,
      },
      {
        requestId: req.saveRequestId ?? `legacy_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        startedAt: req.saveStartedAt ?? Date.now(),
        ...(req.saveRequestId ? { serverMemoId: req.saveRequestId } : {}),
      },
    );
  }
  if (req?.type === "OPEN_SIGN_IN") return openSignInFlow();
  if (req?.type === "SIGN_OUT") {
    return (async () => {
      const source = await clearActiveConnectionConfig({ preserveDirect: true });
      await clearOAuthSession();
      await Promise.all([clearPopupState(), ...(source !== "direct" ? [clearCachedVersion(), clearMemoSaveAttempts()] : [])]);
      await broadcastAuthChanged();
    })();
  }
  return undefined;
});

/** Flash a transient status badge on the toolbar icon (used by the context-menu quick-save). */
async function flashBadge(text: string, color: string): Promise<void> {
  await Promise.all([browser.action.setBadgeBackgroundColor({ color }), browser.action.setBadgeText({ text })]);
  setTimeout(() => void browser.action.setBadgeText({ text: "" }), 4000);
}

// One contextual item, shown on both a text selection and an image (never on a blank right-click).
// removeAll-then-create makes registration idempotent so it can run both on install and on every
// service-worker startup (menus can be lost when the SW is replaced, e.g. during development).
async function localizeBrowserUi(): Promise<void> {
  await localeReady;
  await Promise.all([
    browser.action.setTitle({ title: t("actionTitle") }),
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: "save-selection", title: t("contextMenuSaveSelection"), contexts: ["selection", "image"] });
    }),
  ]);
}
browser.runtime.onInstalled.addListener(() => localizeBrowserUi());
void localizeBrowserUi();
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[LOCALE_PREFERENCE_KEY]) return;
  applyLocalePreference(changes[LOCALE_PREFERENCE_KEY].newValue);
  void localizeBrowserUi();
});

/** After a save, drop the page's selection/focus (best-effort; no-op on pages without the content script). */
async function clearTabSelection(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  const clear: Request = { type: "CLEAR_SELECTION" };
  await browser.tabs.sendMessage(tabId, clear).catch(() => {});
}

/** Success copy that never hides a partial failure: a dropped image is named, not swallowed. */
function saveSuccessTitle(failedImages?: number): string {
  if (!failedImages) return t("popupSavedToMemos");
  return tp("contextSavePartial", failedImages);
}

/** In-page toast with the save outcome (best-effort; the toolbar badge is the fallback on pages without the content script). */
async function showSaveResultInTab(tabId: number | undefined, result: SaveResult, source?: "direct" | "usememos"): Promise<void> {
  if (tabId === undefined) return;
  await localeReady;
  // The in-page toast has no buttons, so the fix rides along in the text ("… — Sign in and reconnect.").
  const failureTitle = (kind: SaveErrorKind): string => {
    const detail = describeSaveError(kind, source);
    return detail.howToFix[0] ? t("contextFailureWithFix", [detail.title, detail.howToFix[0]]) : detail.title;
  };
  const msg: Request = result.ok
    ? {
        type: "SHOW_SAVE_RESULT",
        ok: true,
        title: saveSuccessTitle(result.failedImages),
        webUrl: result.webUrl,
        openLabel: t("commonOpen"),
        direction: getTextDirection(),
      }
    : {
        type: "SHOW_SAVE_RESULT",
        ok: false,
        title: failureTitle(result.errorKind),
        direction: getTextDirection(),
      };
  await browser.tabs.sendMessage(tabId, msg).catch(() => {});
}

/**
 * Renders the selection for saving. The content script (which has a DOM — the service worker does
 * not) converts the selection to markdown and extracts its image URLs, so a text+image selection
 * keeps its text and carries the images as real attachments. Falls back to Chrome's plain
 * `info.selectionText` (no images) when the content script isn't reachable.
 */
async function getSelectionClip(tabId: number | undefined, fallbackText: string): Promise<SelectionClip> {
  if (tabId !== undefined) {
    try {
      const get: Request = { type: "GET_SELECTION" };
      const clip = (await Promise.race([
        browser.tabs.sendMessage(tabId, get),
        new Promise<undefined>((resolve) => setTimeout(resolve, 2_000)),
      ])) as SelectionClip | undefined;
      if (clip?.markdown) return clip;
    } catch {
      // No content script here — fall through to the plain text Chrome already handed us.
    }
  }
  return { markdown: fallbackText, images: [] };
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-selection") return;
  // The same item covers both contexts. A bare image (srcUrl, no selection) is uploaded as an
  // attachment; anything with a text selection — including a selection that contains images — is
  // saved as the whole selection (see getSelectionClip), so mixed text+image isn't lost.
  const selectionText = info.selectionText?.trim();
  const isImage = Boolean(info.srcUrl) && !selectionText;
  if (!isImage && !selectionText) return;

  // Start rendering the clip immediately — it only needs the tab, not the auth/version gate,
  // and its content-script round-trip (up to 2s) is the slow part of a quick-save. When the
  // gate fails below, the one wasted GET_SELECTION message is harmless. (getSelectionClip
  // never rejects, so an early gate return can't leave an unhandled rejection.)
  const clipPromise =
    isImage && info.srcUrl
      ? Promise.resolve({ markdown: "", images: [info.srcUrl] }) // a bare image is just a clip with one image
      : getSelectionClip(tab?.id, selectionText ?? "");

  // The item follows the same gate as the popup. When a setup gate isn't met we open the place
  // that resolves it (opening the tab is the feedback).
  let connection: Awaited<ReturnType<typeof resolveActiveConnection>>;
  try {
    connection = await resolveActiveConnection();
  } catch (error) {
    if (!(error instanceof OAuthUnavailableError)) throw error;
    const result: SaveResult = { ok: false, errorKind: "auth-unavailable" };
    await Promise.all([flashBadge("!", "#dc2626"), showSaveResultInTab(tab?.id, result)]);
    return;
  }
  if (!connection) {
    await browser.runtime.openOptionsPage();
    return;
  }
  const { credentials } = connection;
  // Version is a per-device cache (see instance-version.ts); resolve it, self-populating on a
  // device that connected on another machine but never verified here.
  const version = credentials ? await resolveVersion(credentials) : null;
  if (!version || !isSupportedVersion(version)) {
    await browser.runtime.openOptionsPage();
    return;
  }

  const template = await readClipTemplate();
  const title = tab?.title ?? "";
  const url = info.pageUrl ?? tab?.url ?? "";
  const result = await saveSelectionClip(await clipPromise, title, url, credentials, template);

  if (!result.ok) {
    console.warn("[memos-web-clipper] context-menu save failed:", describeSaveError(result.errorKind).title);
  }
  // The three outcome signals are independent — badge, selection cleanup, and in-page toast.
  await Promise.all([
    result.ok ? clearTabSelection(tab?.id) : Promise.resolve(),
    result.ok ? flashBadge("✓", "#C96442") : flashBadge("!", "#dc2626"),
    showSaveResultInTab(tab?.id, result, connection.source),
  ]);
});
