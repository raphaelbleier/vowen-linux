#!/usr/bin/env bash
# Builds and installs Vowen for Linux from the official macOS release.
# Nothing from Vowen is redistributed: the DMG is downloaded from vowen.ai on your machine,
# deobfuscated, patched for Linux and assembled with Linux Electron + Linux helpers.
#
# usage: ./install.sh [--prefix DIR] [--engines DIR|URL] [--keep-work]
set -euo pipefail

VOWEN_VERSION=0.5.10
DMG_URL="https://assets.vowen.ai/Vowen-${VOWEN_VERSION}-arm64.dmg"
DMG_SHA256=461f90a0d9093c011ee221a492d88038cd09684e5be2f5ef527a89eba6caf10d
ELECTRON_VERSION=38.7.2
ELECTRON_SHA256=fe428cd212680e1d6df61fa67efc260b9221d089c7a14c9863f18bcbeace5628
WEBCRACK_VERSION=2.16.0
ASAR_VERSION=3.4.1
ENGINES_URL="https://github.com/raphaelbleier/vowen-linux/releases/download/engines-v1/vowen-engines-linux-x64.tar.gz"

HERE=$(cd "$(dirname "$0")" && pwd)
PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/vowen-linux"
ENGINES="$ENGINES_URL"
KEEP_WORK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX=$2; shift ;;
    --engines) ENGINES=$2; shift ;;
    --keep-work) KEEP_WORK=1 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

for cmd in curl 7z node npm npx python3 unzip; do
  command -v "$cmd" >/dev/null || die "missing dependency: $cmd"
done
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || die "Node.js >= 20 required"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/vowen-linux.XXXXXX")
[ "$KEEP_WORK" = 1 ] || trap 'rm -rf "$WORK"' EXIT
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/vowen-linux"
mkdir -p "$CACHE"

fetch() { # url sha256 dest
  if [ ! -f "$3" ] || ! echo "$2  $3" | sha256sum -c --status; then
    say "Downloading $(basename "$3")"
    curl -fL --progress-bar -o "$3.part" "$1"
    mv "$3.part" "$3"
  fi
  echo "$2  $3" | sha256sum -c --status || die "checksum mismatch: $3"
}

fetch "$DMG_URL" "$DMG_SHA256" "$CACHE/Vowen-$VOWEN_VERSION.dmg"
fetch "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-linux-x64.zip" \
  "$ELECTRON_SHA256" "$CACHE/electron-v$ELECTRON_VERSION-linux-x64.zip"

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
node "$HERE/patches/apply.mjs" "$APP" | grep -v '^ok' || true
mkdir -p "$APP/linux"
cp "$HERE"/runtime/* "$APP/linux/"
node -e 'const f=process.argv[1],p=require(f);p.main="linux/bootstrap.js";require("fs").writeFileSync(f,JSON.stringify(p,null,2))' "$APP/package.json"
cp -a "$HERE/shims/." "$APP/node_modules/"

say "Installing Linux native modules"
NM="$APP/node_modules"
rm -rf "${NM:?}/sqlite3" "${NM:?}/sharp" "${NM:?}/@img" "${NM:?}/@ffmpeg-installer/darwin-arm64" "${NM:?}/native-keymap" \
       "${NM:?}/uiohook-napi/build" "${NM:?}/uiohook-napi/prebuilds"
(cd "$WORK" && mkdir native && cd native && npm init -y >/dev/null &&
  npm install --silent --no-audit --no-fund --os=linux --cpu=x64 \
    sqlite3@5.1.7 sharp@0.34.5 @ffmpeg-installer/linux-x64@4.1.0 >/dev/null)
cp -a "$WORK/native/node_modules/sqlite3" "$WORK/native/node_modules/sharp" "$WORK/native/node_modules/@img" "$NM/"
mkdir -p "$NM/@ffmpeg-installer" && cp -a "$WORK/native/node_modules/@ffmpeg-installer/linux-x64" "$NM/@ffmpeg-installer/"
# Optional: keyboard-layout detection. Needs a C++ toolchain and libxkbfile-dev; falls back to US layout.
if (cd "$WORK/native" && npm install --silent --no-audit --no-fund native-keymap@3.3.9 >/dev/null 2>&1 &&
    npx -y @electron/rebuild@3 -v "$ELECTRON_VERSION" -a x64 -f -o native-keymap >/dev/null 2>&1); then
  cp -a "$WORK/native/node_modules/native-keymap" "$NM/"
else
  echo "   native-keymap not built (optional; install g++ make libxkbfile-dev to enable)"
fi
# sqlite3's transitive deps that the app's tree may lack
for d in "$WORK"/native/node_modules/*; do [ -e "$NM/$(basename "$d")" ] || cp -a "$d" "$NM/"; done

say "Packing app.asar"
DEST="$WORK/vowen"
mkdir -p "$DEST"
unzip -q "$CACHE/electron-v$ELECTRON_VERSION-linux-x64.zip" -d "$DEST"
mv "$DEST/electron" "$DEST/vowen"
rm -f "$DEST/resources/default_app.asar" "$DEST/chrome-sandbox"
npx -y "@electron/asar@$ASAR_VERSION" pack "$APP" "$DEST/resources/app.asar" \
  --unpack-dir '{node_modules/sqlite3,node_modules/sharp,node_modules/@img,node_modules/@ffmpeg-installer,node_modules/fluent-ffmpeg,node_modules/native-keymap}'
cp -a "$MAC/assets" "$MAC/models" "$MAC/warmup.wav" "$DEST/resources/"

say "Installing helpers and engines"
mkdir -p "$DEST/resources/bin" "$DEST/resources/lib"
find "$HERE/helpers" -mindepth 2 -maxdepth 2 -type f -perm -u+x -exec cp {} "$DEST/resources/bin/" \;
case "$ENGINES" in
  http*://*) curl -fL --progress-bar "$ENGINES" | tar -xz -C "$DEST/resources" ;;
  *) [ -d "$ENGINES" ] || die "engines dir not found: $ENGINES"; cp -a "$ENGINES/." "$DEST/resources/" ;;
esac

say "Installing to $PREFIX"
rm -rf "${PREFIX:?}.new"
mv "$DEST" "$PREFIX.new"
rm -rf "${PREFIX:?}"
mv "$PREFIX.new" "$PREFIX"
"$HERE/packaging/integrate.sh" "$PREFIX"

say "Done. Start Vowen from your app menu or run: vowen"
