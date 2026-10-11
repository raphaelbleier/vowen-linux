#!/usr/bin/env bash
# Builds and installs Vowen for Linux from the official macOS release.
# Nothing from Vowen is redistributed: the DMG is downloaded from vowen.ai on your machine,
# deobfuscated, patched for Linux and assembled with Linux Electron + Linux helpers.
#
# usage: ./install.sh [--prefix DIR] [--engines DIR|URL] [--cuda|--no-cuda] [--keep-work]
#   --engines overrides the base engines tarball (URL, with a sibling .sha256) or an unpacked resources dir.
#   CUDA add-on: auto when nvidia-smi works; --cuda forces it, --no-cuda skips it.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=versions.env
. "$HERE/versions.env"
# shellcheck source=scripts/common.sh
. "$HERE/scripts/common.sh"
PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/vowen-linux"
ENGINES="$ENGINES_URL_BASE/vowen-engines-linux-x64.tar.gz"
CUDA=auto
KEEP_WORK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX=$2; shift ;;
    --engines) ENGINES=$2; shift ;;
    --cuda) CUDA=1 ;;
    --no-cuda) CUDA=0 ;;
    --keep-work) KEEP_WORK=1 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

for cmd in curl 7z node npm npx python3 unzip; do
  command -v "$cmd" >/dev/null || die "missing dependency: $cmd"
done
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || die "Node.js >= 20 required"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/vowen-linux.XXXXXX")
[ "$KEEP_WORK" = 1 ] || trap 'rm -rf "$WORK"' EXIT
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/vowen-linux"
mkdir -p "$CACHE"

fetch "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-linux-x64.zip" \
  "$ELECTRON_SHA256" "$CACHE/electron-v$ELECTRON_VERSION-linux-x64.zip"

"$HERE/scripts/prepare-app.sh" "$WORK" "$CACHE"
APP="$WORK/app"
MAC="$WORK/dmg/Vowen.app/Contents/Resources"
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
want_cuda=$CUDA
[ "$CUDA" != auto ] || { nvidia-smi -L >/dev/null 2>&1 && want_cuda=1 || want_cuda=0; }
unpack() { # tarball URL (verified against URL.sha256) -> resources
  local f; f="$WORK/$(basename "$1")"
  curl -fL --progress-bar -o "$f" "$1"
  curl -fsSL -o "$f.sha256" "$1.sha256" || die "missing checksum: $1.sha256"
  (cd "$WORK" && sha256sum -c --status "$(basename "$f").sha256") || die "checksum mismatch: $1"
  tar -xzf "$f" -C "$DEST/resources"
}
case "$ENGINES" in
  http*://*) unpack "$ENGINES" ;;
  *) [ -d "$ENGINES" ] || die "engines dir not found: $ENGINES"; cp -a "$ENGINES/." "$DEST/resources/" ;;
esac
if [ "$want_cuda" = 1 ]; then
  say "Installing CUDA add-on"
  unpack "$ENGINES_URL_BASE/vowen-engines-cuda-linux-x64.tar.gz"
fi
"$HERE/packaging/wrap-daemons.sh" "$DEST/resources"

say "Installing to $PREFIX"
rm -rf "${PREFIX:?}.new"
mv "$DEST" "$PREFIX.new"
rm -rf "${PREFIX:?}"
mv "$PREFIX.new" "$PREFIX"
"$HERE/packaging/integrate.sh" "$PREFIX"

say "Done. Start Vowen from your app menu or run: vowen"
