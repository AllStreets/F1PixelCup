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
import { loadCar, buildCar, CAR_SCALE, helmetInfo as paintedHelmet, setTyreCompound, carLooks } from "./r3d/car.js";
import { buildCourse, buildCircuit, buildDecor, buildItemBox, upgradeItemBox, TUNNEL_ROOF } from "./r3d/track.js";
import { setTunnel, lightInTunnel } from "./r3d/tunnel-light.js";
import { buildMarshalPosts, updateMarshalPosts, buildHelicopter, updateHelicopter, buildFireworks, updateFireworks, buildStarter, updateStarter, HELI_HEIGHT, HELI_ASIDE } from "./r3d/trackside.js";
import { crowdUniforms } from "./r3d/track.js";
import { VENUES, buildLandmarks, waterMaterial } from "./r3d/landmarks.js";
import { loadTracksideModels, tracksideModel, tracksideModelsState, tracksideTemplates, venueModelsSettled, loadAllVenueModels } from "./r3d/models.js";
import { buildPeople, updatePeople, showCrowdFor, inspectPeople, PERSON_SCALE } from "./r3d/people.js";
import { showYachtsFor, updateYachts, inspectYachts, auditFleet } from "./r3d/yachts.js";
import { createPowerUpLayer, itemRuntimeMaterials } from "./r3d/powerups.js";
import { loadItemModels, whenItemsReady, itemsState, itemTemplates, disposeItemCopy } from "./r3d/items.js";
import { createPostFx } from "./r3d/postfx.js";
import { createRain, wettable, WET_GRASS, WET_RUNOFF } from "./r3d/rain.js";
import { loadDriver, driverLoaded } from "./r3d/driver.js";
import { createPodium } from "./r3d/podium.js";

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
// Checking every shader for errors as it compiles makes each compile wait
// for the GPU driver (seconds of frozen page when a circuit and its cars
// first draw). The shaders are known good; ?debug turns the check back on.
renderer.debug.checkShaderErrors = /[?&]debug\b/.test(window.location.search);
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
// Reflections for the car paint and glass: a neutral studio environment.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, 2, 9000);
const Replay = window.Replay;

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
// Rain and spray (r3d/rain.js), tiered with the rest.
const rain = createRain(scene);
rain.setTier(currentTier());

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
      postfx.setTier(raceFxTier());
      rain.setTier(currentTier());
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
  postfx.setTier(raceFxTier());
  rain.setTier(currentTier());
  if (ceremony.fx) ceremony.fx.setTier(currentTier());
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

const api = { ready: false, failed: false, render, renderGarage, setViewports, prepareReplay, auditScenery, auditAdverts, auditPits, auditPrint, auditVenue, auditItemBoxes, auditPeople, auditYachts, frameStats: frameStatsNow, loadAllModels: () => loadAllVenueModels(), inspect, prepare, setPhotoCamera, helmetInfo, setGraphics, graphics, podium: null };

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
// Returns true once the circuit is ready to draw. Its shaders compile a piece
// of the scene at a time, and the browser finishes them in the background
// (compileAsync), so the loading panel keeps moving instead of the page
// freezing; until then it returns false, and the game asks again next frame.
function prepare(track, racers, weather) {
  // The venue's own models (its landmarks, its yachts) first: the loading
  // panel stays up until they have loaded or failed.
  if (!venueModelsSettled(track.id)) return false;
  const world = ensureWorld(track);
  // Wet or dry before the first frame (only uniforms: nothing to compile).
  rain.apply(world, scene, weather === "wet");
  if (world.compiled) return true;
  if (!world.preparedFrom) {
    // The canvas at its size (the render targets are made now, not on the
    // first frame of the countdown), and the race's cars built.
    resize();
    (racers || []).forEach((racer) => ensureCar(world, racer));
    // The scene as the race draws it: the garage (and its studio lights) put
    // away, or every material would compile for lights the race doesn't
    // have and compile again, all at once, on the first frame.
    garage.group.visible = false;
    world.group.visible = true;
    powerUpLayer.group.visible = particles.visible = true;
    world.preparedFrom = performance.now();
    world.uploads = texturesIn();
    world.sent = new Map();
    if (!renderer.compileAsync) {
      renderer.compile(scene, camera);
      world.compiled = true;
      return true;
    }
    // Hidden things (the helicopter, the fireworks, rolled-up flags) compile
    // too: compile() takes every material under what it's given.
    world.toCompile = compileUnits(scene);
    world.lit = litBy(scene);
    world.compileJobs = compileUnseen(world);
    // The compile starts next frame: this one has built the circuit.
    world.steppedAt = performance.now();
    return false;
  }
  let start = performance.now();
  // Once a frame (the game asks, and so does its draw).
  if (start - (world.steppedAt || 0) < STEP_GAP_MS) return false;
  world.steppedAt = start;
  if (world.toCompile.length) {
    // A few new programs a frame: the browser compiles them in the
    // background, but a big batch still holds up the frames after it.
    const programs = renderer.info.programs.length;
    while (world.toCompile.length && performance.now() - start < COMPILE_BUDGET_MS
      && renderer.info.programs.length - programs < PROGRAMS_PER_FRAME) {
      world.compileJobs.push(renderer.compileAsync(world.toCompile.pop(), camera, world.lit));
    }
    if (!world.toCompile.length) {
      const ready = () => { world.shadersReady = true; };
      Promise.all(world.compileJobs).then(ready, ready);
    }
    return false;
  }
  // Its textures go to the GPU a few at a time while the shaders finish, not
  // all at once on the first frame. Images still loading are waited for, a
  // while (one that never arrives mustn't hold the start).
  start = performance.now();
  let left = 0;
  world.uploads.forEach((tex) => {
    if (world.sent.get(tex) === tex.version) return;
    if (tex.version === 0) {
      const image = tex.image;
      if (!image || (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement && !image.complete)) left += 1;
      return;
    }
    if (performance.now() - start > UPLOAD_BUDGET_MS) { left += 1; return; }
    renderer.initTexture(tex);
    world.sent.set(tex, tex.version);
  });
  const waited = start - world.preparedFrom > IMAGE_WAIT_MS;
  if (world.shadersReady && (left === 0 || waited)) world.compiled = true;
  return Boolean(world.compiled);
}

// Per loading frame: the time spent handing shaders to the browser, and how
// many new programs; and the shortest gap between two steps (one a frame).
const COMPILE_BUDGET_MS = 12;
const PROGRAMS_PER_FRAME = 4;
const STEP_GAP_MS = 8;

// Everything that draws, as pieces to compile one at a time (a piece's
// children compile with it); not the garage, which the race never shows.
function compileUnits(root) {
  const units = [];
  const walk = (o) => {
    if (o === garage.group || o.isLight) return;
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { units.push(o); return; }
    o.children.forEach(walk);
  };
  walk(root);
  return units;
}

// The scene as compile() needs it for one piece: the race's lights (those
// lit now) without a walk of the whole scene for every piece; its fog and
// environment are the scene's own.
function litBy(root) {
  const lights = [];
  root.traverseVisible((o) => { if (o.isLight) lights.push(o); });
  const stage = Object.create(root);
  stage.traverseVisible = (visit) => lights.forEach(visit);
  return stage;
}

// Every drawable in the race's scene, hidden ones too (not the garage).
function eachDrawable(visit) {
  const walk = (o) => {
    if (o === garage.group) return;
    if (o.material) visit(o);
    o.children.forEach(walk);
  };
  walk(scene);
}

// Time spent sending textures to the GPU per loading frame, and the longest
// the start waits for images still loading.
const UPLOAD_BUDGET_MS = 8;
const IMAGE_WAIT_MS = 4000;

// Every texture the scene's materials draw with (their maps and shader
// uniforms), once each.
function texturesIn() {
  const found = new Set();
  const look = (value) => { if (value && value.isTexture && !value.isRenderTargetTexture && !value.isFramebufferTexture) found.add(value); };
  eachDrawable((o) => {
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      Object.values(m).forEach(look);
      if (m.uniforms) Object.values(m.uniforms).forEach((u) => look(u && u.value));
    });
  });
  return [...found];
}

const FLIP_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
// Shaders three draws with materials of its own, which the scene's compile
// never sees: the shadow pass's depth material for each kind of caster
// (three's WebGLShadowMap shapes it from the caster's material), and the
// effects' passes. Compiled now with the lights and targets they are drawn
// with, so the first frame links none of them. The stand-in depth materials
// stay with the world (freeing them would free their programs).
function compileUnseen(world) {
  const jobs = [];
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  const before = renderer.getRenderTarget();
  const casters = new THREE.Group();
  const kinds = new Set();
  eachDrawable((o) => {
    if (!o.isMesh || !o.castShadow) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      if (!m || !m.visible) return;
      if (o.customDepthMaterial) { casters.add(new THREE.Mesh(o.geometry, o.customDepthMaterial)); return; }
      const side = m.shadowSide ?? FLIP_SIDE[m.side];
      const alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest;
      const kind = [o.isInstancedMesh, Boolean(o.instanceColor), side, Boolean(m.map), Boolean(m.alphaMap), alphaTest > 0,
        Boolean(m.displacementMap), m.wireframe, Object.keys(o.geometry.attributes).sort().join()].join("|");
      if (kinds.has(kind)) return;
      kinds.add(kind);
      const depth = new THREE.MeshDepthMaterial({ side, map: m.map, alphaMap: m.alphaMap, alphaTest, displacementMap: m.displacementMap, wireframe: m.wireframe });
      world.warmMaterials.push(depth);
      const stand = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, depth, 1) : new THREE.Mesh(o.geometry, depth);
      if (o.isInstancedMesh && o.instanceColor) stand.instanceColor = o.instanceColor;
      casters.add(stand);
    });
  });
  // The shadow pass draws with the scene's lights but none of its fog.
  const fog = scene.fog;
  scene.fog = null;
  renderer.setRenderTarget(target);
  jobs.push(renderer.compileAsync(casters, sun.shadow.camera, scene));
  scene.fog = fog;
  renderer.setRenderTarget(before);
  target.dispose();
  jobs.push(postfx.warm());
  return jobs;
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
    marshals: {
      wanted: (track.marshalPosts || []).length,
      placed: world.marshals ? world.marshals.children.length : 0,
      // Standing on the ground (the flat plane), none floating.
      offGround: world.marshals ? world.marshals.children.filter((g) => Math.abs(g.position.y) > 0.01).length : 0,
    },
    // The starter's rostrum: clear of the barriers and of other scenery.
    starter: world.starter ? { clear: Math.round(world.course.clearance(world.starter.position.x, world.starter.position.z)) } : null,
    tunnel: tunnel ? { roof: Math.round(roof), from: track.tunnel.from, to: track.tunnel.to } : null,
    bridges,
  };
}

function showOnScreen(world) {
  const v = new THREE.Vector3();
  const inView = () => v.z > -1 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
  let starterOnScreen = false;
  if (world.starter) {
    world.starter.userData.flag.getWorldPosition(v);
    v.project(camera);
    starterOnScreen = inView();
  }
  let sparksOnScreen = 0;
  const pos = fireworks.geometry.attributes.position;
  const count = fireworks.visible ? fireworks.geometry.drawRange.count : 0;
  for (let i = 0; i < count; i += 1) {
    v.fromBufferAttribute(pos, i).project(camera);
    if (inView()) sparksOnScreen += 1;
  }
  return { starterOnScreen, sparksOnScreen };
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
    finishShot: Boolean(current.life.finishShot),
    // What of the show is in the picture: the starter's flag, and how many of
    // the fireworks' sparks.
    ...showOnScreen(current),
  } : null;
  // Whether the race's world is being drawn (its shaders compiled), not held
  // behind the loading panel.
  const drawing = Boolean(current && current.compiled && !garage.group.visible);
  // The weather as drawn: the road's roughness, the rain and the spray.
  let road = null;
  let kerb = null;
  if (current) current.circuit.traverse((o) => {
    if (!road && o.material && o.material.userData.surface === "road") road = o.material;
    if (!kerb && o.material && o.material.uniforms && o.material.uniforms.wet) kerb = o.material;
  });
  const weather = {
    ...rain.inspect(), roadRoughness: road ? road.roughness : null, kerbWet: kerb ? kerb.uniforms.wet.value : null,
    sunIntensity: sun.intensity, fogFar: scene.fog ? scene.fog.far : null,
  };
  const cars = {};
  if (current) current.cars.forEach((car, id) => { cars[id] = carLooks(car); });
  // The trackside models and people (docs/superpowers/specs/2026-10-01-trackside-blender-design.md).
  const landmarks = [];
  if (current) current.landmarks.traverse((o) => { if (o.userData.landmark) landmarks.push({ ...o.userData.landmark, x: Math.round(o.position.x), z: Math.round(o.position.z) }); });
  const stands = current ? current.decor.children.filter((o) => o.userData.stand).map((o) => ({ x: Math.round(o.position.x), z: Math.round(o.position.z), yaw: +o.rotation.y.toFixed(3) })) : [];
  // What the GPU holds (for the checks: a circuit change must not leak).
  const memory = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  const stats = { calls: frameStats.calls, triangles: frameStats.triangles, cpuMs: +frameStats.cpuMs.toFixed(2) };
  const trackside = { memory, stats, models: tracksideModelsState(), landmarks, modelStands: stands.length, standSpots: stands, people: current ? inspectPeople(current.people, lastPlayers) : null, yachts: current ? inspectYachts(current.yachts) : null };
  // Where each car was drawn (game x, y), and whether it was.
  const drawn = {};
  if (current) current.cars.forEach((car, id) => { drawn[id] = { x: car.root.position.x, y: car.root.position.z, visible: car.root.visible }; });
  // The replay's camera, when one drew the last frame.
  const view = viewInfo;
  // Split screen: the views, and each one's camera as last drawn.
  const split = viewports ? { rects: viewports.map((r) => ({ ...r })), cams: viewCams.slice(0, viewports.length).map((c) => ({ ...c })) } : null;
  return { drawing, view, split, scissor: renderer.getScissorTest(), drawn, weather, cars, flaps, helmets, life, trackside, tunnel: current ? { ...current.tunnel } : null, postfx: fx, graphics: graphics(), ...layer, boxScales: current ? current.boxes.map((b) => b.userData.scale ?? 1) : [], items: itemsInspect(layer) };
}
window.Render3D = api;

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

// Ready once the car has loaded and the trackside models (landmarks, the
// grandstand, the people) have loaded or failed: a circuit is only built
// with everything it draws, so prepare() compiles all of it.
let carLoaded = false;
let tracksideSettled = false;
const markReady = () => { if (carLoaded && tracksideSettled) api.ready = true; };
loadCar(() => { carLoaded = true; markReady(); }, (error) => {
  console.warn("3D car model failed to load; using the 2D view.", error);
  api.failed = true;
});
loadTracksideModels(() => { tracksideSettled = true; markReady(); });

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
      // Rain: the sky greyed and the sun behind cloud (r3d/rain.js).
      overcast: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; uniform float overcast; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y*2.2, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.7));
        float grey = dot(c, vec3(0.3, 0.55, 0.15));
        c = mix(c, vec3(grey) * mix(0.9, 0.55, night), overcast * 0.75);
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25) * (1.0 - night) * (1.0 - overcast * 0.9);
        c += sunColor * pow(s, 400.0) * night * 1.5 * (1.0 - overcast * 0.8);
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
  else if (venue.ground === "sand") mat = wettable(new THREE.MeshStandardMaterial({ map: photo("aerial_sand", size / 160), color: color("#e6c898"), roughness: 1 }), WET_GRASS);
  else if (venue.ground === "city") mat = wettable(new THREE.MeshStandardMaterial({ map: photo("concrete_floor_02", size / 90), color: color("#55535a"), roughness: 0.95 }), WET_RUNOFF);
  else mat = wettable(new THREE.MeshStandardMaterial({ map: photo("leafy_grass", size / tile), color: color(venue.groundTint || bg.grass), roughness: 0.95 }), WET_GRASS);
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

// The finish shot: once the player has taken the chequered flag, for the
// first seconds of the show, a TV camera past the line looks back at it --
// the starter waving the flag, the fireworks over the stands, the cars
// coming home.
const FINISH_SHOT_MS = 9000;
const finishFrom = new THREE.Vector3();
function finishShot(world, life, player) {
  const show = world.life.show;
  if (!life || !life.flagOutAt || !player || !player.finished || !show || show.flag !== life.flagOutAt || show.ms > FINISH_SHOT_MS) {
    world.life.finishShot = false;
    return false;
  }
  const { course } = world;
  const lane = course.pitLane;
  const side = lane ? -lane.side : -1;
  const ahead = course.sampleAt(160);
  const back = course.sampleAt(course.track.totalLength - 140);
  const off = side * ((side > 0 ? ahead.outerR : ahead.outerL) - 10);
  // Above the street circuits' catch fences (32 high).
  finishFrom.set(ahead.x + ahead.nx * off, ahead.h + (course.street ? 46 : 34), ahead.y + ahead.ny * off);
  camera.position.copy(finishFrom);
  camera.up.set(0, 1, 0);
  camera.lookAt(back.x, back.h + 55, back.y);
  setFov(72);
  world.life.finishShot = true;
  return true;
}

let lastWallMs = 0;
function updateTrackside(world, track, life, now, dt, { players, racers } = {}) {
  const wall = performance.now();
  const wallDt = lastWallMs ? Math.min(100, wall - lastWallMs) : 0;
  lastWallMs = wall;
  // Trackside time: real time, held while the race is paused (flags, the
  // crowd and the show all stop with it).
  const paused = Boolean(life && life.paused);
  if (!paused) world.life.clock = (world.life.clock || 0) + wallDt;
  const t = (world.life.clock || 0) / 1000;
  // The show after the flag runs on real time (the race is fast-forwarded
  // then), held while paused: show.ms since the flag fell.
  const flag = life && life.flagOutAt ? life.flagOutAt : 0;
  let show;
  if (life && life.showMs !== undefined) {
    // A replay runs the show on its own clock (a seek lands in it), in its
    // own record: the race's show, behind the results, is left as it was.
    show = world.life.replayShow || (world.life.replayShow = { flag: 0, ms: 0 });
    show.flag = flag;
    show.ms = flag ? life.showMs : 0;
  } else {
    show = world.life.show || (world.life.show = { flag: 0, ms: 0 });
    if (flag !== show.flag) { show.flag = flag; show.ms = 0; }
    else if (flag && !paused) show.ms += wallDt;
  }
  crowdUniforms.uTime.value = t;
  // At the flag the crowd's wave runs along the stands.
  crowdUniforms.uWave.value = flag ? Math.min(1, show.ms / 1000) : 0;
  updateMarshalPosts(world.marshals, life && life.flags, t);
  updateHelicopter(helicopter, world, life && life.helicopter, dt);
  world.life.fireworks = updateFireworks(fireworks, world.course, life, track.crowdStands, flag ? show.ms : 0, currentTier());
  world.life.starter = updateStarter(world.starter, flag, show.ms, t);
  updatePeople(world.people, { players, racers, t, dt: paused ? 0 : dt });
  updateYachts(world.yachts, t);
}
// In the tunnel the light is the tunnel's own (r3d/tunnel-light.js); the
// camera only adapts its exposure -- in over half a second, as a TV camera
// does: dark going in, bright coming out.
function updateTunnelLight(world, track, dt, tunnel = world.tunnel) {
  const base = world.light;
  let inside = 0;
  if (track.tunnel && window.Venue) {
    const at = world.course.nearestSample(camera.position.x, camera.position.z);
    if (at && camera.position.y - at.h < TUNNEL_ROOF) inside = Venue.reverbAt(at.d, [track.tunnel], track.totalLength);
  }
  const t = tunnel;
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
  const yachts = landmarks.getObjectByName("yachts");
  // Trackside life: the marshal posts (after everything else has claimed its
  // ground) and the starter by the line.
  // The marshals are figures when the people model has the one they wear.
  const people0 = tracksideModel("people");
  const marshals = buildMarshalPosts(course, track.marshalPosts, venue, { figures: Boolean(people0 && people0.getObjectByName("crew")) });
  group.add(marshals);
  const starter = buildStarter(course);
  if (starter) group.add(starter);
  // The people (r3d/people.js): the crowd in the stands, the pit crews, the
  // photographers and the TV crew, after everything else has its ground.
  const people = buildPeople(course, { decor, landmarks, marshals });
  group.add(people);
  const boxes = track.itemBoxes.map((b) => {
    const mesh = buildItemBox();
    mesh.userData.source = b;
    mesh.userData.baseY = course.heightAtPoint(b.x, b.y) + 11;
    mesh.position.set(b.x, mesh.userData.baseY, b.y);
    group.add(mesh);
    return mesh;
  });
  if (decor.userData.dropped) console.info(`${track.id}: ${decor.userData.dropped} scenery pieces dropped for lack of room`);
  return { trackId: track.id, course, venue, group, circuit, decor, landmarks, yachts, marshals, starter, people, boxes, cars: new Map(), fov: BASE_FOV, rumble: 0, light, tunnel: { inside: 0, adapted: 0 }, life: {}, warmMaterials: [] };
}

function disposeWorld(world) {
  scene.remove(world.group);
  world.cars.forEach((car) => scene.remove(car.root));
  // The item boxes' geometry belongs to the shared models: leave it; free only
  // what each box owns (its cloned glow materials).
  // So does the trackside models' (landmarks, stands, the TV platform): their
  // copies share it. The materials made for this world (marked worldOwned:
  // the people's, the landmarks' and the stands' own) and their textures go.
  const shared = new Set();
  [...Object.values(itemTemplates()), ...tracksideTemplates()].forEach((t) => t.traverse((n) => { if (n.geometry) shared.add(n.geometry); }));
  world.boxes.forEach((b) => { if (b.userData.body.userData.fromGlb) disposeItemCopy(b.userData.body); });
  // Every texture the circuit drew with leaves the GPU too: one another
  // circuit shares (a cached photo) is simply uploaded again when it is next
  // drawn (prepare() does that behind the loading panel).
  const owned = new Set();
  const textures = new Set();
  world.group.traverse((o) => {
    if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
    // An instanced mesh's matrices are its own buffer, freed only with it.
    if (o.isInstancedMesh) o.dispose();
    [].concat(o.material || []).forEach((m) => {
      if (m.userData.worldOwned) owned.add(m);
      Object.values(m).forEach((v) => { if (v && v.isTexture) textures.add(v); });
      Object.values(m.uniforms || {}).forEach((u) => { if (u && u.value && u.value.isTexture) textures.add(u.value); });
    });
  });
  textures.forEach((t) => t.dispose());
  owned.forEach((m) => m.dispose());
  world.warmMaterials.forEach((m) => m.dispose());
}

function ensureWorld(track) {
  // Built before its venue's models had all arrived (an audit run early):
  // built again with them once they have.
  if (current && current.trackId === track.id && (current.modelsComplete || !venueModelsSettled(track.id))) return current;
  if (current) disposeWorld(current);
  current = buildWorld(track);
  current.modelsComplete = venueModelsSettled(track.id);
  scene.add(current.group);
  // The tunnel's light: its shape for the shaders, and every lit material
  // taught it (before the circuit's shaders are compiled).
  setTunnel(current.course, track.tunnel, TUNNEL_ROOF);
  // Only where there is a tunnel: the patch is a new shader for every lit
  // material, and compiling those everywhere would stall the start.
  if (track.tunnel) lightInTunnel(scene);
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

// A racer's car in this world, built the first time it is needed.
function ensureCar(world, racer) {
  let car = world.cars.get(racer.id);
  if (!car) {
    car = buildCar(racer.kart, racer.driver);
    if (world.course.track.tunnel) lightInTunnel(car.root);
    world.cars.set(racer.id, car);
    scene.add(car.root);
  }
  return car;
}

function syncCars(world, racers, player, now, dt, alsoShow, cut = false) {
  const { course } = world;
  const seen = new Set();
  racers.forEach((racer) => {
    const car = ensureCar(world, racer);
    seen.add(racer.id);
    // A finished car is parked out of the way, except the one in view (and,
    // in a replay or split screen, the players', as the race showed them).
    const visible = !racer.finished || racer.id === player.id || (Array.isArray(alsoShow) ? alsoShow.includes(racer.id) : racer.id === alsoShow);
    car.root.visible = visible;
    if (!visible) return;
    const spinning = racer.spinUntil > now;
    if (cut) car.spin = 0;
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
      car.flapOpen = cut ? target : car.flapOpen + Math.max(-step, Math.min(step, target - car.flapOpen));
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
  // A split-screen view has its own rule (twoplayer.js): it can be far wider.
  if (viewportOn && window.TwoPlayer) return window.TwoPlayer.viewFov(fov, aspect);
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
  // The effects work at the size of one split-screen view, or the canvas.
  const split = viewports ? viewports[0] : null;
  const effects = split ? `${split.w}x${split.h}` : "";
  // three sizes the canvas with Math.floor: compare the same way, or a
  // fractional pixel ratio would resize on every frame.
  if (renderer.getPixelRatio() !== dpr || canvas3d.width !== Math.floor(w * dpr) || canvas3d.height !== Math.floor(h * dpr) || effects !== sizedEffects) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    particleMat.uniforms.scale.value = h * dpr * 0.9;
    if (split) postfx.setSize(split.w, split.h, dpr, true);
    else postfx.setSize(w, h, dpr);
    sizedEffects = effects;
    // setSize puts the viewport back to the whole canvas, but not the
    // scissor: that goes back here, so nothing after a split is clipped.
    renderer.setScissorTest(false);
    viewportOn = false;
  }
}

// ---------------------------------------------------------------------------
// Split screen (docs/superpowers/specs/2026-10-01-split-screen-design.md):
// two views of the one scene, each in its own viewport. game.js sets the
// views (CSS px from the canvas's top left; null for one view) before the
// circuit is prepared, so the effects are sized for them before the first
// frame, then renders each with frame.viewIndex.
// ---------------------------------------------------------------------------

let viewports = null;
let viewportOn = false;
let sizedEffects = "";
const fullSize = new THREE.Vector2();

function setViewports(rects) {
  viewports = rects && rects.length ? rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })) : null;
  resize();
  // One view again: the whole canvas, and nothing of player 2's view kept.
  if (!viewports) {
    useViewport(null);
    postfx.dropViews();
    rain.dropViews();
  }
}

// Draw into one rectangle of the canvas (CSS px from its top left), or, with
// null, the whole of it again.
function useViewport(rect) {
  renderer.getSize(fullSize);
  if (!rect) {
    // (Cheap, and it must never be left on: the clips would cut the picture.)
    renderer.setScissorTest(false);
    if (!viewportOn) return;
    viewportOn = false;
    renderer.setViewport(0, 0, fullSize.x, fullSize.y);
    renderer.setScissor(0, 0, fullSize.x, fullSize.y);
    camera.aspect = fullSize.x / Math.max(1, fullSize.y);
    camera.updateProjectionMatrix();
    particleMat.uniforms.scale.value = fullSize.y * renderer.getPixelRatio() * 0.9;
    return;
  }
  viewportOn = true;
  const y = fullSize.y - rect.y - rect.h;
  renderer.setViewport(rect.x, y, rect.w, rect.h);
  renderer.setScissor(rect.x, y, rect.w, rect.h);
  renderer.setScissorTest(true);
  const aspect = rect.w / Math.max(1, rect.h);
  if (camera.aspect !== aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  particleMat.uniforms.scale.value = rect.h * renderer.getPixelRatio() * 0.9;
}

// The second view's own camera state; the first view's is the world's own
// (world.fov, world.rumble, world.tunnel), where the checks read it.
function viewState(world, index) {
  if (!index) return world;
  if (!world.second) world.second = { fov: BASE_FOV, rumble: 0, tunnel: { inside: 0, adapted: 0 } };
  return world.second;
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
let lastPlayers = [];
const lookTarget = new THREE.Vector3();

// Called by game.js each frame in place of the 2D road, scenery and cars.
// Split screen calls it once per view (frame.viewIndex, after setViewports):
// the first view also does the frame's own work (the cars, the power-ups, the
// particles, the boxes, trackside life); each view has its own camera.
let lastDt = 0;
// What each race frame drew (every view and pass) and the time its drawing
// took on the main thread, for the checks' budgets. Counted as the change in
// the renderer's totals across render() (it keeps counting across a frame's
// passes and views), so the garage's or the podium's drawing never adds in.
const frameStats = { calls: 0, triangles: 0, cpuMs: 0 };
const building = { calls: 0, triangles: 0, cpuMs: 0 };
renderer.info.autoReset = false;

function render(frame) {
  if (!api.ready) return null;
  const started = performance.now();
  const info = renderer.info.render;
  const calls0 = info.calls;
  const tris0 = info.triangles;
  // A new frame starts at the first view (split screen draws two).
  if (!frame.viewIndex) {
    frameStats.calls = building.calls;
    frameStats.triangles = building.triangles;
    frameStats.cpuMs = building.cpuMs;
    building.calls = 0;
    building.triangles = 0;
    building.cpuMs = 0;
  }
  try {
    return drawFrame(frame);
  } finally {
    building.calls += info.calls - calls0;
    building.triangles += info.triangles - tris0;
    building.cpuMs += performance.now() - started;
    // Totals that only grow would lose precision some day: start them again.
    if (info.triangles > 1e12) renderer.info.reset();
  }
}

// The last whole frame's drawing, cheaply (for the frame-time check).
function frameStatsNow() {
  return { calls: frameStats.calls, triangles: frameStats.triangles, cpuMs: frameStats.cpuMs };
}

function drawFrame(frame) {
  const { track, player, racers, cameraHeading, camPos, roll, shake, powerUps, particles: list, now } = frame;
  const index = viewports && frame.viewIndex !== undefined ? frame.viewIndex : 0;
  const rect = viewports && frame.viewIndex !== undefined ? viewports[index] || null : null;
  const first = index === 0;
  let dt = lastDt;
  if (first) {
    viewInfo = null;
    dt = Math.min(0.05, Math.max(0, (now - (lastNow || now)) / 1000));
    lastNow = now;
    lastDt = dt;
  }
  resize();
  // The venue's own models still on their way: nothing built yet (it would
  // only be built again when they land), the loading panel up.
  if (!venueModelsSettled(track.id)) {
    useViewport(null);
    renderer.setRenderTarget(null);
    renderer.setClearColor(scene.fog ? scene.fog.color : 0x000000, 1);
    renderer.clear();
    return { onKerb: false };
  }
  const world = ensureWorld(track);
  // Its shaders still compiling in the background (prepare): nothing to draw
  // yet but the sky's colour, under the loading panel -- drawing now would
  // compile them all at once and freeze the page.
  if (!prepare(track, racers, frame.weather)) {
    useViewport(null);
    renderer.setRenderTarget(null);
    renderer.setClearColor(scene.fog ? scene.fog.color : 0x000000, 1);
    renderer.clear();
    return { onKerb: false };
  }
  useViewport(rect);
  const { course } = world;
  const own = viewState(world, index);
  // A replay's cut (a seek, opening it): what eases from frame to frame
  // starts from the moment itself, not from wherever the last frame was.
  const cut = Boolean(frame.view && frame.view.cut);
  if (first) {
    garage.group.visible = false;
    world.group.visible = true;
    powerUpLayer.group.visible = particles.visible = true;
    syncCars(world, racers, player, now, dt, (frame.view && frame.view.alsoShow) || frame.alsoShow, cut);
    if (powerUps) powerUpLayer.sync({ powerUps, racers, cars: world.cars, course, now, dt });
    syncParticles(list, course);
    world.boxes.forEach((b, i) => {
      const hidden = powerUps && powerUps.boxHidden[i];
      const u = b.userData;
      const target = hidden ? 0 : 1;
      // Burst away fast when taken, grow back more slowly with a shimmer.
      const rate = hidden ? dt / 0.15 : dt / 0.3;
      u.scale = cut ? target : (u.scale ?? 1) + Math.max(-rate, Math.min(rate, target - (u.scale ?? 1)));
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
  }

  // Speed: the field of view opens up and the camera drops and pushes its
  // aim further down the road as the car gets going.
  const speed = Math.abs(player.speed || 0);
  const sf = Math.min(1, speed / 230);
  const boosting = player.formationUntil > now || player.boostUntil > now;
  const targetFov = BASE_FOV + 15 * Math.pow(sf, 1.4) + (boosting ? 8 : 0);
  own.fov += (targetFov - own.fov) * Math.min(1, dt * 4);
  setFov(own.fov);

  // Rumble: hard and fast over kerbs, looser off the track, a faint buzz at
  // top speed on the tarmac.
  const surface = surfaceUnder(world, player);
  const target = (surface.onKerb ? 1 : surface.offTrack ? 0.55 : 0) * Math.min(1, speed / 60) + sf * 0.08;
  own.rumble += (target - own.rumble) * Math.min(1, dt * 18);
  const t = now / 1000;
  const r = own.rumble;

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
  if (frame.view) {
    placeViewCamera(world, frame.view, player);
  } else if (photoCamera) {
    const { from, at } = photoCamera;
    camera.position.set(from.x, course.heightAt(from.d) + from.h, from.y);
    lookTarget.set(at.x, course.heightAt(at.d) + at.h, at.y);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookTarget);
    if (photoCamera.fov) setFov(photoCamera.fov);
  } else {
    finishShot(world, frame.trackside, player);
  }
  if (!frame.view) setNear(CAMERA_NEAR);
  // The "?" in each box keeps facing the camera (turning about the vertical
  // only), placed now the camera is: no frame's lag.
  world.boxes.forEach((b) => {
    const mark = b.userData.mark;
    if (mark) mark.rotation.y = Math.atan2(-(camera.position.z - b.position.z), camera.position.x - b.position.x);
  });

  // In the tunnel: the sky and the sun are shut out and the lamps take over,
  // and the camera's exposure adapts (in over half a second, as a TV camera
  // does) -- dark going in, bright coming out.
  // The weather: the circuit wet or dry, the rain round the camera, the
  // spray off the wheels.
  const wet = frame.weather === "wet";
  if (first) {
    rain.apply(world, scene, wet);
    // Intermediates in the wet: the tyres' lettering turns green.
    setTyreCompound(frame.weather);
  }
  updateTunnelLight(world, track, dt, own.tunnel);
  // Split screen: both players, so the crowd cheers each of them.
  const players = [player, ...(frame.alsoShow !== undefined ? racers.filter((r) => r.id === frame.alsoShow && r !== player) : [])];
  if (first) {
    lastPlayers = players;
    updateTrackside(world, track, frame.trackside, now, dt, { players, racers });
  }
  // Each view draws the near stands' crowd in 3D for its own camera.
  showCrowdFor(world.people, camera, currentTier());
  showYachtsFor(world.yachts, camera, currentTier(), scene.fog ? scene.fog.far : Infinity);
  // In the helicopter view the camera is in it.
  if (frame.view && frame.view.mode === "helicopter") helicopter.visible = false;
  rain.update({ camera, world, racers, dt, isWet: wet, view: index });
  // Models loaded since (car bodies, items) learn the tunnel's light too.
  if (first && track.tunnel && (tunnelPatchTick = (tunnelPatchTick + 1) % 90) === 0) lightInTunnel(scene);

  // Shadows follow the player.
  sun.position.set(player.x + SUN_DIR.x * 700, ground + SUN_DIR.y * 700 + 150, player.y + SUN_DIR.z * 700);
  sun.target.position.set(player.x + cos * 130, ground, player.y + sin * 130);
  world.group.children.forEach((o) => {
    if (o.userData.followCamera) o.position.copy(camera.position);
  });

  // The frame, through the post-processing of the current tier.
  if (first) sampleFrame(Boolean(frame.racing));
  // A replay's fixed cameras (trackside, the helicopter) do not move with the
  // car: no speed blur or streaks there, only onboard.
  const still = frame.view && frame.view.mode !== "onboard";
  postfx.render({
    view: index,
    // The view's rectangle from the canvas's bottom left, as the renderer has it.
    viewport: rect ? { x: rect.x, y: fullSize.y - rect.y - rect.h, w: rect.w, h: rect.h } : null,
    dt, now, trackId: track.id, speedFraction: still ? 0 : sf, boosting: still ? false : boosting, playerId: player.id,
    // Drops on the lens, out of the tunnel.
    rain: wet ? 1 - own.tunnel.adapted : 0,
    sunPosition: camera.position.clone().addScaledVector(SUN_DIR, 4000),
    occluders: [world.decor, world.landmarks, ...world.circuit.userData.occluders],
  });
  // Where each view's camera was, and whose car it followed (for the checks).
  const cam = viewCams[index] || (viewCams[index] = {});
  cam.playerId = player.id; cam.x = camera.position.x; cam.z = camera.position.z; cam.fov = camera.fov; cam.aspect = camera.aspect;
  return surface;
}
const viewCams = [];

// ---------------------------------------------------------------------------
// Replay cameras (docs/superpowers/specs/2026-10-01-replays-design.md):
// trackside TV cameras that pan and zoom after a car and cut to the next, the
// onboard T-cam, and the helicopter. The maths is in replay.js.
// ---------------------------------------------------------------------------

const CAMERA_NEAR = 2;
// The T-cam, in the car's own frame (x forward, y up): above and behind the
// airbox, looking down the road over the nose.
const TCAM = new THREE.Vector3(-0.95 * CAR_SCALE, 1.55 * CAR_SCALE, 0);
const TCAM_AT = new THREE.Vector3(8 * CAR_SCALE, 0.3 * CAR_SCALE, 0);
const TCAM_NEAR = 0.4;
// The helicopter view: from the helicopter, trailing the car in view.
const HELI_BEHIND = 250;
const HELI_SUBJECT = 320;
let viewInfo = null;

function setNear(near) {
  if (camera.near !== near) {
    camera.near = near;
    camera.updateProjectionMatrix();
  }
}

// A point on the lap at any distance, between the course's samples (the
// samples alone would step the helicopter along 6 at a time).
function pointOnLap(course, d) {
  const n = course.samples.length;
  const L = course.track.totalLength;
  const f = ((((d % L) + L) % L) / L) * n;
  const a = course.samples[Math.floor(f) % n];
  const b = course.samples[(Math.floor(f) + 1) % n];
  const t = f - Math.floor(f);
  const mix = (u, v) => u + (v - u) * t;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), h: mix(a.h, b.h), nx: mix(a.nx, b.nx), ny: mix(a.ny, b.ny) };
}

// The TV cameras of a circuit, placed once, when a replay there first opens
// (prepareReplay): off the track through the claim system, each where it sees
// most of its stretch past the scenery, the landmarks and what of the circuit
// stands up off the road (its bridges and gantry, as the sun's flare is
// hidden by).
// A TV camera's height over the road: the lowest of these that sees its
// stretch (26 is about 4 m; 80, a crane over a street circuit's fences).
const TV_HEIGHTS = [26, 40, 60, 80];
function tvCameras(world) {
  if (world.tvCams) return world.tvCams;
  const { course } = world;
  world.group.updateMatrixWorld(true);
  // (And the catch fences: seen through from right behind, a fence fills the
  // shot, so a camera rises until it looks over them.)
  const fences = [];
  world.circuit.traverse((o) => { if (o.userData.catchFence) fences.push(o); });
  const blockers = [world.decor, world.landmarks, ...(world.circuit.userData.occluders || []), ...fences].filter(Boolean);
  // Each blocker's box in the world (each instance's, for the trees and
  // buildings drawn instanced): a ray is tested against the boxes first, and
  // only a box it hits is looked at closely (a single mesh exactly; an
  // instance by its box, near enough for scoring a view). Far cheaper than
  // raycasting the whole scenery for every ray.
  const boxes = [];
  const m = new THREE.Matrix4();
  blockers.forEach((root) => root.traverseVisible((o) => {
    if (!o.isMesh || o.userData.ground) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, m);
        boxes.push({ box: o.geometry.boundingBox.clone().applyMatrix4(m.premultiply(o.matrixWorld)), mesh: null });
      }
    } else {
      boxes.push({ box: o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld), mesh: o });
    }
  }));
  // The boxes filed on a grid over the ground, so a ray only meets those
  // in the cells its stretch crosses.
  const CELL = 200;
  const grid = new Map();
  const cell = (i, j) => `${i},${j}`;
  boxes.forEach((item, n) => {
    item.stamp = -1;
    for (let i = Math.floor(item.box.min.x / CELL); i <= Math.floor(item.box.max.x / CELL); i += 1) {
      for (let j = Math.floor(item.box.min.z / CELL); j <= Math.floor(item.box.max.z / CELL); j += 1) {
        const key = cell(i, j);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(n);
      }
    }
  });
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let stamp = 0;
  const visible = (a, b) => {
    from.set(a.x, a.y, a.z);
    dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const far = dir.length() - 2;
    ray.set(from, dir.normalize());
    ray.far = far;
    stamp += 1;
    for (let i = Math.floor(Math.min(a.x, b.x) / CELL); i <= Math.floor(Math.max(a.x, b.x) / CELL); i += 1) {
      for (let j = Math.floor(Math.min(a.z, b.z) / CELL); j <= Math.floor(Math.max(a.z, b.z) / CELL); j += 1) {
        const list = grid.get(cell(i, j));
        if (!list) continue;
        for (const n of list) {
          const item = boxes[n];
          if (item.stamp === stamp) continue;
          item.stamp = stamp;
          if (!ray.ray.intersectBox(item.box, hit) || hit.distanceTo(from) > far) continue;
          if (!item.mesh || ray.intersectObject(item.mesh, false).length > 0) return false;
        }
      }
    }
    return true;
  };
  const started = performance.now();
  world.tvCams = window.Replay.placeTvCameras(course, { heights: TV_HEIGHTS, visible });
  world.tvCamsMs = performance.now() - started;
  // The nearest any of them stands to its barriers (for the checks).
  world.tvCamsClearance = world.tvCams.length ? Math.min(...world.tvCams.map((c) => course.clearance(c.x, c.z))) : null;
  return world.tvCams;
}

// Before a replay opens: its circuit's TV cameras, so no frame of it waits
// on placing them.
function prepareReplay(track) {
  if (!api.ready || !track || !venueModelsSettled(track.id)) return;
  tvCameras(ensureWorld(track));
}

const viewTarget = new THREE.Vector3();
function placeViewCamera(world, view, focus) {
  const { course } = world;
  const L = course.track.totalLength;
  const car = world.cars.get(focus.id);
  const road = course.heightAt(focus.trackDistance || 0);
  let cam = -1;
  if (view.mode === "onboard" && car) {
    car.root.updateMatrixWorld(true);
    camera.position.copy(TCAM).applyMatrix4(car.root.matrixWorld);
    viewTarget.copy(TCAM_AT).applyMatrix4(car.root.matrixWorld);
    camera.up.set(0, 1, 0);
    camera.lookAt(viewTarget);
    setNear(TCAM_NEAR);
    setFov(64);
  } else if (view.mode === "helicopter") {
    // Behind and beside the car along the road's direction there (taken over
    // 300 of road, so a corner turns the shot gently, never in a snap).
    const d = focus.trackDistance || 0;
    const here = pointOnLap(course, d);
    const a = pointOnLap(course, d - 150);
    const b = pointOnLap(course, d + 150);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    camera.position.set(focus.x - tx * HELI_BEHIND - ty * HELI_ASIDE, here.h + HELI_HEIGHT, focus.y - ty * HELI_BEHIND + tx * HELI_ASIDE);
    viewTarget.set(focus.x, road + 2, focus.y);
    camera.up.set(0, 1, 0);
    camera.lookAt(viewTarget);
    setNear(CAMERA_NEAR);
    setFov(Replay.zoomFov(camera.position.distanceTo(viewTarget), HELI_SUBJECT));
  } else {
    const cams = tvCameras(world);
    cam = Replay.tvCameraFor(cams, focus.trackDistance || 0, L);
    const c = cams[cam];
    if (c) camera.position.set(c.x, c.y, c.z);
    // Aimed a little ahead of the car, as an operator leads a moving subject.
    const lead = 6 + Math.abs(focus.speed || 0) * 0.04;
    viewTarget.set(focus.x + Math.cos(focus.heading) * lead, road + 3, focus.y + Math.sin(focus.heading) * lead);
    camera.up.set(0, 1, 0);
    camera.lookAt(viewTarget);
    setNear(CAMERA_NEAR);
    setFov(Replay.zoomFov(camera.position.distanceTo(viewTarget)));
  }
  viewInfo = {
    mode: view.mode, focusId: focus.id, cam,
    x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov, near: camera.near,
    clearance: course.clearance(camera.position.x, camera.position.z),
    ground: course.heightAtPoint(camera.position.x, camera.position.z),
    toCar: Math.hypot(camera.position.x - focus.x, camera.position.z - focus.y),
    carY: car ? car.root.position.y : null,
    cams: world.tvCams ? world.tvCams.length : 0,
    // The nearest any TV camera of this circuit stands to its barriers.
    camsClearance: world.tvCams ? world.tvCamsClearance : null,
    camsMs: world.tvCamsMs || 0,
  };
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
  // Every yacht drawn (a view may have left some out of sight).
  showYachtsFor(world.yachts, null, "high");
  const targets = [world.decor, world.landmarks, world.marshals, world.starter, world.people].filter(Boolean);
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

// Every yacht at a circuit, against the track: the least clearance over
// its hull's footprint (it must be past the quays, on the water).
function auditYachts(track) {
  const world = ensureWorld(track);
  const info = inspectYachts(world.yachts);
  if (!info) return null;
  let least = Infinity;
  info.yachts.forEach((y) => {
    const c = Math.cos(y.heading);
    const s = Math.sin(y.heading);
    for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) {
      for (const v of [-0.5, 0, 0.5]) {
        const x = y.x + u * y.length * c - v * y.beam * s;
        const z = y.z + u * y.length * s + v * y.beam * c;
        least = Math.min(least, world.course.clearance(x, z, 600));
      }
    }
  });
  return { count: info.count, moored: info.moored, anchored: info.anchored, leastClearance: Math.round(least), ...auditFleet(world.yachts) };
}

// Every person placed at a circuit, against the track: none may stand
// inside the barriers (on the road, its run-off or the pit lane). Their
// clearance is how far outside the nearest barrier each one's feet are.
function auditPeople(track) {
  const world = ensureWorld(track);
  const figures = world.people ? world.people.userData.figures : [];
  const byKind = {};
  const onRoad = [];
  const samples = {};
  let least = Infinity;
  figures.forEach((f) => {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
    if (!samples[f.kind]) samples[f.kind] = [];
    if (samples[f.kind].length < 6) samples[f.kind].push({ x: Math.round(f.x), y: Math.round(f.y), z: Math.round(f.z) });
    // A body's half width at the car's scale: about 0.3 m.
    const clear = world.course.clearance(f.x, f.z) - 2;
    least = Math.min(least, clear);
    if (clear < 0) onRoad.push({ kind: f.kind, x: Math.round(f.x), z: Math.round(f.z), clear: Math.round(clear * 10) / 10 });
  });
  // Every figure, where it stands and which way it faces at rest (its +x
  // turned by yaw), for the checks.
  const all = figures.map((f) => ({ kind: f.kind, x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(2), yaw: +f.yaw.toFixed(4), base: f.base === undefined ? undefined : +f.base.toFixed(4) }));
  // Under a roof (the marshals' posts): the least room over a head (a
  // figure is 1.78 m, 10.7 units, tall).
  const roofed = figures.filter((f) => f.roof !== undefined);
  const headroom = roofed.length ? Math.round(Math.min(...roofed.map((f) => f.roof - (f.y + 1.8 * PERSON_SCALE))) * 10) / 10 : null;
  return { count: figures.length, byKind, onRoad, samples, figures: all, headroom, leastClearance: Math.round(least * 10) / 10 };
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
  useViewport(null);
  if (current) {
    disposeWorld(current);
    current = null;
  }
  powerUpLayer.group.visible = particles.visible = false;
  rain.update({ camera, world: null, racers: [], dt: 0, isWet: false });
  // The showroom car is on dry tyres, whatever the last race was.
  setTyreCompound("dry");
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
  setNear(CAMERA_NEAR);
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

// ---------------------------------------------------------------------------
// The podium ceremony (r3d/podium.js): its own scene, drawn while the podium
// screen is up. begin() builds it and compiles it in the background; frame()
// draws nothing (drawing: false, the page keeps its 2D steps) until it can
// draw without a stall; end() frees it all.
// ---------------------------------------------------------------------------

const ceremony = { podium: null, fx: null, size: "", driverLoading: false, last: null };

// The race's own effects hold full-size buffers; while the ceremony (with
// effects of its own) has the screen, they are released.
function raceFxTier() {
  return ceremony.podium ? "low" : currentTier();
}

// The driver model, fetched ahead (the cup's last results screen asks).
function podiumPreload() {
  if (driverLoaded() || ceremony.driverLoading) return;
  ceremony.driverLoading = true;
  loadDriver(() => { ceremony.driverLoading = false; }, (error) => {
    ceremony.driverLoading = false;
    console.warn("Driver model failed to load; the podium stays 2D.", error);
  });
}

// summary: { cup: { id, name }, podium: [{ place, driverId, points }] }
function podiumBegin(summary) {
  const entries = summary.podium.map((p) => {
    const driver = DRIVERS.find((d) => d.id === p.driverId);
    return driver ? { place: p.place, driver, team: getTeamForDriver(driver), points: p.points } : null;
  }).filter(Boolean);
  if (!api.ready || entries.length !== 3) {
    podiumEnd();
    return false;
  }
  // A ceremony already up gives way; the race's effects stay released.
  podiumEnd(false);
  podiumPreload();
  // The race's circuit is done with: free it now, as the pit lane would.
  if (current) {
    disposeWorld(current);
    current = null;
  }
  const tier = currentTier();
  const podium = createPodium(renderer, { entries, cup: summary.cup, tier, environment: scene.environment });
  const fx = createPostFx(renderer, podium.scene, podium.camera);
  fx.setTier(tier);
  podium.setFx(fx);
  ceremony.podium = podium;
  ceremony.fx = fx;
  ceremony.size = "";
  ceremony.last = podium;
  postfx.setTier(raceFxTier());
  return true;
}

// reserve: the page's title box over the picture (CSS px), kept clear of the wall's.
function podiumFrame(now, reserve = null) {
  const podium = ceremony.podium;
  if (!podium || !api.ready) return { drawing: false };
  podium.setReserve(reserve);
  resize();
  useViewport(null);
  const w = canvas2d.clientWidth || canvas2d.width;
  const h = canvas2d.clientHeight || canvas2d.height;
  const dpr = renderer.getPixelRatio();
  const size = `${w}x${h}@${dpr}`;
  if (size !== ceremony.size) {
    ceremony.size = size;
    podium.setSize(w, h);
    ceremony.fx.setSize(w, h, dpr);
  }
  if (!podium.prepare()) {
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x06070b, 1);
    renderer.clear();
    return { drawing: false };
  }
  const t = podium.render(now);
  ceremony.title = podium.titleRect(w, h);
  return { drawing: true, t, anchors: podium.anchors(w, h), platesIn: podium.platesIn(t) };
}

// restore: give the race's effects back (not when a new ceremony follows).
function podiumEnd(restore = true) {
  const had = Boolean(ceremony.podium);
  if (ceremony.podium) ceremony.podium.dispose();
  if (ceremony.fx) ceremony.fx.dispose();
  ceremony.podium = null;
  ceremony.fx = null;
  if (had && restore) postfx.setTier(raceFxTier());
}

function podiumInspect() {
  const memory = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs ? renderer.info.programs.length : null };
  const racePostfx = postfx.inspect().frame;
  if (!ceremony.podium) return { active: false, memory, racePostfx, lastDisposed: ceremony.last ? ceremony.last.isDisposed() : null };
  return { active: true, memory, racePostfx, ...ceremony.podium.inspect(), owned: ceremony.podium.owned(), title: ceremony.title || null };
}

// Where the wall's title would be on screen at time t, at this window's size.
function podiumTitleAt(t) {
  if (!ceremony.podium || !ceremony.podium.ready()) return null;
  return ceremony.podium.titleRect(canvas2d.clientWidth || canvas2d.width, canvas2d.clientHeight || canvas2d.height, t);
}

api.podium = { preload: podiumPreload, begin: podiumBegin, frame: podiumFrame, end: podiumEnd, inspect: podiumInspect, titleAt: podiumTitleAt };
