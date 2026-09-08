#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$repo_dir/scripts/test_native_models.mjs"
