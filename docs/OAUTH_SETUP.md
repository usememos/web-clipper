# Clerk OAuth setup for browser stores

The extension is a public OAuth 2.0 client. It uses Authorization Code + PKCE through
`browser.identity.launchWebAuthFlow()` and does not contain a Clerk client secret.

## Clerk Dashboard

Create one OAuth application for the web clipper with these settings:

- Public client: enabled
- PKCE: required
- Consent screen: enabled
- Scopes: `openid profile public_metadata`
- Redirect URIs: add the exact `browser.identity.getRedirectURL("oauth2")` value from every store build

`public_metadata` is intentional: Clerk defines this OAuth scope as access to both public and
unsafe metadata. The extension reads `unsafe_metadata.memos` from `/oauth/userinfo`; it never
writes Clerk metadata. Connection changes remain on usememos.com.

The complete userinfo response is background-only. Popup and Options messages receive only a
display identity or sanitized connection diagnostics, never `unsafe_metadata` or the Memos access
token. Local OAuth session V2 persists only the OAuth access/refresh token set and expiry; an
existing V1 session is migrated without its cached userinfo. If live userinfo verification is
unavailable, privileged writes fail closed instead of falling back to cached connection metadata.

## Redirect URIs

Chromium redirect URIs use this shape:

```text
https://<extension-id>.chromiumapp.org/oauth2
```

The pinned Chrome development/store ID currently produces:

```text
https://nebaoebnljalfegiidibihhkebeiklbl.chromiumapp.org/oauth2
```

Firefox's pinned Gecko ID (`web-clipper@usememos.com`) produces:

```text
https://ed94c3c27d79252820928bd49ed4790235c3d583.extensions.allizom.org/oauth2
```

Edge has its own store ID, so add the equivalent `chromiumapp.org/oauth2` URI after the Edge
listing assigns that ID. Register each URI exactly, with no wildcard or trailing slash.

## Build environment

Copy `.env.example` to `.env` and set:

```dotenv
VITE_CLERK_OAUTH_CLIENT_ID=your_clerk_oauth_client_id
VITE_CLERK_OAUTH_ISSUER=https://clerk.usememos.com
VITE_WEB_APP_URL=https://usememos.com
```

These are all public build values. Packaging fails when any value is absent, preventing a broken
store upload. No `CLERK_SECRET_KEY`, OAuth client secret, publishable key, or extension origin is
required in the extension.

## Release order

1. Create draft listings so Chrome and Edge IDs are stable.
2. Build/load each store variant and collect its exact redirect URI.
3. Register all redirect URIs in Clerk.
4. Set the public OAuth client ID in `.env`.
5. Commit the release source so the Git working tree is clean.
6. Run `pnpm package` and test sign-in from all three packaged variants.
7. Once the OAuth release is live, remove legacy extension URLs from Clerk `allowed_origins`.

Keep the normal usememos.com web origins configured for the web app itself.
