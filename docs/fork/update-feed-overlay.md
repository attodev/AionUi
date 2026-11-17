# Update feed overlay

Points the app's update checks at a self-hosted update server instead of upstream's CDN and GitHub
releases. The server address is baked in at build time from `AIONUI_UPDATE_BASE_URL`. When it is not
set, the build gets a harmless sentinel address, so a fork build can never silently fall back to
upstream and replace itself with the upstream app.

Overlay base: e108b6b56 (update this after each sync). This overlay sits on top of the opencode
overlay (branch `feat/opencode-code-tab`, see `docs/fork/opencode-overlay.md`), which sits on top of
the newapi overlay (`docs/fork/newapi-overlay.md`); both must be applied first. This overlay lives on
branch `feat/update-feed`.

Everything is built so upstream files carry only one-line hooks, each marked `fork(update)`.

## Server requirements

Any server that answers HTTP GET for static files is enough.

- https is required (the manual download only accepts https; an invalid or non-https address silently produces the sentinel build, so always run `check-update-feed.sh`).
- `Content-Length` must be exact (download progress relies on it).
- Do not cache `latest-*.yml`; installers may be cached freely (their names carry the version).
- A private certificate must be trusted by the user's PC; the app does not bypass certificate errors.
- Access control is the server's job. The app sends no authentication header.

## Fork-owned files

| File                                                        | Role                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/desktop/src/process/services/updateFeedUrl.ts`    | Validates `AIONUI_UPDATE_BASE_URL`; exports address, host, disabled repo       |
| `tests/unit/process/services/updateFeedUrl.test.ts`         | Tests for the address resolver                                                 |
| `tests/unit/process/services/updateFeedEnv.dom.test.ts`     | Checks the vitest env default reaches the dom project                          |
| `tests/unit/process/services/updateFeedHooks.test.ts`       | Checks the update wiring follows the configured address                        |
| `tests/unit/process/services/updateFeedLocalServer.test.ts` | Integration test: update flow against a local feed server, no upstream contact |
| `scripts/fork/publish-update-feed.sh`                       | Copies a build's release files into a feed folder, yml written last            |
| `scripts/fork/check-update-feed.sh`                         | Checks a built `out/` folder bakes in the intended address                     |
| `tests/unit/build-scripts/publishUpdateFeed.test.ts`        | Tests for the publish script                                                   |
| `tests/unit/build-scripts/checkUpdateFeed.test.ts`          | Tests for the build check script                                               |
| `scripts/fork/check-update-overlay.sh`                      | Overlay integrity check                                                        |
| `docs/fork/update-feed-overlay.md`                          | This document                                                                  |

## Hooks in upstream files

Find all with `grep -rn "fork(update)" packages tests vitest.config.ts` (8 lines in pre-existing
files; the fork-owned files above carry a `fork(update):` header instead).

| File                                       | Exact line(s)                                                                                                                                                                                                                                                                         | Why                                                                                                     | Re-apply                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process/services/updateFeed.ts`           | `import { UPDATE_BASE_URL } from './updateFeedUrl'; // fork(update)` and `export const CDN_UPDATE_BASE_URL = UPDATE_BASE_URL; // fork(update)`                                                                                                                                        | The CDN feed address comes from the build, not a hard-coded upstream URL                                | Add the import; replace the value of `CDN_UPDATE_BASE_URL` (keep the name)                                                                        |
| `process/bridge/updateBridge.ts`           | `import { UPDATE_BASE_URL, UPDATE_GITHUB_REPO, UPDATE_HOST } from '../services/updateFeedUrl'; // fork(update)`, `const DEFAULT_REPO = UPDATE_GITHUB_REPO; // fork(update)`, `const CDN_HOST = UPDATE_HOST; // fork(update)`, `const CDN_BASE_URL = UPDATE_BASE_URL; // fork(update)` | Manual check, GitHub fallback and download host all follow the configured server                        | Keep the three constants under their original names and change only their values; add the import. `static.aionui.com` must not remain in the file |
| `packages/desktop/electron.vite.config.ts` | `'process.env.AIONUI_UPDATE_BASE_URL': JSON.stringify(process.env.AIONUI_UPDATE_BASE_URL ?? ''), // fork(update)`                                                                                                                                                                     | Bakes the build-time address into the main bundle                                                       | Add it to the `define` object of the `main` block only (not `renderer`)                                                                           |
| `vitest.config.ts`                         | `env: { AIONUI_UPDATE_BASE_URL: 'https://static.aionui.com/releases' }, // fork(update)`                                                                                                                                                                                              | Existing upstream update tests assume the upstream CDN; this one line makes them pass without any edits | Add inside the `test` options. Tests that need another address stub the env themselves                                                            |

## Mechanical/generated changes

None.

## Runtime contract

- Env var `AIONUI_UPDATE_BASE_URL`, read at build time only. Source must contain exactly
  `process.env.AIONUI_UPDATE_BASE_URL`: the `define` in `electron.vite.config.ts` replaces that
  expression textually (no destructuring, no `process.env['...']`).
- Only plain https addresses are accepted: no `user:pass@`, query or hash, non-empty host. A trailing
  `/` is stripped. Anything else gives the sentinel `https://update.invalid/releases`.
- Sentinel build (variable unset or invalid): the app contacts nothing real. The startup auto check
  shows an error (not confirmed in a running app, see follow-ups).
- The GitHub fallback repository is `-/-`, so the fallback never reaches upstream's releases.
- Feed layout: the yml files sit at the feed root; installers and blockmaps sit in a per-version folder.

| Platform              | Feed file (read from `<address>/`) |
| --------------------- | ---------------------------------- |
| Windows x64           | `latest.yml`                       |
| macOS                 | `latest-mac.yml`                   |
| Linux x64             | `latest-linux.yml`                 |
| Linux arm64           | `latest-linux-arm64.yml`           |
| Installers, blockmaps | `<address>/<version>/<file>`       |

- A yml's `url:` entries are bare file names, resolved as `<address>/<version>/<file>` (`cdnGenericProvider.ts` builds `${version}/${filePath}`; `updateBridge.ts` builds `${CDN_BASE_URL}/${version}/${assetName}`). Older version folders must stay on the server while installed apps may still use them. The version must be semver.

## Release procedure

```bash
# Prepare the AionCore bundle with steps 1-2 of installer-build.md ($BUNDLE)
cd AionUi
AIONUI_UPDATE_BASE_URL=https://<update server>/<path> \
AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION=<new version> \
AIONUI_BACKEND_LOCAL_BUNDLE_DIR="$BUNDLE" \
  node scripts/build-with-builder.js x64 --linux --x64 --force
bash scripts/fork/check-update-feed.sh out "$AIONUI_UPDATE_BASE_URL" <new version>
bash scripts/fork/publish-update-feed.sh out <feed folder>
# Upload the feed folder as-is to <path> on the server (rsync, scp, ...)
```

`--force` avoids stale cached build output. The publish script refuses to touch a feed that already
holds the same version with different content unless `--overwrite` is given (identical content is a
no-op).

## Syncing with upstream

Sync order: newapi, then opencode, then update. Before each step record the previous step's tip.

1. `git fetch upstream`
2. `old_newapi=$(git rev-parse feat/newapi-login)` and `old_opencode=$(git rev-parse feat/opencode-code-tab)`
3. Rebase newapi, then run its post-rebase steps in `docs/fork/newapi-overlay.md`.
4. `git rebase --onto feat/newapi-login "$old_newapi" feat/opencode-code-tab`, then its steps in `docs/fork/opencode-overlay.md`.
5. `git rebase --onto feat/opencode-code-tab "$old_opencode" feat/update-feed`
6. Expected conflicts: only the hook lines above (commit 2). Resolve by taking upstream and re-adding the one-liners.
7. `bash scripts/fork/check-newapi-overlay.sh`, `bash scripts/fork/check-opencode-overlay.sh`, `bash scripts/fork/check-update-overlay.sh`
8. `bunx vitest run tests/unit/process/services tests/unit/build-scripts`, `bunx tsc --noEmit`, `bun run lint`
9. Update "Overlay base" to the new upstream commit.

## Commit layout

Three commits: (1) fork-owned files, (2) hooks in upstream files, (3) docs and check script.
Conflicts during a rebase should only occur in commit (2).

## Known follow-ups / deferred

- Not yet verified: replacing an installed app through the feed, the server certificate setup,
  Windows and macOS builds, the startup error display of a sentinel build, and a real full build.
- The startup auto check code was not modified; a sentinel build (no `AIONUI_UPDATE_BASE_URL`) shows
  an error at startup.
- Stale comment `common/update/updateTypes.ts:38` ("Defaults to iOfficeAI/AionUi").
- Every manual check makes a swallowed 404 request to `api.github.com/repos/-/-/releases`.
- The vitest root env makes update tests default to an "upstream build" unless they stub it.
- Debug env `AIONUI_DEBUG_AUTO_UPDATE_CURRENT_VERSION` is used at build time (`build-with-builder.js`) and ignored by packaged apps (`autoUpdaterService.ts` returns early when `app.isPackaged`).
- The renderer's hard-coded upstream release links (`useUpdateNotificationController.ts:62`,
  `AboutModalContent.tsx:120`) are left untouched by ruling: they are links the user clicks, and
  changing them would add renderer edit points. A user whose check failed can click through to
  upstream's releases page.
- `electron-builder.yml` `publish` block still names upstream (only matters with `--publish`).
- `publish-update-feed.sh`: `--overwrite` replaces an installer before its yml (non-atomic window);
  no downgrade protection when publishing an older version over a newer one; macOS bash 3.2 not verified.
- Address module edge cases left untested/accepted (Task 1): explicit port 0 is accepted; tabs, newlines and
  backslashes inside the value are silently stripped by `new URL`; `https:example.com` is accepted (output is
  always canonical); `UPDATE_HOST` keeps brackets for IPv6 and a trailing dot.
- `check-update-feed.sh` requires a `*.js` file under `out/main` and ignores `.cjs`/`.mjs` for that
  precondition (it fails closed).
