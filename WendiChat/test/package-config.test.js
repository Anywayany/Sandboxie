"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const packageConfig = require("../package.json");

test("Windows installer is x64, per-user, and cannot request elevation", () => {
  assert.equal(packageConfig.build.win.requestedExecutionLevel, "asInvoker");
  assert.deepEqual(packageConfig.build.win.target, [
    {
      target: "nsis",
      arch: ["x64"]
    }
  ]);
  assert.equal(packageConfig.build.nsis.oneClick, true);
  assert.equal(packageConfig.build.nsis.perMachine, false);
  assert.equal(packageConfig.build.nsis.allowElevation, false);
  assert.equal(packageConfig.build.nsis.packElevateHelper, false);
});
