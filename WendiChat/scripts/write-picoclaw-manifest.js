"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  REQUIRED_EXECUTABLES,
  verifyRequiredPayload
} = require("./verify-picoclaw-payload");

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function sha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function createManifest(options) {
  const {
    payloadRoot,
    sourceCommit,
    workspaceTemplateCommit,
    goVersion,
    createdUtc = new Date().toISOString(),
    readFileSync = fs.readFileSync
  } = options;

  if (!COMMIT_PATTERN.test(sourceCommit)) {
    throw new Error("sourceCommit must be a full lowercase Git commit hash.");
  }
  if (!COMMIT_PATTERN.test(workspaceTemplateCommit)) {
    throw new Error(
      "workspaceTemplateCommit must be a full lowercase Git commit hash."
    );
  }

  verifyRequiredPayload(payloadRoot, readFileSync);
  const files = REQUIRED_EXECUTABLES.map((name) => {
    const contents = readFileSync(path.join(payloadRoot, name));
    return {
      name,
      size: contents.length,
      sha256: sha256(contents)
    };
  });

  return {
    schema: 1,
    source_repository: "https://github.com/Anywayany/picoclaw",
    source_branch: "wendi-mobile-h5",
    source_commit: sourceCommit,
    workspace_template_branch: "main",
    workspace_template_commit: workspaceTemplateCommit,
    target: "windows/amd64",
    go_version: goVersion,
    created_utc: createdUtc,
    files
  };
}

if (require.main === module) {
  const [sourceCommit, workspaceTemplateCommit] = process.argv.slice(2);
  const payloadRoot = path.join(__dirname, "..", "resources", "picoclaw");
  const manifest = createManifest({
    payloadRoot,
    sourceCommit,
    workspaceTemplateCommit,
    goVersion: process.env.PICOCLAW_GO_VERSION || "unknown"
  });
  const outputPath = path.join(payloadRoot, "payload-manifest.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote PicoClaw payload manifest: ${outputPath}`);
}

module.exports = {
  COMMIT_PATTERN,
  createManifest,
  sha256
};
