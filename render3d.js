// Three.js renderer for the driver view.
//
// game.js still owns everything that matters to the race: physics, AI, laps,
// items, audio and the HUD. This module only draws. Each frame game.js hands it
// the current state and it poses a 3D scene to match. The 2D canvas stays on top
// as a transparent layer for the HUD, the mini map and the start lights.
//
// World mapping: the game plays on a flat (x, y) plane. Here that plane is
// (x, 0, y), with Y up. A game heading h points along (cos h, sin h), which is a
// rotation of -h about Y in Three.js. The only height in the game is visual:
// Suzuka's bridge, looked up from each car's distance round the lap.
//
//   r3d/track.js      circuit geometry, run-off, barriers, bridge, scenery
//   r3d/landmarks.js  what makes each venue look like where it is
//   r3d/car.js        the Blender car and the team liveries
//   r3d/textures.js   Poly Haven photo textures and painted canvases

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { color, luminance, photo, makeSmokeTexture, setAnisotropy } from "./r3d/textures.js";
import { loadCar, buildCar, CAR_SCALE } from "./r3d/car.js";
import { buildCourse, buildCircuit, buildDecor, buildItemBox } from "./r3d/track.js";
import { VENUES, buildLandmarks, waterMaterial } from "./r3d/landmarks.js";

const MAX_PARTICLES = 256;
const BASE_FOV = 62;

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
// Reflections for the car paint and glass: a neutral studio environment.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, 2, 9000);

const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -280, right: 280, top: 280, bottom: -280, near: 10, far: 1500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(0.5, 0.42, -0.6).normalize();

const api = { ready: false, render, renderGarage, auditScenery };
window.Render3D = api;

loadCar(() => { api.ready = true; }, (error) => {
  console.warn("3D car model failed to load; staying on the 2D renderer.", error);
});

// ---------------------------------------------------------------------------
// Venue: sky, ground, lighting
// ---------------------------------------------------------------------------

function buildSky(bg, night, fogColor) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: color(bg.sky).multiplyScalar(night ? 0.5 : 0.72) },
      bottom: { value: fogColor.clone() },
      sunDir: { value: SUN_DIR },
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), mat);
  sky.userData.followCamera = true;
  return sky;
}

function buildGround(course, venue, bg) {
  const size = 20000;
  const tile = 48;
  let mat;
  if (venue.ground === "water") mat = waterMaterial("#2a6f96");
  else if (venue.ground === "sand") mat = new THREE.MeshStandardMaterial({ map: photo("aerial_sand", size / 160), color: color("#e6c898"), roughness: 1 });
  else if (venue.ground === "city") mat = new THREE.MeshStandardMaterial({ map: photo("concrete_floor_02", size / 90), color: color("#55535a"), roughness: 0.95 });
  else mat = new THREE.MeshStandardMaterial({ map: photo("leafy_grass", size / tile), color: color(venue.groundTint || bg.grass), roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(course.bounds.cx, -0.4, course.bounds.cz);
  ground.receiveShadow = true;
  return ground;
}

function applyLighting(bg, venue, night) {
  const desert = venue.ground === "sand";
  hemi.color = color(night ? "#5a6a9a" : "#dfefff");
  hemi.groundColor = color(night ? "#1a1a2a" : desert ? "#8a6a3a" : "#4a5a3a");
  hemi.intensity = night ? 0.85 : 1.1;
  sun.color = color(night ? "#ffe2b0" : desert ? "#ffd9a0" : "#fff6e8");
  sun.intensity = night ? 1.4 : desert ? 2.6 : 2.5;
  renderer.toneMappingExposure = night ? 1.25 : 1.0;
  scene.environmentIntensity = night ? 0.18 : 0.45;
  const fogColor = night ? color("#10122a") : color(bg.sky).lerp(new THREE.Color(0xffffff), 0.35);
  scene.fog = new THREE.Fog(fogColor, venue.fogNear || (night ? 600 : 1000), venue.fogFar || (night ? 3000 : 4600));
  return fogColor;
}

// ---------------------------------------------------------------------------
// Track lifecycle
// ---------------------------------------------------------------------------

let current = null;

function buildWorld(track) {
  const venue = { ...(VENUES[track.id] || VENUES.monza) };
  const bg = track.bg || {};
  venue.night = venue.night ?? luminance(bg.sky) < 0.12;
  const course = buildCourse(track);
  const group = new THREE.Group();
  const fogColor = applyLighting(bg, venue, venue.night);
  group.add(buildSky(bg, venue.night, fogColor));
  group.add(buildGround(course, venue, bg));
  group.add(buildCircuit(course, venue));
  // Decor from the track data first (it was laid out with the circuit), then
  // landmarks and trees fill round it. Everything claims its footprint.
  const decor = buildDecor(course, venue);
  group.add(decor);
  const landmarks = buildLandmarks(course, venue);
  group.add(landmarks);
  const boxes = track.itemBoxes.map((b) => {
    const mesh = buildItemBox();
    mesh.userData.source = b;
    mesh.userData.baseY = course.heightAtPoint(b.x, b.y) + 11;
    mesh.position.set(b.x, mesh.userData.baseY, b.y);
    group.add(mesh);
    return mesh;
  });
  if (decor.userData.dropped) console.info(`${track.id}: ${decor.userData.dropped} scenery pieces dropped for lack of room`);
  return { trackId: track.id, course, venue, group, decor, landmarks, boxes, cars: new Map(), fov: BASE_FOV, rumble: 0 };
}

function disposeWorld(world) {
  scene.remove(world.group);
  world.cars.forEach((car) => scene.remove(car.root));
  world.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}

function ensureWorld(track) {
  if (current && current.trackId === track.id) return current;
  if (current) disposeWorld(current);
  current = buildWorld(track);
  scene.add(current.group);
  return current;
}

// ---------------------------------------------------------------------------
// Dropped items and particles
// ---------------------------------------------------------------------------

const itemGroup = new THREE.Group();
scene.add(itemGroup);
const itemPool = [];
const itemMats = {
  undercut: new THREE.MeshStandardMaterial({ color: 0xdc0000, emissive: 0x550000 }),
  stewardPenalty: new THREE.MeshStandardMaterial({ color: 0x0090ff, emissive: 0x002255 }),
  other: new THREE.MeshStandardMaterial({ color: 0x00d2be, emissive: 0x004440 }),
};

function syncItems(items, now, course) {
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
    m.position.set(it.x, course.heightAtPoint(it.x, it.y) + 6 + Math.sin(now / 200 + i) * 1.2, it.y);
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
  uniforms: { map: { value: makeSmokeTexture() }, scale: { value: 400 } },
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

function syncParticles(list, course) {
  const n = Math.min(list.length, MAX_PARTICLES);
  for (let i = 0; i < n; i += 1) {
    const p = list[i];
    const life = Math.max(0, Math.min(1, p.life / p.maxLife));
    pPos[i * 3] = p.x;
    pPos[i * 3 + 1] = course.heightAtPoint(p.x, p.y) + (p.height || 3) + (1 - life) * 6;
    pPos[i * 3 + 2] = p.y;
    tmpColor.set(p.color || "#ffffff");
    pCol[i * 3] = tmpColor.r;
    pCol[i * 3 + 1] = tmpColor.g;
    pCol[i * 3 + 2] = tmpColor.b;
    pSize[i] = (p.size || 5) * (2.2 + (1 - life) * 2.5);
    pAlpha[i] = life * 0.7;
  }
  particleGeo.setDrawRange(0, n);
  ["position", "color", "size", "alpha"].forEach((k) => { particleGeo.attributes[k].needsUpdate = true; });
}

// ---------------------------------------------------------------------------
// Cars
// ---------------------------------------------------------------------------

function syncCars(world, racers, player, now, dt) {
  const { course } = world;
  const seen = new Set();
  racers.forEach((racer) => {
    let car = world.cars.get(racer.id);
    if (!car) {
      car = buildCar(racer.kart, racer.driver);
      world.cars.set(racer.id, car);
      scene.add(car.root);
    }
    seen.add(racer.id);
    const visible = !racer.finished || racer.id === player.id;
    car.root.visible = visible;
    if (!visible) return;
    const spinning = racer.spinUntil > now;
    car.spin = spinning ? car.spin + dt * 14 : car.spin * Math.pow(0.001, dt);
    const d = racer.trackDistance || 0;
    const h = course.heightAt(d);
    car.root.position.set(racer.x, h, racer.y);
    car.root.rotation.y = -racer.heading - car.spin;
    // Pitch up and down the bridge ramps.
    const slope = (course.heightAt(d + 8) - course.heightAt(d - 8)) / 16;
    car.root.rotation.z = Math.atan(slope) * Math.sign(Math.cos(car.spin) || 1);
    const roll = (racer.speed * dt) / (0.36 * CAR_SCALE);
    ["FL", "FR", "RL", "RR"].forEach((id) => {
      const w = car.wheels[id];
      if (w) w.rotation.z -= roll;
    });
    const steer = Math.max(-0.45, Math.min(0.45, (racer.steer || 0) * 0.45));
    if (car.wheels.FLpivot) car.wheels.FLpivot.rotation.y = -steer;
    if (car.wheels.FRpivot) car.wheels.FRpivot.rotation.y = -steer;
    const boosting = racer.bulletUntil > now || racer.boostUntil > now;
    car.model.rotation.x = Math.max(-0.05, Math.min(0.05, -(racer.steer || 0) * 0.03 * Math.min(1, Math.abs(racer.speed) / 200)));
    car.glow.visible = boosting;
    if (boosting) car.glow.scale.setScalar(1.6 + Math.sin(now / 30) * 0.5);
  });
  world.cars.forEach((car, id) => {
    if (!seen.has(id)) {
      scene.remove(car.root);
      world.cars.delete(id);
    }
  });
}

// ---------------------------------------------------------------------------
// Per frame
// ---------------------------------------------------------------------------

// Vertical field of view that shows at least as much to the sides as a 16:9
// screen would. Wider windows see more; taller ones open up vertically
// instead of cropping the road at the edges.
function fitFov(fov) {
  const aspect = camera.aspect || 16 / 9;
  if (aspect >= 16 / 9) return fov;
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9) / aspect);
  return (half * 360) / Math.PI;
}

function setFov(fov) {
  const next = fitFov(fov);
  if (Math.abs(camera.fov - next) > 0.01) {
    camera.fov = next;
    camera.updateProjectionMatrix();
  }
}

function resize() {
  const w = canvas2d.clientWidth || canvas2d.width;
  const h = canvas2d.clientHeight || canvas2d.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (renderer.getPixelRatio() !== dpr || canvas3d.width !== Math.round(w * dpr) || canvas3d.height !== Math.round(h * dpr)) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    particleMat.uniforms.scale.value = h * dpr * 0.9;
  }
}

// What the player's tyres are on: kerb, grass/run-off, or tarmac.
function surfaceUnder(world, player) {
  const { course } = world;
  const p = course.sampleAt(player.trackDistance || 0);
  const lateral = Math.abs((player.x - p.x) * p.nx + (player.y - p.y) * p.ny);
  const w = course.width;
  const onKerb = course.kerbOn[p.i] && lateral > w - 5 && lateral < w + 12;
  const offTrack = !onKerb && lateral > w + 6;
  return { onKerb, offTrack };
}

// Smooth pseudo-random shake: a few incommensurate sines.
const jitter = (t, seed) => Math.sin(t * 61 + seed) * 0.5 + Math.sin(t * 97 + seed * 2.3) * 0.3 + Math.sin(t * 143 + seed * 4.1) * 0.2;

let lastNow = 0;
const lookTarget = new THREE.Vector3();

// Called by game.js each frame in place of the 2D road, scenery and cars.
function render(frame) {
  if (!api.ready) return null;
  const { track, player, racers, cameraHeading, camPos, roll, shake, items, particles: list, now } = frame;
  const dt = Math.min(0.05, Math.max(0, (now - (lastNow || now)) / 1000));
  lastNow = now;
  resize();
  const world = ensureWorld(track);
  const { course } = world;
  garage.group.visible = false;
  world.group.visible = true;
  itemGroup.visible = particles.visible = true;

  syncCars(world, racers, player, now, dt);
  // Compile every shader in the new scene while the grid is lining up, so
  // nothing stalls the first time it comes into view mid-race.
  if (!world.compiled) {
    renderer.compile(scene, camera);
    world.compiled = true;
  }
  syncItems(items, now, course);
  syncParticles(list, course);
  world.boxes.forEach((b, i) => {
    b.userData.box.rotation.set(now / 900 + i, now / 700 + i, 0);
    b.position.y = b.userData.baseY + Math.sin(now / 260 + i) * 1.5;
  });
  world.landmarks.userData.animate?.(dt);

  // Speed: the field of view opens up and the camera drops and pushes its
  // aim further down the road as the car gets going.
  const speed = Math.abs(player.speed || 0);
  const sf = Math.min(1, speed / 230);
  const boosting = player.bulletUntil > now || player.boostUntil > now;
  const targetFov = BASE_FOV + 15 * Math.pow(sf, 1.4) + (boosting ? 8 : 0);
  world.fov += (targetFov - world.fov) * Math.min(1, dt * 4);
  setFov(world.fov);

  // Rumble: hard and fast over kerbs, looser off the track, a faint buzz at
  // top speed on the tarmac.
  const surface = surfaceUnder(world, player);
  const target = (surface.onKerb ? 1 : surface.offTrack ? 0.55 : 0) * Math.min(1, speed / 60) + sf * 0.08;
  world.rumble += (target - world.rumble) * Math.min(1, dt * 18);
  const t = now / 1000;
  const r = world.rumble;

  const cos = Math.cos(cameraHeading);
  const sin = Math.sin(cameraHeading);
  const cx = camPos ? camPos.x : player.x - cos * 48;
  const cz = camPos ? camPos.y : player.y - sin * 48;
  const side = (shake?.x || 0) * 0.08 + jitter(t, 1) * r * 0.5;
  const lift = (shake?.y || 0) * 0.08 + jitter(t, 7) * r * 0.9;
  const ground = course.heightAt(player.trackDistance || 0);
  camera.position.set(cx - sin * side, ground + 19 - 3 * sf + lift, cz + cos * side);
  const ahead = 60 + 35 * sf;
  lookTarget.set(player.x + cos * ahead, ground + 3, player.y + sin * ahead);
  camera.up.set(0, 1, 0);
  camera.lookAt(lookTarget);
  camera.rotateZ(-(roll || 0) * 0.8 + jitter(t, 13) * r * 0.012);

  // Shadows follow the player.
  sun.position.set(player.x + SUN_DIR.x * 700, ground + SUN_DIR.y * 700 + 150, player.y + SUN_DIR.z * 700);
  sun.target.position.set(player.x + cos * 130, ground, player.y + sin * 130);
  world.group.children.forEach((o) => {
    if (o.userData.followCamera) o.position.copy(camera.position);
  });

  renderer.render(scene, camera);
  return surface;
}

// ---------------------------------------------------------------------------
// Scenery audit: nothing but the circuit itself may stand over the track.
// Drops a ray straight down onto points right across the road and run-off
// all the way round the lap, and reports anything from the scenery it hits.
// Used by the automated check; cheap enough to run on every circuit.
// ---------------------------------------------------------------------------

function auditScenery(track, { step = 2, lanes = 7 } = {}) {
  const world = ensureWorld(track);
  const { course } = world;
  world.group.updateMatrixWorld(true);
  const targets = [world.decor, world.landmarks];
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const hits = [];
  course.samples.forEach((p, i) => {
    if (i % step) return;
    for (let k = 0; k < lanes; k += 1) {
      // Across the whole width inside the barriers, left to right.
      const t = k / (lanes - 1);
      const off = -p.outerL + 1 + t * (p.outerL + p.outerR - 2);
      origin.set(p.x + p.nx * off, 3000, p.y + p.ny * off);
      ray.set(origin, down);
      // Ground layers the road is laid on (Monaco's town) do not count.
      const hit = ray.intersectObjects(targets, true).find((h) => !h.object.userData.ground);
      if (hit) {
        let o = hit.object;
        let label = o.name || o.type;
        while (o.parent && !o.name && o.parent !== world.decor && o.parent !== world.landmarks) o = o.parent;
        if (o.name) label = o.name;
        hits.push({ d: Math.round(p.d), off: Math.round(off), y: Math.round(hit.point.y), what: `${label}:${hit.object.geometry?.type}`, landmark: hit.object.userData.kind || o.userData.kind || null });
      }
    }
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Garage: a turntable showroom for the selected car
// ---------------------------------------------------------------------------

const garage = { group: new THREE.Group(), car: null, key: "" };
scene.add(garage.group);
garage.group.visible = false;
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ color: 0x1b1a22, roughness: 0.65, metalness: 0.3 }));
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
  const key = new THREE.PointLight(0xfff0e0, 9000, 0, 2);
  key.position.set(40, 45, 30);
  const rim = new THREE.PointLight(0xff3020, 2600, 0, 2);
  rim.position.set(-45, 40, -40);
  const fill = new THREE.PointLight(0x6080ff, 3000, 0, 2);
  fill.position.set(10, 20, -50);
  garage.group.add(key, rim, fill);
}

function renderGarage(kart, driver, now) {
  if (!api.ready) return false;
  resize();
  if (current) {
    disposeWorld(current);
    current = null;
  }
  itemGroup.visible = particles.visible = false;
  garage.group.visible = true;
  scene.fog = null;
  scene.environmentIntensity = 0.6;
  hemi.color.set(0xdfe6ff);
  hemi.groundColor.set(0x201820);
  hemi.intensity = 0.8;
  sun.intensity = 2.6;
  sun.color.set(0xffffff);
  renderer.toneMappingExposure = 1.1;
  setFov(BASE_FOV);
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
  renderer.render(scene, camera);
  return true;
}
