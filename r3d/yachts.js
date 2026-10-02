// The yachts on the water (docs/superpowers/specs/2026-10-01-trackside-blender-design.md,
// section 8.1): the Blender models in assets/yachts.glb (tools/blender/build_yachts.py),
// at the city's scale, instanced per model and level of detail.
//
// A venue lists its harbour (r3d/landmarks.js VENUES):
//   harbour: { quay, moored, anchored, anchorIn }
// quay: how far past the barrier the town's edge is (the yachts moor
// stern-to there, side by side); moored and anchored: how many at most;
// anchorIn: the name of a landmark whose bay they anchor in (else open water
// beyond the quays). Every yacht claims its water.
//
// One material draws them: each vertex's role (hull, superstructure, ...)
// takes the yacht's own colours; the vertex shader bobs, pitches and rolls
// each one on the water with its own phase. Near the camera the detailed
// model, further off the light one; each view picks for its own camera.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tracksideModel } from "./models.js";
import { footprintClear } from "./track.js";
import { color } from "./textures.js";

export const YACHT_SCALE = 2.5;
export const KINDS = ["superyacht", "motor", "explorer", "sail"];
// Detailed within this of the camera (game units); the light model to the fog.
export const YACHT_NEAR = { high: 1400, medium: 900, low: 0 };
const ROLES = ["hull", "boot", "deck", "super", "glass", "rail", "gear", "lit"];
// Lengths overall (m), as built.
const LENGTH = { superyacht: 60, motor: 45, explorer: 38, sail: 50 };
const BEAM = { superyacht: 11, motor: 8.8, explorer: 8.6, sail: 9.4 };

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
  const inverse = node.matrixWorld.clone().invert();
  const parts = [];
  node.traverse((m) => {
    if (!m.isMesh) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", m.geometry.attributes.position.clone());
    g.setAttribute("normal", m.geometry.attributes.normal.clone());
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    const role = new Float32Array(g.attributes.position.count).fill(Math.max(0, ROLES.indexOf(m.material.name)));
    g.setAttribute("aRole", new THREE.BufferAttribute(role, 1));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
    parts.push(g);
  });
  const geometry = parts.length ? mergeGeometries(parts) : null;
  geometries.set(name, geometry);
  return geometry;
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
        else if (vRoleY < 0.5) roughnessFactor = 0.16;
        else if (vRoleY > 1.5 && vRoleY < 2.5) roughnessFactor = 0.75;`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
        if (vRoleY > 4.5 && vRoleY < 5.5) metalnessFactor = 0.9;
        else if (vRoleY > 3.5 && vRoleY < 4.5 || vRoleY > 6.5) metalnessFactor = 0.45;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        // At night the cabins' glass glows warm.
        if (vRoleY > 6.5) totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * 0.9 * uYachtNight;`);
  };
  m.customProgramCacheKey = () => "yacht-v1";
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
// over the water, side by side with a gap between.
function moor(course, rand, quay, max, kinds) {
  const out = [];
  const { samples } = course;
  let nextAt = { 1: 0, [-1]: 0 };
  let along = 0;
  for (let i = 0; i < samples.length && out.length < max; i += 1) {
    const p = samples[i];
    along += i ? Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y) : 0;
    if (p.h > 0.5) continue;
    for (const side of [1, -1]) {
      if (along < nextAt[side] || out.length >= max) continue;
      const kind = kinds[Math.floor(rand() * kinds.length) % kinds.length];
      const L = LENGTH[kind] * YACHT_SCALE;
      const W = BEAM[kind] * YACHT_SCALE;
      const stern = (side > 0 ? p.outerR : p.outerL) + 2 + quay + 3;
      const off = side * (stern + L / 2);
      const x = p.x + p.nx * off;
      const z = p.y + p.ny * off;
      const heading = Math.atan2(p.ny * side, p.nx * side);
      // Clear water the whole length (beyond every quay), nothing moored there.
      if (!footprintClear(course, x, z, heading, L / 2, W / 2 + 4, quay + 2)) continue;
      if (course.occupied.blocked(x, z, W / 2 + 2) || course.occupied.blocked(x + Math.cos(heading) * L * 0.35, z + Math.sin(heading) * L * 0.35, W / 2)) continue;
      [-0.35, 0, 0.35].forEach((f) => course.occupied.add(x + Math.cos(heading) * L * f, z + Math.sin(heading) * L * f, W / 2 + 3));
      out.push({ kind, x, z, heading, moored: true });
      nextAt[side] = along + W + 10 + rand() * 8;
    }
  }
  return out;
}

// At anchor out in open water (or in a landmark's bay), all bows to the
// same wind.
function anchor(course, rand, { count, area, quay, wind }) {
  const out = [];
  for (let t = 0; t < count * 60 && out.length < count; t += 1) {
    const kind = KINDS[Math.floor(rand() * KINDS.length) % KINDS.length];
    const L = LENGTH[kind] * YACHT_SCALE;
    const W = BEAM[kind] * YACHT_SCALE;
    const heading = wind + (rand() - 0.5) * 0.5;
    let x;
    let z;
    if (area) {
      const u = rand();
      const v = rand();
      x = area.o.x + area.u.x * u + area.v.x * v;
      z = area.o.z + area.u.z * u + area.v.z * v;
      if (!area.contains(x, z, L / 2 + 6)) continue;
      if (out.some((y) => Math.hypot(y.x - x, y.z - z) < L * 0.8)) continue;
    } else {
      const b = course.bounds;
      x = b.minX - 700 + rand() * (b.maxX - b.minX + 1400);
      z = b.minZ - 700 + rand() * (b.maxZ - b.minZ + 1400);
      if (!footprintClear(course, x, z, heading, L / 2 + 20, W / 2 + 20, quay + 60)) continue;
      if (course.occupied.blocked(x, z, L / 2 + 10)) continue;
      course.occupied.add(x, z, L / 2 + 10);
    }
    out.push({ kind, x, z, heading, moored: false });
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
  const out = new THREE.Group();
  out.name = "yachts";
  if (!harbour || !tracksideModel("yachts")) return null;
  const list = [
    ...moor(course, rand, harbour.quay ?? 190, harbour.moored || 0, KINDS),
    ...anchor(course, rand, {
      count: harbour.anchored || 0,
      area: harbour.anchorIn ? bayArea(group, harbour.anchorIn) : null,
      quay: harbour.quay ?? 190,
      wind: harbour.wind ?? 0.6,
    }),
  ];
  list.forEach((y, i) => {
    y.hull = color(HULLS[Math.floor(rand() * HULLS.length) % HULLS.length]);
    y.super = color(y.hull.r < 0.5 && rand() < 0.5 ? "#f6f6f4" : SUPERS[Math.floor(rand() * SUPERS.length) % SUPERS.length]);
    y.phase = rand();
    y.index = i;
  });
  const material = yachtMaterial();
  material.userData.worldOwned = true;
  const meshes = {};
  KINDS.forEach((kind) => {
    const n = list.filter((y) => y.kind === kind).length;
    if (!n) return;
    const near = instancedKind(`${kind}_lod0`, n, material);
    const far = instancedKind(`${kind}_lod1`, n, material);
    if (!near || !far) return;
    near.castShadow = true;
    near.receiveShadow = true;
    far.receiveShadow = true;
    meshes[kind] = { near, far };
    out.add(near, far);
  });
  out.userData.yachts = list.filter((y) => meshes[y.kind]);
  out.userData.meshes = meshes;
  out.userData.night = Boolean(venue.night);
  // Every one detailed until a view picks (prepare() compiles both models).
  showYachtsFor(out, null, "high");
  group.add(out);
  return out;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const S = new THREE.Vector3(YACHT_SCALE, YACHT_SCALE, YACHT_SCALE);
const P = new THREE.Vector3();

// Per view: the near ones detailed, the rest light (with no camera, every
// one detailed: the audit and prepare() see the whole fleet).
export function showYachtsFor(group, camera, tier) {
  if (!group || !group.userData.yachts) return;
  const reach = camera ? (YACHT_NEAR[tier] ?? YACHT_NEAR.high) : Infinity;
  const { meshes, yachts } = group.userData;
  Object.values(meshes).forEach(({ near, far }) => { near.count = 0; far.count = 0; });
  yachts.forEach((y) => {
    const { near, far } = meshes[y.kind];
    const close = !camera || Math.hypot(camera.position.x - y.x, camera.position.z - y.z) < reach;
    const mesh = close ? near : far;
    const i = mesh.count;
    // The model's bow is +x: turn it to the heading (x, z).
    q.setFromAxisAngle(UP, -y.heading);
    mesh.setMatrixAt(i, m4.compose(P.set(y.x, 0, y.z), q, S));
    const g = mesh.geometry.attributes;
    g.aHull.setXYZ(i, y.hull.r, y.hull.g, y.hull.b);
    g.aSuper.setXYZ(i, y.super.r, y.super.g, y.super.b);
    g.aPhase.setX(i, y.phase);
    mesh.count = i + 1;
  });
  Object.values(meshes).forEach(({ near, far }) => {
    [near, far].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      ["aHull", "aSuper", "aPhase"].forEach((k) => { m.geometry.attributes[k].needsUpdate = true; });
    });
  });
}

export function updateYachts(group, t) {
  yachtUniforms.uYachtTime.value = t;
  yachtUniforms.uYachtNight.value = group && group.userData.night ? 1 : 0;
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
    yachts: yachts.map((y) => ({ kind: y.kind, x: Math.round(y.x), z: Math.round(y.z), heading: +y.heading.toFixed(3), length: LENGTH[y.kind] * YACHT_SCALE, beam: BEAM[y.kind] * YACHT_SCALE, moored: y.moored })),
  };
}
