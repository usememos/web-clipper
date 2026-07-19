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
});

afterEach(() => {
  cleanup();
  resetBrowserMock();
  vi.clearAllMocks();
});
