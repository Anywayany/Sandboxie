"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wendiDesktop", Object.freeze({
  selectSection: (section) => ipcRenderer.invoke("wendi:select-section", section),
  retryAgent: () => ipcRenderer.invoke("wendi:retry-agent"),
  getAgentState: () => ipcRenderer.invoke("wendi:get-agent-state"),
  onAgentState: (listener) => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on("wendi:agent-state", wrapped);
    return () => ipcRenderer.removeListener("wendi:agent-state", wrapped);
  }
}));
