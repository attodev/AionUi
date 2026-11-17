# opencode Code tab overlay

Adds a "Code" tab next to "Chat" on the start page. The Code tab starts conversations with the
bundled opencode agent (assistant id `bare:53861a53`, opencode agent id `53861a53`) in a chosen
working folder, with a model picked from the managed `newapi-managed` provider and a `build` / `plan`
mode. The Chat tab renders the unchanged upstream start page. It pairs with the AionCore "opencode
overlay" (see "Backend dependency").
Overlay base: e108b6b56 (update this after each sync). This overlay sits on top of the newapi overlay
(branch `feat/newapi-login`, see `docs/fork/newapi-overlay.md`), which must be applied first.

Everything is built so upstream files carry only one-line hooks, each marked `fork(opencode)`.

## Fork-owned files

| File                                                                              | Role                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/desktop/src/common/types/codeTab.ts`                                    | Shared constants and types (`StartTab`, opencode assistant id, modes)      |
| `packages/desktop/src/renderer/pages/code-start/index.tsx`                        | Start page shell: tab switcher, keeps Chat (`pages/guid`) and Code mounted |
| `packages/desktop/src/renderer/pages/code-start/StartTabs.tsx`                    | Chat / Code tab switcher                                                   |
| `packages/desktop/src/renderer/pages/code-start/CodeStartPage.tsx`                | Code start page: folder, model, mode, prompt, conversation creation        |
| `packages/desktop/src/renderer/pages/code-start/useCodeTab.ts`                    | State hook (model list from `newapi-managed`, last model, availability)    |
| `packages/desktop/src/renderer/pages/code-start/chatAssistants.ts`                | `filterChatAssistants`: Chat tab keeps only built-in-agent assistants      |
| `packages/desktop/src/renderer/services/i18n/locales/*/codeTab.json`              | 13 locale files                                                            |
| `tests/unit/renderer/{CodeStartPage,StartTabs,useCodeTab}.dom.test.tsx`           | Tests                                                                      |
| `tests/unit/renderer/{chatAssistants.test.ts,useCustomAgentsLoader.dom.test.tsx}` | Tests for the Chat tab filter                                              |
| `scripts/fork/check-opencode-overlay.sh`                                          | Overlay integrity check                                                    |
| `docs/fork/opencode-overlay.md`                                                   | This document                                                              |

Conversations are created for assistant id `bare:53861a53` with
`conversation_overrides.model = "newapi/<model id>"` and `permission = "build" | "plan"`.

## Hooks in upstream files

Find all with `grep -rn "fork(opencode)" packages tests`.

| File                                                 | Exact line(s)                                                                                                                                                                               | Why                                                                  | Re-apply                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `renderer/components/layout/Router.tsx`              | `const Guid = React.lazy(() => import('@renderer/pages/code-start')); // fork(opencode)`                                                                                                    | The `/guid` route renders the tab shell instead of the upstream page | This replaces the line that pointed at `pages/guid`. If upstream changes that line, only re-point the path to `pages/code-start` |
| `common/config/configKeys.ts`                        | `'guid.lastStartTab': StartTab \| undefined; // fork(opencode)` and `'codeTab.lastModel': string \| undefined; // fork(opencode)` (plus the `StartTab` type import, `// fork(opencode)`)    | Typed keys for the remembered tab and last Code model                | Add the two entries to `ConfigKeyMap` and the type import                                                                        |
| `renderer/services/i18n/locales/*/index.ts` (13)     | `import codeTab from './codeTab.json'; // fork(opencode)` and `codeTab, // fork(opencode)`                                                                                                  | Registers the namespace                                              | Append to the imports and to the default export object                                                                           |
| `renderer/pages/guid/hooks/useCustomAgentsLoader.ts` | `import { filterChatAssistants } from '@renderer/pages/code-start/chatAssistants'; // fork(opencode)` and `const assistants = filterChatAssistants(assistantList ?? []); // fork(opencode)` | Chat tab lists only built-in-agent assistants                        | Add the import; wrap the `assistantList ?? []` expression in `filterChatAssistants(...)`                                         |

`renderer/pages/guid/GuidPage.tsx` is deliberately untouched (it is the Chat tab). `check-opencode-overlay.sh` verifies this with `git diff feat/newapi-login -- <GuidPage.tsx>`, so a local `feat/newapi-login` ref must exist (the check is skipped, with a note, when it does not).

## Chat tab

The Chat tab lists only assistants that run on the built-in agent; external CLI agents, including opencode, are not selectable there (opencode is reachable only through the Code tab). The filter is applied in `useCustomAgentsLoader` (used only by the start page), so the shared `assistants.list` SWR cache and every other screen that lists assistants (settings, cron, conversations, teams) are unchanged. A persisted `guid.lastAssistantId` or a navigation that preselects an external-agent assistant falls back to the built-in default.

The shell switches to Chat whenever navigation state to `/guid` carries chat intent (`prefillPrompt`, `selectedAssistantId`, `workspace`, `prefillFiles`, `resetAssistant`). If upstream adds another chat-only state key, add it to `CHAT_INTENT_KEYS` in `pages/code-start/index.tsx`.

## Mechanical/generated changes

| File                                                             | Change                                          | Handling                                               |
| ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `packages/desktop/src/common/config/i18n-config.json`            | `codeTab` in `modules` (JSON, cannot be marked) | Re-add if lost                                         |
| `packages/desktop/src/renderer/services/i18n/locales/*/index.ts` | One import + one registration line each         | See hooks table                                        |
| `packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts`     | Generated                                       | Regenerate with `bun run i18n:types`; never hand-merge |

## Backend dependency

The backend half is the AionCore "opencode overlay". It resolves the `opencode` executable in this
order: env `AIONUI_OPENCODE_BIN`, then the bundled managed resources (pinned version 2.3.0; the bundle
is produced by `aioncore prepare-managed-resources` and located via env
`AIONUI_BUNDLED_MANAGED_RESOURCES` or the packaged default), then `PATH`. The bundle is only
consulted when AionCore runs with `--managed-resources-mode bundled`, which this app passes only
when packaged; in an unpackaged development run point `AIONUI_OPENCODE_BIN` at the binary instead
(for example `<bundle>/cli/opencode/2.3.0/linux-x64/opencode`). It also injects a
newapi-only provider config when spawning opencode, ignores the workspace's own `opencode.json`,
and blanks any `OPENCODE_*` variables inherited from the user's shell (see
`AionCore/docs/fork/opencode-overlay.md`). The model list comes from the managed provider
`newapi-managed`.

Without that AionCore build the Code tab shows the "opencode not found" notice unless opencode is on
`PATH`. During development point `AIONUI_BACKEND_BIN` at the patched binary (as for the newapi overlay).

## Syncing with upstream

The upstream remote is `upstream` (iOfficeAI/AionUi); `origin` is the fork (attodev/AionUi). Record the upstream commit the overlay is based on
in "Overlay base" at the top of this file and update it after each sync. Sync the newapi overlay first.

1. `git fetch upstream`
2. Record the current newapi tip (needed to move this branch): `old_newapi=$(git rev-parse feat/newapi-login)`
3. Rebase newapi first: `git rebase --onto upstream/main <old-base> feat/newapi-login`, then run that overlay's own post-rebase steps from `docs/fork/newapi-overlay.md` (checks, i18n, tests) before touching this branch.
4. Then this branch onto it: `git rebase --onto feat/newapi-login "$old_newapi" feat/opencode-code-tab`.
5. Expected conflicts: only the hook lines above and the locale `index.ts` files (commit 2, see "Commit layout"). Resolve by taking upstream and re-adding the one-liners. For `Router.tsx`, if upstream changed the `Guid` lazy line, keep upstream's line and re-point the path to `pages/code-start`. If upstream added a locale directory, copy `en-US/codeTab.json` into it and register it in its `index.ts` (import + entry, with `// fork(opencode)`).
6. `bun run i18n:types` (no hand edits to `i18n-keys.d.ts`), then `node scripts/check-i18n.js`.
7. `bash scripts/fork/check-newapi-overlay.sh` and `bash scripts/fork/check-opencode-overlay.sh`
8. `bunx vitest run tests/unit/renderer/CodeStartPage tests/unit/renderer/StartTabs tests/unit/renderer/useCodeTab`
9. `bunx tsc --noEmit`, `bun run lint`, `bun run test`.
10. Update "Overlay base" to the new upstream commit.

## Commit layout

The branch is kept as three commits to make rebases easy: (1) fork-owned files, (2) hooks and
mechanical edits in upstream files, (3) docs and check script. Conflicts during a rebase should only
ever occur in commit (2).

## Known follow-ups

- Non-chat locales carry machine translations by the implementer and should be reviewed.
- After re-login a running opencode runtime keeps the old key until it is restarted.
- Platforms other than linux-x64 are not locked in the backend yet.
