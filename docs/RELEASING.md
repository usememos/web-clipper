# Releasing

Release Please maintains the release pull request, `CHANGELOG.md`, `package.json` version, Git tag, and GitHub Release. A separate tag workflow verifies the source, builds the extension packages, mirrors the matching Mozilla-signed XPI, generates checksums, and attaches the user-facing assets.

## Repository configuration

Add a fine-grained personal access token as the `RELEASE_PLEASE_TOKEN` Actions secret. It needs read/write access to repository contents, issues, and pull requests. A separate token is required because tags created with the default `GITHUB_TOKEN` do not trigger the tag-based release workflow.

Add these public build values as Actions repository variables:

- `VITE_CLERK_OAUTH_CLIENT_ID`
- `VITE_CLERK_OAUTH_ISSUER`
- `VITE_WEB_APP_URL`

The release workflow rejects missing values and verifies that the tag exactly matches the version in `package.json`.

## Release process

1. Merge conventional commits into `main`. Release Please creates or updates a release pull request.
2. Check out the release pull request branch, configure the production `VITE_*` values in `.env`, and run `pnpm package` from a clean worktree.
3. Test the generated packages and submit the Firefox ZIP plus its matching source archive to Firefox Add-ons. Submit the Chromium store packages as appropriate.
4. Wait until Firefox Add-ons publishes the exact version proposed by the release pull request.
5. Merge the release pull request.
6. Release Please creates the `v<version>` tag and GitHub Release. The tag workflow builds the same Firefox payload, downloads the signed XPI from Firefox Add-ons, compares every non-signature file, and publishes the release assets only when they match.

If Firefox Add-ons does not yet expose the expected version, the release workflow fails without publishing mismatched artifacts. Publish the store version and rerun the failed workflow.

The public release contains:

- `memos-web-clipper-chromium-v<version>.zip`, which retains the public manifest key needed for a stable OAuth extension ID.
- `memos-web-clipper-firefox-v<version>.xpi`, mirrored from Firefox Add-ons after payload verification.
- `SHA256SUMS` for both packages.

Store upload archives remain separate. `pnpm package` produces those archives, while `pnpm package:release` produces the Chromium sideload archive and an unsigned Firefox archive used only to verify the signed store package.

## Bootstrap

Version `0.1.0` was published before Release Please was introduced. The manifest records it as the current release, and `bootstrap-sha` points at the initial extension commit so later conventional commits are included in the first generated release pull request. Once the first Release Please release is complete, the bootstrap setting can be removed.
