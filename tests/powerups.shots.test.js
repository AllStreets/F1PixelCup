const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const P = require("../powerups.js");
const Data = require("../game-data.js");

function trackShapes() {
  const src = fs.readFileSync(path.join(__dirname, "..", "tracks-data.js"), "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${src}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, context);
  return context.TRACK_SHAPES;
}
const SHAPES = trackShapes();
// Same half-width the game uses: each circuit's roadWidth × TRACK_WIDTH_SCALE (1.5).
const halfWidthOf = (id) => Data.CIRCUITS.find((c) => c.id === id).roadWidth * 1.5;
const HALF = halfWidthOf("monza");
const realRoute = (id) => P.makeRoute(SHAPES[id].points, halfWidthOf(id));

function oval() {
  const pts = [];
  for (let i = 0; i < 120; i += 1) {
    const a = (i / 120) * Math.PI * 2;
    pts.push({ x: 1000 + Math.cos(a) * 600, y: 600 + Math.sin(a) * 300 });
  }
  return P.makeRoute(pts, HALF);
}
const MAX = 220;
function shot(type, extra = {}) {
  return { type, ownerId: "me", d: 0, lat: 0, speed: MAX * P.SHOT_SPEEDS[type], latVel: 0, targetId: "", targetLat: 0, armedAt: 0, expiresAt: Infinity, age: 0, ...extra };
}
function nearestCentreDistance(route, x, y, d) {
  let best = Infinity;
  for (let k = -60; k <= 60; k += 2) {
    const s = route.sample(d + k);
    best = Math.min(best, Math.hypot(x - s.x, y - s.y));
  }
  return best;
}

test("wrapDelta takes the short way round the start/finish line", () => {
  assert.equal(P.wrapDelta(10, 990, 1000), 20);
  assert.equal(P.wrapDelta(990, 10, 1000), -20);
  assert.equal(P.wrapDelta(500, 100, 1000), 400);
});

test("makeRoute matches the lap length and puts lat on the left-hand normal", () => {
  const r = oval();
  let len = 0;
  const pts = [];
  for (let i = 0; i < 120; i += 1) { const a = (i / 120) * Math.PI * 2; pts.push({ x: 1000 + Math.cos(a) * 600, y: 600 + Math.sin(a) * 300 }); }
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; len += Math.hypot(q.x - p.x, q.y - p.y); });
  assert.ok(Math.abs(r.length - len) < 1e-6);
  const s = r.sample(123);
  const w = r.toWorld(123, 10);
  assert.ok(Math.abs(w.x - (s.x + s.nx * 10)) < 1e-9 && Math.abs(w.y - (s.y + s.ny * 10)) < 1e-9);
  assert.ok(Math.abs(s.nx * s.tx + s.ny * s.ty) < 1e-9);
});

test("shots stay inside the barriers on every real circuit", () => {
  Data.CIRCUITS.forEach((c) => {
    const route = realRoute(c.id);
    ["debris", "undercut", "stewardPenalty"].forEach((type) => {
      const s = shot(type, { lat: 30, latVel: 150, targetLat: -60 });
      for (let t = 0; t < 20; t += 1 / 60) {
        P.advanceShot(s, 1 / 60, route);
        assert.ok(Math.abs(s.lat) <= route.halfWidthAt(s.d) - P.SHOT_EDGE + 1e-9, `${c.id} ${type} lat ${s.lat}`);
        const w = route.toWorld(s.d, s.lat);
        assert.ok(nearestCentreDistance(route, w.x, w.y, s.d) <= halfWidthOf(c.id), `${c.id} ${type} off the road`);
      }
    });
  });
});

test("debris bounces off the road edges", () => {
  const route = oval();
  const s = shot("debris", { latVel: 120 });
  for (let t = 0; t < 3; t += 1 / 60) P.advanceShot(s, 1 / 60, route);
  assert.ok(s.bounces >= 2, `bounces ${s.bounces}`);
});

test("an undercut with no target flies free and bounces like debris", () => {
  const route = oval();
  const s = shot("undercut", { latVel: 120, targetId: "" });
  for (let t = 0; t < 3; t += 1 / 60) P.advanceShot(s, 1 / 60, route);
  assert.ok(s.bounces >= 1);
});

test("an undercut follows Monaco round a corner to its target", () => {
  const route = realRoute("monaco");
  // Find a stretch where the road turns hard within the next 300 units.
  let d0 = 0;
  for (let d = 0; d < route.length; d += 10) {
    const turn = Math.abs(Math.atan2(Math.sin(route.headingAt(d + 300) - route.headingAt(d)), Math.cos(route.headingAt(d + 300) - route.headingAt(d))));
    if (turn > 1.2) { d0 = d; break; }
  }
  const target = { id: "rival", d: (d0 + 300) % route.length, lat: -20 };
  const s = shot("undercut", { d: d0, lat: 20, targetId: "rival", targetLat: target.lat });
  let hit = null;
  for (let t = 0; t < 5 && !hit; t += 1 / 60) {
    P.advanceShot(s, 1 / 60, route);
    hit = P.firstHit(s, [target], route.length, 1e9);
  }
  assert.equal(hit && hit.id, "rival");
});

test("the undercut never hits the car that fired it, debris can after arming", () => {
  const L = 1000;
  const me = { id: "me", d: 100, lat: 0 };
  assert.equal(P.firstHit(shot("undercut", { d: 100 }), [me], L, 1e9), null);
  assert.equal(P.firstHit(shot("debris", { d: 100, armedAt: 500 }), [me], L, 400), null);
  assert.equal(P.firstHit(shot("debris", { d: 100, armedAt: 500 }), [me], L, 600).id, "me");
});

test("hits need both the along-track and the side gap to be small", () => {
  const L = 1000;
  const s = shot("debris", { d: 100, lat: 0 });
  assert.equal(P.shotHits(s, { d: 100 + P.CAR_LENGTH - 0.01, lat: 0 }, L), true);
  assert.equal(P.shotHits(s, { d: 100 + P.CAR_LENGTH, lat: 0 }, L), false);
  assert.equal(P.shotHits(s, { d: 100, lat: P.CAR_WIDTH }, L), false);
  assert.equal(P.shotHits({ ...s, d: 995 }, { d: 5, lat: 0 }, L), true);
});

test("a trailed oil slick takes the undercut before the car does", () => {
  const L = 1000;
  const car = { id: "rival", d: 200, lat: 0 };
  const trail = { id: "trail:rival", ownerId: "rival", d: 200 - P.TRAIL_GAP, lat: 0, isTrail: true };
  const s = shot("undercut", { d: 150, targetId: "rival" });
  let hit = null;
  for (let i = 0; i < 200 && !hit; i += 1) { s.d += 1; hit = P.firstHit(s, [trail, car], L, 1e9); }
  assert.equal(hit.id, "trail:rival");
});

test("nothing hits between the two levels of Suzuka's bridge", () => {
  const route = realRoute("suzuka");
  const { under, over } = SHAPES.suzuka.bridges[0];
  const starts = [];
  let acc = 0;
  const pts = SHAPES.suzuka.points;
  pts.forEach((p, i) => { starts.push(acc); const q = pts[(i + 1) % pts.length]; acc += Math.hypot(q.x - p.x, q.y - p.y); });
  let best = { dist: Infinity };
  for (let a = starts[under - 3]; a < starts[under + 3]; a += 2) {
    for (let b = starts[over - 3]; b < starts[over + 3]; b += 2) {
      const pa = route.sample(a); const pb = route.sample(b);
      const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (dist < best.dist) best = { dist, a, b };
    }
  }
  assert.ok(best.dist < 10, `the two levels should cross, closest ${best.dist}`);
  const s = shot("debris", { d: best.a, armedAt: 0 });
  assert.equal(P.firstHit(s, [{ id: "above", d: best.b, lat: 0 }], route.length, 1e9), null);
});

test("stewardVictims follows the current target only and splashes its neighbours", () => {
  const L = 1000;
  const leader = { id: "lead", d: 500, lat: 0 };
  const beside = { id: "beside", d: 505, lat: 10 };
  const wide = { id: "wide", d: 505, lat: 30 };
  const passed = { id: "passed", d: 300, lat: 0 };
  const s = shot("stewardPenalty", { d: 300, targetId: "lead" });
  assert.deepEqual(P.stewardVictims(s, [leader, beside, wide, passed], L, 1e9), []);
  s.d = 490;
  assert.deepEqual(P.stewardVictims(s, [leader, beside, wide, passed], L, 1e9), ["lead", "beside"]);
  s.targetId = "gone";
  assert.deepEqual(P.stewardVictims(s, [leader, beside], L, 1e9), []);
  s.targetId = "lead";
  assert.deepEqual(P.stewardVictims({ ...s, armedAt: 2e9 }, [leader], L, 1e9), []);
});

test("the steward penalty runs above the field on the centreline", () => {
  const route = oval();
  const s = shot("stewardPenalty", { lat: 30 });
  for (let t = 0; t < 2; t += 1 / 60) P.advanceShot(s, 1 / 60, route);
  assert.equal(s.lat, 0);
});

test("advanceShot is frame-rate independent", () => {
  const route = realRoute("monza");
  const a = shot("debris", { latVel: 90 });
  const b = shot("debris", { latVel: 90 });
  for (let i = 0; i < 120; i += 1) P.advanceShot(a, 1 / 60, route);
  for (let i = 0; i < 288; i += 1) P.advanceShot(b, 1 / 144, route);
  assert.ok(Math.abs(P.wrapDelta(a.d, b.d, route.length)) < 0.5, `d ${a.d} vs ${b.d}`);
  assert.ok(Math.abs(a.lat - b.lat) < 0.5, `lat ${a.lat} vs ${b.lat}`);
});

test("isStraight tells Monza's main straight from a chicane", () => {
  const route = realRoute("monza");
  let straight = 0, bent = 0;
  for (let d = 0; d < route.length; d += 25) (P.isStraight(route, d) ? straight += 1 : bent += 1);
  assert.ok(straight > 0 && bent > 0);
  assert.equal(P.isStraight(oval(), 0), false);
});

test("holdStationSpeed keeps a car behind the one ahead in its lane", () => {
  const L = 1000;
  const me = { id: "me", d: 100, lat: 0 };
  assert.equal(P.holdStationSpeed(me, [{ id: "a", d: 120, lat: 5, speed: 90 }], L), 90);
  assert.equal(P.holdStationSpeed(me, [{ id: "a", d: 120, lat: 40, speed: 90 }], L), Infinity);
  assert.equal(P.holdStationSpeed(me, [{ id: "a", d: 80, lat: 0, speed: 90 }], L), Infinity);
  assert.equal(P.holdStationSpeed(me, [{ id: "a", d: 200, lat: 0, speed: 90 }], L), Infinity);
});

test("nearestGaps finds the closest car each way round the lap", () => {
  const L = 1000;
  const g = P.nearestGaps({ id: "me", d: 10 }, [{ id: "me", d: 10 }, { id: "a", d: 60 }, { id: "b", d: 980 }, { id: "c", d: 400 }], L);
  assert.equal(g.ahead, 50);
  assert.equal(g.behind, 30);
  assert.deepEqual(P.nearestGaps({ id: "me", d: 0 }, [], L), { ahead: null, behind: null });
});

test("arming only protects the car that fired: a car right in front is hit at once", () => {
  const L = 1000;
  const close = { id: "close", d: 110, lat: 0 };
  const me = { id: "me", d: 100, lat: 0 };
  assert.equal(P.firstHit(shot("undercut", { d: 100, armedAt: 500 }), [me, close], L, 0).id, "close");
  assert.equal(P.firstHit(shot("debris", { d: 100, armedAt: 500 }), [me, close], L, 0).id, "close");
  assert.equal(P.firstHit(shot("debris", { d: 100, armedAt: 500 }), [me], L, 0), null);
  assert.equal(P.firstHit({ type: "oilSlick", ownerId: "me", d: 100, lat: 0, armedAt: 500 }, [me], L, 0), null);
});

test("behind the safety car the hold is single file: a car alongside can't slip past", () => {
  const L = 1000;
  const me = { id: "me", d: 100, lat: -30 };
  const ahead = { id: "a", d: 120, lat: 30, speed: 90 };
  assert.equal(P.holdStationSpeed(me, [ahead], L), Infinity);
  assert.equal(P.holdStationSpeed(me, [ahead], L, { singleFile: true }), 90);
});

test("a steward penalty never times out before it reaches the leader", () => {
  assert.equal(P.TIMINGS.lifeMs.stewardPenalty, Infinity);
});

test("the road's half-width follows the track data where the road narrows", () => {
  const P = require("../powerups.js");
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0, w: 0.5 }, { x: 200, y: 0, w: 0.5 }, { x: 200, y: 100 }];
  const route = P.makeRoute(pts, 50);
  assert.equal(route.halfWidthAt(0), 50);
  assert.equal(route.halfWidthAt(50), 37.5);
  assert.equal(route.halfWidthAt(150), 25);
  // A track with no narrowing: the same everywhere.
  const plain = P.makeRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 50);
  assert.equal(plain.halfWidthAt(70), 50);
});
