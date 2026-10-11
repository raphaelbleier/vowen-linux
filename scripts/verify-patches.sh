#!/usr/bin/env bash
# CI check: every patch still matches the pinned release and the patched bundles still parse.
# usage: verify-patches.sh [cacheDir]   (default $VOWEN_CACHE or ~/.cache/vowen-linux; keeps the DMG there, never uploads it)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=common.sh
. "$HERE/common.sh"
CACHE=${1:-${VOWEN_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/vowen-linux}}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/vowen-verify.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

"$HERE/prepare-app.sh" "$WORK" "$CACHE"   # patch failures abort here (apply.mjs exits 1 if a find-count is off)

say "node --check on patched bundles"
n=0
for f in "$WORK"/app/dist-electron/*.js "$WORK"/app/dist-react/*.js; do
  node --check "$f" || die "syntax error after patching: ${f#"$WORK"/app/}"
  n=$((n + 1))
done
say "OK: $n bundles patched and parse"
