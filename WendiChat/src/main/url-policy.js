"use strict";

function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return undefined;
  }
}

function isAllowedAgentRequestUrl(rawUrl, expectedOrigin) {
  const url = parseUrl(rawUrl);
  if (!url) {
    return false;
  }
  if (
    url.protocol === "about:" ||
    url.protocol === "blob:" ||
    url.protocol === "data:"
  ) {
    return true;
  }
  const expected = parseUrl(expectedOrigin);
  if (!expected) {
    return false;
  }
  if (url.origin === expected.origin) {
    return true;
  }
  const pairedWebSocketProtocol =
    (expected.protocol === "http:" && url.protocol === "ws:") ||
    (expected.protocol === "https:" && url.protocol === "wss:");
  return pairedWebSocketProtocol && url.host === expected.host;
}

function isAllowedAgentFrameUrl(rawUrl, expectedOrigin) {
  const url = parseUrl(rawUrl);
  if (!url) {
    return false;
  }
  if (url.href === "about:blank") {
    return true;
  }
  return Boolean(expectedOrigin) && url.origin === expectedOrigin;
}

module.exports = {
  isAllowedAgentFrameUrl,
  isAllowedAgentRequestUrl
};
