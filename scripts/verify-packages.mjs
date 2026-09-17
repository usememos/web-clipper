// Verify the same archives in CI and releases before exposing download links.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const targets = ["chromium", "chrome", "edge", "firefox"];
const checksums = [];
for (const target of targets) {
  const filename = `memos-web-clipper-${target}-v${version}.zip`;
  const path = join(artifacts, filename);
  execFileSync("unzip", ["-tq", path], { stdio: "pipe" });
  const read = (name) => execFileSync("unzip", ["-p", path, name], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const manifest = JSON.parse(read("manifest.json"));
  const info = JSON.parse(read("BUILD_INFO.json"));
  assert.equal(manifest.version, version, `${target}: wrong version`);
  assert.equal(info.version, version, `${target}: wrong build version`);
  assert.equal(info.commit, commit, `${target}: wrong source commit`);
  const expectedTarget = target === "chromium" ? "chromium-manual" : target === "firefox" ? "firefox" : "chromium";
  assert.equal(info.target, expectedTarget, `${target}: wrong browser target`);
  assert.ok(read("INSTALL.md").includes("Load unpacked"), `${target}: missing installation instructions`);
  assert.ok(read(manifest.action.default_popup), `${target}: missing popup`);
  assert.ok(read(manifest.options_ui.page), `${target}: missing options`);
  assert.ok(!manifest.update_url, `${target}: unexpected update URL`);
  assert.equal(Boolean(manifest.key), target === "chromium", `${target}: wrong extension identity`);
  if (target === "firefox") {
    assert.equal(manifest.browser_specific_settings?.gecko?.id, "web-clipper@usememos.com");
    assert.ok(manifest.background.scripts?.length && !manifest.background.service_worker);
    for (const entry of manifest.background.scripts) assert.ok(read(entry));
  } else {
    assert.ok(read(manifest.background.service_worker));
  }
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  checksums.push(`${hash}  ${filename}`);
  console.log(`Verified ${filename}`);
}
// Chrome and Edge store uploads must remain byte-for-byte identical.
assert.deepEqual(
  readFileSync(join(artifacts, `memos-web-clipper-chrome-v${version}.zip`)),
  readFileSync(join(artifacts, `memos-web-clipper-edge-v${version}.zip`)),
);
const info = JSON.parse(readFileSync(join(artifacts, "BUILD_INFO.json"), "utf8"));
assert.equal(info.commit, commit);
assert.equal(info.version, version);
writeFileSync(join(artifacts, "SHA256SUMS"), `${checksums.join("\n")}\n`);
