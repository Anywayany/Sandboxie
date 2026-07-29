"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isAllowedAgentFrameUrl,
  isAllowedAgentRequestUrl
} = require("../src/main/url-policy");

const expectedOrigin = "http://127.0.0.1:28431";

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
