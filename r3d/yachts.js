// The yachts on the water (docs/superpowers/specs/2026-10-01-trackside-blender-design.md,
// section 8.1): the Blender models in assets/yachts.glb (tools/blender/build_yachts.py),
// at the city's scale, instanced per model and level of detail.
//
// A venue lists its harbour (r3d/landmarks.js VENUES):
//   harbour: { quay, moored, anchored, anchorIn, wind, prefer }
// quay: how far past the barrier the town's edge is (the yachts moor
// stern-to there, side by side, along the longest stretches of open water);
// moored and anchored: how many at most; anchorIn: the name of a landmark
// whose bay they anchor in (else open water beyond the quays; none if that
// landmark has no bay); wind: the heading (radians) their bows point to at
// anchor; prefer: { side, from, to }, a stretch of the lap (signed distances
// from the line) whose quay fills first. Every yacht claims its water;
// tenders run among them.
//
// One material draws them: each vertex's role (hull, superstructure, ...)
// takes the yacht's own colours; the vertex shader bobs, pitches and rolls
// each one about its middle with its own phase. Near the camera the
// detailed model, further off the light one, past the fog none; each view
// picks for its own camera.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tracksideModel, LANDMARK_SCALE, floats } from "./models.js";
import { footprintClear } from "./track.js";
import { color } from "./textures.js";

export const KINDS = ["superyacht", "motor", "explorer", "sail"];
// Detailed within this of the camera (game units); the light model to the fog.
export const YACHT_NEAR = { high: 1400, medium: 900, low: 0 };
const ROLES = ["hull", "boot", "deck", "super", "glass", "rail", "gear", "lit"];

const HULLS = ["#f4f5f6", "#f4f5f6", "#f4f5f6", "#1b2a44", "#2a2d33", "#c9ccd1", "#0f1724", "#e9e6df"];
const SUPERS = ["#f6f6f4", "#f6f6f4", "#f6f6f4", "#e9eaec", "#c9ccd1"];

export const yachtUniforms = { uYachtTime: { value: 0 }, uYachtNight: { value: 0 } };

const geometries = new Map();
function kindGeometry(name) {
  if (geometries.has(name)) return geometries.get(name);
  const root = tracksideModel("yachts");
  const node = root && root.getObjectByName(name);
  if (!node) return null;
  node.updateMatrixWorld(true);
  // In the model's own frame: the node's parent's (a compressed model keeps
  // its unpacking scale and offset on the node itself).
  const inverse = node.parent ? node.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
  const parts = [];
  node.traverse((m) => {
    if (!m.isMesh) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", floats(m.geometry.attributes.position));
    g.setAttribute("normal", floats(m.geometry.attributes.normal));
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    const role = new Float32Array(g.attributes.position.count).fill(Math.max(0, ROLES.indexOf(m.material.name)));
    g.setAttribute("aRole", new THREE.BufferAttribute(role, 1));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
    parts.push(g);
  });
  const geometry = parts.length ? mergeGeometries(parts) : null;
  if (geometry) geometry.computeBoundingBox();
  geometries.set(name, geometry);
  return geometry;
}

// A kind's length and beam in game units (its near model's, as built).
function size(kind) {
  const g = kindGeometry(kind === "tender" ? "tender" : `${kind}_lod0`);
  if (!g) return null;
  const b = g.boundingBox;
  return { L: (b.max.x - b.min.x) * LANDMARK_SCALE, W: (b.max.z - b.min.z) * LANDMARK_SCALE };
}

// Does hull a (x, z, heading, L, W) overlap hull b (with a gap)?
function hullsMeet(a, b, gap) {
  const inside = (p, r) => {
    const dx = p.x - r.x;
    const dz = p.z - r.z;
    const c = Math.cos(r.heading);
    const s = Math.sin(r.heading);
    return Math.abs(dx * c + dz * s) < r.L / 2 + gap && Math.abs(-dx * s + dz * c) < r.W / 2 + gap;
  };
  const corners = (r) => [-0.5, 0, 0.5].flatMap((u) => [-0.5, 0.5].map((v) => ({
    x: r.x + u * r.L * Math.cos(r.heading) - v * r.W * Math.sin(r.heading),
    z: r.z + u * r.L * Math.sin(r.heading) + v * r.W * Math.cos(r.heading),
  })));
  return corners(a).some((p) => inside(p, b)) || corners(b).some((p) => inside(p, a));
}

function yachtMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, yachtUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float aRole; attribute vec3 aHull; attribute vec3 aSuper; attribute float aPhase;
        uniform float uYachtTime;
        varying vec3 vTint; varying float vRoleY;
        vec3 yRotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
        vec3 yRotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        // The swell: a slow roll about the keel, a slower pitch, a heave.
        float tt = uYachtTime + aPhase * 37.0;
        float roll = 0.018 * sin(tt * 0.9) + 0.008 * sin(tt * 2.1 + 1.3);
        float pitch = 0.008 * sin(tt * 0.7 + 2.0);
        objectNormal = yRotZ(yRotX(objectNormal, roll), pitch);`)
      .replace("#include <begin_vertex>", `vec3 transformed = yRotZ(yRotX(position, roll), pitch);
        transformed.y += 0.12 * sin(tt * 0.8 + 0.5);
        int role = int(aRole + 0.5);
        vRoleY = float(role);
        vTint = role == 0 ? aHull : role == 1 ? vec3(0.05, 0.07, 0.12) : role == 2 ? vec3(0.62, 0.43, 0.26)
          : role == 3 ? aSuper : role == 4 ? vec3(0.03, 0.045, 0.07) : role == 5 ? vec3(0.82, 0.84, 0.86)
          : role == 6 ? vec3(0.1, 0.11, 0.12) : vec3(0.035, 0.05, 0.075);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTint; varying float vRoleY; uniform float uYachtNight;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vTint;")
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        // Glass and the lacquered hull are glossy; teak is not.
        if (vRoleY > 3.5 && vRoleY < 4.5 || vRoleY > 6.5) roughnessFactor = 0.07;
        else if (vRoleY < 0.5) roughnessFactor = 0.22;
        else if (vRoleY > 2.5 && vRoleY < 3.5) roughnessFactor = 0.55;
        else if (vRoleY > 1.5 && vRoleY < 2.5) roughnessFactor = 0.75;`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
        if (vRoleY > 4.5 && vRoleY < 5.5) metalnessFactor = 0.9;
        else if (vRoleY > 3.5 && vRoleY < 4.5 || vRoleY > 6.5) metalnessFactor = 0.45;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        // At night the cabins' glass glows warm.
        if (vRoleY > 6.5) totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * 0.9 * uYachtNight;`);
  };
  m.customProgramCacheKey = () => "yacht-v2";
  return m;
}

// The yachts' instanced meshes for one kind and level: their per-instance
// attributes filled from `list` (each view re-fills the order it draws).
function instancedKind(name, capacity, material) {
  const base = kindGeometry(name);
  if (!base || !capacity) return null;
  const geometry = base.clone();
  geometry.setAttribute("aHull", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  geometry.setAttribute("aSuper", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = `yachts:${name}`;
  return mesh;
}

// ---------------------------------------------------------------------------
// Where they go
// ---------------------------------------------------------------------------

// Stern-to along the quay: the stern just off the town's edge, the bow out
// over the water, side by side with a gap between. Every spot along the lap
// is found first; the yachts then fill the longest unbroken stretches of
// quay (the harbour), not whatever comes first round the lap.
function moor(course, rand, quay, max, prefer) {
  if (!max) return [];
  const spots = [];
  const { samples } = course;
  const nextAt = { 1: 0, [-1]: 0 };
  let along = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i];
    along += i ? Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y) : 0;
    if (p.h > 0.5) continue;
    for (const side of [1, -1]) {
      if (along < nextAt[side]) continue;
      const kind = KINDS[Math.floor(rand() * KINDS.length) % KINDS.length];
      const { L, W } = size(kind);
      const stern = (side > 0 ? p.outerR : p.outerL) + 2 + quay + 3;
      const off = side * (stern + L / 2);
      const x = p.x + p.nx * off;
      const z = p.y + p.ny * off;
      const heading = Math.atan2(p.ny * side, p.nx * side);
      // Clear water the whole length (beyond every quay), nothing there.
      if (!footprintClear(course, x, z, heading, L / 2, W / 2 + 4, quay + 2)) continue;
      const hull = { kind, x, z, heading, L, W, moored: true, side, along };
      if ([-0.35, 0, 0.35].some((f) => course.occupied.blocked(x + Math.cos(heading) * L * f, z + Math.sin(heading) * L * f, W / 2 + 2))) continue;
      if (spots.some((o) => hullsMeet(o, hull, 4))) continue;
      spots.push(hull);
      nextAt[side] = along + W + 10 + rand() * 8;
    }
  }
  // Runs: the same side, each a berth or two from the last.
  const runs = [];
  [1, -1].forEach((side) => {
    let run = [];
    spots.filter((h) => h.side === side).forEach((h) => {
      if (run.length && h.along - run[run.length - 1].along > h.W + 60) { runs.push(run); run = []; }
      run.push(h);
    });
    if (run.length) runs.push(run);
  });
  // A stretch the venue names comes first (Monaco: the start straight's
  // harbour front), then the longest.
  const total = course.track.totalLength;
  const inPrefer = (h) => {
    if (!prefer || h.side !== prefer.side) return false;
    const r = ((h.along % total) + total * 1.5) % total - total / 2;
    return r >= prefer.from && r <= prefer.to;
  };
  const score = (run) => run.filter(inPrefer).length * 1000 + run.length;
  runs.sort((x, y) => score(y) - score(x));
  const out = [];
  for (const run of runs) {
    if (out.length >= max) break;
    out.push(...run.slice(0, max - out.length));
  }
  out.forEach((h) => [-0.35, 0, 0.35].forEach((f) => course.occupied.add(h.x + Math.cos(h.heading) * h.L * f, h.z + Math.sin(h.heading) * h.L * f, h.W / 2 + 3)));
  return out;
}

// At anchor out in open water (or in a landmark's bay), all bows to the
// same wind; in open water a tender now and then among them.
function anchor(course, rand, { count, area, quay, wind, others }) {
  const out = [];
  for (let t = 0; t < count * 60 && out.length < count; t += 1) {
    const tender = !area && rand() < 0.2;
    const kind = tender ? "tender" : KINDS[Math.floor(rand() * KINDS.length) % KINDS.length];
    const { L, W } = size(kind);
    const heading = wind + (rand() - 0.5) * (tender ? 3 : 0.5);
    let x;
    let z;
    if (area) {
      const u = rand();
      const v = rand();
      x = area.o.x + area.u.x * u + area.v.x * v;
      z = area.o.z + area.u.z * u + area.v.z * v;
      // The whole hull inside the bay, clear of the promenade.
      const reach = Math.hypot(L, W) / 2 + 10;
      if (!area.contains(x, z, reach)) continue;
    } else {
      const b = course.bounds;
      x = b.minX - 700 + rand() * (b.maxX - b.minX + 1400);
      z = b.minZ - 700 + rand() * (b.maxZ - b.minZ + 1400);
      if (!footprintClear(course, x, z, heading, L / 2 + 20, W / 2 + 20, quay + 60)) continue;
      if (course.occupied.blocked(x, z, L / 2 + 10)) continue;
    }
    const hull = { kind, x, z, heading, L, W, moored: false };
    if ([...out, ...others].some((o) => hullsMeet(o, hull, 12))) continue;
    if (!area) course.occupied.add(x, z, L / 2 + 10);
    out.push(hull);
  }
  return out;
}

// A landmark's bay (its corners in the world) as an area to anchor in.
function bayArea(group, name) {
  let lm = null;
  group.traverse((o) => { if (o.userData.landmark && o.userData.landmark.name === name) lm = o; });
  const bay = lm && lm.userData.bay;
  if (!bay) return null;
  lm.updateMatrixWorld(true);
  const w = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(lm.matrixWorld);
  const o = w(bay.x0, bay.z0);
  const a = w(bay.x1, bay.z0);
  const b = w(bay.x0, bay.z1);
  const u = { x: a.x - o.x, z: a.z - o.z };
  const v = { x: b.x - o.x, z: b.z - o.z };
  const lu = Math.hypot(u.x, u.z);
  const lv = Math.hypot(v.x, v.z);
  return {
    o, u, v,
    // Inside the bay with `margin` to spare on every side.
    contains(x, z, margin) {
      const dx = x - o.x;
      const dz = z - o.z;
      const s = (dx * u.x + dz * u.z) / lu;
      const t = (dx * v.x + dz * v.z) / lv;
      return s > margin && s < lu - margin && t > margin && t < lv - margin;
    },
  };
}

// ---------------------------------------------------------------------------

export function buildYachts(course, group, venue, rand) {
  const harbour = venue.harbour;
  if (!harbour || !tracksideModel("yachts") || !size(KINDS[0])) return null;
  const out = new THREE.Group();
  out.name = "yachts";
  const quay = harbour.quay ?? 190;
  const moored = moor(course, rand, quay, harbour.moored || 0, harbour.prefer);
  const area = harbour.anchorIn ? bayArea(group, harbour.anchorIn) : null;
  // A bay to anchor in that isn't there (its landmark fell back): none.
  const anchored = harbour.anchorIn && !area ? [] : anchor(course, rand, {
    count: harbour.anchored || 0, area, quay, wind: harbour.wind ?? 0.6, others: moored,
  });
  const list = [...moored, ...anchored];
  list.forEach((y) => {
    y.hull = color(HULLS[Math.floor(rand() * HULLS.length) % HULLS.length]);
    y.super = color(y.hull.r < 0.5 && rand() < 0.5 ? "#f6f6f4" : SUPERS[Math.floor(rand() * SUPERS.length) % SUPERS.length]);
    y.phase = rand();
  });
  const material = yachtMaterial();
  material.userData.worldOwned = true;
  const meshes = {};
  [...KINDS, "tender"].forEach((kind) => {
    const n = list.filter((y) => y.kind === kind).length;
    if (!n) return;
    // (A tender is one model near and far.)
    const near = instancedKind(kind === "tender" ? "tender" : `${kind}_lod0`, n, material);
    const far = instancedKind(kind === "tender" ? "tender" : `${kind}_lod1`, n, material);
    if (!near || !far) return;
    near.castShadow = true;
    near.receiveShadow = true;
    far.receiveShadow = true;
    meshes[kind] = { near, far };
    out.add(near, far);
  });
  const yachts = list.filter((y) => meshes[y.kind]);
  yachts.forEach((y, i) => { y.index = i; });
  out.userData = { yachts, meshes, area, night: Boolean(venue.night), written: new Int8Array(yachts.length).fill(-1), want: new Int8Array(yachts.length) };
  // Every one detailed until a view picks (prepare() compiles both models).
  showYachtsFor(out, null, "high");
  group.add(out);
  return out;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const S = new THREE.Vector3(LANDMARK_SCALE, LANDMARK_SCALE, LANDMARK_SCALE);
const P = new THREE.Vector3();
const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const sphere = new THREE.Sphere();

// Per view: the near ones in sight detailed, the rest in sight light, those
// out of sight or past the fog not drawn (with no camera, every one
// detailed: prepare() compiles them and the audit sees the whole fleet).
// The buffers are written only when the choice changes.
export function showYachtsFor(group, camera, tier, far = Infinity) {
  if (!group || !group.userData.yachts) return;
  const { meshes, yachts, written, want } = group.userData;
  const reach = camera ? (YACHT_NEAR[tier] ?? YACHT_NEAR.high) : Infinity;
  if (camera) {
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  }
  let same = true;
  yachts.forEach((y, i) => {
    let pick = 0;
    if (camera) {
      const d = Math.hypot(camera.position.x - y.x, camera.position.z - y.z);
      sphere.center.set(y.x, 10, y.z);
      sphere.radius = y.L / 2 + 40;
      // 0 near, 1 far, 2 not drawn.
      pick = d > far + y.L || !frustum.intersectsSphere(sphere) ? 2 : d < reach ? 0 : 1;
    }
    want[i] = pick;
    if (written[i] !== pick) same = false;
  });
  if (same) return;
  Object.values(meshes).forEach((m) => { m.near.count = 0; m.far.count = 0; });
  yachts.forEach((y, i) => {
    written[i] = want[i];
    if (want[i] === 2) return;
    const mesh = want[i] === 0 ? meshes[y.kind].near : meshes[y.kind].far;
    const k = mesh.count;
    // The model's bow is +x: turn it to the heading (x, z).
    q.setFromAxisAngle(UP, -y.heading);
    mesh.setMatrixAt(k, m4.compose(P.set(y.x, 0, y.z), q, S));
    const g = mesh.geometry.attributes;
    g.aHull.setXYZ(k, y.hull.r, y.hull.g, y.hull.b);
    g.aSuper.setXYZ(k, y.super.r, y.super.g, y.super.b);
    g.aPhase.setX(k, y.phase);
    mesh.count = k + 1;
  });
  Object.values(meshes).forEach(({ near, far: light }) => {
    [near, light].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.geometry.attributes.aHull.needsUpdate = true;
      m.geometry.attributes.aSuper.needsUpdate = true;
      m.geometry.attributes.aPhase.needsUpdate = true;
    });
  });
}

export function updateYachts(group, t) {
  yachtUniforms.uYachtTime.value = t;
  yachtUniforms.uYachtNight.value = group && group.userData.night ? 1 : 0;
}

// For the checks: hulls that touch another, and those anchored in a bay
// whose hull reaches past its edge.
export function auditFleet(group) {
  if (!group || !group.userData.yachts) return null;
  const { yachts, area } = group.userData;
  let overlaps = 0;
  yachts.forEach((a, i) => yachts.slice(i + 1).forEach((b) => { if (hullsMeet(a, b, 0)) overlaps += 1; }));
  const outsideBay = area ? yachts.filter((y) => !y.moored && !area.contains(y.x, y.z, Math.hypot(y.L, y.W) / 2)).length : 0;
  return { overlaps, outsideBay, inBay: Boolean(area) };
}

// For the checks: where each yacht is, and how many are drawn near and far.
export function inspectYachts(group) {
  if (!group || !group.userData.yachts) return null;
  const { yachts, meshes } = group.userData;
  let near = 0;
  let far = 0;
  Object.values(meshes).forEach((m) => { near += m.near.count; far += m.far.count; });
  return {
    count: yachts.length,
    moored: yachts.filter((y) => y.moored).length,
    anchored: yachts.filter((y) => !y.moored).length,
    near,
    far,
    yachts: yachts.map((y) => ({ kind: y.kind, x: Math.round(y.x), z: Math.round(y.z), heading: +y.heading.toFixed(3), length: Math.round(y.L), beam: Math.round(y.W), moored: y.moored })),
  };
}
