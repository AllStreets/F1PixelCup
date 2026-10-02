// The people at the track (docs/superpowers/specs/2026-10-01-trackside-blender-design.md):
// the crowd in the grandstands, the pit crews in their garages, photographers
// at the corners and a TV camera crew on its platform. The figures are the
// Blender models in assets/people.glb (tools/blender/build_people.py), at the
// car's scale, instanced.
//
// One material draws them all: each figure's roles (skin, hair, shirt,
// trousers, trim) take its own colours per instance, and the vertex shader
// poses it about its joints (the parts are marked in the model's UVs): the
// crowd seated, standing up and waving as the player passes, sitting again
// after. The crowd in stands near the camera is 3D; further away, and on the
// Low tier, the stands keep their painted crowd (r3d/track.js).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tracksideModel } from "./models.js";
import { footprintClear } from "./track.js";
import { color, seeded, hashString } from "./textures.js";
import { suitColours } from "./driver.js";
import { CAR_SCALE } from "./car.js";

// People share the car's scale (6 units a metre).
export const PERSON_SCALE = CAR_SCALE;
// How near the camera a stand's crowd is drawn in 3D, per tier (Low draws
// only the painted crowd).
export const CROWD_NEAR = { high: 1500, medium: 800, low: 0 };
// The crowd stands up within CHEER_NEAR of the player, and is seated again
// past CHEER_FAR (each spectator's own distances vary about these). The
// stands' nearest seats are some 140 units from the racing line, so a car
// going by brings a whole stand to its feet, the eager ones first.
export const CHEER_NEAR = 260;
export const CHEER_FAR = 520;
// Each spectator's own distances: CHEER_NEAR and CHEER_FAR times
// EAGER_BASE + EAGER_SPAN * their eagerness (0..1).
const EAGER_BASE = 0.6;
const EAGER_SPAN = 0.8;

// How excited a spectator is (0 seated, 1 on their feet) at `distance` from
// the player: the vertex shader's own rule (personMaterial), for inspect.
export function excitement(distance, eager) {
  const k = EAGER_BASE + EAGER_SPAN * eager;
  const t = Math.min(1, Math.max(0, (distance - CHEER_NEAR * k) / (CHEER_FAR * k - CHEER_NEAR * k)));
  return 1 - t * t * (3 - 2 * t);
}

// A heading about the vertical read from a matrix that turns only about it
// (an Euler's y is wrong past a quarter turn: it folds into x and z).
const yawOf = (matrix) => Math.atan2(matrix.elements[8], matrix.elements[10]);

const ROLES = ["skin", "hair", "shirt", "trousers", "shoes", "trim", "gear", "lens"];
const CROWD_KINDS = ["crowd_a", "crowd_b", "crowd_c", "crowd_d"];

// Shared by every person material: where the player is, and the time.
const shared = {
  uPlayer: { value: new THREE.Vector3(1e7, 0, 1e7) },
  // Split screen's second player (far away when there is none).
  uPlayer2: { value: new THREE.Vector3(1e7, 0, 1e7) },
  uTime: { value: 0 },
  uNear: { value: CHEER_NEAR },
  uFar: { value: CHEER_FAR },
};

// ---------------------------------------------------------------------------
// Geometry and material
// ---------------------------------------------------------------------------

const geometries = new Map();

// A figure's geometry from the model: its primitives merged, each vertex
// carrying its role (aRole) and its part (aPart, from the UVs).
function figureGeometry(kind) {
  if (geometries.has(kind)) return geometries.get(kind);
  const root = tracksideModel("people");
  const node = root && root.getObjectByName(kind);
  if (!node) return null;
  node.updateMatrixWorld(true);
  const inverse = node.matrixWorld.clone().invert();
  const parts = [];
  node.traverse((m) => {
    if (!m.isMesh) return;
    const g = new THREE.BufferGeometry();
    const src = m.geometry;
    g.setAttribute("position", src.attributes.position.clone());
    g.setAttribute("normal", src.attributes.normal.clone());
    const n = src.attributes.position.count;
    const role = new Float32Array(n).fill(Math.max(0, ROLES.indexOf(m.material.name)));
    const part = new Float32Array(n);
    const uv = src.attributes.uv;
    for (let i = 0; i < n; i += 1) part[i] = uv ? Math.floor(uv.getX(i) * 16) : 10;
    g.setAttribute("aRole", new THREE.BufferAttribute(role, 1));
    g.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
    parts.push(g);
  });
  const geometry = mergeGeometries(parts);
  const joints = node.userData.joints || null;
  const made = { geometry, joints, extras: node.userData };
  geometries.set(kind, made);
  return made;
}

const v3 = (a, fallback) => new THREE.Vector3(...(a || fallback));

// The person material: colours by role per instance, and the pose.
function personMaterial(joints, { animated }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  const j = joints || {};
  const uniforms = {
    uHipL: { value: v3(j.hip_L, [0, 0.92, -0.095]) }, uKneeL: { value: v3(j.knee_L, [0.01, 0.5, -0.1]) },
    uHipR: { value: v3(j.hip_R, [0, 0.92, 0.095]) }, uKneeR: { value: v3(j.knee_R, [0.01, 0.5, 0.1]) },
    uShL: { value: v3(j.shoulder_L, [0, 1.42, -0.19]) }, uElL: { value: v3(j.elbow_L, [0, 1.13, -0.23]) },
    uShR: { value: v3(j.shoulder_R, [0, 1.42, 0.19]) }, uElR: { value: v3(j.elbow_R, [0, 1.13, 0.23]) },
  };
  m.userData.uniforms = uniforms;
  m.userData.animated = animated;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float aRole; attribute float aPart;
        attribute vec3 aSkin; attribute vec3 aHair; attribute vec3 aShirt; attribute vec3 aTrousers; attribute vec3 aTrim;
        attribute vec4 aPose;
        uniform vec3 uPlayer; uniform vec3 uPlayer2; uniform float uTime; uniform float uNear; uniform float uFar;
        uniform vec3 uHipL; uniform vec3 uKneeL; uniform vec3 uHipR; uniform vec3 uKneeR;
        uniform vec3 uShL; uniform vec3 uElL; uniform vec3 uShR; uniform vec3 uElR;
        varying vec3 vTint;
        vec3 rotZ(vec3 p, vec3 c, float a) { vec3 d = p - c; float cs = cos(a); float sn = sin(a); return c + vec3(d.x * cs - d.y * sn, d.x * sn + d.y * cs, d.z); }
        vec3 rotX(vec3 p, vec3 c, float a) { vec3 d = p - c; float cs = cos(a); float sn = sin(a); return c + vec3(d.x, d.y * cs - d.z * sn, d.y * sn + d.z * cs); }`)
      .replace("#include <beginnormal_vertex>", `
        vec3 objectNormal = vec3(normal);
        vec3 posed = position;
        ${animated ? `
        // How excited: the player near (each spectator's own distances).
        vec3 home = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float eager = ${EAGER_BASE.toFixed(2)} + ${EAGER_SPAN.toFixed(2)} * aPose.w;
        float excite = 1.0 - smoothstep(uNear * eager, uFar * eager, min(distance(home.xz, uPlayer.xz), distance(home.xz, uPlayer2.xz)));
        float sit = aPose.x * (1.0 - excite);
        float a = sit * 1.5708;
        float part = aPart;
        // Arms: swung forward and up over the head, opened a little to a V
        // (not straight out to the side, into the neighbours), the forearms
        // waving side to side.
        float raiseR = excite * (aPose.z < 1.5 ? 2.6 : 0.0);
        float raiseL = excite * (aPose.z < 0.5 ? 2.6 : 0.0);
        float openR = raiseR * 0.12;
        float openL = raiseL * 0.12;
        float wave = sin(uTime * 7.0 + aPose.y * 6.2832) * 0.45;
        if (part == 3.0) { posed = rotX(posed, uElL, wave * excite); objectNormal = rotX(objectNormal, vec3(0.0), wave * excite); }
        if (part == 5.0) { posed = rotX(posed, uElR, -wave * excite); objectNormal = rotX(objectNormal, vec3(0.0), -wave * excite); }
        if (part == 2.0 || part == 3.0) {
          posed = rotX(rotZ(posed, uShL, raiseL), uShL, -openL);
          objectNormal = rotX(rotZ(objectNormal, vec3(0.0), raiseL), vec3(0.0), -openL);
        }
        if (part == 4.0 || part == 5.0) {
          posed = rotX(rotZ(posed, uShR, raiseR), uShR, openR);
          objectNormal = rotX(rotZ(objectNormal, vec3(0.0), raiseR), vec3(0.0), openR);
        }
        // Legs: seated, the thighs forward and the shins hanging; the body
        // lowered and moved back so the feet stay on the floor.
        if (part == 7.0) { posed = rotZ(posed, uKneeL, -a); objectNormal = rotZ(objectNormal, vec3(0.0), -a); }
        if (part == 9.0) { posed = rotZ(posed, uKneeR, -a); objectNormal = rotZ(objectNormal, vec3(0.0), -a); }
        if (part == 6.0 || part == 7.0) { posed = rotZ(posed, uHipL, a); objectNormal = rotZ(objectNormal, vec3(0.0), a); }
        if (part == 8.0 || part == 9.0) { posed = rotZ(posed, uHipR, a); objectNormal = rotZ(objectNormal, vec3(0.0), a); }
        vec3 foot = vec3(uKneeL.x, 0.0, uKneeL.z);
        posed += foot - rotZ(rotZ(foot, uKneeL, -a), uHipL, a);
        // A little bounce when on their feet and cheering.
        posed.y += excite * 0.05 * max(0.0, sin(uTime * 9.0 + aPose.y * 6.2832));
        ` : ""}
        int role = int(aRole + 0.5);
        vTint = role == 0 ? aSkin : role == 1 ? aHair : role == 2 ? aShirt : role == 3 ? aTrousers
          : role == 4 ? vec3(0.035) : role == 5 ? aTrim : role == 6 ? vec3(0.05) : vec3(0.78, 0.78, 0.74);`)
      .replace("#include <begin_vertex>", "vec3 transformed = posed;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTint;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vTint;");
  };
  m.customProgramCacheKey = () => `person-${animated ? 1 : 0}`;
  return m;
}

// Instanced figures of one kind: their matrices, colours and pose attributes.
// `materials` holds the world's person materials, one per kind and pose
// (r3d/people.js owns them; render3d.js disposes them with the world).
function instanced(kind, list, { animated, cast, materials, model = kind }) {
  const made = figureGeometry(model);
  if (!made || !list.length) return null;
  const geometry = made.geometry.clone();
  const n = list.length;
  const attr = (key, size, fill) => {
    const a = new Float32Array(n * size);
    list.forEach((f, i) => fill(f, a, i * size));
    geometry.setAttribute(key, new THREE.InstancedBufferAttribute(a, size));
  };
  const rgb = (key) => (f, a, o) => { const c = f[key] || f.shirt; a[o] = c.r; a[o + 1] = c.g; a[o + 2] = c.b; };
  attr("aSkin", 3, rgb("skin"));
  attr("aHair", 3, rgb("hair"));
  attr("aShirt", 3, rgb("shirt"));
  attr("aTrousers", 3, rgb("trousers"));
  attr("aTrim", 3, rgb("trim"));
  attr("aPose", 4, (f, a, o) => { a[o] = f.seated ? 1 : 0; a[o + 1] = f.phase || 0; a[o + 2] = f.style || 0; a[o + 3] = f.eager || 0; });
  const key = `${model}:${animated ? 1 : 0}`;
  if (!materials.has(key)) {
    const m = personMaterial(made.joints, { animated });
    m.userData.worldOwned = true;
    materials.set(key, m);
  }
  const mesh = new THREE.InstancedMesh(geometry, materials.get(key), n);
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(PERSON_SCALE, PERSON_SCALE, PERSON_SCALE);
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((f, i) => {
    q.setFromAxisAngle(up, f.yaw);
    mesh.setMatrixAt(i, new THREE.Matrix4().compose(f.position, q, s));
  });
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.name = `people:${kind}`;
  mesh.userData.figures = list;
  mesh.computeBoundingSphere();
  return mesh;
}

// ---------------------------------------------------------------------------
// Who: colours
// ---------------------------------------------------------------------------

// Realistic skin tones, light to deep.
const SKINS = ["#f3d2bd", "#e8b89a", "#d9a07a", "#c68863", "#a86d4a", "#8a5537", "#6b3f27", "#4f2d1c"];
const HAIRS = ["#16100c", "#2a1b12", "#3d2716", "#5a3a20", "#8a6038", "#b8925a", "#d9c08a", "#8e8a86", "#c9c6c2"];
const SHIRTS = ["#f4f4f2", "#1a1c22", "#22345e", "#7d8794", "#b3202a", "#2e6d3e", "#e6c84a", "#e98a2c", "#5a8fd0", "#9b4a8c", "#d8d1c2", "#3b3b40"];
const TROUSERS = ["#2b3a5c", "#3c4a6a", "#1d2230", "#c9b892", "#57534d", "#202022", "#6f7f96", "#e8e4dc"];

const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

function teams() {
  return typeof TEAMS !== "undefined" ? TEAMS : [];
}

function fan(rand) {
  // Two in five wear a team's colours.
  const team = teams().length && rand() < 0.4 ? pick(rand, teams()) : null;
  const shirt = team ? suitColours(team).suit : pick(rand, SHIRTS);
  return {
    skin: color(pick(rand, SKINS)), hair: color(pick(rand, HAIRS)),
    shirt: color(shirt), trousers: color(pick(rand, TROUSERS)), trim: color(team ? suitColours(team).trim : "#ffffff"),
    phase: rand(), style: rand() < 0.6 ? 0 : rand() < 0.8 ? 1 : 2, eager: rand(),
  };
}

// ---------------------------------------------------------------------------
// Where: the crowd in the stands
// ---------------------------------------------------------------------------

// Every seat of every model-built stand (r3d/track.js marks them) gets a
// spectator, a share left empty; a few stand at the front rail.
function crowdInStands(decor, rand, materials) {
  const stands = [];
  decor.children.forEach((stand) => {
    const info = stand.userData.stand;
    if (!info) return;
    stand.updateMatrixWorld(true);
    const byKind = Object.fromEntries(CROWD_KINDS.map((k) => [k, []]));
    const yaw = yawOf(stand.matrixWorld);
    // Facing the track: the stand's local -z, which the figure's +x turns to.
    const facing = yaw + Math.PI / 2;
    const add = (local, seated) => {
      const f = fan(rand);
      f.seated = seated;
      f.position = info.model.localToWorld(local.clone());
      f.yaw = facing + (rand() - 0.5) * 0.25;
      f.kind = CROWD_KINDS[Math.floor(rand() * CROWD_KINDS.length) % CROWD_KINDS.length];
      byKind[f.kind].push(f);
    };
    info.rows.forEach((row) => {
      row.seats.forEach((x) => {
        if (rand() < 0.86) add(new THREE.Vector3(x, row.y, row.z), true);
      });
    });
    // Fans on their feet along the front walkway, half a metre ahead of the
    // first row's feet (the rail is 0.2 m further).
    const front = info.rows[0];
    for (let x = -11.5; x <= 11.5; x += 1.6) {
      if (rand() < 0.5) add(new THREE.Vector3(x + (rand() - 0.5) * 0.4, front.y, front.z - 0.45), false);
    }
    const meshes = CROWD_KINDS.map((k) => instanced(k, byKind[k], { animated: true, cast: false, materials })).filter(Boolean);
    const centre = new THREE.Vector3();
    stand.getWorldPosition(centre);
    stands.push({ stand, meshes, planes: info.planes, centre, count: meshes.reduce((n, m) => n + m.count, 0) });
  });
  return stands;
}

// ---------------------------------------------------------------------------
// The pit crews: four in each team's garage door, in the team's kit.
// ---------------------------------------------------------------------------

function pitCrews(landmarks, rand) {
  const garages = landmarks.getObjectByName("garages");
  if (!garages) return [];
  const crew = [];
  garages.updateMatrixWorld(true);
  garages.children.filter((o) => o.userData.bay && !o.userData.bay.safetyCar).forEach((bay) => {
    const { index, depth, recess } = bay.userData.bay;
    const team = teams()[index % Math.max(1, teams().length)];
    const kit = team ? suitColours(team) : { suit: "#c9ced6", trim: "#222222" };
    const yaw = yawOf(bay.matrixWorld) + Math.PI / 2;
    [-8.5, -3, 3, 8.5].forEach((x, k) => {
      const local = new THREE.Vector3(x + (rand() - 0.5) * 1.5, 0, -depth / 2 + (recess || 9) * (0.35 + 0.3 * rand()));
      const position = bay.localToWorld(local);
      // On the bay's floor (0.3 units thick).
      position.y = bay.position.y + 0.3;
      crew.push({
        kind: "crew", position, yaw, base: yaw, team: team ? team.id : null,
        skin: color(pick(rand, SKINS)), hair: color(pick(rand, HAIRS)),
        shirt: color(kit.suit), trousers: color(kit.suit), trim: color(kit.trim || "#ffffff"),
        phase: rand(), eager: 0.6 + rand() * 0.4, k,
      });
    });
  });
  return crew;
}

// ---------------------------------------------------------------------------
// Photographers at the corners, and the TV platform
// ---------------------------------------------------------------------------

// The sharpest bends, at least `gap` apart round the lap.
function bends(course, count, gap = 600) {
  const { samples } = course;
  const total = course.track.totalLength;
  const peaks = samples.filter((p, i) => {
    const a = Math.abs(p.curve);
    if (a < 0.003) return false;
    for (let k = -4; k <= 4; k += 1) if (Math.abs(samples[(i + k + samples.length) % samples.length].curve) > a) return false;
    return true;
  }).sort((a, b) => Math.abs(b.curve) - Math.abs(a.curve));
  const out = [];
  peaks.forEach((p) => {
    if (out.length >= count) return;
    if (out.some((q) => { const dd = Math.abs(q.d - p.d); return Math.min(dd, total - dd) < gap; })) return;
    out.push(p);
  });
  return out;
}

// A spot past the barrier on the outside of a bend (else its inside), moved
// along the corner where it is taken. Claims it.
function besideBend(course, bend, { past, half, radius }) {
  const total = course.track.totalLength;
  for (const which of [1, -1]) {
    for (const shift of [0, -25, 25, -50, 50, -80, 80]) {
      const p = course.sampleAt(((bend.d + shift) % total + total) % total);
      // Not by a bridge or its ramps: they stand on the ground.
      if (p.h > 0.5) continue;
      const side = (bend.curve > 0 ? -1 : 1) * which;
      const off = side * ((side > 0 ? p.outerR : p.outerL) + past);
      const x = p.x + p.nx * off;
      const z = p.y + p.ny * off;
      if (!footprintClear(course, x, z, Math.atan2(p.ty, p.tx), half, half, 3) || course.occupied.blocked(x, z, radius)) continue;
      course.occupied.add(x, z, radius);
      return { x, z, p, apex: course.sampleAt(bend.d) };
    }
  }
  return null;
}

// Facing a point: the figure's +x toward it.
const yawToward = (from, x, z) => Math.atan2(-(z - from.z), x - from.x);

function photographers(course, rand) {
  const out = [];
  bends(course, 5).forEach((bend) => {
    // The lens reaches 0.8 m ahead (4.8 units) and turns with the cars.
    const spot = besideBend(course, bend, { past: 9, half: 3, radius: 6 });
    if (!spot) return;
    const position = new THREE.Vector3(spot.x, 0, spot.z);
    const yaw = yawToward(position, spot.apex.x, spot.apex.y);
    out.push({
      kind: "photographer", position, yaw, base: yaw,
      skin: color(pick(rand, SKINS)), hair: color(pick(rand, HAIRS)),
      shirt: color(pick(rand, ["#1a1c22", "#3b3b40", "#22345e", "#57534d"])), trousers: color(pick(rand, ["#1d2230", "#57534d", "#2b3a5c"])),
      // The tabard: the photographers' orange.
      trim: color("#f06a12"), phase: rand(), eager: 1,
    });
  });
  return out;
}

function tvPlatform(course, rand, group) {
  const root = tracksideModel("people");
  const model = root && root.getObjectByName("tv_platform");
  if (!model) return [];
  // At the first big bend after the start, where the field bunches up.
  const total = course.track.totalLength;
  const list = bends(course, 8, 300).sort((a, b) => ((a.d - 150 + total) % total) - ((b.d - 150 + total) % total));
  for (const bend of list) {
    const spot = besideBend(course, bend, { past: 16, half: 10, radius: 13 });
    if (!spot) continue;
    const platform = model.clone(true);
    platform.scale.setScalar(PERSON_SCALE);
    platform.position.set(spot.x, 0, spot.z);
    const toward = yawToward(platform.position, spot.apex.x, spot.apex.y);
    platform.rotation.y = toward;
    platform.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    platform.name = "tvPlatform";
    group.add(platform);
    const deck = (model.userData.deck || 3) * PERSON_SCALE;
    // On the deck, a step behind its middle, the camera ahead of them.
    const position = new THREE.Vector3(-0.45 * PERSON_SCALE, deck, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), toward).add(platform.position);
    return [{
      kind: "camera_operator", position, yaw: toward, base: toward, platform: true,
      skin: color(pick(rand, SKINS)), hair: color(pick(rand, HAIRS)),
      shirt: color("#1a1c22"), trousers: color("#1d2230"), trim: color("#1a1c22"), phase: rand(), eager: 1,
    }];
  }
  return [];
}

// The marshals: one on each post's platform, in orange overalls (the crew
// figure, its trim white), facing the road, the flag in the hand beside them
// (r3d/trackside.js waves it).
function marshalFigures(marshals, rand) {
  if (!marshals) return [];
  marshals.updateMatrixWorld(true);
  return marshals.children.filter((g) => g.userData.post && g.userData.post.standAt).map((g) => {
    const position = g.localToWorld(g.userData.post.standAt.clone());
    const yaw = yawOf(g.matrixWorld) + Math.PI / 2;
    return {
      // The roof's underside over their head (world height), for the checks.
      kind: "marshal", position, yaw, base: yaw, roof: g.position.y + g.userData.post.roofAt,
      skin: color(pick(rand, SKINS)), hair: color(pick(rand, HAIRS)),
      shirt: color("#ff6a00"), trousers: color("#ff6a00"), trim: color("#f2f2f2"), phase: rand(),
    };
  });
}

// ---------------------------------------------------------------------------

// Everything: after the decor, the landmarks (the garages) and the marshals
// have claimed their ground. `decor` holds the stands r3d/track.js built.
export function buildPeople(course, { decor, landmarks, marshals }) {
  const group = new THREE.Group();
  group.name = "people";
  if (!tracksideModel("people")) {
    group.userData = { stands: [], watchers: [], figures: [] };
    return group;
  }
  const rand = seeded(hashString(course.track.id) ^ 0x2f6b9a13);
  const materials = new Map();
  const stands = crowdInStands(decor, rand, materials);
  stands.forEach((s) => s.meshes.forEach((m) => group.add(m)));
  const crew = pitCrews(landmarks, rand);
  const snappers = photographers(course, rand);
  const tv = tvPlatform(course, rand, group);
  const posts = marshalFigures(marshals, rand);
  const still = instanced("marshal", posts, { animated: false, cast: true, materials, model: "crew" });
  if (still) group.add(still);
  const watchers = [];
  [["crew", crew], ["photographer", snappers], ["camera_operator", tv]].forEach(([kind, list]) => {
    const mesh = instanced(kind, list, { animated: false, cast: true, materials });
    if (!mesh) return;
    group.add(mesh);
    watchers.push(mesh);
  });
  group.userData = {
    stands,
    watchers,
    // Every figure placed, for the checks.
    figures: [
      ...stands.flatMap((s) => s.meshes.flatMap((m) => m.userData.figures.map((f) => ({ kind: f.kind, x: f.position.x, y: f.position.y, z: f.position.z, yaw: f.yaw, stand: true })))),
      ...[...crew, ...snappers, ...tv, ...posts].map((f) => ({ kind: f.kind, x: f.position.x, y: f.position.y, z: f.position.z, yaw: f.base, base: f.base, platform: Boolean(f.platform), roof: f.roof })),
    ],
  };
  return group;
}

// Per frame: where the player is (the crowd near them stands and waves), the
// near stands' crowd in 3D (not on Low), and the crews, photographers and the
// TV camera turning to follow the nearest car.
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const p = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const WATCH_RANGE = 320;

export function updatePeople(group, { players, racers, t, dt }) {
  if (!group || !group.userData.stands) return;
  const [one, two] = players || [];
  if (one) shared.uPlayer.value.set(one.x, 0, one.y);
  if (two) shared.uPlayer2.value.set(two.x, 0, two.y);
  else shared.uPlayer2.value.set(1e7, 0, 1e7);
  shared.uTime.value = t;
  const ease = 1 - Math.exp(-(dt || 0) * 4);
  group.userData.watchers.forEach((mesh) => {
    let changed = false;
    mesh.userData.figures.forEach((f, i) => {
      // The nearest car in sight, within range and not behind them.
      let best = null;
      let bestD = WATCH_RANGE;
      (racers || []).forEach((r) => {
        const d = Math.hypot(r.x - f.position.x, r.y - f.position.z);
        if (d < bestD) { bestD = d; best = r; }
      });
      let want = f.base;
      if (best) {
        const toward = yawToward(f.position, best.x, best.y);
        const off = Math.atan2(Math.sin(toward - f.base), Math.cos(toward - f.base));
        want = f.base + Math.max(-1.9, Math.min(1.9, off));
      }
      const turn = Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw));
      if (Math.abs(turn) < 1e-3) return;
      f.yaw += turn * ease;
      q.setFromAxisAngle(UP, f.yaw);
      s.setScalar(PERSON_SCALE);
      mesh.setMatrixAt(i, m4.compose(p.copy(f.position), q, s));
      changed = true;
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  });
}

// Per view (split screen draws two): the stands near this view's camera
// show their crowd in 3D (not on Low), the rest their painted crowd.
export function showCrowdFor(group, camera, tier) {
  if (!group || !group.userData.stands) return;
  const reach = CROWD_NEAR[tier] ?? CROWD_NEAR.high;
  group.userData.stands.forEach((st) => {
    const near = camera.position.distanceTo(st.centre) < reach;
    st.meshes.forEach((m) => { m.visible = near; });
    if (st.planes) st.planes.visible = !near;
  });
}

// For the checks: what is drawn, and how the crowd near the player stands.
export function inspectPeople(group, players) {
  if (!group || !group.userData.stands) return null;
  const { stands, watchers, figures } = group.userData;
  const byKind = {};
  figures.forEach((f) => { byKind[f.kind] = (byKind[f.kind] || 0) + 1; });
  const drawn3d = stands.filter((st) => st.meshes.some((m) => m.visible)).length;
  const painted = stands.filter((st) => st.planes && st.planes.visible).length;
  // The crowd's pose as the shader gives it (excitement: 0 seated and
  // still, 1 on their feet and waving), averaged over the spectators near
  // the player (all within everyone's own near distance) and those far from
  // them (past everyone's far distance).
  const cheer = { near: { count: 0, excited: 0 }, far: { count: 0, excited: 0 } };
  const nearBy = CHEER_NEAR * EAGER_BASE;
  const farOff = CHEER_FAR * (EAGER_BASE + EAGER_SPAN);
  if (players && players.length) {
    stands.forEach((st) => st.meshes.forEach((m) => m.userData.figures.forEach((f) => {
      const d = Math.min(...players.map((pl) => Math.hypot(f.position.x - pl.x, f.position.z - pl.y)));
      const group = d < nearBy ? cheer.near : d > farOff ? cheer.far : null;
      if (!group) return;
      group.count += 1;
      group.excited += excitement(d, f.eager);
    })));
  }
  [cheer.near, cheer.far].forEach((g) => { g.excited = g.count ? +(g.excited / g.count).toFixed(3) : 0; });
  return {
    byKind,
    stands: stands.length,
    crowd3d: stands.reduce((n, st) => n + st.count, 0),
    standsDrawn3d: drawn3d,
    standsPainted: painted,
    cheer,
    // Each crew member, photographer and camera operator: where, and which
    // way they face now and at rest.
    watchers: watchers.flatMap((m) => m.userData.figures.map((f) => ({ kind: f.kind, x: +f.position.x.toFixed(2), z: +f.position.z.toFixed(2), yaw: +f.yaw.toFixed(4), base: +f.base.toFixed(4) }))),
  };
}
