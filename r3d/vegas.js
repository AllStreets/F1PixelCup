// The Las Vegas Strip (docs/superpowers/specs/2026-10-05-vegas-strip-design.md):
// every tall building round the circuit where it really stands, and the
// Strip's landmarks, from assets/landmarks/vegas_strip.glb
// (tools/blender/build_vegas.py, its footprints from OpenStreetMap: ODbL).
//
// The model is in real metres round the circuit's own projection centre, so
// it is drawn at the circuit map's own scale (1.3 units a metre) with that
// centre where the game has it (tools/vegas/strip.json origin.game): each
// building stands where it does in life relative to the streets the circuit
// runs on. The game's road is wider than a real street and has its run-off;
// a building whose ground would touch it is moved straight away from the
// track until clear (a few metres, recorded), or left out if that is far.
//
// Built before the track data's grandstands and the rest, so the city stands
// first and they fill in round it.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tracksideModel, floats } from "./models.js";
import { color } from "./textures.js";

export const VEGAS_SCALE = 1.3;
// Where the model's origin (the circuit's projection centre) lies in the
// game: tools/vegas/strip.json origin.game (tests/vegas-strip.test.js).
export const VEGAS_ORIGIN = { x: 1290.3, z: 1729.8 };
// How far from the barrier a building's ground must stay, and how far one may
// be moved to get there before it is left out (game units).
const MARGIN = 10;
const MAX_SHIFT = 70;

// The Strip's own materials by role (the rest are the landmarks' own).
function stripMaterials(night, facadeMaterial, clock) {
  const made = {};
  const neon = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return (src) => {
    const name = src.name;
    if (made[name]) return made[name];
    let out = null;
    if (name === "facade_vegas") {
      // Hotel rooms (3.6 m bays), most of them lit on race night.
      out = facadeMaterial(night, night ? { glass: "#151b26", lit: 0.62, floors: 0.45, room: [3.6, 3.1], glow: 0.5, fromVertex: true } : { glass: "#56708c", room: [3.6, 3.1], fromVertex: true });
    } else if (name === "neon") {
      out = neon();
      // By day the tubes are there but dark.
      if (!night) out.color = new THREE.Color(0.35, 0.35, 0.35);
    } else if (name === "video") {
      out = videoMaterial(clock);
    } else if (name === "fountain") {
      out = fountainMaterial(clock, night);
    } else if (name === "beam") {
      out = beamMaterial(night);
    } else if (name === "lake") {
      out = new THREE.MeshPhongMaterial({ color: color(night ? "#0b1c2a" : "#2f6f8f"), specular: 0x9fc4dd, shininess: 90 });
    } else if (name === "roof_flat") {
      out = new THREE.MeshStandardMaterial({ color: color("#4a4b50"), roughness: 0.9 });
    } else if (["stone", "stone_dark", "brick", "doge_pink", "sandstone", "eiffel", "roof_green", "copper_green", "roof_red", "roof_blue", "roof_gold", "balloon", "white_steel"].includes(name)) {
      // Floodlit at night: each landmark lit warm from below.
      out = src.clone();
      if (night) Object.assign(out, { emissive: out.color.clone().multiply(color("#ffd9a8")), emissiveIntensity: name === "eiffel" ? 0.95 : name === "balloon" ? 0.55 : 0.32 });
      if (name === "eiffel") Object.assign(out, { metalness: 0.5, roughness: 0.5 });
    }
    if (out) {
      out.name = name;
      out.userData.worldOwned = true;
      made[name] = out;
    }
    return out;
  };
}

// The LED walls: abstract colour flowing across them (no image, no mark),
// read off their UVs in metres.
function videoMaterial(clock) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uVideoTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vVideo; varying vec2 vScreen;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvVideo = vec2(uv.x, 1.0 - uv.y);\nvScreen = (modelMatrix * vec4(position, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 vVideo; varying vec2 vScreen; uniform float uVideoTime;
        float vHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        // Each screen its own palette and its own kind of picture (by where
        // it stands): flowing colour, bars that sweep up, or a chase of
        // light; switching every few seconds as a resort's screen does.
        vec2 cell = floor(vScreen / 80.0);
        float id = vHash(cell);
        float t = uVideoTime;
        float scene = floor(t / 6.0 + id * 5.0);
        float kind = floor(vHash(cell + scene) * 3.0);
        vec2 p = vVideo / 14.0;
        float a;
        if (kind < 0.5) a = sin(p.x * 2.1 + t * 0.4) + sin(p.y * 1.7 - t * 0.5) + sin((p.x + p.y) * 1.3 + t * 0.3);
        else if (kind < 1.5) a = 2.0 * fract(p.y * 0.6 - t * 0.35);
        else a = 2.0 * step(0.5, fract((vVideo.x + vVideo.y) / 9.0 - t * 1.4));
        vec3 base = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + id + a * 0.12 + vHash(cell + scene + 3.1) * 0.5));
        vec3 c = mix(base * 0.35, base, smoothstep(0.2, 1.4, a));
        // The screen's pixels: a fine grid.
        vec2 px = fract(vVideo / 0.6);
        float pix = smoothstep(0.0, 0.15, px.x) * smoothstep(0.0, 0.15, px.y);
        diffuseColor.rgb = c * mix(0.55, 1.0, pix) * 1.1;`);
  };
  m.customProgramCacheKey = () => "vegas-video-v2";
  return m;
}

// The Bellagio's fountains: each jet (its vertex colours: red its phase in
// the show, green its row) raised and dropped in a show that runs along the
// rows and, every half minute, sends them all up together.
function fountainMaterial(clock, night) {
  const m = new THREE.MeshBasicMaterial({ color: night ? 0xe8f2ff : 0xf2f6fa, transparent: true, opacity: 0.62, depthWrite: false, vertexColors: true, toneMapped: !night });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShowTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uShowTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float ph = color.r;
        float row = color.g;
        float cycle = mod(uShowTime, 30.0);
        float wave = pow(max(0.0, sin(uShowTime * 1.1 - ph * 18.0 + row * 1.7)), 2.0);
        float finale = smoothstep(24.0, 25.5, cycle) * (1.0 - smoothstep(28.5, 30.0, cycle));
        float h = mix(4.0 + (46.0 - row * 22.0) * wave, 70.0 - row * 18.0, finale);
        transformed.y *= h;
        // The water leans a little with the breeze as it climbs.
        transformed.x += transformed.y * 0.03 * sin(uShowTime * 0.4 + ph * 6.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = diffuse;");
  };
  m.customProgramCacheKey = () => `vegas-fountain-v1-${night ? 1 : 0}`;
  return m;
}

// The Luxor's beam: light added to the sky, fading with height.
function beamMaterial(night) {
  const m = new THREE.MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: night ? 0.55 : 0.0, toneMapped: false, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBeamH;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBeamH = position.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBeamH;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(150.0, 1500.0, vBeamH);");
  };
  m.customProgramCacheKey = () => "vegas-beam-v1";
  m.visible = night;
  return m;
}

// A node's ground: the world points of its vertices near the ground (at most
// `cap` of them, evenly through the list).
function groundPoints(node, cap = 96) {
  const pts = [];
  node.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  node.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const low = [];
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y < 4) low.push([v.x, v.z]);
    }
    const step = Math.max(1, Math.floor(low.length / cap));
    for (let i = 0; i < low.length; i += step) pts.push(low[i]);
  });
  return pts;
}

// Move a node (a child of the scaled model) straight away from the track
// until its ground clears it; returns the shift (game units), or -1 if it
// would have to go further than MAX_SHIFT.
function clearOfTrack(course, node, scale, maxShift = MAX_SHIFT) {
  let shift = 0;
  for (let k = 0; k < 6; k += 1) {
    const pts = groundPoints(node);
    if (!pts.length) return shift;
    let worst = null;
    let least = Infinity;
    pts.forEach(([x, z]) => {
      const c = course.clearance(x, z, MARGIN + 60);
      if (c < least) { least = c; worst = [x, z]; }
    });
    if (least >= MARGIN) return shift;
    const near = course.nearestSample(worst[0], worst[1]);
    if (!near) return -1;
    let dx = worst[0] - near.x;
    let dz = worst[1] - near.y;
    // (A point on the centreline itself: out along the track's normal.)
    if (Math.hypot(dx, dz) < 1e-3) { dx = near.nx; dz = near.ny; }
    const need = MARGIN - least + 3;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    node.position.x += (ux * need) / scale;
    // (Model z is the game's z: the export turned the model's north to -z.)
    node.position.z += (uz * need) / scale;
    shift += need;
    if (shift > maxShift) return -1;
  }
  return -1;
}

// The buildings' meshes merged by material once they have their places (a
// few draw calls for two hundred buildings).
function mergeBuildings(parent) {
  parent.updateMatrixWorld(true);
  const byMaterial = new Map();
  parent.traverse((m) => {
    if (!m.isMesh) return;
    const g = new THREE.BufferGeometry();
    ["position", "normal", "uv", "color"].forEach((k) => { if (m.geometry.attributes[k]) g.setAttribute(k, floats(m.geometry.attributes[k])); });
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    g.applyMatrix4(m.matrixWorld);
    if (!byMaterial.has(m.material)) byMaterial.set(m.material, []);
    byMaterial.get(m.material).push(g);
  });
  const out = new THREE.Group();
  out.name = "strip_buildings";
  byMaterial.forEach((list, material) => {
    // Only the attributes every piece has.
    const keys = ["position", "normal", "uv", "color"].filter((k) => list.every((g) => g.attributes[k]));
    list.forEach((g) => Object.keys(g.attributes).forEach((k) => { if (!keys.includes(k)) g.deleteAttribute(k); }));
    const mesh = new THREE.Mesh(mergeGeometries(list), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.merged = list.length;
    out.add(mesh);
  });
  return out;
}

// The landmarks named for the checks and the photographs: the hand-built
// ones (their groups in the model) and each resort's tallest tower.
const NAMED = ["eiffel", "balloon", "arc", "campanile", "doges", "rialto", "colosseum", "high_roller", "liberty", "luxor", "strat", "bellagio_lake", "led_planethollywood", "led_cosmopolitan", "led_resortsworld"];
// (The resorts' signs are named too: sign_<resort>.)

export function buildVegasStrip(course, venue, { dress, facadeMaterial }) {
  const template = tracksideModel("vegasStrip");
  if (!template) return null;
  const night = Boolean(venue.night);
  const clock = { value: 0 };
  const model = template.clone(true);
  dress(model, venue, stripMaterials(night, facadeMaterial, clock));
  model.scale.setScalar(VEGAS_SCALE);
  model.position.set(VEGAS_ORIGIN.x, 0, VEGAS_ORIGIN.z);
  model.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = "landmark:vegasStrip";
  const moved = [];
  const dropped = [];
  const resorts = {};
  // Each building and each landmark clear of the track, then claimed.
  const pieces = [...model.getObjectByName("buildings").children, ...model.getObjectByName("landmarks").children];
  pieces.forEach((node) => {
    const shift = clearOfTrack(course, node, VEGAS_SCALE);
    if (shift < 0) { dropped.push(node.name); node.removeFromParent(); return; }
    if (shift > 0) moved.push({ name: node.name, shift: Math.round(shift) });
    node.updateMatrixWorld(true);
    groundPoints(node, 48).forEach(([x, z]) => course.occupied.add(x, z, 10));
    const resort = node.userData.resort;
    if (resort) {
      const box = new THREE.Box3().setFromObject(node);
      if (!resorts[resort] || box.max.y > resorts[resort].top) resorts[resort] = { top: box.max.y, x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
    }
  });
  // The lake is ground (nothing stands over the track in it; the cars never see under it).
  model.traverse((m) => { if (m.isMesh && m.material.name === "lake") m.userData.ground = true; });
  // Light: the beam and the jets never cast shadows.
  model.traverse((m) => { if (m.isMesh && ["beam", "fountain", "neon", "video"].includes(m.material.name)) { m.castShadow = false; } });
  const buildings = model.getObjectByName("buildings");
  const merged = mergeBuildings(buildings);
  buildings.removeFromParent();
  // (Merged in world space: straight into the group.)
  group.add(merged);
  group.add(model);
  // The Sphere where it stands, at the same scale (its own model).
  const sphereAt = model.getObjectByName("anchor_sphere");
  const sphere = tracksideModel("vegasSphere");
  if (sphere && sphereAt) {
    const p = new THREE.Vector3().setFromMatrixPosition(sphereAt.matrixWorld);
    const s = sphere.clone(true);
    dress(s, venue);
    s.scale.setScalar(VEGAS_SCALE);
    s.position.set(p.x, 0, p.z);
    const node = new THREE.Group();
    node.add(s);
    node.name = "sphere";
    group.add(node);
    // (The circuit runs round the Sphere's own corner: it may move further.)
    const shift = clearOfTrack(course, s, 1, 140);
    if (shift < 0) { dropped.push("sphere"); node.removeFromParent(); }
    else {
      if (shift > 0) moved.push({ name: "sphere", shift: Math.round(shift) });
      groundPoints(s, 48).forEach(([x, z]) => course.occupied.add(x, z, 10));
      s.updateMatrixWorld(true);
      const q = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
      const near = course.nearestSample(q.x, q.z) || course.samples[0];
      s.name = "landmark:vegasSphere";
      s.userData.landmark = { name: "vegasSphere", fromModel: true, trackAt: { x: Math.round(near.x), z: Math.round(near.y), d: Math.round(near.d) } };
    }
  }
  // The named landmarks, each with its nearest point of the track.
  const nearest = (x, z) => course.samples.reduce((a, q) => (Math.hypot(q.x - x, q.y - z) < Math.hypot(a.x - x, a.y - z) ? q : a));
  const named = (name, x, z, extra = {}) => {
    const q = nearest(x, z);
    return { name, fromModel: true, x: Math.round(x), z: Math.round(z), trackAt: { x: Math.round(q.x), z: Math.round(q.y), d: Math.round(q.d) }, ...extra };
  };
  const lm = model.getObjectByName("landmarks");
  // (Markers in the group, at their places in the world: the model's own
  // nodes are in its metres.)
  const mark = (name, x, z, top) => {
    const marker = new THREE.Object3D();
    marker.position.set(x, 0, z);
    marker.name = `named:${name}`;
    marker.userData.landmark = named(name, x, z, { top: Math.round(top) });
    group.add(marker);
  };
  model.updateMatrixWorld(true);
  [...NAMED, ...(lm ? lm.children.map((c) => c.name).filter((n) => n.startsWith("sign_")) : [])].forEach((n) => {
    const node = lm && lm.getObjectByName(n);
    if (!node) return;
    const box = new THREE.Box3().setFromObject(node);
    if (!box.isEmpty()) mark(n, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, box.max.y);
  });
  Object.entries(resorts).forEach(([name, r]) => mark(`resort_${name}`, r.x, r.z, r.top));
  group.userData.landmark = { name: "vegasStrip", fromModel: true, buildings: merged.children.reduce((a, m) => a + m.userData.merged, 0), moved, dropped };
  group.userData.animate = (dt) => { clock.value += dt; };
  return group;
}
