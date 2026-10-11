// Where the Las Vegas fill puts things (r3d/vegas-fill.js): plain maths, no
// three.js, so the Node tests can run it (tests/vegas-fill.test.js).
// Outlines and lines are flat arrays [x0, y0, x1, y1, ...] in metres.

// A building's kind in the data (tools/vegas/build_fill_data.py).
export const KIND = { generic: 0, garage: 1, house: 2, hotel: 3, canopy: 4, chapel: 5, shed: 6 };
// A wall's kind for the Strip's facade shader (tools/blender/vegas_resorts.py).
export const WALL = { stone: 1.0, quiet: 0.9, plain: 0.8, ribbon: 0.65 };

export function insidePoly(x, y, flat) {
  let hit = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const ax = flat[i * 2]; const ay = flat[i * 2 + 1];
    const bx = flat[j * 2]; const by = flat[j * 2 + 1];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}

export function areaOf(flat) {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) a += flat[j * 2] * flat[i * 2 + 1] - flat[i * 2] * flat[j * 2 + 1];
  return Math.abs(a) / 2;
}

// The direction of an outline's longest edge (radians): a car park's rows
// run along it, as its bays are painted.
export function longAxis(flat) {
  let best = 0;
  let angle = 0;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const dx = flat[i * 2] - flat[j * 2]; const dy = flat[i * 2 + 1] - flat[j * 2 + 1];
    const d = dx * dx + dy * dy;
    if (d > best) { best = d; angle = Math.atan2(dy, dx); }
  }
  return angle;
}

// The cars parked in a car park: rows two deep along its long axis with an
// aisle between each pair, a bay every 2.8 m, a share of the bays taken
// (`rand` in 0..1 decides which); every car wholly inside the outline.
// Returns [x, y, yaw] each (yaw: the way the car points).
export function carSpots(flat, rand, { share = 0.6, bay = 2.8, deep = 5.4, aisle = 7.2, edge = 2.6 } = {}) {
  const a = longAxis(flat);
  const ux = Math.cos(a); const uy = Math.sin(a);
  const vx = -uy; const vy = ux;
  let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const u = flat[i] * ux + flat[i + 1] * uy; const v = flat[i] * vx + flat[i + 1] * vy;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const out = [];
  const pitch = deep * 2 + aisle;
  for (let v = v0 + edge + deep / 2; v < v1 - edge; v += pitch) {
    for (let side = 0; side < 2; side += 1) {
      const row = v + side * deep;
      for (let u = u0 + edge; u < u1 - edge; u += bay) {
        const take = rand();
        if (take > share) continue;
        const x = u * ux + row * vx; const y = u * uy + row * vy;
        // Its four corners' reach, near enough: the point and one a car's half length each way across the row.
        const hx = vx * (deep / 2); const hy = vy * (deep / 2);
        if (!insidePoly(x, y, flat) || !insidePoly(x + hx, y + hy, flat) || !insidePoly(x - hx, y - hy, flat)) continue;
        out.push([x, y, a + Math.PI / 2 + (side ? Math.PI : 0)]);
      }
    }
  }
  return out;
}

// Points a `step` apart along a line, `offset` to its left (negative: right),
// from `start` along it: street lamps, a median's palms. Each [x, y, yaw]
// (yaw: the line's direction there).
export function alongLine(flat, step, offset = 0, start = 0) {
  const out = [];
  let next = start;
  let run = 0;
  for (let i = 0; i + 3 < flat.length; i += 2) {
    const ax = flat[i]; const ay = flat[i + 1];
    const dx = flat[i + 2] - ax; const dy = flat[i + 3] - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    while (next <= run + len) {
      const t = (next - run) / len;
      out.push([ax + dx * t - (dy / len) * offset, ay + dy * t + (dx / len) * offset, Math.atan2(dy, dx)]);
      next += step;
    }
    run += len;
  }
  return out;
}

export function lengthOf(flat) {
  let run = 0;
  for (let i = 0; i + 3 < flat.length; i += 2) run += Math.hypot(flat[i + 2] - flat[i], flat[i + 3] - flat[i + 1]);
  return run;
}

// How a low building is dressed: its walls' kind for the facade shader and
// their tint (an sRGB hex), by what it is; `pick` in 0..1 chooses among a
// kind's tints. Nothing here is as bright or as tall as a resort: the fill
// stays quiet behind the Strip.
const TINTS = {
  [KIND.generic]: ["#8d8477", "#7b766f", "#9a8b78", "#6f6a66", "#8a7a6a", "#77706a"],
  [KIND.garage]: ["#3c3f46", "#44464c"],
  [KIND.house]: ["#6f675c", "#7a6e60", "#665f58"],
  [KIND.hotel]: ["#9b8f7c", "#8f8474", "#a39683", "#857a6c"],
  [KIND.canopy]: ["#c9c9cc"],
  [KIND.chapel]: ["#e6e2da"],
  [KIND.shed]: ["#5c5d62", "#66625c"],
};
export function lookOf(kind, pick) {
  const tints = TINTS[kind] || TINTS[KIND.generic];
  const tint = tints[Math.min(tints.length - 1, Math.floor(pick * tints.length))];
  const wall = kind === KIND.garage ? WALL.ribbon : kind === KIND.hotel ? WALL.stone : kind === KIND.house || kind === KIND.shed ? WALL.quiet : WALL.plain;
  return { tint, wall };
}

// A small generator of the same numbers every time (the fill is the same
// every visit).
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
