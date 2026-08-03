"use strict";

function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl);
  } catch {
    return undefined;
  }
}

function isTrustedShellUrl(rawUrl, expectedOrigin) {
  const url = parseUrl(rawUrl);
  const expected = parseUrl(expectedOrigin);
  return Boolean(url) && Boolean(expected) &&
    expected.protocol === "http:" &&
    expected.hostname === "127.0.0.1" &&
    url.origin === expected.origin &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    (url.pathname === "/" || url.pathname === "/index.html");
}

function isAllowedShellRequestUrl(rawUrl, expectedOrigin) {
  const url = parseUrl(rawUrl);
  const expected = parseUrl(expectedOrigin);
  return Boolean(url) && Boolean(expected) &&
    expected.protocol === "http:" &&
    expected.hostname === "127.0.0.1" &&
    url.origin === expected.origin &&
    url.username === "" &&
    url.password === "";
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
  isAllowedAgentRequestUrl,
  isAllowedShellRequestUrl,
  isTrustedShellUrl
};
