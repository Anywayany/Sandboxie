"use strict";

const path = require("node:path");

const DEFAULT_SANDBOX_NAME = "PicoClawBox";
const DEFAULT_START_TIMEOUT_MS = 30000;

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createRuntimeConfig(options) {
  const {
    env,
    isPackaged,
    resourcesPath,
    appPath,
    localAppData
  } = options;

  const programFiles = env.ProgramFiles || env.PROGRAMFILES || "C:\\Program Files";
  const defaultPicoClawRoot = isPackaged
    ? path.win32.join(resourcesPath, "picoclaw")
    : path.join(appPath, "resources", "picoclaw");
  const picoClawHome = env.WENDI_PICOCLAW_HOME ||
    path.win32.join(localAppData, "WendiChat", "PicoClaw");

  return Object.freeze({
    sandboxName: env.WENDI_SANDBOX_NAME || DEFAULT_SANDBOX_NAME,
    startExe: env.WENDI_SANDBOXIE_START ||
      path.win32.join(programFiles, "Wendi", "LightSandboxie", "Start.exe"),
    launcherExe: env.WENDI_PICOCLAW_LAUNCHER ||
      path.join(defaultPicoClawRoot, "picoclaw-launcher.exe"),
    picoClawHome,
    picoClawConfig: env.WENDI_PICOCLAW_CONFIG ||
      path.win32.join(picoClawHome, "config.json"),
    startTimeoutMs: parsePositiveInteger(
      env.WENDI_PICOCLAW_START_TIMEOUT_MS,
      DEFAULT_START_TIMEOUT_MS
    )
  });
}

module.exports = {
  DEFAULT_SANDBOX_NAME,
  DEFAULT_START_TIMEOUT_MS,
  createRuntimeConfig,
  parsePositiveInteger
};
