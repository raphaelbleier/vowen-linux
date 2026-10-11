#!/usr/bin/env bash
# Pinned DMG -> extracted, deobfuscated (webcrack), Linux-patched app tree in <work>/app.
# usage: prepare-app.sh <workDir> <cacheDir>      (the DMG is cached in <cacheDir>; nothing is uploaded anywhere)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
# shellcheck source=../versions.env
. "$ROOT/versions.env"
# shellcheck source=common.sh
. "$HERE/common.sh"
WORK=${1:?usage: prepare-app.sh <workDir> <cacheDir>}
CACHE=${2:?usage: prepare-app.sh <workDir> <cacheDir>}
mkdir -p "$WORK" "$CACHE"

fetch "$DMG_URL" "$DMG_SHA256" "$CACHE/Vowen-$VOWEN_VERSION.dmg"

say "Extracting Vowen $VOWEN_VERSION"
7z x -y -o"$WORK/dmg" "$CACHE/Vowen-$VOWEN_VERSION.dmg" 'Vowen.app/Contents/Resources/*' >/dev/null
MAC="$WORK/dmg/Vowen.app/Contents/Resources"
find "$MAC" -name '*:com.apple.*' -delete
APP="$WORK/app"
npx -y "@electron/asar@$ASAR_VERSION" extract "$MAC/app.asar" "$APP"

say "Deobfuscating (webcrack $WEBCRACK_VERSION, this takes a minute)"
npm install --prefix "$WORK/tools" --silent --no-audit --no-fund "webcrack@$WEBCRACK_VERSION" >/dev/null
for f in "$APP"/dist-electron/*.js "$APP"/dist-react/*.js; do
  [ "$(basename "$f")" = vendor-modules.js ] && continue
  NODE_OPTIONS=--max-old-space-size=8192 "$WORK/tools/node_modules/.bin/webcrack" --no-jsx --no-unpack "$f" > "$f.deob" 2>/dev/null
  mv "$f.deob" "$f"
done

say "Applying Linux patches"
node "$ROOT/patches/apply.mjs" "$APP" | grep -v '^ok' || true
