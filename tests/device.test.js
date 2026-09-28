const test = require("node:test");
const assert = require("node:assert/strict");
const Device = require("../device.js");

const media = (answers) => (query) => ({ matches: Boolean(answers[query]) });

test("touch-only needs a coarse pointer and no hover", () => {
  assert.equal(Device.isTouchOnly(media({ "(pointer: coarse)": true, "(hover: none)": true })), true);
  assert.equal(Device.isTouchOnly(media({ "(pointer: coarse)": true, "(hover: none)": false })), false);
  assert.equal(Device.isTouchOnly(media({ "(pointer: coarse)": false, "(hover: none)": true })), false);
});

test("no matchMedia, or one that throws, is not touch-only", () => {
  assert.equal(Device.isTouchOnly(undefined), false);
  assert.equal(Device.isTouchOnly(() => { throw new Error("nope"); }), false);
});
