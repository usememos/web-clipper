// Builds store-specific upload archives from one fresh dist/ build.
//
// Chromium stores share the exact same package. Firefox needs an MV3 background
// script fallback, a stable Gecko ID, and data-collection declarations. AMO also
// requires source code for bundled extensions, so Firefox packaging emits a
// matching reviewer-source archive.
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(ROOT, "artifacts");
const REVIEW_SOURCE_MARKER = ".memos-amo-source.json";
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
  if (existsSync(join(ROOT, ".git"))) {
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (status.trim()) throw new Error("Refusing to package a dirty working tree. Commit or stash all tracked and untracked files first.");
    return true;
  }

  const markerPath = join(ROOT, REVIEW_SOURCE_MARKER);
  if (!existsSync(markerPath))
    throw new Error("Packaging requires either a clean Git checkout or an official AMO reviewer source archive.");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.format !== 1 || marker.version !== packageJson.version || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(marker.commit)) {
    throw new Error("The AMO reviewer source marker is invalid or does not match package.json.");
  }
  return false;
};

// Every store archive must correspond to one reproducible tracked source tree.
// Official reviewer archives carry a generated marker because they intentionally omit .git.
const isGitCheckout = requireTrustedSourceTree();

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

const createStoreStage = (target) => {
  const stage = mkdtempSync(join(tmpdir(), `memos-web-clipper-${target}-`));
  cpSync(DIST, stage, { recursive: true });
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(storeManifest(target), null, 2)}\n`);
  return stage;
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

const PUBLIC_VITE_KEYS = ["VITE_CLERK_OAUTH_CLIENT_ID", "VITE_CLERK_OAUTH_ISSUER", "VITE_WEB_APP_URL"];

const publicViteEnvironment = () => {
  const env = loadEnv("production", ROOT, "VITE_");
  return PUBLIC_VITE_KEYS.map((key) => `${key}=${env[key] ?? ""}`).join("\n");
};

const packageFirefoxSource = () => {
  const stage = mkdtempSync(join(tmpdir(), "memos-web-clipper-source-"));
  const sourcePath = join(ARTIFACTS, `memos-web-clipper-firefox-source-v${packageJson.version}.zip`);

  try {
    // Reviewer source is an exact tracked tree. Local and untracked files must never
    // enter a store upload, even when they are not covered by .gitignore.
    const files = execFileSync("git", ["ls-files", "-z", "--cached"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\0")
      // `git ls-files --cached` still names tracked files deleted in the working tree.
      // Reviewer source must mirror the build input, so omit paths that no longer exist.
      .filter((relativePath) => relativePath && existsSync(join(ROOT, relativePath)));

    for (const relativePath of files) {
      const destination = join(stage, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(ROOT, relativePath), destination, { recursive: true });
    }

    // VITE_* values are already public in the shipped JS. Including only those values
    // lets AMO reproduce the bundle without leaking CLERK_SECRET_KEY or other secrets.
    const viteEnv = publicViteEnvironment();
    if (viteEnv) writeFileSync(join(stage, ".env"), `# Public build-time values used for this submission.\n${viteEnv}\n`);
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    writeFileSync(join(stage, REVIEW_SOURCE_MARKER), `${JSON.stringify({ format: 1, version: packageJson.version, commit }, null, 2)}\n`);

    zipDirectory(stage, sourcePath);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  return sourcePath;
};

const packageFirefox = () => {
  const stage = createStoreStage("firefox");
  const firefoxPath = join(ARTIFACTS, `memos-web-clipper-firefox-v${packageJson.version}.zip`);

  try {
    // AMO's official validator catches Firefox manifest/signing incompatibilities.
    execFileSync("pnpm", ["exec", "web-ext", "lint", "--source-dir", stage, "--output", "text"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    zipDirectory(stage, firefoxPath);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }

  return { firefoxPath, sourcePath: isGitCheckout ? packageFirefoxSource() : null };
};

const created = [];
if (requestedTarget === "all" || requestedTarget === "chrome" || requestedTarget === "edge") {
  created.push(...packageChromium(requestedTarget === "all" ? ["chrome", "edge"] : [requestedTarget]));
}
if (requestedTarget === "all" || requestedTarget === "firefox") {
  const { firefoxPath, sourcePath } = packageFirefox();
  created.push(firefoxPath);
  if (sourcePath) created.push(sourcePath);
}

console.log("\nCreated store artifacts:");
for (const file of created) console.log(`- artifacts/${basename(file)}`);
console.log("\ndist/ remains the unpacked development build with its stable Chrome key.");
