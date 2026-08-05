"use strict";

function createWindowWebPreferences(preload) {
  return {
    preload,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    navigateOnDragDrop: false,
    partition: "persist:wendi-chat",
    // PicoClaw keeps its local WebSocket alive while Wendi is minimized or
    // covered. Electron throttles renderer timers in the background by
    // default, which can delay heartbeats and reconnect attempts beyond the
    // gateway's timeout window.
    backgroundThrottling: false
  };
}

module.exports = { createWindowWebPreferences };
