#!/usr/bin/env bash
# fork(update): prepare a folder of release files for the self-hosted update server — see docs/fork/update-feed-overlay.md
# Usage: publish-update-feed.sh <out folder> <feed folder> [--overwrite]
# Everything is validated before the first write, and each yml is written last, so a
# failure never leaves a half-written feed that installed apps would read.
set -euo pipefail

die() { echo "ERROR: $1" >&2; exit 1; }

overwrite=0
args=()
for a in "$@"; do
  if [[ $a == --overwrite ]]; then overwrite=1; else args+=("$a"); fi
done
[[ ${#args[@]} -eq 2 ]] || die "usage: publish-update-feed.sh <out folder> <feed folder> [--overwrite]"
out=${args[0]%/}
feed=${args[1]%/}
[[ -d $out ]] || die "out folder not found: $out"

hash_of() { openssl dgst -sha512 -binary "$1" | base64 | tr -d '\n'; }

ymls=()
for f in "$out"/latest*.yml; do [[ -f $f ]] && ymls+=("$f"); done
[[ ${#ymls[@]} -gt 0 ]] || die "no latest*.yml found in $out"

# Phase 1: validate everything. plan lines: <yml name>\t<version>\t<file name>\t<sha512>
plan=""
for yml in "${ymls[@]}"; do
  yname=${yml##*/}
  parsed=$(awk '
    function unq(s) { gsub(/^[ \t]+|[ \t\r]+$/, "", s); gsub(/^["\x27]|["\x27]$/, "", s); return s }
    /^version:/ { v = unq(substr($0, 9)); next }
    /^files:/ { inf = 1; next }
    /^[^ \t-]/ { inf = 0 }
    inf && /^[ \t]*-[ \t]+url:/ { sub(/^[ \t]*-[ \t]+url:/, ""); if (n) print v "\t" u "\t" h; u = unq($0); h = ""; n = 1; next }
    inf && /^[ \t]+sha512:/ { sub(/^[ \t]+sha512:/, ""); h = unq($0); next }
    END { if (n) print v "\t" u "\t" h }
  ' "$yml")
  [[ -n $parsed ]] || die "$yname: no files entries found"
  while IFS=$'\t' read -r version name want; do
    [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]] \
      || die "$yname: version '$version' is not a plain semver (no 'v' prefix)"
    [[ -n $name && $name != */* && $name != *\\* && $name != . && $name != .. ]] \
      || die "$yname: url '$name' must be a plain file name without path separators"
    [[ -f $out/$name ]] || die "$yname: listed file $name is missing from $out"
    [[ -n $want ]] || die "$yname: no sha512 for $name"
    got=$(hash_of "$out/$name")
    [[ $got == "$want" ]] || die "$yname: sha512 mismatch for $name (yml has $want, file is $got)"
    plan+="$yname"$'\t'"$version"$'\t'"$name"$'\n'
  done <<< "$parsed"
done

# Phase 2: decide what to copy; refuse to silently change a published file.
copies=() # <version>\t<file name>
while IFS=$'\t' read -r yname version name; do
  [[ -n $name ]] || continue
  for n in "$name" "$name.blockmap"; do
    [[ -f $out/$n ]] || continue
    dest=$feed/$version/$n
    if [[ -f $dest ]]; then
      if cmp -s "$out/$n" "$dest"; then continue; fi
      [[ $overwrite -eq 1 ]] || die "$version/$n already exists in the feed with different content (use --overwrite to replace it)"
    fi
    copies+=("$version"$'\t'"$n")
  done
done <<< "$plan"

# Phase 3: write. Installers first (each via temp name + mv), ymls last.
mkdir -p "$feed"
tmps=()
cleanup() { [[ ${#tmps[@]} -gt 0 ]] && rm -f "${tmps[@]}" || true; }
trap cleanup EXIT

written=()
seen=""
if [[ ${#copies[@]} -gt 0 ]]; then
  for c in "${copies[@]}"; do
    version=${c%%$'\t'*}; n=${c#*$'\t'}
    [[ $seen == *$'\n'"$version/$n"$'\n'* ]] && continue
    seen+=$'\n'"$version/$n"$'\n'
    mkdir -p "$feed/$version"
    tmp=$(mktemp "$feed/$version/.tmp.XXXXXX"); tmps+=("$tmp")
    cp "$out/$n" "$tmp"
    mv -f "$tmp" "$feed/$version/$n"
    written+=("$version/$n")
  done
fi
for yml in "${ymls[@]}"; do
  yname=${yml##*/}
  tmp=$(mktemp "$feed/.tmp.XXXXXX"); tmps+=("$tmp")
  cp "$yml" "$tmp"
  mv -f "$tmp" "$feed/$yname"
  written+=("$yname")
done

[[ ${#written[@]} -gt 0 ]] && printf '%s\n' "${written[@]}"
echo "Upload this folder to the update server path."
