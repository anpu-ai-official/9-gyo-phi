#!/usr/bin/env bash
# Build the pinned native llama.cpp speech-preparation sidecar on macOS or Linux.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/work/llama.cpp"
OUTPUT_DIR="$ROOT_DIR/src-tauri/binaries"
LLAMA_COMMIT="9113cc1880763bf590774490f51a661bf22403a4"
TARGET_ARCH="${NATIVE_TARGET_ARCH:-$(uname -m)}"

if command -v ninja >/dev/null 2>&1; then
  BUILD_DIR="$ROOT_DIR/work/llama-build-${TARGET_ARCH}-ninja"
  CMAKE_GENERATOR=(-G Ninja)
else
  BUILD_DIR="$ROOT_DIR/work/llama-build-${TARGET_ARCH}"
  CMAKE_GENERATOR=()
fi

HOST_OS="$(uname -s)"
case "$HOST_OS:$TARGET_ARCH" in
  Darwin:arm64) TARGET_TRIPLE="aarch64-apple-darwin" ;;
  Darwin:x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
  Linux:x86_64) TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
  Linux:aarch64|Linux:arm64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
  *)
    echo "Unsupported native engine build host: $HOST_OS $TARGET_ARCH" >&2
    exit 1
    ;;
esac

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  git clone --filter=blob:none https://github.com/ggml-org/llama.cpp.git "$SOURCE_DIR"
fi

git -C "$SOURCE_DIR" fetch --depth 1 origin "$LLAMA_COMMIT"
git -C "$SOURCE_DIR" checkout --detach "$LLAMA_COMMIT"
PLATFORM_FLAGS=(-DGGML_NATIVE=OFF -DGGML_OPENMP=OFF)
if [[ "$HOST_OS" == "Darwin" ]]; then
  PLATFORM_FLAGS+=("-DCMAKE_OSX_ARCHITECTURES=$TARGET_ARCH")
fi
if [[ "$HOST_OS:$TARGET_ARCH" == "Darwin:arm64" ]]; then
  PLATFORM_FLAGS+=(-DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON)
else
  PLATFORM_FLAGS+=(-DGGML_METAL=OFF)
fi

cmake "${CMAKE_GENERATOR[@]}" -S "$SOURCE_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  "${PLATFORM_FLAGS[@]}" \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_APP=OFF \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_OPENSSL=OFF \
  -DBUILD_SHARED_LIBS=OFF
cmake --build "$BUILD_DIR" --config Release --target llama-server -j
mkdir -p "$OUTPUT_DIR"
cp "$BUILD_DIR/bin/llama-server" \
  "$OUTPUT_DIR/llama-server-$TARGET_TRIPLE"
if [[ "$HOST_OS" == "Darwin" ]]; then
  strip -x "$OUTPUT_DIR/llama-server-$TARGET_TRIPLE"
elif command -v strip >/dev/null 2>&1; then
  strip "$OUTPUT_DIR/llama-server-$TARGET_TRIPLE"
fi
echo "Native engine ready at $OUTPUT_DIR/llama-server-$TARGET_TRIPLE"
