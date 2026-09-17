import type { AiError } from "./ai";
import { type MessageKey, t } from "./i18n";

const messages: Record<AiError, MessageKey> = {
  settings: "aiErrorSettings",
  "settings-conflict": "aiSettingsConflict",
  "settings-changed": "aiSettingsChanged",
  "empty-tags": "aiEmptyTags",
  "missing-key": "aiErrorMissingKey",
  "invalid-key": "aiErrorInvalidKey",
  quota: "aiErrorQuota",
  "rate-limit": "aiErrorRateLimit",
  timeout: "aiErrorTimeout",
  unavailable: "aiErrorUnavailable",
  "invalid-response": "aiErrorResponse",
  "too-long": "aiErrorTooLong",
  "no-content": "aiErrorNoContent",
};
export function aiErrorMessage(error: AiError): string {
  return t(messages[error]);
}
