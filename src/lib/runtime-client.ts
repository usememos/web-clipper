import browser from "webextension-polyfill";
import type { BackgroundRequest } from "./background-protocol";
import type { AuthUserResult, PopupStateResult, SaveResult } from "./messages";

type BackgroundResponse<T extends BackgroundRequest> = T["type"] extends "GET_POPUP_STATE"
  ? PopupStateResult
  : T["type"] extends "GET_AUTH_USER"
    ? AuthUserResult
    : T["type"] extends "SAVE_MEMO"
      ? SaveResult
      : undefined;

/** Typed one-shot client for the popup/options → service-worker protocol. */
export async function sendBackgroundRequest<T extends BackgroundRequest>(request: T): Promise<BackgroundResponse<T>> {
  return (await browser.runtime.sendMessage(request)) as BackgroundResponse<T>;
}
