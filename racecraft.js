// Racecraft: how fast a CPU driver can take the road ahead, and when it must
// brake for it (docs/superpowers/specs/2026-09-30-racecraft-design.md); the
// tow behind another car, and how CPU cars far ahead of the player ease off
// (docs/superpowers/specs/2026-10-05-balance-design.md). Pure:
// the corner speed comes from the car's own turning (and, wet, its grip), not
// from a fixed rule, so a CPU drives the corners the way a good driver would.
// In the page it defines window.Racecraft; in Node it is require()-able.
(function attach(root, factory) {
  const weather = typeof module === "object" && module.exports ? require("./weather.js") : root.Weather;
  const api = factory(weather);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Racecraft = api;
}(typeof globalThis !== "undefined" ? globalThis : this, (Weather) => {
  function wrap(a) {
    let x = a;
    while (x > Math.PI) x -= Math.PI * 2;
    while (x < -Math.PI) x += Math.PI * 2;
    return x;
  }

  // How tight the road is (radians of heading per unit along it) at each of
  // a lap's samples, from their headings `step` apart, averaged over `window`
  // samples either side -- a car's line cuts a corner's sharpest point.
  // The lap is a loop.
  function curvatureFromHeadings(headings, step, window) {
    const n = headings.length;
    const raw = headings.map((h, i) => Math.abs(wrap(headings[(i + 1) % n] - h)) / step);
    const out = new Array(n);
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      for (let k = -window; k <= window; k += 1) sum += raw[((i + k) % n + n) % n];
      out[i] = sum / (window * 2 + 1);
    }
    return out;
  }

  // The yaw full steer gives at speed v (game.js: the turn rate grows with
  // speed up to 180), capped wet by the grip (weather.js).
  function yawAvailable(physics, v, grip) {
    const turn = physics.turnRate * (0.45 + Math.min(Math.max(v / 180, 0.2), 1));
    if (!(grip < 1)) return turn;
    return Math.min(turn, grip * Weather.dryLimitAt(physics, v) / Math.max(v, 1e-6));
  }

  // The fastest the car can take a curve of curvature k: the speed at which
  // the yaw it needs (v x k) is the yaw it has, times the driver's margin
  // (how near the limit they dare go). The curve's own limit, not the car's
  // top speed: a straight has none. Past 180 the turn rate (and, wet, the
  // grip's cap) no longer grows, so there the limit is margin x yaw / k.
  function cornerSpeed(physics, k, { margin = 1, grip = 1 } = {}) {
    if (!(k > 0)) return Infinity;
    const fast = (margin * yawAvailable(physics, 180, grip)) / k;
    if (fast >= 180) return fast;
    let lo = 0;
    let hi = 180;
    for (let i = 0; i < 24; i += 1) {
      const v = (lo + hi) / 2;
      if (v * k <= margin * yawAvailable(physics, v, grip)) lo = v;
      else hi = v;
    }
    return lo;
  }

  // Whether a car at `speed` must brake now: some corner ahead ({ at: the
  // distance to it, speed: the speed it allows }) can't be reached at its
  // speed with brakes that slow the car at `decel`.
  function mustBrake(speed, corners, decel) {
    for (const c of corners) {
      if (speed <= c.speed) continue;
      if (speed * speed - c.speed * c.speed >= 2 * decel * c.at) return true;
    }
    return false;
  }

  // The tow (docs/superpowers/specs/2026-10-05-balance-design.md): in a
  // car's wake the air is already moving, so the car behind meets less drag
  // and reaches a higher top speed. Strongest right behind it (`from` is
  // about as close as a car can follow), fading to nothing at `reach`, and
  // only in its wake (within `width` across). `speed` is the top speed it is
  // worth at full strength, `drag` how much of the drag it takes away.
  const TOW = { from: 18, reach: 130, width: 22, speed: 0.06, drag: 0.002 };

  function towShare(gap, latGap) {
    if (!(gap >= TOW.from && gap <= TOW.reach) || Math.abs(latGap) > TOW.width) return 0;
    return 1 - (gap - TOW.from) / (TOW.reach - TOW.from);
  }

  // A CPU car this far ahead of the player (along the race, in world units)
  // eases off, by up to `strength` of its pace, and more the further ahead it
  // is. Cars the player is racing (`near`) and cars behind are untouched, so
  // it never shows where the player can see it.
  const RUBBER_BAND = { near: 300, span: 1000 };

  function rubberBand(aheadOfPlayer, strength) {
    if (!(strength > 0)) return 1;
    const t = Math.min(Math.max((aheadOfPlayer - RUBBER_BAND.near) / RUBBER_BAND.span, 0), 1);
    return 1 - strength * t;
  }

  return { curvatureFromHeadings, yawAvailable, cornerSpeed, mustBrake, TOW, towShare, RUBBER_BAND, rubberBand };
}));
