#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
kokoro_model="${KOKORO_MODEL_PATH:-$repo_dir/work/kokoro-model.onnx}"
kokoro_url="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx"
kokoro_sha="fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"

if [[ ! -f "$kokoro_model" ]]; then
  mkdir -p "$(dirname "$kokoro_model")"
  curl -fL --retry 3 "$kokoro_url" -o "${kokoro_model}.part"
  actual="$(shasum -a 256 "${kokoro_model}.part" | awk '{print $1}')"
  [[ "$actual" == "$kokoro_sha" ]] || {
    printf 'Kokoro model integrity check failed.\n' >&2
    exit 1
  }
  mv "${kokoro_model}.part" "$kokoro_model"
fi

if ! curl -fsS --max-time 2 http://127.0.0.1:8765/health >/dev/null 2>&1; then
  llama_model="${NATIVE_LLM_MODEL_PATH:-${HOME}/Library/Application Support/com.ninegyophi.app/models/qwen2.5-coder-3b-instruct-q4_k_m.gguf}"
  llama_server="$repo_dir/src-tauri/binaries/llama-server-aarch64-apple-darwin"
  [[ -x "$llama_server" && -f "$llama_model" ]] || {
    printf 'Install Qwen from Local model settings or set NATIVE_LLM_MODEL_PATH.\n' >&2
    exit 1
  }
  "$llama_server" --model "$llama_model" --host 127.0.0.1 --port 8765 --ctx-size 4096 --n-gpu-layers 99 --jinja --no-webui >/dev/null 2>&1 &
  server_pid=$!
  trap 'kill "$server_pid" 2>/dev/null || true' EXIT
  for _ in {1..120}; do
    curl -fsS --max-time 1 http://127.0.0.1:8765/health >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS --max-time 2 http://127.0.0.1:8765/health >/dev/null 2>&1 || {
    printf 'The native Qwen server did not become ready.\n' >&2
    exit 1
  }
fi

RUN_NATIVE_MODEL_TESTS=1 node --test "$repo_dir/tests/native"/*.test.mjs
KOKORO_ORT_PROVIDER=cpu \
KOKORO_MODEL_PATH="$kokoro_model" \
KOKORO_VOICES_PATH="$repo_dir/src/static/voices" \
cargo test --manifest-path "$repo_dir/src-tauri/Cargo.toml" real_kokoro_model_generates_non_silent_audio -- --ignored --nocapture
