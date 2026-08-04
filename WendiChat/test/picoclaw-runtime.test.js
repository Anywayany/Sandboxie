"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const test = require("node:test");
const {
  LOOPBACK_HOST,
  PicoClawRuntime,
  buildLaunchArguments,
  buildTerminateArguments,
  getAvailablePort,
  waitForHttpReady
} = require("../src/main/picoclaw-runtime");

const config = Object.freeze({
  sandboxName: "PicoClawBox",
  startExe: "C:\\Program Files\\Wendi\\LightSandboxie\\Start.exe",
  launcherExe: "C:\\Users\\demo\\AppData\\Local\\Programs\\Wendi Chat\\resources\\picoclaw\\picoclaw-launcher.exe",
  picoClawHome: "C:\\Users\\demo\\AppData\\Local\\WendiChat\\PicoClaw",
  picoClawDnsServer: "198.18.0.2:53",
  picoClawConfig: "C:\\Users\\demo\\AppData\\Local\\WendiChat\\PicoClaw\\config.json",
  startTimeoutMs: 12000
});

function createChild(eventName) {
  const child = new EventEmitter();
  child.kill = () => {};
  queueMicrotask(() => child.emit(eventName));
  return child;
}

test("buildLaunchArguments keeps PicoClaw on loopback inside the fixed box", () => {
  assert.deepEqual(buildLaunchArguments(config, 28431), [
    "/box:PicoClawBox",
    "/silent",
    "/hide_window",
    config.launcherExe,
    "-host",
    LOOPBACK_HOST,
    "-port",
    "28431",
    "-no-browser",
    "-console",
    config.picoClawConfig
  ]);
  assert.deepEqual(buildTerminateArguments(config), [
    "/box:PicoClawBox",
    "/silent",
    "/terminate"
  ]);
});

test("getAvailablePort allocates a usable loopback port", async () => {
  const port = await getAvailablePort();
  assert.ok(port > 0 && port <= 65535);

  await new Promise((resolve, reject) => {
    const server = http.createServer((_request, response) => response.end("ok"));
    server.once("error", reject);
    server.listen(port, LOOPBACK_HOST, () => server.close(resolve));
  });
});

test("waitForHttpReady accepts the public auth status endpoint", async () => {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "/api/auth/status");
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"authenticated":false,"initialized":true}');
  });
  await new Promise((resolve) => server.listen(0, LOOPBACK_HOST, resolve));
  const address = server.address();

  try {
    await waitForHttpReady(
      `http://${LOOPBACK_HOST}:${address.port}/api/auth/status`,
      { timeoutMs: 2000, intervalMs: 20 }
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("waitForHttpReady reports a deterministic timeout", async () => {
  let clock = 0;
  await assert.rejects(
    waitForHttpReady("http://127.0.0.1:1/api/auth/status", {
      timeoutMs: 30,
      intervalMs: 10,
      probe: async () => false,
      now: () => clock,
      delay: async (duration) => {
        clock += duration;
      }
    }),
    /did not become ready within 30 ms/
  );
});

test("PicoClawRuntime starts Start.exe and publishes the desktop URL", async () => {
  const spawnCalls = [];
  let readinessUrl;
  const runtime = new PicoClawRuntime(config, {
    existsSync: () => true,
    getAvailablePort: async () => 28431,
    spawn: (command, args, options) => {
      spawnCalls.push({ command, args, options });
      return createChild("spawn");
    },
    waitForHttpReady: async (url) => {
      readinessUrl = url;
    }
  });
  const states = [];
  runtime.on("state", (state) => states.push(state.phase));

  const state = await runtime.start();

  assert.equal(readinessUrl, "http://127.0.0.1:28431/api/auth/status");
  assert.equal(state.desktopUrl, "http://127.0.0.1:28431/");
  assert.deepEqual(states, ["starting", "ready"]);
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].command, config.startExe);
  assert.equal(spawnCalls[0].options.windowsHide, true);
  assert.equal(spawnCalls[0].options.env.PICOCLAW_HOME, config.picoClawHome);
  assert.equal(
    spawnCalls[0].options.env.PICOCLAW_DNS_SERVER,
    config.picoClawDnsServer
  );
});

test("PicoClawRuntime fails before spawning when the enterprise core is absent", async () => {
  let spawnCalled = false;
  const runtime = new PicoClawRuntime(config, {
    existsSync: (filePath) => filePath !== config.startExe,
    spawn: () => {
      spawnCalled = true;
      return createChild("spawn");
    }
  });

  await assert.rejects(runtime.start(), /Light Sandboxie Start.exe was not found/);
  assert.equal(spawnCalled, false);
  assert.equal(runtime.getState().phase, "error");
});

test("PicoClawRuntime terminates only its fixed sandbox", async () => {
  const calls = [];
  const runtime = new PicoClawRuntime(config, {
    existsSync: () => true,
    getAvailablePort: async () => 28431,
    spawn: (command, args) => {
      calls.push({ command, args });
      return createChild(calls.length === 1 ? "spawn" : "exit");
    },
    waitForHttpReady: async () => {}
  });

  await runtime.start();
  await runtime.stop();

  assert.deepEqual(calls[1], {
    command: config.startExe,
    args: ["/box:PicoClawBox", "/silent", "/terminate"]
  });
  assert.equal(runtime.getState().phase, "stopped");
});
