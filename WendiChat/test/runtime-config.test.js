"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  DEFAULT_START_TIMEOUT_MS,
  createRuntimeConfig,
  formatDnsServer,
  isLoopbackOrFakeIpDns,
  parsePositiveInteger,
  selectDnsServer
} = require("../src/main/runtime-config");

test("parsePositiveInteger rejects invalid timeout overrides", () => {
  assert.equal(parsePositiveInteger(undefined, 10), 10);
  assert.equal(parsePositiveInteger("45000", 10), 45000);
  assert.equal(parsePositiveInteger("0", 10), 10);
  assert.equal(parsePositiveInteger("-2", 10), 10);
  assert.equal(parsePositiveInteger("invalid", 10), 10);
});

test("formatDnsServer adds the DNS port for discovered IP addresses", () => {
  assert.equal(formatDnsServer("198.18.0.2"), "198.18.0.2:53");
  assert.equal(formatDnsServer("2001:4860:4860::8888"), "[2001:4860:4860::8888]:53");
  assert.equal(formatDnsServer("192.0.2.1:5353"), "192.0.2.1:5353");
});

test("selectDnsServer avoids loopback and Mihomo fake-IP resolvers", () => {
  assert.equal(isLoopbackOrFakeIpDns("127.0.0.1"), true);
  assert.equal(isLoopbackOrFakeIpDns("198.18.0.2"), true);
  assert.equal(isLoopbackOrFakeIpDns("198.19.255.254"), true);
  assert.equal(isLoopbackOrFakeIpDns("192.168.46.36"), false);
  assert.equal(
    selectDnsServer(["127.0.0.1", "198.18.0.2", "192.168.46.36"]),
    "192.168.46.36:53"
  );
  assert.equal(selectDnsServer(["198.18.0.2"]), "198.18.0.2:53");
});

test("createRuntimeConfig resolves production paths without bundling Sandboxie", () => {
  const result = createRuntimeConfig({
    env: { ProgramFiles: "D:\\Programs" },
    isPackaged: true,
    resourcesPath: path.join("D:", "WendiChat", "resources"),
    appPath: path.join("D:", "source", "WendiChat"),
    localAppData: "C:\\Users\\demo\\AppData\\Local",
    dnsServers: ["198.18.0.2", "192.168.46.36"]
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
  assert.equal(result.picoClawDnsServer, "192.168.46.36:53");
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
      WENDI_PICOCLAW_DNS_SERVER: "10.0.0.53:5353",
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
    picoClawDnsServer: "10.0.0.53:5353",
    picoClawConfig: "X:\\config\\pico.json",
    startTimeoutMs: 60000
  });
});
