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
import { loadCar, buildCar, CAR_SCALE, helmetInfo as paintedHelmet } from "./r3d/car.js";
import { buildCourse, buildCircuit, buildDecor, buildItemBox, upgradeItemBox, TUNNEL_ROOF } from "./r3d/track.js";
import { setTunnel, lightInTunnel } from "./r3d/tunnel-light.js";
import { buildMarshalPosts, updateMarshalPosts, buildHelicopter, updateHelicopter, buildFireworks, updateFireworks, buildStarter, updateStarter } from "./r3d/trackside.js";
import { crowdUniforms } from "./r3d/track.js";
import { VENUES, buildLandmarks, waterMaterial } from "./r3d/landmarks.js";
import { createPowerUpLayer, itemRuntimeMaterials } from "./r3d/powerups.js";
import { loadItemModels, whenItemsReady, itemsState, itemTemplates, disposeItemCopy } from "./r3d/items.js";
import { createPostFx } from "./r3d/postfx.js";

const MAX_PARTICLES = 256;

// Tell the loading state the renderer itself has arrived (render3d-boot.js).
if (window.Render3DBoot) window.Render3DBoot.moduleAt = performance.now();
const BASE_FOV = 62;
const DRS_OPEN = (12 * Math.PI) / 180;

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

// ---------------------------------------------------------------------------
// Graphics quality and post-processing (quality.js, r3d/postfx.js). The tier
// starts from a guess about the device, steps down once if the first seconds
// of racing run slow, and the player's choice in Settings overrides it.
// ---------------------------------------------------------------------------

const postfx = createPostFx(renderer, scene, camera);
const GRAPHICS_KEY = "f1pixelcup.graphics";
const Quality = window.Quality;

function storedGraphics() {
  try {
    return Quality.parseChoice(window.localStorage.getItem(GRAPHICS_KEY));
  } catch (error) {
    return "auto";
  }
}

function deviceInfo() {
  let gpu = "";
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (error) {
    gpu = "";
  }
  const touchOnly = Boolean(window.Device && window.Device.isTouchOnly(window.matchMedia && window.matchMedia.bind(window)));
  return { cores: navigator.hardwareConcurrency || 0, memoryGb: navigator.deviceMemory || 0, touchOnly, gpu };
}

let graphicsChoice = storedGraphics();
let autoTier = Quality.initialTier(deviceInfo());
let autoSettled = false;
const frameSamples = [];
let lastFrameAt = 0;
const currentTier = () => Quality.effectiveTier(graphicsChoice, autoTier);
postfx.setTier(currentTier());

// The first 90 frames of racing (not paused) decide whether auto steps down.
function sampleFrame(racing) {
  if (autoSettled || graphicsChoice !== "auto") return;
  const t = performance.now();
  if (!racing) { lastFrameAt = 0; return; }
  if (lastFrameAt) frameSamples.push(t - lastFrameAt);
  lastFrameAt = t;
  if (frameSamples.length >= 90) {
    autoSettled = true;
    // The first frames of a race carry one-off work: judge the rest.
    const next = Quality.adjustTier(autoTier, frameSamples.slice(10));
    if (next !== autoTier) {
      autoTier = next;
      postfx.setTier(currentTier());
    }
  }
}

function setGraphics(choice) {
  graphicsChoice = Quality.parseChoice(choice);
  try {
    window.localStorage.setItem(GRAPHICS_KEY, graphicsChoice);
  } catch (error) {
    // The choice holds for this visit only.
  }
  postfx.setTier(currentTier());
  return graphics();
}

function graphics() {
  return { choice: graphicsChoice, autoTier, tier: currentTier(), sampled: frameSamples.length, settled: autoSettled };
}

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

const api = { ready: false, failed: false, render, renderGarage, auditScenery, auditAdverts, auditPits, auditPrint, auditVenue, auditItemBoxes, inspect, prepare, setPhotoCamera, helmetInfo, setGraphics, graphics };

// A driver's painted helmet, read back (for the checks).
function helmetInfo(driverId) {
  const driver = (typeof DRIVERS !== "undefined" ? DRIVERS : []).find((d) => d.id === driverId);
  return driver ? paintedHelmet(driver) : null;
}

// Photo mode, for the site's promo shots (tools/capture-shots.js): a camera
// placed by hand instead of the chase camera. Each point is { x, y, d, h }:
// world x/y as the game has them, d a lap distance for the road height there,
// h the height above the road. null goes back to the chase camera.
let photoCamera = null;
function setPhotoCamera(shot) {
  photoCamera = shot || null;
}

// Build a circuit (geometry, scenery, shaders) ahead of its first frame, so
// the heavy work happens behind a loading panel instead of mid-countdown.
function prepare(track) {
  const world = ensureWorld(track);
  if (!world.compiled) {
    renderer.compile(scene, camera);
    world.compiled = true;
  }
  return true;
}

// The advert barriers, for the checks. Each quad's front is to the right of
// its run from its first edge to its second (the winding), and the print must
// run forward the same way; the back faces flip it (r3d/track.js,
// advertBarrierMaterial). Then the words read forward from either side,
// wherever the wall turns. And no quad may stand on a road at its own height.
function auditAdverts(track) {
  const world = ensureWorld(track);
  const { course } = world;
  const out = [];
  world.circuit.traverse((m) => {
    if (!m.userData.advertSide) return;
    const geo = m.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const index = geo.index;
    const backwards = [];
    const onRoad = [];
    // The wall's foot, quad by quad: it must never cross itself (a loop on
    // the inside of a tight bend).
    const foot = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    // Two triangles per quad, six indices: (first bottom, second bottom, first top) first.
    for (let t = 0; t < index.count; t += 6) {
      const ia = index.getX(t);
      const ib = index.getX(t + 1);
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, ib);
      if (a.distanceTo(b) < 0.01) continue;
      if (uv.getX(ib) <= uv.getX(ia)) backwards.push(Math.round(a.x) + "," + Math.round(a.z));
      foot.push([a.x, a.z, b.x, b.z]);
      const x = (a.x + b.x) / 2;
      const z = (a.z + b.z) / 2;
      const road = course.nearestSample(x, z);
      if (road && Math.hypot(road.x - x, road.y - z) < course.width && Math.abs(a.y - road.h) < 10) onRoad.push(Math.round(road.d));
    }
    let loops = 0;
    const crosses = ([ax, az, bx, bz], [cx, cz, dx, dz]) => {
      const side = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
      return side(ax, az, bx, bz, cx, cz) * side(ax, az, bx, bz, dx, dz) < 0 && side(cx, cz, dx, dz, ax, az) * side(cx, cz, dx, dz, bx, bz) < 0;
    };
    foot.forEach((seg, k) => {
      for (let j = Math.max(0, k - 60); j < k - 1; j += 1) if (crosses(foot[j], seg)) loops += 1;
    });
    out.push({ side: m.userData.advertSide, readsBothWays: Boolean(m.material.userData.readsBothWays), quads: index.count / 6, backwards, onRoad, loops });
  });
  return out;
}

// The pit complex, for the checks: the garages (eleven bays, the Safety
// Car's nearest the exit) stand beyond the working lane, nothing of the pit
// wall's stands reaches over any road, and the start gantry's pit-side post
// stands on the pit wall or past the whole complex -- never in the lane or a
// garage. Distances are from the nearest point of any stretch of the lap, so
// nothing can sit on another road either.
function auditPits(track) {
  const world = ensureWorld(track);
  const { course } = world;
  const lane = course.pitLane;
  world.group.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  // The closest any vertex of an object comes to a road's centreline.
  // How close an object's vertices come to the road: to its own stretch
  // (the pit zone and 300 either side) and to any other stretch of the lap.
  const own = (p) => lane && Math.abs(lane.rel(p.d) - Math.max(lane.entry, Math.min(lane.exit, lane.rel(p.d)))) <= 300;
  const closest = (obj) => {
    const best = { own: Infinity, other: Infinity, otherAt: null };
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        course.samples.forEach((p) => {
          if (Math.abs(v.y - p.h) >= 30) return;
          const gap = Math.hypot(p.x - v.x, p.y - v.z);
          if (own(p)) best.own = Math.min(best.own, gap);
          else if (gap < best.other) { best.other = gap; best.otherAt = Math.round(p.d); }
        });
      }
    });
    return best;
  };
  const garages = world.landmarks.getObjectByName("garages");
  const bays = garages ? garages.children.filter((o) => o.userData.bay).sort((a, b) => a.userData.bay.index - b.userData.bay.index) : [];
  const pitGroup = world.circuit.getObjectByName("pitLane");
  const stands = pitGroup ? ["pitStands", "pitStandRoofs"].map((name) => pitGroup.getObjectByName(name)).filter(Boolean) : [];
  // The gantry's post on the pit side: its offset across the road.
  const gantry = world.circuit.getObjectByName("gantry");
  let gantryPost = null;
  const postBoxes = [];
  if (gantry) gantry.children.filter((m) => m.userData.post).forEach((post) => postBoxes.push(new THREE.Box3().setFromObject(post)));
  if (gantry && lane) {
    const start = course.samples[0];
    gantry.children.filter((m) => m.userData.post).forEach((post) => {
      post.getWorldPosition(v);
      const off = (v.x - start.x) * start.nx + (v.z - start.y) * start.ny;
      if (Math.sign(off) === lane.side) gantryPost = Math.abs(off);
    });
  }
  const sc = bays.find((b) => b.userData.bay.safetyCar);
  const scDoor = sc ? (() => {
    // The front of its door: from the bay's middle, half its depth toward the road.
    const p = new THREE.Vector3(0, 0, -sc.userData.bay.depth / 2).applyMatrix4(sc.matrixWorld);
    return { x: p.x, z: p.z };
  })() : null;
  const wallMid = course.width + (Pit.WALL_IN + Pit.WALL_OUT) / 2;
  const g = garages ? closest(garages) : null;
  const st = stands.length ? stands.map(closest) : [];
  return {
    lane: lane ? { side: lane.side, entry: lane.entry, exit: lane.exit } : null,
    bays: bays.length,
    safetyCarBayLast: bays.length > 0 && bays[bays.length - 1].userData.bay.safetyCar && bays.filter((b) => b.userData.bay.safetyCar).length === 1,
    // From their own road: behind the working lane. From any other: past
    // its run-off and barrier (pitlane.js CLEAR), less a unit for rounding.
    garagesFromOwnRoad: g ? Math.round(g.own) : 0,
    garagesOwnNeed: Math.round(course.width + Pit.WORK_OUT),
    garagesFromOtherRoads: g ? Math.round(g.other) : 0,
    garagesOtherNeed: Math.round(course.width + (course.street ? Pit.CLEAR_STREET : Pit.CLEAR) - 1),
    stands: stands.length ? pitGroup.getObjectByName("pitStands").geometry.attributes.position.count / (3 * 24) : 0,
    // One opposite each team's garage, but none where the gantry stands on the wall.
    standsExpected: lane ? lane.garages.bays.filter((b) => !b.safetyCar && Math.abs(b.rel) > 11).length : 0,
    standsFromRoad: st.length ? Math.round(Math.min(...st.map((b) => Math.min(b.own, b.other)))) : 0,
    roadEdge: course.width,
    gantryPost: gantryPost === null ? null : Math.round(gantryPost * 10) / 10,
    // On the pit wall, or past the whole complex (in a mouth).
    // (Past it means past the garages' back where the line is at a garage.)
    // And not through a team's stand on the wall.
    gantryPostClear: gantryPost === null || ((Math.abs(gantryPost - wallMid) < 0.5
      || gantryPost > (!lane.inZone(0) ? 0 : lane.atGarage(0, 4) ? lane.garages.outer : lane.outerAt(0)) + 2)
      && !postBoxes.some((post) => (pitGroup?.userData.standBoxes || []).some((stand) => stand.intersectsBox(post)))),
    safetyCarDoor: scDoor,
  };
}

// Print (textures with words, marked by r3d/textures.js and the signs) must
// never read backwards: anything double-sided showing it flips it on its
// back faces (r3d/track.js readsBothWays). Lists what doesn't.
function auditPrint(track) {
  const world = ensureWorld(track);
  const found = { print: 0, backwards: [] };
  world.group.traverse((m) => {
    const mat = m.material;
    if (!m.isMesh || !mat || !mat.map || !mat.map.userData.print) return;
    found.print += 1;
    if (mat.side === THREE.DoubleSide && !mat.userData.readsBothWays) found.backwards.push(m.name || m.parent?.name || m.geometry.type);
  });
  return found;
}

// The venue moments, for the checks: the corner boards placed (and where,
// round the lap), and the tunnel as built (its roof's height above the road).
function auditVenue(track) {
  const world = ensureWorld(track);
  const boards = [];
  world.landmarks.traverse((o) => {
    if (!o.userData.corner) return;
    const p = world.course.nearestSample(o.position.x, o.position.z);
    const clear = world.course.clearance(o.position.x, o.position.z);
    boards.push({ board: o.userData.corner.board, wanted: Math.round(o.userData.corner.d), at: p ? Math.round(p.d) : null, clear: Math.round(clear) });
  });
  // The tunnel's roof as built: the lowest point of its ceiling above the road.
  const tunnel = world.circuit.getObjectByName("tunnel");
  let roof = null;
  if (tunnel) {
    const v = new THREE.Vector3();
    roof = Infinity;
    tunnel.updateMatrixWorld(true);
    tunnel.traverse((m) => {
      if (!m.isMesh || m.material.emissiveIntensity > 1) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const p = world.course.nearestSample(v.x, v.z);
        const off = p ? Math.abs((v.x - p.x) * p.nx + (v.z - p.y) * p.ny) : Infinity;
        // Over the road (not its walls), how high it is.
        if (p && off < world.course.width && v.y - p.h > 1) roof = Math.min(roof, v.y - p.h);
      }
    });
  }
  // Each bridge reverb zone lies on the lower road, with the bridge above.
  const bridges = (track.reverbZones || []).filter((z) => z.kind === "bridge").map((z) => {
    const total = track.totalLength;
    const centre = (z.from + ((z.to - z.from) % total + total) % total / 2) % total;
    const p = world.course.sampleAt(centre);
    let deck = Infinity;
    world.course.samples.forEach((q) => { if (q.h > p.h + 10) deck = Math.min(deck, Math.hypot(q.x - p.x, q.y - p.y)); });
    return { centre: Math.round(centre), height: +p.h.toFixed(1), deckAbove: Math.round(deck) };
  });
  return {
    corners: (track.corners || []).map((c) => c.board),
    boards,
    marshals: { wanted: (track.marshalPosts || []).length, placed: world.marshals ? world.marshals.children.length : 0 },
    tunnel: tunnel ? { roof: Math.round(roof), from: track.tunnel.from, to: track.tunnel.to } : null,
    bridges,
  };
}

// What is on screen right now, for the browser checks.
function inspect() {
  const flaps = {};
  if (current) current.cars.forEach((car, id) => { if (car.flap) flaps[id] = car.flap.rotation.z; });
  const layer = powerUpLayer.inspect();
  const fx = postfx.inspect();
  // Which painted helmet each car on track wears, by driver.
  const helmets = {};
  if (current) current.cars.forEach((car) => { if (car.helmet) helmets[car.helmet.driverId] = car.helmet.textureId; });
  const posts = current && current.marshals ? current.marshals.children.map((g) => ({ index: g.userData.post.index, flag: g.userData.post.state, x: Math.round(g.position.x), z: Math.round(g.position.z) })) : [];
  const life = current ? {
    posts,
    helicopter: helicopter.visible ? { x: helicopter.position.x, y: helicopter.position.y, z: helicopter.position.z, height: helicopter.position.y - current.course.heightAt(0) } : null,
    fireworks: current.life.fireworks || 0,
    starterWaving: Boolean(current.life.starter),
  } : null;
  return { flaps, helmets, life, tunnel: current ? { ...current.tunnel } : null, postfx: fx, graphics: graphics(), ...layer, boxScales: current ? current.boxes.map((b) => b.userData.scale ?? 1) : [], items: itemsInspect(layer) };
}
window.Render3D = api;

// The power-up models load alongside; nothing waits on them.
// The power-up models load alongside; nothing waits on them. Before they swap
// in, their shaders (and the game's own oil surface) are compiled, so the swap
// never stalls a frame mid-race.
loadItemModels({
  prepare(templates) {
    const holder = new THREE.Group();
    Object.values(templates).forEach((t) => holder.add(t.clone(true)));
    const plane = new THREE.PlaneGeometry(1, 1);
    itemRuntimeMaterials().forEach((m) => holder.add(new THREE.Mesh(plane, m)));
    scene.add(holder);
    const done = () => { scene.remove(holder); plane.dispose(); };
    const compiling = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera));
    return compiling.then(done, done);
  },
});
whenItemsReady(() => { if (current) current.boxes.forEach(upgradeItemBox); });

// What the checks see of the item models: whether each is in, and its size
// (measured once, from the model itself).
const ITEM_KINDS = ["itemBox", "oil", "debris", "undercut", "steward", "safetyCar"];
const itemSizes = {};
function itemsInspect(layer) {
  const { ready, failed } = itemsState();
  const templates = itemTemplates();
  const models = {};
  ITEM_KINDS.forEach((kind) => {
    const t = ready && templates[kind];
    if (!t) { models[kind] = { fromGlb: false }; return; }
    if (!itemSizes[kind]) itemSizes[kind] = new THREE.Box3().setFromObject(t).getSize(new THREE.Vector3()).toArray();
    models[kind] = { fromGlb: true, size: itemSizes[kind] };
  });
  const boxesFromGlb = Boolean(current) && current.boxes.length > 0 && current.boxes.every((b) => b.userData.body.userData.fromGlb);
  return { ready, failed, models, boxesFromGlb, visibleFromGlb: layer.visibleFromGlb, inViewFromGlb: itemsInView() };
}

// How many power-ups drawn from their models are inside the camera's view.
const frustum = new THREE.Frustum();
const viewMatrix = new THREE.Matrix4();
function itemsInView() {
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let n = 0;
  powerUpLayer.group.children.forEach((holder) => {
    const body = holder.userData.body;
    if (!holder.visible || !body || !body.userData.fromGlb) return;
    if (frustum.intersectsBox(new THREE.Box3().setFromObject(body))) n += 1;
  });
  return n;
}

loadCar(() => { api.ready = true; }, (error) => {
  console.warn("3D car model failed to load; using the 2D view.", error);
  api.failed = true;
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

// The TV helicopter and the fireworks belong to no one circuit.
const helicopter = buildHelicopter();
const fireworks = buildFireworks();
scene.add(helicopter, fireworks);

let tunnelPatchTick = 0;

let lastWallMs = 0;
function updateTrackside(world, track, life, now, dt) {
  const wall = performance.now();
  const wallDt = lastWallMs ? Math.min(100, wall - lastWallMs) : 0;
  lastWallMs = wall;
  const t = wall / 1000;
  // The show after the flag runs on real time (the race is fast-forwarded
  // then), held while paused: show.ms since the flag fell.
  const show = world.life.show || (world.life.show = { flag: 0, ms: 0 });
  const flag = life && life.flagOutAt ? life.flagOutAt : 0;
  if (flag !== show.flag) { show.flag = flag; show.ms = 0; }
  else if (flag && !life.paused) show.ms += wallDt;
  crowdUniforms.uTime.value = t;
  // At the flag the crowd's wave runs along the stands.
  crowdUniforms.uWave.value = flag ? Math.min(1, show.ms / 1000) : 0;
  updateMarshalPosts(world.marshals, life && life.flags, t);
  updateHelicopter(helicopter, world, life && life.helicopter, dt);
  world.life.fireworks = updateFireworks(fireworks, world.course, life && { ...life, stands: track.crowdStands }, flag ? show.ms : 0, currentTier());
  world.life.starter = updateStarter(world.starter, flag, show.ms, t);
}
// In the tunnel the light is the tunnel's own (r3d/tunnel-light.js); the
// camera only adapts its exposure -- in over half a second, as a TV camera
// does: dark going in, bright coming out.
function updateTunnelLight(world, track, dt) {
  const base = world.light;
  let inside = 0;
  if (track.tunnel && window.Venue) {
    const at = world.course.nearestSample(camera.position.x, camera.position.z);
    if (at && camera.position.y - at.h < TUNNEL_ROOF) inside = Venue.reverbAt(at.d, [track.tunnel], track.totalLength);
  }
  const t = world.tunnel;
  t.inside = inside;
  t.adapted += (inside - t.adapted) * (1 - Math.exp(-dt / 0.5));
  hemi.intensity = base.hemi;
  sun.intensity = base.sun;
  scene.environmentIntensity = base.env;
  renderer.toneMappingExposure = base.exposure * (1 + 1.4 * t.adapted);
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
  // The venue's light, as set: the tunnel dims it from here, frame by frame.
  const light = { hemi: hemi.intensity, sun: sun.intensity, exposure: renderer.toneMappingExposure, env: scene.environmentIntensity };
  group.add(buildSky(bg, venue.night, fogColor));
  group.add(buildGround(course, venue, bg));
  const circuit = buildCircuit(course, venue);
  group.add(circuit);
  // Decor from the track data first (it was laid out with the circuit), then
  // landmarks and trees fill round it. Everything claims its footprint.
  const decor = buildDecor(course, venue);
  group.add(decor);
  const landmarks = buildLandmarks(course, venue);
  group.add(landmarks);
  // Trackside life: the marshal posts (after everything else has claimed its
  // ground) and the starter by the line.
  const marshals = buildMarshalPosts(course, track.marshalPosts, venue);
  group.add(marshals);
  const starter = buildStarter(course);
  group.add(starter);
  const boxes = track.itemBoxes.map((b) => {
    const mesh = buildItemBox();
    mesh.userData.source = b;
    mesh.userData.baseY = course.heightAtPoint(b.x, b.y) + 11;
    mesh.position.set(b.x, mesh.userData.baseY, b.y);
    group.add(mesh);
    return mesh;
  });
  if (decor.userData.dropped) console.info(`${track.id}: ${decor.userData.dropped} scenery pieces dropped for lack of room`);
  return { trackId: track.id, course, venue, group, circuit, decor, landmarks, marshals, starter, boxes, cars: new Map(), fov: BASE_FOV, rumble: 0, light, tunnel: { inside: 0, adapted: 0 }, life: {} };
}

function disposeWorld(world) {
  scene.remove(world.group);
  world.cars.forEach((car) => scene.remove(car.root));
  // The item boxes' geometry belongs to the shared models: leave it; free only
  // what each box owns (its cloned glow materials).
  const shared = new Set();
  Object.values(itemTemplates()).forEach((t) => t.traverse((n) => { if (n.geometry) shared.add(n.geometry); }));
  world.boxes.forEach((b) => { if (b.userData.body.userData.fromGlb) disposeItemCopy(b.userData.body); });
  world.group.traverse((o) => {
    if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
  });
}

function ensureWorld(track) {
  if (current && current.trackId === track.id) return current;
  if (current) disposeWorld(current);
  current = buildWorld(track);
  scene.add(current.group);
  // The tunnel's light: its shape for the shaders, and every lit material
  // taught it (before the circuit's shaders are compiled).
  setTunnel(current.course, track.tunnel, TUNNEL_ROOF);
  lightInTunnel(scene);
  return current;
}

// ---------------------------------------------------------------------------
// Power-ups and particles
// ---------------------------------------------------------------------------

const powerUpLayer = createPowerUpLayer(scene);

const particleGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAX_PARTICLES * 3);
const pCol = new Float32Array(MAX_PARTICLES * 3);
const pSize = new Float32Array(MAX_PARTICLES);
const pAlpha = new Float32Array(MAX_PARTICLES);
const pLift = new Float32Array(MAX_PARTICLES);
particleGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
particleGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
particleGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1));
particleGeo.setAttribute("alpha", new THREE.BufferAttribute(pAlpha, 1));
particleGeo.setAttribute("lift", new THREE.BufferAttribute(pLift, 1));
// A sprite is one flat square at one depth, so the road would cut its lower
// half off in a hard line. Instead each pixel fades out as its own height
// above the road (the puff's lift, less how far down the sprite it is) nears
// zero: the puff settles onto the road, and anything really in front of it --
// a car, a barrier -- still hides it.
const particleMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { map: { value: makeSmokeTexture() }, scale: { value: 400 } },
  vertexShader: `attribute float size; attribute float alpha; attribute float lift; attribute vec3 color;
    varying vec3 vColor; varying float vAlpha; varying float vLift; varying float vRadius; uniform float scale;
    void main(){ vColor = color; vAlpha = alpha; vLift = lift;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = size * scale / -mv.z;
      // The sprite's radius in world units: scale is 0.9 x the drawing
      // buffer's height, so this is independent of distance and screen size.
      vRadius = 0.9 * size / projectionMatrix[1][1];
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform sampler2D map; varying vec3 vColor; varying float vAlpha; varying float vLift; varying float vRadius;
    void main(){ vec4 t = texture2D(map, gl_PointCoord);
      float height = vLift + (0.5 - gl_PointCoord.y) * 2.0 * vRadius;
      float ground = smoothstep(0.08 * vRadius, 0.45 * vRadius, height);
      gl_FragColor = vec4(vColor, t.a * vAlpha * ground);
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
    pLift[i] = (p.height || 3) + (1 - life) * 6;
    pPos[i * 3 + 1] = course.heightAtPoint(p.x, p.y) + pLift[i];
    pPos[i * 3 + 2] = p.y;
    tmpColor.set(p.color || "#ffffff");
    pCol[i * 3] = tmpColor.r;
    pCol[i * 3 + 1] = tmpColor.g;
    pCol[i * 3 + 2] = tmpColor.b;
    pSize[i] = (p.size || 5) * (2.2 + (1 - life) * 2.5);
    pAlpha[i] = life * 0.7;
  }
  particleGeo.setDrawRange(0, n);
  ["position", "color", "size", "alpha", "lift"].forEach((k) => { particleGeo.attributes[k].needsUpdate = true; });
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
      lightInTunnel(car.root);
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
    // DRS: the upper flap tilts open on its leading edge while DRS is active
    // (trailing edge up is a negative turn about the car's Z in three.js).
    if (car.flap) {
      const target = racer.drsUntil > now ? 1 : 0;
      const step = dt / 0.15;
      car.flapOpen += Math.max(-step, Math.min(step, target - car.flapOpen));
      car.flap.rotation.z = -car.flapOpen * DRS_OPEN;
    }
    const boosting = racer.formationUntil > now || racer.boostUntil > now;
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
  // three sizes the canvas with Math.floor: compare the same way, or a
  // fractional pixel ratio would resize on every frame.
  if (renderer.getPixelRatio() !== dpr || canvas3d.width !== Math.floor(w * dpr) || canvas3d.height !== Math.floor(h * dpr)) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    particleMat.uniforms.scale.value = h * dpr * 0.9;
    postfx.setSize(w, h, dpr);
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
  const { track, player, racers, cameraHeading, camPos, roll, shake, powerUps, particles: list, now } = frame;
  const dt = Math.min(0.05, Math.max(0, (now - (lastNow || now)) / 1000));
  lastNow = now;
  resize();
  const world = ensureWorld(track);
  const { course } = world;
  garage.group.visible = false;
  world.group.visible = true;
  powerUpLayer.group.visible = particles.visible = true;

  syncCars(world, racers, player, now, dt);
  // Compile every shader in the new scene while the grid is lining up, so
  // nothing stalls the first time it comes into view mid-race.
  if (!world.compiled) {
    renderer.compile(scene, camera);
    world.compiled = true;
  }
  if (powerUps) powerUpLayer.sync({ powerUps, racers, cars: world.cars, course, now, dt });
  syncParticles(list, course);
  world.boxes.forEach((b, i) => {
    const hidden = powerUps && powerUps.boxHidden[i];
    const u = b.userData;
    const target = hidden ? 0 : 1;
    // Burst away fast when taken, grow back more slowly with a shimmer.
    const rate = hidden ? dt / 0.15 : dt / 0.3;
    u.scale = (u.scale ?? 1) + Math.max(-rate, Math.min(rate, target - (u.scale ?? 1)));
    b.scale.setScalar(Math.max(0.0001, u.scale));
    b.visible = u.scale > 0.001;
    // It glows brighter while it grows back.
    const glow = 0.35 + (u.scale < 1 && !hidden ? (1 - u.scale) * 1.5 : 0);
    // Relative to each material's own resting glow (0.35 for the stand-in).
    u.glow.forEach((m) => { m.emissiveIntensity = (m.userData.baseEmissive ?? 0.35) * (glow / 0.35); });
    u.box.rotation.set(now / 900 + i, now / 700 + i, 0);
    b.position.y = u.baseY + Math.sin(now / 260 + i) * 1.5;
  });
  world.landmarks.userData.animate?.(dt);

  // Speed: the field of view opens up and the camera drops and pushes its
  // aim further down the road as the car gets going.
  const speed = Math.abs(player.speed || 0);
  const sf = Math.min(1, speed / 230);
  const boosting = player.formationUntil > now || player.boostUntil > now;
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
  if (photoCamera) {
    const { from, at } = photoCamera;
    camera.position.set(from.x, course.heightAt(from.d) + from.h, from.y);
    lookTarget.set(at.x, course.heightAt(at.d) + at.h, at.y);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookTarget);
    if (photoCamera.fov) setFov(photoCamera.fov);
  }
  // The "?" in each box keeps facing the camera (turning about the vertical
  // only), placed now the camera is: no frame's lag.
  world.boxes.forEach((b) => {
    const mark = b.userData.mark;
    if (mark) mark.rotation.y = Math.atan2(-(camera.position.z - b.position.z), camera.position.x - b.position.x);
  });

  // In the tunnel: the sky and the sun are shut out and the lamps take over,
  // and the camera's exposure adapts (in over half a second, as a TV camera
  // does) -- dark going in, bright coming out.
  updateTunnelLight(world, track, dt);
  updateTrackside(world, track, frame.trackside, now, dt);
  // Models loaded since (car bodies, items) learn the tunnel's light too.
  if (track.tunnel && (tunnelPatchTick = (tunnelPatchTick + 1) % 90) === 0) lightInTunnel(scene);

  // Shadows follow the player.
  sun.position.set(player.x + SUN_DIR.x * 700, ground + SUN_DIR.y * 700 + 150, player.y + SUN_DIR.z * 700);
  sun.target.position.set(player.x + cos * 130, ground, player.y + sin * 130);
  world.group.children.forEach((o) => {
    if (o.userData.followCamera) o.position.copy(camera.position);
  });

  // The frame, through the post-processing of the current tier.
  sampleFrame(Boolean(frame.racing));
  postfx.render({
    dt, now, trackId: track.id, speedFraction: sf, boosting, playerId: player.id,
    sunPosition: camera.position.clone().addScaledVector(SUN_DIR, 4000),
    occluders: [world.decor, world.landmarks, ...world.circuit.userData.occluders],
  });
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
  const targets = [world.decor, world.landmarks, world.marshals, world.starter].filter(Boolean);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const hits = [];
  course.samples.forEach((p, i) => {
    if (i % step) return;
    // At least `lanes` rays, and never more than 14 apart (the pit side is
    // far wider than the road).
    const count = Math.max(lanes, Math.ceil((p.outerL + p.outerR) / 14) + 1);
    for (let k = 0; k < count; k += 1) {
      // Across the whole width inside the barriers, left to right.
      const t = k / (count - 1);
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

// Every item box of a circuit over open road: rays straight down through its
// middle and corners meet no scenery above the road, and its lowest point (at
// the bottom of its bob) stays above the road. Returns what is wrong, if anything.
function auditItemBoxes(track) {
  const world = ensureWorld(track);
  world.group.updateMatrixWorld(true);
  const targets = [world.decor, world.landmarks, world.marshals, world.starter].filter(Boolean);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const problems = [];
  if (world.boxes.length !== track.itemBoxes.length) problems.push(`${world.boxes.length} boxes drawn for ${track.itemBoxes.length}`);
  world.boxes.forEach((b, i) => {
    // Measured at rest: the box spins, and a turned box's bounds are bigger.
    const spin = b.userData.box.rotation.clone();
    const scale = b.scale.clone();
    b.userData.box.rotation.set(0, 0, 0);
    b.scale.setScalar(1);
    b.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(b.userData.box).getSize(new THREE.Vector3());
    b.userData.box.rotation.copy(spin);
    b.scale.copy(scale);
    b.updateMatrixWorld(true);
    const half = Math.max(size.x, size.z) / 2;
    const road = world.course.heightAtPoint(b.position.x, b.position.z);
    // The bob moves the box 1.5 either way (see render()).
    if (b.userData.baseY - 1.5 - size.y / 2 < road) problems.push(`box ${i} dips into the road`);
    [[0, 0], [half, half], [half, -half], [-half, half], [-half, -half]].forEach(([dx, dz]) => {
      origin.set(b.position.x + dx, 3000, b.position.z + dz);
      ray.set(origin, down);
      const hit = ray.intersectObjects(targets, true).find((h) => !h.object.userData.ground && h.point.y > road + 0.5);
      if (hit) problems.push(`box ${i} under ${hit.object.name || hit.object.type}`);
    });
  });
  return problems;
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
  powerUpLayer.group.visible = particles.visible = false;
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
