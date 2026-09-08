import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = {
  "darwin-arm64": "llama-server-aarch64-apple-darwin",
  "darwin-x64": "llama-server-x86_64-apple-darwin",
  "win32-x64": "llama-server-x86_64-pc-windows-msvc.exe",
  "linux-x64": "llama-server-x86_64-unknown-linux-gnu",
  "linux-arm64": "llama-server-aarch64-unknown-linux-gnu",
};
const name = names[`${process.platform}-${process.arch}`];
if (!name)
  throw new Error(
    `Unsupported CI fixture target: ${process.platform}-${process.arch}`,
  );
const directory = path.join(root, "src-tauri", "binaries");
const destination = path.join(directory, name);
mkdirSync(directory, { recursive: true });
if (!existsSync(destination)) {
  writeFileSync(
    destination,
    process.platform === "win32" ? "" : "#!/bin/sh\nexit 1\n",
  );
  if (process.platform !== "win32") chmodSync(destination, 0o755);
}
