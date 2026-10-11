const test = require("node:test");
const assert = require("node:assert/strict");
const { DRIVERS } = require("../game-data.js");

// A 2D context that only records what is filled (colour and box), enough to
// read a flag's layout back.
function recorder() {
  const calls = [];
  const state = { fillStyle: "#000", strokeStyle: "#000", lineWidth: 1 };
  const stack = [];
  let path = [];
  const box = () => {
    const xs = path.map((p) => p[0]);
    const ys = path.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const g = {
    calls,
    save() { stack.push({ ...state }); },
    restore() { Object.assign(state, stack.pop()); },
    translate() {}, clip() {}, closePath() {},
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    rect(x, y, w, h) { path.push([x, y], [x + w, y + h]); },
    arc(x, y, r) { path.push([x - r, y - r], [x + r, y + r]); },
    fill() { calls.push({ op: "fill", colour: state.fillStyle, box: box(), points: path.length }); },
    stroke() { calls.push({ op: "stroke", colour: state.strokeStyle, width: state.lineWidth, box: box() }); },
    fillRect(x, y, w, h) { calls.push({ op: "fillRect", colour: state.fillStyle, box: [x, y, x + w, y + h] }); },
    strokeRect() { calls.push({ op: "strokeRect", colour: state.strokeStyle }); },
  };
  Object.defineProperties(g, {
    fillStyle: { get: () => state.fillStyle, set: (v) => { state.fillStyle = v; } },
    strokeStyle: { get: () => state.strokeStyle, set: (v) => { state.strokeStyle = v; } },
    lineWidth: { get: () => state.lineWidth, set: (v) => { state.lineWidth = v; } },
  });
  return g;
}

test("the banners' flags: every driver's country has one, laid out as the flag is", async () => {
  const { drawFlag, hasFlag } = await import("../r3d/flags.js");
  DRIVERS.forEach((d) => assert.ok(hasFlag(d.country), d.country));
  const W = 300;
  const H = 200;
  const draw = (country) => { const g = recorder(); assert.equal(drawFlag(g, country, 10, 20, W, H), true); return g; };
  const rects = (g) => g.calls.filter((c) => c.op === "fillRect").map((c) => [c.colour, ...c.box.map((v) => Math.round(v))]);

  // Thailand: red, white, blue, white, red, the blue twice as deep.
  assert.deepEqual(rects(draw("Thailand")).map(([c, , y0, , y1]) => [c, y1 - y0]), [["#a51931", 34], ["#f4f5f8", 34], ["#2d2a4a", 67], ["#f4f5f8", 34], ["#a51931", 34]]);
  // The Netherlands: red over white over blue; France: blue, white, red from the hoist.
  assert.deepEqual(rects(draw("Netherlands")).map((r) => [r[0], r[2]]), [["#ae1c28", 0], ["#ffffff", 67], ["#21468b", 133]]);
  assert.deepEqual(rects(draw("France")).map((r) => [r[0], r[1]]), [["#0055a4", 0], ["#ffffff", 100], ["#ef4135", 200]]);
  assert.deepEqual(rects(draw("Italy")).map((r) => r[0]), ["#009246", "#ffffff", "#ce2b37"]);
  assert.deepEqual(rects(draw("Germany")).map((r) => r[0]), ["#000000", "#dd0000", "#ffce00"]);
  // Monaco: red over white, halves. Spain: the yellow twice each red.
  assert.deepEqual(rects(draw("Monaco")), [["#ce1126", 0, 0, 300, 100], ["#ffffff", 0, 100, 300, 200]]);
  assert.deepEqual(rects(draw("Spain")).map(([c, , y0, , y1]) => [c, y1 - y0]), [["#aa151b", 50], ["#f1bf00", 100], ["#aa151b", 50]]);
  // Japan: a red disc in the middle of white, three fifths of the height across.
  const japan = draw("Japan").calls;
  assert.deepEqual(japan.filter((c) => c.op === "fill").map((c) => [c.colour, ...c.box]), [["#bc002d", 90, 40, 210, 160]]);
  // Canada: red, white (half the width), red; the leaf inside the white.
  const canada = draw("Canada");
  assert.deepEqual(rects(canada).map((r) => [r[0], r[1], r[3]]), [["#d80621", 0, 75], ["#ffffff", 75, 225], ["#d80621", 225, 300]]);
  const leaf = canada.calls.find((c) => c.op === "fill");
  assert.ok(leaf.colour === "#d80621" && leaf.box[0] > 78 && leaf.box[2] < 222 && leaf.box[1] > 10 && leaf.box[3] < 190, JSON.stringify(leaf.box));
  // The Union Flag: the white saltire, then four red arms (counterchanged:
  // none centred on a diagonal), then the white cross under the red one.
  const uk = draw("United Kingdom").calls;
  const arms = uk.filter((c) => c.op === "fill" && c.colour === "#c8102e");
  assert.equal(arms.length, 4);
  assert.ok(uk.findIndex((c) => c.op === "stroke" && c.colour === "#ffffff") < uk.indexOf(arms[0]));
  const cross = uk.filter((c) => c.op === "fillRect");
  assert.deepEqual(cross.map((c) => c.colour), ["#012169", "#ffffff", "#ffffff", "#c8102e", "#c8102e"]);
  assert.ok(uk.indexOf(arms[3]) < uk.indexOf(cross[1]));
  // Australia: the Union Flag in the canton, six white stars (five of seven points). New Zealand: four red stars edged white.
  const stars = (country, colour) => draw(country).calls.filter((c) => c.op === "fill" && c.colour === colour && c.points >= 10);
  assert.deepEqual(stars("Australia", "#ffffff").map((c) => c.points / 2), [7, 7, 7, 7, 7, 5]);
  assert.equal(stars("New Zealand", "#c8102e").length, 4);
  assert.equal(stars("New Zealand", "#ffffff").length, 4);
  // Brazil: green, the yellow rhombus, the blue disc.
  assert.deepEqual(draw("Brazil").calls.filter((c) => c.op !== "strokeRect").map((c) => c.colour), ["#009c3b", "#ffdf00", "#002776"]);
  // A country without a flag here draws nothing; drawing leaves the caller's styles as they were.
  const g = recorder();
  g.strokeStyle = "#123456";
  g.lineWidth = 7;
  assert.equal(drawFlag(g, "Atlantis", 0, 0, W, H), false);
  assert.equal(g.calls.length, 0);
  drawFlag(g, "Japan", 0, 0, W, H);
  assert.ok(g.strokeStyle === "#123456" && g.lineWidth === 7);
});
