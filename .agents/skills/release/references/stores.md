# Store operations

Recheck dashboard state during each run. These identities locate the existing
listings; they do not establish the current package version or review status.

## Chrome Web Store

- Item ID: `nebaoebnljalfegiidibihhkebeiklbl`.
- [Developer dashboard](https://chrome.google.com/webstore/devconsole/91478bc2-fb43-48a6-97a1-e0342afbd037/nebaoebnljalfegiidibihhkebeiklbl/edit/listing).
- [Public listing](https://chromewebstore.google.com/detail/memos-web-clipper/nebaoebnljalfegiidibihhkebeiklbl).

Open the existing item's Package page and upload the `chrome` ZIP as a new
package. Confirm the parsed version and completed validation. On Store listing,
replace only changed images from the table below, preserving global/localized
slots and screenshot order. The dashboard may require removing an old image
before selecting its replacement; follow the tool's confirmation requirements
for those specific images. Save the draft and wait for the save to finish.

Submit for review once the package, listing, and required disclosures are ready.
For a full release, use automatic publication after approval unless the user
requested deferred publishing; preserve an already configured release choice
when resuming. Verify the resulting Pending review or equivalent status. If the
same submission already exists, record it rather than canceling/resubmitting.

See Google's [update guidance](https://developer.chrome.com/docs/webstore/update)
when the dashboard flow or requirements differ.

## Firefox Add-ons

- Add-on ID: `web-clipper@usememos.com`.
- [Developer hub](https://addons.mozilla.org/en-US/developers/addon/memos-web-clipper/edit).
- [Public listing](https://addons.mozilla.org/en-US/firefox/addon/memos-web-clipper/).

Use the existing add-on's Versions area to upload the `firefox` ZIP as a new
listed version. Wait for validation and inspect warnings. Supply release notes
from the matching changelog entry and accurate reviewer information if required.

The extension uses bundled TypeScript/React code, so provide the original source
and reproducible build instructions following Mozilla's
[source submission guidance](https://extensionworkshop.com/documentation/publish/source-code-submission/).
Use source from the exact package commit, include the lockfile, Node/pnpm versions,
and public build configuration needed to reproduce the bundle. Exclude secrets,
dependencies, and local state. Account for `package.mjs` requiring Git metadata
and a clean tree: a plain `git archive` cannot run `pnpm package` directly.
Document how to reconstruct the committed checkout or build and apply the same
Firefox manifest transformation. Verify the reviewer recipe in a clean temporary
directory before submitting it; do not claim an untested recipe is reproducible.

Update the icon and changed screenshots in the listing's media section. Save
captions and screenshot order; there are no matching Chrome promo-tile fields.
Finish the version submission and record whether it is awaiting review, signed,
or published. Verify listing-media saves separately from package approval.

## Upload assets

Files are under `assets/store/`. `assets/store/README.md` and
`tools/store/README.md` hold the export instructions.

| File | Dimensions | Chrome | Firefox |
| --- | --- | --- | --- |
| `store-icon.png` | 128 × 128 PNG | Icon | Icon |
| `screenshot-01-selection.jpg` | 1280 × 800 JPEG | Screenshot 1 | Screenshot 1 |
| `screenshot-02-review.jpg` | 1280 × 800 JPEG | Screenshot 2 | Screenshot 2 |
| `screenshot-03-history.jpg` | 1280 × 800 JPEG | Screenshot 3 | Screenshot 3 |
| `promo-small.jpg` | 440 × 280 JPEG | Small promo tile | — |
| `promo-marquee.jpg` | 1400 × 560 JPEG | Marquee promo tile | — |

`preview.jpg` and `store-assets.zip` are review/distribution aids, not individual
store upload fields. Images use fictional sample content; do not describe them
as proof of a real-server save.

## Release record

After store operations, write `docs/releases/<version>.md`. It is both a receipt
and the next release's comparison baseline. Record only observed results; create
no fabricated historical baseline. Keep an incomplete run's record so it can be
resumed. For assets-only updates, append a dated event to the relevant version's
record instead of inventing a package release.

Include:

- Version, date, source commit, Node/pnpm versions, validation results, and
  package filenames with SHA-256 hashes. Note the GitHub release URL only if one
  was published.
- Per store: listing ID/URL, uploaded package version and hash, date, actual
  status, automatic/deferred publication choice where applicable, and dashboard
  or public verification evidence. Track package and listing-media status
  separately when their review timing differs.
- Per supported asset: filename/slot, SHA-256 of the local file confirmed
  uploaded or matching, source commit containing those bytes, caption/order,
  verification date and status. Carry forward unchanged entries with their
  original evidence; do not mark them newly uploaded. Leave uncertain hashes
  unknown rather than associating a local file with an unverified remote image.
- Remaining actions or store validation errors. Preserve each store's independent
  result when only one succeeds.

Compute file hashes with `shasum -a 256` (macOS) or `sha256sum` (Linux). During a
run, keep scratch notes/screenshots in ignored `tmp/` so they do not block
packaging. Persist the final record after packaging; do not rebuild different
bytes under an already uploaded version just to include the receipt in its source.
