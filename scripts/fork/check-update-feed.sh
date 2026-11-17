#!/usr/bin/env bash
# fork(update): check that a built app's main bundle points at the intended update server — see docs/fork/update-feed-overlay.md
# Usage: check-update-feed.sh <out folder> [expected address [expected version]]
# The expected address defaults to $AIONUI_UPDATE_BASE_URL. Exit 0 = pass, 1 = fail.
set -euo pipefail

die() { echo "ERROR: $1 -- rebuild with --force (cached build output can carry a stale address)" >&2; exit 1; }

[[ $# -ge 1 && $# -le 3 ]] || { echo "ERROR: usage: check-update-feed.sh <out folder> [expected address [expected version]]" >&2; exit 1; }
out=${1%/}
addr=${2:-${AIONUI_UPDATE_BASE_URL:-}}
addr=${addr%/}
version=${3:-}

if [[ -z $addr ]]; then
  echo "ERROR: no expected address; pass it as the 2nd argument or set AIONUI_UPDATE_BASE_URL" >&2
  exit 1
fi

main="$out/main"
[[ -d $main ]] || die "$main not found"
[[ -n $(find "$main" -type f -name '*.js' | head -n 1) ]] || die "no JS files under $main"

# The baked define value is the raw env string, so it may carry a trailing slash; accept both.
# The address must be a whole quoted string, so a longer address that merely starts with it fails.
found=0
for q in '"' "'" '`'; do
  if grep -rqF -e "$q$addr$q" -e "$q$addr/$q" "$main"; then found=1; break; fi
done
[[ $found -eq 1 ]] || die "expected address $addr not found as a quoted string in $main (a sentinel build lacks it)"
if grep -rqF -- 'static.aionui.com' "$main"; then
  die "upstream host static.aionui.com is still present in $main"
fi
if grep -rqF -- 'process.env.AIONUI_UPDATE_BASE_URL' "$main"; then
  die "$main still reads process.env.AIONUI_UPDATE_BASE_URL (the build-time define was not applied)"
fi

if [[ -n $version ]]; then
  # Weak signal only: the renderer may embed the version string for unrelated reasons.
  [[ -d $out/renderer ]] && grep -rqF -- "\"$version\"" "$out/renderer" \
    || die "version \"$version\" not found under $out/renderer (weak signal)"
fi

echo "OK: $main points at $addr"
