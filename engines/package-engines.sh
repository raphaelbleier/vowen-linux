#!/usr/bin/env bash
# Pack built engines (from $OUT) into release tarballs + .sha256 files in $DEST.
# usage: package-engines.sh [base|cuda|all]     (default all; cuda skipped if libggml-cuda.so was not built)
#   base: vowen-engines-linux-x64.tar.gz       bin/ whisper-* ggml-cpu-*.so ggml-vulkan.so *-cli, lib/ libwhisper libggml* libonnxruntime
#   cuda: vowen-engines-cuda-linux-x64.tar.gz  bin/libggml-cuda.so, lib/ libcudart libcublas libcublasLt (from $CUDA_HOME)
# Both extract into the app's resources/.
#   BUILD_ROOT (default /mnt/linux-data/vowen-build)  OUT (default $BUILD_ROOT/resources)  DEST (default $PWD)
#   SKIP_BUILD=1 packs an existing $OUT instead of running build-whisper.sh + build-rust.sh first.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
MODE=${1:-all}
export BUILD_ROOT=${BUILD_ROOT:-/mnt/linux-data/vowen-build}
export OUT=${OUT:-$BUILD_ROOT/resources}
DEST=$(mkdir -p "${DEST:-$PWD}" && cd "${DEST:-$PWD}" && pwd)
CUDA_HOME=${CUDA_HOME:-/mnt/linux-data/cuda-13.0}
[ -x "$CUDA_HOME/bin/nvcc" ] || CUDA_HOME=/usr/local/cuda
if [ -z "${SKIP_BUILD:-}" ]; then "$HERE/build-whisper.sh"; "$HERE/build-rust.sh"; fi

STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
pack() { # name stagedir
  tar -czf "$DEST/$1" -C "$2" bin lib
  (cd "$DEST" && sha256sum "$1" > "$1.sha256")
  ls -lh "$DEST/$1"
}

if [ "$MODE" = base ] || [ "$MODE" = all ]; then
  s=$STAGE/base; mkdir -p "$s/bin" "$s/lib"
  cd "$OUT/bin"; cp -a whisper-cli whisper-server parakeet-cli diarize-cli sherpa-asr-cli libggml-cpu-*.so "$s/bin/"
  ! [ -e libggml-vulkan.so ] || cp -a libggml-vulkan.so "$s/bin/"
  cd "$OUT/lib"; cp -a libwhisper.so* libggml.so* libggml-base.so* libonnxruntime.so* "$s/lib/"
  pack vowen-engines-linux-x64.tar.gz "$s"
fi

if [ "$MODE" = cuda ] || { [ "$MODE" = all ] && [ -e "$OUT/bin/libggml-cuda.so" ]; }; then
  s=$STAGE/cuda; mkdir -p "$s/bin" "$s/lib"
  cp -a "$OUT/bin/libggml-cuda.so" "$s/bin/"
  needed() { readelf -d "$1" | grep -oE 'lib(cudart|cublasLt|cublas)\.so\.[0-9.]+' || true; }
  copy_needed() {
    for l in $(needed "$1"); do
      [ -e "$s/lib/$l" ] && continue
      src=$(find -L "$CUDA_HOME/lib64" "$CUDA_HOME/targets/x86_64-linux/lib" -maxdepth 1 -name "$l" 2>/dev/null | head -1)
      [ -n "$src" ] || { echo "missing $l under $CUDA_HOME" >&2; exit 1; }
      cp -L "$src" "$s/lib/$l"
    done
  }
  copy_needed "$s/bin/libggml-cuda.so"
  for f in "$s"/lib/libcublas.so.*; do copy_needed "$f"; done   # libcublas -> libcublasLt
  if [ -n "${CI:-}" ]; then   # release builds must not carry machine-specific paths
    rp=$(readelf -d "$s/bin/libggml-cuda.so" | grep -E 'RUNPATH|RPATH' || true)
    case "$rp" in *'$ORIGIN/../lib'*) ;; *) echo "bad RUNPATH: $rp" >&2; exit 1 ;; esac
    case "$rp" in */mnt/*|*/usr/*|*/home/*) echo "machine-specific RUNPATH: $rp" >&2; exit 1 ;; esac
  fi
  pack vowen-engines-cuda-linux-x64.tar.gz "$s"
fi
