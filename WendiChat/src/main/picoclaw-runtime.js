"use strict";

const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");

const LOOPBACK_HOST = "127.0.0.1";

function getAvailablePort(host = LOOPBACK_HOST) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!port) {
          reject(new Error("Windows did not allocate a loopback port."));
        } else {
          resolve(port);
        }
      });
    });
  });
}

function buildLaunchArguments(config, port) {
  return [
    `/box:${config.sandboxName}`,
    "/silent",
    "/hide_window",
    config.launcherExe,
    "-host",
    LOOPBACK_HOST,
    "-port",
    String(port),
    "-no-browser",
    "-console",
    config.picoClawConfig
  ];
}

function buildTerminateArguments(config) {
  return [
    `/box:${config.sandboxName}`,
    "/silent",
    "/terminate"
  ];
}

function probeHttp(url, request = http.get) {
  return new Promise((resolve) => {
    const req = request(url, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    req.once("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.once("error", () => resolve(false));
  });
}

async function waitForHttpReady(url, options = {}) {
  const {
    timeoutMs = 30000,
    intervalMs = 250,
    probe = probeHttp,
    now = Date.now,
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = options;
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    if (await probe(url)) {
      return;
    }
    await delay(intervalMs);
  }

  throw new Error(`PicoClaw did not become ready within ${timeoutMs} ms.`);
}

function waitForChildExit(child, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      finish();
    }, timeoutMs);
    timer.unref();
    child.once("error", finish);
    child.once("exit", finish);
  });
}

class PicoClawRuntime extends EventEmitter {
  constructor(config, dependencies = {}) {
    super();
    this.config = config;
    this.dependencies = {
      existsSync: dependencies.existsSync || fs.existsSync,
      getAvailablePort: dependencies.getAvailablePort || getAvailablePort,
      spawn: dependencies.spawn || spawn,
      waitForHttpReady: dependencies.waitForHttpReady || waitForHttpReady
    };
    this.state = Object.freeze({ phase: "stopped" });
    this.startPromise = null;
  }

  getState() {
    return this.state;
  }

  setState(next) {
    this.state = Object.freeze({ ...next });
    this.emit("state", this.state);
  }

  validateFiles() {
    for (const [label, filePath] of [
      ["Light Sandboxie Start.exe", this.config.startExe],
      ["PicoClaw launcher", this.config.launcherExe]
    ]) {
      if (!this.dependencies.existsSync(filePath)) {
        throw new Error(`${label} was not found: ${filePath}`);
      }
    }
  }

  async start() {
    if (this.state.phase === "ready") {
      return this.state;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async startInternal() {
    try {
      this.validateFiles();
      this.setState({ phase: "starting" });

      const port = await this.dependencies.getAvailablePort(LOOPBACK_HOST);
      const origin = `http://${LOOPBACK_HOST}:${port}`;
      const argumentsList = buildLaunchArguments(this.config, port);
      const child = this.dependencies.spawn(this.config.startExe, argumentsList, {
        windowsHide: true,
        stdio: "ignore",
        env: {
          ...process.env,
          PICOCLAW_HOME: this.config.picoClawHome,
          ...(this.config.picoClawDnsServer ? {
            PICOCLAW_DNS_SERVER: this.config.picoClawDnsServer
          } : {})
        }
      });

      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });

      await this.dependencies.waitForHttpReady(`${origin}/api/auth/status`, {
        timeoutMs: this.config.startTimeoutMs
      });

      this.setState({
        phase: "ready",
        port,
        origin,
        desktopUrl: `${origin}/`
      });
      return this.state;
    } catch (error) {
      this.setState({
        phase: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async stop() {
    if (this.state.phase === "stopped") {
      return;
    }

    this.setState({ phase: "stopping" });
    try {
      if (this.dependencies.existsSync(this.config.startExe)) {
        const child = this.dependencies.spawn(
          this.config.startExe,
          buildTerminateArguments(this.config),
          { windowsHide: true, stdio: "ignore" }
        );
        await waitForChildExit(child);
      }
    } finally {
      this.setState({ phase: "stopped" });
    }
  }
}

module.exports = {
  LOOPBACK_HOST,
  PicoClawRuntime,
  buildLaunchArguments,
  buildTerminateArguments,
  getAvailablePort,
  probeHttp,
  waitForChildExit,
  waitForHttpReady
};
