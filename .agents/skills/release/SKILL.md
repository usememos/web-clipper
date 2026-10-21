---
name: release
description: >
  Release Memos Web Clipper to Chrome Web Store and Firefox Add-ons: bump the
  version, package the extension, upload and submit updates, and replace only
  changed store assets. Also use to prepare or resume a release for this project.
---

# Release Web Clipper

Default targets are the existing Chrome and Firefox listings. Include Edge only
when requested and its listing is identified. A release request covers release
preparation, a local release commit, package uploads, changed listing assets, and
submission for review. Honor narrower requests such as prepare-only or upload-only.
Creating or editing this skill does not execute a release. Pushes and GitHub Release
publication are separate actions; use `docs/RELEASING.md` when they are requested.
Firefox releases include the packaged extension only. Do not prepare or upload
a source-code archive or add reviewer build instructions unless the user explicitly
requests them. Keep reviewer notes focused on the changes and how to test them.

All project paths below are relative to the repository root. Read
[stores.md](references/stores.md) for listing identities, asset mappings, store
submission details, and release records.

## 1. Establish the release

- Inspect repository instructions, Git status, `package.json`, `CHANGELOG.md`,
  `scripts/package.mjs`, `.github/workflows/release.yml`, and `CHROMEWEBSTORE.md`.
  Use the project's pinned pnpm and a supported Node version.
- Inspect each target dashboard for its published version, highest uploaded
  version, draft, and pending review. Read existing `docs/releases/` records if
  present. Local documents saying "prepared" or "submitted" are not live evidence.
- Use the requested version. Otherwise use the next patch for fixes, a minor for
  features, and a major for breaking changes. If the repository already has an
  unreleased version ahead of the stores, finish that version rather than bumping
  again. The numeric version must be accepted by both stores and exceed versions
  already consumed there. Resume an existing matching submission without uploading
  it again. Never reuse a version for different package bytes.
- When resuming uploads, reuse the verified archives and source commit from the
  incomplete run. Retrieve its exact artifacts if they are no longer local;
  do not rebuild an already consumed version and assume its bytes are identical.
- Preserve unrelated work. Packaging rejects tracked and untracked changes; do
  not stash, discard, or commit unrelated files to satisfy it. If needed, prepare
  a clean isolated checkout containing the intended release changes.
- Check that the three build values in `.env.example` have real production
  configuration available locally or through the existing release workflow.
  Do not ship example values or expose credentials. Preserve the Chromium public
  manifest key, OAuth application configuration, and Firefox add-on ID.

## 2. Determine changed store assets

Compare each store separately with its last verified asset upload, using the
source commits and SHA-256 hashes in its release record. Stores may differ even
when their package versions match; assets can be updated without a package bump.

- Inspect diffs in `assets/store/`, `assets/brand/`, `public/icons/`,
  `tools/store/`, and the production UI, styles, fonts, or copy rendered by the
  artboards. An unchanged JPEG can still be stale when its source UI changed.
- For affected artwork, follow `tools/store/README.md` to export the relevant
  artboards with fonts loaded and the documented review-menu state. Run
  `pnpm brand:generate` when icon/brand inputs require regeneration. Inspect the
  exported images and dimensions, and refresh the contact sheet and six-file
  `store-assets.zip` when their constituent images change.
- Compare the resulting upload files, not ZIP timestamps or documentation edits.
  Upload only files whose content changed for that store. Preserve image order,
  captions, locales, and unrelated listing settings.
- If no trustworthy per-store baseline exists, inspect the current dashboard
  images against the local exports. Git tags are candidates for investigation,
  not proof of a store upload. Record confirmed matches; replace observed stale
  images. If equivalence cannot be established, resolve that specific baseline
  before replacing uncertain assets rather than silently replacing everything.

## 3. Prepare and package

1. Set `package.json` to the chosen version; `manifest.config.ts` reads it.
   Add accurate release notes at the top of `CHANGELOG.md` as `## [<version>]`.
   Update the relevant version history and listing information in
   `CHROMEWEBSTORE.md`, including permission/privacy explanations if behavior
   changed. Keep preparation status distinct from submission status.
2. Install dependencies with `pnpm install --frozen-lockfile` if needed. Run
   `pnpm lint` and `pnpm test`. If artwork sources changed, also run the two
   workspace checks in `tools/store/README.md`. Review `git diff --check`.
3. Commit only the coherent release changes with a Conventional Commit message.
   Confirm a clean tree and record the exact source commit.
4. Run `pnpm package`. It builds and validates locales/types, packages all four
   targets, and runs Firefox `web-ext lint`. Use these artifacts rather than
   hand-zipping `dist/` or the repository.
5. Verify archives and manifests using the checks in `release.yml`: all versions
   match; manual Chromium retains its key; store builds omit `key`/`update_url`;
   Firefox retains its add-on ID and uses `background.scripts`; Chrome and Edge
   packages match. Test ZIP integrity and record SHA-256 hashes of the artifacts.
   Smoke-test affected behavior in the packaged extension when practical; report
   any runtime checks that could not be performed.

The files are `artifacts/memos-web-clipper-<target>-v<version>.zip`. Upload
`chrome` to Chrome and `firefox` to Firefox. `chromium` is for manual installation;
`assets/store/store-assets.zip` is an artwork bundle, not an extension package.

If GitHub publication is included, follow the existing manual workflow at the
exact committed ref, wait for completion, and use its verified artifacts. Do not
replace an immutable published release or claim a local package is a GitHub release.

## 4. Upload and submit

Follow the relevant store section in [stores.md](references/stores.md). Upload
the package to the existing listing, wait for validation, resolve actionable
validation errors, and update the changed supported assets before submission.
Keep existing distribution settings. Submit a full release for review; stop at
the saved draft when that is the requested scope.

Prefer a configured store API for supported operations; otherwise use the
authenticated browser. Use fresh UI state after uploads, dialogs, and navigation.
If gallery scripting is unavailable, use supported native browser controls and
file pickers. Recover from stale elements or focus errors by inspecting current
state; do not repeat an uncertain submission or deletion blindly. Respect any
action-specific confirmation required by the browser tool, reusing approval
already given for the same replacements.

Do not cancel another pending review, delete a version, or change release
visibility to force progress. A matching pending submission is already submitted;
a conflicting review may block that store while the other store proceeds. Only
hand off steps requiring user input or access; continue independent work.

## 5. Verify and record

Reopen the dashboard after saving and submission. Verify the uploaded version,
saved image order/previews, and final store status. "Saving" or "Submitting" is
not completion. Record Chrome's automatic/deferred publishing choice. Check the
public listing when the update is live; pending review does not mean published.
Save verification screenshots under ignored `tmp/` when using the browser.

Write or update `docs/releases/<version>.md` using the record guidance in
[stores.md](references/stores.md). Keep source commit and artifact hashes fixed
even if a later documentation commit records store results. Update stale local
status statements only from observed evidence.

Report the version, release commit, artifact paths, checks performed, changed or
already-matching assets per store, and each store's actual status with links.
Identify any remaining blocker. Do not wait indefinitely for store review or
schedule monitoring unless requested.
