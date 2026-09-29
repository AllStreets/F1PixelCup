// Shared helpers and textures for the 3D renderer.
//
// Ground surfaces are photographic CC0 textures from Poly Haven
// (assets/textures, see assets/textures/CREDITS.md). Everything with text or a
// pattern on it -- kerbs, adverts, crowds -- is painted on a canvas at load.

import * as THREE from "three";

let maxAnisotropy = 8;
export function setAnisotropy(value) {
  maxAnisotropy = value;
}

export function color(hex, fallback = "#808080") {
  return new THREE.Color(typeof hex === "string" && hex[0] === "#" ? hex : fallback);
}

export function luminance(hex) {
  const c = color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function canvasTexture(width, height, paint, { repeat = true, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d"), width, height);
  const tex = new THREE.CanvasTexture(c);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

const imageLoader = new THREE.ImageLoader();
const photoCache = new Map();

// A tiling photo texture. Each call returns its own texture (so callers can set
// their own repeat) sharing one image, which is attached when it arrives.
export function photo(name, repeatX = 1, repeatY = repeatX) {
  let entry = photoCache.get(name);
  if (!entry) {
    entry = { image: null, waiting: [] };
    imageLoader.load(`./assets/textures/${name}.jpg`, (image) => {
      entry.image = image;
      entry.waiting.forEach((t) => { t.image = image; t.needsUpdate = true; });
      entry.waiting.length = 0;
    });
    photoCache.set(name, entry);
  }
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.repeat.set(repeatX, repeatY);
  if (entry.image) {
    tex.image = entry.image;
    tex.needsUpdate = true;
  } else {
    entry.waiting.push(tex);
  }
  return tex;
}

export function makeKerbTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h / 2);
    g.fillStyle = "#000";
    g.fillRect(0, h / 2, w, h / 2);
  }, { srgb: false });
}

export function makeCheckerTexture() {
  const tex = canvasTexture(128, 32, (g, w, h) => {
    const cell = 8;
    for (let x = 0; x < w / cell; x += 1) {
      for (let y = 0; y < h / cell; y += 1) {
        g.fillStyle = (x + y) % 2 ? "#141414" : "#f4f4f4";
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }, { repeat: false });
  tex.rotation = Math.PI / 2;
  tex.center.set(0.5, 0.5);
  return tex;
}

export function makeSmokeTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

// Textures carrying words are marked as print (render3d.js auditPrint: no
// double-sided print may read backwards).
const asPrint = (tex) => { tex.userData.print = true; return tex; };

export function makeAdvertTexture(colours, words) {
  return asPrint(canvasTexture(512, 64, (g, w, h) => {
    const n = colours.length;
    for (let i = 0; i < n; i += 1) {
      g.fillStyle = colours[i];
      g.fillRect((i * w) / n, 0, w / n, h);
      const dark = colours[i] === "#1b1b24" || colours[i] === "#141414";
      g.fillStyle = dark ? "#f4f4f4" : "#1b1b24";
      g.font = "900 italic 34px Trebuchet MS, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(words[i % words.length], (i + 0.5) * w / n, h / 2 + 2);
    }
  }));
}

export function makeBillboardTexture(accent, seed) {
  const rand = seeded(seed);
  const words = ["F1", "PIXEL", "CUP", "SPEED", "GRID", "APEX", "DRS", "POLE"];
  return asPrint(canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = accent;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.78)";
    g.font = "900 italic 76px Trebuchet MS, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`${words[Math.floor(rand() * words.length)]} ${words[Math.floor(rand() * words.length)]}`, w / 2, h / 2 + 4);
  }, { repeat: false }));
}

export function makeCrowdTexture(seed) {
  const tex = canvasTexture(256, 32, (g, w, h) => {
    const r = seeded(seed);
    g.fillStyle = "#333";
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k += 1) {
      g.fillStyle = `hsl(${Math.floor(r() * 360)}, 60%, ${40 + r() * 40}%)`;
      g.fillRect(r() * w, r() * h, 2, 3);
    }
  });
  tex.repeat.set(4, 1);
  return tex;
}

export function makeFenceTexture() {
  const tex = canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(200,205,210,0.9)";
    g.lineWidth = 2;
    for (let i = -w; i < w * 2; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
    }
  });
  return tex;
}

// Standard material with a procedural window grid painted in world space, so
// any box of any size gets correctly sized floors and windows without UVs.
// At night a random share of the windows glow.
export function buildingMaterial({ night = false, glass = "#6f8fae", frame = null, litShare = 0.45 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
  mat.userData.night = night;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlass = { value: color(glass) };
    shader.uniforms.uNight = { value: night ? 1 : 0 };
    shader.uniforms.uLit = { value: litShare };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;")
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);
        #ifdef USE_INSTANCING
          wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #endif
        vWPos = wp.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vWPos; varying vec3 vWNormal;
        uniform vec3 uGlass; uniform float uNight; uniform float uLit;
        float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float windowMask = 0.0;
        float lit = 0.0;
        if (abs(vWNormal.y) < 0.5) {
          float along = abs(vWNormal.x) > abs(vWNormal.z) ? vWPos.z : vWPos.x;
          vec2 cell = vec2(along / 7.0, (vWPos.y - 3.0) / 8.0);
          vec2 f = fract(cell);
          windowMask = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.8) * step(0.0, vWPos.y - 5.0);
          lit = step(1.0 - uLit, hash21(floor(cell) + floor(vWPos.xz / 97.0)));
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlass * (1.0 - 0.5 * uNight), windowMask * 0.85);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * windowMask * lit * uNight * 0.75;`);
  };
  mat.customProgramCacheKey = () => `bld-${night}-${glass}-${litShare}`;
  return mat;
}
