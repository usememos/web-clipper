/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_CLERK_OAUTH_CLIENT_ID: string;
  readonly VITE_CLERK_OAUTH_ISSUER: string;
  readonly VITE_WEB_APP_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
