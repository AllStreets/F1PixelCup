// The race driver figure (assets/driver.glb, tools/blender/build_driver.py),
// dressed per driver: the suit in the team's colours, the helmet with the
// driver's own painted design (the same texture the car's helmet wears).
// See docs/superpowers/specs/2026-10-01-driver-v2-design.md.
//
// The body is skinned, so every figure is a SkeletonUtils clone with its own
// skeleton, and an AnimationMixer plays its five poses: stand, wave, arms_up,
// trophy and spray. A pose shows only the prop it uses.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { color } from "./textures.js";
import { liveryFor, helmetTexture } from "./car.js";

export const POSES = ["stand", "wave", "arms_up", "trophy", "spray"];
const PROP_FOR = { trophy: "trophy", spray: "bottle" };

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

function dress(model, driver, team) {
  const { suit, trim } = suitColours(team);
  const made = new Map();
  const dressed = (m) => {
    if (made.has(m.name)) return made.get(m.name);
    const out = m.clone();
    if (m.name === "suit") out.color = color(suit);
    if (m.name === "suit_trim") out.color = color(trim);
    if (m.name === "helmet") {
      out.map = helmetTexture(driver);
      out.color = new THREE.Color(0xffffff);
      out.roughness = 0.22;
      out.metalness = 0.12;
    }
    made.set(m.name, out);
    return out;
  };
  model.traverse((node) => {
    if (node.isMesh) node.material = Array.isArray(node.material) ? node.material.map(dressed) : dressed(node.material);
  });
  return made;
}

// A dressed figure: { root, play(pose), update(dt), looks(), dispose() }.
export function buildDriver(driver, team) {
  if (!template) throw new Error("buildDriver before loadDriver");
  const model = SkeletonUtils.clone(template);
  const materials = dress(model, driver, team);
  const root = new THREE.Group();
  root.add(model);
  const props = {};
  model.traverse((node) => {
    if (node.name === "trophy" || node.name === "bottle") props[node.name] = node;
    // A skinned body's bounds move with its pose; never cull it by its rest pose.
    if (node.isSkinnedMesh) node.frustumCulled = false;
  });
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

  return {
    root,
    model,
    play,
    pose: () => current,
    update(dt) { mixer.update(dt); },
    // What this figure really wears, read off its own materials (for the checks).
    looks() {
      const helmet = materials.get("helmet");
      return {
        driverId: driver.id,
        suit: materials.has("suit") ? `#${materials.get("suit").color.getHexString()}` : null,
        trim: materials.has("suit_trim") ? `#${materials.get("suit_trim").color.getHexString()}` : null,
        helmetTexture: helmet && helmet.map ? helmet.map.uuid : null,
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
    },
  };
}
