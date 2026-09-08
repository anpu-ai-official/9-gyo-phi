#!/usr/bin/env bash
# Builds the optional Apple Silicon engine into a standalone onedir bundle
# under src-tauri/binaries/, which `tauri build` embeds as an app resource
# (see src-tauri/tauri.conf.json `bundle.resources`) and Rust launches on
# startup (see src-tauri/src/lib.rs).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ENGINE_PYTHON:-python3}"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "Skipping engine bundle: the MLX engine only builds on Apple Silicon macOS." >&2
  exit 0
fi

if ! "$PYTHON_BIN" -c "import PyInstaller" >/dev/null 2>&1; then
  echo "PyInstaller (and the engine's own deps) are required to build the bundle." >&2
  echo "Install them, then re-run, e.g.:" >&2
  echo "  $PYTHON_BIN -m pip install -r requirements.txt -r requirements-build.txt" >&2
  echo "Or point ENGINE_PYTHON at a venv that already has them installed." >&2
  exit 1
fi

DIST_DIR="$ROOT_DIR/work/engine-dist"
WORK_DIR="$ROOT_DIR/work/engine-build"
OUT_DIR="$ROOT_DIR/src-tauri/binaries"

rm -rf "$DIST_DIR" "$WORK_DIR"
mkdir -p "$OUT_DIR"

"$PYTHON_BIN" -m PyInstaller \
  --noconfirm \
  --clean \
  --distpath "$DIST_DIR" \
  --workpath "$WORK_DIR" \
  "$ROOT_DIR/engine/build/engine.spec"

# Zipped rather than copied as a raw directory: Tauri's directory-glob
# resource copying flattens nested folders instead of preserving them, which
# breaks the onedir build's `_internal` dependency layout. Rust unpacks this
# zip at runtime instead (see bundled_engine_path in src-tauri/src/lib.rs).
ARCHIVE="$OUT_DIR/9-gyo-phi-engine.zip"
rm -f "$ARCHIVE"
(cd "$DIST_DIR/9-gyo-phi-engine" && zip -r -y -q "$ARCHIVE" .)

echo "Engine bundle ready at $ARCHIVE"
