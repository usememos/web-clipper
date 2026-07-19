# Firefox reviewer build instructions

This extension is written in TypeScript and bundled with Vite, so the matching source archive is attached to every AMO version.

## Environment

- Ubuntu 24.04 or macOS
- Node.js 26.4.0 (the build also supports the package's declared minimum, Node.js 20.9.0)
- pnpm 11.10.0 (the version pinned in `package.json`)
- The system `zip` command

The source archive contains a `.env` file with only the public OAuth client ID, issuer URL, and web app URL used for the submitted package. No OAuth client secret or server-side Clerk secret is included or needed. It also contains `.memos-amo-source.json`, a generated marker identifying the package version and source commit; this lets the extracted reviewer archive build without a `.git` directory.

## Reproduce the submitted Firefox package

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm package:firefox
```

The package to compare with the AMO upload is written to `artifacts/memos-web-clipper-firefox-v<version>.zip`. The packaging command also runs Mozilla's `web-ext lint` before creating the ZIP.

When run from the reviewer archive, the command creates the Firefox binary only; it does not create another nested source archive. Publisher builds run from a clean Git checkout and additionally create `artifacts/memos-web-clipper-firefox-source-v<version>.zip`. A dirty publisher checkout is rejected before any store artifact is changed.

## Validator warnings

`web-ext lint` currently reports two `UNSAFE_VAR_ASSIGNMENT` warnings in the generated
`assets/textarea-*.js` bundle. Both point to React DOM's generic production renderer: one branch
creates a static `<script></script>` element for React's browser feature detection, and the other
implements React's `dangerouslySetInnerHTML` runtime branch. The extension does not call
`dangerouslySetInnerHTML`, and page-controlled selection markup is parsed in an inert `DOMParser`
document before Markdown conversion. These are dependency-runtime warnings, not assignments made
by the extension source.
