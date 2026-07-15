import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { resetBrowserMock } from "./browser-mock";

// Every module under test imports `browser` from webextension-polyfill; route it
// to the shared in-memory mock. The async factory resolves to the same module
// instance the tests import, so `browserMock` is shared.
vi.mock("webextension-polyfill", async () => {
  const { browserMock } = await import("./browser-mock");
  return { default: browserMock };
});

// jsdom is missing a handful of browser APIs that base-ui / next-themes / sonner
// touch on render. Stub them so component trees mount cleanly.
beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
  for (const name of ["ResizeObserver", "IntersectionObserver"] as const) {
    if (!(name in globalThis)) {
      (globalThis as any)[name] = class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      };
    }
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
  // jsdom here doesn't provide localStorage; the popup's synchronous version cache uses it.
  if (!window.localStorage) {
    const store = new Map<string, string>();
    (window as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
  } else {
    window.localStorage.clear();
  }
});

afterEach(() => {
  cleanup();
  resetBrowserMock();
  vi.clearAllMocks();
});
