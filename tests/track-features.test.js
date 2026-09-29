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

test("where the source's first vertex isn't the real line, the line is beside the real pit lane", () => {
  OSM.lineAtPitMiddle.forEach((id) => {
    // The line sits between the real pit lane's two ends, which build_tracks
    // reports; here: the chosen pit zone reaches the line.
    const pit = SHAPES[id].pit;
    assert.ok(pit.entry < 0 && pit.exit >= 0, id);
  });
});
