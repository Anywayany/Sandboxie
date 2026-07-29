"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const IMAGE_FILE_MACHINE_AMD64 = 0x8664;
const REQUIRED_EXECUTABLES = Object.freeze([
  "picoclaw-launcher.exe",
  "picoclaw.exe"
]);
const EXPECTED_REPOSITORY = "https://github.com/Anywayany/picoclaw";
const EXPECTED_BRANCH = "wendi-mobile-h5";

function validateWindowsX64PeBuffer(buffer, label) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) {
    throw new Error(`${label} is empty or too small to be a Windows executable.`);
  }
  if (buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    throw new Error(`${label} does not have a DOS MZ header.`);
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset < 64 || peOffset + 6 > buffer.length) {
    throw new Error(`${label} has an invalid PE header offset.`);
  }
  if (
    buffer[peOffset] !== 0x50 ||
    buffer[peOffset + 1] !== 0x45 ||
    buffer[peOffset + 2] !== 0 ||
    buffer[peOffset + 3] !== 0
  ) {
    throw new Error(`${label} does not have a valid PE signature.`);
  }

  const machine = buffer.readUInt16LE(peOffset + 4);
  if (machine !== IMAGE_FILE_MACHINE_AMD64) {
    throw new Error(`${label} is not a Windows x64 executable.`);
  }
}

function verifyRequiredPayload(root, readFileSync = fs.readFileSync) {
  for (const executable of REQUIRED_EXECUTABLES) {
    const filePath = path.join(root, executable);
    let contents;
    try {
      contents = readFileSync(filePath);
    } catch (error) {
      throw new Error(`Required PicoClaw payload is missing: ${filePath}`, {
        cause: error
      });
    }
    validateWindowsX64PeBuffer(contents, executable);
  }
}

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function verifyPayloadManifest(root, readFileSync = fs.readFileSync) {
  const manifestPath = path.join(root, "payload-manifest.json");
  let manifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid PicoClaw payload manifest: ${error.message}`, {
      cause: error
    });
  }

  if (manifest.schema !== 1) {
    throw new Error("Unsupported PicoClaw payload manifest schema.");
  }
  if (
    manifest.source_repository !== EXPECTED_REPOSITORY ||
    manifest.source_branch !== EXPECTED_BRANCH ||
    !/^[0-9a-f]{40}$/.test(manifest.source_commit || "")
  ) {
    throw new Error("Unexpected PicoClaw source provenance.");
  }
  if (manifest.target !== "windows/amd64") {
    throw new Error("PicoClaw payload target must be windows/amd64.");
  }

  const entries = new Map(
    (Array.isArray(manifest.files) ? manifest.files : []).map((entry) => [
      entry.name,
      entry
    ])
  );
  for (const executable of REQUIRED_EXECUTABLES) {
    const entry = entries.get(executable);
    if (
      !entry ||
      !Number.isSafeInteger(entry.size) ||
      !/^[0-9a-f]{64}$/.test(entry.sha256 || "")
    ) {
      throw new Error(`Invalid manifest entry for ${executable}.`);
    }

    const contents = readFileSync(path.join(root, executable));
    if (
      contents.length !== entry.size ||
      sha256(contents) !== entry.sha256
    ) {
      throw new Error(
        `PicoClaw payload integrity check failed for ${executable}.`
      );
    }
  }

  return manifest;
}

if (require.main === module) {
  const payloadRoot = path.join(__dirname, "..", "resources", "picoclaw");
  verifyRequiredPayload(payloadRoot);
  const manifest = verifyPayloadManifest(payloadRoot);
  console.log(
    `PicoClaw Windows x64 payload validation passed (${manifest.source_commit}).`
  );
}

module.exports = {
  IMAGE_FILE_MACHINE_AMD64,
  REQUIRED_EXECUTABLES,
  validateWindowsX64PeBuffer,
  verifyRequiredPayload,
  verifyPayloadManifest
};
