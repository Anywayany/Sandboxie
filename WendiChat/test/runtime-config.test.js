"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  DEFAULT_START_TIMEOUT_MS,
  createRuntimeConfig,
  parsePositiveInteger
} = require("../src/main/runtime-config");

test("parsePositiveInteger rejects invalid timeout overrides", () => {
  assert.equal(parsePositiveInteger(undefined, 10), 10);
  assert.equal(parsePositiveInteger("45000", 10), 45000);
  assert.equal(parsePositiveInteger("0", 10), 10);
  assert.equal(parsePositiveInteger("-2", 10), 10);
  assert.equal(parsePositiveInteger("invalid", 10), 10);
});

test("createRuntimeConfig resolves production paths without bundling Sandboxie", () => {
  const result = createRuntimeConfig({
    env: { ProgramFiles: "D:\\Programs" },
    isPackaged: true,
    resourcesPath: path.join("D:", "WendiChat", "resources"),
    appPath: path.join("D:", "source", "WendiChat"),
    localAppData: "C:\\Users\\demo\\AppData\\Local"
  });

  assert.equal(
    result.startExe,
    "D:\\Programs\\Wendi\\LightSandboxie\\Start.exe"
  );
  assert.equal(
    result.picoClawConfig,
    "C:\\Users\\demo\\AppData\\Local\\WendiChat\\PicoClaw\\config.json"
  );
  assert.equal(
    result.picoClawHome,
    "C:\\Users\\demo\\AppData\\Local\\WendiChat\\PicoClaw"
  );
  assert.match(result.launcherExe, /resources[/\\]picoclaw[/\\]picoclaw-launcher\.exe$/);
  assert.equal(result.startTimeoutMs, DEFAULT_START_TIMEOUT_MS);
});

test("createRuntimeConfig accepts managed deployment overrides", () => {
  const result = createRuntimeConfig({
    env: {
      WENDI_SANDBOX_NAME: "ManagedPico",
      WENDI_SANDBOXIE_START: "X:\\core\\Start.exe",
      WENDI_PICOCLAW_LAUNCHER: "X:\\pico\\launcher.exe",
      WENDI_PICOCLAW_HOME: "X:\\pico-home",
      WENDI_PICOCLAW_CONFIG: "X:\\config\\pico.json",
      WENDI_PICOCLAW_START_TIMEOUT_MS: "60000"
    },
    isPackaged: false,
    resourcesPath: "/unused",
    appPath: "/workspace/WendiChat",
    localAppData: "C:\\Local"
  });

  assert.deepEqual(result, {
    sandboxName: "ManagedPico",
    startExe: "X:\\core\\Start.exe",
    launcherExe: "X:\\pico\\launcher.exe",
    picoClawHome: "X:\\pico-home",
    picoClawConfig: "X:\\config\\pico.json",
    startTimeoutMs: 60000
  });
});
