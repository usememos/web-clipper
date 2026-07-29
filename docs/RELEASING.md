# Releasing

Release Please maintains the release pull request, `CHANGELOG.md`, and package version. The release workflow builds and verifies every archive, creates a draft GitHub Release, attaches all assets, and only then publishes it. This order supports GitHub release immutability without depending on browser-store review.

## Repository configuration

Add a fine-grained personal access token as the `RELEASE_PLEASE_TOKEN` Actions secret. It needs read/write access to repository contents, issues, and pull requests so Release Please can create and update release pull requests and their checks.

Add these public build values as Actions repository variables:

- `VITE_CLERK_OAUTH_CLIENT_ID`
- `VITE_CLERK_OAUTH_ISSUER`
- `VITE_WEB_APP_URL`

GitHub release immutability can remain enabled. The release is kept as a draft until every asset has been uploaded.

## Release process

1. Merge conventional commits into `main`. Release Please creates or updates a release pull request.
2. Review and merge the release pull request.
3. The merged-pull-request workflow checks out that exact commit, verifies the version and source, and runs `pnpm package`.
4. The workflow validates every archive, generates `SHA256SUMS`, uploads all assets to a draft GitHub Release, publishes the complete release, and marks the Release Please pull request as tagged.
5. Upload the Chrome, Edge, and Firefox ZIPs from the GitHub Release to their respective stores. Store review and approval happen independently of the GitHub Release.

The public release contains:

- `memos-web-clipper-chromium-v<version>.zip`: manual Chromium installation with the public manifest key needed for a stable OAuth extension ID.
- `memos-web-clipper-chrome-v<version>.zip`: Chrome Web Store upload.
- `memos-web-clipper-edge-v<version>.zip`: Edge Add-ons upload.
- `memos-web-clipper-firefox-v<version>.zip`: Firefox store upload or temporary Firefox testing.
- `SHA256SUMS`: checksums for all four archives.

Firefox stable requires Mozilla-signed extensions for permanent installation. The unsigned Firefox ZIP can be loaded temporarily from `about:debugging`, while permanent users should install the approved store version.

## Manual recovery

The Release workflow can be dispatched manually with a Git ref. It resumes an existing draft for that version or creates a new draft. It refuses to modify an already-published immutable release.

## Bootstrap

Version `0.1.0` was published before Release Please was introduced. The manifest records it as the current release, and `bootstrap-sha` points at the initial extension commit so later conventional commits are included in the first generated release pull request. Once the first Release Please release is complete, the bootstrap setting can be removed.
