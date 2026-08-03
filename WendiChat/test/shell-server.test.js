"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { startShellServer } = require("../src/main/shell-server");

const rendererRoot = path.join(__dirname, "..", "src", "renderer");

test("shell server exposes only packaged assets on random loopback HTTP", async () => {
  const shell = await startShellServer(rendererRoot);
  try {
    const indexResponse = await fetch(`${shell.origin}/index.html`);
    assert.equal(indexResponse.status, 200);
    assert.match(indexResponse.headers.get("content-type"), /^text\/html/);
    assert.equal(indexResponse.headers.get("cache-control"), "no-store");
    assert.match(
      indexResponse.headers.get("content-security-policy"),
      /frame-src http:\/\/127\.0\.0\.1:\*/
    );
    assert.match(await indexResponse.text(), /<title>Wendi Chat<\/title>/);

    const missingResponse = await fetch(`${shell.origin}/not-found`);
    assert.equal(missingResponse.status, 404);

    const postResponse = await fetch(`${shell.origin}/`, { method: "POST" });
    assert.equal(postResponse.status, 405);
  } finally {
    await shell.close();
  }
});
