// Three.js renderer for the driver view.
//
// game.js still owns everything that matters to the race: physics, AI, laps,
// items, audio and the HUD. This module only draws. Each frame game.js hands it
// the current state and it poses a 3D scene to match. The 2D canvas stays on top
// as a transparent layer for the HUD, the mini map and the start lights.
//
// World mapping: the game plays on a flat (x, y) plane. Here that plane is
// (x, 0, y), with Y up. A game heading h points along (cos h, sin h), which is a
// rotation of -h about Y in Three.js.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The car model is authored in metres. Cars collide at 28 units centre to
// centre, so 6 units a metre makes a 5.6 m car about 34 units long.
const CAR_SCALE = 6;
const MAX_PARTICLES = 256;
const SAMPLE_STEP = 6;

const canvas2d = document.getElementById("game");
const shell = document.getElementById("canvas-shell");
const canvas3d = document.createElement("canvas");
canvas3d.id = "game3d";
canvas3d.setAttribute("aria-hidden", "true");
shell.insertBefore(canvas3d, canvas2d);
shell.classList.add("has-3d");

const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
// Same framing as the 2D camera: focal 340 on a 576-pixel-tall frame.
const camera = new THREE.PerspectiveCamera(2 * Math.atan(288 / 340) * 180 / Math.PI * 0.82, 16 / 9, 2, 6000);

const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260; sc.near = 10; sc.far = 1400;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

const api = {
  ready: false,
  render,
  renderGarage,
};
window.Render3D = api;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function color(hex, fallback = "#808080") {
  return new THREE.Color(typeof hex === "string" && hex[0] === "#" ? hex : fallback);
}

function luminance(hex) {
  const c = color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function canvasTexture(width, height, paint, { repeat = true, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d"), width, height);
  const tex = new THREE.CanvasTexture(c);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function speckle(g, w, h, base, amount, count, rand) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i += 1) {
    const v = (rand() - 0.5) * amount;
    const shade = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillStyle = shade;
    const s = 1 + rand() * 2;
    g.fillRect(rand() * w, rand() * h, s, s);
  }
}

// ---------------------------------------------------------------------------
// Shared textures and materials
// ---------------------------------------------------------------------------

const rand0 = seeded(7);
const asphaltTex = canvasTexture(256, 256, (g, w, h) => {
  speckle(g, w, h, "#ffffff", 0.22, 9000, rand0);
  // Faint rubbered-in racing line streaks running along the track.
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `rgba(0,0,0,${0.015 + rand0() * 0.025})`;
    g.fillRect(rand0() * w, 0, 1 + rand0() * 3, h);
  }
});

const grassTex = canvasTexture(256, 256, (g, w, h) => {
  speckle(g, w, h, "#ffffff", 0.22, 7000, rand0);
  // Mowing stripes.
  g.fillStyle = "rgba(0,0,0,0.06)";
  g.fillRect(0, 0, w / 2, h);
});

const kerbTex = canvasTexture(64, 64, (g, w, h) => {
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h / 2);
  g.fillStyle = "#000";
  g.fillRect(0, h / 2, w, h / 2);
}, { srgb: false });

const checkerTex = canvasTexture(128, 32, (g, w, h) => {
  const cell = 8;
  for (let x = 0; x < w / cell; x += 1) {
    for (let y = 0; y < h / cell; y += 1) {
      g.fillStyle = (x + y) % 2 ? "#141414" : "#f4f4f4";
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}, { repeat: false });

const smokeTex = canvasTexture(64, 64, (g, w, h) => {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}, { repeat: false });

function billboardTexture(accent, seed) {
  const rand = seeded(seed);
  const words = ["F1", "PIXEL", "CUP", "SPEED", "GRID", "APEX", "DRS", "POLE"];
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = accent;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.78)";
    g.font = "900 italic 76px Trebuchet MS, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`${words[Math.floor(rand() * words.length)]} ${words[Math.floor(rand() * words.length)]}`, w / 2, h / 2 + 4);
  }, { repeat: false });
}

// ---------------------------------------------------------------------------
// Car model
// ---------------------------------------------------------------------------

let carTemplate = null;
const liveryCache = new Map();

new GLTFLoader().load("./assets/f1_car.glb", (gltf) => {
  carTemplate = gltf.scene;
  carTemplate.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  api.ready = true;
}, undefined, (error) => {
  console.warn("3D car model failed to load; staying on the 2D renderer.", error);
});

function liveryMaterials(kart, driver) {
  const key = `${kart.id}|${driver.color}`;
  if (liveryCache.has(key)) return liveryCache.get(key);
  const mats = new Map();
  carTemplate.traverse((node) => {
    if (!node.isMesh) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.forEach((m) => {
      if (mats.has(m.name)) return;
      const clone = m.clone();
      if (m.name === "livery_body") clone.color = color(kart.body);
      if (m.name === "livery_trim") clone.color = color(kart.trim);
      if (m.name === "helmet") clone.color = color(driver.color, "#ffffff");
      mats.set(m.name, clone);
    });
  });
  liveryCache.set(key, mats);
  return mats;
}

function buildCar(kart, driver) {
  const root = new THREE.Group();
  const model = carTemplate.clone(true);
  const mats = liveryMaterials(kart, driver);
  const wheels = {};
  model.traverse((node) => {
    if (node.isMesh) {
      node.material = Array.isArray(node.material)
        ? node.material.map((m) => mats.get(m.name) || m)
        : mats.get(node.material.name) || node.material;
    }
    if (/^wheel_(FL|FR|RL|RR)$/.test(node.name)) wheels[node.name.slice(6)] = node;
  });
  // Front wheels steer around a pivot on their own axle.
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
  model.scale.setScalar(CAR_SCALE);
  root.add(model);

  // Exhaust glow for boosts, and a soft contact shadow that reads even when
  // the real shadow map is far away.
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.set(-2.55 * CAR_SCALE, 0.3 * CAR_SCALE, 0);
  glow.visible = false;
  root.add(glow);

  return { root, model, wheels, glow, spin: 0 };
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

let current = null; // { trackId, group, cars: Map, boxes: [] }

function resample(track) {
  const pts = track.points;
  const out = [];
  const total = track.totalLength;
  const segs = track.segments;
  const starts = track.cumulativeStarts;
  const count = Math.ceil(total / SAMPLE_STEP);
  let seg = 0;
  for (let i = 0; i < count; i += 1) {
    const d = (i / count) * total;
    while (seg < segs.length - 1 && starts[seg] + segs[seg].length < d) seg += 1;
    const s = segs[seg];
    const t = s.length ? (d - starts[seg]) / s.length : 0;
    out.push({ x: s.a.x + s.dx * t, y: s.a.y + s.dy * t, d, width: s.width });
  }
  // Smooth the tangent across neighbours so the ribbon edges do not kink at
  // every waypoint. The centreline itself stays on the physics polyline.
  const n = out.length;
  const k = 3;
  out.forEach((p, i) => {
    const a = out[(i - k + n) % n];
    const b = out[(i + k) % n];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    p.tx = tx / len;
    p.ty = ty / len;
    p.nx = -p.ty;
    p.ny = p.tx;
  });
  // Signed curvature from the turn of the smoothed tangent.
  out.forEach((p, i) => {
    const q = out[(i + 2) % n];
    const cross = p.tx * q.ty - p.ty * q.tx;
    p.curve = cross / (2 * SAMPLE_STEP);
  });
  void pts;
  return out;
}

// A strip either side of the centreline, from offset `inner` to `outer`
// (negative is left). UV u runs across, v runs along in world units / vScale.
function ribbon(samples, inner, outer, y, vScale, filter) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = samples.length;
  let run = -1;
  for (let i = 0; i <= n; i += 1) {
    const p = samples[i % n];
    const on = filter ? filter(p, i % n) : true;
    if (!on) { run = -1; continue; }
    const base = pos.length / 3;
    const off = [inner, outer].map((o) => (typeof o === "function" ? o(p) : o));
    pos.push(p.x + p.nx * off[0], y, p.y + p.ny * off[0]);
    pos.push(p.x + p.nx * off[1], y, p.y + p.ny * off[1]);
    const v = (i === n ? samples[n - 1].d + SAMPLE_STEP : p.d) / vScale;
    uv.push(0, v, 1, v);
    if (run >= 0) {
      const a = base - 2;
      // Winding chosen so the face points up whichever side of the line it is on.
      if (off[1] > off[0]) idx.push(a, base, a + 1, a + 1, base, base + 1);
      else idx.push(a, a + 1, base, a + 1, base + 1, base);
    }
    run = base;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// A vertical wall following an offset line.
function wall(samples, offset, height, vScale) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = samples.length;
  for (let i = 0; i <= n; i += 1) {
    const p = samples[i % n];
    const o = typeof offset === "function" ? offset(p) : offset;
    const x = p.x + p.nx * o;
    const z = p.y + p.ny * o;
    const base = pos.length / 3;
    pos.push(x, 0, z, x, height, z);
    const v = (i === n ? samples[n - 1].d + SAMPLE_STEP : p.d) / vScale;
    uv.push(v, 0, v, 1);
    if (i > 0) idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function nearestSample(samples, x, y) {
  let best = samples[0];
  let bestD = Infinity;
  for (const p of samples) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return { sample: best, distance: Math.sqrt(bestD) };
}

function buildTrack(track) {
  const group = new THREE.Group();
  const bg = track.bg || {};
  const night = luminance(bg.sky) < 0.12;
  const water = track.id === "monaco";
  const desert = track.id === "bahrain";
  const samples = resample(track);
  const rand = seeded(hashString(track.id));
  const width = track.roadWidth;
  const shoulder = width + 13;
  const runoff = shoulder + 26;

  // Lighting per venue.
  scene.background = null;
  hemi.color = color(night ? "#5a6a9a" : "#dfefff");
  hemi.groundColor = color(night ? "#1a1a2a" : desert ? "#8a6a3a" : "#4a5a3a");
  hemi.intensity = night ? 0.85 : 1.15;
  sun.color = color(night ? "#ffe2b0" : desert ? "#ffd9a0" : "#fff6e8");
  sun.intensity = night ? 1.4 : desert ? 2.6 : 2.5;
  renderer.toneMappingExposure = night ? 1.25 : 1.0;
  const fogColor = night ? color("#10122a") : color(bg.sky).lerp(new THREE.Color(0xffffff), 0.35);
  scene.fog = new THREE.Fog(fogColor, night ? 500 : 900, night ? 2600 : 3800);

  // Sky dome with a gradient and a sun disc.
  const skyGeo = new THREE.SphereGeometry(5000, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: color(bg.sky).multiplyScalar(night ? 0.5 : 0.72) },
      bottom: { value: fogColor.clone() },
      sunDir: { value: new THREE.Vector3(0.5, 0.35, -0.6).normalize() },
      sunColor: { value: color(bg.sun, "#ffe08a") },
      night: { value: night ? 1 : 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y*2.2, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.7));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25) * (1.0 - night);
        c += sunColor * pow(s, 400.0) * night * 1.5;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.userData.followCamera = true;
  group.add(sky);
  const sunDirWorld = skyMat.uniforms.sunDir.value;

  // Ground. Monaco's "grass" is the harbour.
  const groundTex = grassTex.clone();
  groundTex.needsUpdate = true;
  groundTex.repeat.set(160, 160);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12000, 12000),
    water
      ? new THREE.MeshStandardMaterial({ color: color(bg.grass), roughness: 0.15, metalness: 0.3 })
      : new THREE.MeshStandardMaterial({ color: color(bg.grass), map: groundTex, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(900, -0.5, 550);
  ground.receiveShadow = true;
  group.add(ground);

  // Paved or gravel run-off right round the circuit, so the road never sits on
  // bare grass and hairpin insides fill in cleanly.
  const runoffMat = new THREE.MeshStandardMaterial({
    color: water ? color("#b8b0a4") : desert ? color("#c8a868") : color(bg.shoulder, "#c0b8a8").multiplyScalar(0.8),
    map: asphaltTex, roughness: 0.95, side: THREE.DoubleSide,
  });
  const runoffMesh = new THREE.Mesh(ribbon(samples, -runoff, runoff, 0.02, 80), runoffMat);
  runoffMesh.receiveShadow = true;
  group.add(runoffMesh);

  // Tarmac.
  const roadTex = asphaltTex.clone();
  roadTex.needsUpdate = true;
  roadTex.repeat.set(3, 1);
  const road = new THREE.Mesh(
    ribbon(samples, -width, width, 0.12, 90),
    new THREE.MeshStandardMaterial({ color: color(bg.road, "#484850").multiplyScalar(0.95), map: roadTex, roughness: 0.82, side: THREE.DoubleSide }),
  );
  road.receiveShadow = true;
  group.add(road);

  // White edge lines.
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, side: THREE.DoubleSide });
  [[-width, -width + 2.4], [width - 2.4, width]].forEach(([a, b]) => {
    const m = new THREE.Mesh(ribbon(samples, a, b, 0.16, 50), lineMat);
    m.receiveShadow = true;
    group.add(m);
  });

  // Kerbs on the inside and outside of corners, striped in the venue colours.
  const kerbMat = new THREE.ShaderMaterial({
    uniforms: {
      a: { value: color(bg.curbA, "#dc0000") },
      b: { value: color(bg.curbB, "#ffffff") },
      stripes: { value: kerbTex },
      ...THREE.UniformsLib.fog,
    },
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 a; uniform vec3 b; uniform sampler2D stripes; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){ float s = texture2D(stripes, vec2(0.5, vUv.y)).r; gl_FragColor = vec4(mix(b, a, 1.0 - s) * 0.85, 1.0);
      #include <tonemapping_fragment>
      
      #include <colorspace_fragment>
      
      #include <fog_fragment>
      }`,
  });
  const isCorner = (p) => Math.abs(p.curve) > 0.0022;
  // Grow the kerb set a little either side so they start before the turn-in.
  const cornerFlags = samples.map(isCorner);
  const spread = 5;
  const kerbOn = samples.map((_, i) => {
    for (let j = -spread; j <= spread; j += 1) {
      if (cornerFlags[(i + j + samples.length) % samples.length]) return true;
    }
    return false;
  });
  [[width, width + 9], [-width - 9, -width]].forEach(([a, b]) => {
    const m = new THREE.Mesh(ribbon(samples, a, b, 0.2, 16, (_, i) => kerbOn[i]), kerbMat);
    group.add(m);
  });

  // Barriers: a low wall on the outside of the run-off, covered in adverts.
  const barrierTex = canvasTexture(512, 64, (g, w, h) => {
    const colours = [bg.curbA || "#dc0000", "#f4f4f4", bg.accent || "#ffe08a", "#1b1b24"];
    for (let i = 0; i < 4; i += 1) {
      g.fillStyle = colours[i];
      g.fillRect((i * w) / 4, 0, w / 4, h);
      g.fillStyle = i === 3 ? "#f4f4f4" : "#1b1b24";
      g.font = "900 italic 34px Trebuchet MS, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(["F1", "PIXEL", "CUP", "2025"][i], (i + 0.5) * w / 4, h / 2 + 2);
    }
  });
  barrierTex.repeat.set(1, 1);
  const barrierMat = new THREE.MeshStandardMaterial({ map: barrierTex, roughness: 0.6, side: THREE.DoubleSide });
  [-1, 1].forEach((sgn) => {
    const m = new THREE.Mesh(wall(samples, sgn * (runoff + 2), 7, 160), barrierMat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });

  // Start / finish: chequered band and a gantry.
  const start = samples[0];
  const startAngle = Math.atan2(start.ty, start.tx);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(10, width * 2), new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.7 }));
  band.rotation.x = -Math.PI / 2;
  band.rotation.z = -startAngle;
  band.position.set(start.x, 0.2, start.y);
  checkerTex.rotation = Math.PI / 2;
  checkerTex.center.set(0.5, 0.5);
  group.add(band);
  group.add(buildGantry(start, width, startAngle));

  // Grid boxes behind the line.
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee });
  for (let slot = 0; slot < 20; slot += 1) {
    const p = samples[(samples.length - 4 - slot * 4 + samples.length * 4) % samples.length];
    const side = slot % 2 === 0 ? -1 : 1;
    const bx = p.x + p.nx * side * width * 0.35;
    const bz = p.y + p.ny * side * width * 0.35;
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(2, 22), gridMat);
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = -Math.atan2(p.ty, p.tx);
    mark.position.set(bx, 0.18, bz);
    group.add(mark);
  }

  // Decor from the track definition.
  const lampPositions = [];
  track.decor.forEach((d, i) => {
    const { sample, distance } = nearestSample(samples, d.x, d.y);
    // Keep scenery off the circuit: push it clear of the barriers.
    let x = d.x;
    let z = d.y;
    const clear = runoff + 40;
    if (distance < clear) {
      const side = Math.sign((d.x - sample.x) * sample.nx + (d.y - sample.y) * sample.ny) || 1;
      x = sample.x + sample.nx * side * clear;
      z = sample.y + sample.ny * side * clear;
    }
    const face = Math.atan2(sample.y - z, sample.x - x);
    const obj = buildDecor(d, bg, night, i, rand);
    if (!obj) return;
    obj.position.set(x, 0, z);
    obj.rotation.y = -face - Math.PI / 2;
    group.add(obj);
    if (d.type === "lamp" || (night && d.type === "tower")) lampPositions.push({ x, z });
  });

  // Fill the empty infield and surroundings with trees (or palms, or dunes).
  group.add(scatterTrees(samples, runoff + 30, bg, rand, water, desert, night));

  // Night races get floodlight pylons right round the lap.
  if (night) group.add(buildFloodlights(samples, runoff + 10));

  // Item boxes.
  const boxes = track.itemBoxes.map((b) => {
    const mesh = buildItemBox();
    mesh.position.set(b.x, 11, b.y);
    mesh.userData.source = b;
    group.add(mesh);
    return mesh;
  });

  // Point the sun from the sky direction.
  sun.userData.dir = sunDirWorld.clone();

  return { group, boxes, night };
}

function buildGantry(start, width, angle) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2a32, metalness: 0.6, roughness: 0.4 });
  const span = width * 2 + 30;
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(3, 46, 3), steel);
    post.position.set(0, 23, (s * span) / 2);
    post.castShadow = true;
    g.add(post);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 7, span), steel);
  beam.position.set(0, 44, 0);
  beam.castShadow = true;
  g.add(beam);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a0a, emissiveIntensity: 0.25 });
  for (let i = 0; i < 5; i += 1) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    pod.position.set(-3, 44, (i - 2) * 6);
    g.add(pod);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), lightMat);
    lamp.position.set(-4.1, 44, (i - 2) * 6);
    lamp.rotation.y = -Math.PI / 2;
    g.add(lamp);
  }
  const bannerTex = canvasTexture(1024, 96, (c, w, h) => {
    c.fillStyle = "#dc0000";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#fff";
    c.font = "900 italic 64px Trebuchet MS, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("F1 PIXEL CUP", w / 2, h / 2 + 2);
  }, { repeat: false });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.7, 6), new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide }));
  banner.position.set(-2.6, 51, 0);
  banner.rotation.y = -Math.PI / 2;
  g.add(banner);
  g.position.set(start.x, 0, start.y);
  g.rotation.y = -angle;
  return g;
}

function buildDecor(d, bg, night, i, rand) {
  const g = new THREE.Group();
  const c = color(d.color, "#888888");
  const std = (col, extra = {}) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, ...extra });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  if (d.type === "grandstand") {
    // Stepped seating facing the track (local -Z faces the circuit), with a roof.
    const len = 150;
    const concrete = std(0x9a9aa2);
    const seats = std(c, { roughness: 0.55 });
    for (let row = 0; row < 7; row += 1) {
      add(new THREE.BoxGeometry(len, 5, 8), row % 2 ? concrete : seats, 0, 2.5 + row * 5, row * 8);
    }
    add(new THREE.BoxGeometry(len, 40, 4), concrete, 0, 20, 58);
    const roof = add(new THREE.BoxGeometry(len + 8, 2, 64), std(0xe8e8ec), 0, 50, 26);
    roof.rotation.x = -0.08;
    [-len / 2, 0, len / 2].forEach((x) => add(new THREE.BoxGeometry(2, 50, 2), std(0x55555c), x, 25, 56));
    // Crowd: a speckled texture on the seat faces.
    const crowd = canvasTexture(256, 32, (cx, w, h) => {
      const r = seeded(i + 99);
      cx.fillStyle = "#333";
      cx.fillRect(0, 0, w, h);
      for (let k = 0; k < 900; k += 1) {
        cx.fillStyle = `hsl(${Math.floor(r() * 360)}, 60%, ${40 + r() * 40}%)`;
        cx.fillRect(r() * w, r() * h, 2, 3);
      }
    });
    crowd.repeat.set(4, 1);
    for (let row = 0; row < 7; row += 2) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 4.5), new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 }));
      face.position.set(0, 5.3 + row * 5, row * 8 - 4.05);
      face.rotation.y = Math.PI;
      g.add(face);
    }
    return g;
  }
  if (d.type === "tower") {
    const h = 70 + (i % 3) * 30;
    add(new THREE.BoxGeometry(36, h, 36), std(c, { metalness: 0.2 }), 0, h / 2, 0);
    const glass = std(night ? 0xffd890 : 0x6a8aa8, { metalness: 0.5, roughness: 0.2, emissive: night ? 0xffc060 : 0x000000, emissiveIntensity: night ? 0.6 : 0 });
    for (let f = 1; f < h / 12; f += 1) add(new THREE.BoxGeometry(37, 4, 37), glass, 0, f * 12, 0);
    return g;
  }
  if (d.type === "house") {
    add(new THREE.BoxGeometry(46, 30, 36), std(c), 0, 15, 0);
    const roof = add(new THREE.ConeGeometry(34, 18, 4), std(0x8a3a2a), 0, 39, 0);
    roof.rotation.y = Math.PI / 4;
    return g;
  }
  if (d.type === "billboard") {
    add(new THREE.BoxGeometry(2, 30, 2), std(0x3a3a40), -20, 15, 0);
    add(new THREE.BoxGeometry(2, 30, 2), std(0x3a3a40), 20, 15, 0);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), new THREE.MeshStandardMaterial({ map: billboardTexture(d.color || bg.accent, i + 7), side: THREE.DoubleSide, emissive: night ? 0xffffff : 0x000000, emissiveIntensity: night ? 0.35 : 0, emissiveMap: night ? billboardTexture(d.color || bg.accent, i + 7) : null }));
    board.position.set(0, 34, -1.2);
    board.rotation.y = Math.PI;
    board.castShadow = true;
    g.add(board);
    return g;
  }
  if (d.type === "lamp") {
    add(new THREE.CylinderGeometry(0.8, 1.2, 50, 8), std(0x3a3a40), 0, 25, 0);
    add(new THREE.BoxGeometry(12, 3, 5), std(0xffffff, { emissive: 0xfff2c0, emissiveIntensity: night ? 2 : 0.2 }), 0, 50, -3);
    return g;
  }
  if (d.type === "tree" || d.type === "cactus") {
    add(new THREE.CylinderGeometry(2, 3, 14, 6), std(0x5a4030), 0, 7, 0);
    add(new THREE.IcosahedronGeometry(16, 0), std(c, { flatShading: true }), 0, 26, 0);
    return g;
  }
  // Anything else: a trackside marshal hut.
  add(new THREE.BoxGeometry(20, 14, 16), std(c), 0, 7, 0);
  return g;
}

function scatterTrees(samples, clearance, bg, rand, water, desert, night) {
  const group = new THREE.Group();
  if (water) return group;
  const count = desert ? 140 : 420;
  const trunkGeo = new THREE.CylinderGeometry(1.6, 2.4, 12, 5);
  const crownGeo = desert ? new THREE.DodecahedronGeometry(9, 0) : new THREE.IcosahedronGeometry(14, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  trunks.castShadow = crowns.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const base = color(desert ? "#6a7a3a" : bg.horizonB || "#3a6a35");
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 30) {
    tries += 1;
    const x = -400 + rand() * 2600;
    const z = -400 + rand() * 1900;
    const { distance } = nearestSample(samples, x, z);
    if (distance < clearance) continue;
    const scale = 0.7 + rand() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    s.setScalar(scale);
    m.compose(pos.set(x, 6 * scale, z), q, s);
    trunks.setMatrixAt(placed, m);
    m.compose(pos.set(x, 22 * scale, z), q, s);
    crowns.setMatrixAt(placed, m);
    const tint = base.clone().offsetHSL((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.12);
    if (night) tint.multiplyScalar(0.6);
    crowns.setColorAt(placed, tint);
    placed += 1;
  }
  trunks.count = crowns.count = placed;
  group.add(trunks, crowns);
  return group;
}

function buildFloodlights(samples, offset) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x33333a });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d0, emissiveIntensity: 3 });
  const every = Math.max(1, Math.floor(160 / SAMPLE_STEP));
  for (let i = 0; i < samples.length; i += every) {
    const p = samples[i];
    const side = (i / every) % 2 ? 1 : -1;
    const x = p.x + p.nx * side * offset;
    const z = p.y + p.ny * side * offset;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 70, 6), poleMat);
    pole.position.set(x, 35, z);
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), headMat);
    head.position.set(x - p.nx * side * 3, 70, z - p.ny * side * 3);
    head.rotation.y = -Math.atan2(p.ty, p.tx);
    group.add(head);
  }
  return group;
}

function buildItemBox() {
  const g = new THREE.Group();
  const qTex = canvasTexture(128, 128, (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#ff3b30");
    grad.addColorStop(1, "#b0000a");
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#fff0c9";
    c.lineWidth = 8;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = "#fff0c9";
    c.font = "900 84px Trebuchet MS, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("?", w / 2, h / 2 + 4);
  }, { repeat: false });
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(12, 12, 12),
    new THREE.MeshStandardMaterial({ map: qTex, emissive: 0xff2010, emissiveIntensity: 0.35, transparent: true, opacity: 0.92, roughness: 0.3 }),
  );
  box.castShadow = true;
  g.add(box);
  g.userData.box = box;
  return g;
}

// ---------------------------------------------------------------------------
// Dynamic things: dropped items and particles
// ---------------------------------------------------------------------------

const itemGroup = new THREE.Group();
scene.add(itemGroup);
const itemPool = [];
const itemMats = {
  undercut: new THREE.MeshStandardMaterial({ color: 0xdc0000, emissive: 0x550000 }),
  stewardPenalty: new THREE.MeshStandardMaterial({ color: 0x0090ff, emissive: 0x002255 }),
  other: new THREE.MeshStandardMaterial({ color: 0x00d2be, emissive: 0x004440 }),
};

function syncItems(items, now) {
  while (itemPool.length < items.length) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(6, 0), itemMats.other);
    m.castShadow = true;
    itemGroup.add(m);
    itemPool.push(m);
  }
  itemPool.forEach((m, i) => {
    const it = items[i];
    m.visible = Boolean(it);
    if (!it) return;
    m.material = itemMats[it.type] || itemMats.other;
    m.position.set(it.x, 6 + Math.sin(now / 200 + i) * 1.2, it.y);
    m.rotation.y = now / 300;
  });
}

const particleGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAX_PARTICLES * 3);
const pCol = new Float32Array(MAX_PARTICLES * 3);
const pSize = new Float32Array(MAX_PARTICLES);
const pAlpha = new Float32Array(MAX_PARTICLES);
particleGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
particleGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
particleGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1));
particleGeo.setAttribute("alpha", new THREE.BufferAttribute(pAlpha, 1));
const particleMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { map: { value: smokeTex }, scale: { value: 400 } },
  vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vColor; varying float vAlpha; uniform float scale;
    void main(){ vColor = color; vAlpha = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
    void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor, t.a * vAlpha);
      #include <colorspace_fragment>
      }`,
});
const particles = new THREE.Points(particleGeo, particleMat);
particles.frustumCulled = false;
scene.add(particles);
const tmpColor = new THREE.Color();

function syncParticles(list) {
  const n = Math.min(list.length, MAX_PARTICLES);
  for (let i = 0; i < n; i += 1) {
    const p = list[i];
    const life = Math.max(0, Math.min(1, p.life / p.maxLife));
    pPos[i * 3] = p.x;
    pPos[i * 3 + 1] = (p.height || 3) + (1 - life) * 6;
    pPos[i * 3 + 2] = p.y;
    tmpColor.set(p.color || "#ffffff");
    pCol[i * 3] = tmpColor.r;
    pCol[i * 3 + 1] = tmpColor.g;
    pCol[i * 3 + 2] = tmpColor.b;
    pSize[i] = (p.size || 5) * (2.2 + (1 - life) * 2.5);
    pAlpha[i] = life * 0.7;
  }
  particleGeo.setDrawRange(0, n);
  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.color.needsUpdate = true;
  particleGeo.attributes.size.needsUpdate = true;
  particleGeo.attributes.alpha.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Per-frame
// ---------------------------------------------------------------------------

function resize() {
  const w = canvas2d.clientWidth || canvas2d.width;
  const h = canvas2d.clientHeight || canvas2d.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const need = renderer.getPixelRatio() !== dpr
    || canvas3d.width !== Math.round(w * dpr)
    || canvas3d.height !== Math.round(h * dpr);
  if (need) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    particleMat.uniforms.scale.value = h * dpr * 0.9;
  }
}

function ensureTrack(track) {
  if (current && current.trackId === track.id) return current;
  if (current) {
    scene.remove(current.group);
    current.cars.forEach((car) => scene.remove(car.root));
    current.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  const built = buildTrack(track);
  scene.add(built.group);
  current = { trackId: track.id, cars: new Map(), ...built };
  return current;
}

function syncCars(racers, player, now, dt) {
  const seen = new Set();
  racers.forEach((racer) => {
    let car = current.cars.get(racer.id);
    if (!car) {
      car = buildCar(racer.kart, racer.driver);
      current.cars.set(racer.id, car);
      scene.add(car.root);
    }
    seen.add(racer.id);
    const visible = !racer.finished || racer.id === player.id;
    car.root.visible = visible;
    if (!visible) return;
    const spinning = racer.spinUntil > now;
    car.spin = spinning ? car.spin + dt * 14 : car.spin * Math.pow(0.001, dt);
    car.root.position.set(racer.x, 0, racer.y);
    car.root.rotation.y = -racer.heading - car.spin;
    // Wheels: roll with speed, steer the fronts.
    const roll = (racer.speed * dt) / (0.36 * CAR_SCALE);
    ["FL", "FR", "RL", "RR"].forEach((id) => {
      const w = car.wheels[id];
      if (w) w.rotation.z -= roll;
    });
    const steer = Math.max(-0.45, Math.min(0.45, (racer.steer || 0) * 0.45));
    if (car.wheels.FLpivot) car.wheels.FLpivot.rotation.y = -steer;
    if (car.wheels.FRpivot) car.wheels.FRpivot.rotation.y = -steer;
    // Slight body roll into the corner and squat under a boost.
    const boosting = racer.bulletUntil > now || racer.boostUntil > now;
    car.model.rotation.x = Math.max(-0.05, Math.min(0.05, -(racer.steer || 0) * 0.03 * Math.min(1, Math.abs(racer.speed) / 200)));
    car.glow.visible = boosting;
    if (boosting) car.glow.scale.setScalar(1.6 + Math.sin(now / 30) * 0.5);
  });
  current.cars.forEach((car, id) => {
    if (!seen.has(id)) {
      scene.remove(car.root);
      current.cars.delete(id);
    }
  });
}

let lastNow = 0;
const lookTarget = new THREE.Vector3();

// Called by game.js each frame in place of the 2D road, scenery and cars.
function render(frame) {
  if (!api.ready) return false;
  const { track, player, racers, cameraHeading, camPos, roll, shake, items, particles: list, now } = frame;
  const dt = Math.min(0.05, Math.max(0, (now - (lastNow || now)) / 1000));
  lastNow = now;
  resize();
  const world = ensureTrack(track);
  garage.group.visible = false;
  world.group.visible = true;
  itemGroup.visible = particles.visible = true;

  syncCars(racers, player, now, dt);
  syncItems(items, now);
  syncParticles(list);
  world.boxes.forEach((b, i) => {
    const hidden = b.userData.source.respawnAt && b.userData.source.respawnAt > now;
    b.visible = !hidden && b.userData.source.active !== false;
    b.userData.box.rotation.set(now / 900 + i, now / 700 + i, 0);
    b.position.y = 11 + Math.sin(now / 260 + i) * 1.5;
  });

  // Camera: the game's own smoothed chase position and heading, placed a
  // little lower than the 2D view so the cars read as solid objects.
  const cos = Math.cos(cameraHeading);
  const sin = Math.sin(cameraHeading);
  const cx = camPos ? camPos.x : player.x - cos * 48;
  const cz = camPos ? camPos.y : player.y - sin * 48;
  const sx = (shake?.x || 0) * 0.08;
  const sy = (shake?.y || 0) * 0.08;
  camera.position.set(cx - sin * sx, 19 + sy, cz + cos * sx);
  lookTarget.set(player.x + cos * 60, 3, player.y + sin * 60);
  camera.up.set(0, 1, 0);
  camera.lookAt(lookTarget);
  camera.rotateZ(-(roll || 0) * 0.8);

  // Keep the shadow frustum centred on the player.
  const dir = sun.userData.dir || new THREE.Vector3(0.5, 0.35, -0.6);
  sun.position.set(player.x + dir.x * 600, dir.y * 600 + 200, player.y + dir.z * 600);
  sun.target.position.set(player.x + cos * 120, 0, player.y + sin * 120);
  world.group.children.forEach((o) => {
    if (o.userData.followCamera) o.position.copy(camera.position);
  });

  renderer.render(scene, camera);
  return true;
}

// ---------------------------------------------------------------------------
// Garage: a turntable showroom for the selected car
// ---------------------------------------------------------------------------

const garage = { group: new THREE.Group(), car: null, key: "" };
scene.add(garage.group);
garage.group.visible = false;
{
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(80, 64),
    new THREE.MeshStandardMaterial({ color: 0x1b1a22, roughness: 0.35, metalness: 0.4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  garage.group.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(46, 48, 64), new THREE.MeshBasicMaterial({ color: 0xdc0000 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  garage.group.add(ring);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 200, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x0c0b10, side: THREE.BackSide }));
  back.position.y = 60;
  garage.group.add(back);
  // Studio lights: a warm key from the front, a red rim from behind.
  const key = new THREE.PointLight(0xfff0e0, 9000, 0, 2);
  key.position.set(40, 45, 30);
  const rim = new THREE.PointLight(0xff3020, 5000, 0, 2);
  rim.position.set(-45, 40, -40);
  const fill = new THREE.PointLight(0x6080ff, 3000, 0, 2);
  fill.position.set(10, 20, -50);
  garage.group.add(key, rim, fill);
}

function renderGarage(kart, driver, now) {
  if (!api.ready) return false;
  resize();
  if (current) {
    current.group.visible = false;
    current.cars.forEach((c) => { c.root.visible = false; });
  }
  itemGroup.visible = particles.visible = false;
  garage.group.visible = true;
  scene.fog = null;
  hemi.color.set(0xdfe6ff);
  hemi.groundColor.set(0x201820);
  hemi.intensity = 0.8;
  sun.intensity = 2.6;
  sun.color.set(0xffffff);
  renderer.toneMappingExposure = 1.1;
  const key = `${kart.id}|${driver.id || driver.name}`;
  if (garage.key !== key) {
    if (garage.car) garage.group.remove(garage.car.root);
    garage.car = buildCar(kart, driver);
    garage.group.add(garage.car.root);
    garage.key = key;
  }
  garage.car.root.rotation.y = now / 3000;
  const t = now / 9000;
  camera.position.set(Math.cos(t) * 3 + 40, 14, 27);
  camera.up.set(0, 1, 0);
  // Aim to the left of the car so it sits in the right half of the frame,
  // clear of the driver details drawn over the left.
  const fwd = new THREE.Vector3(-camera.position.x, 5 - camera.position.y, -camera.position.z).normalize();
  const right = fwd.clone().cross(camera.up).normalize();
  camera.lookAt(-right.x * 20, 5, -right.z * 20);
  sun.position.set(80, 160, 60);
  sun.target.position.set(0, 0, 0);
  // Force a fresh track build (and its lighting) next time a race starts.
  if (current) {
    scene.remove(current.group);
    current.cars.forEach((c) => scene.remove(c.root));
    current = null;
  }
  renderer.render(scene, camera);
  return true;
}
