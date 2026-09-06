import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
test("web server serves app, correct module MIME, HEAD, and refuses traversal", async () => {
  const child = spawn(process.execPath, ["scripts/serve.mjs"], {
    env: { ...process.env, PORT: "0" },
  });
  try {
    const url = await new Promise((resolve, reject) => {
      child.stdout.on("data", (chunk) => {
        const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) resolve(match[0]);
      });
      child.on("error", reject);
      child.on("exit", (code) => reject(new Error(`Server exited ${code}`)));
    });
    const root = await fetch(url);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Your listening library/);
    const js = await fetch(`${url}/static/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type"), /javascript/);
    const head = await fetch(`${url}/static/brand.svg`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal((await fetch(`${url}/%2e%2e%2fpackage.json`)).status, 403);
    assert.equal((await fetch(url, { method: "POST" })).status, 405);
  } finally {
    child.kill();
  }
});
