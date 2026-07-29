import browser from "webextension-polyfill";
import type { BackgroundRequest } from "./background-protocol";
import type { ClipRecord, ClipSaveStatus } from "./clip-records";
import type { AuthUserResult, ConnectionActionResult, ConnectionStateResult, PopupStateResult, SaveResult } from "./messages";

type BackgroundResponses = {
  GET_POPUP_STATE: PopupStateResult;
  GET_AUTH_USER: AuthUserResult;
  GET_CONNECTION_STATE: ConnectionStateResult;
  GET_CLIP_STATUS: ClipSaveStatus | null;
  LIST_CLIP_RECORDS: ClipRecord[];
  CONNECT_DIRECT: ConnectionActionResult;
  ACTIVATE_USEMEMOS_CONNECTION: ConnectionActionResult;
  SAVE_MEMO: SaveResult;
};

type BackgroundResponse<T extends BackgroundRequest> = T["type"] extends keyof BackgroundResponses
  ? BackgroundResponses[T["type"]]
  : undefined;

/** Typed one-shot client for the popup/options → service-worker protocol. */
export async function sendBackgroundRequest<T extends BackgroundRequest>(request: T): Promise<BackgroundResponse<T>> {
  return (await browser.runtime.sendMessage(request)) as BackgroundResponse<T>;
}
