"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createWindowWebPreferences
} = require("../src/main/window-options");

test("window preferences keep the sandboxed agent responsive in background", () => {
  const preferences = createWindowWebPreferences("C:\\app\\preload.js");

  assert.equal(preferences.preload, "C:\\app\\preload.js");
  assert.equal(preferences.backgroundThrottling, false);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.webSecurity, true);
  assert.equal(preferences.allowRunningInsecureContent, false);
  assert.equal(preferences.navigateOnDragDrop, false);
  assert.equal(preferences.partition, "persist:wendi-chat");
});
