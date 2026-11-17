#!/usr/bin/env bash
# fork(opencode): verify the opencode Code tab overlay is intact — see docs/fork/opencode-overlay.md
# Marker checks are exact-string matches: a formatter rewrap of a hook line reports MISSING
# (fail-loud by design). Fix the line, do not loosen the check.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

D=packages/desktop/src
fail=0
checks=0
miss() { echo "MISSING: $1" >&2; fail=1; }
hooks=0

owned=(
  "$D/common/types/codeTab.ts"
  "$D/renderer/pages/code-start/index.tsx"
  "$D/renderer/pages/code-start/StartTabs.tsx"
  "$D/renderer/pages/code-start/CodeStartPage.tsx"
  "$D/renderer/pages/code-start/useCodeTab.ts"
  "$D/renderer/pages/code-start/chatAssistants.ts"
  tests/unit/renderer/chatAssistants.test.ts
  tests/unit/renderer/useCustomAgentsLoader.dom.test.tsx
  tests/unit/renderer/CodeStartPage.dom.test.tsx
  tests/unit/renderer/StartTabs.dom.test.tsx
  tests/unit/renderer/useCodeTab.dom.test.tsx
  docs/fork/opencode-overlay.md
)
for f in "${owned[@]}"; do checks=$((checks + 1)); [[ -f $f ]] || miss "fork-owned file $f"; done

# hook <file> <fixed string> <description>
hook() { checks=$((checks + 1)); hooks=$((hooks + 1)); grep -qF -- "$2" "$1" 2>/dev/null || miss "hook in $1: $3"; }
# absent <file> <fixed string> <description>: old code must be gone
absent() { checks=$((checks + 1)); if grep -qF -- "$2" "$1" 2>/dev/null; then miss "leftover code in $1: $3"; fi; }

R=$D/renderer/components/layout/Router.tsx
hook "$R" "React.lazy(() => import('@renderer/pages/code-start')); // fork(opencode)" "Guid lazy import points at pages/code-start"
absent "$R" "import('@renderer/pages/guid')" "Router must not lazy-import pages/guid directly"

K=$D/common/config/configKeys.ts
hook "$K" "'guid.lastStartTab': StartTab | undefined; // fork(opencode)" "guid.lastStartTab key"
hook "$K" "'codeTab.lastModel': string | undefined; // fork(opencode)" "codeTab.lastModel key"
hook "$K" "import type { StartTab } from '@/common/types/codeTab'; // fork(opencode)" "StartTab type import"

C=$D/renderer/pages/guid/hooks/useCustomAgentsLoader.ts
hook "$C" "import { filterChatAssistants } from '@renderer/pages/code-start/chatAssistants'; // fork(opencode)" "chatAssistants import"
hook "$C" "const assistants = filterChatAssistants(assistantList ?? []); // fork(opencode)" "Chat tab assistant filter"
checks=$((checks + 1))
[[ $(grep -cF 'fork(opencode)' "$C") -eq 2 ]] || miss "$C must contain exactly two fork(opencode) lines"

# Chat tab must stay the untouched upstream page (as of the newapi overlay)
G=$D/renderer/pages/guid/GuidPage.tsx
checks=$((checks + 1))
if git rev-parse --verify -q feat/newapi-login >/dev/null; then
  git diff --quiet feat/newapi-login -- "$G" || miss "$G differs from feat/newapi-login (must stay untouched)"
else
  echo "note: ref feat/newapi-login not found, skipping GuidPage.tsx identity check"
fi

# fork-owned source files carry the header
for f in "${owned[@]}"; do
  case $f in *.ts|*.tsx) checks=$((checks + 1)); grep -qF "fork(opencode):" "$f" 2>/dev/null || miss "fork(opencode) header in $f";; esac
done

L=$D/renderer/services/i18n/locales
n=0
for dir in "$L"/*/; do
  loc=$(basename "$dir"); n=$((n + 1))
  checks=$((checks + 1)); [[ -f $dir/codeTab.json ]] || miss "$loc/codeTab.json"
  hook "$dir/index.ts" "import codeTab from './codeTab.json'; // fork(opencode)" "$loc import"
  hook "$dir/index.ts" "codeTab, // fork(opencode)" "$loc registration"
done
checks=$((checks + 1))
cnt=$(sed -n '/"modules": \[/,/\]/p' $D/common/config/i18n-config.json | grep -c '"codeTab"' || true)
[[ $cnt -eq 1 ]] || miss "\"codeTab\" must appear exactly once in the modules array of i18n-config.json (found $cnt)"
checks=$((checks + 1))
grep -qF 'codeTab.' $D/renderer/services/i18n/i18n-keys.d.ts || miss "codeTab. keys in i18n-keys.d.ts (run: bun run i18n:types)"

# Every marker line in a pre-existing file must be one of the hooks above (catches duplicated hooks).
# Fork-owned files, the docs and this script are excluded; expected = number of hook() calls.
checks=$((checks + 1))
excl=()
for f in "${owned[@]}"; do excl+=(":(exclude)$f"); done
excl+=(":(exclude)scripts/fork/check-opencode-overlay.sh")
found=$(git grep -hF 'fork(opencode)' -- packages tests "${excl[@]}" | wc -l)
[[ $found -eq $hooks ]] || miss "expected $hooks fork(opencode) marker lines in pre-existing files, found $found (duplicated or stray hook?)"

if [[ $fail -ne 0 ]]; then echo "opencode overlay check FAILED" >&2; exit 1; fi
echo "opencode overlay OK: $checks checks passed (${#owned[@]} owned files, $hooks hook strings, $n locales)"
