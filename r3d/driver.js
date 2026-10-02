// The race driver figure (assets/driver.glb, tools/blender/build_driver.py),
// dressed per driver: the suit in the team's colours, the helmet with the
// driver's own painted design (the same texture the car's helmet wears), and
// bareheaded, the driver's own face, hair and beard.
// See docs/superpowers/specs/2026-10-01-driver-v2-design.md and
// docs/superpowers/specs/2026-10-01-driver-faces-design.md.
//
// The body is skinned, so every figure is a SkeletonUtils clone with its own
// skeleton, and an AnimationMixer plays its five poses: stand, wave, arms_up,
// trophy and spray. A pose shows only the prop it uses.
//
// buildDriver(driver, team, { headwear }): headwear "none" (the default, as on
// the podium) shows the face, the hair and the beard, the neck skin above the
// collar; "helmet" shows the helmet over the balaclava, as in the car.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import "../faces.js";
import { color } from "./textures.js";
import { liveryFor, helmetTexture } from "./car.js";

const Faces = globalThis.Faces;
export const POSES = ["stand", "wave", "arms_up", "trophy", "spray"];
export const HEADWEAR = ["none", "helmet"];
const PROP_FOR = { trophy: "trophy", spray: "bottle" };
// What only the bare head shows, and what only the helmet shows.
const BARE = /^(head_skin|eye_[LR]|lashes|brows|hair_.+|beard_.+)$/;
const HELMET = /^(helmet|helmet_spoiler)$/;
// How much stubble shadow each kind of facial hair leaves on the skin (under
// a beard, the skin shows a little through it).
const STUBBLE = { none: 0.12, stubble: 0.8, short_beard: 0.7, full_beard: 0.7, moustache: 0.55 };

// Where a team's race suit differs from its car's base colour (the 2025
// suits): Mercedes race in black, with the car's teal as the trim.
const SUITS = {
  mercedes: { suit: "#17191c", trim: "#00d2be" },
};

let template = null;
let clips = [];

export function loadDriver(onReady, onError, url = "./assets/driver.glb") {
  if (template) {
    onReady();
    return;
  }
  new GLTFLoader().load(url, (gltf) => {
    template = gltf.scene;
    clips = gltf.animations;
    template.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    onReady();
  }, undefined, onError);
}

export function driverLoaded() {
  return Boolean(template);
}

// The suit's colours for a team: the override above, else the car's livery.
export function suitColours(team) {
  if (SUITS[team.id]) return SUITS[team.id];
  const livery = liveryFor(team);
  return { suit: livery.base, trim: livery.trim || team.trim };
}

// The skin: the masks baked in the build (_MASKS: lips, beard area, warmth,
// eye sockets) shade the lips, a flush, the sockets and the stubble; a soft
// wrap of light at the shadow's edge, redder than the rest, stands in for
// light travelling through skin.
const WRAP_FROM = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
const NOISE = `
  float faceHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float faceNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(faceHash(i), faceHash(i + vec3(1, 0, 0)), f.x), mix(faceHash(i + vec3(0, 1, 0)), faceHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(faceHash(i + vec3(0, 0, 1)), faceHash(i + vec3(1, 0, 1)), f.x), mix(faceHash(i + vec3(0, 1, 1)), faceHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;
function skinMaterial(look) {
  const m = new THREE.MeshPhysicalMaterial({
    name: "skin",
    color: color(look.skin),
    roughness: 0.52,
    specularIntensity: 0.55,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(look.skin).lerp(new THREE.Color("#ffd8c8"), 0.5),
  });
  const uniforms = {
    stubble: { value: STUBBLE[look.facialHair] },
    stubbleColor: { value: color(look.beardColor) },
    lipTint: { value: new THREE.Color(0.86, 0.62, 0.6) },
    hairColor: { value: color(look.hair.color) },
    // A buzz cut is all scalp; elsewhere the scalp shows only where the hair
    // thins out at its edge.
    scalpAmount: { value: look.hair.style === "buzz" ? 0.88 : 0.5 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 _masks;\nattribute float _scalp;\nvarying vec4 vMasks;\nvarying float vScalp;\nvarying vec3 vSkinPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMasks = _masks;\nvScalp = _scalp;\nvSkinPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float stubble;
        uniform vec3 stubbleColor;
        uniform vec3 lipTint;
        uniform vec3 hairColor;
        uniform float scalpAmount;
        varying vec4 vMasks;
        varying float vScalp;
        varying vec3 vSkinPos;
        ${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          // Mottling, a few millimetres across.
          c *= 0.96 + 0.08 * faceNoise(vSkinPos * 260.0);
          c = mix(c, c * vec3(1.06, 0.84, 0.82), vMasks.b * 0.45);
          c = mix(c, c * lipTint, vMasks.r);
          c *= 1.0 - vMasks.a * 0.16;
          // Stubble: hairs about half a millimetre apart, faded to their
          // average where they are smaller than a pixel.
          vec3 sp = vSkinPos * 1900.0;
          float fw = length(fwidth(sp));
          float dots = mix(smoothstep(0.45, 0.8, faceNoise(sp)), 0.42, smoothstep(0.4, 1.2, fw));
          float area = vMasks.g * stubble;
          c = mix(c, mix(c, stubbleColor, 0.82), area * (0.35 + 0.65 * dots));
          // The scalp: hair roots at the hairline's soft edge, or a buzz cut.
          float roots = mix(smoothstep(0.35, 0.75, faceNoise(sp * 1.15)), 0.5, smoothstep(0.4, 1.2, fw));
          c = mix(c, hairColor, vScalp * scalpAmount * (0.45 + 0.55 * roots));
          diffuseColor.rgb = c;
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.4, vMasks.r);")
      .replace("#include <lights_physical_pars_fragment>", THREE.ShaderChunk.lights_physical_pars_fragment.replace(WRAP_FROM, `{
          vec3 wrapW = vec3(0.45, 0.24, 0.18);
          float wrapNL = dot(geometryNormal, directLight.direction);
          vec3 wrapped = clamp((vec3(wrapNL) + wrapW) / (1.0 + wrapW), 0.0, 1.0);
          vec3 lit = directLight.color * wrapped;
          reflectedLight.directDiffuse += lit * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
        }`));
  };
  m.customProgramCacheKey = () => "driver-skin";
  return m;
}

// Hair and beards: strands drawn along each vertex's flow (_FLOW, from the
// build), clumped, with the two shifted highlights of real hair (Kajiya-Kay:
// a white one, and a second tinted by the hair) running across the strands.
function hairMaterial(name, hex, beard) {
  const m = new THREE.MeshPhysicalMaterial({ name, color: color(hex), roughness: 0.78, specularIntensity: 0.25 });
  const uniforms = { hairTint: { value: color(hex) }, strandScale: { value: beard ? 2600 : 2200 } };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 _flow;\nvarying vec3 vFlowO;\nvarying vec3 vFlowV;\nvarying vec3 vHairPos;\nvarying vec3 vHairN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlowO = _flow;\nvFlowV = normalize((modelViewMatrix * vec4(_flow, 0.0)).xyz);\nvHairPos = position;\nvHairN = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform vec3 hairTint;
        uniform float strandScale;
        varying vec3 vFlowO;
        varying vec3 vFlowV;
        varying vec3 vHairPos;
        varying vec3 vHairN;
        ${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec3 f = normalize(vFlowO);
          vec3 across = normalize(cross(f, normalize(vHairN)));
          float q = dot(vHairPos, across), a = dot(vHairPos, f);
          // Strands a fraction of a millimetre across, a few centimetres long;
          // clumps of them about half a centimetre across.
          vec3 sp = vec3(q * strandScale, a * 45.0, 0.0);
          float fw = length(fwidth(sp.xy));
          float strands = mix(faceNoise(sp) * 0.6 + faceNoise(sp * vec3(2.3, 1.7, 1.0) + 7.0) * 0.4, 0.5, smoothstep(0.5, 1.5, fw));
          float clumps = faceNoise(vec3(q * 190.0, a * 14.0, 3.0));
          diffuseColor.rgb *= mix(0.55, 1.2, strands) * mix(0.75, 1.1, clumps);
        }`)
      .replace("#include <lights_physical_pars_fragment>", THREE.ShaderChunk.lights_physical_pars_fragment.replace(WRAP_FROM, `${WRAP_FROM}
        {
          vec3 T = normalize(vFlowV);
          vec3 Hv = normalize(directLight.direction + geometryViewDir);
          float lit = smoothstep(-0.15, 0.35, dot(geometryNormal, directLight.direction));
          float t1 = dot(normalize(T + geometryNormal * 0.1), Hv);
          float t2 = dot(normalize(T - geometryNormal * 0.15), Hv);
          float s1 = pow(sqrt(max(0.0, 1.0 - t1 * t1)), 140.0);
          float s2 = pow(sqrt(max(0.0, 1.0 - t2 * t2)), 36.0);
          reflectedLight.directSpecular += directLight.color * lit * (s1 * 0.22 + s2 * 0.35 * hairTint);
        }`));
  };
  m.customProgramCacheKey = () => "driver-hair";
  return m;
}

// Alpha-tested strands (the brows and lashes): crisp edges, smoothed by the
// multisampling.
function strands(m, hex, scale = 1) {
  m.color = color(hex).multiplyScalar(scale);
  m.transparent = false;
  m.alphaTest = 0.3;
  m.alphaToCoverage = true;
  m.side = THREE.DoubleSide;
  m.roughness = 0.7;
  return m;
}

// Bound parts (the brows, hair and beards) follow the head's own morph: each
// vertex sits on a triangle of the head (_BIND, the head's _VID; _BARY its
// weights) and moves as that triangle does. Done once per figure, for the
// parts it shows, into a position attribute of its own; everything else of
// the geometry stays shared.
function followHead(model, weights, parts) {
  let head = null;
  model.traverse((n) => { if (n.isMesh && n.name === "head_skin") head = n; });
  if (!head || !parts.length) return;
  model.updateMatrixWorld(true);
  const g = head.geometry;
  const vid = g.attributes._vid;
  const morphs = g.morphAttributes.position || [];
  const active = Object.entries(head.morphTargetDictionary || {}).filter(([k, i]) => weights[k] && morphs[i]).map(([k, i]) => [weights[k], morphs[i]]);
  let top = 0;
  for (let i = 0; i < vid.count; i += 1) top = Math.max(top, vid.getX(i));
  const disp = new Float32Array((top + 1) * 3);
  for (let i = 0; i < vid.count; i += 1) {
    const o = Math.round(vid.getX(i)) * 3;
    let x = 0, y = 0, z = 0;
    active.forEach(([w, m]) => { x += w * m.getX(i); y += w * m.getY(i); z += w * m.getZ(i); });
    disp[o] = x; disp[o + 1] = y; disp[o + 2] = z;
  }
  const v = new THREE.Vector3();
  parts.forEach((mesh) => {
    const src = mesh.geometry;
    if (!src.attributes._bind) return;
    // From the head's space to this part's.
    const toPart = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).invert().multiply(head.matrixWorld));
    const geo = new THREE.BufferGeometry();
    Object.entries(src.attributes).forEach(([k, a]) => geo.setAttribute(k, a));
    geo.setIndex(src.index);
    src.groups.forEach((gr) => geo.addGroup(gr.start, gr.count, gr.materialIndex));
    const pos = src.attributes.position.clone();
    const bind = src.attributes._bind, bary = src.attributes._bary;
    for (let i = 0; i < pos.count; i += 1) {
      v.set(0, 0, 0);
      for (let k = 0; k < 3; k += 1) {
        const o = Math.round(bind.getComponent(i, k)) * 3;
        const w = bary.getComponent(i, k);
        v.x += w * disp[o]; v.y += w * disp[o + 1]; v.z += w * disp[o + 2];
      }
      v.applyMatrix3(toPart);
      pos.setXYZ(i, pos.getX(i) + v.x, pos.getY(i) + v.y, pos.getZ(i) + v.z);
    }
    geo.setAttribute("position", pos);
    geo.boundingSphere = src.boundingSphere;
    mesh.geometry = geo;
    mesh.userData.ownGeometry = geo;
  });
}

function dress(model, driver, team, look) {
  const { suit, trim } = suitColours(team);
  const made = new Map();
  const dressed = (m) => {
    if (made.has(m.name)) return made.get(m.name);
    let out = m.clone();
    if (m.name === "suit") out.color = color(suit);
    if (m.name === "suit_trim") out.color = color(trim);
    if (m.name === "helmet") {
      out.map = helmetTexture(driver);
      out.color = new THREE.Color(0xffffff);
      out.roughness = 0.22;
      out.metalness = 0.12;
    }
    if (look) {
      if (m.name === "skin") {
        out.dispose();
        out = skinMaterial(look);
      }
      if (m.name === "eye_iris") out.color = color(look.eyes);
      if (m.name === "eye_cornea") {
        out.transparent = true;
        out.opacity = 0.14;
        out.roughness = 0.02;
        out.depthWrite = false;
      }
      if (m.name === "brows") strands(out, look.brow);
      if (m.name === "lashes") strands(out, look.brow, 0.4);
      if (m.name === "hair" || m.name === "beard") {
        out.dispose();
        out = hairMaterial(m.name, m.name === "hair" ? look.hair.color : look.beardColor, m.name === "beard");
      }
    }
    made.set(m.name, out);
    return out;
  };
  model.traverse((node) => {
    if (node.isMesh) node.material = Array.isArray(node.material) ? node.material.map(dressed) : dressed(node.material);
  });
  return made;
}

// The top-level part a mesh belongs to (a glTF node with several materials
// loads as a group of meshes).
function partName(node) {
  return node.parent && node.parent.isGroup && !node.parent.isBone && node.name.startsWith(node.parent.name) ? node.parent.name : node.name;
}

// A dressed figure: { root, play(pose), update(dt), looks(), dispose() }.
export function buildDriver(driver, team, options = {}) {
  if (!template) throw new Error("buildDriver before loadDriver");
  const headwear = options.headwear || "none";
  if (!HEADWEAR.includes(headwear)) throw new Error(`unknown headwear ${headwear}`);
  const look = driver.look || null;
  const bare = headwear === "none" && Boolean(look);
  const model = SkeletonUtils.clone(template);
  const materials = dress(model, driver, team, look);
  const root = new THREE.Group();
  root.add(model);
  const props = {};
  const weights = look ? Faces.morphWeights(look) : null;
  const wears = (name) => {
    if (HELMET.test(name)) return !bare;
    if (!BARE.test(name)) return true;
    if (!bare) return false;
    if (name.startsWith("hair_")) return name === `hair_${look.hair.style}`;
    if (name.startsWith("beard_")) return name === `beard_${look.facialHair}`;
    return true;
  };
  model.traverse((node) => {
    if (node.name === "trophy" || node.name === "bottle") props[node.name] = node;
    // A skinned body's bounds move with its pose; never cull it by its rest pose.
    if (node.isSkinnedMesh) node.frustumCulled = false;
    if (node.isMesh) {
      const part = partName(node);
      node.visible = wears(part);
      // Bareheaded, the neck above the collar is the head's own skin.
      if (part === "body" && node.material.name === "balaclava") node.visible = !bare;
      if (weights && node.morphTargetDictionary) {
        Object.entries(node.morphTargetDictionary).forEach(([k, i]) => { node.morphTargetInfluences[i] = weights[k] || 0; });
      }
    }
  });
  if (bare) {
    const shown = [];
    model.traverse((n) => { if (n.isMesh && n.visible && n.geometry.attributes._bind) shown.push(n); });
    followHead(model, weights, shown);
  }
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  clips.forEach((clip) => { actions[clip.name] = mixer.clipAction(clip); });
  let current = null;

  function play(name, fade = 0.35) {
    const next = actions[name];
    if (!next || current === name) return;
    Object.entries(props).forEach(([propName, node]) => { node.visible = PROP_FOR[name] === propName; });
    next.reset().setEffectiveWeight(1).play();
    if (current && actions[current] && fade > 0) actions[current].crossFadeTo(next, fade, false);
    else if (current && actions[current]) actions[current].stop();
    current = name;
  }
  play("stand", 0);

  // What the face really shows, read off the figure itself (for the checks).
  function face() {
    const shown = [];
    let head = null;
    model.traverse((n) => {
      if (n.isMesh && n.visible && BARE.test(partName(n))) shown.push(partName(n));
      if (n.isMesh && n.name === "head_skin") head = n;
    });
    const hex = (name) => (materials.has(name) ? `#${materials.get(name).color.getHexString()}` : null);
    const keys = {};
    if (head && head.morphTargetDictionary) {
      Object.entries(head.morphTargetDictionary).forEach(([k, i]) => {
        if (head.morphTargetInfluences[i]) keys[k] = head.morphTargetInfluences[i];
      });
    }
    return {
      shown: [...new Set(shown)].sort(),
      hair: shown.find((n) => n.startsWith("hair_")) || null,
      beard: shown.find((n) => n.startsWith("beard_")) || null,
      skin: hex("skin"),
      hairColor: hex("hair"),
      eyes: hex("eye_iris"),
      stubble: materials.has("skin") && materials.get("skin").userData.uniforms ? materials.get("skin").userData.uniforms.stubble.value : null,
      keys,
    };
  }

  return {
    root,
    model,
    play,
    pose: () => current,
    update(dt) { mixer.update(dt); },
    // What this figure really wears, read off its own materials (for the checks).
    looks() {
      const helmet = materials.get("helmet");
      let helmetShown = false;
      model.traverse((n) => { if (n.isMesh && n.name === "helmet") helmetShown = n.visible; });
      return {
        driverId: driver.id,
        headwear: bare ? "none" : "helmet",
        suit: materials.has("suit") ? `#${materials.get("suit").color.getHexString()}` : null,
        trim: materials.has("suit_trim") ? `#${materials.get("suit_trim").color.getHexString()}` : null,
        helmetTexture: helmet && helmet.map ? helmet.map.uuid : null,
        helmetShown,
        face: face(),
        pose: current,
        props: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.visible])),
      };
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      root.removeFromParent();
      // The helmet's texture is shared with the car; only the clones' own materials go.
      materials.forEach((m) => m.dispose());
      // And the positions of the bound parts it shows, its own.
      // (Stripped to that first: the rest of it is shared with every figure.)
      model.traverse((n) => {
        const own = n.userData.ownGeometry;
        if (!own) return;
        Object.keys(own.attributes).forEach((k) => { if (k !== "position") own.deleteAttribute(k); });
        own.setIndex(null);
        own.dispose();
      });
    },
  };
}
