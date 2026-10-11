// Las Vegas's ground filled in (docs/superpowers/specs/2026-10-11-vegas-fill-design.md):
// what stands between and behind the Strip's towers, from the map
// (assets/landmarks/vegas_fill.glb carries tools/vegas/fill.json: OpenStreetMap,
// ODbL), at the Strip's own scale and origin (r3d/vegas.js).
//
// - The ground itself: the streets, car parks, gardens and lit pools painted
//   where they lie, the street lamps' pools of light, and out past the map
//   the city's grid of lit streets and houses fading to the dark desert.
// - The low buildings (shops, motels, houses, halls, parking garages,
//   canopies), each extruded from its footprint in the Strip's facade
//   shader's quiet kinds, merged by tile.
// - Instanced: the cars parked in the car parks, the lamp posts, the palms.
// - The monorail on its piers, the footbridges, bus shelters, billboards
//   (blank and lit, or screens of abstract colour), the far lights as points.
// - The mountains' silhouette round the horizon and the city's sodium glow.
//
// Built last, after everything else has its ground, and claims none: a piece
// stands only where it is clear of the track's barriers (a building 14 units
// outside them at every point of its outline; a palm by its fronds' reach;
// a lamp post 9, a parked car 8) and of whatever is already there (the
// Strip's buildings and lake, the stands, the Safety Car's entrances, the
// marshals' posts, the people, the fill's own buildings); anything else is
// left out. Las Vegas is raced at night only: this is its night.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tracksideModel } from "./models.js";
import { color } from "./textures.js";
import { palmFronds } from "./track.js";
import { VEGAS_SCALE as S, VEGAS_ORIGIN as O, stripFacade, videoMaterial } from "./vegas.js";
import { wettable, WET_RUNOFF } from "./rain.js";
import { KIND, WALL, insidePoly, areaOf, longAxis, carSpots, alongLine, lengthOf, lookOf, outlineSamples, clearSpans, lotLamps, nearest, seeded } from "./vegas-fill-plan.js";

// The world from the map's metres (x east, y north).
const wx = (x) => O.x + x * S;
const wz = (y) => O.z - y * S;
// How far outside the barriers a piece's ground must stay (game units).
const MARGIN = 14;
// How far from the track the cars, lamp posts and palms are drawn as such
// (further off, the painted ground and the points of light carry them).
const NEAR = 760;
// The cars drawn, by tier (Low: none).
const CARS = { high: 2600, medium: 1300, low: 0 };
const TILE = 700;

// Faces gathered into a few merged meshes, by tile: positions in the world,
// UVs in metres as the facade shader reads them (u along, v the height above
// the street, written as glTF's flipped v), a colour and a kind to each.
class Soup {
  constructor() { this.tiles = new Map(); }

  at(x, z) {
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    if (!this.tiles.has(key)) this.tiles.set(key, { p: [], n: [], u: [], c: [], i: [] });
    return this.tiles.get(key);
  }

  // A flat face: its corners ([x, y, z] in the world, any winding), turned to
  // face along `normal`; uvs [u, height in metres] each.
  face(t, pts, normal, uvs, col) {
    const [a, b, c] = pts;
    const cross = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0;
    const base = t.p.length / 3;
    pts.forEach((p, k) => {
      t.p.push(p[0], p[1], p[2]);
      t.n.push(normal[0], normal[1], normal[2]);
      t.u.push(uvs[k][0], 1 - uvs[k][1]);
      t.c.push(col[0], col[1], col[2], col[3]);
    });
    for (let k = 1; k + 1 < pts.length; k += 1) t.i.push(base, flip ? base + k + 1 : base + k, flip ? base + k : base + k + 1);
  }

  // A box along `dir` (a unit vector in the map's x, y) centred at (x, y)
  // metres: half its length and width, from y0 to y1 metres up; `v`: the
  // height its faces tell the shader (a pier is no shopfront: it says 20).
  box(x, y, dir, hl, hw, y0, y1, col, v = null) {
    const t = this.at(wx(x), wz(y));
    const corner = (a, b) => [x + dir[0] * a * hl - dir[1] * b * hw, y + dir[1] * a * hl + dir[0] * b * hw];
    const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    for (let k = 0; k < 4; k += 1) {
      const a = q[k]; const b = q[(k + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = [(b[1] - a[1]) / len, 0, (b[0] - a[0]) / len];
      this.face(t, [[wx(a[0]), y0 * S, wz(a[1])], [wx(b[0]), y0 * S, wz(b[1])], [wx(b[0]), y1 * S, wz(b[1])], [wx(a[0]), y1 * S, wz(a[1])]], n,
        [[0, v ?? y0], [len, v ?? y0], [len, v ?? y1], [0, v ?? y1]], col);
    }
    const top = q.map((p) => [wx(p[0]), y1 * S, wz(p[1])]);
    this.face(t, top, [0, 1, 0], q.map(() => [0, v ?? Math.max(y1, 9)]), col);
    if (y0 > 0.5) this.face(t, q.map((p) => [wx(p[0]), y0 * S, wz(p[1])]), [0, -1, 0], q.map(() => [0, v ?? Math.max(y0, 9)]), col);
  }

  meshes(material, name) {
    const out = [];
    this.tiles.forEach((t) => {
      if (!t.i.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(t.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(t.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(t.u, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(t.c, 4));
      g.setIndex(t.i);
      const mesh = new THREE.Mesh(g, material);
      mesh.name = name;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      out.push(mesh);
    });
    return out;
  }
}

const rgba = (hex, a) => { const c = color(hex); return [c.r, c.g, c.b, a]; };

// An outline anticlockwise in the map (so its walls' normals point out).
function ccw(flat) {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) a += flat[j * 2] * flat[i * 2 + 1] - flat[i * 2] * flat[j * 2 + 1];
  if (a > 0) return flat;
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

// A footprint's roof (or a canopy's underside): its outline triangulated.
function cap(soup, t, flat, y, normal, col, v) {
  const contour = [];
  for (let i = 0; i < flat.length; i += 2) contour.push(new THREE.Vector2(flat[i], flat[i + 1]));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  tris.forEach((tri) => soup.face(t, tri.map((k) => [wx(flat[k * 2]), y * S, wz(flat[k * 2 + 1])]), normal, tri.map(() => [0, v]), col));
}

// One low building from its footprint: its walls in its kind, its roof.
function lowBuilding(soup, lights, b, rand, front) {
  const o = ccw(b.o);
  const n = o.length / 2;
  let cx = 0; let cy = 0;
  for (let i = 0; i < n; i += 1) { cx += o[i * 2]; cy += o[i * 2 + 1]; }
  cx /= n; cy /= n;
  const t = soup.at(wx(cx), wz(cy));
  const look = lookOf(b.k, rand(), front);
  const col = rgba(look.tint, look.wall);
  const roof = rgba(["#2b2b30", "#34333a", "#26272b", "#3a3836"][Math.floor(rand() * 4)], WALL.plain);
  // A canopy (a filling station's, a porte-cochère's): a slab on its posts,
  // lit from beneath.
  const y0 = b.k === KIND.canopy ? Math.max(3.2, b.h - 0.8) : 0;
  let run = 0;
  for (let i = 0; i < n; i += 1) {
    const ax = o[i * 2]; const ay = o[i * 2 + 1];
    const bx = o[((i + 1) % n) * 2]; const by = o[((i + 1) % n) * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.05) continue;
    // (Out of an anticlockwise outline, in the world: the map's north is -z.)
    const normal = [(by - ay) / len, 0, (bx - ax) / len];
    soup.face(t, [[wx(ax), y0 * S, wz(ay)], [wx(bx), y0 * S, wz(by)], [wx(bx), b.h * S, wz(by)], [wx(ax), b.h * S, wz(ay)]], normal,
      [[run, y0 || 0], [run + len, y0 || 0], [run + len, b.k === KIND.canopy ? 20 : b.h], [run, b.k === KIND.canopy ? 20 : b.h]], b.k === KIND.canopy ? rgba(look.tint, WALL.plain) : col);
    run += len;
  }
  // (A roof tells the shader it is well above the street: no shopfront's glow on it.)
  cap(soup, t, o, b.h, [0, 1, 0], roof, Math.max(b.h, 9));
  if (b.k === KIND.canopy) {
    const lt = lights.at(wx(cx), wz(cy));
    cap(lights, lt, o, y0 - 0.02, [0, -1, 0], [0.85, 0.86, 0.8, 1], 0);
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 4))) soup.box(cx + (o[i * 2] - cx) * 0.8, cy + (o[i * 2 + 1] - cy) * 0.8, [1, 0], 0.25, 0.25, 0, y0, rgba("#9a9aa0", WALL.plain), 20);
  }
  if (b.k === KIND.chapel) {
    // A wedding chapel: white, a little steeple, a line of light at its eaves.
    soup.box(cx, cy, [1, 0], 1.3, 1.3, b.h, b.h + 3.2, rgba("#e6e2da", WALL.plain), 20);
    const top = [wx(cx), (b.h + 9) * S, wz(cy)];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, c], k, all) => {
      const [a2, c2] = all[(k + 1) % 4];
      soup.face(t, [[wx(cx + a * 1.3), (b.h + 3.2) * S, wz(cy + c * 1.3)], [wx(cx + a2 * 1.3), (b.h + 3.2) * S, wz(cy + c2 * 1.3)], top], [(a + a2) / 2, 0.4, -(c + c2) / 2], [[0, 20], [0, 20], [0, 20]], rgba("#e6e2da", WALL.plain));
    });
    lights.box(cx, cy, [1, 0], 1.5, 1.5, b.h + 3.2, b.h + 3.5, [1.0, 0.45, 0.7, 1], 0);
  }
}

const clearAt = (course, x, y, margin, r) => course.clearance(wx(x), wz(y), margin + 60) >= margin && !course.occupied.blocked(wx(x), wz(y), r);
const nearTrack = (course, x, y, reach = NEAR) => course.clearance(wx(x), wz(y), reach) < reach;

// A map of ground taken, painted from outlines and lines (metres) and asked
// by point: `side` game units square round (cx, cz), 4 units a pixel.
function groundMask(cx, cz, side, draw) {
  const px = Math.round(side / 4);
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const k = px / side;
  const X = (x) => (wx(x) - (cx - side / 2)) * k;
  const Y = (y) => (wz(y) - (cz - side / 2)) * k;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  draw({
    poly(flat, grow = 3) {
      ctx.beginPath();
      for (let i = 0; i < flat.length; i += 2) (i ? ctx.lineTo(X(flat[i]), Y(flat[i + 1])) : ctx.moveTo(X(flat[i]), Y(flat[i + 1])));
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = grow * 2 * S * k;
      ctx.stroke();
    },
    line(flat, width) {
      ctx.beginPath();
      for (let i = 0; i < flat.length; i += 2) (i ? ctx.lineTo(X(flat[i]), Y(flat[i + 1])) : ctx.moveTo(X(flat[i]), Y(flat[i + 1])));
      ctx.lineWidth = width * S * k;
      ctx.stroke();
    },
  });
  const taken = ctx.getImageData(0, 0, px, px).data;
  // Is (x, y) metres, or anything within r metres of it, on taken ground?
  // (Outside the map: not taken.)
  return (x, y, r = 0) => {
    const reach = Math.ceil(r * S * k);
    const sx = Math.round(X(x)); const sy = Math.round(Y(y));
    for (let dx = -reach; dx <= reach; dx += Math.max(1, reach)) {
      for (let dy = -reach; dy <= reach; dy += Math.max(1, reach)) {
        const qx = sx + dx; const qy = sy + dy;
        if (qx >= 0 && qy >= 0 && qx < px && qy < px && taken[(qy * px + qx) * 4] > 40) return true;
      }
    }
    return false;
  };
}

// The low buildings that stand clear of the track and of what is already
// there (every 15 units round their outlines, and their middles) and out of
// the lake (`dry`); the rest are left out. Returns those built.
function buildings(course, data, soup, lights, rand, onMainRoad, dry) {
  const kept = [];
  data.low.forEach((b) => {
    // (Drawn from the generator whether it is kept or not: the same building
    // has the same look whatever stands round it.)
    const pick = seeded(Math.floor(rand() * 1e9));
    if (!outlineSamples(b.o, 15 / S).every(([x, y]) => clearAt(course, x, y, MARGIN, 2.5) && dry(x, y))) return;
    lowBuilding(soup, lights, b, pick, onMainRoad(b.o[0], b.o[1]));
    kept.push(b);
  });
  return kept;
}

// Where the street lamps stand (metres): along the roads by their class and
// across the car parks (along each one's own aisles), the same list the
// ground is painted from and the posts are built from.
function lampSpots(data) {
  const STEP = { m: 80, p: 46, s: 52, t: 62, r: 74 };
  const out = [];
  data.roads.forEach((r, k) => {
    if (!STEP[r.c]) return;
    alongLine(r.p, STEP[r.c], (k % 2 ? 1 : -1) * (r.w / 2 + 1.6), (k * 17) % STEP[r.c]).forEach(([x, y, yaw]) => out.push({ x, y, yaw: yaw + (k % 2 ? -Math.PI / 2 : Math.PI / 2), road: r.c }));
  });
  data.lots.forEach((lot) => lotLamps(lot, 34).forEach(([x, y, yaw]) => out.push({ x, y, yaw, road: "lot" })));
  return out;
}

// The ground painted: `side` game units square round (cx, cz), `px` pixels a
// side. `far`: the city past the map (its grid of streets and house lights)
// (the near ground lies a little over its middle).
function paintGround(data, lamps, { cx, cz, side, px, far = null, marks, beds = [] }) {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  const k = px / side;
  const X = (x) => (wx(x) - (cx - side / 2)) * k;
  const Y = (y) => (wz(y) - (cz - side / 2)) * k;
  const m = S * k; // pixels a metre
  const rand = seeded(far ? 91 : 37);
  const path = (flat, close) => {
    ctx.beginPath();
    for (let i = 0; i < flat.length; i += 2) (i ? ctx.lineTo(X(flat[i]), Y(flat[i + 1])) : ctx.moveTo(X(flat[i]), Y(flat[i + 1])));
    if (close) ctx.closePath();
  };
  // The desert, dark; the city's own ground out to its edge.
  ctx.fillStyle = "#0f0d0b";
  ctx.fillRect(0, 0, px, px);
  if (far) {
    const g = ctx.createRadialGradient(px / 2, px / 2, far.city * k * 0.55, px / 2, px / 2, far.city * k);
    g.addColorStop(0, "#201f24");
    g.addColorStop(1, "#0f0d0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
    // The valley's grid: a street every furlong, an avenue every mile, lit;
    // house lights scattered through the blocks, thinning toward the desert.
    const step = 201 * S * k;
    const edge = far.city * k;
    for (let gx = -40; gx <= 40; gx += 1) {
      for (const horizontal of [false, true]) {
        const avenue = gx % 8 === 0;
        ctx.strokeStyle = avenue ? "#15161a" : "#191a1e";
        ctx.lineWidth = Math.max(1, (avenue ? 24 : 9) * m);
        const at = px / 2 + gx * step;
        const half = Math.sqrt(Math.max(0, edge * edge - (gx * step) ** 2)) * (0.82 + 0.18 * rand());
        if (half < step) continue;
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(px / 2 - half, at); ctx.lineTo(px / 2 + half, at); } else { ctx.moveTo(at, px / 2 - half); ctx.lineTo(at, px / 2 + half); }
        ctx.stroke();
        // Its lamps.
        ctx.fillStyle = avenue ? "rgba(255, 186, 110, 0.9)" : "rgba(255, 176, 96, 0.55)";
        const gap = (avenue ? 60 : 90) * m;
        for (let s = -half; s < half; s += gap) {
          const r = Math.max(0.8, (avenue ? 5 : 3.5) * m);
          if (horizontal) ctx.fillRect(px / 2 + s - r / 2, at - r / 2, r, r); else ctx.fillRect(at - r / 2, px / 2 + s - r / 2, r, r);
        }
      }
    }
    for (let i = 0; i < 26000; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * edge;
      if (rand() < (d / edge) ** 2) continue;
      ctx.fillStyle = rand() < 0.8 ? "rgba(255, 196, 128, 0.75)" : "rgba(214, 228, 255, 0.7)";
      const r = Math.max(0.8, 4 * m);
      ctx.fillRect(px / 2 + Math.cos(a) * d, px / 2 + Math.sin(a) * d, r, r);
    }
  } else {
    ctx.fillStyle = "#222126";
    ctx.fillRect(0, 0, px, px);
    // The paving's blocks: a little of one grey and another.
    for (let i = 0; i < 2400; i += 1) {
      ctx.fillStyle = ["rgba(60, 58, 66, 0.25)", "rgba(20, 20, 24, 0.3)", "rgba(74, 66, 58, 0.18)"][i % 3];
      const w = (20 + rand() * 90) * m;
      ctx.fillRect(rand() * px, rand() * px, w, (20 + rand() * 90) * m);
    }
  }
  // Gardens and the golf course: turf in a few greens, never one flat one.
  data.greens.forEach((g) => {
    path(g, true);
    ctx.fillStyle = "#13281a";
    ctx.fill();
    if (far) return;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (let i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); }
    ctx.save();
    ctx.clip();
    const blobs = Math.min(260, Math.ceil(((x1 - x0) * (y1 - y0)) / 2200));
    for (let i = 0; i < blobs; i += 1) {
      ctx.fillStyle = ["rgba(30, 70, 38, 0.55)", "rgba(10, 26, 16, 0.55)", "rgba(44, 84, 44, 0.4)", "rgba(58, 52, 36, 0.35)"][i % 4];
      ctx.beginPath();
      ctx.ellipse(X(x0 + rand() * (x1 - x0)), Y(y0 + rand() * (y1 - y0)), (8 + rand() * 30) * m, (6 + rand() * 18) * m, rand() * 3.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  // The resorts' own grounds where nothing is mapped: planted beds, a path round each, its lights.
  beds.forEach((b) => {
    ctx.fillStyle = "#3a3840";
    ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.y), (b.r + 2.2) * m, (b.r * b.flat + 2.2) * m, b.turn, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ["#173522", "#1f3d24", "#14301f", "#243f22"][b.k % 4];
    ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.y), b.r * m, b.r * b.flat * m, b.turn, 0, Math.PI * 2); ctx.fill();
  });
  // Car parks: asphalt inside a kerb; near the circuit, the painted line
  // down the middle of each double row of bays (as r3d/vegas-fill-plan.js
  // carSpots parks them).
  data.lots.forEach((lot) => {
    path(lot, true);
    ctx.fillStyle = "#17181c";
    ctx.fill();
    ctx.strokeStyle = "#3c3c44";
    ctx.lineWidth = Math.max(1, 0.5 * m);
    ctx.stroke();
    if (far || areaOf(lot) < 500) return;
    const a = longAxis(lot);
    const ux = Math.cos(a); const uy = Math.sin(a);
    let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
    for (let i = 0; i < lot.length; i += 2) {
      const u = lot[i] * ux + lot[i + 1] * uy; const v = -lot[i] * uy + lot[i + 1] * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(190, 190, 200, 0.42)";
    ctx.lineWidth = Math.max(1, 0.3 * m);
    for (let v = v0 + 2.6 + 5.4; v < v1 - 2.6; v += 18) {
      ctx.beginPath();
      ctx.moveTo(X((u0 + 3) * ux - v * uy), Y((u0 + 3) * uy + v * ux));
      ctx.lineTo(X((u1 - 3) * ux - v * uy), Y((u1 - 3) * uy + v * ux));
      ctx.stroke();
    }
    ctx.restore();
  });
  // The paved plaza round the Sphere, the promenade to the High Roller.
  if (marks) {
    ctx.fillStyle = "#34343c";
    ctx.beginPath(); ctx.arc(X(marks.sphere[0]), Y(marks.sphere[1]), 125 * m, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4a4a54"; ctx.lineWidth = Math.max(1, 1.2 * m);
    for (let r = 95; r <= 125; r += 15) { ctx.beginPath(); ctx.arc(X(marks.sphere[0]), Y(marks.sphere[1]), r * m, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = "#34343c"; ctx.lineWidth = 16 * m; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(X(marks.highroller[0] + 30), Y(marks.highroller[1])); ctx.lineTo(X(marks.highroller[0] - 420), Y(marks.highroller[1])); ctx.stroke();
  }
  // The roads: asphalt, the wide ones with their kerbs and a median's line.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ["r", "l", "t", "s", "p", "m"].forEach((c) => {
    data.roads.forEach((r) => {
      if (r.c !== c) return;
      path(r.p, false);
      ctx.strokeStyle = "#3a3a42";
      ctx.lineWidth = Math.max(1.2, (r.w + 3) * m);
      ctx.stroke();
    });
    data.roads.forEach((r) => {
      if (r.c !== c) return;
      path(r.p, false);
      ctx.strokeStyle = "#101114";
      ctx.lineWidth = Math.max(1, r.w * m);
      ctx.stroke();
      if (!far && (c === "p" || c === "s" || c === "t")) {
        ctx.strokeStyle = "rgba(190, 170, 110, 0.5)";
        ctx.lineWidth = Math.max(1, 0.35 * m);
        ctx.setLineDash([4 * m, 7 * m]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  });
  // The pools, lit turquoise from within.
  ctx.shadowColor = "#3ff0e6";
  ctx.shadowBlur = Math.max(2, 5 * m);
  ctx.fillStyle = "#49e8de";
  data.pools.forEach((p) => { path(p, true); ctx.fill(); });
  ctx.shadowBlur = 0;
  // The lamps' pools of light on the ground.
  ctx.globalCompositeOperation = "lighter";
  lamps.forEach((l) => {
    const x = X(l.x); const y = Y(l.y);
    if (x < -40 || y < -40 || x > px + 40 || y > px + 40) return;
    const r = Math.max(2.5, (l.road === "lot" ? 13 : l.road === "path" ? 5 : 11) * m);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, l.road === "path" ? "rgba(255, 214, 160, 0.5)" : "rgba(255, 178, 100, 0.4)");
    g.addColorStop(1, "rgba(255, 150, 70, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  });
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function groundPlane(tex, side, cx, cz, y, name) {
  // Lit by the night's own light and by itself: the lamps' pools and the
  // pools' water are light, the asphalt is not. Wet in the rain, as the
  // plain ground it stands in for was.
  const mat = wettable(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.96 }), WET_RUNOFF);
  mat.userData.worldOwned = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, y, cz);
  mesh.receiveShadow = name === "fill_ground";
  // (Ground: the road is laid on it, and the audit of what stands over the
  // track does not count it.)
  mesh.userData.ground = true;
  mesh.name = name;
  return mesh;
}

// The mountains round the valley (a dark silhouette a shade under the sky's
// horizon; higher to the west, as the Spring Mountains are) and the city's
// sodium glow before them.
function horizon(cx, cz) {
  const g = new THREE.Group();
  g.name = "fill_horizon";
  const R = 6400;
  const N = 144;
  const rand = seeded(5);
  const ridge = [];
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    // (West is -x: the highest range; the east's lower; gaps north and south.)
    const west = Math.max(0, -Math.cos(a)) ** 1.5;
    const east = Math.max(0, Math.cos(a)) ** 2;
    ridge.push(300 + 640 * west + 340 * east + 110 * Math.sin(a * 7 + 1.3) + 70 * Math.sin(a * 17) + 90 * rand());
  }
  const p = [];
  const idx = [];
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    p.push(cx + Math.cos(a) * R, -20, cz + Math.sin(a) * R, cx + Math.cos(a) * R, ridge[i % N], cz + Math.sin(a) * R);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geo.setIndex(idx);
  // (Under rain cloud the ridges fog over into the night and the glow dims:
  // r3d/rain.js sets `overcast` on every material that has it, as the sky's.)
  const hills = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
    uniforms: { overcast: { value: 0 } },
    vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    // (The night's fog and the sky's foot are #10122a: render3d.js applyLighting.)
    fragmentShader: "uniform float overcast; void main() { gl_FragColor = vec4(mix(vec3(0.0030, 0.0033, 0.0080), vec3(0.0052, 0.0061, 0.0232), clamp(overcast * 1.9, 0.0, 1.0)), 1.0); }",
  }));
  hills.frustumCulled = false;
  g.add(hills);
  // The glow: light added to the air low over the city, behind the ridges
  // (they stand dark against it), gone a little above them.
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(R + 200, R + 200, 1500, 72, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { overcast: { value: 0 } },
    vertexShader: "varying float vUp; void main() { vUp = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float overcast; varying float vUp; void main() { float a = pow(1.0 - vUp, 2.6) * (1.0 - clamp(overcast * 1.7, 0.0, 1.0)); gl_FragColor = vec4(vec3(1.0, 0.56, 0.24) * a * 0.42, 1.0); }",
  }));
  glow.position.set(cx, 730, cz);
  glow.frustumCulled = false;
  glow.renderOrder = -1;
  g.add(glow);
  g.traverse((o) => { if (o.material) o.material.userData.worldOwned = true; });
  return g;
}

// The ground near the circuit that the map leaves empty and nothing stands
// on (`mapped`: asks the map; `free`: asks the game): planted beds scattered
// over it, no two alike, never in rows. Each { x, y, r, flat, turn, k } in metres.
function emptyGround(course, cx, cz, rand, mapped, free) {
  const out = [];
  const half = 1800 / S;
  const mx = (cx - O.x) / S; const my = -(cz - O.z) / S;
  for (let i = 0; i < 9000 && out.length < 1100; i += 1) {
    const x = mx + (rand() * 2 - 1) * half; const y = my + (rand() * 2 - 1) * half;
    const r = 4 + rand() * rand() * 14;
    const bed = { x, y, r, flat: 0.5 + rand() * 0.45, turn: rand() * Math.PI, k: out.length };
    if (mapped(x, y, r + 3) || !nearTrack(course, x, y, 620) || !free(x, y, r * S + 4)) continue;
    // (Apart from each other: a bed's width and a path between.)
    if (out.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + r + 7)) continue;
    out.push(bed);
  }
  return out;
}

function carGeometry() {
  const body = new THREE.BoxGeometry(4.5 * S, 0.8 * S, 1.8 * S);
  body.translate(0, 0.65 * S, 0);
  const cabin = new THREE.BoxGeometry(2.4 * S, 0.62 * S, 1.6 * S);
  cabin.translate(-0.2 * S, 1.36 * S, 0);
  return mergeGeometries([body, cabin]);
}

function instanced(name, geometry, material, spots, yOf = () => 0) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, spots.length));
  mesh.count = spots.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const at = new THREE.Vector3();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw || 0);
    one.setScalar(s.scale || 1);
    mesh.setMatrixAt(i, m.compose(at.set(wx(s.x), yOf(s), wz(s.y)), q, one));
    if (s.color) mesh.setColorAt(i, s.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.material.userData.worldOwned = true;
  // (Spread over the whole city: never left out of a view for its first one's bounds.)
  mesh.frustumCulled = false;
  return mesh;
}

// A point of light for the far lamps and windows: a soft disc.
function sparkTexture() {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function buildVegasFill(course, venue, { tier = "high", landmarks = null } = {}) {
  const model = tracksideModel("vegasFill");
  const data = model && model.userData.fill;
  if (!data) return null;
  const group = new THREE.Group();
  group.name = "landmark:vegasFill";
  const rand = seeded(20251122);
  const { cx, cz } = course.bounds;
  const clock = { value: 0 };
  const MASK = 5200;
  // The Bellagio's lake where the game has it (it moves with its resort):
  // nothing of the fill stands in it.
  const lake = landmarks && landmarks.getObjectByName("lm_bellagio_lake");
  const water = lake ? new THREE.Box3().setFromObject(lake).expandByScalar(5) : null;
  const dry = (x, y) => !water || wx(x) < water.min.x || wx(x) > water.max.x || wz(y) < water.min.z || wz(y) > water.max.z;

  // The buildings, and what is built like them. (A plain building on a main
  // road has a lit front.)
  const soup = new Soup();
  const lights = new Soup();
  const screens = new Soup();
  const mainRoad = groundMask(cx, cz, MASK, (m) => data.roads.forEach((r) => { if (r.c === "p" || r.c === "s") m.line(r.p, r.w + 70); }));
  const kept = buildings(course, data, soup, lights, rand, (x, y) => mainRoad(x, y), dry);
  // Where the fill's own buildings stand, and where the map has anything at all.
  const built = groundMask(cx, cz, MASK, (m) => kept.forEach((b) => m.poly(b.o, 1)));
  const mapped = groundMask(cx, cz, MASK, (m) => {
    kept.forEach((b) => m.poly(b.o, 3));
    [...data.lots, ...data.pools, ...data.greens].forEach((o) => m.poly(o, 3));
    data.roads.forEach((r) => m.line(r.p, r.w + 8));
  });
  // Is a piece free to stand at (x, y) metres: `margin` units outside the
  // barriers, nothing of the game's within r units, none of the fill's
  // buildings within `room` metres, not in the lake.
  const open = (x, y, margin, r, room = 1.5) => clearAt(course, x, y, margin, r) && !built(x, y, room) && dry(x, y);
  const concrete = rgba("#8d8d92", WALL.plain);

  // The monorail: its beam where it is clear of the track and its run-off
  // (it stops short and starts again), piers under the beam only, a station
  // here and there, a train.
  let piers = 0;
  let spans = 0;
  data.rail.forEach((line, k) => {
    const runs = clearSpans(line, 11, (x, y) => course.clearance(wx(x), wz(y), MARGIN + 60) >= MARGIN && dry(x, y));
    runs.forEach((run) => {
      spans += 1;
      run.forEach(([x, y], i) => {
        if (i + 1 < run.length) {
          const [bx, by] = run[i + 1];
          const len = Math.hypot(bx - x, by - y);
          soup.box((x + bx) / 2, (y + by) / 2, [(bx - x) / len, (by - y) / len], len / 2 + 0.2, 0.75, 7.2, 8.8, concrete, 20);
        }
        if (i % 3 !== 1 || !open(x, y, MARGIN, 2, 1)) return;
        soup.box(x, y, [1, 0], 0.8, 0.8, 0, 7.2, concrete, 20);
        piers += 1;
      });
    });
    if (lengthOf(line) < 500) return;
    alongLine(line, 850, 0, 240 + k * 90).forEach(([x, y, yaw], j) => {
      const d = [Math.cos(yaw), Math.sin(yaw)];
      // (Its hall and the train beside it, end to end: on the beam, clear.)
      const onBeam = runs.some((run) => run.some(([px, py]) => Math.hypot(px - x, py - y) < 12));
      const room = [-1, 0, 1].every((e) => [0, 9].every((off) => open(x + d[0] * e * 26 - d[1] * off, y + d[1] * e * 26 + d[0] * off, MARGIN, 3, 3)));
      if (!onBeam || !room) return;
      // A station: a glazed hall on the beam, lit.
      soup.box(x, y, d, 28, 5.5, 8.8, 13.2, rgba("#b9bcc2", WALL.plain), 20);
      lights.box(x, y, d, 27, 5.6, 10.2, 11.6, [0.8, 0.86, 0.95, 1], 0);
      if (j % 2) return;
      // A train at its platform: four cars, their windows lit.
      for (let c = -2; c < 2; c += 1) {
        soup.box(x + d[0] * (c * 9.4 + 4.7) - d[1] * 9, y + d[1] * (c * 9.4 + 4.7) + d[0] * 9, d, 4.5, 1.3, 8.8, 11.4, rgba("#e4e6ea", WALL.plain), 20);
        lights.box(x + d[0] * (c * 9.4 + 4.7) - d[1] * 9, y + d[1] * (c * 9.4 + 4.7) + d[0] * 9, d, 3.9, 1.34, 10.0, 10.7, [0.95, 0.9, 0.75, 1], 0);
      }
    });
  });

  // The footbridges that cross nothing of the circuit.
  let bridges = 0;
  data.bridges.forEach((line) => {
    const len = lengthOf(line);
    if (len < 18 || len > 220) return;
    if (!alongLine(line, 6, 0, 0).every(([x, y]) => clearAt(course, x, y, MARGIN + 4, 3) && dry(x, y))) return;
    for (let i = 0; i + 3 < line.length; i += 2) {
      const ax = line[i]; const ay = line[i + 1]; const bx = line[i + 2]; const by = line[i + 3];
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 0.5) continue;
      const d = [(bx - ax) / l, (by - ay) / l];
      soup.box((ax + bx) / 2, (ay + by) / 2, d, l / 2, 2.6, 6.0, 6.9, concrete, 20);
      [-1, 1].forEach((e) => lights.box((ax + bx) / 2 - d[1] * e * 2.5, (ay + by) / 2 + d[0] * e * 2.5, d, l / 2, 0.08, 7.9, 8.05, [0.75, 0.8, 0.9, 1], 0));
    }
    [[line[0], line[1]], [line[line.length - 2], line[line.length - 1]]].forEach(([x, y]) => soup.box(x, y, [1, 0], 2.2, 2.2, 0, 6.0, concrete, 20));
    bridges += 1;
  });

  // Bus shelters and billboards along the main roads near the circuit.
  let shelters = 0;
  let boards = 0;
  data.roads.forEach((r, k) => {
    if (r.c !== "p" && r.c !== "s") return;
    alongLine(r.p, 270, -(r.w / 2 + 4.5), 60 + (k * 53) % 200).forEach(([x, y, yaw]) => {
      if (shelters >= 90 || !nearTrack(course, x, y, 900) || !open(x, y, 12, 3.5, 3)) return;
      const d = [Math.cos(yaw), Math.sin(yaw)];
      soup.box(x, y, d, 2.2, 0.8, 2.3, 2.5, rgba("#3a3c42", WALL.plain), 20);
      [-1, 1].forEach((e) => soup.box(x + d[0] * e * 2.1, y + d[1] * e * 2.1, d, 0.08, 0.08, 0, 2.3, rgba("#3a3c42", WALL.plain), 20));
      lights.box(x + d[0] * 2.1, y + d[1] * 2.1, d, 0.07, 0.7, 0.5, 2.2, [0.85, 0.9, 1.0, 1], 0);
      shelters += 1;
    });
    alongLine(r.p, 420, (k % 2 ? 1 : -1) * (r.w / 2 + 13), 150 + (k * 97) % 380).forEach(([x, y, yaw]) => {
      if (boards >= 44 || !nearTrack(course, x, y, 1300)) return;
      const d = [Math.cos(yaw + 0.5), Math.sin(yaw + 0.5)];
      if (![-1, 0, 1].every((e) => open(x + d[0] * e * 7, y + d[1] * e * 7, MARGIN + 4, 4, 2))) return;
      soup.box(x, y, d, 0.5, 0.5, 0, 9.5, rgba("#44464c", WALL.plain), 20);
      if (boards % 5 < 3) {
        // A screen of abstract colour (no picture, no lettering), both ways.
        const t = screens.at(wx(x), wz(y));
        const id = [(210 + (boards % 40)) / 255, 0, 0, 1];
        [-1, 1].forEach((e) => {
          const off = [-d[1] * e * 0.36, d[0] * e * 0.36];
          const a = [x - d[0] * 7 + off[0], y - d[1] * 7 + off[1]]; const b = [x + d[0] * 7 + off[0], y + d[1] * 7 + off[1]];
          screens.face(t, [[wx(a[0]), 9.5 * S, wz(a[1])], [wx(b[0]), 9.5 * S, wz(b[1])], [wx(b[0]), 15 * S, wz(b[1])], [wx(a[0]), 15 * S, wz(a[1])]], [-d[1] * e, 0, -d[0] * e], [[0, 9.5], [14, 9.5], [14, 15], [0, 15]], id);
        });
        soup.box(x, y, d, 7.1, 0.3, 9.4, 15.1, rgba("#22232a", WALL.plain), 20);
      } else {
        // A blank board, floodlit.
        soup.box(x, y, d, 7, 0.3, 9.5, 15, rgba("#d6d4cc", WALL.plain), 20);
      }
      boards += 1;
    });
  });

  // The Fashion Show's canopy over its plaza: a white oval on pylons, lit beneath.
  const cloud = { x: -493, y: 1235, a: 55, b: 24 };
  const oval = [];
  for (let i = 0; i < 28; i += 1) oval.push(cloud.x + Math.cos((i / 28) * Math.PI * 2) * cloud.a, cloud.y + Math.sin((i / 28) * Math.PI * 2) * cloud.b);
  let canopy = false;
  if (oval.every((v, i) => i % 2 || clearAt(course, v, oval[i + 1], MARGIN + 6, 4))) {
    const t = soup.at(wx(cloud.x), wz(cloud.y));
    cap(soup, t, oval, 29, [0, 1, 0], rgba("#e9e9ee", WALL.plain), 30);
    cap(lights, lights.at(wx(cloud.x), wz(cloud.y)), oval, 27.4, [0, -1, 0], [0.72, 0.68, 0.95, 1], 0);
    for (let i = 0; i < 28; i += 1) {
      const a = [oval[i * 2], oval[i * 2 + 1]]; const b = [oval[((i + 1) % 28) * 2], oval[((i + 1) % 28) * 2 + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      soup.face(t, [[wx(a[0]), 27.4 * S, wz(a[1])], [wx(b[0]), 27.4 * S, wz(b[1])], [wx(b[0]), 29 * S, wz(b[1])], [wx(a[0]), 29 * S, wz(a[1])]], [(b[1] - a[1]) / len, 0, (b[0] - a[0]) / len], [[0, 30], [len, 30], [len, 30], [0, 30]], rgba("#e9e9ee", WALL.plain));
    }
    [[-34, -8], [34, -8], [-34, 8], [34, 8]].forEach(([dx, dy]) => soup.box(cloud.x + dx, cloud.y + dy, [1, 0], 1.2, 1.2, 0, 27.4, rgba("#c9c9d0", WALL.plain), 20));
    canopy = true;
  }

  const facade = stripFacade(true);
  facade.name = "facade_vegas_fill";
  facade.userData.worldOwned = true;
  soup.meshes(facade, "fill_buildings").forEach((m) => group.add(m));
  const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  neon.userData.worldOwned = true;
  lights.meshes(neon, "fill_lights").forEach((m) => group.add(m));
  const video = videoMaterial(clock);
  video.userData.worldOwned = true;
  screens.meshes(video, "fill_screens").forEach((m) => group.add(m));

  // The lamps: posts and heads near the circuit, points of light beyond.
  const lamps = lampSpots(data);
  const posts = lamps.filter((l) => nearTrack(course, l.x, l.y) && open(l.x, l.y, 9, 2, 1));
  const pole = new THREE.BoxGeometry(0.3 * S, 9 * S, 0.3 * S);
  pole.translate(0, 4.5 * S, 0);
  const arm = new THREE.BoxGeometry(2.2 * S, 0.2 * S, 0.25 * S);
  arm.translate(1.0 * S, 9 * S, 0);
  const poles = instanced("fill_lamp_posts", mergeGeometries([pole, arm]), new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.7 }), posts);
  const head = new THREE.BoxGeometry(1.1 * S, 0.22 * S, 0.5 * S);
  head.translate(1.7 * S, 8.86 * S, 0);
  const heads = instanced("fill_lamp_heads", head, new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }), posts);
  group.add(poles, heads);

  // The cars parked in the car parks: every car park near the circuit has
  // its rows; the nearest of them all are drawn.
  const paint = ["#d9dadc", "#c2c4c8", "#1b1c1f", "#5c5f66", "#8a1c1c", "#22345a", "#e9e6da", "#3a3d42", "#6b6f76"].map((h) => color(h));
  let spots = [];
  let carParks = 0;
  data.lots.forEach((lot) => {
    if (areaOf(lot) < 500) return;
    let near = false;
    for (let i = 0; i < lot.length && !near; i += 2) near = nearTrack(course, lot[i], lot[i + 1]);
    if (!near) return;
    const mine = carSpots(lot, rand, { share: 0.62 }).filter(([x, y]) => open(x, y, 8, 2.5, 2.5));
    if (mine.length) carParks += 1;
    mine.forEach(([x, y, yaw]) => spots.push({ x, y, yaw, color: paint[Math.floor(rand() * paint.length)] }));
  });
  spots = nearest(spots, (c) => course.clearance(wx(c.x), wz(c.y), NEAR + 200), CARS.high);
  const cars = spots;
  // (In no order of place: a lower tier draws the first of them, spread over every car park.)
  for (let i = cars.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [cars[i], cars[j]] = [cars[j], cars[i]]; }
  const parked = instanced("fill_cars", carGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35 }), cars);
  group.add(parked);

  // Palms, each where its own fronds are clear of the barriers (they reach
  // 14 units at full size) and of every building: along the boulevards,
  // round the pools, on the golf course and in the gardens, in the beds.
  const palmSpots = [];
  const palm = (x, y, scale, reach = NEAR) => {
    if (!nearTrack(course, x, y, reach) || !open(x, y, 14 * scale + 5, 4, 2)) return false;
    palmSpots.push({ x, y, yaw: rand() * 6.28, scale });
    return true;
  };
  let count = 0;
  data.roads.forEach((r, k) => {
    if (r.c !== "p") return;
    alongLine(r.p, 30, (k % 2 ? 1 : -1) * (r.w / 2 + 4.5), (k * 13) % 30).forEach(([x, y]) => { if (count < 480 && palm(x, y, 0.55 + rand() * 0.25)) count += 1; });
  });
  count = 0;
  data.pools.forEach((p) => {
    for (let i = 0; i < p.length && count < 200; i += 8) {
      const x = p[i] + (rand() - 0.5) * 9 + 5; const y = p[i + 1] + (rand() - 0.5) * 9 + 5;
      if (!insidePoly(x, y, p) && palm(x, y, 0.4 + rand() * 0.2)) count += 1;
    }
  });
  let greenTrees = 0;
  data.greens.forEach((g) => {
    if (areaOf(g) < 4000) return;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (let i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); }
    const want = Math.min(170, Math.ceil(areaOf(g) / 1500));
    let got = 0;
    for (let i = 0; i < want * 3 && got < want && greenTrees < 380; i += 1) {
      const x = x0 + rand() * (x1 - x0); const y = y0 + rand() * (y1 - y0);
      if (insidePoly(x, y, g) && palm(x, y, 0.4 + rand() * 0.35, 1100)) { got += 1; greenTrees += 1; }
    }
  });
  // The resorts' own grounds near the circuit, where the map has nothing:
  // planted beds, palms in most, a few low lights along each one's path.
  const beds = emptyGround(course, cx, cz, rand, mapped, (x, y, r) => clearAt(course, x, y, 12, r) && dry(x, y));
  const pathLights = [];
  count = 0;
  beds.forEach((b) => {
    if (b.k % 4 !== 3 && count < 420 && palm(b.x + (rand() - 0.5) * b.r, b.y + (rand() - 0.5) * b.r * b.flat, 0.34 + rand() * 0.3)) count += 1;
    const n = 1 + (b.k % 4);
    for (let i = 0; i < n; i += 1) pathLights.push({ x: b.x + Math.cos(b.turn + i * 6.283 / n + b.k) * (b.r + 1.4), y: b.y - Math.sin(b.turn + i * 6.283 / n + b.k) * (b.r * b.flat + 1.4), road: "path" });
  });
  const trunk = new THREE.CylinderGeometry(1.2, 1.8, 26, 5);
  trunk.translate(0, 13, 0);
  const fronds = palmFronds();
  fronds.translate(0, 26, 0);
  const trunks = instanced("fill_palm_trunks", trunk, new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 }), palmSpots);
  const crowns = instanced("fill_palm_fronds", fronds, new THREE.MeshStandardMaterial({ color: color("#4e7a3a"), roughness: 0.85, emissive: color("#4e7a3a"), emissiveIntensity: 0.18 }), palmSpots);
  group.add(trunks, crowns);

  // The far lights: the lamps past the posts, and windows through the city.
  const sparks = [];
  const tints = [];
  const warm = color("#ffb868"); const pale = color("#fff0d8"); const cool = color("#cfe0ff");
  lamps.forEach((l) => {
    if (nearTrack(course, l.x, l.y)) return;
    sparks.push(wx(l.x), 9 * S, wz(l.y));
    tints.push(warm.r, warm.g, warm.b);
  });
  kept.forEach((b) => {
    if (rand() > 0.45 || nearTrack(course, b.o[0], b.o[1], 500)) return;
    sparks.push(wx(b.o[0]), Math.min(b.h, 6) * S, wz(b.o[1]));
    const c = rand() < 0.7 ? pale : cool;
    tints.push(c.r, c.g, c.b);
  });
  // Past the map: the valley's lights out to the desert's edge.
  const CITY = 5600;
  for (let i = 0; i < 5200; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = 1700 + Math.sqrt(rand()) * (CITY - 1700);
    if (rand() < ((d - 1700) / (CITY - 1700)) ** 1.6) continue;
    sparks.push(cx + Math.cos(a) * d, (4 + rand() * 9) * S, cz + Math.sin(a) * d);
    const c = rand() < 0.75 ? warm : rand() < 0.6 ? pale : cool;
    tints.push(c.r, c.g, c.b);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.Float32BufferAttribute(sparks, 3));
  sparkGeo.setAttribute("color", new THREE.Float32BufferAttribute(tints, 3));
  const points = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 11, sizeAttenuation: true, map: sparkTexture(), vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  points.name = "fill_far_lights";
  points.frustumCulled = false;
  points.material.userData.worldOwned = true;
  group.add(points);

  // The ground: near the circuit in detail (finer on High), the valley
  // beyond it, a little lower so the two never fight.
  const NEAR_SIDE = 4600;
  const FAR_SIDE = 17000;
  const near = groundPlane(paintGround(data, [...lamps, ...pathLights], { cx, cz, side: NEAR_SIDE, px: tier === "high" ? 4096 : 2048, marks: data.marks, beds }), NEAR_SIDE, cx, cz, -0.4, "fill_ground");
  const far = groundPlane(paintGround(data, lamps, { cx, cz, side: FAR_SIDE, px: 2048, far: { city: CITY } }), FAR_SIDE, cx, cz, -1.3, "fill_far_ground");
  group.add(near, far, horizon(cx, cz));

  // By tier: Low leaves out the cars, the posts and the palms (the painted
  // ground and the points of light stay); Medium parks half the cars.
  let shown = null;
  group.userData.showFor = (t) => {
    if (t === shown) return;
    shown = t;
    const low = t === "low";
    parked.count = Math.min(cars.length, CARS[t] ?? CARS.high);
    parked.visible = parked.count > 0;
    [poles, heads, trunks, crowns].forEach((m) => { m.visible = !low && m.count > 0; });
  };
  group.userData.showFor(tier);
  group.userData.animate = (dt) => { clock.value += dt; };
  // (The game's own plain ground is not drawn under this one.)
  group.userData.replacesGround = true;
  group.userData.landmark = { name: "vegasFill", fromModel: true, x: Math.round(cx), z: Math.round(cz), buildings: kept.length, leftOut: data.low.length - kept.length, cars: cars.length, carParks, lamps: posts.length, palms: palmSpots.length, greenTrees, beds: beds.length, spans, piers, bridges, shelters, boards, canopy, farLights: sparks.length / 3 };
  return group;
}
