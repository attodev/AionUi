#!/usr/bin/env bash
# fork(update): verify the update feed overlay is intact — see docs/fork/update-feed-overlay.md
# Marker checks are exact-string matches: a formatter rewrap of a hook line reports MISSING
# (fail-loud by design). Fix the line, do not loosen the check.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

D=packages/desktop/src
fail=0
checks=0
hooks=0
miss() { echo "MISSING: $1" >&2; fail=1; }

owned=(
  "$D/process/services/updateFeedUrl.ts"
  tests/unit/process/services/updateFeedUrl.test.ts
  tests/unit/process/services/updateFeedEnv.dom.test.ts
  tests/unit/process/services/updateFeedHooks.test.ts
  tests/unit/process/services/updateFeedLocalServer.test.ts
  scripts/fork/publish-update-feed.sh
  scripts/fork/check-update-feed.sh
  tests/unit/build-scripts/publishUpdateFeed.test.ts
  tests/unit/build-scripts/checkUpdateFeed.test.ts
  docs/fork/update-feed-overlay.md
  scripts/fork/check-update-overlay.sh
)
for f in "${owned[@]}"; do checks=$((checks + 1)); [[ -f $f ]] || miss "fork-owned file $f"; done

# hook <file> <fixed string> <description>
hook() { checks=$((checks + 1)); hooks=$((hooks + 1)); grep -qF -- "$2" "$1" 2>/dev/null || miss "hook in $1: $3"; }
# absent <file> <fixed string> <description>: old code must be gone
absent() { checks=$((checks + 1)); if grep -qF -- "$2" "$1" 2>/dev/null; then miss "leftover code in $1: $3"; fi; }

F=$D/process/services/updateFeed.ts
hook "$F" "import { UPDATE_BASE_URL } from './updateFeedUrl'; // fork(update)" "updateFeedUrl import"
hook "$F" "export const CDN_UPDATE_BASE_URL = UPDATE_BASE_URL; // fork(update)" "CDN_UPDATE_BASE_URL value"

B=$D/process/bridge/updateBridge.ts
hook "$B" "import { UPDATE_BASE_URL, UPDATE_GITHUB_REPO, UPDATE_HOST } from '../services/updateFeedUrl'; // fork(update)" "updateFeedUrl import"
hook "$B" "const DEFAULT_REPO = UPDATE_GITHUB_REPO; // fork(update)" "DEFAULT_REPO value"
hook "$B" "const CDN_HOST = UPDATE_HOST; // fork(update)" "CDN_HOST value"
hook "$B" "const CDN_BASE_URL = UPDATE_BASE_URL; // fork(update)" "CDN_BASE_URL value"
absent "$B" "static.aionui.com" "upstream CDN host must not be hard-coded"

# The define line must sit inside the main block, not the renderer block.
E=packages/desktop/electron.vite.config.ts
define="'process.env.AIONUI_UPDATE_BASE_URL': JSON.stringify(process.env.AIONUI_UPDATE_BASE_URL ?? ''), // fork(update)"
hook "$E" "$define" "main-process define for AIONUI_UPDATE_BASE_URL"
checks=$((checks + 1))
mainblk=$(awk '/^    main: \{/ {m=1; next} /^    (preload|renderer): \{/ {m=0} m' "$E")
rendblk=$(awk '/^    renderer: \{/ {r=1; next} r' "$E")
grep -qF -- "$define" <<<"$mainblk" || miss "$E: define line must be inside the main block"
checks=$((checks + 1))
if grep -qF 'AIONUI_UPDATE_BASE_URL' <<<"$rendblk"; then miss "$E: AIONUI_UPDATE_BASE_URL must not appear in the renderer block"; fi

hook vitest.config.ts "env: { AIONUI_UPDATE_BASE_URL: 'https://static.aionui.com/releases' }, // fork(update)" "vitest env default"

# The literal expression must stay: electron.vite.config.ts define replaces it textually.
checks=$((checks + 1))
grep -qF 'process.env.AIONUI_UPDATE_BASE_URL' "$D/process/services/updateFeedUrl.ts" 2>/dev/null || miss "updateFeedUrl.ts must contain the exact string process.env.AIONUI_UPDATE_BASE_URL"

# fork-owned files carry the header
for f in "${owned[@]}"; do
  case $f in
    docs/*|scripts/fork/check-update-overlay.sh) ;;
    *.ts|*.tsx|*.sh) checks=$((checks + 1)); grep -qF "fork(update):" "$f" 2>/dev/null || miss "fork(update) header in $f";;
  esac
done

# Executable bits
for f in scripts/fork/publish-update-feed.sh scripts/fork/check-update-feed.sh scripts/fork/check-update-overlay.sh; do
  checks=$((checks + 1)); [[ -x $f ]] || miss "executable bit on $f"
done

# Every marker line in a pre-existing file must be one of the hooks above (catches duplicated hooks).
checks=$((checks + 1))
excl=()
for f in "${owned[@]}"; do excl+=(":(exclude)$f"); done
found=$(git grep -hF 'fork(update)' -- packages tests vitest.config.ts "${excl[@]}" | wc -l)
[[ $found -eq 8 && $hooks -eq 8 ]] || miss "expected 8 fork(update) marker lines in pre-existing files, found $found (hook() calls: $hooks)"

if [[ $fail -ne 0 ]]; then echo "update overlay check FAILED" >&2; exit 1; fi
echo "update overlay OK: $checks checks passed (${#owned[@]} owned files, $hooks hook lines)"
