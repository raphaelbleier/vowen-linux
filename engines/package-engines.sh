#!/usr/bin/env bash
# Build all engines and pack them as vowen-engines-linux-x64.tar.gz (extracts into resources/: bin/ + lib/).
#   BUILD_ROOT (default /mnt/linux-data/vowen-build)  OUT (default $BUILD_ROOT/resources)  DEST (default $PWD)
# SKIP_BUILD=1 packs an existing $OUT.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
export BUILD_ROOT=${BUILD_ROOT:-/mnt/linux-data/vowen-build}
export OUT=${OUT:-$BUILD_ROOT/resources}
DEST=${DEST:-$PWD}
if [ -z "${SKIP_BUILD:-}" ]; then "$HERE/build-whisper.sh"; "$HERE/build-rust.sh"; fi
tar -czf "$DEST/vowen-engines-linux-x64.tar.gz" -C "$OUT" bin lib
ls -lh "$DEST/vowen-engines-linux-x64.tar.gz"
