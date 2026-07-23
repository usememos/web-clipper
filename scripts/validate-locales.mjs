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

for (const locale of actualLocales) {
  const catalog = readCatalog(locale);
  const keys = Object.keys(catalog).sort();
  const missing = sourceKeys.filter((key) => !(key in catalog));
  const extra = keys.filter((key) => !(key in source));
  if (missing.length || extra.length) fail(`${locale} key mismatch; missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);

  for (const key of sourceKeys) {
    const entry = catalog[key];
    if (!entry || typeof entry.message !== "string" || !entry.message.trim()) fail(`${locale}.${key} must have a non-empty message`);
    const expectedSchema = placeholderSchema(source[key]);
    const actualSchema = placeholderSchema(entry);
    if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema)) fail(`${locale}.${key} has a mismatched placeholder schema`);
    const tokens = namedTokens(entry.message);
    const placeholders = Object.keys(actualSchema).sort();
    if (tokens.join("\0") !== placeholders.join("\0")) fail(`${locale}.${key} message and placeholder names do not match`);
  }
}

const manifestSource = readFileSync(join(root, "manifest.config.ts"), "utf8");
for (const match of manifestSource.matchAll(/__MSG_([a-zA-Z0-9_@]+)__/g)) {
  if (!(match[1] in source)) fail(`manifest references unknown message ${match[1]}`);
}
if (!/default_locale:\s*"en"/.test(manifestSource)) fail('manifest default_locale must be "en"');

console.log(`Validated ${sourceKeys.length} messages across ${actualLocales.length} locales.`);
