import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kokoroModel =
  process.env.KOKORO_MODEL_PATH || path.join(root, "work", "kokoro-model.onnx");
const kokoroUrl =
  "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx";
const kokoroSha =
  "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478";

function targetBinary() {
  const targets = {
    "darwin-arm64": "llama-server-aarch64-apple-darwin",
    "darwin-x64": "llama-server-x86_64-apple-darwin",
    "win32-x64": "llama-server-x86_64-pc-windows-msvc.exe",
    "linux-x64": "llama-server-x86_64-unknown-linux-gnu",
    "linux-arm64": "llama-server-aarch64-unknown-linux-gnu",
  };
  return targets[`${process.platform}-${process.arch}`];
}

function defaultLlmPath() {
  const base =
    process.platform === "darwin"
      ? path.join(homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? process.env.APPDATA || path.join(homedir(), "AppData", "Roaming")
        : process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share");
  return path.join(
    base,
    "com.ninegyophi.app",
    "models",
    "qwen2.5-coder-3b-instruct-q4_k_m.gguf",
  );
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadVerified(url, destination, expected) {
  if (existsSync(destination) && (await sha256(destination)) === expected)
    return;
  await mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.part`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body)
    throw new Error(`Model download failed with HTTP ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  const actual = await sha256(partial);
  if (actual !== expected)
    throw new Error(
      `Model integrity check failed: expected ${expected}, got ${actual}.`,
    );
  renameSync(partial, destination);
}

async function serverReady() {
  try {
    const response = await fetch("http://127.0.0.1:8765/health", {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await serverReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("The native Qwen server did not become ready.");
}

function run(command, args, environment = {}) {
  const executable =
    process.platform === "win32" && command === "cargo" ? "cargo.exe" : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await downloadVerified(kokoroUrl, kokoroModel, kokoroSha);
let server;
if (!(await serverReady())) {
  const name = targetBinary();
  const model = process.env.NATIVE_LLM_MODEL_PATH || defaultLlmPath();
  const executable = name && path.join(root, "src-tauri", "binaries", name);
  if (!executable || !existsSync(executable) || !existsSync(model))
    throw new Error(
      "Build the native engine and install Qwen from Local model settings, or set NATIVE_LLM_MODEL_PATH.",
    );
  const args = [
    "--model",
    model,
    "--host",
    "127.0.0.1",
    "--port",
    "8765",
    "--ctx-size",
    "4096",
    "--jinja",
    "--no-webui",
  ];
  if (process.platform === "darwin" && process.arch === "arm64")
    args.push("--n-gpu-layers", "99");
  server = spawn(executable, args, { cwd: root, stdio: "ignore" });
  await waitForServer();
}

try {
  run(
    process.execPath,
    ["--test", path.join(root, "tests", "native", "speech-model.test.mjs")],
    {
      RUN_NATIVE_MODEL_TESTS: "1",
    },
  );
  run(
    "cargo",
    [
      "test",
      "--locked",
      "--manifest-path",
      path.join(root, "src-tauri", "Cargo.toml"),
      "real_kokoro_model_generates_non_silent_audio",
      "--",
      "--ignored",
      "--nocapture",
    ],
    {
      KOKORO_ORT_PROVIDER: "cpu",
      KOKORO_MODEL_PATH: kokoroModel,
      KOKORO_VOICES_PATH: path.join(root, "src", "static", "voices"),
    },
  );
} finally {
  if (server && !server.killed) server.kill();
}
