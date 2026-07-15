import { resolve } from "node:path";
import { crx } from "@crxjs/vite-plugin";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import manifest from "./manifest.config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const required = ["VITE_CLERK_OAUTH_CLIENT_ID", "VITE_CLERK_OAUTH_ISSUER", "VITE_WEB_APP_URL"] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing required extension environment: ${missing.join(", ")}`);

  return {
    plugins: [react(), tailwind(), crx({ manifest })],
    resolve: { alias: { "@": resolve(__dirname, "src") } },
  };
});
