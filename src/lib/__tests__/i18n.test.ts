import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLocalePreference,
  formatDateTime,
  getLocalePreference,
  getTextDirection,
  getUiLocale,
  initializeLocalePreference,
  LOCALE_AUTONYMS,
  LOCALE_PREFERENCE_KEY,
  SUPPORTED_LOCALES,
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

  it("allows Russian and Korean to be manually selected", async () => {
    const set = vi.fn(async () => undefined);
    vi.stubGlobal("browser", {
      i18n: { getMessage: () => "", getUILanguage: () => "en-US" },
      storage: { local: { set } },
    });

    expect(SUPPORTED_LOCALES).toEqual(expect.arrayContaining(["ru", "ko"]));
    expect(LOCALE_AUTONYMS.ru).toBe("Русский");
    expect(LOCALE_AUTONYMS.ko).toBe("한국어");

    await updateLocalePreference("ru");
    expect(getUiLocale()).toBe("ru");
    expect(t("commonOpenSettings")).toBe("Открыть настройки");

    await updateLocalePreference("ko");
    expect(getUiLocale()).toBe("ko");
    expect(t("commonOpenSettings")).toBe("설정 열기");
    expect(set).toHaveBeenNthCalledWith(1, { [LOCALE_PREFERENCE_KEY]: "ru" });
    expect(set).toHaveBeenNthCalledWith(2, { [LOCALE_PREFERENCE_KEY]: "ko" });
  });

  it("selects the Russian one, few, and many plural forms", () => {
    applyLocalePreference("ru");

    expect(tp("historyCount", 1)).toBe("1 сохранённый материал");
    expect(tp("historyCount", 2)).toBe("2 сохранённых материала");
    expect(tp("historyCount", 5)).toBe("5 сохранённых материалов");
  });

  it("formats dates using a manually selected locale", () => {
    const value = Date.UTC(2026, 6, 26, 14, 5);
    const options = { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" } satisfies Intl.DateTimeFormatOptions;

    applyLocalePreference("ru");
    expect(formatDateTime(value, options)).toBe(new Intl.DateTimeFormat("ru", options).format(value));

    applyLocalePreference("ko");
    expect(formatDateTime(value, options)).toBe(new Intl.DateTimeFormat("ko", options).format(value));
  });
});
