// Racecraft: how fast a CPU driver can take the road ahead, and when it must
// brake for it (docs/superpowers/specs/2026-09-30-racecraft-design.md). Pure:
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

  return { curvatureFromHeadings, yawAvailable, cornerSpeed, mustBrake };
}));
