#!/usr/bin/env bash
# Build whisper.cpp v1.8.6 whisper-server + whisper-cli with runtime-loadable backends
# (CPU variants always, CUDA / Vulkan when the toolchain is found) into $OUT/{bin,lib}.
#
# Env overrides:
#   BUILD_ROOT  scratch + output root          (default /mnt/linux-data/vowen-build)
#   SRC         whisper.cpp checkout           (default $BUILD_ROOT/whisper.cpp, cloned at v1.8.6)
#   OUT         install root = app resources/  (default $BUILD_ROOT/resources)
#   CUDA_HOME   CUDA toolkit                   (default /mnt/linux-data/cuda-13.0, then /usr/local/cuda)
#   CUDA_ARCHS  default "75;80;86;89;120"      (CUDA 13 dropped sm_61 = GTX 10xx; use the Vulkan backend there)
#   GLSLC       path to glslc for Vulkan       (default: glslc in PATH or $BUILD_ROOT/tools/vulkan-sdk/*/x86_64/bin)
#                                              no glslc => no Vulkan backend (Ubuntu: sudo apt install glslc)
set -euo pipefail

BUILD_ROOT=${BUILD_ROOT:-/mnt/linux-data/vowen-build}
SRC=${SRC:-$BUILD_ROOT/whisper.cpp}
OUT=${OUT:-$BUILD_ROOT/resources}
CUDA_ARCHS=${CUDA_ARCHS:-75;80;86;89;120}
BUILD=$SRC/build-vowen

[ -d "$SRC/.git" ] || [ -f "$SRC/CMakeLists.txt" ] || \
  git clone --branch v1.8.6 --depth 1 https://github.com/ggml-org/whisper.cpp "$SRC"

args=(-G Ninja -B "$BUILD" -S "$SRC" -DCMAKE_BUILD_TYPE=Release
  -DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DGGML_NATIVE=OFF
  -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_SDL2=OFF
  -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON)
# The app only puts resources/lib on LD_LIBRARY_PATH, so libggml-cuda.so must find libcudart/libcublas by RUNPATH.
RPATH='$ORIGIN/../lib:$ORIGIN'

# CUDA (optional)
CUDA_HOME=${CUDA_HOME:-/mnt/linux-data/cuda-13.0}
[ -x "$CUDA_HOME/bin/nvcc" ] || CUDA_HOME=/usr/local/cuda
if [ -x "$CUDA_HOME/bin/nvcc" ]; then
  export PATH=$CUDA_HOME/bin:$PATH
  # glibc >= 2.41 declares rsqrt/rsqrtf noexcept, CUDA 13.0's math_functions.h does not -> nvcc errors out.
  # Known upstream fix: add the exception spec to the toolkit header (idempotent, backup kept).
  H=$(dirname "$(dirname "$(command -v nvcc)")")/targets/x86_64-linux/include/crt/math_functions.h
  if [ -w "$H" ] && grep -qE 'rsqrtf?\((double|float) x\);' "$H"; then
    cp -n "$H" "$H.orig"; sed -i -E 's/(rsqrtf?\((double|float) x\));/\1 noexcept(true);/' "$H"
  fi
  # nvcc 13.0 accepts gcc 15; if your host gcc is newer, set CUDAHOSTCXX=g++-NN or add -allow-unsupported-compiler
  RPATH+=":$CUDA_HOME/lib64:/usr/local/cuda/lib64"
  args+=(-DGGML_CUDA=ON "-DCMAKE_CUDA_ARCHITECTURES=$CUDA_ARCHS" "-DCMAKE_CUDA_COMPILER=$CUDA_HOME/bin/nvcc")
  [ -z "${CUDAHOSTCXX:-}" ] || args+=("-DCMAKE_CUDA_HOST_COMPILER=$CUDAHOSTCXX")
else echo "no CUDA toolkit found: building without CUDA backend"; fi

# Vulkan (optional, needs glslc + libvulkan-dev)
GLSLC=${GLSLC:-$(command -v glslc || ls "$BUILD_ROOT"/tools/vulkan-sdk/*/x86_64/bin/glslc 2>/dev/null | head -1 || true)}
if [ -n "$GLSLC" ] && [ -f /usr/include/vulkan/vulkan.h ]; then
  # ggml-vulkan needs SPIRV-Headers' cmake config (apt: spirv-headers); fetch + install user-locally if absent
  SPV=$BUILD_ROOT/tools/spirv-headers
  if ! ls /usr/share/cmake*/SPIRV-Headers* /usr/lib/cmake/SPIRV-Headers* >/dev/null 2>&1 && [ ! -d "$SPV" ]; then
    git clone --depth 1 https://github.com/KhronosGroup/SPIRV-Headers "$SPV.src"
    cmake -S "$SPV.src" -B "$SPV.src/build" -DCMAKE_INSTALL_PREFIX="$SPV" >/dev/null && cmake --install "$SPV.src/build" >/dev/null
  fi
  [ ! -d "$SPV" ] || args+=("-DCMAKE_PREFIX_PATH=$SPV" "-DCMAKE_CXX_FLAGS=-I$SPV/include")
  args+=(-DGGML_VULKAN=ON "-DVulkan_GLSLC_EXECUTABLE=$GLSLC")
else echo "no glslc / libvulkan-dev: building without Vulkan backend (sudo apt install glslc libvulkan-dev)"; fi

cmake "${args[@]}" "-DCMAKE_INSTALL_RPATH=$RPATH"
cmake --build "$BUILD" -j"$(nproc)" --target whisper-server whisper-cli

# Layout (mirrors the Windows resources): bin/ = executables + backend plugins (ggml searches the exe dir),
# lib/ = shared libs + backend plugins. Executables have RPATH $ORIGIN/../lib.
rm -f "$OUT"/bin/whisper-* "$OUT"/bin/libggml* "$OUT"/lib/libggml* "$OUT"/lib/libwhisper*; mkdir -p "$OUT/bin" "$OUT/lib"
cp -a "$BUILD"/bin/whisper-server "$BUILD"/bin/whisper-cli "$OUT/bin/"
find "$BUILD" -name '*.so*' -not -path '*/CMakeFiles/*' -exec cp -a {} "$OUT/lib/" \;
cp -a "$OUT"/lib/libggml-{cpu-,cuda,vulkan}*.so "$OUT/bin/" 2>/dev/null || true
strip --strip-unneeded "$OUT"/bin/whisper-* "$OUT"/lib/*.so* 2>/dev/null || true
echo "installed to $OUT"; ls "$OUT/bin" "$OUT/lib"
