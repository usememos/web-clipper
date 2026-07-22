import browser from "webextension-polyfill";
import type { ConnectionSource } from "./connection-config";

export const POPUP_STATE_KEY = "popupStateV1";

export type PopupIdentity = {
  userId: string;
  displayName: string;
  imageUrl?: string;
};

type SignedInPopupState = {
  source: ConnectionSource;
  identity: PopupIdentity;
  template: string | null;
  updatedAt: number;
};

export type PopupState =
  | { status: "signed-out"; source: "usememos" | null; updatedAt: number }
  | (SignedInPopupState & { status: "disconnected" })
  | (SignedInPopupState & { status: "ready"; instanceUrl: string; version: string })
  | (SignedInPopupState & { status: "unsupported"; instanceUrl: string; version: string | null });

function isPopupState(value: unknown): value is PopupState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (typeof state.updatedAt !== "number") return false;
  if (state.status === "signed-out") return state.source === null || state.source === "usememos";
  if (state.status !== "disconnected" && state.status !== "ready" && state.status !== "unsupported") return false;
  const identity = state.identity as Record<string, unknown> | undefined;
  if (!identity || typeof identity.userId !== "string" || typeof identity.displayName !== "string") return false;
  if (state.source !== "direct" && state.source !== "usememos") return false;
  if (state.template !== null && typeof state.template !== "string") return false;
  if (state.status === "disconnected") return true;
  return typeof state.instanceUrl === "string" && (state.version === null || typeof state.version === "string");
}

/** Non-secret state used only to make a returning user's popup immediately renderable. */
export async function readPopupState(): Promise<PopupState | null> {
  const stored = await browser.storage.local.get(POPUP_STATE_KEY);
  return isPopupState(stored[POPUP_STATE_KEY]) ? stored[POPUP_STATE_KEY] : null;
}

export async function writePopupState(state: PopupState): Promise<void> {
  await browser.storage.local.set({ [POPUP_STATE_KEY]: state });
}

export async function clearPopupState(): Promise<void> {
  await browser.storage.local.remove(POPUP_STATE_KEY);
}
