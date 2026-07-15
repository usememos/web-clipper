/** Single home for the public OAuth client configuration used by every browser build. */
export const CLERK_OAUTH_CLIENT_ID = import.meta.env.VITE_CLERK_OAUTH_CLIENT_ID ?? "";
export const CLERK_OAUTH_ISSUER = import.meta.env.VITE_CLERK_OAUTH_ISSUER ?? "";
export const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL;
