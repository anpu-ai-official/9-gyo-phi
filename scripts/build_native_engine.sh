#!/usr/bin/env bash
# Build the pinned native llama.cpp speech-preparation sidecar on macOS or Linux.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/work/llama.cpp"
OUTPUT_DIR="$ROOT_DIR/src-tauri/binaries"
LLAMA_COMMIT="9113cc1880763bf590774490f51a661bf22403a4"
TARGET_ARCH="${NATIVE_TARGET_ARCH:-$(uname -m)}"

if command -v ninja >/dev/null 2>&1; then
  CMAKE_GENERATOR=(-G Ninja)
else
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
mkdir -p "$OUTPUT_DIR"

build_backend() {
  local backend="$1"
  local output_suffix="$2"
  shift 2
  local generator_suffix=""
  if (( ${#CMAKE_GENERATOR[@]} )); then
    generator_suffix="-ninja"
  fi
  local build_dir="$ROOT_DIR/work/llama-build-${TARGET_ARCH}-${backend}${generator_suffix}"
  local platform_flags=(-DGGML_NATIVE=OFF -DGGML_OPENMP=OFF)
  if [[ "$HOST_OS" == "Darwin" ]]; then
    platform_flags+=("-DCMAKE_OSX_ARCHITECTURES=$TARGET_ARCH")
  fi

  cmake "${CMAKE_GENERATOR[@]}" -S "$SOURCE_DIR" -B "$build_dir" \
    -DCMAKE_BUILD_TYPE=Release \
    "${platform_flags[@]}" \
    "$@" \
    -DLLAMA_BUILD_SERVER=ON \
    -DLLAMA_BUILD_TESTS=OFF \
    -DLLAMA_BUILD_EXAMPLES=OFF \
    -DLLAMA_BUILD_APP=OFF \
    -DLLAMA_BUILD_UI=OFF \
    -DLLAMA_USE_PREBUILT_UI=OFF \
    -DLLAMA_OPENSSL=OFF \
    -DBUILD_SHARED_LIBS=OFF
  cmake --build "$build_dir" --config Release --target llama-server -j
  local destination="$OUTPUT_DIR/llama-server-$TARGET_TRIPLE$output_suffix"
  cp "$build_dir/bin/llama-server" "$destination"
  if [[ "$HOST_OS" == "Darwin" ]]; then
    strip -x "$destination"
  elif command -v strip >/dev/null 2>&1; then
    strip "$destination"
  fi
  echo "$backend engine ready at $destination"
}

if [[ "$HOST_OS" == "Darwin" ]]; then
  # Metal is available through the operating system and llama.cpp retains its
  # CPU backend, so one binary can accelerate or fall back at runtime.
  build_backend metal "" -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON
else
  # Keep an independent CPU executable so a missing or broken Vulkan loader
  # can never prevent local narration.
  build_backend cpu "" -DGGML_METAL=OFF -DGGML_VULKAN=OFF
  build_backend vulkan "-vulkan" -DGGML_METAL=OFF -DGGML_VULKAN=ON
fi
