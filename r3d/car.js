// The F1 car: one Blender model (assets/f1_car.glb) dressed per team.
//
// The model's materials are named by role. livery_body gets a team-specific
// paint scheme computed in the shader from the car's own coordinates (metres,
// x forward, y up, z across), so there are no UVs or texture sheets to keep in
// sync with the mesh: a colour split along the lower flank, a fade from nose to
// tail, a pinstripe down the sidepods, a painted nose tip. Race numbers are
// small decals on the nose and the engine-cover fin.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { color, canvasTexture } from "./textures.js";

export const CAR_SCALE = 6;

// Loosely after the 2025 cars. Every zone is optional.
//  lower:  colour below height y (the floor-side of the tub and pods)
//  fade:   blend to colour from x=from to x=to along the car
//  stripe: a band at height y, thickness h, on the flanks only
//  nose:   colour forward of x
//  top:    colour on the upper surfaces above height y (engine cover spine)
const LIVERIES = {
  redBull: {
    base: "#1a2556", lower: { color: "#0e1433", y: 0.24 },
    stripe: { color: "#dc0000", y: 0.37, h: 0.07 }, nose: { color: "#ffcc00", x: 2.62 },
    trim: "#ffcc00",
  },
  ferrari: {
    base: "#d40000", lower: { color: "#151515", y: 0.2 },
    stripe: { color: "#ffffff", y: 0.43, h: 0.03 }, top: { color: "#e80e0e", y: 0.8 },
    trim: "#ffe000",
  },
  mclaren: {
    base: "#ff7a00", lower: { color: "#1b1b1f", y: 0.33 },
    stripe: { color: "#1b1b1f", y: 0.58, h: 0.05 }, nose: { color: "#1b1b1f", x: 2.72 },
    trim: "#1b1b1f",
  },
  mercedes: {
    base: "#c7cbd1", fade: { color: "#121214", from: -0.1, to: -1.3 },
    lower: { color: "#121214", y: 0.27 }, stripe: { color: "#00d2be", y: 0.33, h: 0.04 },
    trim: "#00d2be",
  },
  astonMartin: {
    base: "#00574b", stripe: { color: "#cedc00", y: 0.34, h: 0.06 },
    nose: { color: "#cedc00", x: 2.66 }, lower: { color: "#003a32", y: 0.2 },
    trim: "#cedc00",
  },
  alpine: {
    base: "#0a6cf0", fade: { color: "#ff78b8", from: -0.3, to: -1.7 },
    lower: { color: "#0b0b16", y: 0.2 }, trim: "#ff78b8",
  },
  williams: {
    base: "#0b1f5c", fade: { color: "#1f6ee8", from: -0.6, to: 1.6 },
    stripe: { color: "#ffffff", y: 0.38, h: 0.03 }, trim: "#ffffff",
  },
  haas: {
    base: "#f1f1f1", lower: { color: "#161616", y: 0.34 },
    stripe: { color: "#e8002d", y: 0.37, h: 0.035 }, nose: { color: "#161616", x: 2.7 },
    trim: "#e8002d",
  },
  racingBulls: {
    base: "#f3f3f3", fade: { color: "#1531c8", from: 0.4, to: -1.1 },
    stripe: { color: "#e8002d", y: 0.4, h: 0.03 }, trim: "#1531c8",
  },
  sauber: {
    base: "#151515", lower: { color: "#2bd90f", y: 0.19 },
    stripe: { color: "#39ff14", y: 0.35, h: 0.03 }, nose: { color: "#39ff14", x: 2.78 },
    trim: "#39ff14",
  },
};

function liveryFor(kart) {
  return LIVERIES[kart.id] || { base: kart.body, trim: kart.trim };
}

function paintedBody(material, livery) {
  const mat = material.clone();
  mat.color = color(livery.base);
  const z = (zone, key) => (zone ? zone[key] : 0);
  const uniforms = {
    uLowerC: { value: color(livery.lower?.color, "#000000") },
    uLowerY: { value: livery.lower ? livery.lower.y : -10 },
    uFadeC: { value: color(livery.fade?.color, "#000000") },
    uFade: { value: new THREE.Vector3(z(livery.fade, "from"), z(livery.fade, "to") || 1, livery.fade ? 1 : 0) },
    uStripeC: { value: color(livery.stripe?.color, "#000000") },
    uStripe: { value: new THREE.Vector3(z(livery.stripe, "y"), z(livery.stripe, "h"), livery.stripe ? 1 : 0) },
    uNoseC: { value: color(livery.nose?.color, "#000000") },
    uNoseX: { value: livery.nose ? livery.nose.x : 99 },
    uTopC: { value: color(livery.top?.color, "#000000") },
    uTopY: { value: livery.top ? livery.top.y : 99 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCarPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCarPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vCarPos;
        uniform vec3 uLowerC; uniform float uLowerY;
        uniform vec3 uFadeC; uniform vec3 uFade;
        uniform vec3 uStripeC; uniform vec3 uStripe;
        uniform vec3 uNoseC; uniform float uNoseX;
        uniform vec3 uTopC; uniform float uTopY;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 paint = diffuseColor.rgb;
        if (uFade.z > 0.5) {
          float t = smoothstep(uFade.x, uFade.y, vCarPos.x);
          paint = mix(paint, uFadeC, t);
        }
        paint = mix(paint, uTopC, smoothstep(uTopY - 0.01, uTopY + 0.01, vCarPos.y));
        paint = mix(paint, uLowerC, 1.0 - smoothstep(uLowerY - 0.01, uLowerY + 0.01, vCarPos.y));
        if (uStripe.z > 0.5) {
          float band = 1.0 - smoothstep(uStripe.y * 0.5 - 0.006, uStripe.y * 0.5 + 0.006, abs(vCarPos.y - uStripe.x));
          float flank = smoothstep(0.2, 0.26, abs(vCarPos.z)) * step(vCarPos.x, 0.6) * step(-1.7, vCarPos.x);
          paint = mix(paint, uStripeC, band * flank);
        }
        paint = mix(paint, uNoseC, smoothstep(uNoseX - 0.01, uNoseX + 0.01, vCarPos.x));
        diffuseColor.rgb = paint;`);
  };
  mat.customProgramCacheKey = () => "livery";
  return mat;
}

function numberTexture(number, ink) {
  return canvasTexture(128, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = "900 italic 78px Trebuchet MS, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.strokeText(String(number), w / 2, h / 2 + 4);
    g.fillStyle = ink;
    g.fillText(String(number), w / 2, h / 2 + 4);
  }, { repeat: false });
}

let template = null;
const materialCache = new Map();

// ---------------------------------------------------------------------------
// Helmets: each driver's design (driver.helmet in game-data.js; see
// docs/superpowers/specs/2026-09-29-helmets-design.md) painted onto the
// helmet's equirectangular UVs: x round the head with the front in the
// middle, y down from the crown. Original art in the driver's colours.
// ---------------------------------------------------------------------------

// The design is drawn on a 256 x 128 plan and painted at twice that, 512 x 256,
// so close-ups stay crisp.
const HELMET_W = 256;
const HELMET_H = 128;
const HELMET_RES = 2;
// Where the checks read the design back (plan coordinates): the crown near the
// top, the base low on the side and the visor at the front, which every motif
// keeps; and a point on each motif's stripe.
export const HELMET_SAMPLES = {
  crown: [64, 6], base: [64, 100], visor: [128, 57],
  stripe: { band: [64, 44], crown: [64, 31], split: [53, 77], flash: [58, 58], tricolore: [64, 40] },
};
const helmetTextures = new Map();
const helmetKey = (driver) => driver.id || driver.name;

// A rounded rectangle, drawn by hand (canvas roundRect is too new for some
// browsers that run the game).
function roundedRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function paintHelmet(g, h) {
  const W = HELMET_W;
  const H = HELMET_H;
  const front = W / 2;
  g.fillStyle = h.base;
  g.fillRect(0, 0, W, H);
  // Both sides of the head: x measured from the front, left and right.
  const sides = (draw) => [-1, 1].forEach((s) => draw((dx) => front + s * dx));
  const poly = (fill, pts) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  };
  switch (h.motif) {
    case "band":
      // A crown cap, a wide band at visor height with a pinstripe above it and
      // a thinner one below.
      g.fillStyle = h.crown;
      g.fillRect(0, 0, W, 22);
      g.fillRect(0, 50, W, 22);
      g.fillStyle = h.stripe;
      g.fillRect(0, 42, W, 5);
      g.fillRect(0, 75, W, 3);
      break;
    case "crown":
      // A cap on top, the base colour carrying the rest of the helmet.
      g.fillStyle = h.crown;
      g.fillRect(0, 0, W, 28);
      g.fillStyle = h.stripe;
      g.fillRect(0, 28, W, 6);
      break;
    case "split":
      // Behind a diagonal from the top of the visor to the back of the neck,
      // the crown colour; the diagonal itself in the stripe colour.
      g.fillStyle = h.crown;
      g.fillRect(0, 0, W, 26);
      sides((at) => poly(h.crown, [[at(44), 26], [at(58), 26], [at(106), 128], [at(128), 128], [at(128), 26]]));
      sides((at) => poly(h.stripe, [[at(44), 26], [at(58), 26], [at(106), 128], [at(92), 128]]));
      break;
    case "flash":
      // A crown cap, then the flash.
      g.fillStyle = h.crown;
      g.fillRect(0, 0, W, 20);
      // A swept flash from the visor back to the neck, on each side.
      sides((at) => poly(h.stripe, [[at(14), 46], [at(40), 36], [at(118), 66], [at(122), 84], [at(90), 74], [at(30), 58]]));
      break;
    case "tricolore":
      g.fillStyle = h.crown;
      g.fillRect(0, 0, W, 20);
      g.fillStyle = h.base;
      g.fillRect(0, 20, W, 14);
      g.fillStyle = h.stripe;
      g.fillRect(0, 34, W, 14);
      break;
    default:
      break;
  }
  // The visor: a band across the front at eye level, cutting through the
  // design as a real one does, with a thin rubber seal and a sky highlight.
  const vx = front - 38;
  g.fillStyle = "#0b0b0e";
  roundedRect(g, vx - 2, 48, 80, 17, 7);
  g.fill();
  g.fillStyle = h.visor;
  roundedRect(g, vx, 50, 76, 13, 6);
  g.fill();
  g.fillStyle = "rgba(255, 255, 255, 0.2)";
  g.fillRect(vx + 10, 51.5, 56, 2);
  // A thin dark trim round the neck.
  g.fillStyle = "rgba(0, 0, 0, 0.35)";
  g.fillRect(0, H - 4, W, 4);
}

function helmetTexture(driver) {
  const key = helmetKey(driver);
  if (!helmetTextures.has(key)) {
    const h = driver.helmet || { base: driver.color || "#ffffff", crown: driver.accent || "#ffffff", stripe: "#111111", visor: "#10141c", motif: "crown" };
    const tex = canvasTexture(HELMET_W * HELMET_RES, HELMET_H * HELMET_RES, (g) => {
      g.scale(HELMET_RES, HELMET_RES);
      paintHelmet(g, h);
    }, { repeat: false });
    // The model's UVs run v = 0 at the crown, which is the canvas's top row as drawn.
    tex.flipY = false;
    helmetTextures.set(key, tex);
  }
  return helmetTextures.get(key);
}

// What a driver's helmet is painted with, read back from the canvas (for the checks).
export function helmetInfo(driver) {
  const tex = helmetTexture(driver);
  const c = tex.image;
  // One read of the whole canvas; samples are taken from it.
  const pixels = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const at = ([x, y]) => {
    const i = (Math.round(y * HELMET_RES) * c.width + Math.round(x * HELMET_RES)) * 4;
    return `#${[pixels[i], pixels[i + 1], pixels[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  // A fingerprint of the whole design, so two helmets can be told apart.
  let hash = 0;
  for (let i = 0; i < pixels.length; i += 16) hash = (hash * 31 + pixels[i] + pixels[i + 1] * 7 + pixels[i + 2] * 13) >>> 0;
  const motif = driver.helmet ? driver.helmet.motif : "crown";
  return {
    painted: true, textureId: tex.uuid, hash,
    crown: at(HELMET_SAMPLES.crown), base: at(HELMET_SAMPLES.base), visor: at(HELMET_SAMPLES.visor),
    stripe: at(HELMET_SAMPLES.stripe[motif]),
  };
}

export function loadCar(onReady, onError) {
  const progress = () => { if (window.Render3DBoot) window.Render3DBoot.progressAt = performance.now(); };
  new GLTFLoader().load("./assets/f1_car.glb", (gltf) => {
    template = gltf.scene;
    template.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    onReady();
  }, progress, onError);
}

function materialsFor(kart, driver) {
  const key = `${kart.id}|${driver.id || driver.name}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const livery = liveryFor(kart);
  const mats = new Map();
  template.traverse((node) => {
    if (!node.isMesh) return;
    (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => {
      if (mats.has(m.name)) return;
      let out;
      if (m.name === "livery_body") out = paintedBody(m, livery);
      else {
        out = m.clone();
        if (m.name === "livery_trim") out.color = color(livery.trim || kart.trim);
        if (m.name === "helmet") {
          out.map = helmetTexture(driver);
          out.color = new THREE.Color(0xffffff);
          out.roughness = 0.22;
          out.metalness = 0.12;
        }
      }
      mats.set(m.name, out);
    });
  });
  const lum = color(livery.base).getHSL({}).l;
  mats.set("__number", new THREE.MeshStandardMaterial({
    map: numberTexture(driver.number ?? "", lum > 0.6 ? "#111111" : "#ffffff"),
    transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  materialCache.set(key, mats);
  return mats;
}

function decal(material, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

export function buildCar(kart, driver) {
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const model = template.clone(true);
  const mats = materialsFor(kart, driver);
  const wheels = {};
  let flap = null;
  model.traverse((node) => {
    if (node.isMesh) {
      node.material = Array.isArray(node.material)
        ? node.material.map((m) => mats.get(m.name) || m)
        : mats.get(node.material.name) || node.material;
    }
    if (/^wheel_(FL|FR|RL|RR)$/.test(node.name)) wheels[node.name.slice(6)] = node;
    if (node.name === "drs_flap") flap = node;
  });
  ["FL", "FR"].forEach((id) => {
    const wheel = wheels[id];
    if (!wheel) return;
    const pivot = new THREE.Group();
    pivot.position.copy(wheel.position);
    wheel.parent.add(pivot);
    wheel.position.set(0, 0, 0);
    pivot.add(wheel);
    wheels[`${id}pivot`] = pivot;
  });

  // Race numbers: on the nose, and both sides of the engine-cover fin.
  const numberMat = mats.get("__number");
  const nose = decal(numberMat, 0.3, 0.22);
  nose.position.set(2.08, 0.458, 0);
  nose.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  nose.rotateX(-0.22);
  model.add(nose);
  [-1, 1].forEach((side) => {
    const fin = decal(numberMat, 0.34, 0.26);
    fin.position.set(-1.55, 0.78, side * 0.013);
    fin.rotation.y = side > 0 ? 0 : Math.PI;
    model.add(fin);
  });

  model.scale.setScalar(CAR_SCALE);
  root.add(model);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.set(-2.6 * CAR_SCALE, 0.36 * CAR_SCALE, 0);
  glow.visible = false;
  root.add(glow);

  // Which painted helmet this car really wears: read off its own material.
  let worn = null;
  model.traverse((node) => {
    if (node.isMesh && !worn) (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => { if (m.name === "helmet" && m.map) worn = m.map.uuid; });
  });
  return { root, model, wheels, glow, flap, spin: 0, flapOpen: 0, helmet: { driverId: helmetKey(driver), textureId: worn } };
}
