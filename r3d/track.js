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
import { tunnelUniforms, TUNNEL_GLSL } from "./tunnel-light.js";
import {
  color, seeded, hashString, photo, canvasTexture, makeKerbTexture, makeCheckerTexture,
  makeAdvertTexture, makeBillboardTexture, makeCrowdTexture, makeFenceTexture, buildingMaterial, luminance,
} from "./textures.js";
import { wettable, WET_ROAD, WET_RUNOFF, WET_GRAVEL, WET_PAINT } from "./rain.js";
import { tracksideModel, STAND_MODELS } from "./models.js";
import { inEntranceGap } from "./entrances.js";
import { standSite, rectPoints } from "./vegas-place.js";

// (A UMD module: imported for its side effect, it defines self.Runoff.)
import "../runoff.js";
// Placement maths, pure and tested in Node (siting.js).
const Siting = window.Siting;

const Runoff = self.Runoff;
export const SAMPLE_STEP = Runoff.SAMPLE_STEP;
export const BRIDGE_HEIGHT = Runoff.BRIDGE_HEIGHT;

// ---------------------------------------------------------------------------
// Spatial index over circles, for "is anything already here?" questions.
// ---------------------------------------------------------------------------

export class Occupancy {
  constructor(cell = 64) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) { return `${ix},${iz}`; }
  // `tag`: what claimed it, where a question may leave some claims out.
  add(x, z, r, tag) {
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix += 1) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz += 1) {
        const k = this.key(ix, iz);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push({ x, z, r, tag });
      }
    }
  }
  blocked(x, z, r, ignore) {
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix += 1) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz += 1) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        for (const o of list) {
          if (ignore && o.tag === ignore) continue;
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
  // The samples, the run-off either side and the barrier lines are the
  // physics' own (runoff.js): the cars hit the barriers drawn here.
  // (Worked out once per circuit; game.js getRunoff keeps it on the track too.)
  const { width, street, runoffBase, samples, heightAt, near, sampleAt } = track.runoff || (track.runoff = Runoff.profile(track));
  const n = samples.length;
  const pitLane = track.pitLane || null;

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
    track, width, street, runoffBase, samples, kerbOn, heightAt, heightAtPoint, sampleAt, pitLane,
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
    // The kerbs are unlit paint; in the tunnel they take its light
    // (r3d/tunnel-light.js) like everything else.
    // Wet (r3d/rain.js), the paint is darker and the day behind cloud.
    uniforms: { a: { value: color(a, "#dc0000") }, b: { value: color(b, "#ffffff") }, stripes: { value: kerbTex }, wet: { value: 0 }, ...THREE.UniformsLib.fog, ...tunnelUniforms },
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vTunnelPos;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vTunnelPos = (modelMatrix * vec4(position, 1.0)).xyz; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 a; uniform vec3 b; uniform sampler2D stripes; uniform float wet; varying vec2 vUv; varying vec3 vTunnelPos;
      ${TUNNEL_GLSL}
      #include <fog_pars_fragment>
      void main(){ float s = texture2D(stripes, vec2(0.5, vUv.y)).r; float lit = tunnelOpen(vTunnelPos);
        gl_FragColor = vec4(mix(b, a, 1.0 - s) * 0.85 * (1.0 - 0.35 * wet) * (lit + (1.0 - lit) * tLamp), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
}

// Print that reads forward from both sides of a double-sided surface: on its
// back faces the texture is flipped left to right (and its glow with it), so
// a banner or barrier seen from behind doesn't read backwards.
export function readsBothWays(mat) {
  const flip = (chunk, uv) => chunk.replace(`( map, ${uv} )`, `( map, gl_FrontFacing ? ${uv} : vec2( 1.0 - ${uv}.x, ${uv}.y ) )`)
    .replace(`( emissiveMap, ${uv} )`, `( emissiveMap, gl_FrontFacing ? ${uv} : vec2( 1.0 - ${uv}.x, ${uv}.y ) )`);
  mat.userData.readsBothWays = true;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <map_fragment>", flip(THREE.ShaderChunk.map_fragment, "vMapUv"))
      .replace("#include <emissivemap_fragment>", flip(THREE.ShaderChunk.emissivemap_fragment, "vEmissiveMapUv"));
  };
  return mat;
}

// A barrier printed with adverts on both faces. Every wall's front faces
// point along +n (the lap runs along its length, the wall stands up), and the
// print runs with the lap, so it reads forward from the front; from the back
// it is flipped. Whichever side a barrier is seen from -- the track, or
// another stretch across it -- its words run forward.
function advertBarrierMaterial(map) {
  return readsBothWays(new THREE.MeshStandardMaterial({ map, roughness: 0.6, side: THREE.DoubleSide }));
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
  const runoffMat = wettable(course.street
    ? new THREE.MeshStandardMaterial({ map: photo("concrete_floor_02", 1, 1), color: color("#b8b4ac"), roughness: 0.95, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: photo("asphalt_track", 1, 1), color: color(venue.runoffTint || "#9aa0a0"), roughness: 0.95, side: THREE.DoubleSide }), WET_RUNOFF);
  mesh(ribbon(samples, L, R, 0.03, 70), runoffMat);

  // Gravel traps on the outside of the corners, for circuits that have them.
  if (!course.street) {
    const gravelMat = wettable(new THREE.MeshStandardMaterial({ map: photo("gravel_road", 1, 1), color: color(venue.gravelTint || "#d8cbb0"), roughness: 1, side: THREE.DoubleSide }), WET_GRAVEL);
    // curve > 0 turns towards +n, so the outside is -n (left).
    const outsideLeft = (p, i) => kerbOn[i] && p.curve > 0.0015 && p.outerL > p.wid + 24;
    const outsideRight = (p, i) => kerbOn[i] && p.curve < -0.0015 && p.outerR > p.wid + 24;
    mesh(ribbon(samples, (p) => -(p.wid + 11), L, 0.07, 50, outsideLeft), gravelMat);
    mesh(ribbon(samples, (p) => p.wid + 11, R, 0.07, 50, outsideRight), gravelMat);
  }

  // Tarmac.
  const road = wettable(new THREE.MeshStandardMaterial({ map: photo("asphalt_track", 2, 1), color: color(bg.road, "#484850").lerp(new THREE.Color(0xffffff), 0.45), roughness: 0.85, side: THREE.DoubleSide }), WET_ROAD);
  road.userData.surface = "road";
  // (Each sample's own half-width: the road narrows where the track does.)
  const edgeL = (p) => -p.wid;
  const edgeR = (p) => p.wid;
  mesh(ribbon(samples, edgeL, edgeR, 0.14, 60), road);

  // Edge lines.
  const lineMat = wettable(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, side: THREE.DoubleSide }), WET_PAINT);
  mesh(ribbon(samples, edgeL, (p) => -p.wid + 2.2, 0.18, 50), lineMat);
  mesh(ribbon(samples, (p) => p.wid - 2.2, edgeR, 0.18, 50), lineMat);

  // Kerbs.
  const kerbMat = kerbMaterial(bg.curbA, bg.curbB);
  mesh(ribbon(samples, edgeR, (p) => p.wid + 9, 0.22, 16, (_, i) => kerbOn[i]), kerbMat, { receive: false });
  mesh(ribbon(samples, (p) => -p.wid - 9, edgeL, 0.22, 16, (_, i) => kerbOn[i]), kerbMat, { receive: false });

  // Barriers covered in adverts, plus a catch fence in town.
  const advertTex = makeAdvertTexture([bg.curbA || "#dc0000", "#f4f4f4", bg.accent || "#ffe08a", "#1b1b24"], ["F1", "PIXEL", "CUP", "2025"]);
  const barrierH = course.street ? 8 : 7;
  const barrierMat = advertBarrierMaterial(advertTex);
  const pitLane = course.pitLane;
  // Along the garages' frontage the garages are the boundary: no barrier
  // (nor, on the street circuits, catch fence).
  const atGarages = (p) => Boolean(pitLane) && pitLane.atGarage(p.d, 4);
  // Open too where a service entrance comes through (r3d/entrances.js).
  const entrances = track.entrances || [];
  const atGate = (p, sign) => inEntranceGap(entrances, sign, p.d, track.totalLength);
  [["left", (p) => -p.outerL - 1, -1], ["right", (p) => p.outerR + 1, 1]].forEach(([side, off, sign]) => {
    const onPitSide = pitLane && pitLane.side === sign;
    const m = mesh(wall(samples, off, c(0), c(barrierH), 150, (p) => !(onPitSide && atGarages(p)) && !atGate(p, sign)), barrierMat, { cast: true });
    m.userData.advertSide = side;
  });
  if (pitLane) group.add(buildPitLane(course, pitLane, occluders));
  // The tunnel (Monaco's, from the track data): through it the tunnel's own
  // walls stand where a catch fence would.
  const inTunnel = (p) => Boolean(track.tunnel) && inTunnelAt(track.tunnel, track.totalLength, p.d);
  if (course.street) {
    const fence = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
    fenceTex.repeat.set(1, 3);
    [[(p) => -p.outerL - 1, -1], [(p) => p.outerR + 1, 1]].forEach(([off, sign]) => {
      const onPitSide = pitLane && pitLane.side === sign;
      // (Marked: the replay's TV cameras stand high enough to see over it.)
      mesh(wall(samples, off, c(barrierH), c(barrierH + 24), 24, (p) => !inTunnel(p) && !(onPitSide && atGarages(p)) && !atGate(p, sign)), fence).userData.catchFence = true;
    });
  }
  if (track.tunnel) group.add(buildTunnel(course, track.tunnel, occluders));

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
        // Keep piers off the lower road and its run-off, out past its
        // barrier: the cars can drive all the way out to it.
        const lower = course.nearestSample(x, z);
        if (lower && lower.h < 0.5) {
          const across = (x - lower.x) * lower.nx + (z - lower.y) * lower.ny;
          const barrier = (across >= 0 ? lower.outerR : lower.outerL) + Runoff.BARRIER_GAP;
          if (Math.hypot(lower.x - x, lower.y - z) < barrier + 4) return;
        }
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
  // Each post stands just outside its own side's barrier -- which through a
  // pit zone is past the whole pit complex (buildCourse widened it) -- except
  // where there is a pit wall at the line: then on the wall, in front of the
  // garages.
  const postAt = (sign) => {
    const lane = course.pitLane;
    if (lane && lane.side === sign && lane.wallAt(start.d) !== null) return width + (Pit.WALL_IN + Pit.WALL_OUT) / 2;
    return (sign > 0 ? start.outerR : start.outerL) + 4;
  };
  const gantry = buildGantry(start, postAt(1), postAt(-1), startAngle);
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

// The pit lane (pitlane.js has the shape): its tarmac and lines, the pit wall
// with the teams' stands on it. The garages are in r3d/landmarks.js.
function buildPitLane(course, lane, occluders) {
  const group = new THREE.Group();
  group.name = "pitLane";
  const { samples, width } = course;
  const side = lane.side;
  const inZone = (p) => lane.inZone(p.d);
  const add = (geo, mat, opts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = opts.receive !== false;
    m.castShadow = Boolean(opts.cast);
    group.add(m);
    return m;
  };
  // Tarmac: from the lane's inner edge out to the working lane, and right up
  // to the garage doors in front of them. In the mouths it runs under the
  // road (which sits higher), so it meets the road without a seam.
  const tarmac = wettable(new THREE.MeshStandardMaterial({ map: photo("asphalt_track", 2, 1), color: color("#6a6a70"), roughness: 0.9, side: THREE.DoubleSide }), WET_ROAD);
  const reach = (p) => (lane.atGarage(p.d, 4) ? lane.garages.front : lane.outerAt(p.d));
  add(ribbon(samples, (p) => side * (Math.abs(lane.latAt(p.d)) - lane.laneHalf), (p) => side * reach(p), 0.1, 60, inZone), tarmac);
  // Lines. The lane's inner edge, from the road's edge where the lane leaves
  // it (the blend line painted on the track at the entry and the exit) all
  // the way along; and the dashed line between the fast lane and the working
  // lane along the flat part.
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, side: THREE.DoubleSide });
  const edge = (p) => Math.max(width - 2.2, Math.abs(lane.latAt(p.d)) - lane.laneHalf);
  add(ribbon(samples, (p) => side * edge(p), (p) => side * (edge(p) + 1.6), 0.18, 50, inZone), paint);
  const fast = lane.laneCentre + lane.laneHalf;
  const flat = (p) => {
    const r = lane.rel(p.d);
    return r >= lane.flatFrom && r <= lane.flatTo;
  };
  add(ribbon(samples, () => side * (fast - 0.8), () => side * (fast + 0.8), 0.16, 50, (p) => flat(p) && Math.floor(p.d / 12) % 2 === 0), paint);
  // "PIT" painted on the lane just past the entry mouth, reading as you
  // drive in.
  const pitTex = canvasTexture(256, 128, (cx, w, h) => {
    cx.clearRect(0, 0, w, h);
    cx.fillStyle = "#f2f2ee";
    cx.font = "900 110px Trebuchet MS, sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText("PIT", w / 2, h / 2 + 6);
  }, { repeat: false });
  pitTex.userData.print = true;
  const word = course.sampleAt(((lane.entry + lane.mouth + 40) % course.track.totalLength + course.track.totalLength) % course.track.totalLength);
  const wordAt = Math.abs(lane.latAt(word.d));
  const letters = add(new THREE.PlaneGeometry(26, 13), new THREE.MeshStandardMaterial({ map: pitTex, transparent: true, roughness: 0.6 }));
  letters.rotation.set(-Math.PI / 2, 0, -Math.atan2(word.ty, word.tx) - Math.PI / 2);
  letters.position.set(word.x + word.nx * side * wordAt, word.h + 0.17, word.y + word.ny * side * wordAt);
  // The pit wall: concrete, where the lane has cleared it -- two faces, a
  // cap, and ends -- with a catch fence on top that stops at the stands.
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.85, side: THREE.DoubleSide });
  const hasWall = (p) => lane.wallAt(p.d) !== null;
  const wallIn = width + Pit.WALL_IN;
  const wallOut = width + Pit.WALL_OUT;
  const wallH = 6;
  [wallIn, wallOut].forEach((o) => occluders.push(add(wall(samples, () => side * o, () => 0, () => wallH, 40, hasWall), concrete, { cast: true })));
  add(ribbon(samples, () => side * wallIn, () => side * wallOut, wallH, 40, hasWall), concrete);
  const n = samples.length;
  samples.forEach((p, i) => {
    const next = samples[(i + 1) % n];
    if (hasWall(p) === hasWall(next)) return;
    const end = hasWall(p) ? p : next;
    const cap = add(new THREE.BoxGeometry(1, wallH, wallOut - wallIn), concrete, { cast: true });
    cap.position.set(end.x + end.nx * side * (wallIn + wallOut) / 2, end.h + wallH / 2, end.y + end.ny * side * (wallIn + wallOut) / 2);
    cap.rotation.y = -Math.atan2(end.ty, end.tx);
  });
  // No stand where the start gantry's post stands on the wall (at the line).
  const stands = lane.garages.bays.filter((bay) => !bay.safetyCar && Math.abs(bay.rel) > 9 + 2);
  const atStand = (p) => stands.some((bay) => Math.abs(lane.rel(p.d) - bay.rel) <= 10);
  const fence = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
  add(wall(samples, () => side * (wallIn + 1.5), () => wallH, () => wallH + 10, 24, (p) => hasWall(p) && !atStand(p)), fence).userData.catchFence = true;
  // The teams' stands on the wall, one opposite each team's garage: a desk
  // under a roof over the wall and the lane's edge, never the road. One mesh
  // per material for all ten.
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.5, metalness: 0.3 });
  // Light, short of white: the sun on white would bloom to a glare.
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xcfd0d4, roughness: 0.6 });
  const parts = { stand: [], roof: [] };
  const place = (geo, x, y, z, p) => {
    const m = new THREE.Matrix4().makeRotationY(-Math.atan2(p.ty, p.tx));
    m.setPosition(p.x + p.nx * side * wallIn, p.h, p.y + p.ny * side * wallIn);
    return geo.translate(x, y, z).applyMatrix4(m);
  };
  group.userData.standBoxes = [];
  stands.forEach((bay) => {
    const p = course.sampleAt(bay.d);
    // Each stand's extent, for the checks (the meshes are merged).
    const box = new THREE.Box3();
    const at = new THREE.Matrix4().makeRotationY(-Math.atan2(p.ty, p.tx)).setPosition(p.x + p.nx * side * wallIn, p.h, p.y + p.ny * side * wallIn);
    [-9, 9].forEach((x) => [0, wallH + 9.4].forEach((y) => [0, 7].forEach((z) => box.expandByPoint(new THREE.Vector3(x, y, side * z).applyMatrix4(at)))));
    group.userData.standBoxes.push(box);
    // Local x along the lap, local z across it (toward the pit side).
    parts.stand.push(place(new THREE.BoxGeometry(14, 3, 4), 0, wallH + 1.5, side * 2, p));
    [-7, 7].forEach((u) => parts.stand.push(place(new THREE.BoxGeometry(0.6, 9, 0.6), u, wallH + 4.5, side * 6, p)));
    parts.roof.push(place(new THREE.BoxGeometry(18, 0.8, 7), 0, wallH + 9, side * 3.5, p));
  });
  if (stands.length) {
    const standsMesh = add(mergeGeometries(parts.stand), standMat, { cast: true });
    const roofsMesh = add(mergeGeometries(parts.roof), roofMat, { cast: true });
    standsMesh.name = "pitStands";
    roofsMesh.name = "pitStandRoofs";
  }
  return group;
}

// The crowd in the stands: each spectator bobs a little, and at the flag a
// wave runs along the stand (render3d.js drives the time and the wave).
export const crowdUniforms = { uTime: { value: 0 }, uWave: { value: 0 } };
function crowdMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, crowdUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWave;")
      .replace("#include <map_fragment>", `
        vec2 crowdUv = vMapUv;
        float seat = floor(crowdUv.x * 96.0);
        float bob = sin(uTime * 5.0 + seat * 1.7) * 0.05;
        float wave = uWave * max(0.0, sin(crowdUv.x * 3.0 - uTime * 4.0)) * 0.35;
        crowdUv.y += bob + wave;
        vec4 sampledDiffuseColor = texture2D(map, crowdUv);
        diffuseColor *= sampledDiffuseColor;`);
  };
  return m;
}

// The tunnel: from track.tunnel.from to .to (lap distances, racing order).
export const TUNNEL_ROOF = 36;
export function inTunnelAt(tunnel, total, d) {
  const length = ((tunnel.to - tunnel.from) % total + total) % total;
  const into = ((d - tunnel.from) % total + total) % total;
  return into <= length;
}

// Built as part of the circuit, like a bridge: walls just outside the
// barriers up to a roof 36 above the road (clear of every car), a slab with
// the hotel's floor on top that keeps the sun off the road inside, and two
// rows of lamps along the ceiling.
function buildTunnel(course, tunnel, occluders) {
  const group = new THREE.Group();
  group.name = "tunnel";
  const { samples, width } = course;
  const total = course.track.totalLength;
  const inside = (p) => inTunnelAt(tunnel, total, p.d);
  const add = (geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.9, side: THREE.DoubleSide });
  const ceiling = new THREE.MeshStandardMaterial({ color: 0x2e2d2b, roughness: 0.95, side: THREE.DoubleSide });
  const L = (p) => -p.outerL - 2;
  const R = (p) => p.outerR + 2;
  [L, R].forEach((off) => occluders.push(add(wall(samples, off, () => 0, () => TUNNEL_ROOF, 60, inside), concrete)));
  occluders.push(add(ribbon(samples, L, R, TUNNEL_ROOF, 80, inside), ceiling));
  occluders.push(add(ribbon(samples, L, R, TUNNEL_ROOF + 8, 80, inside), concrete));
  // The slab's sides.
  [L, R].forEach((off) => add(wall(samples, off, () => TUNNEL_ROOF, () => TUNNEL_ROOF + 8, 60, inside), concrete));
  // The hotel the tunnel runs under (Monaco's Fairmont): its floors rise
  // from the slab over the middle of the tunnel, windows and all.
  const length = ((tunnel.to - tunnel.from) % total + total) % total;
  const underHotel = (p) => {
    const into = ((p.d - tunnel.from) % total + total) % total;
    return into >= length * 0.2 && into <= length * 0.8;
  };
  const hotel = buildingMaterial({ night: course.track.bg && luminance(course.track.bg.sky) < 0.12, glass: "#7d8fa0", litShare: 0.35 });
  // Seen from either side (a wall's front faces all point one way round).
  hotel.side = THREE.DoubleSide;
  const top = TUNNEL_ROOF + 8;
  const floors = top + 48;
  [L, R].forEach((off) => occluders.push(add(wall(samples, off, () => top, () => floors, 60, underHotel), hotel)));
  occluders.push(add(ribbon(samples, L, R, floors, 80, underHotel), concrete));
  // Closed boxes: end walls across the hotel's two ends, and across the
  // slab above each portal.
  const across = (d, y0, y1, mat) => {
    const p = course.sampleAt(((d % total) + total) % total);
    const left = p.outerL + 2;
    const right = p.outerR + 2;
    const cap = add(new THREE.BoxGeometry(1, y1 - y0, left + right), mat);
    const mid = (right - left) / 2;
    cap.position.set(p.x + p.nx * mid, p.h + (y0 + y1) / 2, p.y + p.ny * mid);
    cap.rotation.y = -Math.atan2(p.ty, p.tx);
    occluders.push(cap);
  };
  across(tunnel.from + length * 0.2, top, floors, hotel);
  across(tunnel.from + length * 0.8, top, floors, hotel);
  across(tunnel.from, TUNNEL_ROOF, top, concrete);
  across(tunnel.to, TUNNEL_ROOF, top, concrete);
  // Lamps: two rows of lit panels along the ceiling.
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd08a, emissiveIntensity: 2.2, side: THREE.DoubleSide });
  [-0.4, 0.4].forEach((f) => {
    add(ribbon(samples, () => f * width - 1.4, () => f * width + 1.4, TUNNEL_ROOF - 0.4, 20, (p) => inside(p) && Math.floor(p.d / 15) % 2 === 0), lamp, false);
  });
  group.userData.roof = TUNNEL_ROOF;
  return group;
}

// The start gantry: posts `right` along +n and `left` along -n from the
// centreline, the beam between them, the lights over the middle of the road.
function buildGantry(start, right, left, angle) {
  const g = new THREE.Group();
  g.name = "gantry";
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2a32, metalness: 0.6, roughness: 0.4 });
  const span = right + left;
  [right, -left].forEach((z) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(3, 46, 3), steel);
    post.position.set(0, 23, z);
    post.castShadow = true;
    post.userData.post = true;
    g.add(post);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 7, span), steel);
  beam.position.set(0, 44, (right - left) / 2);
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
  bannerTex.userData.print = true;
  // Centred over the road, within the nearer post.
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(right, left) * 1.4, 6), readsBothWays(new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide })));
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
  // A small open bleacher (venue.stands.bleachers).
  bleacher: [80, 15],
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
  let moved = 0;
  const movedTo = [];
  track.decor.forEach((d0, i) => {
    let d = d0;
    const fp = FOOTPRINT[d.type];
    if (!fp) return;
    const [hl, hd] = fp;
    if (!footprintClear(course, d.x, d.y, d.angle, hl, hd, 6)) { dropped += 1; return; }
    // A piece whose ground a venue's main stand took (placed first:
    // r3d/landmarks.js buildMainStand) moves along the lap round it.
    const claim = course.mainStandClaim;
    // (Its claim reaches a little past its rectangles: the grid it claimed
    // them by.) So does one whose ground a piece moved round it took.
    const r = Math.max(hl, hd);
    const displaced = claim && d.d !== undefined && (Siting.touchesRects(claim, d.x, d.y, r + 24)
      || movedTo.some((m) => Math.hypot(m.x - d.x, m.y - d.y) < m.r + r));
    if (displaced) {
      d = slideAround(course, d, hl, hd);
      if (!d) { dropped += 1; return; }
      moved += 1;
      movedTo.push({ x: d.x, y: d.y, r });
    }
    if (course.occupied.blocked(d.x, d.y, Math.max(hl, hd))) { dropped += 1; return; }
    course.occupied.add(d.x, d.y, Math.max(hl, hd));
    const obj = buildDecorPiece(d, bg, venue, i);
    obj.position.set(d.x, 0, d.y);
    // Local -Z faces the circuit.
    obj.rotation.y = -d.face - Math.PI / 2;
    // Where it stands round the lap (a stand's crowd is heard there).
    obj.userData.d = d.d;
    obj.userData.kind = obj.name === "farmhouse" ? "farmhouse" : d.type;
    group.add(obj);
  });
  // A venue's own stands, where the track data has too few (Las Vegas's
  // race-weekend grandstands along the Strip's streets).
  if (venue.stands) group.userData.venueStands = venueStands(course, venue, bg, group);
  group.userData.dropped = dropped;
  group.userData.moved = moved;
  return group;
}

// A venue's own grandstands (venue.stands): tried every `step` round the lap
// on both sides (every other place first, so they spread; a place that will
// not take one is tried a little either way along the lap), each with its
// front as near the barrier as it fits (`gaps`), wherever its whole
// footprint is clear of the circuit and of everything already placed (the
// city, the Safety Car's entrances, the pits, the track data's stands), it
// faces the stretch it stands beside (no other stretch nearer its back than
// its front) and it leaves the marshals' posts and the starter's stand
// their ground; at most `max`. Where none fits, a small open bleacher if
// one does (at most `bleachers` of them). Built as the track data's stands are, with
// their crowds; lit along the roof's edge at night; their seats in a few
// colours. Returns how many.
function venueStands(course, venue, bg, group) {
  const { step = 180, max = 24, gaps = [6, 14, 24, 36, 50], seats = [], bleachers = 0 } = venue.stands;
  const [hl, hd] = FOOTPRINT.grandstand;
  const total = course.track.totalLength;
  // Where the marshals' posts will stand (r3d/trackside.js: 14 past the
  // barrier, either side) and the starter's by the line: kept free.
  const kept = [];
  [...(course.track.marshalPosts || []).map((m) => m.d), 0].forEach((d) => {
    const p = course.sampleAt(d);
    [-1, 1].forEach((side) => kept.push([p.x + p.nx * side * ((side > 0 ? p.outerR : p.outerL) + 14), p.y + p.ny * side * ((side > 0 ? p.outerR : p.outerL) + 14)]));
  });
  const places = [];
  for (let d = step / 2; d < total; d += step) places.push(d);
  const order = [...places.filter((_, k) => k % 2 === 0), ...places.filter((_, k) => k % 2 === 1)];
  const fits = (site, gap, hl = FOOTPRINT.grandstand[0], hd = FOOTPRINT.grandstand[1]) => {
    if (!footprintClear(course, site.x, site.y, site.angle, hl, hd, 6)) return null;
    const fx = Math.cos(site.face); const fy = Math.sin(site.face);
    // (Its front toward the stretch it is beside: nothing nearer its back.)
    if (course.clearance(site.x - fx * hd, site.y - fy * hd, 600) < course.clearance(site.x + fx * hd, site.y + fy * hd, 600) + hd) return null;
    const ca = Math.cos(site.angle); const sa = Math.sin(site.angle);
    const taken = kept.some(([x, z]) => {
      const u = (x - site.x) * ca + (z - site.y) * sa; const v = (x - site.x) * fx + (z - site.y) * fy;
      return Math.abs(u) < hl + 30 && v > -hd - 10 && v < hd + gap + 40;
    });
    if (taken) return null;
    // Its ground, and the strip before it down to the barrier (nothing is planted in its view).
    const ground = [...rectPoints(site.x, site.y, site.angle, hl + 4, hd + 4, 16), ...rectPoints(site.x + fx * (hd + gap / 2), site.y + fy * (hd + gap / 2), site.angle, hl, gap / 2, 16)];
    return ground.some(([x, z]) => course.occupied.blocked(x, z, 9)) ? null : ground;
  };
  let built = 0;
  let small = 0;
  // Where no full stand fits (the Strip's straight, the resorts close by):
  // a small open bleacher, as the temporary ones a street race puts up.
  const bleacherAt = (d0, side) => {
    const [bl, bd] = FOOTPRINT.bleacher;
    for (const shift of [0, 60, -60]) {
      const d = ((d0 + shift) % total + total) % total;
      const p = course.sampleAt(d);
      for (const gap of [5, 10, 16]) {
        const site = standSite(p, side, gap, bd);
        const ground = fits(site, gap, bl, bd);
        if (!ground) continue;
        ground.forEach(([x, z]) => course.occupied.add(x, z, 12));
        const obj = bleacher(bg, { ...venue, standColor: seats.length ? seats[(built + small) % seats.length] : venue.standColor }, 200 + small);
        obj.position.set(site.x, 0, site.y);
        obj.rotation.y = -site.face - Math.PI / 2;
        obj.userData.d = d;
        obj.userData.kind = "grandstand";
        obj.userData.venueStand = true;
        group.add(obj);
        small += 1;
        return true;
      }
    }
    return false;
  };
  order.forEach((d0) => {
    [-1, 1].forEach((side) => {
      if (built >= max) { if (small < bleachers) bleacherAt(d0, side); return; }
      for (const shift of [0, 45, -45, 90, -90]) {
        const d = ((d0 + shift) % total + total) % total;
        const p = course.sampleAt(d);
        for (const gap of gaps) {
          const site = standSite(p, side, gap, hd);
          const ground = fits(site, gap);
          if (!ground) continue;
          ground.forEach(([x, z]) => course.occupied.add(x, z, 12));
          const colour = seats.length ? seats[built % seats.length] : venue.standColor;
          const obj = buildDecorPiece({ type: "grandstand", ...site, d }, bg, { ...venue, standColor: colour }, 100 + built);
          if (venue.night) obj.add(standLights());
          obj.position.set(site.x, 0, site.y);
          obj.rotation.y = -site.face - Math.PI / 2;
          obj.userData.d = d;
          obj.userData.kind = "grandstand";
          obj.userData.venueStand = true;
          group.add(obj);
          built += 1;
          return;
        }
      }
      if (small < bleachers) bleacherAt(d0, side);
    });
  });
  return built + small;
}

// A small open bleacher (26 m by 5 rows on scaffold, no roof): its rows and
// its painted crowd as a model stand's (r3d/people.js seats the crowd on
// them), two lamp posts behind it at night. Local -Z faces the circuit.
function bleacher(bg, venue, i) {
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
  const U = STAND_SCALE;
  const len = 13 * 2 * U;
  const seat = std(color(venue.standColor || bg.curbA, "#dc0000"), { roughness: 0.55 });
  const steel = std(0x6a6d74, { metalness: 0.4 });
  seat.userData.worldOwned = true;
  steel.userData.worldOwned = true;
  // The frame the crowd's rows are measured in (metres, as a model's).
  const model = new THREE.Group();
  model.scale.setScalar(U);
  g.add(model);
  const rows = [];
  for (let k = 0; k < 5; k += 1) {
    const y = 0.05 + k * 0.42;
    const z = -1.6 + k * 0.8;
    const seats = [];
    for (let x = -12.3; x <= 12.3; x += 0.82) seats.push(+x.toFixed(2));
    rows.push({ y, z, seats });
    // Its tread (a plank on the scaffold) and the bench before it.
    add(new THREE.BoxGeometry(len, 0.5, 0.8 * U), steel, 0, y * U - 0.25, z * U);
    add(new THREE.BoxGeometry(len, 0.4, 0.3 * U), seat, 0, (y + 0.42) * U, (z + 0.25) * U);
  }
  // The scaffold under it, a rail behind.
  for (let x = -12; x <= 12; x += 4) {
    add(new THREE.BoxGeometry(0.6, 2.1 * U, 0.6), steel, x * U, 1.05 * U, 2.1 * U);
    add(new THREE.BoxGeometry(0.6, 1.0 * U, 0.6), steel, x * U, 0.5 * U, 0.4 * U);
  }
  add(new THREE.BoxGeometry(len, 0.5, 0.5), steel, 0, 3.0 * U, 2.1 * U);
  if (venue.night) {
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
    lamp.userData.worldOwned = true;
    [-9, 9].forEach((x) => {
      add(new THREE.BoxGeometry(0.7, 6.4 * U, 0.7), steel, x * U, 3.2 * U, 2.4 * U);
      const head = add(new THREE.BoxGeometry(1.6 * U, 0.3 * U, 0.6 * U), lamp, x * U, 6.4 * U, 2.1 * U);
      head.castShadow = false;
    });
  }
  const texture = makeCrowdTexture(i + 99);
  texture.userData.worldOwned = true;
  const crowd = crowdMaterial(texture);
  crowd.userData.worldOwned = true;
  const planes = new THREE.Mesh(mergeGeometries(rows.map((row) => new THREE.PlaneGeometry(len, 7).rotateY(Math.PI).translate(0, (row.y + 0.75) * U, (row.z + 0.4) * U))), crowd);
  planes.name = "standCrowd";
  g.add(planes);
  g.userData.stand = { model, rows, planes };
  return g;
}

// A stand's lights at night: a line of lamps under its roof's front edge and
// a lit truss on each gable (a stand's local -Z faces the circuit).
function standLights() {
  const g = new THREE.Group();
  g.name = "stand_lights";
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(146, 1.1, 1.4), mat);
  bar.position.set(0, 43, -24);
  g.add(bar);
  [-1, 1].forEach((e) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 30, 0.9), mat);
    post.position.set(e * 77.4, 15, -30);
    g.add(post);
  });
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

// A piece moved along the lap from where the track data put it (siting.js
// slidePiece: its own side, as far past the barrier as it was, up to 1200
// along the lap either way), to the nearest place where its whole footprint
// is clear of the circuit and of everything placed and it still faces the
// stretch it watches (no other stretch nearer its back than its front).
// Returns the moved piece, or null.
export function slideAround(course, piece, hl, hd) {
  return Siting.slidePiece(course, piece, (x, y, angle, q) => {
    if (!footprintClear(course, x, y, angle, hl, hd, 6) || course.occupied.blocked(x, y, Math.max(hl, hd))) return false;
    const ux = (q.x - x) / (Math.hypot(q.x - x, q.y - y) || 1);
    const uy = (q.y - y) / (Math.hypot(q.x - x, q.y - y) || 1);
    const front = course.clearance(x + ux * hd, y + uy * hd, 600);
    const back = course.clearance(x - ux * hd, y - uy * hd, 600);
    return back >= front + hd;
  });
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
  const standModel = STAND_MODELS[venue.stand];
  if (d.type === "grandstand" && standModel && tracksideModel(standModel)) return modelStand(venue, bg, i, standModel);
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
    const crowd = crowdMaterial(makeCrowdTexture(i + 99));
    for (let row = 0; row < 7; row += 2) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 4.5), crowd);
      face.position.set(0, 5.3 + row * 5, -28 + row * 8 - 4.05);
      face.rotation.y = Math.PI;
      g.add(face);
    }
    return g;
  }
  // In the countryside (venue.farm) the track data's towers are farmhouses:
  // a long house under a pitched roof in the place's own colours, a lower
  // barn beside it, and (Tuscany) its cypresses.
  if (d.type === "tower" && venue.farm) {
    const f = venue.farm;
    const wall = std(color(f.wall), { roughness: 0.9 });
    const roofMat = std(color(f.roof), { roughness: 0.75 });
    const gable = (w, dp, h, x, z, turn = 0) => {
      const shape = new THREE.Shape([new THREE.Vector2(-dp / 2 - 1, 0), new THREE.Vector2(dp / 2 + 1, 0), new THREE.Vector2(0, dp * 0.42)]);
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: w + 2, bevelEnabled: false }).translate(0, 0, -(w + 2) / 2).rotateY(Math.PI / 2 + turn), roofMat);
      roof.position.set(x, h, z);
      roof.castShadow = true;
      roof.receiveShadow = true;
      g.add(roof);
      add(new THREE.BoxGeometry(w, h, dp), wall, x, h / 2, z).rotation.y = turn;
    };
    gable(30, 14, 15, -4, 4);
    gable(16, 11, 10, 14, -8, Math.PI / 2);
    if (f.cypress) {
      const dark = std(color("#24432a"), { roughness: 0.9, flatShading: true });
      [[-22, -12], [-26, 2], [-24, 16], [20, 14]].forEach(([x, z]) => add(new THREE.ConeGeometry(3.4, 34, 7), dark, x, 17, z));
    }
    g.name = "farmhouse";
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
    const board = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), readsBothWays(new THREE.MeshStandardMaterial({
      map: tex, side: THREE.DoubleSide,
      emissive: venue.night ? 0xffffff : 0x000000, emissiveIntensity: venue.night ? 0.35 : 0, emissiveMap: venue.night ? tex : null,
    })));
    board.position.set(0, 34, -1.2);
    board.rotation.y = Math.PI;
    board.castShadow = true;
    g.add(board);
    return g;
  }
  return g;
}

// The covered grandstand built in Blender (assets/landmarks/grandstand.glb),
// at the car's scale (6 units a metre: 26 by 11 m fills the 156 by 68
// footprint), its seats in the venue's stand colour. Its rows (the model's
// row_k empties, with their seats) are kept for the 3D crowd (r3d/people.js);
// the painted crowd on each row is what the stand shows from far away.
export const STAND_SCALE = 6;
function modelStand(venue, bg, i, name) {
  const g = new THREE.Group();
  const model = tracksideModel(name).clone(true);
  model.scale.setScalar(STAND_SCALE);
  const seatColour = color(venue.standColor || bg.curbA, "#dc0000");
  // Only the seats (the venue's colour) and the glass (see-through) get
  // materials of their own; the rest keep the model's, shared.
  const made = new Map();
  model.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const name = m.material.name;
    if (name !== "seat" && name !== "glass") return;
    if (!made.has(name)) {
      const out = m.material.clone();
      if (name === "seat") { out.color = seatColour.clone(); out.roughness = 0.55; }
      if (name === "glass") { out.transparent = true; out.opacity = 0.35; out.depthWrite = false; }
      out.userData.worldOwned = true;
      made.set(name, out);
    }
    m.material = made.get(name);
    if (name === "glass") m.castShadow = false;
  });
  g.add(model);
  // Each row where its feet are, in the model's own metres (from wherever
  // the row sits in the model's tree).
  const rows = [];
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  model.traverse((o) => {
    const k = /^row_(\d+)$/.exec(o.name);
    if (!k) return;
    const at = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(toModel);
    rows[+k[1]] = { y: at.y, z: at.z, seats: o.userData.seats || [] };
  });
  // The painted crowd: a strip along each row, facing the track.
  const texture = makeCrowdTexture(i + 99);
  texture.userData.worldOwned = true;
  const crowd = crowdMaterial(texture);
  crowd.userData.worldOwned = true;
  const strips = rows.map((row) => new THREE.PlaneGeometry(150, 7).rotateY(Math.PI)
    .translate(0, (row.y + 0.75) * STAND_SCALE, (row.z + 0.4) * STAND_SCALE));
  const planes = new THREE.Mesh(mergeGeometries(strips), crowd);
  planes.name = "standCrowd";
  g.add(planes);
  g.userData.stand = { model, rows, planes };
  return g;
}

// ---------------------------------------------------------------------------
// Trees, instanced. Kinds: "broadleaf", "conifer", "palm".
// ---------------------------------------------------------------------------

// Seven drooping fronds radiating from the top of the trunk.
export function palmFronds() {
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
