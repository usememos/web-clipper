import { vi } from "vitest";
import englishMessages from "../../public/_locales/en/messages.json" with { type: "json" };

/**
 * In-memory fake of the `webextension-polyfill` `browser` object.
 *
 * Every async API defaults to a benign resolved value so a test only stubs what
 * it asserts. Listeners registered at module import (background/content register
 * at load) survive `resetBrowserMock()`, which only clears storage and call
 * history — so a test file imports those modules once and replays messages
 * through the captured listeners.
 */

type AnyFn = (...args: any[]) => any;

type FakeEvent = {
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  hasListener: ReturnType<typeof vi.fn>;
  /** Dispatch to every registered listener and collect results (awaited). */
  emit: (...args: unknown[]) => Promise<unknown[]>;
  /** First non-undefined listener result — mirrors runtime.onMessage semantics. */
  emitFirst: (...args: unknown[]) => Promise<unknown>;
  listeners: Set<AnyFn>;
};

function fakeEvent(): FakeEvent {
  const listeners = new Set<AnyFn>();
  return {
    listeners,
    addListener: vi.fn((fn: AnyFn) => listeners.add(fn)),
    removeListener: vi.fn((fn: AnyFn) => listeners.delete(fn)),
    hasListener: vi.fn((fn: AnyFn) => listeners.has(fn)),
    emit: async (...args) => {
      const out: unknown[] = [];
      for (const fn of listeners) out.push(await fn(...args));
      return out;
    },
    emitFirst: async (...args) => {
      for (const fn of listeners) {
        const r = await fn(...args);
        if (r !== undefined) return r;
      }
      return undefined;
    },
  };
}

/** Backing store for storage.local; module-scoped so reset can clear it. */
const store = new Map<string, unknown>();
let uiLocale = "en";
let textDirection: "ltr" | "rtl" = "ltr";

type TestCatalog = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;
let messageCatalog: TestCatalog = englishMessages;

function resolveMessage(messageName: string, substitutions?: string | string[]): string {
  if (messageName === "@@ui_locale") return uiLocale.replaceAll("-", "_");
  if (messageName === "@@bidi_dir") return textDirection;
  const entry = (messageCatalog[messageName] ?? englishMessages[messageName as keyof typeof englishMessages]) as
    | { message: string; placeholders?: Record<string, { content: string }> }
    | undefined;
  if (!entry) return "";
  const values = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
  return entry.message
    .replace(/\$([a-zA-Z0-9_]+)\$/g, (token, name: string) => {
      const placeholder = entry.placeholders?.[name.toLowerCase()];
      const match = placeholder && /^\$(\d+)$/.exec(placeholder.content);
      return match ? (values[Number(match[1]) - 1] ?? "") : token;
    })
    .replace(/\$\$/g, "$");
}

function makeStorageArea() {
  return {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys == null) return Object.fromEntries(store);
      const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const result: Record<string, unknown> = {};
      for (const k of names) if (store.has(k)) result[k] = store.get(k);
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    }),
    clear: vi.fn(async () => {
      store.clear();
    }),
    setAccessLevel: vi.fn(async (_options: { accessLevel: "TRUSTED_CONTEXTS" }) => undefined),
  };
}

function build() {
  return {
    runtime: {
      onMessage: fakeEvent(),
      onInstalled: fakeEvent(),
      sendMessage: vi.fn(async (_msg: unknown) => undefined as unknown),
      getURL: vi.fn((path: string) => `chrome-extension://test-id/${path.replace(/^\//, "")}`),
      openOptionsPage: vi.fn(async () => undefined),
      id: "test-id",
    },
    identity: {
      getRedirectURL: vi.fn((path = "") => `https://test-id.chromiumapp.org/${path}`),
      launchWebAuthFlow: vi.fn(async (_details: unknown) => undefined as string | undefined),
    },
    i18n: {
      getMessage: vi.fn(resolveMessage),
      getUILanguage: vi.fn(() => uiLocale),
    },
    tabs: {
      onUpdated: fakeEvent(),
      onRemoved: fakeEvent(),
      query: vi.fn(async (_q: unknown) => [] as Array<{ id?: number; url?: string; status?: string; title?: string }>),
      create: vi.fn(async (_props: unknown) => ({ id: 999 })),
      remove: vi.fn(async (_id: number) => undefined),
      sendMessage: vi.fn(async (_id: number, _msg: unknown) => undefined as unknown),
    },
    storage: {
      local: makeStorageArea(),
      onChanged: fakeEvent(),
    },
    scripting: {
      executeScript: vi.fn(async (_opts: unknown) => [{ result: null }] as Array<{ result: unknown }>),
    },
    contextMenus: {
      onClicked: fakeEvent(),
      create: vi.fn((_props: unknown) => "menu-id"),
      removeAll: vi.fn(async () => undefined),
    },
    action: {
      setBadgeText: vi.fn(async (_d: unknown) => undefined),
      setBadgeBackgroundColor: vi.fn(async (_d: unknown) => undefined),
      setTitle: vi.fn(async (_d: unknown) => undefined),
    },
  };
}

export type BrowserMock = ReturnType<typeof build>;

export const browserMock: BrowserMock = build();

/** Re-apply default implementations to every vi.fn on the mock (deep). */
function applyDefaults(): void {
  const fresh = build();
  walk(browserMock, fresh);
}

function walk(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (typeof sv === "function" && "mockReset" in sv && tv && "mockReset" in tv) {
      // Restore the default implementation captured in the fresh build.
      tv.mockReset();
      tv.mockImplementation(sv.getMockImplementation());
    } else if (sv && typeof sv === "object" && "emit" in sv) {
      // Fake event: keep listeners (module handlers persist), reset call history.
      tv.addListener.mockClear();
      tv.removeListener.mockClear();
      tv.hasListener.mockClear();
    } else if (sv && typeof sv === "object") {
      walk(tv, sv);
    }
  }
}

/** Reset storage + call history between tests; keeps registered listeners. */
export function resetBrowserMock(): void {
  store.clear();
  uiLocale = "en";
  textDirection = "ltr";
  messageCatalog = englishMessages;
  applyDefaults();
}

/** Switch the browser UI locale and message catalog for localization tests. */
export function setBrowserLocale(locale: string, catalog: TestCatalog, direction: "ltr" | "rtl" = "ltr"): void {
  uiLocale = locale;
  textDirection = direction;
  messageCatalog = catalog;
  browserMock.i18n.getMessage.mockImplementation(resolveMessage);
  browserMock.i18n.getUILanguage.mockImplementation(() => uiLocale);
}

/** Seed storage.local directly (bypasses the set() spy). */
export function seedStorage(items: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(items)) store.set(k, v);
}
