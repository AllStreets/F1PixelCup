const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const sandbox = {};
vm.runInNewContext(`${fs.readFileSync(path.join(root, "tracks-data.js"), "utf8")}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, sandbox);
const SHAPES = JSON.parse(JSON.stringify(sandbox.TRACK_SHAPES));
const OSM = JSON.parse(fs.readFileSync(path.join(root, "tools", "tracks", "osm-features.json"), "utf8"));
const SCALE = Number((fs.readFileSync(path.join(root, "tools", "tracks", "build_tracks.py"), "utf8").match(/^SCALE = ([\d.]+)/m) || [])[1]);

const lapLength = (points) => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length];
  return sum + Math.hypot(b.x - a.x, b.y - a.y);
}, 0);

test("the real features carry OpenStreetMap's attribution", () => {
  assert.match(OSM.attribution, /OpenStreetMap contributors.*ODbL/);
  assert.ok(Object.keys(OSM.pitLanes).length >= 6);
});

test("the Monaco tunnel is the real one: in racing order, its real length", () => {
  const tunnel = SHAPES.monaco.tunnel;
  assert.ok(tunnel, "Monaco has a tunnel");
  const total = lapLength(SHAPES.monaco.points);
  const length = ((tunnel.to - tunnel.from) % total + total) % total;
  const real = OSM.tunnels.monaco.metres * SCALE;
  // The relaxation stretches and squeezes the lap a little.
  assert.ok(Math.abs(length - real) / real < 0.2, `tunnel ${length.toFixed(0)} against the real ${real.toFixed(0)}`);
  // Only Monaco has one.
  Object.entries(SHAPES).forEach(([id, shape]) => { if (id !== "monaco") assert.equal(shape.tunnel, undefined, id); });
});

test("where the source's first vertex isn't the real line, the line is level with the middle of the real pit lane", () => {
  OSM.lineAtPitMiddle.forEach((id) => {
    const real = SHAPES[id].pit.real;
    assert.ok(real, `${id}: the real pit lane's stretch is recorded`);
    // Its two ends either side of the line, the line halfway between them.
    assert.ok(real.from < 0 && real.to > 0, `${id}: ${real.from}..${real.to}`);
    assert.ok(Math.abs(real.from + real.to) <= 0.1 * (real.to - real.from), `${id}: not centred, ${real.from}..${real.to}`);
  });
  // The others keep the source's line: their real pit lanes still sit round it.
  ["spa", "singapore", "bahrain", "interlagos", "shanghai", "jeddah", "miami", "imola", "barcelona", "montreal", "redbullring", "hungaroring", "zandvoort"].forEach((id) => {
    const real = SHAPES[id].pit.real;
    assert.ok(real.from < 0 && real.to > 0, `${id}: ${real.from}..${real.to}`);
  });
});

test("the signature corners are the real ones: in racing order, their real length", () => {
  Object.entries(OSM.corners).forEach(([id, corners]) => {
    const shape = SHAPES[id];
    const total = lapLength(shape.points);
    assert.equal(shape.corners.length, corners.length, id);
    corners.forEach((real, k) => {
      const c = shape.corners[k];
      assert.equal(c.board, real.board);
      const span = ((c.to - c.from) % total + total) % total;
      const into = ((c.d - c.from) % total + total) % total;
      assert.ok(into > 0 && into < span, `${id} ${c.board}: its middle ${c.d} is outside ${c.from}..${c.to}`);
      // The relaxation opens tight corners out a little more than it
      // stretches straights.
      const want = real.metres * SCALE;
      assert.ok(Math.abs(span - want) / want < 0.35, `${id} ${c.board}: ${span.toFixed(0)} against the real ${want.toFixed(0)}`);
    });
  });
});

test("every grandstand knows where round the lap it stands beside", () => {
  Object.entries(SHAPES).forEach(([id, shape]) => {
    const total = lapLength(shape.points);
    shape.decor.filter((item) => item.type === "grandstand").forEach((stand) => {
      assert.ok(stand.d >= 0 && stand.d < total, `${id}: stand at ${stand.d}`);
      // Its own stretch is beside it: the point of the lap at d is near.
      let run = 0;
      let at = null;
      for (let i = 0; i < shape.points.length && !at; i += 1) {
        const a = shape.points[i];
        const b = shape.points[(i + 1) % shape.points.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (run + len >= stand.d) { const t = (stand.d - run) / len; at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
        run += len;
      }
      assert.ok(Math.hypot(at.x - stand.x, at.y - stand.y) < 300, `${id}: stand ${stand.x},${stand.y} far from its stretch`);
    });
  });
});
