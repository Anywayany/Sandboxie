"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  IMAGE_FILE_MACHINE_AMD64
} = require("../scripts/verify-picoclaw-payload");
const {
  createManifest,
  sha256
} = require("../scripts/write-picoclaw-manifest");

function createPe(seed) {
  const buffer = Buffer.alloc(128, seed);
  buffer.write("MZ", 0, "ascii");
  buffer.writeUInt32LE(64, 0x3c);
  buffer.write("PE\0\0", 64, "binary");
  buffer.writeUInt16LE(IMAGE_FILE_MACHINE_AMD64, 68);
  return buffer;
}

test("createManifest records reproducible payload provenance and hashes", () => {
  const launcher = createPe(1);
  const core = createPe(2);
  const files = new Map([
    ["picoclaw-launcher.exe", launcher],
    ["picoclaw.exe", core]
  ]);
  const manifest = createManifest({
    payloadRoot: "/payload",
    sourceCommit: "b".repeat(40),
    workspaceTemplateCommit: "5".repeat(40),
    goVersion: "go1.26.1",
    localPatches: [
      "windows-native-dns.patch",
      "websocket-idle-recovery.patch"
    ],
    createdUtc: "2026-07-29T00:00:00.000Z",
    readFileSync: (filePath) => files.get(path.basename(filePath))
  });

  assert.equal(manifest.target, "windows/amd64");
  assert.equal(manifest.source_branch, "wendi-mobile-h5");
  assert.deepEqual(manifest.local_patches, [
    "windows-native-dns.patch",
    "websocket-idle-recovery.patch"
  ]);
  assert.equal(manifest.files[0].sha256, sha256(launcher));
  assert.equal(manifest.files[1].sha256, sha256(core));
});

test("createManifest rejects abbreviated source commits", () => {
  assert.throws(
    () => createManifest({
      payloadRoot: "/payload",
      sourceCommit: "bc2d8ac",
      workspaceTemplateCommit: "5".repeat(40),
      goVersion: "go1.26.1"
    }),
    /sourceCommit must be a full/
  );
});
