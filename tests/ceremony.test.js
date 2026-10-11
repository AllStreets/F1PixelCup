const test = require("node:test");
const assert = require("node:assert/strict");
const Ceremony = require("../ceremony.js");

test("the steps: P1 in the middle and highest, P2 left and P3 right from the camera", () => {
  const [p1, p2, p3] = [1, 2, 3].map((place) => Ceremony.stepFor(place));
  assert.equal(p1.x, 0);
  // The camera looks down -Z from +Z, so screen left is -X.
  assert.ok(p2.x < 0 && p3.x > 0);
  assert.ok(p1.height > p2.height && p2.height > p3.height && p3.height > 0);
  // Side by side, touching, never overlapping.
  assert.ok(Math.abs(p2.x) >= (p1.width + p2.width) / 2 - 1e-9);
  assert.ok(Math.abs(p3.x) >= (p1.width + p3.width) / 2 - 1e-9);
  // Deep enough for a driver to step forward on it.
  [p1, p2, p3].forEach((s) => assert.ok(s.depth >= 1 && s.standZ - Ceremony.STEP_FORWARD > -s.depth / 2 && s.standZ + Ceremony.STEP_FORWARD < s.depth / 2));
});

test("the order of a real podium: step up, the anthem standing, the trophy, the champagne", () => {
  const C = Ceremony.withAnthem(24);
  const B = C.BEATS;
  assert.ok(B.sweepEnd < B.arms[3] + 1e-9 && B.arms[3] < B.arms[2] && B.arms[2] < B.arms[1] && B.arms[1] < B.armsDown);
  assert.ok(B.armsDown < B.anthem && Math.abs(B.anthemEnd - B.anthem - 24) < 1e-9 && B.anthemEnd < B.trophy && B.trophy + 3 < B.spray);
  // The sweep in: everyone stands.
  [1, 2, 3].forEach((p) => assert.equal(C.poseAt(p, 0), "stand"));
  [1, 2, 3].forEach((p) => assert.equal(C.poseAt(p, B.sweepEnd - 0.1), "stand"));
  // Arms up in order as each steps up: P3, then P2, then P1.
  [3, 2, 1].forEach((p) => {
    assert.equal(C.poseAt(p, B.arms[p] - 0.01), "stand");
    assert.equal(C.poseAt(p, B.arms[p] + 0.01), "arms_up");
    assert.equal(C.poseAt(p, B.armsDown - 0.01), "arms_up");
  });
  // The anthem: all three stand still, from before its first note to after its last.
  [B.armsDown, B.anthem, B.anthem + 12, B.anthemEnd, B.trophy - 0.01].forEach((t) => [1, 2, 3].forEach((p) => assert.equal(C.poseAt(p, t), "stand")));
  // Then P1 lifts the trophy while P2 and P3 wave.
  assert.equal(C.poseAt(1, B.trophy + 1), "trophy");
  assert.equal(C.poseAt(2, B.trophy + 1), "wave");
  assert.equal(C.poseAt(3, B.spray - 0.1), "wave");
  // Then, for as long as it runs: all three spray.
  [B.spray, B.spray + 3, B.spray + 60, B.spray + 600].forEach((t) => [1, 2, 3].forEach((p) => assert.equal(C.poseAt(p, t), "spray")));
  assert.equal(C.beatAt(1), "sweep");
  assert.equal(C.beatAt(B.arms[2]), "arms");
  assert.equal(C.beatAt(B.anthem + 5), "anthem");
  assert.equal(C.beatAt(B.trophy + 1), "trophy");
  assert.equal(C.beatAt(B.spray + 30), "spray");
});

test("the anthem's length moves everything after it, and nothing before it", () => {
  const short = Ceremony.withAnthem(15).BEATS;
  const long = Ceremony.withAnthem(38).BEATS;
  ["sweepEnd", "armsDown", "anthem"].forEach((k) => assert.equal(short[k], long[k]));
  assert.deepEqual(short.arms, long.arms);
  ["anthemEnd", "trophy", "spray"].forEach((k) => assert.ok(Math.abs(long[k] - short[k] - 23) < 1e-9, k));
  [1, 2, 3].forEach((p) => assert.ok(Math.abs(Ceremony.withAnthem(38).corkAt(p) - Ceremony.withAnthem(15).corkAt(p) - 23) < 1e-9));
  // The plain module is a ceremony with a short pause where the anthem goes.
  assert.ok(Math.abs(Ceremony.BEATS.anthemEnd - Ceremony.BEATS.anthem - Ceremony.DEFAULT_ANTHEM) < 1e-9);
  assert.equal(Ceremony.withAnthem(24).anthemSeconds, 24);
  assert.throws(() => Ceremony.withAnthem(-1));
  assert.throws(() => Ceremony.withAnthem(NaN));
});

test("a cork for each bottle: each driver's spray starts at their own pop, one after another", () => {
  const C = Ceremony.withAnthem(20);
  const pops = [1, 2, 3].map((p) => C.corkAt(p));
  assert.equal(new Set(pops).size, 3);
  pops.forEach((at, i) => {
    const place = i + 1;
    // The bottle is in the hand before it pops, and it pops within 1.5 s of the spray beat.
    assert.ok(at > C.BEATS.spray + C.PROP_SWAP && at < C.BEATS.spray + 1.5);
    assert.equal(C.bottleShown(place, at - 0.01), true);
    assert.equal(C.sprayOn(at - 0.01, "high", place), false);
    assert.equal(C.sprayOn(at + 0.01, "high", place), true);
    assert.equal(C.sprayOn(at + 0.01, "medium", place), true);
    assert.equal(C.sprayOn(at + 0.01, "low", place), false);
  });
});

test("each steps forward as the arms go up, and stays there", () => {
  [1, 2, 3].forEach((p) => {
    const at = Ceremony.BEATS.arms[p];
    assert.equal(Ceremony.forwardAt(p, at - 0.01), 0);
    const mid = Ceremony.forwardAt(p, at + 0.2);
    assert.ok(mid > 0 && mid < 1);
    assert.equal(Ceremony.forwardAt(p, at + 2), 1);
    assert.equal(Ceremony.forwardAt(p, 100), 1);
  });
});

test("the trophy only while P1 lifts it; confetti from the trophy, spray after it (none on Low)", () => {
  // The props change hands halfway through the poses' crossfade, not as it starts.
  const half = Ceremony.PROP_SWAP;
  const { trophy, spray } = Ceremony.BEATS;
  assert.ok(half > 0.1 && half < 0.3);
  assert.equal(Ceremony.trophyShown(1, trophy - 0.1), false);
  assert.equal(Ceremony.trophyShown(1, trophy + half - 0.05), false);
  assert.equal(Ceremony.trophyShown(1, trophy + half + 0.05), true);
  assert.equal(Ceremony.trophyShown(1, spray + 0.05), true);
  assert.equal(Ceremony.trophyShown(1, spray + half + 0.05), false);
  assert.equal(Ceremony.trophyShown(2, trophy + 1), false);
  [1, 2, 3].forEach((p) => {
    assert.equal(Ceremony.bottleShown(p, spray - 1), false);
    assert.equal(Ceremony.bottleShown(p, spray + half - 0.05), false);
    assert.equal(Ceremony.bottleShown(p, spray + half + 0.05), true);
    assert.equal(Ceremony.bottleShown(p, spray + 300), true);
  });
  // No confetti over the anthem: the cannons go with the trophy.
  assert.equal(Ceremony.confettiOn(Ceremony.BEATS.anthem + 1), false);
  assert.equal(Ceremony.confettiOn(trophy - 0.1), false);
  assert.equal(Ceremony.confettiOn(trophy), true);
  assert.equal(Ceremony.sprayOn(spray - 0.1, "high"), false);
  assert.equal(Ceremony.sprayOn(spray + 2, "high"), true);
  assert.equal(Ceremony.sprayOn(spray + 2, "medium"), true);
  assert.equal(Ceremony.sprayOn(spray + 2, "low"), false);
});

test("confetti and spray counts per tier", () => {
  assert.deepEqual(Ceremony.counts("high"), { confetti: 600, spray: 1500 });
  assert.deepEqual(Ceremony.counts("medium"), { confetti: 300, spray: 750 });
  assert.deepEqual(Ceremony.counts("low"), { confetti: 120, spray: 0 });
  assert.deepEqual(Ceremony.counts("nonsense"), Ceremony.counts("medium"));
});

test("the camera sweeps in, pushes slowly in on the winner through the anthem, closer for the trophy, then orbits, smoothly", () => {
  const C = Ceremony.withAnthem(24);
  const B = C.BEATS;
  const at = (t) => C.cameraAt(t);
  const dist = (c) => Math.hypot(c.x - c.lookX, c.y - c.lookY, c.z - c.lookZ);
  assert.ok(dist(at(0)) > dist(at(B.sweepEnd)) * 1.3, "starts well back");
  // The anthem: a slow, steady push on the winner, every second a little
  // closer, looking at P1 (in the middle) at about head height.
  const head = C.stepFor(1).height + 1.6;
  for (let t = B.anthem + 1; t < B.anthemEnd - 1; t += 1) assert.ok(dist(at(t + 1)) < dist(at(t)) - 0.01, `pushes in at ${t}`);
  assert.ok(dist(at(B.anthemEnd)) < dist(at(B.anthem)) * 0.8);
  assert.ok(Math.abs(at(B.anthemEnd).lookX) < 1e-9 && Math.abs(at(B.anthemEnd).lookY - head) < 0.5);
  assert.ok(Math.abs(at(B.anthem + 12).x) < 0.2, "from straight ahead");
  // The trophy: at least as close, looking between P1's head and the trophy over it.
  const lift = B.trophy + 3;
  assert.ok(dist(at(lift)) <= dist(at(B.anthemEnd)) + 1e-9 && dist(at(lift)) < dist(at(B.arms[1])) * 0.8);
  assert.ok(at(lift).lookY > head + 0.1 && at(lift).lookY < head + 0.6);
  // No jumps anywhere: 1 ms apart, the camera moves less than 2 cm.
  for (let t = 0; t < B.spray + 30; t += 0.001) {
    const a = at(t);
    const b = at(t + 0.001);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.02, `jump at ${t.toFixed(3)}`);
    assert.ok(Math.hypot(a.lookX - b.lookX, a.lookY - b.lookY, a.lookZ - b.lookZ) < 0.02, `look jumps at ${t.toFixed(3)}`);
  }
  // It orbits: the angle changes, always in front of the wall and off the floor.
  const angles = [];
  for (let t = B.spray; t < B.spray + 51; t += 0.5) {
    const c = at(t);
    assert.ok(c.z > 2 && c.y > 0.5);
    angles.push(Math.atan2(c.x, c.z));
  }
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.3);
  assert.ok(Math.max(...angles.map(Math.abs)) < 0.7);
  // And loops: the orbit repeats.
  const p = C.ORBIT_PERIOD;
  const a = at(B.spray + 11);
  const b = at(B.spray + 11 + p);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6);
});

test("the field of view widens on narrow windows so the podium stays in frame", () => {
  assert.equal(Ceremony.fitFov(30, 16 / 9), 30);
  assert.equal(Ceremony.fitFov(30, 2.4), 30);
  const narrow = Ceremony.fitFov(30, 9 / 16);
  assert.ok(narrow > 60 && narrow < 120);
  // The horizontal half-angle is held.
  const half = (fov, aspect) => Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  assert.ok(Math.abs(half(narrow, 9 / 16) - half(30, 16 / 9)) < 1e-9);
});

test("every cup on the calendar, and the season, has a colour of its own", () => {
  const Data = require("../game-data.js");
  // (And the random cup, the custom cup and the single race: choices.js.)
  const ids = [...Data.CUP_DEFS.map((c) => c.id), Data.SEASON.id, "randomCup", "customCup", "singleRace"];
  const colours = ids.map((id) => Ceremony.cupColour(id));
  colours.forEach((c) => assert.match(c, /^#[0-9a-f]{6}$/));
  assert.equal(new Set(colours).size, ids.length, colours.join());
});

test("the cup's colour: one per cup, a valid colour for any cup", () => {
  assert.match(Ceremony.cupColour("trophyCup"), /^#[0-9a-f]{6}$/);
  assert.notEqual(Ceremony.cupColour("trophyCup"), Ceremony.cupColour("constructorCup"));
  assert.match(Ceremony.cupColour("someFutureCup"), /^#[0-9a-f]{6}$/);
  assert.equal(Ceremony.cupColour("someFutureCup"), Ceremony.cupColour("someFutureCup"));
});

test("confetti: paper falls slowly, flutters, and lands flat where it falls", () => {
  const piece = { x: 0, y: 6, z: 0, vx: 1.5, vy: 2, vz: 0, phase: 0.3, spin: 4, landed: false };
  const ground = () => 0.5;
  const ys = [];
  for (let i = 0; i < 600; i += 1) {
    Ceremony.stepConfetti(piece, 1 / 60, ground);
    ys.push(piece.y);
  }
  // Ten seconds later it has come down and lies on what was under it.
  assert.equal(piece.landed, true);
  assert.equal(piece.y, 0.5);
  assert.equal(piece.vy, 0);
  // Paper's drag: it fell at about a metre a second, never like a stone.
  const p2 = { x: 0, y: 100, z: 0, vx: 0, vy: 0, vz: 0, phase: 0, spin: 3, landed: false };
  for (let i = 0; i < 240; i += 1) Ceremony.stepConfetti(p2, 1 / 60, () => 0);
  assert.ok(p2.vy < -0.5 && p2.vy > -1.6, `terminal ${p2.vy}`);
  // It rose first (the burst threw it up), then fell.
  assert.ok(Math.max(...ys) > 6);
  // Landed pieces stay put.
  const before = { ...piece };
  Ceremony.stepConfetti(piece, 1 / 60, ground);
  assert.equal(piece.x, before.x);
  assert.equal(piece.y, before.y);
});

test("spray: a drop leaves the neck along the bottle and falls under gravity", () => {
  const drop = Ceremony.sprayDrop({ x: 0, y: 2, z: 0 }, { x: 0, y: 0.6, z: 0.8 }, () => 0.5);
  assert.ok(drop.vy > 0 && drop.vz > 0, "along the bottle");
  const v0 = drop.vy;
  Ceremony.stepDrop(drop, 0.1);
  assert.ok(Math.abs(drop.vy - (v0 - 0.981)) < 0.05, "gravity");
  assert.ok(drop.y > 2 && drop.z > 0);
  // Filled in place when given a drop to reuse (no allocation per drop).
  const reuse = { x: 9, y: 9, z: 9, vx: 0, vy: 0, vz: 0, age: 1 };
  const same = Ceremony.sprayDrop({ x: 0, y: 2, z: 0 }, { x: 0, y: 0.6, z: 0.8 }, () => 0.5, reuse);
  assert.equal(same, reuse);
  assert.deepEqual(same, Ceremony.sprayDrop({ x: 0, y: 2, z: 0 }, { x: 0, y: 0.6, z: 0.8 }, () => 0.5));
});

test("the name plates: in once the camera settles, out for the trophy close-up, back for the spray", () => {
  const { anthem, trophy, spray } = Ceremony.BEATS;
  assert.equal(Ceremony.platesShown(1), false);
  assert.equal(Ceremony.platesShown(2.4), true);
  assert.equal(Ceremony.platesShown(4.5), true);
  // Up through the anthem (who is on the podium), aside for the trophy close-up.
  assert.equal(Ceremony.platesShown(anthem + 1), true);
  assert.equal(Ceremony.platesShown(trophy + 2), false);
  assert.equal(Ceremony.platesShown(spray + 1.5), true);
  assert.equal(Ceremony.platesShown(spray + 300), true);
  // With reduced motion the camera holds still: there is no close-up to clear.
  [0, 1, 4.5, 7, 10.5].forEach((t) => assert.equal(Ceremony.platesShown(t, true), true));
});
