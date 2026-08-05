"use strict";

const dns = require("node:dns");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  ipcMain
} = require("electron");
const { PicoClawRuntime } = require("./main/picoclaw-runtime");
const { createRuntimeConfig } = require("./main/runtime-config");
const { createWindowWebPreferences } = require("./main/window-options");
const {
  isAllowedAgentRequestUrl,
  isAllowedShellRequestUrl,
  isTrustedShellUrl
} = require("./main/url-policy");
const {
  enforceFrameNavigation,
  enforceMainNavigation
} = require("./main/navigation-policy");
const { startShellServer } = require("./main/shell-server");

const ALLOWED_SECTIONS = new Set(["messages", "contacts", "agent"]);

let mainWindow;
let runtime;
let shellService;
let shellOrigin;
let quitAfterCleanup = false;
let allowedAgentOrigin;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function isTrustedShellSender(event) {
  try {
    return isTrustedShellUrl(event.senderFrame.url, shellOrigin) &&
      event.sender === mainWindow.webContents;
  } catch {
    return false;
  }
}

function requireTrustedShellSender(event) {
  if (!mainWindow || !isTrustedShellSender(event)) {
    throw new Error("Rejected IPC from an untrusted renderer.");
  }
}

function broadcastAgentState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("wendi:agent-state", state);
  }
}

function configureWindowSession(window) {
  const windowSession = window.webContents.session;
  windowSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  );
  windowSession.setPermissionCheckHandler(() => false);
  windowSession.on("will-download", (event) => event.preventDefault());
  windowSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = isAllowedShellRequestUrl(details.url, shellOrigin);
    if (!allowed) {
      allowed = isAllowedAgentRequestUrl(details.url, allowedAgentOrigin);
    }
    callback({ cancel: !allowed });
  });
}

async function showAgent() {
  try {
    const state = await runtime.start();
    return state;
  } catch {
    return runtime.getState();
  }
}

function registerIpcHandlers() {
  ipcMain.handle("wendi:get-agent-state", (event) => {
    requireTrustedShellSender(event);
    return runtime.getState();
  });

  ipcMain.handle("wendi:select-section", async (event, section) => {
    requireTrustedShellSender(event);
    if (!ALLOWED_SECTIONS.has(section)) {
      throw new Error("Unknown application section.");
    }

    if (section === "agent") {
      return showAgent();
    }
    return runtime.getState();
  });

  ipcMain.handle("wendi:retry-agent", async (event) => {
    requireTrustedShellSender(event);
    await runtime.stop();
    return showAgent();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "Wendi Chat",
    backgroundColor: "#f5f7fa",
    autoHideMenuBar: true,
    webPreferences: createWindowWebPreferences(
      path.join(__dirname, "preload.js")
    )
  });

  configureWindowSession(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (details) => {
    enforceMainNavigation(details, shellOrigin);
  });
  mainWindow.webContents.on("will-frame-navigate", (details) => {
    enforceFrameNavigation(details, allowedAgentOrigin, shellOrigin);
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  void mainWindow.loadURL(`${shellOrigin}/index.html`);
}

async function initializeApplication() {
  if (!hasSingleInstanceLock) {
    return;
  }

  // PicoClaw's SameSite=Lax login cookie needs the embedding top-level page
  // to share its http://127.0.0.1 site. Ports remain isolated origins.
  shellService = await startShellServer(path.join(__dirname, "renderer"));
  shellOrigin = shellService.origin;
  const config = createRuntimeConfig({
    env: process.env,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    localAppData: process.env.LOCALAPPDATA || app.getPath("appData"),
    dnsServers: dns.getServers()
  });
  runtime = new PicoClawRuntime(config);
  runtime.on("state", (state) => {
    if (state.phase === "ready") {
      allowedAgentOrigin = state.origin;
    } else if (state.phase === "stopped" || state.phase === "error") {
      allowedAgentOrigin = undefined;
    }
    broadcastAgentState(state);
  });

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

app.whenReady()
  .then(initializeApplication)
  .catch((error) => {
    console.error("Failed to initialize Wendi Chat:", error);
    app.quit();
  });

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (hasSingleInstanceLock) {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (quitAfterCleanup) {
    return;
  }

  event.preventDefault();
  const cleanup = [];
  if (runtime) {
    cleanup.push(runtime.stop());
  }
  if (shellService) {
    cleanup.push(shellService.close());
  }
  void Promise.allSettled(cleanup).finally(() => {
    quitAfterCleanup = true;
    app.quit();
  });
});
