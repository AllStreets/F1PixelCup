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

test("the bottles after the lift; confetti from the winner's trophy, spray after it (none on Low)", () => {
  // The bottles come into the hand halfway through the poses' crossfade, not as it starts.
  const half = Ceremony.PROP_SWAP;
  const { trophy, spray } = Ceremony.BEATS;
  assert.ok(half > 0.1 && half < 0.3);
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

test("four scenes, each over before the next begins: arrival, anthem, presentation, champagne", () => {
  [3, 24, 38.3].forEach((anthem) => {
    const C = Ceremony.withAnthem(anthem);
    const B = C.BEATS;
    assert.deepEqual(C.SCENES.map((s) => s.name), ["arrival", "anthem", "presentation", "champagne"]);
    C.SCENES.forEach((s, i) => {
      assert.ok(s.end > s.start, s.name);
      if (i) assert.equal(s.start, C.SCENES[i - 1].end, `${s.name} starts where ${C.SCENES[i - 1].name} ends`);
    });
    assert.equal(C.SCENES[0].start, 0);
    assert.equal(C.SCENES[1].start, B.anthem);
    // The presentation starts after the anthem's time is over, and the champagne after the winner's lift.
    assert.ok(B.present >= B.anthemEnd && B.present - B.anthemEnd <= 1);
    assert.equal(C.SCENES[2].start, B.present);
    assert.equal(C.SCENES[3].start, B.spray);
    assert.equal(C.SCENES[3].end, Infinity);
    assert.equal(C.sceneAt(B.present - 0.01), "anthem");
    assert.equal(C.sceneAt(B.present), "presentation");
    assert.equal(C.sceneAt(B.trophy + 1), "presentation");
    assert.equal(C.sceneAt(B.spray), "champagne");
    assert.equal(C.beatAt(B.present + 1), "presentation");
    assert.equal(C.beatAt(B.trophy + 1), "trophy");
  });
});

test("the presentation: third, second, then the winner; each trophy from the table to the presenter to the driver", () => {
  const C = Ceremony.withAnthem(20);
  const B = C.BEATS;
  const H = C.HANDOVERS;
  assert.deepEqual(H.map((h) => h.place), [3, 2, 1]);
  H.forEach((h, i) => {
    // In order, each finished before the next is picked up.
    assert.ok(h.pick < h.lifted && h.lifted < h.carried && h.carried <= h.arrive && h.arrive <= h.raise && h.raise < h.contact && h.contact < h.release, JSON.stringify(h));
    if (i) assert.ok(h.pick >= H[i - 1].release + 0.3, "one trophy at a time");
    assert.ok(h.pick >= B.present, "not before the anthem is over");
    const where = (t) => C.trophyAt(h.place, t).where;
    assert.equal(where(0), "table");
    assert.equal(where(B.present), "table");
    assert.equal(where(h.pick), "table");
    assert.equal(where(h.lifted + 0.01), "presenter");
    assert.equal(where(h.arrive), "presenter");
    assert.equal(where(h.contact - 0.01), "presenter");
    // From the moment the driver's hand closes on it, it is the driver's (the presenter lets go a moment later).
    assert.equal(where(h.contact + 0.01), "right");
    assert.equal(where(h.release + 0.2), "right");
    // And it ends in the left hand, before the champagne, and stays there.
    assert.ok(h.leftBy <= B.spray - 0.05 + 1e-9, `left hand by ${h.leftBy}, spray at ${B.spray}`);
    assert.equal(where(h.leftBy + 0.01), "left");
    assert.equal(where(B.spray + 100), "left");
    // The pass: about a second, 0 to 1; the right hand has it until both
    // hold it, the left from then on (never neither).
    assert.ok(h.leftBy - h.leftFrom >= 0.8 && h.leftBy - h.leftFrom <= 1.2);
    assert.equal(C.trophyAt(h.place, h.leftFrom).pass, 0);
    assert.equal(C.trophyAt(h.place, h.leftBy).pass, 1);
    assert.ok(C.PASS.joined > 0.3 && C.PASS.joined < C.PASS.given && C.PASS.given < 0.7);
    const at = (pass) => C.trophyAt(h.place, h.leftFrom + pass * (h.leftBy - h.leftFrom));
    assert.equal(at(C.PASS.joined).where, "right");
    assert.equal(at(C.PASS.given - 0.01).where, "right");
    assert.equal(at(C.PASS.given + 0.01).where, "left");
    for (let k = 1; k <= 20; k += 1) assert.ok(at(k / 20).pass >= at((k - 1) / 20).pass, "the pass only goes forward");
    // The driver reaches for it only round its own handover.
    assert.equal(C.reachAt(h.place, h.raise - 0.01), 0);
    assert.equal(C.reachAt(h.place, h.contact), 1);
    assert.equal(C.reachAt(h.place, h.release), 1);
    assert.equal(C.reachAt(h.place, h.release + 1), 0);
    assert.equal(C.reachAt(h.place, B.anthem + 1), 0);
    // Where it changes hands: between the two of them, above the step, at
    // about the driver's elbow.
    const [x, y, z] = C.handPoint(h.place);
    const step = C.stepFor(h.place);
    const p = C.presenterAt(h.contact);
    assert.ok(x > p.x && x < step.x && z < p.z && z > step.standZ + C.STEP_FORWARD, `${x}, ${z}`);
    assert.ok(y - step.height > 0.95 && y - step.height < 1.2);
    assert.ok(Math.hypot(x - p.x, z - p.z) < 0.5, "within the presenter's reach");
  });
  // The winner's is last: it starts the big lift. At a walking pace, with the
  // table off the podium's end, all three take between 17 and 22 seconds.
  assert.equal(H[2].place, 1);
  assert.equal(H[2].release, B.trophy);
  assert.ok(B.trophy - B.present >= 17 && B.trophy - B.present <= 22, `${B.trophy - B.present} s`);
  // No trophy and bottle in one hand: every trophy is in the left before any bottle is in the right.
  [1, 2, 3].forEach((p) => {
    for (let t = B.present; t < B.spray + 20; t += 0.05) {
      if (C.bottleShown(p, t)) assert.equal(C.trophyAt(p, t).where, "left", `place ${p} at ${t}`);
    }
  });
});

test("the lifts: third and second lift theirs as they get it; the one big lift is the winner's, once", () => {
  const C = Ceremony.withAnthem(20);
  const B = C.BEATS;
  const H = Object.fromEntries(C.HANDOVERS.map((h) => [h.place, h]));
  // Every stretch each driver spends in the "trophy" pose.
  const lifts = (place) => {
    const out = [];
    let from = null;
    for (let t = 0; t < B.spray + 30; t += 0.01) {
      const up = C.poseAt(place, t) === "trophy";
      if (up && from === null) from = t;
      if (!up && from !== null) { out.push([from, t]); from = null; }
    }
    return out;
  };
  [3, 2].forEach((p) => {
    const l = lifts(p);
    assert.equal(l.length, 1, `place ${p} lifts once`);
    assert.ok(Math.abs(l[0][0] - H[p].release) < 0.02 && l[0][1] - l[0][0] > 1.5 && l[0][1] - l[0][0] < 2.5);
    // Brought down to the left hand as the lift ends, not from over the head.
    assert.ok(H[p].leftFrom >= l[0][1] - 0.5 && H[p].leftBy > l[0][1]);
  });
  const big = lifts(1);
  assert.equal(big.length, 1, "the winner's lift is played once");
  assert.ok(Math.abs(big[0][0] - B.trophy) < 0.02 && Math.abs(big[0][1] - B.spray) < 0.02);
  // Nobody has a trophy up before being given one (the old moment, a trophy from nowhere, is gone).
  [1, 2, 3].forEach((p) => {
    for (let t = 0; t < H[p].release; t += 0.05) assert.notEqual(C.poseAt(p, t), "trophy");
    assert.equal(C.trophyShown(p, H[p].contact - 0.01), false);
    assert.equal(C.trophyShown(p, H[p].contact + 0.01), true);
    assert.equal(C.trophyShown(p, B.spray + 50), true);
  });
  // While the winner lifts, the other two wave (with the free hand), then all spray.
  assert.equal(C.poseAt(2, B.trophy + 2), "wave");
  assert.equal(C.poseAt(3, B.trophy + 2), "wave");
  // Confetti and the lift's length: 4.6 s, as the sting needs.
  assert.equal(C.confettiOn(B.trophy - 0.01), false);
  assert.equal(C.confettiOn(B.trophy), true);
  assert.ok(Math.abs(B.spray - B.trophy - Ceremony.TROPHY_TIME) < 1e-9 && Ceremony.TROPHY_TIME >= 4.5);
});

// The podium's camera is 36 degrees tall (r3d/podium.js: BASE_FOV). Whether a
// figure standing at (x, z) is in its picture at time t, for a window that
// wide: "whole" (head to foot), "part" (cut by an edge) or "out".
// c: the camera to ask of (the ceremony's own at t, if not given).
function framed(C, t, x, z, aspect, c = C.cameraAt(t)) {
  const f = [c.lookX - c.x, c.lookY - c.y, c.lookZ - c.z];
  const fl = Math.hypot(...f);
  f.forEach((v, i) => { f[i] = v / fl; });
  const r = [-f[2], 0, f[0]];
  const rl = Math.hypot(...r);
  r.forEach((v, i) => { r[i] = v / rl; });
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tan = Math.tan((18 * Math.PI) / 180);
  let seen = 0;
  let all = 0;
  for (let y = 0; y <= 1.8001; y += 0.3) {
    for (const side of [-0.25, 0.25]) {
      const d = [x - c.x, y - c.y, z - c.z];
      const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
      const across = d[0] * r[0] + d[2] * r[2] + side;
      const up = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      all += 1;
      if (depth > 0.2 && Math.abs(across) < depth * tan * aspect && Math.abs(up) < depth * tan) seen += 1;
    }
  }
  return seen === all ? "whole" : seen ? "part" : "out";
}
function inFrame(C, t, x, z, aspect) {
  const c = C.cameraAt(t);
  const f = [c.lookX - c.x, c.lookY - c.y, c.lookZ - c.z];
  const fl = Math.hypot(...f);
  f.forEach((v, i) => { f[i] = v / fl; });
  const r = [-f[2], 0, f[0]];
  const rl = Math.hypot(...r);
  r.forEach((v, i) => { r[i] = v / rl; });
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tan = Math.tan((18 * Math.PI) / 180);
  for (let y = 0; y <= 1.8; y += 0.3) {
    const d = [x - c.x, y - c.y, z - c.z];
    const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (depth < 0.2) continue;
    const across = Math.abs(d[0] * r[0] + d[2] * r[2]) - 0.3;
    const up = Math.abs(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]);
    if (across < depth * tan * aspect && up < depth * tan) return true;
  }
  return false;
}

test("the presenter: waits by the table, to each driver in turn at a walking pace, away before the champagne", () => {
  const C = Ceremony.withAnthem(20);
  const B = C.BEATS;
  const T = C.TABLE;
  // There from the start, standing beside the podium's end by the table,
  // facing the camera; still until the anthem is over.
  const waits = C.presenterAt(0);
  assert.ok(waits.on && Math.abs(waits.x - (T.x + T.stand)) < 1e-9 && Math.abs(waits.z - T.waitZ) < 1e-9 && Math.abs(waits.heading) < 1e-9);
  [1, B.anthem, B.anthem + 10, B.anthemEnd, B.present].forEach((t) => assert.deepEqual(C.presenterAt(t), waits, `still at ${t}`));
  assert.notDeepEqual(C.presenterAt(B.present + 0.2), waits);
  // While they wait, they are never cut by the picture's edge, however
  // close the camera comes for the anthem and however wide the window:
  // seen whole, or not at all.
  [4 / 3, 16 / 9, 21 / 9, 32 / 9].forEach((aspect) => {
    for (let t = 0; t <= B.present; t += 0.1) {
      assert.notEqual(framed(C, t, waits.x, waits.z, aspect), "part", `cut by a ${aspect.toFixed(2)} picture's edge at ${t.toFixed(1)}`);
    }
  });
  assert.equal(framed(C, B.anthemEnd, waits.x, waits.z, 16 / 9), "whole");
  assert.equal(framed(C, B.anthemEnd, waits.x, T.z + T.on[3], 16 / 9), "part", "(the measure: by the table's near end they would be cut)");
  // At each handover: at the foot of that driver's step, facing them, the trophy in hand.
  C.HANDOVERS.forEach((h) => {
    const p = C.presenterAt((h.raise + h.contact) / 2);
    const step = C.stepFor(h.place);
    // (To the driver's right, the viewer's left, so both stay in view; the
    // feet clear of the step's front.)
    assert.ok(step.x - p.x > 0.35 && step.x - p.x < 0.7 && p.z > step.depth / 2 + 0.2 && p.z < step.depth / 2 + 0.5, JSON.stringify(p));
    const toDriver = Math.atan2(step.x - p.x, step.standZ + C.STEP_FORWARD - p.z);
    assert.ok(Math.abs(Math.sin(p.heading - toDriver)) < 0.02 && Math.cos(p.heading - toDriver) > 0.9, "faces the driver");
    assert.equal(p.carrying, h.place);
    assert.ok(p.raise > 0.5);
    assert.equal(C.presenterAt(h.release + 0.01).carrying, null);
    assert.ok(C.presenterAt(h.release + 0.15).nod > 0.3, "a nod");
    assert.deepEqual(h.stands, [p.x, p.z, p.heading]);
    // At the table to take it: beside that trophy, facing the table (-x), standing still.
    const t = C.presenterAt(h.pick + 0.01);
    assert.ok(Math.abs(t.x - (T.x + T.stand)) < 1e-9 && Math.abs(t.z - (T.z + T.on[h.place])) < 1e-9 && Math.sin(t.heading) < -0.999, JSON.stringify(t));
    assert.equal(t.walking, 0);
    assert.ok(t.take > 0 && C.presenterAt(h.lifted).take > 0.99);
  });
  // A walking pace: never over WALK_SPEED, up to it and down again without
  // a jolt; turns are made on the spot, never while walking, and never
  // quicker than a person turns; the legs step with the ground covered.
  assert.ok(C.WALK_SPEED >= 1.4 && C.WALK_SPEED <= 1.9);
  const dt = 0.01;
  let walked = 0;
  let last = 0;
  const inside = (p, box, margin) => Math.abs(p.x - box.x) < box.w / 2 + margin && Math.abs(p.z - box.z) < box.d / 2 + margin;
  for (let t = B.present; t < B.presenterGone - dt; t += dt) {
    const a = C.presenterAt(t);
    const b = C.presenterAt(t + dt);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(d <= C.WALK_SPEED * dt + 1e-9, `${d / dt} m/s at ${t}`);
    assert.ok(Math.abs(d - last) <= (C.WALK_SPEED / C.RAMP) * dt * dt + 1e-9, `a jolt at ${t}`);
    last = d;
    let turn = Math.abs(a.heading - b.heading) % (2 * Math.PI);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    // (No quicker than a person turns with a trophy in their hands: 4.6 rad/s at the fastest.)
    assert.ok(turn < 0.046, `turns ${turn} at ${t}`);
    // (10 ms can span the end of a turn and a walk's first step: under 0.3 mm, 0.002 rad.)
    assert.ok(d < 3e-4 || turn < 2e-3, `turns while walking at ${t}`);
    // (Walking, they face the way they go.)
    if (d > 1e-3) assert.ok(Math.cos(Math.atan2(b.x - a.x, b.z - a.z) - a.heading) > 1 - 1e-9, `sideways at ${t}`);
    assert.ok(Math.abs((b.stride - a.stride) - d - turn * C.TURN_STEP) < 1e-6, "the legs step with the ground covered");
    if (d > 1e-9 || turn > 1e-9) assert.ok(a.walking > 0 || b.walking > 0, `the legs are still at ${t}`);
    else assert.ok(a.walking === 0 && b.walking === 0, `the legs move at ${t}`);
    walked += d;
    // Never through a step or the table.
    [1, 2, 3].forEach((place) => {
      const s = C.stepFor(place);
      assert.ok(!inside(a, { x: s.x, z: 0, w: s.width, d: s.depth }, 0.2), `through step ${place} at ${t}`);
    });
    assert.ok(!inside(a, { x: T.x, z: T.z, w: T.width, d: T.length }, 0.15), `through the table at ${t}`);
  }
  assert.ok(walked > 14 && walked < 28, `walks ${walked} m`);
  // Away once the winner has it: along the podium's front, never toward
  // the camera, behind the table.
  for (let t = B.trophy; t < B.presenterGone; t += 0.05) {
    const p = C.presenterAt(t);
    assert.ok(Math.abs(p.z - C.PRESENT.spotZ) < 1e-9, `toward or away from the camera at ${t}`);
    assert.ok(p.z < T.z - T.length / 2 - 0.15, "behind the table");
  }
  // Out of the picture (a 16:9 window, and one as wide as 21:9) before the
  // first bottle is in a hand, and never back in it; then gone from the scene.
  [16 / 9, 21 / 9].forEach((aspect) => {
    for (let t = B.spray - 0.3; t < B.spray + 12; t += 0.02) {
      const p = C.presenterAt(t);
      if (p.on) assert.ok(!inFrame(C, t, p.x, p.z, aspect), `in a ${aspect.toFixed(2)} picture at spray ${(t - B.spray).toFixed(2)}`);
    }
  });
  assert.ok(inFrame(C, B.trophy, C.presenterAt(B.trophy).x, C.presenterAt(B.trophy).z, 16 / 9), "(the measure: in the picture at the handover)");
  assert.equal(C.presenterAt(B.presenterGone).on, false);
  assert.equal(C.presenterAt(B.spray + 60).on, false);
  assert.ok(B.presenterGone < B.spray + 4);
  assert.ok(C.presenterAt(B.presenterGone - 0.01).x < -11.5, "walked out past the wall's end, not vanished in view");
});

test("the table: off the podium's end, clear of every step's front from wherever the camera is, the trophies in a row on it", () => {
  const C = Ceremony.withAnthem(20);
  const B = C.BEATS;
  const T = C.TABLE;
  const left = C.stepFor(2);
  assert.ok(T.x + T.width / 2 < left.x - left.width / 2 - 0.3, "beyond the podium's left end");
  assert.ok(T.length >= 1.1 && T.height > 0.7 && T.height < 1);
  // The three stand apart along it (the widest is 0.43 m across its handles), all on its top.
  const along = [3, 2, 1].map((p) => T.on[p]);
  assert.ok(along[0] > along[1] && along[1] > along[2], "the bronze nearest the camera, the gold at the back");
  assert.ok(along[0] - along[1] >= 0.4 && along[1] - along[2] >= 0.4);
  along.forEach((z) => assert.ok(Math.abs(z) + 0.22 <= T.length / 2 + 1e-9));
  // From the camera, wherever it is, the table never comes across the foot
  // of a step's front (where its number is): the sight line to the front's
  // nearest corner passes the table's near corner on the podium's side.
  const corner = [left.x - left.width / 2, left.depth / 2];
  for (let t = 0; t < B.spray + 40; t += 0.25) {
    const c = C.cameraAt(t);
    const z = T.z + T.length / 2;
    const x = c.x + ((corner[0] - c.x) * (c.z - z)) / (c.z - corner[1]);
    assert.ok(x > T.x + T.width / 2, `over step 2's front at ${t}`);
  }
});

test("the presentation's shot: follows each handover from its open side, at an easy pace", () => {
  const C = Ceremony.withAnthem(20);
  const B = C.BEATS;
  C.HANDOVERS.forEach((h) => {
    // As it is taken: the table and the presenter are in the picture.
    const p = C.presenterAt(h.pick + 0.2);
    assert.ok(inFrame(C, h.pick + 0.2, p.x, p.z, 16 / 9) && inFrame(C, h.pick + 0.2, C.TABLE.x - 0.3, C.TABLE.z, 16 / 9), `the table at ${h.place}`);
    // As it is given: looking at the handover, from the driver's side of
    // the presenter: the line from the camera to the trophy passes the
    // presenter's shoulder with room to spare (so it is seen between them,
    // not hidden by a back). The same from the still camera reduced motion keeps.
    const [x, , z] = C.handPoint(h.place);
    const q = C.presenterAt(h.contact);
    const past = (c) => c.x + ((x - c.x) * (c.z - q.z)) / (c.z - z) - q.x;
    const c = C.cameraAt(h.contact);
    assert.ok(Math.abs(c.lookX - x) < 1.2, `looks at ${c.lookX}, the handover at ${x}`);
    assert.ok(past(c) > 0.3, `the trophy ${past(c)} m past the presenter`);
    assert.ok(inFrame(C, h.contact, q.x, q.z, 16 / 9));
    const still = C.stillCameraAt(h.contact);
    assert.ok(past(still) > 0.3, `the still camera: the trophy ${past(still)} m past the presenter`);
    assert.equal(framed(C, h.contact, q.x, q.z, 16 / 9, still), "whole");
    assert.equal(framed(C, h.pick, C.TABLE.x, C.TABLE.z, 16 / 9, still), "whole");
    assert.ok(past(C.cameraAt(B.sweepEnd)) < 0.3 || h.place === 2, "(the measure: from straight ahead the presenter is in the way)");
  });
  // Never faster than a camera on a dolly: 3 m/s.
  for (let t = B.present - 1; t < B.spray + 3; t += 0.01) {
    const a = C.cameraAt(t);
    const b = C.cameraAt(t + 0.01);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.03, `${Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 100} m/s at ${(t - B.present).toFixed(2)}`);
  }
  // The still camera: the settled view, but for the presentation, when it
  // stands further right (a cut there and back; nothing else about it moves).
  const settled = C.cameraAt(B.sweepEnd);
  [0, 3, B.anthem + 5, B.present - 0.01, B.trophy, B.trophy + 2, B.spray + 9].forEach((t) => assert.deepEqual(C.stillCameraAt(t), settled, `the still camera at ${t}`));
  [B.present, B.present + 5, B.trophy - 0.01].forEach((t) => {
    const s = C.stillCameraAt(t);
    assert.deepEqual({ ...s, x: 0 }, { ...settled, x: 0 });
    assert.deepEqual(s, C.stillCameraAt(B.present));
    assert.ok(s.x - settled.x > 3);
  });
  // Back on the winner, straight ahead, for the lift.
  const lift = C.cameraAt(B.trophy + 3);
  assert.ok(Math.abs(lift.x) < 0.2 && Math.abs(lift.lookX) < 0.05);
});
