"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const test = require("node:test");
const {
  IMAGE_FILE_MACHINE_AMD64,
  validateWindowsX64PeBuffer,
  verifyRequiredPayload,
  verifyPayloadManifest
} = require("../scripts/verify-picoclaw-payload");

function createPe(machine = IMAGE_FILE_MACHINE_AMD64) {
  const buffer = Buffer.alloc(128);
  buffer.write("MZ", 0, "ascii");
  buffer.writeUInt32LE(64, 0x3c);
  buffer.write("PE\0\0", 64, "binary");
  buffer.writeUInt16LE(machine, 68);
  return buffer;
}

test("validateWindowsX64PeBuffer accepts an AMD64 PE image", () => {
  assert.doesNotThrow(() => validateWindowsX64PeBuffer(createPe(), "pico.exe"));
});

test("validateWindowsX64PeBuffer rejects non-PE and non-x64 payloads", () => {
  assert.throws(
    () => validateWindowsX64PeBuffer(Buffer.alloc(128), "pico.exe"),
    /DOS MZ header/
  );
  assert.throws(
    () => validateWindowsX64PeBuffer(createPe(0x014c), "pico.exe"),
    /not a Windows x64 executable/
  );
});

test("verifyRequiredPayload checks both PicoClaw executables", () => {
  const visited = [];
  verifyRequiredPayload("C:\\payload", (filePath) => {
    visited.push(path.basename(filePath));
    return createPe();
  });
  assert.deepEqual(visited, ["picoclaw-launcher.exe", "picoclaw.exe"]);
});

test("verifyPayloadManifest validates source and executable hashes", () => {
  const launcher = createPe();
  const core = createPe();
  const digest = (contents) =>
    crypto.createHash("sha256").update(contents).digest("hex");
  const manifest = {
    schema: 1,
    source_repository: "https://github.com/Anywayany/picoclaw",
    source_branch: "wendi-mobile-h5",
    source_commit: "b".repeat(40),
    target: "windows/amd64",
    files: [
      {
        name: "picoclaw-launcher.exe",
        size: launcher.length,
        sha256: digest(launcher)
      },
      {
        name: "picoclaw.exe",
        size: core.length,
        sha256: digest(core)
      }
    ]
  };
  const files = new Map([
    ["payload-manifest.json", JSON.stringify(manifest)],
    ["picoclaw-launcher.exe", launcher],
    ["picoclaw.exe", core]
  ]);

  const result = verifyPayloadManifest("/payload", (filePath) =>
    files.get(path.basename(filePath))
  );

  assert.equal(result.source_commit, "b".repeat(40));
});

test("verifyPayloadManifest rejects a modified executable", () => {
  const payload = Buffer.from("modified");
  const manifest = {
    schema: 1,
    source_repository: "https://github.com/Anywayany/picoclaw",
    source_branch: "wendi-mobile-h5",
    source_commit: "c".repeat(40),
    target: "windows/amd64",
    files: [
      {
        name: "picoclaw-launcher.exe",
        size: payload.length,
        sha256: "0".repeat(64)
      },
      {
        name: "picoclaw.exe",
        size: payload.length,
        sha256: "0".repeat(64)
      }
    ]
  };

  assert.throws(
    () => verifyPayloadManifest("/payload", (filePath) =>
      path.basename(filePath) === "payload-manifest.json"
        ? JSON.stringify(manifest)
        : payload
    ),
    /integrity check failed/
  );
});
