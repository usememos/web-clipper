# Memos brand sources

These SVGs are copied unchanged from [`usememos/.github` at `a1230e3`](https://github.com/usememos/.github/tree/a1230e35ef01969fcb03c46744286d22bb4302fa/assets/brand) (2026-10-20). The current [BRAND.md](https://github.com/usememos/.github/blob/main/BRAND.md) remains authoritative.

- `mark-small.svg`: extension and toolbar icons at 16 and 32 px.
- `mark.svg`: extension and store icons at 128 px.
- `lockup.svg`: popup, settings, saved-clips headers, and store artwork. Every size uses the same artwork. Compact extension headers use a 24 px height in the popup and 30 px in settings and saved clips, with automatic width to preserve proportions. Store artwork follows the recommended minimum width of 145 px including canvas padding. The supplied Source Serif 4 lettering at weight 550 is preserved as paths; no font is required.
- `lockup-small.svg`: an unchanged upstream compatibility copy with compact intrinsic dimensions; new consumers use `lockup.svg`.

Run `pnpm brand:generate` after updating these sources. It regenerates `public/icons/*.png` and `src/components/memos-lockup.tsx`. SVG geometry, transforms, padding, and proportions are preserved. The generated inline lockup inherits `currentColor` and has the accessible name “Memos”. The separate “Web Clipper” label uses the interface font.

Icons are the official mark alone in a mid-tone indigo (`#5a73b5`) on a transparent canvas, scaled to 96% of the icon height. Chrome shows one PNG on light and dark toolbars alike, and this indigo reads on both, whereas the avatar indigo (`#344c81`) vanishes on dark toolbars. The filled bird’s paths and transforms are unchanged; no stroke or outline is added. No 48 px icon is shipped: chrome://extensions takes the smallest icon at or above 48 px without regard to display scale, so a 48 px bitmap is upscaled on HiDPI screens while the 128 is downsampled and stays sharp. The 128 px render is also written to `assets/store/store-icon.png`; the Chrome Web Store lets an irregular mark use the full canvas.

The extension’s English description is copied from the [upstream project catalog](https://github.com/usememos/.github/blob/a1230e35ef01969fcb03c46744286d22bb4302fa/profile/README.md). Localized descriptions translate that same function. Connection instructions continue to name instances and access tokens where setup requires them.
