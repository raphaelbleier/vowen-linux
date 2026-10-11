#!/usr/bin/env bash
# Build parakeet-cli + diarize-cli + sherpa-asr-cli (x86_64 linux) and fetch ONNX Runtime 1.24.2 into $OUT/{bin,lib}.
#   BUILD_ROOT (default ${XDG_CACHE_HOME:-$HOME/.cache}/vowen-linux/build)  OUT (default $BUILD_ROOT/resources)
# Needs rustup/cargo (https://rustup.rs; user-local is fine) and cmake + a C++ compiler (sherpa-onnx-sys).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
BUILD_ROOT=${BUILD_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/vowen-linux/build}
OUT=${OUT:-$BUILD_ROOT/resources}
ORT_VER=1.24.2
export PATH=$HOME/.cargo/bin:$PATH CARGO_TARGET_DIR=$BUILD_ROOT/cargo-target

for c in parakeet-cli diarize-cli sherpa-asr-cli; do
  cargo build --release --manifest-path "$HERE/$c/Cargo.toml"
done

mkdir -p "$OUT/bin" "$OUT/lib"
cp "$CARGO_TARGET_DIR"/release/{parakeet-cli,diarize-cli,sherpa-asr-cli} "$OUT/bin/"

# ort is built with load-dynamic: the app sets ORT_DYLIB_PATH=<lib>/libonnxruntime.so
if [ ! -e "$OUT/lib/libonnxruntime.so.$ORT_VER" ]; then
  tgz=$BUILD_ROOT/onnxruntime-linux-x64-$ORT_VER.tgz
  [ -f "$tgz" ] || curl -fL -o "$tgz" "https://github.com/microsoft/onnxruntime/releases/download/v$ORT_VER/onnxruntime-linux-x64-$ORT_VER.tgz"
  tar -xzf "$tgz" -C "$BUILD_ROOT" "onnxruntime-linux-x64-$ORT_VER/lib"
  cp -a "$BUILD_ROOT"/onnxruntime-linux-x64-$ORT_VER/lib/libonnxruntime.so* "$OUT/lib/"
fi
ls -l "$OUT/bin"/{parakeet,diarize,sherpa-asr}-cli "$OUT"/lib/libonnxruntime*
