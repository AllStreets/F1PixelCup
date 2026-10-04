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
  ["spa", "singapore", "bahrain", "interlagos", "shanghai", "jeddah", "miami", "imola", "barcelona", "montreal", "redbullring", "hungaroring", "zandvoort", "baku", "cota", "mexico", "losail", "yasmarina"].forEach((id) => {
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

test("the pit lane is on its real side, except where the widened road leaves no room there", () => {
  // Known and accepted (the README says so). A new one fails.
  // Interlagos: the real one leaves the track's side through the Senna S;
  // Singapore: its real side bends too tightly for garages beside the road;
  // Monaco's is placed by Stage J.
  const OTHER_SIDE = ["monaco", "interlagos", "singapore"].sort();
  const flipped = Object.entries(SHAPES).filter(([, s]) => s.pit.real && s.pit.side !== s.pit.real.side).map(([id]) => id).sort();
  assert.deepEqual(flipped, OTHER_SIDE);
  // Mapped in OpenStreetMap, the real pit lane is recorded; where none is
  // mapped (Albert Park, Las Vegas, Monza, Suzuka), none is claimed.
  Object.entries(SHAPES).forEach(([id, s]) => assert.equal(Boolean(s.pit.real), Boolean(OSM.pitLanes[id]), id));
  assert.deepEqual(Object.keys(SHAPES).filter((id) => !OSM.pitLanes[id]).sort(), ["albertpark", "lasvegas", "monza", "suzuka"]);
});

test("Shanghai's snail is as tight as the real one: the road narrows there, and only there", () => {
  const shape = SHAPES.shanghai;
  const narrow = shape.points.map((p, i) => [i, p.w]).filter(([, w]) => w !== undefined);
  assert.ok(narrow.length > 10, "the road narrows somewhere");
  assert.ok(Math.min(...narrow.map(([, w]) => w)) >= 0.5 - 1e-9, "never below half");
  // Only Shanghai's road narrows.
  Object.entries(SHAPES).forEach(([id, s]) => { if (id !== "shanghai") assert.ok(s.points.every((p) => p.w === undefined), id); });
  // Never on the grid, nor beside the pit lane.
  const { total } = (() => { let run = 0; shape.points.forEach((a, i) => { const b = shape.points[(i + 1) % shape.points.length]; run += Math.hypot(b.x - a.x, b.y - a.y); }); return { total: run }; })();
  let run = 0;
  const dist = shape.points.map((a, i) => { const d = run; const b = shape.points[(i + 1) % shape.points.length]; run += Math.hypot(b.x - a.x, b.y - a.y); return d; });
  narrow.forEach(([i]) => {
    const rel = dist[i] > total / 2 ? dist[i] - total : dist[i];
    assert.ok(rel > 120, `narrow at ${rel.toFixed(0)}, on the grid`);
    assert.ok(rel > shape.pit.exit + 60 || rel < shape.pit.entry - 60, `narrow at ${rel.toFixed(0)}, beside the pit lane`);
  });
  // The narrow loops still never overlap: any two stretches more than 300
  // apart round the lap are further apart than their two half-widths.
  const W = 49.5;
  const pts = shape.points;
  narrow.forEach(([i]) => {
    pts.forEach((q, j) => {
      const gap = Math.abs(dist[i] - dist[j]);
      if (Math.min(gap, total - gap) < 300) return;
      const apart = Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
      assert.ok(apart > W * ((pts[i].w || 1) + (q.w || 1)) + 10, `${i}/${j} only ${apart.toFixed(0)} apart`);
    });
  });
  // And tighter than it was: its loops come within 120 of each other (the
  // usual road keeps 150 apart), as the real snail's do.
  let closest = Infinity;
  narrow.forEach(([i]) => narrow.forEach(([j]) => {
    const gap = Math.abs(dist[i] - dist[j]);
    if (Math.min(gap, total - gap) > 300) closest = Math.min(closest, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  }));
  assert.ok(closest < 120, `closest loops ${closest.toFixed(0)} apart`);
});
