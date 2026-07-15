# Firefox reviewer build instructions

This extension is written in TypeScript and bundled with Vite, so the matching source archive is attached to every AMO version.

## Environment

- Ubuntu 24.04 or macOS
- Node.js 26.4.0 (the build also supports the package's declared minimum, Node.js 20.9.0)
- pnpm 11.10.0 (the version pinned in `package.json`)
- The system `zip` command

The source archive contains a `.env` file with only the public OAuth client ID, issuer URL, and web app URL used for the submitted package. No OAuth client secret or server-side Clerk secret is included or needed.

## Reproduce the submitted Firefox package

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm package:firefox
```

The package to compare with the AMO upload is written to `artifacts/memos-web-clipper-firefox-v<version>.zip`. The packaging command also runs Mozilla's `web-ext lint` before creating the ZIP.
