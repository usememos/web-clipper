import { createRoot } from "react-dom/client";
import { quote, records, sourceTitle, sourceUrl } from "./fixtures";
import "../../src/index.css";

// This entry point runs only in Vite's local preview. No tokens, account, or
// network are needed; the production components receive deterministic samples.
const storage: Record<string, unknown> = { localePreferenceV1: "en" };
const event = { addListener() {}, removeListener() {}, hasListener: () => false };
const api = {
  runtime: {
    id: "store-artwork",
    getURL: (path: string) => new URL(path, window.location.origin).href,
    onMessage: event,
    async openOptionsPage() {},
    async sendMessage(message: { type: string }) {
      switch (message.type) {
        case "GET_POPUP_STATE":
          return {
            status: "ready",
            source: "direct",
            identity: { userId: "sample-alex", displayName: "Alex Morgan", memosUserName: "users/alex" },
            template: null,
            instanceUrl: "https://memos.example",
            version: "26.10.0",
            updatedAt: 1,
          };
        case "GET_CLIP_STATUS":
          return null;
        case "LIST_SPACES":
          return {
            ok: true,
            spaces: [
              { name: "spaces/reading", title: "Reading" },
              { name: "spaces/work", title: "Work" },
            ],
          };
        case "LIST_CLIP_RECORDS":
          return records;
        case "SAVE_MEMO":
          return { ok: true, webUrl: "https://memos.example/memos/sample-0" };
        default:
          return null;
      }
    },
  },
  storage: {
    local: {
      async get(keys: string | string[]) {
        return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => key in storage).map((key) => [key, storage[key]]));
      },
      async set(items: Record<string, unknown>) {
        Object.assign(storage, items);
      },
      async remove(keys: string | string[]) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
      },
    },
    onChanged: event,
  },
  tabs: {
    async query() {
      return [{ id: 1, title: sourceTitle, url: sourceUrl }];
    },
    async create() {},
    async sendMessage() {},
  },
  scripting: {
    async executeScript() {
      return [
        {
          result: {
            title: sourceTitle,
            url: sourceUrl,
            description: "A few notes on making space for your own thoughts.",
            selectionHtml: `<p>${quote}</p>`,
            images: [],
          },
        },
      ];
    },
  },
  i18n: {
    getUILanguage: () => "en",
    getMessage(key: string) {
      if (key === "@@ui_locale") return "en";
      if (key === "@@bidi_dir") return "ltr";
      return "";
    },
  },
};
Object.assign(globalThis, { browser: api, chrome: api });
const { initializeLocalePreference } = await import("../../src/lib/i18n");
await initializeLocalePreference();
const root = createRoot(document.getElementById("root")!);
if (new URLSearchParams(location.search).get("view") === "history") {
  const { ClipHistory } = await import("../../src/history/ClipHistory");
  root.render(<ClipHistory />);
} else {
  const { App } = await import("../../src/popup/App");
  root.render(<App />);
}
