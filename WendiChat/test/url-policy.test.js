"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isAllowedAgentFrameUrl,
  isAllowedAgentRequestUrl,
  isAllowedShellRequestUrl,
  isTrustedShellUrl
} = require("../src/main/url-policy");

const expectedOrigin = "http://127.0.0.1:28431";
const shellOrigin = "http://127.0.0.1:31500";

test("agent requests stay on the selected loopback origin", () => {
  assert.equal(
    isAllowedAgentRequestUrl("http://127.0.0.1:28431/assets/app.js", expectedOrigin),
    true
  );
  assert.equal(
    isAllowedAgentRequestUrl("ws://127.0.0.1:28431/pico/ws", expectedOrigin),
    true
  );
  assert.equal(
    isAllowedAgentRequestUrl("http://127.0.0.1:18800/", expectedOrigin),
    false
  );
  assert.equal(
    isAllowedAgentRequestUrl("https://example.com/", expectedOrigin),
    false
  );
});

test("agent requests permit local browser resources but frames do not", () => {
  assert.equal(isAllowedAgentRequestUrl("blob:null/id", undefined), true);
  assert.equal(isAllowedAgentRequestUrl("data:text/plain,ok", undefined), true);
  assert.equal(isAllowedAgentFrameUrl("about:blank", undefined), true);
  assert.equal(isAllowedAgentFrameUrl("data:text/html,blocked", expectedOrigin), false);
  assert.equal(
    isAllowedAgentFrameUrl("http://127.0.0.1:28431/launcher-login", expectedOrigin),
    true
  );
});

test("trusted shell URLs stay on the selected loopback origin", () => {
  assert.equal(isTrustedShellUrl(`${shellOrigin}/index.html`, shellOrigin), true);
  assert.equal(isTrustedShellUrl(`${shellOrigin}/`, shellOrigin), true);
  assert.equal(isTrustedShellUrl(`${shellOrigin}/app.js`, shellOrigin), false);
  assert.equal(isTrustedShellUrl(`${shellOrigin}/?debug=1`, shellOrigin), false);
  assert.equal(
    isTrustedShellUrl("http://127.0.0.1:31501/index.html", shellOrigin),
    false
  );
  assert.equal(isTrustedShellUrl("https://127.0.0.1:31500/", shellOrigin), false);
  assert.equal(isTrustedShellUrl(`${shellOrigin}/`, "https://example.com"), false);
});

test("shell resource requests stay on their random loopback origin", () => {
  assert.equal(isAllowedShellRequestUrl(`${shellOrigin}/app.js`, shellOrigin), true);
  assert.equal(
    isAllowedShellRequestUrl("http://127.0.0.1:31501/app.js", shellOrigin),
    false
  );
  assert.equal(isAllowedShellRequestUrl("https://example.com/app.js", shellOrigin), false);
  assert.equal(
    isAllowedShellRequestUrl(`${shellOrigin}/app.js`, "https://127.0.0.1:31500"),
    false
  );
});
