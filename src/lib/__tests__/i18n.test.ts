import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLocalePreference,
  getLocalePreference,
  getTextDirection,
  getUiLocale,
  initializeLocalePreference,
  LOCALE_PREFERENCE_KEY,
  t,
  tp,
  updateLocalePreference,
} from "../i18n";

afterEach(() => {
  applyLocalePreference("browser");
  vi.unstubAllGlobals();
});

describe("i18n", () => {
  it("uses the bundled English catalog outside an extension runtime", () => {
    expect(t("commonOpenSettings")).toBe("Open settings");
    expect(t("optionsConnectedAs", "Ada")).toBe("Connected as Ada");
  });

  it("falls back to readable English when the browser reports a missing message", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("browser", { i18n: { getMessage: () => "", getUILanguage: () => "en" } });

    expect(t("commonTryAgain")).toBe("Try again");
    if (import.meta.env.DEV) expect(warning).toHaveBeenCalledWith(expect.stringContaining("commonTryAgain"));

    warning.mockRestore();
  });

  it("passes positional values to the browser so translated placeholders may be reordered", () => {
    const getMessage = vi.fn((_key: string, substitutions?: string | string[]) => {
      const values = Array.isArray(substitutions) ? substitutions : [substitutions ?? ""];
      return `${values[1]} / ${values[0]}`;
    });
    vi.stubGlobal("browser", { i18n: { getMessage, getUILanguage: () => "de" } });

    expect(t("contextFailureWithFix", ["Titel", "Lösung"])).toBe("Lösung / Titel");
    expect(getMessage).toHaveBeenCalledWith("contextFailureWithFix", ["Titel", "Lösung"]);
  });

  it("selects one and other plural forms", () => {
    const getMessage = vi.fn((key: string, substitutions?: string | string[]) => {
      const count = Array.isArray(substitutions) ? substitutions[0] : substitutions;
      if (key === "popupFailedImages_one") return `${count} image failed`;
      if (key === "popupFailedImages_other") return `${count} images failed`;
      return "";
    });
    vi.stubGlobal("browser", { i18n: { getMessage, getUILanguage: () => "en" } });

    expect(tp("popupFailedImages", 1)).toBe("1 image failed");
    expect(tp("popupFailedImages", 3)).toBe("3 images failed");
  });

  it("reads locale and direction from predefined WebExtension messages", () => {
    vi.stubGlobal("browser", {
      i18n: {
        getMessage: (key: string) => (key === "@@bidi_dir" ? "rtl" : ""),
        getUILanguage: () => "ar",
      },
    });

    expect(getUiLocale()).toBe("ar");
    expect(getTextDirection()).toBe("rtl");
  });

  it("loads and persists a manual locale override", async () => {
    const storage = {
      get: vi.fn(async () => ({ [LOCALE_PREFERENCE_KEY]: "es" })),
      set: vi.fn(async () => undefined),
    };
    vi.stubGlobal("browser", {
      i18n: { getMessage: () => "", getUILanguage: () => "en-US" },
      storage: { local: storage },
    });

    await initializeLocalePreference();
    expect(getLocalePreference()).toBe("es");
    expect(getUiLocale()).toBe("es");
    expect(t("optionsChooseHowToConnect")).toBe("Elige cómo conectarte");

    await updateLocalePreference("ja");
    expect(getLocalePreference()).toBe("ja");
    expect(t("optionsChooseHowToConnect")).toBe("接続方法を選択");
    expect(storage.set).toHaveBeenCalledWith({ [LOCALE_PREFERENCE_KEY]: "ja" });
  });
});
