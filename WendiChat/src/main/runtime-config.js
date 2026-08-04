"use strict";

const net = require("node:net");
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

function formatDnsServer(server) {
  const normalized = String(server || "").trim();
  if (!normalized) {
    return "";
  }
  if (net.isIP(normalized) === 6) {
    return `[${normalized}]:53`;
  }
  if (net.isIP(normalized) === 4) {
    return `${normalized}:53`;
  }
  return normalized;
}

function isLoopbackOrFakeIpDns(server) {
  const normalized = String(server || "").trim();
  const family = net.isIP(normalized);

  if (family === 6) {
    return normalized === "::1";
  }
  if (family !== 4) {
    return false;
  }

  const octets = normalized.split(".").map(Number);
  return octets[0] === 127 ||
    (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19));
}

function selectDnsServer(servers) {
  const normalized = Array.isArray(servers) ? servers : [];
  const preferred = normalized.find((server) =>
    net.isIP(String(server || "").trim()) !== 0 &&
      !isLoopbackOrFakeIpDns(server)
  );
  const fallback = preferred || normalized.find((server) =>
    net.isIP(String(server || "").trim()) !== 0
  );
  return formatDnsServer(fallback);
}

function createRuntimeConfig(options) {
  const {
    env,
    isPackaged,
    resourcesPath,
    appPath,
    localAppData,
    dnsServers = []
  } = options;

  const programFiles = env.ProgramFiles || env.PROGRAMFILES || "C:\\Program Files";
  const defaultPicoClawRoot = isPackaged
    ? path.win32.join(resourcesPath, "picoclaw")
    : path.join(appPath, "resources", "picoclaw");
  const picoClawHome = env.WENDI_PICOCLAW_HOME ||
    path.win32.join(localAppData, "WendiChat", "PicoClaw");
  const picoClawDnsServer = env.WENDI_PICOCLAW_DNS_SERVER ||
    env.PICOCLAW_DNS_SERVER || selectDnsServer(dnsServers);

  return Object.freeze({
    sandboxName: env.WENDI_SANDBOX_NAME || DEFAULT_SANDBOX_NAME,
    startExe: env.WENDI_SANDBOXIE_START ||
      path.win32.join(programFiles, "Wendi", "LightSandboxie", "Start.exe"),
    launcherExe: env.WENDI_PICOCLAW_LAUNCHER ||
      path.join(defaultPicoClawRoot, "picoclaw-launcher.exe"),
    picoClawHome,
    picoClawDnsServer,
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
  formatDnsServer,
  isLoopbackOrFakeIpDns,
  parsePositiveInteger,
  selectDnsServer
};
