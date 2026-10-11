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
    assert.ok(h.pick >= B.present + 1.5, "after the walk on");
    const where = (t) => C.trophyAt(h.place, t).where;
    assert.equal(where(B.present), "table");
    assert.equal(where(h.pick), "table");
    assert.equal(where(h.lifted + 0.01), "presenter");
    assert.equal(where(h.arrive), "presenter");
    assert.equal(where(h.contact - 0.01), "presenter");
    // From the moment the driver's hand closes on it, it is the driver's (the presenter lets go a moment later).
    assert.equal(where(h.contact + 0.01), "right");
    assert.equal(where(h.release + 0.2), "right");
    // And it ends in the left hand, before the champagne, and stays there.
    assert.ok(h.leftBy <= B.spray - 0.05, `left hand by ${h.leftBy}, spray at ${B.spray}`);
    assert.equal(where(h.leftBy + 0.01), "left");
    assert.equal(where(B.spray + 100), "left");
    // The pass from right hand to left is a short blend, 0 to 1.
    assert.equal(C.trophyAt(h.place, h.leftFrom).pass, 0);
    assert.ok(C.trophyAt(h.place, (h.leftFrom + h.leftBy) / 2).pass > 0.2 && C.trophyAt(h.place, (h.leftFrom + h.leftBy) / 2).pass < 0.8);
    assert.equal(C.trophyAt(h.place, h.leftBy).pass, 1);
    // The driver reaches for it only round its own handover.
    assert.equal(C.reachAt(h.place, h.raise - 0.01), 0);
    assert.equal(C.reachAt(h.place, h.contact), 1);
    assert.equal(C.reachAt(h.place, h.release), 1);
    assert.equal(C.reachAt(h.place, h.release + 1), 0);
    assert.equal(C.reachAt(h.place, B.anthem + 1), 0);
  });
  // All three are given within about 12 to 16 seconds, and the winner's is last: it starts the big lift.
  assert.equal(H[2].place, 1);
  assert.equal(H[2].release, B.trophy);
  assert.ok(B.trophy - B.present >= 11 && B.trophy - B.present <= 16, `${B.trophy - B.present} s`);
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
    assert.ok(Math.abs(l[0][0] - H[p].release) < 0.02 && l[0][1] - l[0][0] > 1 && l[0][1] - l[0][0] < 2.5);
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

test("the presenter: on from the side, to the table and each driver in turn, off before the champagne; never jumps", () => {
  const C = Ceremony.withAnthem(20);
  const B = C.BEATS;
  assert.equal(C.presenterAt(B.present - 0.1).on, false);
  assert.equal(C.presenterAt(B.anthem + 3).on, false);
  const first = C.presenterAt(B.present + 0.01);
  assert.ok(first.on && Math.abs(first.x) > 4.5, "starts off to the side");
  // At each handover: at the foot of that driver's step, facing the podium, the trophy in hand.
  C.HANDOVERS.forEach((h) => {
    const p = C.presenterAt((h.raise + h.contact) / 2);
    const step = C.stepFor(h.place);
    // (To the driver's right, the viewer's left, so both stay in view; at
    // the foot of the step, well short of the table.)
    assert.ok(step.x - p.x > 0.35 && step.x - p.x < 0.7 && p.z > step.depth / 2 + 0.05 && p.z < step.depth / 2 + 0.5, JSON.stringify(p));
    assert.ok(p.z < C.TABLE.z - 1, "well short of the table");
    const toDriver = Math.atan2(step.x - p.x, step.standZ + C.STEP_FORWARD - p.z);
    assert.ok(Math.abs(Math.sin(p.heading - toDriver)) < 0.02 && Math.cos(p.heading - toDriver) > 0.9, "faces the driver");
    assert.equal(p.carrying, h.place);
    assert.ok(p.raise > 0.5);
    assert.equal(C.presenterAt(h.release + 0.01).carrying, null);
    assert.ok(C.presenterAt(h.release + 0.2).nod > 0.3, "a nod");
    // At the table to take it: by the table, facing it (+z).
    const t = C.presenterAt(h.pick + 0.01);
    assert.ok(Math.hypot(t.x - C.TABLE.x, t.z - (C.TABLE.z - C.TABLE.stand)) < 0.05 && Math.cos(t.heading) > 0.98, JSON.stringify(t));
  });
  // Gone before the first bottle: off stage, and no longer in the scene.
  assert.equal(C.presenterAt(B.spray - 0.01).on, false);
  assert.equal(C.presenterAt(B.spray + 5).on, false);
  assert.ok(B.presenterGone <= B.spray - 0.5);
  // Never jumps: 10 ms apart it moves under 4 cm (2.3 m/s is 2.3 cm, more at the middle of an eased walk) and turns under 0.14 rad; the legs move only when it does.
  let walked = 0;
  for (let t = B.present; t < B.presenterGone; t += 0.01) {
    const a = C.presenterAt(t);
    const b = C.presenterAt(t + 0.01);
    if (!b.on) break;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(d < 0.045, `moves ${d} at ${t}`);
    let turn = Math.abs(a.heading - b.heading) % (2 * Math.PI);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    assert.ok(turn < 0.14, `turns ${turn} at ${t}`);
    assert.ok(Math.abs((b.stride - a.stride) - d) < 1e-6, "the stride is the distance walked");
    walked += d;
  }
  assert.ok(walked > 12 && walked < 26, `walks ${walked} m`);
  // The table: in front of the podium, beside the first step's number (it
  // does not span the middle of any step), and not where a presenter stands.
  const T = C.TABLE;
  assert.ok(T.z > 1.8);
  [1, 2, 3].forEach((p) => assert.ok(Math.abs(T.x - C.stepFor(p).x) > T.width / 2 - 0.1, `the table over step ${p}'s number`));
  C.HANDOVERS.forEach((h) => assert.ok(Math.abs(C.presenterAt(h.contact).x - T.x) > T.width / 2 + 0.3, `the presenter behind the table for ${h.place}`));
});
