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
const BARE = /^(head_skin|eye_[LR]|lashes|brows|hair|hair_bun|beard)$/;
const HELMET = /^(helmet|helmet_spoiler)$/;
// The facial hair that grows strands (stubble is shaded on the skin).
const SHELLED_BEARDS = ["short_beard", "full_beard", "moustache"];
// How much stubble shadow each kind of facial hair leaves on the skin: even
// clean shaven, a faint one; under a beard, the skin shows a little through.
const STUBBLE = { none: 0.35, stubble: 0.8, short_beard: 0.7, full_beard: 0.7, moustache: 0.55 };

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
        // (The lashes and brows are strands on cards and patches: as solid
        // shapes their shadows would only smudge the eyes.)
        node.castShadow = !/^(lashes|brows)$/.test(node.name);
        node.receiveShadow = true;
        // The lashes' strands, clamped: their tips' row must never wrap
        // round to the roots'. (Shared by every figure.)
        const m = node.material;
        if (m.name === "lashes" && m.map) {
          m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping;
          m.map.needsUpdate = true;
        }
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
// eye sockets) shade the lips, a flush, the sockets and the stubble; fine
// pores and mottling are drawn in; a soft wrap of light at the shadow's
// edge, redder than the rest, stands in for light travelling through skin.
const WRAP_FROM = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
const NOISE = `
  // (A hash without sine: steady at the large lattice values fine detail
  // reaches, where sin() loses its precision and speckles.)
  float faceHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
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
    roughness: 0.48,
    specularIntensity: 0.55,
  });
  const uniforms = {
    stubble: { value: STUBBLE[look.facialHair] },
    stubbleColor: { value: color(look.beardColor) },
    hairColor: { value: color(look.hair.color) },
    // Under a buzz cut the scalp shows its roots; elsewhere only where the
    // hair thins out at its edge.
    scalpAmount: { value: look.hair.style === "buzz" ? 0.75 : 0.45 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 _masks;\nattribute float _scalp;\nattribute float _ao;\nvarying vec4 vMasks;\nvarying float vScalp;\nvarying float vAO;\nvarying vec3 vSkinPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMasks = _masks;\nvScalp = _scalp;\nvAO = _ao;\nvSkinPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float stubble;
        uniform vec3 stubbleColor;
        uniform vec3 hairColor;
        uniform float scalpAmount;
        varying vec4 vMasks;
        varying float vScalp;
        varying float vAO;
        varying vec3 vSkinPos;
        ${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          // Mottling, a centimetre or so across, and finer.
          c *= 0.95 + 0.06 * faceNoise(vSkinPos * 90.0) + 0.04 * faceNoise(vSkinPos * 420.0);
          // Warmth: cheeks, nose and ears a little redder.
          c = mix(c, c * vec3(1.06, 0.88, 0.86), vMasks.b * 0.45);
          // The lips: darker and redder, a soft edge.
          c = mix(c, c * vec3(0.82, 0.56, 0.54), smoothstep(0.0, 0.7, vMasks.r));
          // The sockets: a little darker, a little cooler.
          c = mix(c, c * vec3(0.8, 0.76, 0.8), vMasks.a * 0.55);
          // Stubble, or the shadow of a close shave: hairs about half a
          // millimetre apart, faded to their average where smaller than a pixel.
          vec3 sp = vSkinPos * 1900.0;
          float fw = length(fwidth(sp));
          float dots = mix(smoothstep(0.45, 0.8, faceNoise(sp)), 0.4, smoothstep(0.4, 1.2, fw));
          float area = vMasks.g * stubble;
          c = mix(c, mix(c * 0.8, stubbleColor, 0.75), area * (0.3 + 0.7 * dots));
          // The scalp: hair roots at the hairline's soft edge.
          float roots = mix(smoothstep(0.35, 0.75, faceNoise(sp * 1.15)), 0.5, smoothstep(0.4, 1.2, fw));
          c = mix(c, hairColor, vScalp * scalpAmount * (0.4 + 0.6 * roots));
          // In the folds and hollows less light reaches the skin (baked),
          // and what does is redder, having passed through more skin.
          c *= mix(vec3(0.42, 0.34, 0.33), vec3(1.0), smoothstep(0.1, 0.95, vAO));
          diffuseColor.rgb = c;
        }`)
      .replace("#include <aomap_fragment>", `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vAO;
        reflectedLight.indirectSpecular *= vAO * vAO;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        // Glossier on the lips and down the nose, drier on the cheeks.
        roughnessFactor = mix(roughnessFactor, 0.36, smoothstep(0.0, 0.6, vMasks.r));
        roughnessFactor *= 0.9 + 0.2 * faceNoise(vSkinPos * 300.0);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          // Pores: a fine bump a few hundredths of a millimetre deep, faded
          // out where it is smaller than a pixel.
          float hgt = faceNoise(vSkinPos * 1400.0) + 0.5 * faceNoise(vSkinPos * 3100.0);
          float fade = 1.0 - smoothstep(0.3, 0.9, length(fwidth(vSkinPos * 1400.0)));
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
          normal = normalize(abs(det) * normal - grad * 0.00003 * fade);
        }`)
      .replace("#include <lights_physical_pars_fragment>", THREE.ShaderChunk.lights_physical_pars_fragment.replace(WRAP_FROM, `{
          vec3 wrapW = vec3(0.34, 0.14, 0.09);
          float wrapNL = dot(geometryNormal, directLight.direction);
          vec3 wrapped = clamp((vec3(wrapNL) + wrapW) / (1.0 + wrapW), 0.0, 1.0);
          reflectedLight.directDiffuse += directLight.color * wrapped * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
        }`));
  };
  m.customProgramCacheKey = () => "driver-skin";
  return m;
}

// Hair, beards and brows: fur shells. Each shell is drawn LAYERS times, the
// layers stacked from the skin out to the hair's outer surface (_TIP), and
// each layer keeps fewer strands than the one under it: strands drawn along
// the way the hair lies (_FLOW), in clumps, thinning to nothing at the
// hair's edge (_HAIR: the edge, and the strand coordinates). Inner layers
// are darker (the hair shades itself); the two highlights of real hair
// (Kajiya-Kay: a white one, and a second tinted by the hair) run across the
// strands. Strands are curly or braided by the style.
//
// Per kind: the layers drawn; how solid the hair is at the skin (a head of
// hair hides it, a beard nearly, a brow's hairs lie apart); how dark it is
// deep down; how much it shines; the strands' size (across, along: about a
// third of a millimetre by a centimetre or so for hair; a beard's coarser
// and shorter, a brow's finer) and the clumps'.
const HAIR_KINDS = {
  hair: { layers: 22, solid: 1, deep: 0.32, shine: 1, strands: [2800, 70], clumps: [230, 16] },
  beard: { layers: 12, solid: 0.4, deep: 0.55, shine: 0.5, strands: [2200, 160], clumps: [260, 30] },
  brows: { layers: 6, solid: 0.25, deep: 0.7, shine: 0.3, strands: [4500, 110], clumps: [370, 26] },
};
const LAYERS = Object.fromEntries(Object.entries(HAIR_KINDS).map(([k, v]) => [k, v.layers]));
const PATTERN = { straight: 0, curly: 1, braids: 2 };
function hairMaterial(name, hex, pattern = "straight") {
  const kind = HAIR_KINDS[name];
  // A faint sheen of the hair's own colour off the room, not a grey haze.
  const m = new THREE.MeshPhysicalMaterial({ name, color: color(hex), roughness: 0.75, metalness: 0, specularIntensity: 0.22, specularColor: color(hex).lerp(new THREE.Color(1, 1, 1), 0.3) });
  m.alphaToCoverage = true;
  m.side = THREE.DoubleSide;
  const uniforms = {
    hairTint: { value: color(hex) },
    hairLayers: { value: kind.layers },
    hairPattern: { value: PATTERN[pattern] },
    hairSolid: { value: kind.solid },
    hairDeep: { value: kind.deep },
    hairShine: { value: kind.shine },
    strandScale: { value: new THREE.Vector2(...kind.strands) },
    clumpScale: { value: new THREE.Vector2(...kind.clumps) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute vec3 _tip;
        attribute vec3 _flow;
        attribute vec3 _hair;
        uniform float hairLayers;
        varying float vLayer;
        varying vec3 vHair;
        varying vec3 vFlowV;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        // (The build's vectors are in Blender's axes, Z up; ours are Y up.)
        vec3 tipY = vec3(_tip.x, _tip.z, -_tip.y);
        vec3 flowY = vec3(_flow.x, _flow.z, -_flow.y);
        float h = hairLayers > 1.0 ? float(gl_InstanceID) / (hairLayers - 1.0) : 0.0;
        // A strand rises off the skin and bends over: the lean along the
        // skin grows faster toward its tip.
        vec3 rise = dot(tipY, objectNormal) * objectNormal;
        transformed += rise * h + (tipY - rise) * h * h;
        vLayer = h;
        vHair = _hair;
        vFlowV = normalize((modelViewMatrix * vec4(flowY, 0.0)).xyz);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform vec3 hairTint;
        uniform float hairPattern;
        uniform float hairSolid;
        uniform float hairShine;
        uniform float hairDeep;
        uniform vec2 strandScale;
        uniform vec2 clumpScale;
        varying float vLayer;
        varying vec3 vHair;
        varying vec3 vFlowV;
        ${NOISE}
        float hairStrands(vec2 st, out float clump) {
          vec2 s = st * strandScale;
          if (hairPattern > 1.5) {
            // Braids: rows about a centimetre across, each a chain of
            // crossing locks.
            float row = st.x * 95.0;
            float across = fract(row) - 0.5;
            float chain = fract(st.y * 140.0 + abs(across) * 1.8 + step(0.0, across) * 0.5);
            clump = 1.0 - smoothstep(0.32, 0.5, abs(across));
            float lock = smoothstep(0.0, 0.25, chain) * (1.0 - smoothstep(0.75, 1.0, chain));
            return clamp(lock * 0.8 + 0.25 * faceNoise(vec3(s, 1.0)), 0.0, 1.0) * clump;
          }
          if (hairPattern > 0.5) {
            // Curls: tight coils, a couple of millimetres round.
            vec2 c = st * 650.0;
            float coil = faceNoise(vec3(c, 0.0)) * 0.6 + faceNoise(vec3(c * 2.3, 4.0)) * 0.4;
            clump = faceNoise(vec3(st * 160.0, 7.0));
            return coil;
          }
          float n = faceNoise(vec3(s, 0.0)) * 0.6 + faceNoise(vec3(s * vec2(2.3, 1.7) + 7.0, 3.0)) * 0.4;
          clump = faceNoise(vec3(st * clumpScale, 9.0));
          return n;
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float hairClump;
        float strand = hairStrands(vHair.yz, hairClump);
        // Smaller than a pixel, the strands blur to their average. (Not to a
        // part-covered layer: the layers' coverage would not add up.)
        float blur = smoothstep(0.9, 2.2, length(fwidth(vHair.yz * strandScale)));
        strand = mix(strand, 0.5, blur);
        // Fewer strands reach each layer out; clumps reach furthest. At the
        // hair's edge they thin out to the skin.
        float density = smoothstep(0.0, 1.0, vHair.x);
        float need = pow(vLayer, 1.6) * (0.72 - 0.36 * hairClump) + (1.0 - density) * 0.85 + (1.0 - hairSolid) * 0.45;
        // (Blurred, the step from strands to none is a soft band, so a far
        // hairline or brow fades out rather than stops.)
        float aa = mix(max(fwidth(strand), 0.02), 0.12, blur);
        diffuseColor.a = smoothstep(need - aa, need + aa, strand);
        if (vHair.x <= 0.0 || diffuseColor.a < 0.02) discard;
        // Self-shadowed down in the hair; each strand a slightly different tone.
        diffuseColor.rgb *= mix(hairDeep, 1.0, pow(vLayer, 0.7)) * mix(0.8, 1.15, faceNoise(vec3(vHair.yz * strandScale * 0.5, 2.0)));`)
      .replace("#include <lights_physical_pars_fragment>", THREE.ShaderChunk.lights_physical_pars_fragment.replace(WRAP_FROM, `{
          // Light scatters through hair: a soft wrap in place of Lambert.
          float wrapNL = dot(geometryNormal, directLight.direction);
          float lit = clamp((wrapNL + 0.45) / 1.45, 0.0, 1.0);
          reflectedLight.directDiffuse += directLight.color * lit * BRDF_Lambert( material.diffuseContribution );
          vec3 T = normalize(vFlowV);
          vec3 Hv = normalize(directLight.direction + geometryViewDir);
          float t1 = dot(normalize(T + geometryNormal * 0.12), Hv);
          float t2 = dot(normalize(T - geometryNormal * 0.2), Hv);
          float s1 = pow(sqrt(max(0.0, 1.0 - t1 * t1)), 90.0);
          float s2 = pow(sqrt(max(0.0, 1.0 - t2 * t2)), 24.0);
          float shadow = smoothstep(-0.1, 0.4, wrapNL);
          reflectedLight.directSpecular += directLight.color * shadow * (s1 * 0.045 + s2 * 0.14 * hairTint) * (0.4 + 0.6 * vLayer) * hairShine;
        }`));
  };
  m.customProgramCacheKey = () => "driver-hair";
  return m;
}

// The eyeball, shaded where the lids hang over it (_AO, baked).
function shadedByLids(m) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float _ao;\nvarying float vAO;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAO = _ao;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vAO;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.15, 0.85, vAO));")
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vAO;\nreflectedLight.indirectSpecular *= vAO;");
  };
  m.customProgramCacheKey = () => `driver-eye-${m.name}`;
  return m;
}

// The lashes: a strip of fine strands, alpha to coverage.
function lashMaterial(m, hex) {
  m.color = color(hex);
  m.transparent = false;
  m.alphaTest = 0.05;
  m.alphaToCoverage = true;
  m.side = THREE.DoubleSide;
  m.roughness = 0.6;
  return m;
}

// Each figure's own copies of the parts its face reshapes: the bound parts
// (lashes, brows, hair, beard), each vertex moved as the head's triangle it
// sits on is moved by the driver's morph (_BIND, the head's _VID; _BARY its
// weights); the eyes, moved and scaled by their keys (the node's extras);
// and the strand shells drawn as their layers. Everything else of the
// geometry stays shared.
function ownGeometry(mesh, layers, variant) {
  const src = mesh.geometry;
  const geo = layers ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  // A shell shared by several styles carries each one's strands
  // (_tip_<style>, ...); this figure draws its own.
  const VARIANT = /^_(tip|flow|hair)_(.+)$/;
  Object.entries(src.attributes).forEach(([k, a]) => {
    const m = k.match(VARIANT);
    if (!m) geo.setAttribute(k, a);
    else if (m[2] === variant) geo.setAttribute(`_${m[1]}`, a);
  });
  geo.setIndex(src.index);
  src.groups.forEach((gr) => geo.addGroup(gr.start, gr.count, gr.materialIndex));
  if (layers) geo.instanceCount = layers;
  geo.userData.variant = variant || null;
  if (!src.boundingSphere) src.computeBoundingSphere();
  geo.boundingSphere = src.boundingSphere.clone();
  // The hair reaches out past its shell.
  if (layers) geo.boundingSphere.radius += 0.06;
  mesh.geometry = geo;
  mesh.userData.ownGeometry = geo;
  return geo;
}

function shapeFace(model, weights, parts, look) {
  let head = null;
  model.traverse((n) => { if (n.isMesh && n.name === "head_skin") head = n; });
  if (!head) return;
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
    const variant = { hair: look.hair.style, beard: look.facialHair }[partName(mesh)];
    const geo = ownGeometry(mesh, LAYERS[mesh.material.name] || 0, variant);
    const pos = src.attributes.position.clone();
    if (src.attributes._bind) {
      // From the head's space to this part's.
      const toPart = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).invert().multiply(head.matrixWorld));
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
    }
    const eye = mesh.parent && mesh.parent.userData.eye_keys ? mesh.parent.userData : mesh.userData.eye_keys ? mesh.userData : null;
    if (eye) {
      const d = new THREE.Vector3();
      let s = 1;
      Object.entries(eye.eye_keys).forEach(([k, [dx, dy, dz, ds]]) => {
        const w = weights[k] || 0;
        d.x += w * dx; d.y += w * dy; d.z += w * dz;
        s += w * ds;
      });
      const c = new THREE.Vector3(...eye.eye_centre);
      for (let i = 0; i < pos.count; i += 1) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(c).multiplyScalar(s).add(c).add(d);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    geo.setAttribute("position", pos);
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
      if (m.name === "eye_iris" || m.name === "eye_sclera") shadedByLids(out);
      if (m.name === "eye_cornea") {
        out.transparent = true;
        out.opacity = 0.14;
        out.roughness = 0.02;
        out.depthWrite = false;
      }
      if (m.name === "lashes") lashMaterial(out, look.brow);
      if (m.name === "hair" || m.name === "beard" || m.name === "brows") {
        out.dispose();
        const hex = { hair: look.hair.color, beard: look.beardColor, brows: look.brow }[m.name];
        const pattern = m.name === "hair" && (look.hair.style === "curly" || look.hair.style === "braids") ? look.hair.style : "straight";
        out = hairMaterial(m.name, hex, pattern);
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
    if (name === "hair_bun") return look.hair.style === "braids";
    if (name === "beard") return SHELLED_BEARDS.includes(look.facialHair);
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
    model.traverse((n) => { if (n.isMesh && n.visible && BARE.test(partName(n)) && n.name !== "head_skin") shown.push(n); });
    shapeFace(model, weights, shown, look);
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
    const drawn = {};
    let head = null;
    model.traverse((n) => {
      if (n.isMesh && n.visible && BARE.test(partName(n))) {
        shown.push(partName(n));
        // The style a shared shell really draws: the strands it was given.
        if (n.geometry.userData.variant) drawn[partName(n)] = n.geometry.userData.variant;
      }
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
      hair: drawn.hair || null,
      beard: drawn.beard || null,
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
