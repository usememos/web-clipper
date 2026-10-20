import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// Use the same official artwork at every size, preserving paths and transforms.
const source = await read("assets/brand/lockup.svg");
const lockup = source.trim().replaceAll("fill-rule=", "fillRule=").replace("<svg ", "<svg className={className} ");
const component = new URL("src/components/memos-lockup.tsx", root);
await writeFile(
  component,
  `// Generated from assets/brand/lockup.svg by pnpm brand:generate.\nexport function MemosLockup({ className }: { className?: string }) {\nreturn (${lockup});\n}\n`,
);
execFileSync(
  process.execPath,
  [fileURLToPath(new URL("node_modules/@biomejs/biome/bin/biome", root)), "format", "--write", fileURLToPath(component)],
  {
    stdio: "inherit",
  },
);

// Extension icons: the official mark alone, in one indigo, on a transparent
// canvas. Chrome shows one PNG on light and dark toolbars alike, so the color is
// a mid-tone indigo that reads on both (the avatar indigo #344c81 vanishes on
// dark toolbars). Scale the filled bird uniformly without adding an outline.
const indigo = "#5a73b5";
const birdHeight = 0.96;
for (const size of [16, 32, 128]) {
  const mark = await read(`assets/brand/${size <= 32 ? "mark-small.svg" : "mark.svg"}`);
  const bird = mark.match(/<g transform[\s\S]*<\/g>/)[0];
  const bounds = birdBounds(mark);
  const scale = (512 * birdHeight) / bounds.height;
  const tx = 256 - scale * (bounds.x + bounds.width / 2);
  const ty = 256 - scale * (bounds.y + bounds.height / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<g transform="translate(${tx} ${ty}) scale(${scale})" color="${indigo}" fill="currentColor">${bird}</g>
</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  await writeFile(new URL(`public/icons/icon-${size}.png`, root), png);
  if (size <= 32) await writeFile(new URL(`public/icons/action-${size}.png`, root), png);
  if (size === 128) await writeFile(new URL("assets/store/store-icon.png", root), png);
}

// Measures the bird's opaque bounds on the mark's 512 canvas so it can be scaled
// to the icon height without touching the official paths.
function birdBounds(mark) {
  const svg = mark.replace('fill="currentColor"', 'color="#000" fill="currentColor"').replace(/ style="[^"]*"/, "");
  const pixels = new Resvg(svg, { fitTo: { mode: "width", value: 512 } }).render().pixels;
  let minX = 512;
  let minY = 512;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      if (pixels[(y * 512 + x) * 4 + 3] > 40) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
