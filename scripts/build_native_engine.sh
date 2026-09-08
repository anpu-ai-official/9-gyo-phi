#!/usr/bin/env bash
# Build the small native llama.cpp speech-preparation sidecar for Apple Silicon.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/work/llama.cpp"
BUILD_DIR="$ROOT_DIR/work/llama-build"
OUTPUT_DIR="$ROOT_DIR/src-tauri/binaries"
LLAMA_COMMIT="9113cc1880763bf590774490f51a661bf22403a4"
TARGET_ARCH="${NATIVE_TARGET_ARCH:-$(uname -m)}"

if [[ "$(uname -s)" != "Darwin" || "$TARGET_ARCH" != "arm64" ]]; then
  echo "Skipping native model engine: this build target is Apple Silicon macOS." >&2
  exit 0
fi

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  git clone --filter=blob:none https://github.com/ggml-org/llama.cpp.git "$SOURCE_DIR"
fi

git -C "$SOURCE_DIR" fetch --depth 1 origin "$LLAMA_COMMIT"
git -C "$SOURCE_DIR" checkout --detach "$LLAMA_COMMIT"
cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="$TARGET_ARCH" \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DBUILD_SHARED_LIBS=OFF
cmake --build "$BUILD_DIR" --config Release --target llama-server -j
mkdir -p "$OUTPUT_DIR"
cp "$BUILD_DIR/bin/llama-server" \
  "$OUTPUT_DIR/llama-server-aarch64-apple-darwin"
strip -x "$OUTPUT_DIR/llama-server-aarch64-apple-darwin"
echo "Native engine ready at $OUTPUT_DIR/llama-server-aarch64-apple-darwin"
