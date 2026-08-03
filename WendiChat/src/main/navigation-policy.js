"use strict";

const {
  isAllowedAgentFrameUrl,
  isTrustedShellUrl
} = require("./url-policy");

function enforceMainNavigation(details, expectedShellOrigin) {
  if (!isTrustedShellUrl(details.url, expectedShellOrigin)) {
    details.preventDefault();
  }
}

function enforceFrameNavigation(
  details,
  expectedAgentOrigin,
  expectedShellOrigin
) {
  const allowed = details.isMainFrame
    ? isTrustedShellUrl(details.url, expectedShellOrigin)
    : isAllowedAgentFrameUrl(details.url, expectedAgentOrigin);
  if (!allowed) {
    details.preventDefault();
  }
}

module.exports = {
  enforceFrameNavigation,
  enforceMainNavigation
};
