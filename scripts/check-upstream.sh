#!/usr/bin/env bash
# Is there a Vowen release newer than versions.env pins, and do the Linux patches still apply to it?
# usage: check-upstream.sh [cacheDir] [version]   (version: test a specific release instead of the feed's latest)
# Writes upstream-report.md and, under GitHub Actions, the outputs status (current|ok|broken) and version.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
# shellcheck source=../versions.env
. "$ROOT/versions.env"
# shellcheck source=common.sh
. "$HERE/common.sh"
CACHE=${1:-${VOWEN_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/vowen-linux}}
REPORT=$ROOT/upstream-report.md
mkdir -p "$CACHE"

out() { [ -z "${GITHUB_OUTPUT:-}" ] || echo "$1=$2" >> "$GITHUB_OUTPUT"; }

feed=$(curl -fsSL https://assets.vowen.ai/latest-mac.yml)
latest=${2:-$(sed -n 's/^version: *//p' <<<"$feed")}
out version "$latest"
if [ "$latest" = "$VOWEN_VERSION" ]; then
  say "Vowen $latest is the pinned version, nothing to do"
  out status current
  exit 0
fi

dmg="Vowen-$latest-arm64.dmg"
local_dmg="$CACHE/Vowen-$latest.dmg"   # the name prepare-app.sh caches under
say "Vowen $latest is out (pinned: $VOWEN_VERSION), downloading $dmg"
curl -fL --progress-bar -o "$local_dmg" "https://assets.vowen.ai/$dmg"
# The feed carries base64 SHA-512s; only the latest release is listed there.
want=$(awk -v f="$dmg" '$0 ~ "url: " f {getline; print $2}' <<<"$feed")
if [ -n "$want" ]; then
  have=$(openssl dgst -sha512 -binary "$local_dmg" | base64 -w0)
  [ "$have" = "$want" ] || die "SHA-512 of $dmg does not match the update feed"
fi
sha=$(sha256sum "$local_dmg" | cut -d' ' -f1)

override=$(mktemp)
log=$(mktemp)
trap 'rm -f "$override" "$log"' EXIT
printf 'VOWEN_VERSION=%s\nDMG_URL=%s\nDMG_SHA256=%s\n' "$latest" "https://assets.vowen.ai/$dmg" "$sha" > "$override"

if VOWEN_OVERRIDE=$override "$HERE/verify-patches.sh" "$CACHE" 2> >(tee "$log" >&2); then
  status=ok
else
  status=broken
fi
out status "$status"

{
  echo "Vowen **$latest** is out; this kit pins **$VOWEN_VERSION**."
  echo
  if [ "$status" = ok ]; then
    echo "All Linux patches apply and the patched bundles parse. To move to it, set in \`versions.env\`:"
  else
    echo "These patches no longer match. Adapt them (the anchor line shows where the code moved), then set in \`versions.env\`:"
    echo
    echo '```'
    grep -E '^(FAIL|     first line|error)' "$log" || echo "(no FAIL lines; see the workflow log)"
    echo '```'
  fi
  echo
  echo '```sh'
  echo "VOWEN_VERSION=$latest"
  echo "DMG_SHA256=$sha"
  echo '```'
  echo
  echo "Then test the app end to end before releasing: new Vowen versions can change behaviour that no patch covers."
} > "$REPORT"
cat "$REPORT"
