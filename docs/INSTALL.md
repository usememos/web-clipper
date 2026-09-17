# Install a downloaded build

## Chrome / Edge / other Chromium browsers

1. Download `memos-web-clipper-chromium-v<version>.zip` and extract it once to a permanent folder.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode** (开发者模式).
4. Choose **Load unpacked** (加载已解压的扩展) and select the extracted folder containing `manifest.json`.
5. Open the extension's settings, connect your Memos instance, and configure AI if needed.

Keep this folder after installation. To update, replace its contents with a newly extracted build, then click **Reload** on the extension card. This keeps the extension ID stable. Manual builds do not receive browser-store updates.

Choose the **chromium** package for manual installation. The **chrome** and **edge** packages are for store submission.

## Firefox

1. Download and extract `memos-web-clipper-firefox-v<version>.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on**, then select the extracted `manifest.json`.

Unsigned builds are temporary and must be loaded again after restarting Firefox. Permanent installation requires a Mozilla-signed package or the Firefox Add-ons store version.

## Check the build

`BUILD_INFO.json` inside the ZIP records the version, source commit, package target, and (for CI builds) workflow URL. For PR builds, the commit may be GitHub's test merge commit rather than the PR head.

Download `SHA256SUMS` from the same run/release to verify ZIPs:

- Linux: `sha256sum --ignore-missing -c SHA256SUMS`
- macOS: `shasum -a 256 memos-web-clipper-chromium-v*.zip`, then compare with `SHA256SUMS`.

GitHub Actions downloads require signing in to GitHub and are kept for 30 days. Choose the successful run for your branch/PR. Releases provide the versioned download archives.

Official references: [GitHub artifact downloads](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts), [Chrome distribution](https://developer.chrome.com/docs/extensions/how-to/distribute), [Firefox temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
