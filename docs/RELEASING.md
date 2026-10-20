# Releasing

Maintain the package version and `CHANGELOG.md` manually, then run the Release workflow. The workflow builds and verifies every archive, creates a draft GitHub Release, attaches all assets, and only then publishes it. This order supports GitHub release immutability without depending on browser-store review.

## Browser-store release skill

Use the project-local [`$release` skill](../.agents/skills/release/SKILL.md) to bump the version, run `pnpm package`, upload to the existing Chrome and Firefox listings, and submit for review. It checks each store's last verified assets and updates only changed images. It also supports preparation-only runs and resuming partial releases. Store results and asset hashes are recorded in `docs/releases/<version>.md` for the next comparison.

The skill can upload verified local packages without a GitHub Release. When GitHub publication is also requested, follow the workflow below and use its artifacts. Edge store uploads require an explicit target listing.

## Repository configuration

Add these public build values as Actions repository variables:

- `VITE_CLERK_OAUTH_CLIENT_ID`
- `VITE_CLERK_OAUTH_ISSUER`
- `VITE_WEB_APP_URL`

GitHub release immutability can remain enabled. The release is kept as a draft until every asset has been uploaded.

## Release process

1. Update the version in `package.json` and add the release notes at the top of `CHANGELOG.md`, using a `## [<version>]` heading. Merge these changes into `main`.
2. Run the Release workflow from GitHub Actions with the Git ref to release (defaults to `main`; use a commit SHA to select an exact revision).
3. The workflow checks out that ref, reads the version from `package.json`, verifies the source, and runs `pnpm package`.
4. The workflow validates every archive, generates `SHA256SUMS`, uploads all assets to a draft GitHub Release tagged `v<version>`, and publishes the complete release.
5. Upload the Chrome, Edge, and Firefox ZIPs from the GitHub Release to their respective stores. Store review and approval happen independently of the GitHub Release.

The public release contains:

- `memos-web-clipper-chromium-v<version>.zip`: manual Chromium installation with the public manifest key needed for a stable OAuth extension ID.
- `memos-web-clipper-chrome-v<version>.zip`: Chrome Web Store upload.
- `memos-web-clipper-edge-v<version>.zip`: Edge Add-ons upload.
- `memos-web-clipper-firefox-v<version>.zip`: Firefox store upload or temporary Firefox testing.
- `SHA256SUMS`: checksums for all four archives.

Firefox stable requires Mozilla-signed extensions for permanent installation. The unsigned Firefox ZIP can be loaded temporarily from `about:debugging`, while permanent users should install the approved store version.

## Recovery

Re-run the Release workflow with the same Git ref. It resumes an existing draft for that version or creates a new draft. It refuses to modify an already-published immutable release.
