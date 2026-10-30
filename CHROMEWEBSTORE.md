# Chrome Web Store listing — Memos Web Clipper

Last updated: 2026-10-30. Version 0.6.0 is submitted to Chrome (pending review, automatic publication after approval) and approved/live on Firefox. See [the release record](docs/releases/0.6.0.md) for package hashes and verification.

## Store listing

**Extension name:** Memos Web Clipper

**Short description** (matches the English manifest description):

Save pages, selections, and images to your memos from Chrome or Firefox, as Markdown with a link to the source.

**Detailed description:**

Save pages, selections, and images to your memos from Chrome or Firefox, as Markdown with a link to the source.

Review and edit a clip before saving. Choose its visibility and, on supported versions of Memos, a space. Keep a local history of clips saved from the popup, search previous saves, and open the source page or saved memo again.

Connect through usememos.com, or use your Memos address and a personal access token. Open the clipper on a page, review the content, and save. You can also save selected text or images from the right-click menu.

Customize the clip template to quote captured content or keep its original Markdown formatting.

Clips go to the Memos connection you choose. Saved-clip history and clip templates stay in this browser profile. Context-menu saves are private and are not added to local history.

Support: https://github.com/usememos/web-clipper/issues

**Category:** Productivity

**Single purpose:** Save web pages, selected text, and images to Memos.

**Primary language:** English; nine locale catalogs are bundled.

## Graphics and assets

| Asset | Dimensions | Status | File |
| --- | --- | --- | --- |
| Store icon | 128 × 128 PNG | Ready locally; indigo mark, transparent background | `assets/store/store-icon.png` |
| Extension icons | 16, 32, 128 px PNG | Updated locally; indigo mark, transparent; no 48 so HiDPI chrome://extensions downsamples the 128 | `public/icons/icon-*.png` |
| Toolbar icons | 16, 32 px PNG | Updated locally; indigo mark filling the canvas height | `public/icons/action-*.png` |
| Screenshot 1: selection capture | 1280 × 800 JPEG | Refreshed and uploaded to both stores 2026-10-30 | `assets/store/screenshot-01-selection.jpg` |
| Screenshot 2: review and visibility | 1280 × 800 JPEG | Refreshed and uploaded to both stores 2026-10-30 | `assets/store/screenshot-02-review.jpg` |
| Screenshot 3: saved clips | 1280 × 800 JPEG | Refreshed and uploaded to both stores 2026-10-30 | `assets/store/screenshot-03-history.jpg` |
| Small promo tile | 440 × 280 JPEG | Ready locally | `assets/store/promo-small.jpg` |
| Marquee promo tile | 1400 × 560 JPEG | Refreshed and uploaded to Chrome 2026-10-30 | `assets/store/promo-marquee.jpg` |

Upload screenshots in numbered order. JPEGs are opaque; the icon preserves transparency. [Asset instructions and contact sheet](assets/store/README.md) accompany the exports; `assets/store/store-assets.zip` contains only the six upload assets. The screenshots use the current interface with original sample content and fictional destinations. Editable sources are in [tools/store/](tools/store/README.md).

Brand sources and regeneration are documented in [assets/brand/README.md](assets/brand/README.md). The Memos headline, description, and full introduction come from [BRAND.md](https://github.com/usememos/.github/blob/main/BRAND.md); the extension description comes from the [upstream project catalog](https://github.com/usememos/.github/blob/a1230e35ef01969fcb03c46744286d22bb4302fa/profile/README.md).

## Version history

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.6.0 | 2026-10-30 | Edit clips in the Memos Markdown editor; templates control quotation (`> {{content}}` quotes, `{{content}}` keeps the original Markdown) in all nine languages; popup, settings, saved clips, and the in-page notice rebuilt on the shared Memos design system; refreshed screenshots and marquee tile | Chrome pending review with automatic publication; Firefox approved/live |
| 0.5.3 | 2026-10-21 | Preserve confirmed HTTP connections in Firefox; show a non-blocking amber HTTP warning with clearer copy in all nine languages | Chrome pending review with automatic publication; Firefox approved/live |
| 0.5.1 | 2026-10-18 | Indigo bird icons that read on light and dark toolbars and stay sharp on HiDPI screens, serif Memos lockup, aligned extension descriptions in all locales, three store screenshots, both promo tile sizes, compatibility with current Memos calendar releases and development builds, detected versions in unsupported-version connection errors, the Astroid default Space icon, and a persistent popup error with saving disabled when an access token is rejected | Prepared locally; not submitted |

This document records listing and release changes. Version 0.6.0 keeps existing permissions, CSP, and data handling; the editor and design system are bundled code, and the extension loads no remote fonts or scripts. Existing publisher details, distribution settings, permission justifications, and privacy disclosures remain in the store dashboard.
