import { sendBackgroundRequest } from "@/lib/runtime-client";

/**
 * Kicks off the sign-in flow. The background owns the browser identity + PKCE flow.
 */
export function openSignIn(): void {
  void sendBackgroundRequest({ type: "OPEN_SIGN_IN" });
}
