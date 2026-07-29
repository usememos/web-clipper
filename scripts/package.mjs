// Builds store-upload and manual-install archives from one fresh dist/ build.
//
// Chromium stores share the exact same package. Firefox needs an MV3 background
// script fallback, a stable Gecko ID, and data-collection declarations.
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(ROOT, "artifacts");
const FIREFOX_ADDON_ID = "web-clipper@usememos.com";
// Firefox desktop gained built-in data consent in 140; Android gained it in 142.
// `gecko.strict_min_version` covers both unless a separate Android manifest is used.
const FIREFOX_MIN_VERSION = "142.0";
const VALID_TARGETS = new Set(["all", "chrome", "edge", "firefox"]);

const requestedTarget = process.argv[2] ?? "all";
if (!VALID_TARGETS.has(requestedTarget)) {
  throw new Error(`Unknown target "${requestedTarget}". Use one of: ${[...VALID_TARGETS].join(", ")}`);
}

const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const requireTrustedSourceTree = () => {
  if (!existsSync(join(ROOT, ".git"))) throw new Error("Packaging requires a Git checkout.");
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (status.trim()) throw new Error("Refusing to package a dirty working tree. Commit or stash all tracked and untracked files first.");
};

// Every archive must correspond to one reproducible tracked source tree.
requireTrustedSourceTree();

const baseManifestPath = join(DIST, "manifest.json");
if (!existsSync(baseManifestPath)) throw new Error("dist/manifest.json is missing; run `pnpm build` first.");

const baseManifest = JSON.parse(readFileSync(baseManifestPath, "utf8"));
if (baseManifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: package.json is ${packageJson.version}, dist manifest is ${baseManifest.version}.`);
}

if (requestedTarget === "all") rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const zipDirectory = (sourceDir, outputPath) => {
  rmSync(outputPath, { force: true });
  // -X omits platform-specific extended attributes; the manifest remains at ZIP root.
  execFileSync("zip", ["-X", "-qr", outputPath, "."], { cwd: sourceDir, stdio: "inherit" });
};

const storeManifest = (target) => {
  const manifest = structuredClone(baseManifest);
  // Store signing owns release IDs/keys. Keep the key only in unpacked dev builds.
  delete manifest.key;
  // Store-hosted packages must let their store supply the update URL.
  delete manifest.update_url;

  if (target === "firefox") {
    const worker = manifest.background?.service_worker;
    if (!worker) throw new Error("Firefox packaging needs background.service_worker in the built manifest.");

    // Firefox uses the script as an event page and does not support service_worker.
    manifest.background.scripts = [worker];
    delete manifest.background.service_worker;
    manifest.browser_specific_settings = {
      gecko: {
        id: FIREFOX_ADDON_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        // The clipper signs users in, sends the active page URL, and sends selected/page
        // content to the user's Memos instance. These declarations power Firefox's
        // built-in install consent and must stay aligned with the privacy policy.
        data_collection_permissions: {
          required: ["authenticationInfo", "browsingActivity", "websiteContent"],
        },
      },
    };
  }

  return manifest;
};

const manualChromiumManifest = () => {
  const manifest = structuredClone(baseManifest);
  // Manual Chromium installs need the public key so chrome.identity uses the
  // registered store extension ID regardless of the extracted directory.
  if (!manifest.key) throw new Error("The manual Chromium package requires a manifest key to preserve its OAuth identity.");
  delete manifest.update_url;
  return manifest;
};

const createStage = (label, manifest) => {
  const stage = mkdtempSync(join(tmpdir(), `memos-web-clipper-${label}-`));
  cpSync(DIST, stage, { recursive: true });
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return stage;
};

const createStoreStage = (target) => {
  return createStage(target, storeManifest(target));
};

const packageManualChromium = () => {
  const stage = createStage("chromium-manual", manualChromiumManifest());
  const outputPath = join(ARTIFACTS, `memos-web-clipper-chromium-v${packageJson.version}.zip`);

  try {
    zipDirectory(stage, outputPath);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  return outputPath;
};

const packageChromium = (targets) => {
  const stage = createStoreStage("chromium");
  const chromePath = join(ARTIFACTS, `memos-web-clipper-chrome-v${packageJson.version}.zip`);
  const edgePath = join(ARTIFACTS, `memos-web-clipper-edge-v${packageJson.version}.zip`);
  const primaryPath = targets.includes("chrome") ? chromePath : edgePath;

  try {
    zipDirectory(stage, primaryPath);
    if (targets.length === 2) {
      // Chrome and Edge are code/manifest compatible; duplicate the exact tested bytes.
      copyFileSync(primaryPath, edgePath);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  return targets.map((target) => (target === "chrome" ? chromePath : edgePath));
};

const packageFirefox = () => {
  const stage = createStoreStage("firefox");
  const firefoxPath = join(ARTIFACTS, `memos-web-clipper-firefox-v${packageJson.version}.zip`);

  try {
    // Mozilla's validator catches Firefox manifest and compatibility problems.
    execFileSync("pnpm", ["exec", "web-ext", "lint", "--source-dir", stage, "--output", "text"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    zipDirectory(stage, firefoxPath);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  return firefoxPath;
};

const created = [];
if (requestedTarget === "all") created.push(packageManualChromium());
if (requestedTarget === "all" || requestedTarget === "chrome" || requestedTarget === "edge") {
  created.push(...packageChromium(requestedTarget === "all" ? ["chrome", "edge"] : [requestedTarget]));
}
if (requestedTarget === "all" || requestedTarget === "firefox") created.push(packageFirefox());

console.log("\nCreated artifacts:");
for (const file of created) console.log(`- artifacts/${basename(file)}`);
console.log("\ndist/ remains the unpacked development build with its stable Chrome key.");
