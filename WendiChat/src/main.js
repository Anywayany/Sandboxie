"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  session
} = require("electron");
const { PicoClawRuntime } = require("./main/picoclaw-runtime");
const { createRuntimeConfig } = require("./main/runtime-config");
const {
  isAllowedAgentRequestUrl,
  isTrustedShellUrl
} = require("./main/url-policy");
const {
  enforceFrameNavigation,
  enforceMainNavigation
} = require("./main/navigation-policy");

const SHELL_ORIGIN = "wendi-app://shell";
const WINDOW_PARTITION = "persist:wendi-chat";
const ALLOWED_SECTIONS = new Set(["messages", "contacts", "agent"]);

let mainWindow;
let runtime;
let quitAfterCleanup = false;
let allowedAgentOrigin;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "wendi-app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false
    }
  }
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function registerShellProtocol(sessionProtocol) {
  const rendererRoot = path.join(__dirname, "renderer");
  const files = new Map([
    ["/", "index.html"],
    ["/index.html", "index.html"],
    ["/app.js", "app.js"],
    ["/styles.css", "styles.css"]
  ]);

  sessionProtocol.handle("wendi-app", (request) => {
    const url = new URL(request.url);
    const relative = url.host === "shell" ? files.get(url.pathname) : undefined;
    if (!relative) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(path.join(rendererRoot, relative)).toString());
  });
}

function isTrustedShellSender(event) {
  try {
    return isTrustedShellUrl(event.senderFrame.url) &&
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
    let allowed = details.url.startsWith(`${SHELL_ORIGIN}/`);
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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      partition: WINDOW_PARTITION
    }
  });

  configureWindowSession(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (details) => {
    enforceMainNavigation(details);
  });
  mainWindow.webContents.on("will-frame-navigate", (details) => {
    enforceFrameNavigation(details, allowedAgentOrigin);
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  void mainWindow.loadURL(`${SHELL_ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) {
    return;
  }

  const windowSession = session.fromPartition(WINDOW_PARTITION);
  registerShellProtocol(windowSession.protocol);
  const config = createRuntimeConfig({
    env: process.env,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    localAppData: process.env.LOCALAPPDATA || app.getPath("appData")
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
  if (quitAfterCleanup || !runtime) {
    return;
  }

  event.preventDefault();
  void runtime.stop().finally(() => {
    quitAfterCleanup = true;
    app.quit();
  });
});
