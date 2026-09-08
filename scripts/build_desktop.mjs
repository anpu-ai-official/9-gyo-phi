import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config =
  process.platform === "win32"
    ? "src-tauri/tauri.windows.conf.json"
    : process.platform === "linux"
      ? "src-tauri/tauri.linux.conf.json"
      : process.arch === "x64"
        ? "src-tauri/tauri.macos-x64.conf.json"
        : "src-tauri/tauri.macos-arm64.conf.json";
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["tauri", "build", "--config", config], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
