// Circuit geometry for the 3D renderer.
//
// Everything is extruded from the same centreline the physics runs on, so
// what you see is what you race. Real circuits fold back on themselves, so
// each sample along the lap measures how much room it has on either side
// before another stretch of the circuit, and the run-off and barriers shrink to
// fit. A spatial index of the lap lets every piece of scenery check that its
// whole footprint is clear of the track before it is placed.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { itemModel, swapBody } from "./items.js";
import {
  color, seeded, hashString, photo, canvasTexture, makeKerbTexture, makeCheckerTexture,
  makeAdvertTexture, makeBillboardTexture, makeCrowdTexture, makeFenceTexture,
} from "./textures.js";

export const SAMPLE_STEP = 6;
export const BRIDGE_HEIGHT = 26;
const BRIDGE_FLAT = 110;   // half-length of the level bridge deck
const BRIDGE_RAMP = 360;   // length of each ramp
const STREET = new Set(["monaco", "singapore"]);

const smooth = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// Spatial index over circles, for "is anything already here?" questions.
// ---------------------------------------------------------------------------

export class Occupancy {
  constructor(cell = 64) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) { return `${ix},${iz}`; }
  add(x, z, r) {
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix += 1) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz += 1) {
        const k = this.key(ix, iz);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push({ x, z, r });
      }
    }
  }
  blocked(x, z, r) {
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix += 1) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz += 1) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        for (const o of list) {
          if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return true;
        }
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// The course: samples along the lap and everything derived from them.
// ---------------------------------------------------------------------------

export function buildCourse(track) {
  const width = track.roadWidth;
  const street = STREET.has(track.id);
  const runoffBase = street ? width + 14 : width + 38;
  const total = track.totalLength;
  const segs = track.segments;
  const starts = track.cumulativeStarts;

  // Bridges: the later pass over a crossing climbs over the earlier one.
  const bridgeDistances = (track.bridges || []).map((b) => starts[b.over % starts.length]);
  const heightAt = (d) => {
    let h = 0;
    for (const bd of bridgeDistances) {
      let dd = Math.abs(((d - bd) % total + total) % total);
      dd = Math.min(dd, total - dd);
      const t = 1 - Math.max(0, dd - BRIDGE_FLAT) / BRIDGE_RAMP;
      if (t > 0) h = Math.max(h, BRIDGE_HEIGHT * smooth(Math.min(1, t)));
    }
    return h;
  };

  const count = Math.ceil(total / SAMPLE_STEP);
  const samples = [];
  let seg = 0;
  for (let i = 0; i < count; i += 1) {
    const d = (i / count) * total;
    while (seg < segs.length - 1 && starts[seg] + segs[seg].length < d) seg += 1;
    const s = segs[seg];
    const t = s.length ? (d - starts[seg]) / s.length : 0;
    samples.push({ i, x: s.a.x + s.dx * t, y: s.a.y + s.dy * t, d, h: heightAt(d) });
  }
  const n = samples.length;
  const k = 3;
  samples.forEach((p, i) => {
    const a = samples[(i - k + n) % n];
    const b = samples[(i + k) % n];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    p.tx = tx / len;
    p.ty = ty / len;
    p.nx = -p.ty;
    p.ny = p.tx;
  });
  samples.forEach((p, i) => {
    const q = samples[(i + 2) % n];
    p.curve = (p.tx * q.ty - p.ty * q.tx) / (2 * SAMPLE_STEP);
  });

  // Grid of samples for neighbourhood queries.
  const cell = 80;
  const grid = new Map();
  samples.forEach((p) => {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  });
  const near = (x, z, r, visit) => {
    for (let ix = Math.floor((x - r) / cell); ix <= Math.floor((x + r) / cell); ix += 1) {
      for (let iz = Math.floor((z - r) / cell); iz <= Math.floor((z + r) / cell); iz += 1) {
        const list = grid.get(`${ix},${iz}`);
        if (list) list.forEach(visit);
      }
    }
  };

  // Room either side before another stretch of the circuit (half the gap, so
  // two neighbours share it).
  const minArc = Math.ceil(260 / SAMPLE_STEP);
  samples.forEach((p) => {
    let left = Infinity;
    let right = Infinity;
    near(p.x, p.y, runoffBase * 2 + 20, (q) => {
      let gap = Math.abs(q.i - p.i);
      gap = Math.min(gap, n - gap);
      if (gap < minArc || Math.abs(q.h - p.h) > 10) return;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const dist = Math.hypot(dx, dy);
      const side = dx * p.nx + dy * p.ny;
      if (side >= 0) right = Math.min(right, dist / 2);
      else left = Math.min(left, dist / 2);
    });
    // Offsets are measured along the normal: +n is "right", -n is "left".
    p.outerR = Math.max(width + 10, Math.min(runoffBase, right - 3));
    p.outerL = Math.max(width + 10, Math.min(runoffBase, left - 3));
  });

  // Kerbs where the track bends, grown a little so they start before turn-in.
  const corner = samples.map((p) => Math.abs(p.curve) > 0.0022);
  const kerbOn = samples.map((_, i) => {
    for (let j = -5; j <= 5; j += 1) if (corner[(i + j + n) % n]) return true;
    return false;
  });

  // Clearance of a point from the circuit: how far it is outside the nearest
  // barrier, using the barrier on whichever side of the lap the point is.
  // Negative means inside the barriers.
  // `reach` is how far past the barriers to look; the search itself always
  // extends a full run-off width further, so a centreline point just out of
  // reach cannot hide a barrier that is close.
  const clearance = (x, z, reach = 260) => {
    let best = Infinity;
    near(x, z, reach + runoffBase + 4, (p) => {
      const dx = x - p.x;
      const dz = z - p.y;
      const barrier = (dx * p.nx + dz * p.ny >= 0 ? p.outerR : p.outerL) + 2;
      const d = Math.hypot(dx, dz) - barrier;
      if (d < best) best = d;
    });
    return best;
  };

  const sampleAt = (d) => samples[((Math.floor(d / SAMPLE_STEP) % n) + n) % n];
  const nearestSample = (x, z) => {
    let best = null;
    let bestD = Infinity;
    near(x, z, 160, (p) => {
      const d = (p.x - x) ** 2 + (p.y - z) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  };
  const heightAtPoint = (x, z) => {
    const p = nearestSample(x, z);
    return p ? p.h : 0;
  };

  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  samples.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
  });

  return {
    track, width, street, runoffBase, samples, kerbOn, heightAt, heightAtPoint, sampleAt,
    clearance, nearestSample,
    bounds: { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 },
    occupied: new Occupancy(),
    // Is a circle of radius r at (x, z) clear of the circuit and of anything
    // already placed? If so, claim it.
    claim(x, z, r, margin = 10) {
      if (this.clearance(x, z, r + 200) < r + margin) return false;
      if (this.occupied.blocked(x, z, r)) return false;
      this.occupied.add(x, z, r);
      return true;
    },
    // Spiral out from an anchor until a clear spot turns up.
    findSpot(ax, az, r, maxRadius = 900, margin = 10) {
      for (let rad = 0; rad <= maxRadius; rad += 30) {
        const steps = Math.max(1, Math.floor((2 * Math.PI * rad) / 45));
        for (let s = 0; s < steps; s += 1) {
          const a = (s / steps) * Math.PI * 2 + rad * 0.01;
          const x = ax + Math.cos(a) * rad;
          const z = az + Math.sin(a) * rad;
          if (this.claim(x, z, r, margin)) return { x, z };
        }
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// A strip following the lap between two signed offsets (functions of the
// sample), at the sample's height plus `lift`.
export function ribbon(samples, inner, outer, lift, vScale, filter) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = samples.length;
  let prev = -1;
  for (let i = 0; i <= n; i += 1) {
    const p = samples[i % n];
    if (filter && !filter(p, i % n)) { prev = -1; continue; }
    const a = inner(p);
    const b = outer(p);
    const base = pos.length / 3;
    const y = p.h + lift;
    pos.push(p.x + p.nx * a, y, p.y + p.ny * a, p.x + p.nx * b, y, p.y + p.ny * b);
    const v = (i === n ? samples[n - 1].d + SAMPLE_STEP : p.d) / vScale;
    uv.push(0, v, 1, v);
    if (prev >= 0) {
      if (b > a) idx.push(prev, base, prev + 1, prev + 1, base, base + 1);
      else idx.push(prev, prev + 1, base, prev + 1, base + 1, base);
    }
    prev = base;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// An offset line along the lap, without loops. On the inside of a bend
// tighter than the offset, the offset line runs backwards and loops over
// itself: whenever a new segment crosses one of the last few, everything since
// the crossing is dropped and the line goes on from the crossing point.
// Points are { x, z, i, v }: position, sample index, texture coordinate.
function untangle(points) {
  const out = [];
  const cross = (a, b, c, d) => {
    const r = { x: b.x - a.x, z: b.z - a.z };
    const q = { x: d.x - c.x, z: d.z - c.z };
    const den = r.x * q.z - r.z * q.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * q.z - (c.z - a.z) * q.x) / den;
    const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
    return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
  };
  points.forEach((pt) => {
    // Cut back to the earliest crossing, then look again from the cut: the
    // new segment may cross an older loop too.
    for (let cut = true; cut && out.length >= 3;) {
      cut = false;
      const last = out[out.length - 1];
      for (let k = Math.max(0, out.length - 60); k <= out.length - 3; k += 1) {
        const t = cross(out[k], out[k + 1], last, pt);
        if (t === null) continue;
        const a = out[k];
        const b = out[k + 1];
        const at = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, i: a.i, v: a.v + (b.v - a.v) * t };
        out.length = k + 1;
        out.push(at);
        cut = true;
        break;
      }
    }
    out.push(pt);
  });
  return out;
}

// A wall along an offset line, from `bottom` to `top` above the sample height.
function wall(samples, offset, bottom, top, vScale, filter) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = samples.length;
  // Runs of consecutive samples that pass the filter, each made into a strip.
  const runs = [];
  let run = null;
  for (let i = 0; i <= n; i += 1) {
    const p = samples[i % n];
    if (filter && !filter(p, i % n)) { run = null; continue; }
    if (!run) { run = []; runs.push(run); }
    const o = offset(p);
    run.push({ x: p.x + p.nx * o, z: p.y + p.ny * o, i: i % n, v: (i === n ? samples[n - 1].d + SAMPLE_STEP : p.d) / vScale });
  }
  runs.forEach((points) => {
    let prev = -1;
    untangle(points).forEach((pt) => {
      const p = samples[pt.i];
      const base = pos.length / 3;
      pos.push(pt.x, p.h + bottom(p), pt.z, pt.x, p.h + top(p), pt.z);
      uv.push(pt.v, 0, pt.v, 1);
      if (prev >= 0) idx.push(prev, base, prev + 1, prev + 1, base, base + 1);
      prev = base;
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const kerbTex = makeKerbTexture();
const checkerTex = makeCheckerTexture();
const fenceTex = makeFenceTexture();

function kerbMaterial(a, b) {
  return new THREE.ShaderMaterial({
    uniforms: { a: { value: color(a, "#dc0000") }, b: { value: color(b, "#ffffff") }, stripes: { value: kerbTex }, ...THREE.UniformsLib.fog },
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 a; uniform vec3 b; uniform sampler2D stripes; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){ float s = texture2D(stripes, vec2(0.5, vUv.y)).r; gl_FragColor = vec4(mix(b, a, 1.0 - s) * 0.85, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
}

// A barrier printed with adverts on both faces. Every wall's front faces
// point along +n (the lap runs along its length, the wall stands up), and the
// print runs with the lap, so it reads forward from the front; on the back it
// would read backwards, so there the print is flipped. Whichever side a
// barrier is seen from -- the track, or another stretch across it -- its
// words run forward.
function advertBarrierMaterial(map) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.6, side: THREE.DoubleSide });
  mat.userData.readsBothWays = true;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>",
      THREE.ShaderChunk.map_fragment.replace("texture2D( map, vMapUv )", "texture2D( map, gl_FrontFacing ? vMapUv : vec2( -vMapUv.x, vMapUv.y ) )"));
  };
  return mat;
}

// ---------------------------------------------------------------------------
// The circuit itself
// ---------------------------------------------------------------------------

export function buildCircuit(course, venue) {
  const { samples, width, kerbOn, track } = course;
  const bg = track.bg || {};
  const group = new THREE.Group();
  const n = samples.length;
  const mesh = (geo, mat, { cast = false, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    group.add(m);
    return m;
  };
  const L = (p) => -p.outerL;
  const R = (p) => p.outerR;
  const c = (v) => () => v;
  // What of the circuit can hide the sun (the flare's raycast): the bridges
  // and the start gantry, not the flat road and run-off.
  const occluders = [];
  group.userData.occluders = occluders;

  // Run-off: concrete pavement in town, paved run-off elsewhere.
  const runoffMat = course.street
    ? new THREE.MeshStandardMaterial({ map: photo("concrete_floor_02", 1, 1), color: color("#b8b4ac"), roughness: 0.95, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: photo("asphalt_track", 1, 1), color: color(venue.runoffTint || "#9aa0a0"), roughness: 0.95, side: THREE.DoubleSide });
  mesh(ribbon(samples, L, R, 0.03, 70), runoffMat);

  // Gravel traps on the outside of the corners, for circuits that have them.
  if (!course.street) {
    const gravelMat = new THREE.MeshStandardMaterial({ map: photo("gravel_road", 1, 1), color: color(venue.gravelTint || "#d8cbb0"), roughness: 1, side: THREE.DoubleSide });
    // curve > 0 turns towards +n, so the outside is -n (left).
    const outsideLeft = (p, i) => kerbOn[i] && p.curve > 0.0015 && p.outerL > width + 24;
    const outsideRight = (p, i) => kerbOn[i] && p.curve < -0.0015 && p.outerR > width + 24;
    mesh(ribbon(samples, (p) => -(width + 11), L, 0.07, 50, outsideLeft), gravelMat);
    mesh(ribbon(samples, c(width + 11), R, 0.07, 50, outsideRight), gravelMat);
  }

  // Tarmac.
  const road = new THREE.MeshStandardMaterial({ map: photo("asphalt_track", 2, 1), color: color(bg.road, "#484850").lerp(new THREE.Color(0xffffff), 0.45), roughness: 0.85, side: THREE.DoubleSide });
  mesh(ribbon(samples, c(-width), c(width), 0.14, 60), road);

  // Edge lines.
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, side: THREE.DoubleSide });
  mesh(ribbon(samples, c(-width), c(-width + 2.2), 0.18, 50), lineMat);
  mesh(ribbon(samples, c(width - 2.2), c(width), 0.18, 50), lineMat);

  // Kerbs.
  const kerbMat = kerbMaterial(bg.curbA, bg.curbB);
  mesh(ribbon(samples, c(width), c(width + 9), 0.22, 16, (_, i) => kerbOn[i]), kerbMat, { receive: false });
  mesh(ribbon(samples, c(-width - 9), c(-width), 0.22, 16, (_, i) => kerbOn[i]), kerbMat, { receive: false });

  // Barriers covered in adverts, plus a catch fence in town.
  const advertTex = makeAdvertTexture([bg.curbA || "#dc0000", "#f4f4f4", bg.accent || "#ffe08a", "#1b1b24"], ["F1", "PIXEL", "CUP", "2025"]);
  const barrierH = course.street ? 8 : 7;
  const barrierMat = advertBarrierMaterial(advertTex);
  [["left", (p) => -p.outerL - 1], ["right", (p) => p.outerR + 1]].forEach(([side, off]) => {
    const m = mesh(wall(samples, off, c(0), c(barrierH), 150), barrierMat, { cast: true });
    m.userData.advertSide = side;
  });
  if (course.street) {
    const fence = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
    fenceTex.repeat.set(1, 3);
    [(p) => -p.outerL - 1, (p) => p.outerR + 1].forEach((off) => {
      mesh(wall(samples, off, c(barrierH), c(barrierH + 24), 24), fence);
    });
  }

  // Bridge: embankment walls under the raised stretch (except where the lower
  // road passes through), piers under the deck, and a parapet.
  if (samples.some((p) => p.h > 0.5)) {
    const raised = (p) => p.h > 0.5;
    const clearOfLower = (p) => {
      let clear = true;
      samples.forEach((q) => {
        if (q.h < 0.5 && (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < (course.runoffBase + 30) ** 2) clear = false;
      });
      return clear;
    };
    const flags = samples.map((p) => raised(p) && clearOfLower(p));
    const earth = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9, side: THREE.DoubleSide });
    [(p) => -p.outerL - 1, (p) => p.outerR + 1].forEach((off) => {
      occluders.push(mesh(wall(samples, off, (p) => -p.h, c(0), 40, (p, i) => flags[i]), earth, { cast: true }));
    });
    const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.8 });
    // Deck underside and piers where the bridge spans the lower road.
    occluders.push(mesh(ribbon(samples, L, R, -2.5, 60, (p, i) => raised(p) && !flags[i] && p.h > BRIDGE_HEIGHT * 0.6), concrete));
    samples.forEach((p, i) => {
      if (!raised(p) || flags[i] || i % 6 || p.h < BRIDGE_HEIGHT * 0.6) return;
      [-1, 1].forEach((side) => {
        const off = side > 0 ? p.outerR - 4 : -p.outerL + 4;
        const x = p.x + p.nx * off;
        const z = p.y + p.ny * off;
        // Keep piers off the lower carriageway.
        const lower = course.nearestSample(x, z);
        if (lower && lower.h < 0.5 && Math.hypot(lower.x - x, lower.y - z) < width + 14) return;
        const pier = new THREE.Mesh(new THREE.BoxGeometry(5, p.h, 5), concrete);
        pier.position.set(x, p.h / 2, z);
        pier.castShadow = true;
        group.add(pier);
        occluders.push(pier);
      });
    });
    const parapet = new THREE.MeshStandardMaterial({ color: 0xdedbd2, roughness: 0.7, side: THREE.DoubleSide });
    [(p) => -p.outerL - 1, (p) => p.outerR + 1].forEach((off) => {
      occluders.push(mesh(wall(samples, off, c(barrierH), c(barrierH + 3), 40, (p) => p.h > BRIDGE_HEIGHT * 0.6), parapet));
    });
  }

  // Start / finish: chequered band, gantry, grid boxes.
  const start = samples[0];
  const startAngle = Math.atan2(start.ty, start.tx);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(10, width * 2), new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.7 }));
  band.rotation.set(-Math.PI / 2, 0, -startAngle);
  band.position.set(start.x, start.h + 0.24, start.y);
  band.receiveShadow = true;
  group.add(band);
  const gantry = buildGantry(start, Math.max(start.outerL, start.outerR), startAngle);
  group.add(gantry);
  occluders.push(gantry);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee });
  // Same layout as layoutGrid in game.js: rows of two, 36 apart.
  const laneSpacing = Math.min(28, width * 0.38);
  for (let slot = 0; slot < 20; slot += 1) {
    const row = Math.floor(slot / 2);
    const lane = slot % 2 === 0 ? -1 : 1;
    const p = course.sampleAt(track.totalLength - (row * 36 + 12) + 14);
    const lateral = lane * laneSpacing;
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(2, 16), gridMat);
    mark.rotation.set(-Math.PI / 2, 0, -Math.atan2(p.ty, p.tx));
    mark.position.set(p.x + p.nx * lateral, p.h + 0.2, p.y + p.ny * lateral);
    group.add(mark);
  }

  return group;
}

function buildGantry(start, halfSpan, angle) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2a32, metalness: 0.6, roughness: 0.4 });
  const span = halfSpan * 2 + 8;
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(3, 46, 3), steel);
    post.position.set(0, 23, (s * span) / 2);
    post.castShadow = true;
    g.add(post);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 7, span), steel);
  beam.position.set(0, 44, 0);
  beam.castShadow = true;
  g.add(beam);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a0a, emissiveIntensity: 0.25 });
  for (let i = 0; i < 5; i += 1) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    pod.position.set(-3, 44, (i - 2) * 6);
    g.add(pod);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), lampMat);
    lamp.position.set(-4.1, 44, (i - 2) * 6);
    lamp.rotation.y = -Math.PI / 2;
    g.add(lamp);
  }
  const bannerTex = canvasTexture(1024, 96, (cx, w, h) => {
    cx.fillStyle = "#dc0000";
    cx.fillRect(0, 0, w, h);
    cx.fillStyle = "#fff";
    cx.font = "900 italic 64px Trebuchet MS, sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("F1 PIXEL CUP", w / 2, h / 2 + 2);
  }, { repeat: false });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.7, 6), new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide }));
  banner.position.set(-2.6, 51, 0);
  banner.rotation.y = -Math.PI / 2;
  g.add(banner);
  g.position.set(start.x, start.h, start.y);
  g.rotation.y = -angle;
  return g;
}

// ---------------------------------------------------------------------------
// Scenery from the track data (grandstands, billboards, towers)
// ---------------------------------------------------------------------------

// Footprints in local units: half-length along the track, half-depth away.
const FOOTPRINT = {
  grandstand: [78, 34],
  billboard: [32, 4],
  tower: [20, 20],
};

// Every corner and edge point of the rotated footprint must be clear.
export function footprintClear(course, x, z, angle, hl, hd, margin) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (const u of [-1, -0.5, 0, 0.5, 1]) {
    for (const v of [-1, 0, 1]) {
      const px = x + u * hl * ca - v * hd * sa;
      const pz = z + u * hl * sa + v * hd * ca;
      if (course.clearance(px, pz) < margin) return false;
    }
  }
  return true;
}

export function buildDecor(course, venue) {
  const group = new THREE.Group();
  const { track } = course;
  const bg = track.bg || {};
  let dropped = 0;
  track.decor.forEach((d, i) => {
    const fp = FOOTPRINT[d.type];
    if (!fp) return;
    const [hl, hd] = fp;
    if (!footprintClear(course, d.x, d.y, d.angle, hl, hd, 6)) { dropped += 1; return; }
    if (course.occupied.blocked(d.x, d.y, Math.max(hl, hd))) { dropped += 1; return; }
    course.occupied.add(d.x, d.y, Math.max(hl, hd));
    const obj = buildDecorPiece(d, bg, venue, i);
    obj.position.set(d.x, 0, d.y);
    // Local -Z faces the circuit.
    obj.rotation.y = -d.face - Math.PI / 2;
    group.add(obj);
  });
  group.userData.dropped = dropped;
  return group;
}

function buildDecorPiece(d, bg, venue, i) {
  const g = new THREE.Group();
  const std = (col, extra = {}) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, ...extra });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  if (d.type === "grandstand") {
    // Centred on its footprint, seats rising away from the track.
    const len = 150;
    const concrete = std(0x9a9aa2);
    const seats = std(color(venue.standColor || bg.curbA, "#dc0000"), { roughness: 0.55 });
    for (let row = 0; row < 7; row += 1) {
      add(new THREE.BoxGeometry(len, 5, 8), row % 2 ? concrete : seats, 0, 2.5 + row * 5, -28 + row * 8);
    }
    add(new THREE.BoxGeometry(len, 40, 4), concrete, 0, 20, 30);
    const roof = add(new THREE.BoxGeometry(len + 8, 2, 64), std(0xe8e8ec), 0, 50, -2);
    roof.rotation.x = -0.08;
    [-len / 2, 0, len / 2].forEach((x) => add(new THREE.BoxGeometry(2, 50, 2), std(0x55555c), x, 25, 28));
    const crowd = new THREE.MeshStandardMaterial({ map: makeCrowdTexture(i + 99), roughness: 0.9 });
    for (let row = 0; row < 7; row += 2) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 4.5), crowd);
      face.position.set(0, 5.3 + row * 5, -28 + row * 8 - 4.05);
      face.rotation.y = Math.PI;
      g.add(face);
    }
    return g;
  }
  if (d.type === "tower") {
    const h = 60 + (i % 3) * 25;
    add(new THREE.BoxGeometry(34, h, 34), std(0x8a8a90, { metalness: 0.2 }), 0, h / 2, 0);
    const glass = std(venue.night ? 0xffd890 : 0x6a8aa8, { metalness: 0.5, roughness: 0.2, emissive: venue.night ? 0xffc060 : 0x000000, emissiveIntensity: venue.night ? 0.6 : 0 });
    for (let f = 1; f < h / 12; f += 1) add(new THREE.BoxGeometry(35, 4, 35), glass, 0, f * 12, 0);
    return g;
  }
  if (d.type === "billboard") {
    add(new THREE.BoxGeometry(2, 30, 2), std(0x3a3a40), -20, 15, 0);
    add(new THREE.BoxGeometry(2, 30, 2), std(0x3a3a40), 20, 15, 0);
    const tex = makeBillboardTexture(bg.accent || "#ffe08a", i + 7);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshStandardMaterial({
      map: tex, side: THREE.DoubleSide,
      emissive: venue.night ? 0xffffff : 0x000000, emissiveIntensity: venue.night ? 0.35 : 0, emissiveMap: venue.night ? tex : null,
    }));
    board.position.set(0, 34, -1.2);
    board.rotation.y = Math.PI;
    board.castShadow = true;
    g.add(board);
    return g;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Trees, instanced. Kinds: "broadleaf", "conifer", "palm".
// ---------------------------------------------------------------------------

// Seven drooping fronds radiating from the top of the trunk.
function palmFronds() {
  const parts = [];
  for (let i = 0; i < 7; i += 1) {
    const frond = new THREE.BoxGeometry(14, 0.6, 3.2);
    frond.translate(7, 0, 0);
    frond.rotateZ(-0.45 - (i % 2) * 0.15);
    frond.rotateY((i / 7) * Math.PI * 2);
    parts.push(frond);
  }
  return mergeGeometries(parts);
}

export function scatterTrees(course, { count, kind = "broadleaf", tint = "#3a6a35", night = false, pad = 700, seed = 1, near = null }) {
  const group = new THREE.Group();
  if (!count) return group;
  const rand = seeded(hashString(course.track.id) + seed);
  const b = course.bounds;
  const trunkGeo = kind === "palm" ? new THREE.CylinderGeometry(1.2, 1.8, 26, 5) : new THREE.CylinderGeometry(1.6, 2.4, 12, 5);
  const crownGeo = kind === "conifer"
    ? new THREE.ConeGeometry(11, 34, 7)
    : kind === "palm" ? palmFronds() : new THREE.IcosahedronGeometry(14, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: kind === "palm" ? 0x8a6a4a : 0x5a4030, roughness: 0.9 }), count);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), count);
  trunks.castShadow = crowns.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const base = color(tint);
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 25) {
    tries += 1;
    let x;
    let z;
    if (near) {
      // Hug the circuit: pick a sample and step out from its barrier.
      const p = course.samples[Math.floor(rand() * course.samples.length)];
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * ((side > 0 ? p.outerR : p.outerL) + 30 + rand() * near);
      x = p.x + p.nx * off;
      z = p.y + p.ny * off;
    } else {
      x = b.minX - pad + rand() * (b.maxX - b.minX + pad * 2);
      z = b.minZ - pad + rand() * (b.maxZ - b.minZ + pad * 2);
    }
    const scale = kind === "conifer" ? 0.8 + rand() * 0.9 : 0.7 + rand() * 0.8;
    const r = (kind === "palm" ? 17 : 15) * scale;
    if (course.clearance(x, z, r + 60) < r + 12 || course.occupied.blocked(x, z, r)) continue;
    course.occupied.add(x, z, r * 0.7);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    s.setScalar(scale);
    const trunkH = kind === "palm" ? 13 : 6;
    m.compose(pos.set(x, trunkH * scale, z), q, s);
    trunks.setMatrixAt(placed, m);
    const crownY = kind === "conifer" ? 26 : kind === "palm" ? 27 : 22;
    m.compose(pos.set(x, crownY * scale, z), q, s);
    crowns.setMatrixAt(placed, m);
    const col = base.clone().offsetHSL((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.12);
    if (night) col.multiplyScalar(0.55);
    crowns.setColorAt(placed, col);
    placed += 1;
  }
  trunks.count = crowns.count = placed;
  group.add(trunks, crowns);
  return group;
}

// ---------------------------------------------------------------------------
// Item boxes
// ---------------------------------------------------------------------------

// An item box: the hand-built model (red glass, bevelled frame, a "?"
// inside) once it has loaded, a simple textured cube until then. The part that
// spins is userData.box; userData.mark (the model's "?") is turned to face the
// camera; userData.glow lists the materials that pulse.
export function buildItemBox() {
  const g = new THREE.Group();
  const body = itemModel("itemBox") || itemBoxStandIn();
  g.add(body);
  dressBox(g, body);
  return g;
}

function dressBox(g, body) {
  g.userData.body = body;
  g.userData.box = (body.userData.fromGlb && body.getObjectByName("item_box")) || body;
  g.userData.mark = body.userData.fromGlb ? body.getObjectByName("item_box_mark") : null;
  g.userData.glow = glowMaterials(g.userData.box);
}

// Once the models are in, a box built before then swaps to the model.
export function upgradeItemBox(g) {
  const model = itemModel("itemBox");
  if (!model || g.userData.body.userData.fromGlb) return false;
  swapBody(g, model);
  dressBox(g, model);
  return true;
}

function glowMaterials(body) {
  const mats = [];
  body.traverse((node) => {
    if (!node.isMesh) return;
    (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => {
      if ("emissiveIntensity" in m && m.name !== "box_mark") mats.push(m);
    });
  });
  return mats;
}

function itemBoxStandIn() {
  const qTex = canvasTexture(128, 128, (cx, w, h) => {
    const grad = cx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#ff3b30");
    grad.addColorStop(1, "#b0000a");
    cx.fillStyle = grad;
    cx.fillRect(0, 0, w, h);
    cx.strokeStyle = "#fff0c9";
    cx.lineWidth = 8;
    cx.strokeRect(4, 4, w - 8, h - 8);
    cx.fillStyle = "#fff0c9";
    cx.font = "900 84px Trebuchet MS, sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("?", w / 2, h / 2 + 4);
  }, { repeat: false });
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(11, 11, 11),
    new THREE.MeshStandardMaterial({ map: qTex, emissive: 0xff2010, emissiveIntensity: 0.35, transparent: true, opacity: 0.92, roughness: 0.3 }),
  );
  box.castShadow = true;
  return box;
}
