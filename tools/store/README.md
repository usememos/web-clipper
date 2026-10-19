# Store artwork sources

Run `pnpm store:preview`. Open `/tools/store/artboards.html?art=selection` on port 5174. This separate workspace stays out of the shipped extension and does not require OAuth configuration.

The frames import the production `App` and `ClipHistory` components. `ui.tsx` supplies a local browser API fake and the original sample writing in `fixtures.ts`. It does not contact a Memos server or save real data. The person, article, and `.example` destinations are fictional.

## Export

Wait for the interface and fonts to render. Capture the indicated rectangle from the artboard's top-left corner as an opaque JPEG. Fixed artboards prevent focus-triggered page scrolling from moving the composition.

| Query | Rectangle | Output in `assets/store/` |
| --- | --- | --- |
| `?art=selection` | 1280 × 800 | `screenshot-01-selection.jpg` |
| `?art=review` | 1280 × 800 | `screenshot-02-review.jpg` |
| `?art=history` | 1280 × 800 | `screenshot-03-history.jpg` |
| `?art=small` | 440 × 280 | `promo-small.jpg` |
| `?art=marquee` | 1400 × 560 | `promo-marquee.jpg` |

For the review image, edit the real “Memo content” textbox to the `memoContent` fixture, then open the “Visibility: Private” menu. Wait for the menu to finish opening before capturing. Other views need no interaction.

`pnpm brand:generate` writes `assets/store/store-icon.png` alongside `public/icons/icon-128.png`; the two are identical. Refresh `store-assets.zip` afterwards.

Open `/tools/store/gallery.html` for a contact sheet; capture 1280 × 800 as `assets/store/preview.jpg`. It is for review, not upload. `assets/store/store-assets.zip` contains the six upload files only.

Check this workspace with `pnpm exec tsc -p tools/store/tsconfig.json` and `pnpm exec vite build --config tools/store/vite.config.ts`. Build output goes to ignored `tmp/store-preview/`.

## Brand

Official SVGs live in `assets/brand/`; their geometry, lettering, viewBoxes, and proportions are preserved. Only the supplied lettering uses Source Serif 4. Other text uses the extension's Geist interface font. Warm white and ink follow the extension UI; amber indicates selected text.
