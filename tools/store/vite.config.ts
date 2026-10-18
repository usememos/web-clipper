import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));

// A local artwork workspace; does not load the extension manifest or OAuth env.
export default defineConfig({
  root,
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  build: {
    outDir: "tmp/store-preview",
    rolldownOptions: {
      input: {
        artboards: fileURLToPath(new URL("./artboards.html", import.meta.url)),
        ui: fileURLToPath(new URL("./ui.html", import.meta.url)),
      },
    },
  },
});
