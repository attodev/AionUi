#!/usr/bin/env bash
# fork(newapi): verify the newapi overlay is intact — see docs/fork/newapi-overlay.md
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
  "$D/common/types/newapi.ts"
  "$D/common/adapter/newapiBridge.ts"
  "$D/renderer/hooks/system/useNewApiStatus.ts"
  "$D/renderer/pages/newapi-login/index.tsx"
  "$D/renderer/components/newapi/index.ts"
  "$D/renderer/components/newapi/NewApiGate.tsx"
  "$D/renderer/components/newapi/NewApiActions.tsx"
  "$D/renderer/components/newapi/NewApiReloginButton.tsx"
  tests/unit/renderer/NewApiGate.dom.test.tsx
  tests/unit/renderer/NewApiLoginPage.dom.test.tsx
  tests/unit/renderer/NewApiReloginButton.dom.test.tsx
  tests/unit/renderer/messageTipsNewApiRelogin.dom.test.tsx
  tests/unit/renderer/useNewApiStatus.dom.test.tsx
  docs/fork/newapi-overlay.md
)
for f in "${owned[@]}"; do checks=$((checks + 1)); [[ -f $f ]] || miss "fork-owned file $f"; done

# hook <file> <fixed string> <description>
hook() { checks=$((checks + 1)); hooks=$((hooks + 1)); grep -qF -- "$2" "$1" 2>/dev/null || miss "hook in $1: $3"; }
# absent <file> <fixed string> <description>: old inline code must be gone
absent() { checks=$((checks + 1)); if grep -qF -- "$2" "$1" 2>/dev/null; then miss "leftover inline code in $1: $3"; fi; }
hook "$D/common/adapter/ipcBridge.ts" "export { newapi } from './newapiBridge'; // fork(newapi)" "newapi bridge re-export"
R=$D/renderer/components/layout/Router.tsx
hook "$R" "from '@/renderer/components/newapi'; // fork(newapi)" "gate/login-page import"
hook "$R" "<NewApiGate>{React.cloneElement(layout)}</NewApiGate>; // fork(newapi)" "gate wrapping ProtectedLayout"
hook "$R" "path='/newapi-login'" "/newapi-login route"
checks=$((checks + 1)); grep -qF "{/* fork(newapi) */}" "$R" || miss "hook in $R: route marker {/* fork(newapi) */}"
M=$D/renderer/pages/conversation/Messages/components/MessageTips.tsx
hook "$M" "NewApiAuthErrorAction } from '@/renderer/components/newapi'; // fork(newapi)" "auth-error action import"
hook "$M" "<NewApiAuthErrorAction errorCode={errorCode} />" "auth-error action JSX"
P=$D/renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx
hook "$P" "NewApiProviderAction } from '@/renderer/components/newapi'; // fork(newapi)" "provider action import"
hook "$P" "<NewApiProviderAction providerId={platform.id} />" "provider action JSX"
hook tests/unit/feedback/resolveFeedbackModule.test.ts "'/newapi-login'" "'/newapi-login' in moduleLess"
hook tests/unit/feedback/MessageTipsFeedback.dom.test.tsx "vi.mock('@renderer/components/newapi/NewApiReloginButton'" "mock of the newapi relogin button"

absent "$R" "useNewApiStatus" "Router must not use useNewApiStatus (lives in NewApiGate)"
absent "$R" "gate ===" "Router must not contain inline gate logic"
absent "$M" "NewApiReloginButton" "MessageTips must not import NewApiReloginButton directly"
absent "$P" "NewApiReloginButton" "ModelModalContent must not import NewApiReloginButton directly"
absent "$D/common/adapter/ipcBridge.ts" "/api/newapi/" "ipcBridge must not define newapi routes (see newapiBridge.ts)"

L=$D/renderer/services/i18n/locales
n=0
for dir in "$L"/*/; do
  loc=$(basename "$dir"); n=$((n + 1))
  checks=$((checks + 1)); [[ -f $dir/newapiLogin.json ]] || miss "$loc/newapiLogin.json"
  hook "$dir/index.ts" "import newapiLogin from './newapiLogin.json'; // fork(newapi)" "$loc import"
  hook "$dir/index.ts" "newapiLogin, // fork(newapi)" "$loc registration"
done
checks=$((checks + 1))
sed -n '/"modules": \[/,/\]/p' $D/common/config/i18n-config.json | grep -q '"newapiLogin"' || miss "newapiLogin in the modules array of i18n-config.json"
checks=$((checks + 1))
grep -qF 'newapiLogin.' $D/renderer/services/i18n/i18n-keys.d.ts || miss "newapiLogin. keys in i18n-keys.d.ts (run: bun run i18n:types)"

if [[ $fail -ne 0 ]]; then echo "newapi overlay check FAILED" >&2; exit 1; fi
echo "newapi overlay OK: $checks checks passed (${#owned[@]} owned files, $hooks hook strings, $n locales)"
