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
import { shiftClear, tileKey } from "./vegas-place.js";

export const VEGAS_SCALE = 1.3;
// Where the model's origin (the circuit's projection centre) lies in the
// game: tools/vegas/strip.json origin.game (tests/vegas-strip.test.js).
export const VEGAS_ORIGIN = { x: 1290.35, z: 1729.8 };
// How far from the barrier a building's ground must stay, and how far one may
// be moved to get there before it is left out (game units).
const MARGIN = 10;
const MAX_SHIFT = 70;

// The Strip's own materials by role (the rest are the landmarks' own).
function stripMaterials(night, facadeMaterial, clock) {
  const made = {};
  return (src) => {
    const name = src.name;
    if (made[name]) return made[name];
    let out = null;
    if (name === "facade_vegas") {
      // Hotel rooms (3.6 m bays), most of them lit on race night.
      out = facadeMaterial(night, night ? { glass: "#151b26", lit: 0.62, floors: 0.45, room: [3.6, 3.1], glow: 0.5, fromVertex: true } : { glass: "#56708c", room: [3.6, 3.1], fromVertex: true });
    } else if (name === "neon") {
      out = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
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
      .replace("#include <common>", "#include <common>\nvarying vec2 vVideo; varying float vScreen;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvVideo = vec2(uv.x, 1.0 - uv.y);\nvScreen = color.r;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 vVideo; varying float vScreen; uniform float uVideoTime;
        float vHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        // Each screen its own palette and its own kind of picture (its id in
        // its vertex colours): flowing colour, bars that sweep up, or a
        // chase of light; switching every few seconds as a resort's does.
        vec2 cell = vec2(floor(vScreen * 255.0 + 0.5), 7.0);
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
  m.vertexColors = true;
  m.customProgramCacheKey = () => "vegas-video-v3";
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
        // (The compressed model's positions are quantized round the node's
        // own box: the jet is stretched in the world, up from the water.)
        vec4 world = modelMatrix * vec4(transformed, 1.0);
        float ph = color.r;
        float row = color.g;
        float cycle = mod(uShowTime, 30.0);
        float wave = pow(max(0.0, sin(uShowTime * 1.1 - ph * 18.0 + row * 1.7)), 2.0);
        float finale = smoothstep(24.0, 25.5, cycle) * (1.0 - smoothstep(28.5, 30.0, cycle));
        float h = mix(4.0 + (46.0 - row * 22.0) * wave, 70.0 - row * 18.0, finale);
        // The jet is a metre tall in the model (its nozzle at 0.2 m): h
        // metres tall in the world, at the Strip's 1.3 units a metre.
        float up = max(0.0, world.y - 0.26);
        world.y = 0.26 + up * h;
        // The water leans a little with the breeze as it climbs.
        world.x += up * h * 0.03 * sin(uShowTime * 0.4 + ph * 6.0);
        transformed = (inverse(modelMatrix) * world).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = diffuse;");
  };
  m.customProgramCacheKey = () => `vegas-fountain-v2-${night ? 1 : 0}`;
  return m;
}

// The Luxor's beam: light added to the sky, fading with height.
function beamMaterial(night) {
  const m = new THREE.MeshBasicMaterial({ color: 0xcfe2ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, toneMapped: false, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBeamH;")
      // (The world's height: the compressed model's own positions are quantized.)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBeamH = (modelMatrix * vec4(position, 1.0)).y / 1.3;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBeamH;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(150.0, 1500.0, vBeamH);");
  };
  m.customProgramCacheKey = () => "vegas-beam-v2";
  // (By day the beam is off.)
  m.visible = night;
  return m;
}

// The ground a node covers, in the world: every corner of its triangles,
// their edges' middles and points across its large faces, dropped to the
// ground (an edge across the margin counts, not only its ends; a piece
// standing on another counts too), at most `cap` of them, evenly through.
function groundPoints(node, cap = 260) {
  const pts = [];
  node.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  node.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const index = m.geometry.index;
    const count = index ? index.count : pos.count;
    const at = (k) => (index ? index.getX(k) : k);
    const all = [];
    const c = new THREE.Vector3();
    for (let k = 0; k < count; k += 3) {
      for (let e = 0; e < 3; e += 1) {
        a.fromBufferAttribute(pos, at(k + e)).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, at(k + ((e + 1) % 3))).applyMatrix4(m.matrixWorld);
        all.push([a.x, a.z], [(a.x + b.x) / 2, (a.z + b.z) / 2]);
      }
      // A large face (a roof across a whole footprint): points across it
      // too, so the ground inside a building is covered, not only its edges.
      a.fromBufferAttribute(pos, at(k)).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, at(k + 1)).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, at(k + 2)).applyMatrix4(m.matrixWorld);
      const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
      const n = Math.min(12, Math.floor(Math.sqrt(area) / 15));
      for (let i = 1; i < n; i += 1) {
        for (let j = 1; i + j < n; j += 1) {
          const u = i / n;
          const v = j / n;
          all.push([a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v]);
        }
      }
    }
    const step = Math.max(1, Math.floor(all.length / cap));
    for (let k = 0; k < all.length; k += step) pts.push(all[k]);
  });
  return pts;
}

// The pieces that move together: a resort's towers, parts, screens and sign
// (so a tower and what stands on it never come apart); every other piece on
// its own.
function groupOf(node) {
  if (node.userData.resort) return `resort:${node.userData.resort}`;
  const m = /^(led|sign)_(\w+)$/.exec(node.name);
  return m ? `resort:${m[2]}` : `piece:${node.uuid}`;
}

// Each group clear of the track (moved straight away from it, each piece of
// it by the same), then claimed; a group that can't be is left out. Moves
// are in the model's own metres for pieces under the scaled model.
function placeGroups(course, nodes, scale, moved, dropped, maxShift = MAX_SHIFT) {
  const groups = new Map();
  nodes.forEach((n) => {
    const key = groupOf(n);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  });
  // The groups that need no move first: they claim their ground before any
  // moved one looks for room.
  const plans = [...groups.entries()].map(([key, list]) => {
    const pts = list.flatMap((n) => groundPoints(n));
    return { key, list, pts, r: shiftClear(pts, course, { margin: MARGIN, maxShift, blocked: null }) };
  });
  plans.sort((x, y) => (x.r.shift || 0) - (y.r.shift || 0));
  plans.forEach(({ key, list, pts, r: first }) => {
    const r = first.shift > 0
      ? shiftClear(pts, course, { margin: MARGIN, maxShift, blocked: (x, z) => course.occupied.blocked(x, z, 4) })
      : first;
    if (r.dropped) {
      list.forEach((n) => n.removeFromParent());
      dropped.push({ name: key, why: r.dropped });
      return;
    }
    if (r.shift > 0) {
      list.forEach((n) => {
        n.position.x += r.dx / scale;
        n.position.z += r.dz / scale;
        n.updateMatrixWorld(true);
      });
      moved.push({ name: key, shift: Math.round(r.shift) });
    }
    pts.forEach(([x, z], k) => { if (k % 3 === 0) course.occupied.add(x + r.dx, z + r.dz, 10); });
  });
}

const DARK = ["beam", "fountain", "neon", "video"];

// The buildings' meshes merged by material and by tile once they have their
// places: a few draw calls for two hundred buildings, each tile still left
// out of a view it isn't in.
function mergeBuildings(parent) {
  parent.updateMatrixWorld(true);
  const lists = new Map();
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  parent.traverse((m) => {
    if (!m.isMesh) return;
    const g = new THREE.BufferGeometry();
    ["position", "normal", "uv", "color"].forEach((k) => { if (m.geometry.attributes[k]) g.setAttribute(k, floats(m.geometry.attributes[k])); });
    g.setIndex(m.geometry.index ? m.geometry.index.clone() : [...Array(g.attributes.position.count).keys()]);
    g.applyMatrix4(m.matrixWorld);
    box.setFromBufferAttribute(g.attributes.position).getCenter(centre);
    const key = `${m.material.uuid}|${tileKey(centre.x, centre.z)}`;
    if (!lists.has(key)) lists.set(key, { material: m.material, list: [] });
    lists.get(key).list.push(g);
  });
  const out = new THREE.Group();
  out.name = "strip_buildings";
  lists.forEach(({ material, list }) => {
    // Only the attributes every piece has.
    const keys = ["position", "normal", "uv", "color"].filter((k) => list.every((g) => g.attributes[k] && g.attributes[k].itemSize === list[0].attributes[k].itemSize));
    list.forEach((g) => Object.keys(g.attributes).forEach((k) => { if (!keys.includes(k)) g.deleteAttribute(k); }));
    const geometry = mergeGeometries(list);
    if (!geometry) throw new Error(`the Strip's ${material.name} pieces would not merge`);
    list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !DARK.includes(material.name);
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
  // Each building and each landmark clear of the track, a resort's pieces
  // together, then claimed.
  const pieces = [...model.getObjectByName("buildings").children, ...model.getObjectByName("landmarks").children];
  placeGroups(course, pieces, VEGAS_SCALE, moved, dropped);
  const resorts = {};
  model.getObjectByName("buildings").children.forEach((node) => {
    const resort = node.userData.resort;
    if (!resort) return;
    const b = new THREE.Box3().setFromObject(node);
    if (!resorts[resort] || b.max.y > resorts[resort].top) resorts[resort] = { top: b.max.y, x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 };
  });
  // The lake is ground (nothing stands over the track in it; the cars never see under it).
  model.traverse((m) => { if (m.isMesh && m.material.name === "lake") m.userData.ground = true; });
  // Light: the beam and the jets never cast shadows.
  model.traverse((m) => {
    if (!m.isMesh) return;
    if (DARK.includes(m.material.name)) m.castShadow = false;
    // (The jets are drawn up to 70 m tall from a model a metre tall: never
    // left out of a view for their small bounds.)
    if (m.material.name === "fountain") m.frustumCulled = false;
  });
  const buildings = model.getObjectByName("buildings");
  const kept = buildings.children.length;
  const merged = mergeBuildings(buildings);
  buildings.removeFromParent();
  // (Merged in world space: straight into the group.)
  group.add(merged);
  group.add(model);
  // The Sphere where it stands, at the same scale (its own model).
  const screens = [];
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
    placeGroups(course, [s], 1, moved, dropped, 140);
    if (s.parent) {
      s.updateMatrixWorld(true);
      const q = new THREE.Vector3().setFromMatrixPosition(s.matrixWorld);
      const near = course.nearestSample(q.x, q.z) || course.samples[0];
      s.name = "landmark:vegasSphere";
      s.userData.landmark = { name: "vegasSphere", fromModel: true, x: Math.round(q.x), z: Math.round(q.z), trackAt: { x: Math.round(near.x), z: Math.round(near.y), d: Math.round(near.d) } };
      // Its image turns: its clock with the Strip's.
      s.traverse((m) => { if (m.material && m.material.userData.time) screens.push(m.material.userData.time); });
    }
  }
  // The named landmarks, each with its nearest point of the track.
  const nearest = (x, z) => course.nearestSample(x, z) || course.samples.reduce((a, q) => (Math.hypot(q.x - x, q.y - z) < Math.hypot(a.x - x, a.y - z) ? q : a));
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
    // A landmark's group (lm_<name>), a screen or sign its own node; the
    // Luxor by its pyramid (not its beam into the sky).
    const node = lm && (n === "luxor" ? lm.getObjectByName("luxor_pyramid") : lm.getObjectByName(`lm_${n}`) || lm.getObjectByName(n));
    if (!node) return;
    const box = new THREE.Box3().setFromObject(node);
    if (!box.isEmpty()) mark(n, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, box.max.y);
  });
  Object.entries(resorts).forEach(([name, r]) => mark(`resort_${name}`, r.x, r.z, r.top));
  group.userData.landmark = { name: "vegasStrip", fromModel: true, x: Math.round(VEGAS_ORIGIN.x), z: Math.round(VEGAS_ORIGIN.z), buildings: kept, moved, dropped };
  group.userData.animate = (dt) => {
    clock.value += dt;
    screens.forEach((t) => { t.value += dt; });
  };
  return group;
}
