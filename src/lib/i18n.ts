import englishMessages from "../../public/_locales/en/messages.json" with { type: "json" };

type EnglishCatalog = typeof englishMessages;
export type MessageKey = keyof EnglishCatalog;
type PluralKey = Extract<MessageKey, `${string}_other`>;
export type PluralMessageKey = PluralKey extends `${infer Base}_other` ? Base : never;
export type MessageSubstitutions = string | number | readonly (string | number)[];
type CatalogEntry = { message: string; placeholders?: Record<string, { content: string }> };
const sourceCatalog = englishMessages as unknown as Record<MessageKey, CatalogEntry>;

const catalogModules = import.meta.glob("../../public/_locales/*/messages.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<MessageKey, CatalogEntry>>;

const catalogs = Object.fromEntries(
  Object.entries(catalogModules).map(([path, catalog]) => {
    const locale = /\/_locales\/([^/]+)\/messages\.json$/.exec(path)?.[1];
    if (!locale) throw new Error(`Invalid locale catalog path: ${path}`);
    return [locale, catalog];
  }),
) as Record<string, Record<MessageKey, CatalogEntry>>;

if (!catalogs.en) throw new Error("The English locale catalog is required.");

export const SUPPORTED_LOCALES = Object.freeze(
  Object.keys(catalogs).sort((left, right) => {
    if (left === right) return 0;
    if (left === "en") return -1;
    if (right === "en") return 1;
    return left.localeCompare(right);
  }),
);
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = "browser" | SupportedLocale;
export const LOCALE_PREFERENCE_KEY = "localePreferenceV1";

const preferredAutonyms: Record<string, string> = {
  browser: "",
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  ja: "日本語",
  zh_CN: "简体中文",
  zh_TW: "繁體中文",
};

function toLocaleTag(locale: string): string {
  return locale.replaceAll("_", "-");
}

function localeAutonym(locale: string): string {
  if (preferredAutonyms[locale]) return preferredAutonyms[locale];
  const tag = toLocaleTag(locale);
  try {
    return new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export const LOCALE_AUTONYMS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(["browser", ...SUPPORTED_LOCALES].map((locale) => [locale, localeAutonym(locale)])),
);

let localePreference: LocalePreference = "browser";

type ExtensionI18n = {
  getMessage(messageName: string, substitutions?: string | string[]): string;
  getUILanguage(): string;
};

type ExtensionStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

function extensionApis(): {
  i18n?: ExtensionI18n;
  storage?: ExtensionStorage;
} {
  const extensionGlobals = globalThis as typeof globalThis & {
    browser?: { i18n?: ExtensionI18n; storage?: { local?: ExtensionStorage } };
    chrome?: { i18n?: ExtensionI18n; storage?: { local?: ExtensionStorage } };
  };
  return {
    i18n: extensionGlobals.browser?.i18n ?? extensionGlobals.chrome?.i18n,
    storage: extensionGlobals.browser?.storage?.local ?? extensionGlobals.chrome?.storage?.local,
  };
}

function normalizeSubstitutions(substitutions?: MessageSubstitutions): string[] {
  if (substitutions === undefined) return [];
  return (Array.isArray(substitutions) ? substitutions : [substitutions]).map(String);
}

function formatCatalogMessage(entry: CatalogEntry | undefined, substitutions: string[], fallback: string): string {
  if (!entry) return fallback;
  const placeholders = entry.placeholders;
  return entry.message
    .replace(/\$([a-zA-Z0-9_]+)\$/g, (token, name: string) => {
      const placeholder = placeholders?.[name.toLowerCase()];
      if (!placeholder) return token;
      const match = /^\$(\d+)$/.exec(placeholder.content);
      return match ? (substitutions[Number(match[1]) - 1] ?? "") : placeholder.content;
    })
    .replace(/\$\$/g, "$");
}

function fallbackMessage(key: MessageKey, substitutions: string[]): string {
  return formatCatalogMessage(sourceCatalog[key], substitutions, key);
}

function getMessage(key: string, substitutions: string[]): string {
  if (localePreference !== "browser") {
    return formatCatalogMessage(catalogs[localePreference]?.[key as MessageKey], substitutions, "");
  }
  return extensionApis().i18n?.getMessage(key, substitutions) || "";
}

function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "browser" || SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

/** Loads the user's language choice before an extension surface renders. */
export async function initializeLocalePreference(): Promise<LocalePreference> {
  try {
    const stored = await extensionApis().storage?.get(LOCALE_PREFERENCE_KEY);
    localePreference = isLocalePreference(stored?.[LOCALE_PREFERENCE_KEY]) ? stored[LOCALE_PREFERENCE_KEY] : "browser";
  } catch {
    localePreference = "browser";
  }
  return localePreference;
}

/** Applies a language immediately and persists it for other extension surfaces. */
export async function updateLocalePreference(preference: LocalePreference): Promise<void> {
  await extensionApis().storage?.set({ [LOCALE_PREFERENCE_KEY]: preference });
  localePreference = preference;
}

/** Applies an already-validated preference received through storage.onChanged. */
export function applyLocalePreference(value: unknown): LocalePreference {
  localePreference = isLocalePreference(value) ? value : "browser";
  return localePreference;
}

export function getLocalePreference(): LocalePreference {
  return localePreference;
}

/** Returns a localized WebExtension message with a bundled-English safety fallback. */
export function t(key: MessageKey, substitutions?: MessageSubstitutions): string {
  const normalized = normalizeSubstitutions(substitutions);
  const localized = getMessage(key, normalized);
  if (localized) return localized;
  if (import.meta.env.DEV) console.warn(`[memos-web-clipper] Missing i18n message: ${key}`);
  return fallbackMessage(key, normalized);
}

/** Selects a CLDR plural category, with the catalog's `_other` form as the safe fallback. */
export function tp(baseKey: PluralMessageKey, count: number, substitutions: readonly (string | number)[] = []): string {
  const normalized = [String(count), ...substitutions.map(String)];
  const category = new Intl.PluralRules(getUiLocale()).select(count);
  const categoryKey = `${baseKey}_${category}`;
  const localized = getMessage(categoryKey, normalized) || getMessage(`${baseKey}_other`, normalized);
  if (localized) return localized;
  return fallbackMessage(`${baseKey}_other` as MessageKey, normalized);
}

export function getUiLocale(): string {
  return localePreference === "browser" ? extensionApis().i18n?.getUILanguage() || "en" : toLocaleTag(localePreference);
}

export function getTextDirection(): "ltr" | "rtl" {
  if (localePreference !== "browser") return "ltr";
  return extensionApis().i18n?.getMessage("@@bidi_dir") === "rtl" ? "rtl" : "ltr";
}

/** Applies locale metadata and a localized title before a React view renders. */
export function localizeDocument(titleKey: MessageKey): void {
  document.documentElement.lang = getUiLocale();
  document.documentElement.dir = getTextDirection();
  document.title = t(titleKey);
}
