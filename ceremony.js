// The podium ceremony's rules (docs/superpowers/specs/2026-09-30-podium-design.md):
// the timeline as a function of real time, the camera's path, the steps, the
// counts per graphics tier and the confetti and spray physics. Pure; in the
// page this defines window.Ceremony, in Node it is require()-able for the tests.
// r3d/podium.js draws what this says.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Ceremony = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // A ceremony runs as a real podium does: the drivers step up, the winner's
  // anthem plays while all three stand, then the trophies are presented
  // (third, second, the winner last, whose lift is the big one), then the
  // champagne. anthemSeconds is how long the anthem (or what stands in for
  // it) runs; everything after it moves with it. Without one given, a short pause.
  // (docs/superpowers/specs/2026-10-12-trophy-presentation-design.md)
  const DEFAULT_ANTHEM = 3;
  // The winner's lift (its fanfare sting has ended, echo and all, within it).
  const TROPHY_TIME = 4.6;
  // The presentation: the table the trophies wait on (in front of the
  // podium, beside the first step's number and clear of where the presenter
  // stands for each handover; the
  // presenter stands `stand` m on the podium's side of it, `on` is where each
  // trophy sits along it), and how long each part of a handover takes (s).
  const TABLE = { x: 0.32, z: 2.3, width: 0.74, depth: 0.42, height: 0.78, stand: 0.38, on: { 1: 0, 2: -0.2, 3: 0.2 } };
  const WALK_SPEED = 2.3;
  const PRESENT = { gap: 0.5, pick: 0.55, lift: 0.3, give: 1.0, contact: 0.7, nod: 0.35, turn: 0.5, liftFor: 1.7, pass: 0.55, spotZ: 0.74, spotSide: -0.5, offX: 5.6, offZ: 1.9 };
  function withAnthem(anthemSeconds = DEFAULT_ANTHEM) {
    if (!(anthemSeconds >= 0) || !Number.isFinite(anthemSeconds)) throw new Error(`anthem length ${anthemSeconds}`);
    // Seconds from the start of the ceremony.
    const BEATS = {
      sweepEnd: 2.5,
      // Arms up in turn, each stepping forward: P3, then P2, then P1.
      arms: { 3: 2.5, 2: 3.3, 1: 4.1 },
      // Arms down, to stand for the anthem.
      armsDown: 5.2,
      anthem: 5.8,
      anthemEnd: 5.8 + anthemSeconds,
      // The presentation; `trophy` is the winner taking theirs (the big lift).
      present: 5.8 + anthemSeconds + PRESENT.gap,
    };
    const STEP_TIME = 0.6;
    // How far each driver steps forward on their step (m).
    const STEP_FORWARD = 0.22;

    // The steps, in metres. The camera looks down -Z from +Z, so screen left is
    // -X: P2 on the left of P1 and P3 on the right, as a real ceremony and the
    // 2D steps have them. The drivers stand a little back, room to step forward.
    const STEPS = {
      1: { place: 1, x: 0, width: 1.6, depth: 1.3, height: 0.95, standZ: -0.12 },
      2: { place: 2, x: -1.6, width: 1.6, depth: 1.3, height: 0.62, standZ: -0.12 },
      3: { place: 3, x: 1.6, width: 1.6, depth: 1.3, height: 0.38, standZ: -0.12 },
    };
    const stepFor = (place) => ({ ...STEPS[place] });

    const smooth = (a, b, t) => {
      const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
      return x * x * x * (x * (x * 6 - 15) + 10);
    };

    // ---- The presentation's schedule ----
    // The presenter's path: straight walks between places, a turn on the
    // spot at each (the table, the foot of each step), the handovers between.
    // legs: [{ from, to, a: [x, z], b: [x, z] }] walks; stops: [{ from, to,
    // at: [x, z], heading, h: the handover in progress }].
    const tableSpot = [TABLE.x, TABLE.z - TABLE.stand];
    // At the foot of a driver's step, to the driver's right (the hand that
    // takes it; the viewer's left), turned to face them: close enough for
    // the two to reach each other, and both in view.
    const spotFor = (place) => [STEPS[place].x + PRESENT.spotSide, PRESENT.spotZ];
    const FACE_TABLE = 0;
    const faceDriver = (place) => Math.atan2(-PRESENT.spotSide, STEPS[place].standZ + STEP_FORWARD - PRESENT.spotZ);
    const HANDOVERS = [];
    const path = [];
    let clock = BEATS.present;
    let here = [PRESENT.offX, PRESENT.offZ];
    const walk = (to) => {
      const time = Math.max(0.45, Math.hypot(to[0] - here[0], to[1] - here[1]) / WALK_SPEED);
      path.push({ kind: "walk", from: clock, to: clock + time, a: here, b: to });
      clock += time;
      here = to;
    };
    const stop = (time, heading, what) => {
      path.push({ kind: "stop", from: clock, to: clock + time, at: here, heading, ...what });
      clock += time;
    };
    walk(tableSpot);
    [3, 2, 1].forEach((place) => {
      const h = { place };
      // At the table: turn to it, take the trophy in both hands, lift it.
      h.pick = clock + PRESENT.turn;
      h.lifted = h.pick + PRESENT.lift;
      h.carried = h.pick + PRESENT.pick;
      stop(PRESENT.turn + PRESENT.pick, FACE_TABLE, { place });
      walk(spotFor(place));
      // At the step: hold it up; the driver's hand closes on it; let go, nod.
      h.arrive = clock;
      h.raise = clock + PRESENT.turn;
      h.contact = h.raise + PRESENT.contact;
      h.release = h.raise + PRESENT.give;
      stop(PRESENT.turn + PRESENT.give + PRESENT.nod, faceDriver(place), { place });
      // The driver lifts it, then passes it to the left hand (the winner at
      // the end of the big lift, in time for the bottle).
      h.liftEnd = place === 1 ? h.release + TROPHY_TIME : h.release + PRESENT.liftFor;
      h.leftBy = h.liftEnd - (place === 1 ? 0.15 : 0);
      h.leftFrom = h.leftBy - PRESENT.pass;
      HANDOVERS.push(h);
      if (place !== 1) walk(tableSpot);
    });
    // The winner has it: a step back, and off the way they came.
    walk([here[0] - 0.3, here[1] + 0.9]);
    walk([PRESENT.offX, PRESENT.offZ]);
    BEATS.trophy = HANDOVERS[2].release;
    BEATS.spray = BEATS.trophy + TROPHY_TIME;
    BEATS.presenterGone = clock;
    const handover = Object.fromEntries(HANDOVERS.map((h) => [h.place, h]));

    // Four scenes, each over before the next begins.
    const SCENES = [
      { name: "arrival", start: 0, end: BEATS.anthem },
      { name: "anthem", start: BEATS.anthem, end: BEATS.present },
      { name: "presentation", start: BEATS.present, end: BEATS.spray },
      { name: "champagne", start: BEATS.spray, end: Infinity },
    ];
    const sceneAt = (t) => (SCENES.find((sc) => t >= sc.start && t < sc.end) || SCENES[0]).name;

    function beatAt(t) {
      if (t < BEATS.sweepEnd) return "sweep";
      if (t < BEATS.armsDown) return "arms";
      if (t < BEATS.present) return "anthem";
      if (t < BEATS.trophy) return "presentation";
      if (t < BEATS.spray) return "trophy";
      return "spray";
    }

    // Each driver lifts their trophy as they are given it; the winner's is
    // the big one, to the champagne. Before and between, they stand; while
    // the winner lifts, the other two wave with the free hand.
    function poseAt(place, t) {
      if (t < BEATS.arms[place]) return "stand";
      if (t < BEATS.armsDown) return "arms_up";
      const h = handover[place];
      if (t >= h.release && t < h.liftEnd) return "trophy";
      if (t >= BEATS.spray) return "spray";
      if (t >= BEATS.trophy) return "wave";
      return "stand";
    }

    // Where the presenter is: { on, x, z, heading (0 faces +z, the camera;
    // pi faces the podium), stride (metres walked so far: the legs' phase),
    // walking (0..1), carrying (the place whose trophy is in their hands),
    // take (0..1 reaching to the table), raise (0..1 holding it up to the
    // driver), nod (0..1) }.
    const headingOf = (leg) => Math.atan2(leg.b[0] - leg.a[0], leg.b[1] - leg.a[1]);
    const turned = (from, to, u) => {
      let d = (to - from) % (2 * Math.PI);
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      return from + d * u;
    };
    function presenterAt(t) {
      const off = { on: false, x: PRESENT.offX, z: PRESENT.offZ, heading: 0, stride: 0, walking: 0, carrying: null, take: 0, raise: 0, nod: 0 };
      if (t < BEATS.present || t >= BEATS.presenterGone) return off;
      let stride = 0;
      for (let i = 0; i < path.length; i += 1) {
        const leg = path[i];
        const length = leg.kind === "walk" ? Math.hypot(leg.b[0] - leg.a[0], leg.b[1] - leg.a[1]) : 0;
        if (t >= leg.to) { stride += length; continue; }
        const prev = path[i - 1];
        const next = path[i + 1];
        const carrying = HANDOVERS.find((h) => t >= h.lifted && t < h.contact);
        const base = { ...off, on: true, carrying: carrying ? carrying.place : null };
        if (leg.kind === "walk") {
          // Eased at both ends, so a walk starts and stops without a jolt;
          // the turn into its direction is made as it sets off.
          const u = smooth(leg.from, leg.to, t);
          const heading = headingOf(leg);
          const was = prev ? (prev.kind === "walk" ? headingOf(prev) : prev.heading) : heading;
          return { ...base, x: leg.a[0] + (leg.b[0] - leg.a[0]) * u, z: leg.a[1] + (leg.b[1] - leg.a[1]) * u,
            heading: turned(was, heading, smooth(leg.from, leg.from + Math.min(0.7, leg.to - leg.from), t)), stride: stride + length * u,
            walking: Math.min(1, (t - leg.from) / 0.2, (leg.to - t) / 0.2) };
        }
        const h = handover[leg.place];
        const was = prev.kind === "walk" ? headingOf(prev) : prev.heading;
        const out = { ...base, x: leg.at[0], z: leg.at[1], heading: turned(was, leg.heading, smooth(leg.from, leg.from + PRESENT.turn, t)), stride };
        if (t < h.carried) {
          out.take = smooth(leg.from + 0.1, h.pick + 0.25, t) * (1 - smooth(h.lifted, h.carried, t));
        } else {
          out.raise = smooth(h.raise, h.raise + 0.5, t) * (1 - smooth(h.release, h.release + 0.3, t));
          const n = (t - h.release) / PRESENT.nod;
          out.nod = n > 0 && n < 1 ? Math.sin(n * Math.PI) : 0;
        }
        return out;
      }
      return off;
    }

    // Where a trophy is: on the "table"; in the "presenter"'s hands; in the
    // driver's "right" hand (from the moment it closes on it); in the "left".
    // pass: 0 to 1 as it goes from the right hand to the left.
    function trophyAt(place, t) {
      const h = handover[place];
      if (t < h.lifted) return { where: "table", pass: 0 };
      if (t < h.contact) return { where: "presenter", pass: 0 };
      const pass = smooth(h.leftFrom, h.leftBy, t);
      return { where: t >= h.leftBy ? "left" : "right", pass };
    }

    // How far the driver's right hand is reached out to take it (0..1): out
    // as the presenter holds it up, on it at the contact, eased back into
    // the lift once the presenter has let go.
    function reachAt(place, t) {
      const h = handover[place];
      if (t <= h.raise || t >= h.release + 0.45) return 0;
      if (t < h.contact) return smooth(h.raise + 0.15, h.contact, t);
      return 1 - smooth(h.release, h.release + 0.45, t);
    }

    function forwardAt(place, t) {
      const at = BEATS.arms[place];
      return smooth(at, at + STEP_TIME, t);
    }

    // The trophy and the bottles change hands halfway through the poses'
    // crossfade (r3d/driver.js fades poses over 0.35 s), as the hands meet.
    const PROP_SWAP = 0.175;
    // Whether the driver has their trophy yet (from the handover on, for good).
    const trophyShown = (place, t) => t >= handover[place].contact;
    const bottleShown = (place, t) => t >= BEATS.spray + PROP_SWAP;
    const confettiOn = (t) => t >= BEATS.trophy;
    // Each bottle's cork goes a moment after it is in the hand, one driver
    // after another (P1's first), and that driver's spray starts with it.
    const CORK_AFTER = { 1: 0.45, 2: 0.75, 3: 1.0 };
    const corkAt = (place) => BEATS.spray + PROP_SWAP + CORK_AFTER[place];
    // place: that driver's bottle; without one, whether any bottle sprays yet.
    const sprayOn = (t, tier, place = 1) => tier !== "low" && t >= corkAt(place);

    // The name plates come in as the camera settles and step aside for the
    // presentation (the camera follows the handovers, then is close on P1
    // with the trophy), as a broadcast's captions do.
    // With reduced motion (still) the camera holds its settled view: they stay.
    const platesShown = (t, still = false) => still || (t >= BEATS.sweepEnd - 0.3 && !(t > BEATS.present + 0.2 && t < BEATS.spray + 0.6));

    const COUNTS = {
      high: { confetti: 600, spray: 1500 },
      medium: { confetti: 300, spray: 750 },
      low: { confetti: 120, spray: 0 },
    };
    const counts = (tier) => ({ ...(COUNTS[tier] || COUNTS.medium) });

    // The camera: a sweep in from high and wide; through the anthem a slow,
    // steady push on the winner from straight ahead (their banner behind
    // them); for the presentation a medium shot that follows each handover
    // along the podium; closer on the winner while the gold trophy goes up;
    // then back out to a slow pendulum orbit in front of the wall that
    // repeats for as long as the screen is up. Every move is a smooth blend,
    // so nothing jumps.
    const ORBIT_PERIOD = 26;
    const ORBIT_SWING = 0.34;
    // What the medium shot looks at (x): the table as the presenter comes
    // on, then each handover's step in turn, back to the middle for the winner.
    const follow = [[BEATS.present, 0]];
    follow.push([BEATS.present + 1.6, TABLE.x * 0.7]);
    HANDOVERS.forEach((h) => {
      follow.push([h.carried, follow[follow.length - 1][1]]);
      follow.push([h.raise, STEPS[h.place].x * 0.7 - 0.2]);
      if (h.place !== 1) follow.push([h.release + 0.9, STEPS[h.place].x * 0.7 - 0.2]);
    });
    function followX(t) {
      for (let i = 1; i < follow.length; i += 1) {
        if (t < follow[i][0]) return follow[i - 1][1] + (follow[i][1] - follow[i - 1][1]) * smooth(follow[i - 1][0], follow[i][0], t);
      }
      return follow[follow.length - 1][1];
    }
    function cameraAt(t) {
      const sweep = smooth(0, BEATS.sweepEnd, t);
      // (Steady through the anthem's middle, eased in and out at its ends.)
      const span = Math.max(1e-6, BEATS.anthemEnd - BEATS.armsDown);
      const ramp = Math.min(1.5, span / 3);
      const speed = 1 / (span - ramp);
      const u = Math.max(0, Math.min(span, t - BEATS.armsDown));
      const anthem = u < ramp ? (speed * u * u) / (2 * ramp)
        : u < span - ramp ? speed * (u - ramp / 2)
          : 1 - (speed * (span - u) * (span - u)) / (2 * ramp);
      // The presentation's shot: back out from the anthem's close far enough
      // to hold the presenter (on the floor) and the drivers together.
      const medium = smooth(BEATS.present - 0.2, BEATS.present + 1.8, t);
      const push = smooth(BEATS.trophy - 0.3, BEATS.trophy + 3.2, t);
      const back = smooth(BEATS.spray, BEATS.spray + 2.6, t);
      const orbitIn = smooth(BEATS.spray, BEATS.spray + 3, t);
      const p1Head = STEPS[1].height + 1.6;
      // Distance to what it looks at, its height, and where it looks.
      // (Framed with room above the wall's title for the page's own title.)
      const radius = 17 + (10.4 - 17) * sweep + (9.9 - 10.4) * smooth(BEATS.sweepEnd, BEATS.armsDown, t)
        + (7.4 - 9.9) * anthem + (9.3 - 7.4) * medium + (6.4 - 9.3) * push + (10.2 - 6.4) * back;
      const lookY = 2.1 + (p1Head - 0.1 - 2.1) * anthem + (2.0 - p1Head + 0.1) * medium + (p1Head + 0.3 - 2.0) * push + (2.15 - p1Head - 0.3) * back;
      const height = 6.8 + (2.5 - 6.8) * sweep + 0.1 * anthem - 0.1 * medium + (p1Head + 0.1 - 2.5) * push + (2.7 - p1Head - 0.1) * back;
      const lookZ = 0.0 + 0.3 * medium + (0.1 - 0.3) * push - 0.1 * back;
      const lookX = followX(t) * (1 - smooth(BEATS.trophy - 0.4, BEATS.trophy + 1.2, t));
      const orbit = ORBIT_SWING * Math.sin(((t - BEATS.spray) * 2 * Math.PI) / ORBIT_PERIOD) * orbitIn;
      const angle = 0.5 * (1 - sweep) + orbit;
      return {
        // (The shot moves out to the side of what it follows, so each
        // handover is seen a little from its own side, past the table.)
        x: lookX * 1.7 + Math.sin(angle) * radius,
        y: height,
        z: lookZ + Math.cos(angle) * radius,
        lookX,
        lookY,
        lookZ,
      };
    }

    // The vertical field of view that keeps the 16:9 frame's width on a
    // narrower window (wider windows keep the height).
    function fitFov(fov, aspect, reference = 16 / 9) {
      if (aspect >= reference) return fov;
      const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (reference / aspect));
      return (half * 360) / Math.PI;
    }

    // Each cup's colour, for the steps' faces; a cup without one of its own
    // takes one from the palette, always the same for the same cup.
    const CUP_COLOURS = {
      openingCup: "#b3122e", springCup: "#1d47c4", summerCup: "#0f7a55",
      classicsCup: "#7a2fb3", autumnCup: "#c4621d", finaleCup: "#13808f", season: "#a8861a",
      legendsCup: "#5a5f6e", goldenEraCup: "#b8902a",
      // The cups the player makes (choices.js), and the single race.
      randomCup: "#c2185b", customCup: "#2e7d32", singleRace: "#455a8a",
      // The two cups before the calendar, for an old replay or record.
      trophyCup: "#b3122e", constructorCup: "#1d47c4",
    };
    const PALETTE = ["#b3122e", "#1d47c4", "#0f7a55", "#7a2fb3", "#c4621d", "#13808f"];
    function cupColour(cupId) {
      if (CUP_COLOURS[cupId]) return CUP_COLOURS[cupId];
      let h = 0;
      for (const ch of String(cupId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return PALETTE[h % PALETTE.length];
    }

    // Confetti: paper. Gravity against a drag that holds it to about a metre a
    // second, a sideways flutter, and when it reaches what is under it, it lies
    // there. groundAt(x, z) is the height of the floor or the step below.
    const G = 9.81;
    const PAPER_DRAG = 9;
    function stepConfetti(p, dt, groundAt) {
      if (p.landed) return p;
      p.vy = (p.vy - G * dt) / (1 + PAPER_DRAG * dt);
      p.vx /= (1 + PAPER_DRAG * 0.35 * dt);
      p.vz /= (1 + PAPER_DRAG * 0.35 * dt);
      p.phase += p.spin * dt;
      // The flutter: paper slides side to side as it tips.
      const flutter = 0.45;
      p.x += (p.vx + Math.sin(p.phase) * flutter) * dt;
      p.z += (p.vz + Math.cos(p.phase * 0.7) * flutter * 0.6) * dt;
      p.y += p.vy * dt;
      const ground = groundAt(p.x, p.z);
      if (p.y <= ground) {
        p.y = ground;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
        p.landed = true;
      }
      return p;
    }

    // Champagne: a drop leaves the neck along the bottle at a few metres a
    // second, spread a little, and falls under gravity with a little air drag.
    // out: a drop to fill in place (the pool's own), else a new one.
    const SPRAY_SPEED = 6.5;
    function sprayDrop(neck, dir, random = Math.random, out = {}) {
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const spread = 0.09;
      const speed = SPRAY_SPEED * (0.7 + random() * 0.5);
      out.x = neck.x;
      out.y = neck.y;
      out.z = neck.z;
      out.vx = (dir.x / len + (random() - 0.5) * 2 * spread) * speed;
      out.vy = (dir.y / len + (random() - 0.5) * 2 * spread) * speed;
      out.vz = (dir.z / len + (random() - 0.5) * 2 * spread) * speed;
      out.age = 0;
      return out;
    }

    function stepDrop(d, dt) {
      const drag = 1 / (1 + 0.15 * dt);
      d.vx *= drag;
      d.vz *= drag;
      d.vy = (d.vy - G * dt) * drag;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.age += dt;
      return d;
    }

    return {
      BEATS, SCENES, HANDOVERS, TABLE, PRESENT, STEP_FORWARD, ORBIT_PERIOD, PROP_SWAP, anthemSeconds, stepFor, sceneAt, beatAt, poseAt, forwardAt,
      presenterAt, trophyAt, reachAt, trophyShown, bottleShown, confettiOn, sprayOn, corkAt, platesShown,
      counts, cameraAt, fitFov, cupColour, stepConfetti, sprayDrop, stepDrop,
    };
  }

  return { ...withAnthem(), withAnthem, DEFAULT_ANTHEM, TROPHY_TIME };
}));
