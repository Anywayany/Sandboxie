"use strict";

const {
  isAllowedAgentFrameUrl,
  isTrustedShellUrl
} = require("./url-policy");

function enforceMainNavigation(details) {
  if (!isTrustedShellUrl(details.url)) {
    details.preventDefault();
  }
}

function enforceFrameNavigation(details, expectedAgentOrigin) {
  const allowed = details.isMainFrame
    ? isTrustedShellUrl(details.url)
    : isAllowedAgentFrameUrl(details.url, expectedAgentOrigin);
  if (!allowed) {
    details.preventDefault();
  }
}

module.exports = {
  enforceFrameNavigation,
  enforceMainNavigation
};
