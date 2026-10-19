# Memos brand sources

These SVGs are copied unchanged from [`usememos/.github` at `15485a5`](https://github.com/usememos/.github/tree/15485a529d2f3d25e346df5cab4099e0f1e4eac8/assets/brand) (2026-10-18). The current [BRAND.md](https://github.com/usememos/.github/blob/main/BRAND.md) remains authoritative.

- `mark-small.svg`: extension and toolbar icons at 16 and 32 px.
- `mark.svg`: extension icons at 48 and 128 px.
- `lockup.svg`: larger wordmarks in store artwork, where the visible bird exceeds 32 px.
- `lockup-small.svg`: the popup, settings, and saved-clips headers. The visible bird remains below 32 px. The supplied Source Serif 4 lettering is preserved as paths; no font is required.

Run `pnpm brand:generate` after updating these sources. It regenerates `public/icons/*.png` and `src/components/memos-lockup.tsx`. SVG geometry, transforms, padding, and proportions are preserved. The generated inline lockup inherits `currentColor` and has the accessible name “Memos.” The separate “Web Clipper” label uses the interface font.

Icons are the official mark alone in a mid-tone indigo (`#5a73b5`) on a transparent canvas, scaled to 96% of the icon height. Chrome shows one PNG on light and dark toolbars alike, and this indigo reads on both, whereas the avatar indigo (`#344c81`) vanishes on dark toolbars. The bird's paths are unchanged; a same-color stroke thickens it at 16 and 32 px, as the upstream favicon does, with a light stroke at 128 px so the lines survive downsampling. No 48 px icon is shipped: chrome://extensions takes the smallest icon at or above 48 px without regard to display scale, so a 48 px bitmap is upscaled on HiDPI screens while the 128 is downsampled and stays sharp. The 128 px render is also written to `assets/store/store-icon.png`; the Chrome Web Store lets an irregular mark use the full canvas.

The extension's English description is copied from the [upstream project catalog](https://github.com/usememos/.github/blob/15485a529d2f3d25e346df5cab4099e0f1e4eac8/profile/README.md). Localized descriptions translate that same function. Connection instructions continue to name instances and access tokens where setup requires them.
