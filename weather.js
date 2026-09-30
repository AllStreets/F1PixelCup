// Weather and grip (docs/superpowers/specs/2026-09-29-rain-design.md). Pure:
// whether a race is wet, how much grip a wet road leaves, and the cornering
// limit that grip sets. In the page it defines window.Weather; in Node it is
// require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Weather = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MODES = [
    { id: "dry", name: "Dry" },
    { id: "wet", name: "Wet" },
    { id: "changeable", name: "Changeable" },
  ];
  // Changeable: the chance each race is wet.
  const RAIN_CHANCE = 1 / 3;
  // What a wet road leaves: cornering grip, traction, braking and off-road
  // pace as shares of the dry; how much longer an oil spin lasts; and the
  // speed a tyre sliding at its limit scrubs off per second (as a rate).
  const WET = { corner: 0.72, accel: 0.85, brake: 0.75, offroad: 0.85, oilSpin: 1.4, scrub: 0.4 };
  // The extra yaw a drift adds (game.js).
  const DRIFT_YAW = 0.8;

  function mix(a, b) {
    let h = (Math.imul(a >>> 0, 2654435761) ^ Math.imul((b + 1) >>> 0, 1597334677)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // The weather of one race of a cup: fixed for Dry and Wet; for Changeable,
  // seeded by the cup run and the race, so it never rerolls.
  function raceWeather(mode, seed, raceIndex) {
    if (mode === "wet") return "wet";
    if (mode === "changeable") return mix(seed, raceIndex) < RAIN_CHANCE ? "wet" : "dry";
    return "dry";
  }

  function grip(weather) {
    return weather === "wet" ? WET.corner : 1;
  }

  // The hardest a car can corner in the dry at this speed: full steer
  // (the turn rate grows with speed up to 180, as game.js turns) and a
  // drift. In the wet, the grip's share of it is the limit -- at every speed,
  // not only flat out. (The dry itself is never capped.)
  function dryLimitAt(physics, speed) {
    const v = Math.abs(speed);
    const turn = physics.turnRate * (0.45 + Math.min(Math.max(v / 180, 0.2), 1));
    return v * (turn + DRIFT_YAW);
  }

  // Yaw (rad/s) kept to what the grip allows at this speed: lateral
  // acceleration is speed x yaw.
  function capYaw(yaw, speed, limit) {
    const v = Math.abs(speed);
    if (v <= 0 || Math.abs(yaw) * v <= limit) return yaw;
    return Math.sign(yaw) * (limit / v);
  }

  // The share of its speed a wet tyre keeps over dt while cornering at
  // latAccel against its limit: the nearer the limit, the more it slides and
  // scrubs (none going straight; no more past the limit than at it).
  function scrub(latAccel, limit, dt) {
    // Standing still there is no limit yet (and nothing to scrub).
    if (!(limit > 0)) return 1;
    const load = Math.min(1, Math.abs(latAccel) / limit);
    return Math.exp(-WET.scrub * load * load * dt);
  }

  return { MODES, RAIN_CHANCE, WET, DRIFT_YAW, raceWeather, grip, dryLimitAt, capYaw, scrub };
}));
