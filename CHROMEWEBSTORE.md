# Chrome Web Store listing — Memos Web Clipper

Last updated: 2026-10-18. Version 0.5.1 is prepared locally and has not been submitted.

## Store listing

**Extension name:** Memos Web Clipper

**Short description** (matches the English manifest description):

Save pages, selections, and images to your memos from Chrome or Firefox, as Markdown with a link to the source.

**Detailed description:**

Save pages, selections, and images to your memos from Chrome or Firefox, as Markdown with a link to the source.

Review and edit a clip before saving. Choose its visibility and, on supported versions of Memos, a Space. Keep a local history of clips saved from the popup, search previous saves, and open the source page or saved memo again.

Connect through usememos.com, or use your Memos address and a personal access token. Open the clipper on a page, review the content, and save. You can also save selected text or images from the right-click menu.

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
| Screenshot 1: selection capture | 1280 × 800 JPEG | Ready locally | `assets/store/screenshot-01-selection.jpg` |
| Screenshot 2: review and visibility | 1280 × 800 JPEG | Ready locally | `assets/store/screenshot-02-review.jpg` |
| Screenshot 3: saved clips | 1280 × 800 JPEG | Ready locally | `assets/store/screenshot-03-history.jpg` |
| Small promo tile | 440 × 280 JPEG | Ready locally | `assets/store/promo-small.jpg` |
| Marquee promo tile | 1400 × 560 JPEG | Ready locally | `assets/store/promo-marquee.jpg` |

Upload screenshots in numbered order. JPEGs are opaque; the icon preserves transparency. [Asset instructions and contact sheet](assets/store/README.md) accompany the exports; `assets/store/store-assets.zip` contains only the six upload assets. The screenshots use the current interface with original sample content and fictional destinations. Editable sources are in [tools/store/](tools/store/README.md).

Brand sources and regeneration are documented in [assets/brand/README.md](assets/brand/README.md). The general Memos tagline and descriptions come from [BRAND.md](https://github.com/usememos/.github/blob/main/BRAND.md); the extension description comes from the [upstream project catalog](https://github.com/usememos/.github/blob/15485a529d2f3d25e346df5cab4099e0f1e4eac8/profile/README.md).

## Version history

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.5.1 | 2026-10-18 | Indigo bird icons that read on light and dark toolbars and stay sharp on HiDPI screens, serif Memos lockup, aligned extension descriptions in all locales, three store screenshots, both promo tile sizes, compatibility with current Memos calendar releases and development builds, detected versions in unsupported-version connection errors, the Astroid default Space icon, and a persistent popup error with saving disabled when an access token is rejected | Prepared locally; not submitted |

This document records the brand-related listing changes. Existing publisher details, distribution settings, permission justifications, and privacy disclosures remain in the store dashboard.
