# Memos Web Clipper

Save pages, selections, and images directly to your Memos instance. Available for Chromium-based browsers and Firefox.

## Install

- [Chrome Web Store](https://chromewebstore.google.com/detail/memos-web-clipper/nebaoebnljalfegiidibihhkebeiklbl)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/memos-web-clipper/)

### Manual installation

Versioned packages and checksums are available from [GitHub Releases](https://github.com/usememos/web-clipper/releases). Store installation is recommended for automatic updates.

For Chromium-based browsers:

1. Download and extract `memos-web-clipper-chromium-v<version>.zip`.
2. Open the browser's extensions page, such as `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted directory.

For Firefox, download `memos-web-clipper-firefox-v<version>.xpi` and open it with Firefox. GitHub release XPIs are the same Mozilla-signed packages published on Firefox Add-ons.

To verify a download on Linux, run `sha256sum --ignore-missing -c SHA256SUMS` in the directory containing the downloaded package. Do not rely on manually installed packages receiving browser-store-managed updates; check GitHub Releases for new versions.

## Features

- Capture the page title, URL, and readable description.
- Convert selected text, links, lists, code, and tables to Markdown.
- Upload selected images as Memos attachments.
- Review and edit every clip before saving.
- Save as Private, Protected, or Public.
- Customize the clip format with a local template.
- Quick-save selected text or images from the context menu.

The default template keeps the captured content first and adds a link back to the source. Empty fields are removed automatically.

## How to use

1. Open the extension settings and choose a connection method:
   - **usememos.com (Recommended):** sign in, then connect an instance. Your connection information is available after signing in on another device.
   - **Direct connection:** enter your Memos instance URL and a personal access token. No usememos.com account is required, and the connection stays in this browser.
2. Open the extension on a page.
3. Review the captured content, choose its visibility, and save.

For a direct connection, create a PAT in your Memos user settings at `/setting#access-token`. The clipper tests the instance URL, supported Memos version, and token before saving the connection. The saved token is never displayed again in the extension UI.

You can also right-click selected text or an image and choose **Save selection to Memos**. Context-menu saves are always private.

Browser-owned pages, such as extension stores and internal browser URLs, may block page capture. The clipper falls back to the page title and URL when available.

## Browser support

- Chromium-based browsers that support Chrome extensions, including Google Chrome, Microsoft Edge, Brave, and Arc
- Mozilla Firefox 142 or later
- Memos 0.26.0 or later in the 0.x series
