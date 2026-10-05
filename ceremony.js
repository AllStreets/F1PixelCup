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
  // Seconds from the start of the ceremony.
  const BEATS = {
    sweepEnd: 2.5,
    // Arms up in turn, each stepping forward: P3, then P2, then P1.
    arms: { 3: 2.5, 2: 3.3, 1: 4.1 },
    trophy: 5,
    spray: 9,
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

  function beatAt(t) {
    if (t < BEATS.sweepEnd) return "sweep";
    if (t < BEATS.trophy) return "arms";
    if (t < BEATS.spray) return "trophy";
    return "spray";
  }

  function poseAt(place, t) {
    if (t < BEATS.arms[place]) return "stand";
    if (t < BEATS.trophy) return "arms_up";
    if (t < BEATS.spray) return place === 1 ? "trophy" : "wave";
    return "spray";
  }

  const smooth = (a, b, t) => {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * x * (x * (x * 6 - 15) + 10);
  };

  function forwardAt(place, t) {
    const at = BEATS.arms[place];
    return smooth(at, at + STEP_TIME, t);
  }

  // The trophy and the bottles change hands halfway through the poses'
  // crossfade (r3d/driver.js fades poses over 0.35 s), as the hands meet.
  const PROP_SWAP = 0.175;
  const trophyShown = (place, t) => place === 1 && t >= BEATS.trophy + PROP_SWAP && t < BEATS.spray + PROP_SWAP;
  const bottleShown = (place, t) => t >= BEATS.spray + PROP_SWAP;
  const confettiOn = (t) => t >= BEATS.trophy;
  const sprayOn = (t, tier) => t >= BEATS.spray && tier !== "low";

  // The name plates come in as the camera settles and step aside while it
  // is close on P1 with the trophy, as a broadcast's captions do.
  // With reduced motion (still) the camera holds its settled view: they stay.
  const platesShown = (t, still = false) => still || (t >= BEATS.sweepEnd - 0.3 && !(t > BEATS.trophy + 0.4 && t < BEATS.spray + 0.6));

  const COUNTS = {
    high: { confetti: 600, spray: 1500 },
    medium: { confetti: 300, spray: 750 },
    low: { confetti: 120, spray: 0 },
  };
  const counts = (tier) => ({ ...(COUNTS[tier] || COUNTS.medium) });

  // The camera: a sweep in from high and wide, a slow push in on P1's face
  // while the trophy goes up, then back out to a slow pendulum orbit in front
  // of the wall that repeats for as long as the screen is up. Every move is a
  // smooth blend, so nothing jumps.
  const ORBIT_PERIOD = 26;
  const ORBIT_SWING = 0.34;
  function cameraAt(t) {
    const sweep = smooth(0, BEATS.sweepEnd, t);
    const push = smooth(BEATS.trophy - 0.3, BEATS.trophy + 3.2, t);
    const back = smooth(BEATS.spray, BEATS.spray + 2.6, t);
    const orbitIn = smooth(BEATS.spray, BEATS.spray + 3, t);
    const p1Head = STEPS[1].height + 1.6;
    // Distance to what it looks at, its height, and where it looks.
    // (Framed with room above the wall's title for the page's own title.)
    const radius = 17 + (10.4 - 17) * sweep + (9.9 - 10.4) * smooth(BEATS.sweepEnd, BEATS.trophy, t)
      + (6.4 - 9.9) * push + (10.2 - 6.4) * back;
    const lookY = 2.1 + (p1Head + 0.3 - 2.1) * push + (2.15 - p1Head - 0.3) * back;
    const height = 6.8 + (2.5 - 6.8) * sweep + (p1Head + 0.1 - 2.5) * push + (2.7 - p1Head - 0.1) * back;
    const lookZ = 0.0 + 0.1 * push - 0.1 * back;
    const orbit = ORBIT_SWING * Math.sin(((t - BEATS.spray) * 2 * Math.PI) / ORBIT_PERIOD) * orbitIn;
    const angle = 0.5 * (1 - sweep) + orbit;
    return {
      x: Math.sin(angle) * radius,
      y: height,
      z: lookZ + Math.cos(angle) * radius,
      lookX: 0,
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
    BEATS, STEP_FORWARD, ORBIT_PERIOD, PROP_SWAP, stepFor, beatAt, poseAt, forwardAt, trophyShown, bottleShown, confettiOn, sprayOn, platesShown,
    counts, cameraAt, fitFov, cupColour, stepConfetti, sprayDrop, stepDrop,
  };
}));
