const test = require("node:test");
const assert = require("node:assert/strict");
const Quality = require("../quality.js");

test("the tiers, best first", () => {
  assert.deepEqual(Quality.TIERS, ["high", "medium", "low"]);
});

test("a first guess from the device", () => {
  // A desktop with a real GPU and plenty of cores.
  assert.equal(Quality.initialTier({ cores: 10, memoryGb: 16, touchOnly: false, gpu: "ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)" }), "high");
  // Integrated graphics on a thin laptop: medium.
  assert.equal(Quality.initialTier({ cores: 4, memoryGb: 8, touchOnly: false, gpu: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)" }), "medium");
  // A phone or tablet: medium at most.
  assert.equal(Quality.initialTier({ cores: 8, memoryGb: 6, touchOnly: true, gpu: "Apple GPU" }), "medium");
  // Little memory or few cores: low.
  assert.equal(Quality.initialTier({ cores: 2, memoryGb: 2, touchOnly: false, gpu: "" }), "low");
  // A software renderer: low, whatever else it says.
  assert.equal(Quality.initialTier({ cores: 16, memoryGb: 32, touchOnly: false, gpu: "Google SwiftShader" }), "low");
  // Nothing known: medium, the safe middle.
  assert.equal(Quality.initialTier({}), "medium");
  // Intel's Arc cards are discrete GPUs, not integrated graphics.
  assert.equal(Quality.initialTier({ cores: 8, memoryGb: 16, touchOnly: false, gpu: "ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)" }), "high");
  // AMD's integrated graphics (an APU) report a bare "Radeon Graphics".
  assert.equal(Quality.initialTier({ cores: 4, memoryGb: 8, touchOnly: false, gpu: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)" }), "medium");
  // A discrete Radeon names its model.
  assert.equal(Quality.initialTier({ cores: 4, memoryGb: 16, touchOnly: false, gpu: "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11)" }), "high");
});

test("steps down once when the first seconds of racing run slow, never up", () => {
  const frames = (ms, n = 90) => Array.from({ length: n }, () => ms);
  assert.equal(Quality.adjustTier("high", frames(12)), "high");
  assert.equal(Quality.adjustTier("high", frames(26)), "medium");
  assert.equal(Quality.adjustTier("medium", frames(26)), "low");
  assert.equal(Quality.adjustTier("low", frames(40)), "low");
  // Fast frames never raise the tier.
  assert.equal(Quality.adjustTier("medium", frames(6)), "medium");
  // Too few frames to judge: no change. MIN_FRAMES is the first count judged.
  assert.equal(Quality.MIN_FRAMES, 60);
  assert.equal(Quality.adjustTier("high", frames(40, 20)), "high");
  assert.equal(Quality.adjustTier("high", frames(40, 59)), "high");
  assert.equal(Quality.adjustTier("high", frames(40, 60)), "medium");
  // One hitch doesn't count: the median does.
  assert.equal(Quality.adjustTier("high", [...frames(12, 80), ...frames(200, 10)]), "high");
});

test("the player's choice wins over the automatic tier; anything unknown reads as auto", () => {
  assert.deepEqual(Quality.CHOICES, ["auto", "high", "medium", "low"]);
  assert.equal(Quality.effectiveTier("auto", "medium"), "medium");
  assert.equal(Quality.effectiveTier("low", "high"), "low");
  assert.equal(Quality.effectiveTier("nonsense", "high"), "high");
  assert.equal(Quality.parseChoice("medium"), "medium");
  assert.equal(Quality.parseChoice(null), "auto");
  assert.equal(Quality.parseChoice("ultra"), "auto");
});

test("what each tier draws", () => {
  assert.deepEqual(Quality.passesFor("high"), { composer: true, bloom: true, grade: true, flare: true, speedBlur: true, haze: true, bursts: true });
  assert.deepEqual(Quality.passesFor("medium"), { composer: true, bloom: true, grade: true, flare: false, speedBlur: false, haze: false, bursts: true });
  assert.deepEqual(Quality.passesFor("low"), { composer: false, bloom: false, grade: false, flare: false, speedBlur: false, haze: false, bursts: false });
});
