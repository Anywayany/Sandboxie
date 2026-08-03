"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  enforceFrameNavigation,
  enforceMainNavigation
} = require("../src/main/navigation-policy");

function navigationDetails(url, isMainFrame = false) {
  return {
    url,
    isMainFrame,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  };
}

test("Electron 43 main-frame navigation details allow only the trusted shell", () => {
  const shell = navigationDetails("wendi-app://shell/index.html", true);
  const external = navigationDetails("https://example.com/", true);

  enforceMainNavigation(shell);
  enforceMainNavigation(external);

  assert.equal(shell.prevented, false);
  assert.equal(external.prevented, true);
});

test("Electron 43 frame navigation details allow the selected PicoClaw origin", () => {
  const picoClaw = navigationDetails("http://127.0.0.1:52742/launcher-setup");
  const wrongPort = navigationDetails("http://127.0.0.1:52743/");

  enforceFrameNavigation(picoClaw, "http://127.0.0.1:52742");
  enforceFrameNavigation(wrongPort, "http://127.0.0.1:52742");

  assert.equal(picoClaw.prevented, false);
  assert.equal(wrongPort.prevented, true);
});

test("frame navigation cannot move the top-level window away from the shell", () => {
  const topLevelAgent = navigationDetails("http://127.0.0.1:52742/", true);

  enforceFrameNavigation(topLevelAgent, "http://127.0.0.1:52742");

  assert.equal(topLevelAgent.prevented, true);
});
