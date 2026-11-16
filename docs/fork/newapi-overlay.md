# newapi login overlay

Desktop sign-in to a newapi gateway. The renderer gates the app on `/api/newapi/status`, shows a
sign-in page at `/newapi-login`, and offers re-login entry points for the managed provider. It pairs
with the AionCore overlay, which serves `/api/newapi/*` and emits the `newapi.authChanged` event.
Overlay base: e108b6b56 (update this after each sync)

Everything is built so upstream files carry only one-line hooks, each marked `fork(newapi)`.

## Fork-owned files

| File                                                                                                                         | Role                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/desktop/src/common/types/newapi.ts`                                                                                | Types, `NEWAPI_MANAGED_PROVIDER_ID`                                |
| `packages/desktop/src/common/adapter/newapiBridge.ts`                                                                        | `newapi` bridge object (`status`, `startLogin`, `authChanged`)     |
| `packages/desktop/src/renderer/hooks/system/useNewApiStatus.ts`                                                              | Status/gate hook                                                   |
| `packages/desktop/src/renderer/pages/newapi-login/index.tsx`                                                                 | Sign-in page                                                       |
| `packages/desktop/src/renderer/components/newapi/index.ts`                                                                   | Single import point for upstream hooks (gate, lazy page, wrappers) |
| `packages/desktop/src/renderer/components/newapi/NewApiGate.tsx`                                                             | Startup gate (loader / redirect / children)                        |
| `packages/desktop/src/renderer/components/newapi/NewApiActions.tsx`                                                          | `NewApiAuthErrorAction`, `NewApiProviderAction` wrappers           |
| `packages/desktop/src/renderer/components/newapi/NewApiReloginButton.tsx`                                                    | Re-login button                                                    |
| `packages/desktop/src/renderer/services/i18n/locales/*/newapiLogin.json`                                                     | 13 locale files                                                    |
| `tests/unit/renderer/{NewApiGate,NewApiLoginPage,NewApiReloginButton,messageTipsNewApiRelogin,useNewApiStatus}.dom.test.tsx` | Tests                                                              |
| `scripts/fork/check-newapi-overlay.sh`                                                                                       | Overlay integrity check                                            |
| `docs/fork/newapi-overlay.md`                                                                                                | This document                                                      |

## Hooks in upstream files

Find all with `grep -rn "fork(newapi)" packages tests`.

| File                                                                        | Exact line(s)                                                                                                                                                      | Why                                                          | Re-apply                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `common/adapter/ipcBridge.ts`                                               | `export { newapi } from './newapiBridge'; // fork(newapi)`                                                                                                         | Keeps `ipcBridge.newapi.*` working (`export * as ipcBridge`) | Add the line anywhere at top level, e.g. before the `Mode (Provider management)` section |
| `renderer/components/layout/Router.tsx`                                     | `import { NewApiGate, NewApiLoginPage } from '@/renderer/components/newapi'; // fork(newapi)`                                                                      | Imports gate and lazy login page                             | Add next to the other imports                                                            |
| same                                                                        | `return <NewApiGate>{React.cloneElement(layout)}</NewApiGate>; // fork(newapi)`                                                                                    | Gate runs only after the auth checks in `ProtectedLayout`    | Replace the final `return React.cloneElement(layout);` of `ProtectedLayout`              |
| same                                                                        | `{/* fork(newapi) */}` + `<Route path='/newapi-login' element={withRouteFallback(NewApiLoginPage)} />`                                                             | Login route, outside `ProtectedLayout`                       | Add beside the `/login` route                                                            |
| `renderer/pages/conversation/Messages/components/MessageTips.tsx`           | import `NewApiAuthErrorAction` from `@/renderer/components/newapi` (`// fork(newapi)`); `{/* fork(newapi) */}` + `<NewApiAuthErrorAction errorCode={errorCode} />` | Re-login button for `USER_LLM_PROVIDER_AUTH_FAILED`          | Put the JSX after the `resolutionHint` block of the structured-error branch              |
| `renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx` | import `NewApiProviderAction` (`// fork(newapi)`); `{/* fork(newapi) */}` + `<NewApiProviderAction providerId={platform.id} />`                                    | Always-mode button on the managed provider row               | Put the JSX before the provider enable `Switch`                                          |
| `renderer/services/i18n/locales/*/index.ts` (13)                            | `import newapiLogin from './newapiLogin.json'; // fork(newapi)` and `newapiLogin, // fork(newapi)`                                                                 | Registers the namespace                                      | Append to the imports and to the default export object                                   |
| `tests/unit/feedback/resolveFeedbackModule.test.ts`                         | `'/newapi-login'` in `moduleLess` (`// fork(newapi)`)                                                                                                              | Route has no feedback module                                 | Add to the set                                                                           |
| `tests/unit/feedback/MessageTipsFeedback.dom.test.tsx`                      | `vi.mock('@renderer/components/newapi/NewApiReloginButton', ...)` (`// fork(newapi)`)                                                                              | Avoids router/bridge deps in the wrapper                     | Keep the mock; if the wrapper path changes, mock the new one                             |

## Mechanical/generated changes

| File                                                             | Change                                              | Handling                                               |
| ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `packages/desktop/src/common/config/i18n-config.json`            | `newapiLogin` in `modules` (JSON, cannot be marked) | Re-add if lost                                         |
| `packages/desktop/src/renderer/services/i18n/locales/*/index.ts` | One import + one registration line each             | See hooks table                                        |
| `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`     | Generated                                           | Regenerate with `bun run i18n:types`; never hand-merge |
| `tests/unit/feedback/resolveFeedbackModule.test.ts`              | `/newapi-login` entry                               | See hooks table                                        |
| `tests/unit/feedback/MessageTipsFeedback.dom.test.tsx`           | Mock of the relogin button                          | See hooks table                                        |

## Backend dependency

Requires an AionCore build containing the newapi overlay. `package.json` `aioncoreVersion` pins the
upstream release that gets downloaded, so during development point `AIONUI_BACKEND_BIN` at the
patched binary. Shipping an installer needs a fork release or a change to `scripts/prepareAioncore.js`
(not done yet).

## Syncing with upstream

The upstream remote is `upstream` (iOfficeAI/AionUi); `origin` is the fork (attodev/AionUi). Record the upstream commit the overlay is based on in "Overlay base" at the top of this file and update it after each sync.

1. `git fetch upstream`
2. `git rebase --onto upstream/main <old-base> feat/newapi-login` (`<old-base>` is the "Overlay base" commit).
3. Expected conflicts: only the hook lines above and the locale `index.ts` files (commit 2, see "Commit layout"). Resolve by taking upstream and re-adding the one-liners from the hooks table.
4. If upstream added a locale directory, copy `en-US/newapiLogin.json` into it and register it in its `index.ts` (import + entry, with `// fork(newapi)`).
5. `bun run i18n:types` (no hand edits to `i18n-keys.d.ts`), then `node scripts/check-i18n.js`.
6. `bash scripts/fork/check-newapi-overlay.sh`
7. `bunx vitest run tests/unit/renderer/NewApi tests/unit/renderer/useNewApiStatus tests/unit/renderer/messageTipsNewApiRelogin tests/unit/feedback`
8. `bunx tsc --noEmit`, `bun run lint`, `bun run test`.
9. Update "Overlay base" to the new upstream commit.

## Commit layout

The branch is kept as three commits to make rebases easy: (1) fork-owned files, (2) hooks and mechanical edits in upstream files, (3) docs and check script. Conflicts during a rebase should only ever occur in commit (2).

## Known follow-ups

- Nine locales carry English text in `newapiLogin.json`.
- One status call is made per auth-failed message.
- Denial shows the backend's English message.
