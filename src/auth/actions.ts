import { sendBackgroundRequest } from "@/lib/runtime-client";

/**
 * Kicks off the sign-in flow. The background owns the browser identity + PKCE flow.
 */
export function openSignIn(): Promise<void> {
  return sendBackgroundRequest({ type: "OPEN_SIGN_IN" });
}
