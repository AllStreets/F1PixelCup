// Las Vegas's ground filled in (tools/vegas/build_fill_data.py ->
// tools/vegas/fill.json and assets/landmarks/vegas_fill.glb, r3d/vegas-fill.js,
// r3d/vegas-fill-plan.js), docs/superpowers/specs/2026-10-11-vegas-fill-design.md.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "vegas", "fill.json"), "utf8"));
const STRIP = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "vegas", "strip.json"), "utf8"));
let plan;
test.before(async () => { plan = await import(path.join(ROOT, "r3d", "vegas-fill-plan.js")); });

test("the map's data: credited, the Strip's own origin, every layer present", () => {
  assert.match(DATA.attribution, /OpenStreetMap/);
  assert.deepEqual(DATA.origin, STRIP.origin);
  assert.ok(DATA.low.length > 2500, `${DATA.low.length} low buildings`);
  assert.ok(DATA.lots.length > 100 && DATA.pools.length > 150 && DATA.greens.length > 50, "car parks, pools and gardens");
  assert.ok(DATA.roads.length > 2000 && DATA.rail.length > 10 && DATA.bridges.length > 50, "roads, the monorail and footbridges");
  ["m", "p", "s", "t", "r"].forEach((c) => assert.ok(DATA.roads.some((r) => r.c === c), `no ${c} roads`));
  DATA.low.forEach((b) => {
    assert.ok(b.o.length >= 6 && b.o.length % 2 === 0 && b.h >= 3 && b.h <= 60 && b.k >= 0 && b.k <= 6, JSON.stringify(b).slice(0, 80));
  });
});

test("nothing of the fill stands inside a building of the Strip", () => {
  const inside = [];
  const strip = STRIP.buildings.map((b) => b.outline.flat());
  // Its middle and points every 4 m round its outline, each drawn a tenth
  // of the way toward its middle (a neighbour shares its wall with a tower).
  DATA.low.forEach((b) => {
    const pts = plan.outlineSamples(b.o, 4);
    const [cx, cy] = pts[pts.length - 1];
    pts.forEach(([x, y]) => {
      const px = x + (cx - x) * 0.1; const py = y + (cy - y) * 0.1;
      if (strip.some((s) => plan.insidePoly(px, py, s))) inside.push([px, py]);
    });
  });
  assert.deepEqual(inside.slice(0, 3), []);
});

test("the model the game loads carries the same data, and no geometry", () => {
  const buf = fs.readFileSync(path.join(ROOT, "assets", "landmarks", "vegas_fill.glb"));
  assert.equal(buf.toString("latin1", 0, 4), "glTF");
  const doc = JSON.parse(buf.toString("utf8", 20, 20 + buf.readUInt32LE(12)));
  assert.equal(doc.meshes, undefined);
  assert.deepEqual(doc.scenes[0].extras.fill, DATA);
  const models = fs.readFileSync(path.join(ROOT, "r3d", "models.js"), "utf8");
  assert.ok(/lasvegas: \[[^\]]*"vegasFill"/.test(models), "Las Vegas does not load it");
});

test("cars park in rows inside their car park, the same every time", () => {
  const lot = [0, 0, 80, 0, 80, 40, 0, 40];
  const cars = plan.carSpots(lot, plan.seeded(7), { share: 1 });
  assert.ok(cars.length > 60, `${cars.length} cars`);
  cars.forEach(([x, y]) => assert.ok(x > 2 && x < 78 && y > 2 && y < 38, `${x}, ${y}`));
  // Rows along the long side: many cars share a y.
  const rows = new Set(cars.map((c) => c[1].toFixed(1)));
  assert.ok(rows.size <= 6 && rows.size >= 2, `${rows.size} rows`);
  // Nose to the aisle: across the rows.
  cars.forEach((c) => assert.ok(Math.abs(Math.abs(Math.sin(c[2])) - 1) < 1e-6));
  assert.deepEqual(plan.carSpots(lot, plan.seeded(7), { share: 1 }), cars);
  assert.ok(plan.carSpots(lot, plan.seeded(7), { share: 0.5 }).length < cars.length * 0.7, "a share of the bays");
  // An L-shaped car park: no car in the notch.
  const ell = [0, 0, 80, 0, 80, 20, 40, 20, 40, 60, 0, 60];
  plan.carSpots(ell, plan.seeded(3), { share: 1 }).forEach(([x, y]) => assert.ok(plan.insidePoly(x, y, ell), `${x}, ${y} is outside`));
  assert.equal(plan.carSpots([0, 0, 6, 0, 6, 6, 0, 6], plan.seeded(1), { share: 1 }).length, 0, "too small for a row");
});

test("lamps stand a step apart along a road, to one side", () => {
  const road = [0, 0, 100, 0, 100, 100];
  const lamps = plan.alongLine(road, 40, 6);
  assert.equal(lamps.length, 6);
  assert.deepEqual(lamps[0].slice(0, 2), [0, 6]);
  assert.ok(Math.abs(lamps[1][0] - 40) < 1e-9 && Math.abs(lamps[1][1] - 6) < 1e-9);
  // Round the corner: to the left of the road going north is west of it.
  assert.ok(Math.abs(lamps[3][0] - 94) < 1e-9 && Math.abs(lamps[3][1] - 20) < 1e-9, JSON.stringify(lamps[3]));
  assert.equal(plan.lengthOf(road), 200);
});

test("a low building's look: quiet kinds, none a resort's", () => {
  assert.equal(plan.lookOf(plan.KIND.garage, 0.5).wall, plan.WALL.ribbon);
  assert.equal(plan.lookOf(plan.KIND.hotel, 0.5).wall, plan.WALL.stone);
  assert.equal(plan.lookOf(plan.KIND.house, 0.5).wall, plan.WALL.quiet);
  // A plain building: a lit front on a main road, and for about a third of the rest.
  let lit = 0;
  for (let k = 0; k < 1000; k += 1) {
    assert.equal(plan.lookOf(plan.KIND.generic, k / 1000, true).wall, plan.WALL.plain);
    if (plan.lookOf(plan.KIND.generic, k / 1000).wall === plan.WALL.plain) lit += 1;
    else assert.equal(plan.lookOf(plan.KIND.generic, k / 1000).wall, plan.WALL.quiet);
  }
  assert.ok(lit > 250 && lit < 420, `${lit} in 1000 lit`);
  for (let k = 0; k <= 6; k += 1) assert.match(plan.lookOf(k, 0.999).tint, /^#[0-9a-f]{6}$/);
  // The walls' kinds are the facade shader's (tools/blender/vegas_resorts.py).
  const py = fs.readFileSync(path.join(ROOT, "tools", "blender", "vegas_resorts.py"), "utf8");
  assert.ok(py.includes("STONE, QUIET, PLAIN, RIBBON, LINED, GLASS = 1.0, 0.9, 0.8, 0.65, 0.5, 0.35"));
});

test("a building's outline is sampled closely enough that no long wall crosses the track unseen", () => {
  const pts = plan.outlineSamples([0, 0, 300, 0, 300, 40, 0, 40], 12);
  // No two neighbours further apart than the step; every corner and the middle among them.
  for (let i = 0; i + 2 < pts.length; i += 1) assert.ok(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) <= 12 + 1e-9);
  [[0, 0], [300, 0], [300, 40], [0, 40], [150, 20]].forEach(([x, y]) => assert.ok(pts.some((p) => p[0] === x && p[1] === y), `no ${x}, ${y}`));
  // A wall across a track along x = 150 (20 wide) is caught, though its corners are clear.
  assert.ok(pts.some(([x]) => Math.abs(x - 150) < 10));
});

test("the monorail's beam stops at the track and its piers stand only under it", () => {
  // A line along x; the track crosses it between x = 90 and x = 130.
  const spans = plan.clearSpans([0, 0, 300, 0], 10, (x) => x < 90 || x > 130);
  assert.equal(spans.length, 2);
  assert.deepEqual(spans[0][spans[0].length - 1], [80, 0]);
  assert.deepEqual(spans[1][0], [140, 0]);
  spans.flat().forEach(([x]) => assert.ok(x < 90 || x > 130));
  // A lone clear point between two blocked is no span (no beam, so no pier).
  assert.deepEqual(plan.clearSpans([0, 0, 40, 0], 10, (x) => x === 20), []);
});

test("a car park's lamps follow its own aisles, and the nearest cars are the ones drawn", () => {
  // A car park turned 30 degrees: its lamps in rows along it, all inside.
  const c = Math.cos(Math.PI / 6); const s = Math.sin(Math.PI / 6);
  const lot = [[0, 0], [120, 0], [120, 70], [0, 70]].flatMap(([x, y]) => [x * c - y * s, x * s + y * c]);
  const lamps = plan.lotLamps(lot, 34);
  assert.ok(lamps.length >= 6, `${lamps.length} lamps`);
  lamps.forEach(([x, y]) => assert.ok(plan.insidePoly(x, y, lot)));
  const rows = new Set(lamps.map(([x, y]) => (-x * s + y * c).toFixed(1)));
  assert.equal(rows.size, 2, "two rows along the car park, not the map's axes");
  assert.deepEqual(plan.nearest([5, 1, 9, 3], (v) => v, 2), [1, 3]);
});

test("the fill is built last, never claims ground, and is audited with the landmarks", () => {
  const src = fs.readFileSync(path.join(ROOT, "render3d.js"), "utf8");
  const at = (s) => { const i = src.indexOf(s); assert.ok(i > 0, `render3d.js has no ${s}`); return i; };
  assert.ok(at("buildVegasFill(") > at("buildPeople(course"), "the fill is built before the people have their ground");
  assert.ok(src.includes("landmarks.add(fill)"), "the fill is not among the audited landmarks");
  const fill = fs.readFileSync(path.join(ROOT, "r3d", "vegas-fill.js"), "utf8");
  assert.ok(!/occupied\.add\(/.test(fill), "the fill claims ground");
  // The mountains and the glow answer the rain's overcast (r3d/rain.js sets
  // the uniform of that name on every material that has it).
  assert.equal((fill.match(/uniforms: \{ overcast: \{ value: 0 \} \}/g) || []).length, 2, "the horizon does not dim in the rain");
  assert.ok(/uniforms\.overcast\) uniforms\.overcast\.value = isWet/.test(fs.readFileSync(path.join(ROOT, "r3d", "rain.js"), "utf8")));
  assert.ok(/occupied\.blocked\(/.test(fill) && /course\.clearance\(/.test(fill), "the fill does not keep off the track and what stands there");
  // (That each kind of piece is in fact built, and clear, is the browser's:
  // tools/checks/trackside-models-check.js vegasFillBuilt, and auditScenery.)
  const check = fs.readFileSync(path.join(ROOT, "tools", "checks", "trackside-models-check.js"), "utf8");
  assert.ok(check.includes("results.vegasFillBuilt"), "the browser check does not look at the fill");
});
