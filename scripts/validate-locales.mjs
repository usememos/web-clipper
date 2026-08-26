import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const localesRoot = join(root, "public", "_locales");

const fail = (message) => {
  throw new Error(`Locale validation failed: ${message}`);
};

const readCatalog = (locale) => {
  const path = join(localesRoot, locale, "messages.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${locale}/messages.json is missing or invalid JSON (${error.message})`);
  }
};

const actualLocales = readdirSync(localesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (!actualLocales.includes("en")) fail("the default en locale directory is missing");

const source = readCatalog("en");
const sourceKeys = Object.keys(source).sort();
if (!sourceKeys.length) fail("the English source catalog is empty");

const namedTokens = (message) => [...message.matchAll(/\$([a-zA-Z][a-zA-Z0-9_]*)\$/g)].map((match) => match[1].toLowerCase()).sort();
const placeholderSchema = (entry) =>
  Object.fromEntries(
    Object.entries(entry.placeholders ?? {})
      .map(([name, value]) => [name.toLowerCase(), value.content])
      .sort(([left], [right]) => left.localeCompare(right)),
  );

const validateEntry = (locale, key, entry, sourceEntry) => {
  if (!entry || typeof entry.message !== "string" || !entry.message.trim()) fail(`${locale}.${key} must have a non-empty message`);
  const expectedSchema = placeholderSchema(sourceEntry);
  const actualSchema = placeholderSchema(entry);
  if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) fail(`${locale}.${key} has a mismatched placeholder schema`);
  const tokens = namedTokens(entry.message);
  const placeholders = Object.keys(actualSchema).sort();
  if (tokens.join("\0") !== placeholders.join("\0")) fail(`${locale}.${key} message and placeholder names do not match`);
};

const pluralSourceKeyForExtra = (key, validCategories) => {
  const match = /^(.*)_([a-z]+)$/.exec(key);
  if (!match) return null;
  const [, base, category] = match;
  const sourceOtherKey = `${base}_other`;
  if (!(sourceOtherKey in source) || !validCategories.has(category)) return null;
  return sourceOtherKey;
};

for (const locale of actualLocales) {
  const catalog = readCatalog(locale);
  const keys = Object.keys(catalog).sort();
  const missing = sourceKeys.filter((key) => !(key in catalog));
  const extra = keys.filter((key) => !(key in source));
  if (missing.length) fail(`${locale} is missing source keys [${missing.join(", ")}]`);

  for (const key of sourceKeys) {
    validateEntry(locale, key, catalog[key], source[key]);
  }

  const localeTag = locale.replaceAll("_", "-");
  const validPluralCategories = new Set(new Intl.PluralRules(localeTag).resolvedOptions().pluralCategories);
  for (const key of extra) {
    const sourceKey = pluralSourceKeyForExtra(key, validPluralCategories);
    if (!sourceKey) fail(`${locale} has unsupported extra key ${key}`);
    validateEntry(locale, key, catalog[key], source[sourceKey]);
  }
}

const manifestSource = readFileSync(join(root, "manifest.config.ts"), "utf8");
for (const match of manifestSource.matchAll(/__MSG_([a-zA-Z0-9_@]+)__/g)) {
  if (!(match[1] in source)) fail(`manifest references unknown message ${match[1]}`);
}
if (!/default_locale:\s*"en"/.test(manifestSource)) fail('manifest default_locale must be "en"');

console.log(`Validated ${sourceKeys.length} messages across ${actualLocales.length} locales.`);
