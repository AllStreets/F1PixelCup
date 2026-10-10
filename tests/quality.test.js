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

// docs/superpowers/specs/2026-10-05-performance-headroom-design.md
test("each tier caps the render pixel ratio, never above the screen's own", () => {
  assert.deepEqual(Quality.PIXEL_RATIO, { high: 2, medium: 1.5, low: 1 });
  assert.deepEqual(Quality.RATIO_FLOOR, { high: 1.25, medium: 1, low: 0.75 });
  assert.equal(Quality.ratioCap("high", 2), 2);
  assert.equal(Quality.ratioCap("high", 3), 2);
  assert.equal(Quality.ratioCap("medium", 2), 1.5);
  assert.equal(Quality.ratioCap("low", 2), 1);
  assert.equal(Quality.ratioCap("medium", 1), 1);
  assert.equal(Quality.ratioCap("high", 1.25), 1.25);
  // The floor is never above the cap (a DPR 1 screen on High stays at 1).
  assert.equal(Quality.ratioFloor("high", 1), 1);
  assert.equal(Quality.ratioFloor("low", 1), 0.75);
  assert.equal(Quality.ratioFloor("high", 2), 1.25);
});

const WIN = (ms, n = Quality.SCALE_WINDOW) => Array.from({ length: n }, (_, i) => (typeof ms === "function" ? ms(i) : ms));
const feed = (scaler, frames) => { let r; frames.forEach((f) => { r = scaler.sample(f); }); return r; };

test("dynamic resolution: steps down when frames miss 60 fps, to the tier's floor and no further", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  assert.equal(s.ratio, 2);
  assert.equal(feed(s, WIN(25)), 1.875);
  assert.equal(feed(s, WIN(25)), 1.75);
  for (let i = 0; i < 10; i += 1) feed(s, WIN(25));
  assert.equal(s.ratio, 1.25);
  assert.equal(s.atFloor, true);
  // At its floor and slow for a few windows running: the auto tier may step
  // down. One slow window there (a hitch, a busy second) is not enough.
  const u = Quality.createScaler({ cap: 1, floor: 1 });
  feed(u, WIN(25));
  assert.equal(u.slowAtFloor, false);
  feed(u, WIN(25));
  feed(u, WIN(16.7));
  feed(u, WIN(25));
  assert.equal(u.slowAtFloor, false);
  for (let i = 0; i < Quality.SLOW_WINDOWS_AT_FLOOR; i += 1) feed(u, WIN(25));
  assert.equal(u.slowAtFloor, true);
});

test("dynamic resolution: one hitch is not slow, a steady 60 Hz screen is not slow", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  feed(s, WIN((i) => (i === 5 ? 120 : 16.7)));
  assert.equal(s.ratio, 2);
  feed(s, WIN(16.7));
  assert.equal(s.ratio, 2);
  feed(s, WIN(8.33));
  assert.equal(s.ratio, 2);
});

test("dynamic resolution: a 120 Hz screen juddering between one and two refreshes steps down", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  // Half the frames at 8.3 ms, half at 16.7: uneven, though every one makes 60 fps.
  feed(s, WIN((i) => (i % 2 ? 16.7 : 8.33)));
  assert.equal(s.ratio, 1.875);
  // Steady again at the screen's rate: it stays.
  feed(s, WIN(8.33));
  feed(s, WIN(8.33));
  assert.ok(s.ratio >= 1.875);
});

test("dynamic resolution: steps back up with clear headroom, or by a probe on a 60 Hz screen", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  feed(s, WIN(25));
  feed(s, WIN(25));
  assert.equal(s.ratio, 1.75);
  // Clear headroom (a 120 Hz screen keeping up easily): up at once.
  feed(s, WIN(8.33));
  assert.equal(s.ratio, 1.875);
  // 60 Hz screen, steady: no headroom visible, so after a few steady windows it probes up.
  const t = Quality.createScaler({ cap: 2, floor: 1.25 });
  feed(t, WIN(25));
  assert.equal(t.ratio, 1.875);
  for (let i = 0; i < Quality.PROBE_WINDOWS - 1; i += 1) feed(t, WIN(16.7));
  assert.equal(t.ratio, 1.875);
  feed(t, WIN(16.7));
  assert.equal(t.ratio, 2);
  // The probe fails: back down, and the next probe waits twice as long.
  feed(t, WIN(25));
  assert.equal(t.ratio, 1.875);
  for (let i = 0; i < Quality.PROBE_WINDOWS * 2 - 1; i += 1) feed(t, WIN(16.7));
  assert.equal(t.ratio, 1.875);
  feed(t, WIN(16.7));
  assert.equal(t.ratio, 2);
});

test("dynamic resolution: pauses and loading gaps are not frames", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  feed(s, WIN(400));
  assert.equal(s.ratio, 2);
  // A new cap (the tier changed) starts again from it.
  s.reset({ cap: 1.5, floor: 1 });
  assert.equal(s.ratio, 1.5);
});

test("auto steps a tier down only once dynamic resolution is at its floor and still slow", () => {
  assert.equal(Quality.nextAutoTier("high", { slowAtFloor: false }), "high");
  assert.equal(Quality.nextAutoTier("high", { slowAtFloor: true }), "medium");
  assert.equal(Quality.nextAutoTier("medium", { slowAtFloor: true }), "low");
  assert.equal(Quality.nextAutoTier("low", { slowAtFloor: true }), "low");
});

test("dynamic resolution: racing just begun (or resumed) skips its first frames, which carry one-off work", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  s.resume();
  feed(s, WIN(40));
  assert.equal(s.ratio, 2);
  feed(s, WIN(40));
  assert.equal(s.ratio, 1.875);
});

test("dynamic resolution: a tier stepped down starts no higher than the ratio it had", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  for (let i = 0; i < 8; i += 1) feed(s, WIN(25));
  assert.equal(s.ratio, 1.25);
  s.reset({ cap: 1.5, floor: 1, ratio: s.ratio });
  assert.equal(s.ratio, 1.25);
  s.reset({ cap: 1, floor: 0.75, ratio: 1.25 });
  assert.equal(s.ratio, 1);
});

test("dynamic resolution: failed probes back off, but never past a limit", () => {
  const s = Quality.createScaler({ cap: 2, floor: 1.25 });
  feed(s, WIN(25));
  // Probe, fail, probe, fail... many times over.
  for (let k = 0; k < 12; k += 1) {
    let waited = 0;
    while (s.ratio < 2 && waited < 1000) { feed(s, WIN(16.7)); waited += 1; }
    assert.ok(waited <= Quality.PROBE_WINDOWS_MAX, `probe ${k} waited ${waited} windows`);
    feed(s, WIN(25));
  }
});
