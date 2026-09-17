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

Firefox stable releases require Mozilla-signed extensions, so install from Firefox Add-ons for permanent use. To test a GitHub release temporarily:

1. Download and extract `memos-web-clipper-firefox-v<version>.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select the extracted `manifest.json`.

To verify a download on Linux, run `sha256sum --ignore-missing -c SHA256SUMS` in the directory containing the downloaded package. Do not rely on manually installed packages receiving browser-store-managed updates; check GitHub Releases for new versions.

## Features

- Capture a page's main content as Markdown, with its title, URL, and readable description.
- Convert selected text, links, lists, code, and tables to Markdown.
- Upload selected images as Memos attachments.
- Review and edit every clip before saving.
- Save as Private, Protected, or Public.
- Customize the clip format with a local template.
- Quick-save selected text or images from the context menu.
- Browse and search clips saved locally from the popup.
- See when a page was saved before, with the option to save it again.
- Optionally use DeepSeek to clean captured text, add a configurable summary, and suggest topic tags, with your own preferred tag vocabulary.

The default template includes the captured content and a link back to the source, with an optional AI summary above and tags below. Empty fields are removed automatically.

## What gets captured

Selecting text before you clip captures exactly that selection, quoted, along with any images in it.

With nothing selected, the clipper extracts the page's main content — the article body, without navigation, sidebars, or footers — and converts it to Markdown, preserving headings, lists, code blocks, and tables. Images in an extracted article are left out rather than linked, so a clip never depends on someone else's server staying up; select an image, or the region containing it, to save it as an attachment.

Pages with no article to extract, such as dashboards, search results, and feeds, fall back to the page's own summary and link. The popup says which of these happened, and every clip is editable before you save it.

## How to use

1. Open the extension settings and choose a connection method:
   - **usememos.com (Recommended):** sign in, then connect an instance. Your connection information is available after signing in on another device.
   - **Direct connection:** enter your Memos instance URL and a personal access token. No usememos.com account is required, and the connection stays in this browser.
2. Open the extension on a page.
3. Review the captured content, choose its visibility, and save.

Open **Saved clips** from the popup or extension settings to review previous saves and reopen either the source page or its Memo.

For a direct connection, create a PAT in your Memos user settings at `/setting#access-token`. The clipper tests the instance URL, supported Memos version, and token before saving the connection. The saved token is never displayed again in the extension UI.

You can also right-click selected text or an image and choose **Save selection to Memos**. Context-menu saves are always private.

Browser-owned pages, such as extension stores and internal browser URLs, may block page capture. The clipper falls back to the page title and URL when available.

## AI cleanup

In extension settings, enter your DeepSeek API Key, add optional **Preferred tags**, enable **AI assistance**, and save. AI is off by default. Preferred tags are candidates: the model picks relevant ones first and may add new tags. Separate them with commas or new lines (up to 50 tags of 40 characters each).

By default, opening the popup organizes the selected text, or the extracted article if there is no selection. The model is instructed to remove advertisements, navigation, recommendations, and repeated text while preserving facts, steps, code, tables, and the original body language. The result includes a short Chinese summary, cleaned body, source link, and up to five relevant tags. Metadata descriptions are omitted to avoid adding clutter back.

### Configuration

| Setting | Choices | Default |
| --- | --- | --- |
| When to run | Automatically on opening the popup; manually via Generate | Automatic |
| Content to save | Cleaned body + summary; original body + summary; summary only | Cleaned body + summary |
| Summary and new tag language | Simplified Chinese; Traditional Chinese; English; source language | Simplified Chinese |
| Summary detail | One sentence; 2–3 sentences; 4–6 key points | 2–3 sentences |
| Maximum AI tags | 0–10; zero disables generated tags | 5 |
| How to choose tags | Prefer relevant candidates and allow additions; restrict to candidates | Prefer candidates |
| DeepSeek model | `deepseek-flash`; `deepseek-v4-pro` | `deepseek-flash` |

Output options are under **Output: content, summary, tags, and model**. Restricting tags to candidates requires a nonempty candidate list unless generated tags are disabled. No matches produce no tags, instead of irrelevant filler. Fixed tags in a custom template are unaffected by the generated-tag limit. Original-body mode preserves captured Markdown locally; the model only returns summary and tags. Summary-only mode keeps source attribution through the template.

### Review and recovery

Review and edit before saving. If you type or save while AI is running, late results remain available for explicit replacement without overwriting your draft. **Restore original clip** recovers the capture. **Undo last replacement** restores the draft from before applying AI or restoring the original; further typing starts a new draft. Save always sends the editor's current text.

Use **Cancel** to stop waiting and request cancellation, or **Regenerate** for a fresh response. Closing the popup also requests cancellation; cancellation cannot guarantee that the provider stops processing or charging. The last successful result is reused for five minutes only when source text, title, credentials, and settings match. It is held in browser session storage, not persisted across browser restarts. Regenerate bypasses it, and saving settings or removing the key clears it.

Failures leave current content editable and saveable. Titles or page descriptions alone are not summarized. Inputs over 40,000 characters and responses exceeding the 25-second timeout fall back to the capture; long input is never silently truncated. Retries are explicit. A settings change cancels stale generation; simultaneous settings edits require reloading the saved version before overwriting it. Unsaved settings are marked, and deleting the API Key preserves other edits in the form.

Templates support `{{summary}}` and `{{tags}}`, both empty when AI is off. Existing custom templates without these fields get the summary prepended and tags appended. `{{content}}` follows the selected content mode; `{{description}}` is empty after successful AI processing. Custom templates still control source-link placement.

The extension calls [DeepSeek's Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) directly with thinking disabled and JSON output. Generation sends captured text, title, and preferred tags to the selected model and may incur API charges. The key stays in local browser storage, is read by the background worker, and is never synced or shown again in the UI. Removing it turns off AI. Images and context-menu quick saves are not processed by AI. See [configuration decisions and usability checks](docs/AI_CLIPPING_DESIGN.md) for implementation boundaries.

## Local history

Successful saves made from the popup are recorded in the extension's local browser storage. A record includes the source page, captured selection, final memo content, visibility, destination, Memo link, and save time. This lets the popup recognize a previously saved page without querying Memos.

History stays in the current browser profile and is not synced through usememos.com. Context-menu quick saves are not added to this history.

## Browser support

- Chromium-based browsers that support Chrome extensions, including Google Chrome, Microsoft Edge, Brave, and Arc
- Mozilla Firefox 142 or later
- Memos 0.26.0 or later in the 0.x series
