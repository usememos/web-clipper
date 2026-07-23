// `key` pins the Chromium development ID so its OAuth redirect URL stays stable. It is
// the Chrome Web Store item's public key; `pnpm package` strips it from store uploads.
// Derived extension ID: nebaoebnljalfegiidibihhkebeiklbl
import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "./package.json" with { type: "json" };

const CRX_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmRoLWedC3Tu8Yxa6G7RInn3/lwGxyDXrkzP+9woIELHjA5y6XN3AJp3cPPB1wCWqFu2HZ4Bx2q7whbpbOEPKk2ZTegnTOsYwzCwAr2FBXKWcslXO9obNo0nzx2zUw9Rgu22URa+8k9i8DxLfPxdFaJYciEyg7rFv0X7x9HJcSKirbZ9fuCPUpciCdx8/rTnex/l244SSPMwtMq3I1UZSQCMM4HooexHGgpAJ3ShWIAHjEkRhCYS6wUuJUEFCobdj04UAUGnt73CljG9NFs+ro/tJgDxkIjj75dJ1olMcDj2J2WmSKPO4CzGlmGxLIs6RWFBIvZOnQEWoKrehz3x8TQIDAQAB";

export default defineManifest({
  manifest_version: 3,
  key: CRX_KEY,
  default_locale: "en",
  name: "__MSG_extensionName__",
  // package.json is the release version's single source of truth.
  version: packageJson.version,
  description: "__MSG_extensionDescription__",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_icon: {
      16: "icons/action-16.png",
      32: "icons/action-32.png",
    },
    default_popup: "src/popup/index.html",
    default_title: "__MSG_actionTitle__",
  },
  options_ui: { page: "src/options/index.html", open_in_tab: true },
  background: { service_worker: "src/background.ts", type: "module" },
  // "scripting": the popup captures the page's selection via executeScript so it works even on
  // tabs whose content script is stale (opened before the extension was installed or updated).
  permissions: ["storage", "identity", "contextMenus", "activeTab", "scripting"],
  // Broad host access is required: the clipper reads arbitrary instance origins and, when saving
  // an image via the context menu, downloads image bytes from arbitrary CDNs — neither can be
  // prompted for from a context-menu click. Covers usememos.com, the OAuth issuer, and localhost.
  host_permissions: ["https://*/*", "http://*/*"],
  content_scripts: [{ matches: ["<all_urls>"], js: ["src/content.ts"], run_at: "document_idle" }],
});
