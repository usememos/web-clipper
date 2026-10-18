# Memos brand sources

These SVGs are copied unchanged from [`usememos/.github` at `15485a5`](https://github.com/usememos/.github/tree/15485a529d2f3d25e346df5cab4099e0f1e4eac8/assets/brand) (2026-10-18). The current [BRAND.md](https://github.com/usememos/.github/blob/main/BRAND.md) remains authoritative.

- `mark-small.svg`: extension and toolbar icons at 16 and 32 px.
- `mark.svg`: extension icons at 48 and 128 px.
- `lockup.svg`: larger wordmarks in store artwork, where the visible bird exceeds 32 px.
- `lockup-small.svg`: the popup, settings, and saved-clips headers. The visible bird remains below 32 px. The supplied Source Serif 4 lettering is preserved as paths; no font is required.

Run `pnpm brand:generate` after updating these sources. It regenerates `public/icons/*.png` and `src/components/memos-lockup.tsx`. SVG geometry, transforms, padding, and proportions are preserved. The generated inline lockup inherits `currentColor` and has the accessible name “Memos.” The separate “Web Clipper” label uses the interface font.

Icons use dark ink (`#25363e`) on a transparent background, preserving the official mark's canvas without adding a background fill.

The extension's English description is copied from the [upstream project catalog](https://github.com/usememos/.github/blob/15485a529d2f3d25e346df5cab4099e0f1e4eac8/profile/README.md). Localized descriptions translate that same function. Connection instructions continue to name instances and access tokens where setup requires them.
