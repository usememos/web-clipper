import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// Keep the official paths and transforms unchanged. The small lockup's visible
// bird stays below 32 px in both AppBrand sizes.
const source = await read("assets/brand/lockup-small.svg");
const lockup = source
  .trim()
  .replace('aria-label="Memos — Source Serif 4 Semibold"', 'aria-label="Memos"')
  .replace("<title>Memos — Source Serif 4 Semibold</title>", "<title>Memos</title>")
  .replaceAll("fill-rule=", "fillRule=")
  .replace("<svg ", "<svg className={className} ");
const component = new URL("src/components/memos-lockup.tsx", root);
await writeFile(
  component,
  `// Generated from assets/brand/lockup-small.svg by pnpm brand:generate.\nexport function MemosLockup({ className }: { className?: string }) {\nreturn (${lockup});\n}\n`,
);
execFileSync(
  process.execPath,
  [fileURLToPath(new URL("node_modules/@biomejs/biome/bin/biome", root)), "format", "--write", fileURLToPath(component)],
  {
    stdio: "inherit",
  },
);

// Preserve the official mark's transparent canvas and render it in dark ink.
for (const size of [16, 32, 48, 128]) {
  const mark = await read(`assets/brand/${size <= 32 ? "mark-small.svg" : "mark.svg"}`);
  const svg = mark
    .replace('fill="currentColor"', 'color="#25363e" fill="currentColor"')
    // resvg does not resolve these CSS variables; keep the rectangle's fill="none".
    .replace(' style="fill:var(--logo-background,none);rx:var(--logo-radius,0px)"', "");
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  await writeFile(new URL(`public/icons/icon-${size}.png`, root), png);
  if (size <= 32) await writeFile(new URL(`public/icons/action-${size}.png`, root), png);
}
