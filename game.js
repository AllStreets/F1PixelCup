const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// The view fills whatever box the page gives it, at any size or aspect ratio.
// Everything is drawn in logical units: the logical view always covers at
// least the 1024x576 area the HUD was designed for, and grows past it in
// whichever direction the window is longer, so HUD elements anchored to the
// right or bottom edge stay on the real edge instead of being letterboxed or
// cut off. The backing store matches the element's real pixels.
const SAFE_WIDTH = 1024;
const SAFE_HEIGHT = 576;
const view = { width: SAFE_WIDTH, height: SAFE_HEIGHT, scale: 1 };

function fitViewToElement() {
  const cssWidth = canvas.clientWidth || SAFE_WIDTH;
  const cssHeight = canvas.clientHeight || SAFE_HEIGHT;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const fit = Math.min(cssWidth / SAFE_WIDTH, cssHeight / SAFE_HEIGHT);
  view.width = cssWidth / fit;
  view.height = cssHeight / fit;
  view.scale = fit * dpr;
  // Lets the timing tower and ticker line up with the HUD at any size.
  if (fitViewToElement.lastFit !== fit) {
    fitViewToElement.lastFit = fit;
    document.documentElement.style.setProperty("--hud-scale", fit.toFixed(4));
  }
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
}

// The game page's DOM belongs to screens.js; the game only needs these two.
const ui = {
  canvasShell: document.getElementById("canvas-shell"),
  countdownBanner: document.getElementById("countdown-banner"),
  viewLoading: document.getElementById("view-loading"),
};

// Which view draws the world. "loading" until the 3D renderer is ready (only a
// loading state shows, never the old 2D car). "2d" only when 3D reports that
// it failed, when its boot script never ran, or when its download has stalled:
// a slow connection keeps the loading state for as long as files keep arriving.
const BOOT_AT = performance.now();
const BOOT_TIMEOUT_MS = 10000;
// Once the renderer is running, the car and textures report as they arrive:
// 20 s of silence is a stall. Before that, Three.js itself is downloading, and
// a large module gives no sign of progress until it lands, so allow longer.
const STALL_TIMEOUT_MS = 20000;
const MODULE_STALL_TIMEOUT_MS = 60000;
const downloadWatch = { files: 0, at: BOOT_AT, stalled: false };
function worldView() {
  const renderer = window.Render3D;
  if (renderer && renderer.ready) return "3d";
  if (renderer && renderer.failed) return "2d";
  const now = performance.now();
  const boot = window.Render3DBoot;
  if (!boot) return now - BOOT_AT > BOOT_TIMEOUT_MS ? "2d" : "loading";
  // Once a stall has put the 2D view up it stays up (unless the car does
  // arrive, above), rather than flickering back to the loader.
  if (downloadWatch.stalled) return "2d";
  // Only the 3D renderer's own files count as progress -- not, say, the
  // showroom photo the 2D view loads.
  const files = performance.getEntriesByType("resource")
    .filter((entry) => /\/(vendor\/three|r3d|render3d|assets\/(f1_car|textures))/.test(entry.name)).length;
  if (files !== downloadWatch.files) {
    downloadWatch.files = files;
    downloadWatch.at = now;
  }
  const lastProgress = Math.max(downloadWatch.at, boot.startedAt || 0, boot.moduleAt || 0, boot.progressAt || 0);
  const limit = boot.moduleAt ? STALL_TIMEOUT_MS : MODULE_STALL_TIMEOUT_MS;
  if (now - lastProgress > limit) downloadWatch.stalled = true;
  return downloadWatch.stalled ? "2d" : "loading";
}

// A crash inside the 3D renderer must not freeze the game: report it once,
// mark 3D as failed, and the race carries on in the 2D view.
function render3dSafely(draw) {
  try {
    return { ok: true, value: draw() };
  } catch (error) {
    console.warn("3D renderer crashed; switching to the 2D view.", error);
    if (window.Render3D) {
      window.Render3D.ready = false;
      window.Render3D.failed = true;
    }
    // Take the 3D canvas away too, so its last frame can't linger behind.
    const canvas3d = document.getElementById("game3d");
    if (canvas3d) canvas3d.style.display = "none";
    ui.canvasShell.classList.remove("has-3d");
    return { ok: false, value: null };
  }
}

// A circuit's first appearance: the panel says so for one frame, then the
// circuit is built (half a second of work) while the panel covers it. The
// lights and the timing of the field wait until it's done.
function prepareCircuit() {
  const job = state.preparing;
  if (!job) return;
  const view3d = worldView();
  if (view3d === "loading") return;
  if (view3d !== "3d" || !window.Render3D.prepare) {
    state.preparing = null;
    return;
  }
  if (!job.painted) {
    job.painted = true;
    return;
  }
  const track = TRACKS.find((t) => t.id === job.trackId) || state.track;
  // Not ready yet (its shaders still compiling): ask again next frame. A
  // renderer failure ends the wait (the 2D view takes over).
  const ready = render3dSafely(() => window.Render3D.prepare(track, state.racers, state.weather));
  if (ready.ok && ready.value === false) return;
  state.preparing = null;
  state.preparedAt = performance.now();
  // The lights start from here.
  if (state.phase === "countdown") state.countdownStart = performance.now();
}

function setViewLoadingText(text) {
  const label = document.getElementById("view-loading-text");
  if (label && label.textContent !== text) label.textContent = text;
}

function showViewLoading(where) {
  if (!ui.viewLoading) return;
  const loading = where !== null;
  if (ui.viewLoading.hidden === loading) ui.viewLoading.hidden = !loading;
  if (loading && ui.viewLoading.dataset.where !== where) ui.viewLoading.dataset.where = where;
}

const TAU = Math.PI * 2;

// The play area is no longer the size of the canvas. The canvas is just the
// window we look through; circuits are laid out in this larger world.
const WORLD = { width: 1800, height: 1100 };

// The difficulty is fixed for the whole cup when it starts: the AI, the
// points multiplier and the rating all use the one the cup is run on, whatever
// is clicked in the garage afterwards.
function getDifficulty() {
  const index = state.phase !== "garage" && state.cupDifficulty !== null ? state.cupDifficulty : state.difficulty;
  return DIFFICULTIES[clamp(index || 0, 0, DIFFICULTIES.length - 1)];
}

const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const TRACK_WIDTH_SCALE = 1.5;
const SHORTCUT_WIDTH_SCALE = 1.65;




function trackDefinition(definition) {
  const shape = TRACK_SHAPES[definition.id];
  const shapePoints = shape.points;
  const options = {
    ...definition,
    points: shapePoints,
    decor: shape.decor,
    itemBoxes: shape.itemBoxes,
    bridges: shape.bridges,
    world: shape.world,
    pit: shape.pit,
    tunnel: shape.tunnel || null,
    corners: shape.corners || [],
    // Shortcuts are switched off (shouldUseShortcutRoute), but the route code
    // still expects one; give it a short stub that lies along the circuit.
    shortcut: {
      entry: { ...shapePoints[6] },
      exit: { ...shapePoints[9] },
      width: 26,
      points: [{ ...shapePoints[6] }, { ...shapePoints[7] }, { ...shapePoints[8] }, { ...shapePoints[9] }],
      color: "#00d2be",
    },
  };
  const { points } = options;
  const roadWidth = options.roadWidth * TRACK_WIDTH_SCALE;
  const startHeading = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const shortcut = {
    ...options.shortcut,
    width: options.shortcut.width * SHORTCUT_WIDTH_SCALE,
  };
  const segments = buildSegments(points, roadWidth, true);
  segments.isMain = true;
  const shortcutEntrySurface = findClosestSurfaceOnSegments(shortcut.entry, segments, roadWidth, false);
  const shortcutExitSurface = findClosestSurfaceOnSegments(shortcut.exit, segments, roadWidth, false);
  const mergeLength = clamp(shortcut.width * 1.05, 24, 40);
  const shortcutPoints = [...shortcut.points];
  const entryTangentX = shortcutEntrySurface.tangentX;
  const entryTangentY = shortcutEntrySurface.tangentY;
  const exitTangentX = shortcutExitSurface.tangentX;
  const exitTangentY = shortcutExitSurface.tangentY;
  const entryMergePoint = {
    x: shortcutEntrySurface.point.x + entryTangentX * mergeLength,
    y: shortcutEntrySurface.point.y + entryTangentY * mergeLength,
  };
  const exitMergePoint = {
    x: shortcutExitSurface.point.x - exitTangentX * mergeLength,
    y: shortcutExitSurface.point.y - exitTangentY * mergeLength,
  };
  const interiorShortcutPoints = shortcutPoints.slice(1, -1);
  const normalizedShortcut = {
    ...shortcut,
    entry: { ...shortcutEntrySurface.point },
    exit: { ...shortcutExitSurface.point },
    points: [
      { ...shortcutEntrySurface.point },
      entryMergePoint,
      ...interiorShortcutPoints,
      exitMergePoint,
      { ...shortcutExitSurface.point },
    ],
  };
  const shortcutSegments = buildSegments(normalizedShortcut.points, normalizedShortcut.width, false);
  const { cumulativeStarts, totalLength } = buildCumulativeStarts(segments);
  const { cumulativeStarts: shortcutCumulativeStarts, totalLength: shortcutTotalLength } = buildCumulativeStarts(shortcutSegments);
  const shortcutEntryTrackDistance = getRouteDistanceForPoint(normalizedShortcut.entry, segments, cumulativeStarts);
  const shortcutExitTrackDistance = getRouteDistanceForPoint(normalizedShortcut.exit, segments, cumulativeStarts);
  const shortcutProgressSpan = shortcutExitTrackDistance >= shortcutEntryTrackDistance
    ? shortcutExitTrackDistance - shortcutEntryTrackDistance
    : totalLength - shortcutEntryTrackDistance + shortcutExitTrackDistance;
  return {
    ...options,
    roadWidth,
    startHeading,
    points,
    shortcut: {
      ...normalizedShortcut,
      entryTrackDistance: shortcutEntryTrackDistance,
      exitTrackDistance: shortcutExitTrackDistance,
      progressSpan: Math.max(shortcutProgressSpan, 24),
    },
    segments,
    shortcutSegments,
    cumulativeStarts,
    totalLength,
    shortcutCumulativeStarts,
    shortcutTotalLength,
    // The pit lane (pitlane.js): where it leaves the road, runs and rejoins.
    pitLane: window.Pit ? Pit.lane(shape.pit, totalLength, roadWidth) : null,
    // Where the engine rings (the tunnel, under a bridge) and where the
    // grandstands are, round the lap (venue.js).
    reverbZones: window.Venue ? Venue.reverbZones(shape.tunnel, (shape.bridges || []).map((b) => ({ d: cumulativeStarts[b.under % cumulativeStarts.length] })), totalLength) : [],
    // (Each stand's lap distance is the track data's, from where it was
    // placed: the nearest road to a stand can be another stretch.)
    // Marshal posts round the lap (marshals.js).
    marshalPosts: window.Marshals ? Marshals.posts(totalLength) : [],
    crowdStands: (shape.decor || []).filter((item) => item.type === "grandstand")
      .map((item) => ({ d: item.d ?? getRouteDistanceForPoint(item, segments, cumulativeStarts), x: item.x, y: item.y })),
    // Each box knows its distance round the lap, so at Suzuka's crossover a box
    // on one level can't be taken by a car on the other.
    // None may sit on the grid or the qualifying roll-in (grid.js).
    itemBoxes: Grid.boxesClearOfStart(options.itemBoxes.map((box) => ({
      ...box,
      d: box.d ?? getRouteDistanceForPoint(box, segments, cumulativeStarts),
    })), totalLength),
  };
}

// Circuit outlines, scenery placement and item boxes come from TRACK_SHAPES
// (tracks-data.js); names, colours and lengths from CIRCUITS (game-data.js).
const TRACKS = CIRCUITS.map((circuit) => trackDefinition({ ...circuit }));

const CUPS = CUP_DEFS.map((cup) => ({
  id: cup.id,
  name: cup.name,
  icon: cup.icon,
  tracks: cup.circuitIds.map((id) => TRACKS.find((track) => track.id === id)),
}));



// Single perspective camera shared by the road, the karts, the scenery and the
// item boxes. Everything in the driver view is projected through it, so a car
// at a given world position always lands exactly on the tarmac it is driving on.
const CAMERA = {
  focal: 340,      // focal length in pixels
  height: 27,      // camera height above the road plane, in world units
  back: 48,        // how far behind the car the camera sits
  horizon: 236,    // screen y that an infinitely distant road point maps to
  nearClip: 12,
  farClip: 1600,
};

const KART_SPRITE_SCALE = 0.55;
const DECOR_WORLD_SIZE = 46;
const ITEM_BOX_SIZE = 22;
const ITEM_BOX_HEIGHT = 11;

const state = {
  // Charles Leclerc is the default driver (the player's favourite).
  selectedDriver: Math.max(0, DRIVERS.findIndex((driver) => driver.id === "leclerc")),
  selectedKart: Math.max(0, TEAMS.findIndex((team) => team.id === "ferrari")),
  selectedCup: 0,
  difficulty: 1,
  activeCupIndex: 0,
  phase: "garage",
  raceIndex: 0,
  cupRunId: null,
  cupRecordedFor: null,
  cupDifficulty: null,
  towerUpdatedAt: 0,
  lastRaceCareer: null,
  lastCupCareer: null,
  track: CUPS[0].tracks[0],
  racers: [],
  playerId: "",
  shots: [],
  hazards: [],
  safetyCar: null,
  lastSafetyCarAt: null,
  boxHiddenUntil: [],
  fxFlashes: [],
  simOffset: 0,
  stepAccum: 0,
  // The circuit still to be built before the session starts (see prepareCircuit).
  preparing: null,
  headless: false,
  lastTick: null,
  // Starting grid: "back" (Mario Kart style, the default) or "qualifying".
  gridMode: "back",
  cupGridMode: "back",
  // The weather: the pit-lane choice, the cup's (fixed once it starts), and
  // the current race's ("dry" or "wet"; weather.js).
  weatherMode: "dry",
  cupWeatherMode: "dry",
  weather: "dry",
  gridOrder: [],
  qualifying: null,
  finishQueue: [],
  fallbackFrames: 0,
  particles: [],
  countdownStart: 0,
  raceStart: 0,
  feed: [],
  nextFeedId: 1,
  cupEntries: [],
  lastTimestamp: 0,
  resultsQueued: false,
  resultTimeoutAt: 0,
  flagOutAt: 0,
  finalLapAt: 0,
  paused: false,
  pausedAt: 0,
  viewMode: "driver",
  cameraHeading: 0,
  camPos: null,
  camRoll: 0,
  camLastHeading: 0,
  hudLastPlace: 0,
  hudPlaceFlashUntil: 0,
  hudPlaceFlashDir: 0,
  shakeMag: 0,
  shakeUntil: 0,
};

const input = {
  space: false,
  throttle: false,
  brake: false,
  left: false,
  right: false,
  drift: false,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function lerpAngle(a, b, t) {
  return normalizeAngle(a + normalizeAngle(b - a) * t);
}

function formatOrdinal(value) {
  const v = value % 100;
  if (v >= 11 && v <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildSegments(points, width, closed = true) {
  const segmentCount = closed ? points.length : Math.max(points.length - 1, 0);
  return Array.from({ length: segmentCount }, (_, index) => {
    const point = points[index];
    const next = closed ? points[(index + 1) % points.length] : points[index + 1];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy);
    return {
      a: point,
      b: next,
      dx,
      dy,
      length,
      width,
    };
  });
}

function buildCumulativeStarts(segments) {
  let totalLength = 0;
  const cumulativeStarts = segments.map((segment) => {
    const start = totalLength;
    totalLength += segment.length;
    return start;
  });
  return { cumulativeStarts, totalLength };
}

function closestPointOnSegment(point, segment) {
  const lenSq = segment.dx * segment.dx + segment.dy * segment.dy || 1;
  const t = clamp(((point.x - segment.a.x) * segment.dx + (point.y - segment.a.y) * segment.dy) / lenSq, 0, 1);
  const x = segment.a.x + segment.dx * t;
  const y = segment.a.y + segment.dy * t;
  return { x, y, t, distance: Math.hypot(point.x - x, point.y - y) };
}

// How far either side of a car's last known segment the lookups below search.
// Real circuits fold back on themselves -- Suzuka crosses over, Monaco and
// Singapore run stretches side by side -- so "the nearest bit of road" can be
// a different part of the lap. A car only ever searches the road around where
// it already is, so it can neither snap across a crossover nor cut between two
// parallel stretches.
const SEGMENT_WINDOW = 14;

function segmentSearchOrder(point, segments) {
  const hint = segments.isMain ? point.segmentHint : undefined;
  if (hint === undefined || hint === null) return null;
  const n = segments.length;
  const indices = [];
  for (let k = -SEGMENT_WINDOW; k <= SEGMENT_WINDOW; k += 1) {
    indices.push(((hint + k) % n + n) % n);
  }
  return indices;
}

function findClosestSurfaceOnSegments(point, segments, defaultWidth, isShortcut) {
  const windowed = segmentSearchOrder(point, segments);
  if (windowed) {
    const local = findClosestSurfaceIn(point, segments, defaultWidth, isShortcut, windowed);
    // Knocked a long way from where it was (or a bad hint): search it all.
    if (local.distance < local.segmentWidth * 3) {
      point.segmentHint = local.segmentIndex;
      return local;
    }
  }
  const best = findClosestSurfaceIn(point, segments, defaultWidth, isShortcut, null);
  if (segments.isMain && point.isRacer) point.segmentHint = best.segmentIndex;
  return best;
}

function findClosestSurfaceIn(point, segments, defaultWidth, isShortcut, indices) {
  let best = {
    distance: Infinity,
    t: 0,
    segmentIndex: 0,
    onRoad: false,
    isShortcut,
    normalX: 0,
    normalY: 0,
    tangentX: 1,
    tangentY: 0,
    segmentWidth: defaultWidth,
    barrierWidth: defaultWidth + 6,
  };

  const visit = (segment, segmentIndex) => {
    const hit = closestPointOnSegment(point, segment);
    if (hit.distance < best.distance) {
      const normalLength = hit.distance || 1;
      const tangentLength = segment.length || 1;
      best = {
        distance: hit.distance,
        t: hit.t,
        segmentIndex,
        point: { x: hit.x, y: hit.y },
        onRoad: hit.distance <= segment.width,
        isShortcut,
        normalX: (point.x - hit.x) / normalLength,
        normalY: (point.y - hit.y) / normalLength,
        tangentX: segment.dx / tangentLength,
        tangentY: segment.dy / tangentLength,
        segmentWidth: segment.width,
        barrierWidth: segment.width + (isShortcut ? 5 : 6),
      };
    }
  };
  if (indices) indices.forEach((index) => visit(segments[index], index));
  else segments.forEach(visit);

  return best;
}

function findSurfaceInfo(point, track) {
  const mainSurface = findClosestSurfaceOnSegments(point, track.segments, track.roadWidth, false);
  const shortcutSurface = findClosestSurfaceOnSegments(point, track.shortcutSegments, track.shortcut.width, true);
  return shortcutSurface.distance < mainSurface.distance ? shortcutSurface : mainSurface;
}

function getSurfacePair(point, track) {
  return {
    mainSurface: findClosestSurfaceOnSegments(point, track.segments, track.roadWidth, false),
    shortcutSurface: findClosestSurfaceOnSegments(point, track.shortcutSegments, track.shortcut.width, true),
  };
}

function getShortcutMappedDistance(racer, track) {
  if (!track.shortcutTotalLength) return getTrackDistanceForPoint(racer, track);
  const shortcutDistance = getRouteDistanceForPoint(racer, track.shortcutSegments, track.shortcutCumulativeStarts);
  const shortcutRatio = clamp(shortcutDistance / track.shortcutTotalLength, 0, 1);
  let mappedDistance = track.shortcut.entryTrackDistance + track.shortcut.progressSpan * shortcutRatio;
  if (mappedDistance >= track.totalLength) mappedDistance -= track.totalLength;
  return mappedDistance;
}

function getCourseDistanceForRacer(racer, track) {
  return racer.shortcutActive ? getShortcutMappedDistance(racer, track) : getTrackDistanceForPoint(racer, track);
}

const SHORTCUTS_ENABLED = false;

function shouldUseShortcutRoute() {
  return SHORTCUTS_ENABLED;
}

function getActiveSurfaceInfo(racer, track, now) {
  // Shortcuts are switched off, so the shortcut route isn't searched at all:
  // it was a full search of every shortcut segment on every step.
  if (!SHORTCUTS_ENABLED) {
    racer.shortcutActive = false;
    return findClosestSurfaceOnSegments(racer, track.segments, track.roadWidth, false);
  }
  const { mainSurface, shortcutSurface } = getSurfacePair(racer, track);
  racer.shortcutActive = shouldUseShortcutRoute(racer, track, mainSurface, shortcutSurface, now);
  return racer.shortcutActive ? shortcutSurface : mainSurface;
}

// Close on the map but far apart round the lap means the other level of
// Suzuka's crossover: those cars never interact.
const SAME_STRETCH = 80;
function onSameStretch(a, b, within = SAME_STRETCH) {
  return Math.abs(PowerUps.wrapDelta(a.trackDistance || 0, b.d ?? b.trackDistance ?? 0, state.track.totalLength)) <= within;
}

function applyTrafficAvoidance(racer, throttle, brake, steerInput) {
  const cos = Math.cos(racer.heading);
  const sin = Math.sin(racer.heading);
  let throttleScale = 1;
  let brakeBoost = 0;
  let steerAdjust = 0;

  state.racers.forEach((other) => {
    if (other.id === racer.id || other.finished || !onSameStretch(racer, other)) return;
    const dx = other.x - racer.x;
    const dy = other.y - racer.y;
    const forward = dx * cos + dy * sin;
    const side = -dx * sin + dy * cos;
    if (forward < -16 || forward > 90 || Math.abs(side) > 42) return;

    const forwardWeight = 1 - clamp((forward + 16) / 106, 0, 1);
    const sideWeight = 1 - clamp(Math.abs(side) / 42, 0, 1);
    const pressure = forwardWeight * sideWeight;
    const steerAway = side >= 0 ? -1 : 1;
    // Steering avoidance is the AI's substitute for a human's hands, so it
    // stays AI-only. The throttle and brake penalty is machinery, so it is
    // identical for everyone.
    if (!racer.isPlayer) steerAdjust += steerAway * pressure * 0.88;

    if (forward > 8) {
      throttleScale = Math.min(throttleScale, 0.86 - pressure * 0.10);
      brakeBoost = Math.max(brakeBoost, pressure * 0.16);
    }
  });

  return {
    throttle: throttle * throttleScale,
    brake: Math.max(brake, brakeBoost),
    steerInput: clamp(steerInput + steerAdjust, -1, 1),
  };
}

function combineStats(driver, kart) {
  return {
    speed: clamp(driver.stats.speed + kart.stats.speed, 0.3, 1),
    acceleration: clamp(driver.stats.acceleration + kart.stats.acceleration, 0.3, 1),
    handling: clamp(driver.stats.handling + kart.stats.handling, 0.3, 1),
    weight: clamp(driver.stats.weight + kart.stats.weight, 0.2, 1),
    traction: clamp(driver.stats.traction + kart.stats.traction, 0.25, 1),
    drift: clamp(driver.stats.drift + kart.stats.drift, 0.25, 1),
  };
}

function derivedPhysics(stats) {
  return {
    maxSpeed: lerp(138, 238, stats.speed),
    accelRate: lerp(72, 160, stats.acceleration),
    brakeRate: lerp(86, 162, stats.acceleration),
    turnRate: lerp(1.8, 3.6, stats.handling),
    driftGrip: lerp(0.82, 0.96, stats.traction),
    offroadFactor: lerp(0.38, 0.72, stats.traction),
    driftChargeRate: lerp(0.55, 1.25, stats.drift),
    bumpPush: lerp(100, 220, stats.weight),
  };
}

function createRacer(driver, kart, isPlayer, slot) {
  const stats = combineStats(driver, kart);
  const physics = derivedPhysics(stats);
  return {
    id: `${driver.id}-${slot}-${isPlayer ? "player" : "ai"}`,
    driver,
    kart,
    stats,
    physics,
    isPlayer,
    isRacer: true,
    segmentHint: null,
    x: 0,
    y: 0,
    heading: 0,
    speed: 0,
    steer: 0,
    waypointIndex: 1,
    passedWaypoints: 0,
    lap: 0,
    startedRaceLap: false,
    trackDistance: 0,
    shortcutActive: false,
    finished: false,
    finishPosition: 0,
    finishTime: 0,
    currentItem: "none",
    rouletteUntil: 0,
    itemCooldownUntil: 0,
    boostUntil: 0,
    spinUntil: 0,
    spinImmuneUntil: 0,
    mistakeUntil: 0,
    lat: 0,
    drsUntil: 0,
    protectedUntil: 0,
    formationUntil: 0,
    trailingOil: false,
    trailSince: 0,
    oilHoldStart: 0,
    itemReadyAt: 0,
    itemHeldSince: 0,
    wasBoosting: false,
    lapAccum: 0,
    stallCheckAt: 0,
    stallDistance: 0,
    lapStartAt: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    driftCharge: 0,
    drifting: false,
    driftSide: 0,
    aiOffset: (Math.random() - 0.5) * 2 * getDifficulty().lineNoise,
    aiUseShortcut: false,
    lastKnownPlace: 20,
    statusText: "",
  };
}

function addFeed(message) {
  state.feed.unshift({ id: state.nextFeedId += 1, message });
  state.feed = state.feed.slice(0, 8);
  if (window.Screens && ["race", "countdown", "qualifying", "qualifyingSim", "qualifyingResults"].includes(state.phase)) window.Screens.pushFeed(message);
}

// The pit lane is drawn by screens.js; this keeps the game's side in step.
function renderGarage() {
  if (state.phase === "garage") state.track = getSelectedCup().tracks[0];
  if (window.Screens) window.Screens.refreshPitLane();
}

function getPitLaneState() {
  const driver = DRIVERS[state.selectedDriver];
  const team = getTeamForDriver(driver);
  const stats = combineStats(driver, team);
  return {
    drivers: DRIVERS.map((d, index) => ({ index, code: d.code, number: d.number, name: d.name, teamColor: getTeamForDriver(d).body })),
    selectedDriver: state.selectedDriver,
    driver: { id: driver.id, name: driver.name, number: driver.number, title: driver.title },
    team: { name: team.name, car: team.car, body: team.body, trim: team.trim },
    stats: { speed: stats.speed, handling: stats.handling, acceleration: stats.acceleration, traction: stats.traction },
    cups: CUPS.map((cup, index) => ({ index, name: cup.name, circuits: cup.tracks.map((track) => track.name) })),
    selectedCup: state.selectedCup,
    difficulties: DIFFICULTIES.map((d, index) => ({ index, name: d.name })),
    selectedDifficulty: state.difficulty,
    gridModes: GRID_MODES,
    gridMode: state.gridMode,
    weatherModes: Weather.MODES,
    weatherMode: state.weatherMode,
    // Drivers can be changed only in the pit lane, between cups.
    canChooseDriver: state.phase === "garage",
  };
}

const GRID_MODES = [
  { id: "back", name: "From the back" },
  { id: "qualifying", name: "Qualifying" },
];

// Chosen in the pit lane, fixed for the whole cup once it starts.
function selectGridMode(mode) {
  if (state.phase !== "garage" || !GRID_MODES.some((m) => m.id === mode)) return;
  state.gridMode = mode;
  try {
    window.localStorage.setItem("f1pixelcup.grid", mode);
  } catch (err) {
    // Preference just will not persist.
  }
  renderGarage();
}

// Chosen in the pit lane, fixed for the whole cup once it starts.
function selectWeatherMode(mode) {
  if (state.phase !== "garage" || !Weather.MODES.some((m) => m.id === mode)) return;
  state.weatherMode = mode;
  try {
    window.localStorage.setItem("f1pixelcup.weather", mode);
  } catch (err) {
    // Preference just will not persist.
  }
  renderGarage();
}

// A race's weather, from the cup's choice: seeded by the cup run, so its
// qualifying and its race share it, and it never rerolls.
function setRaceWeather(index) {
  state.weather = Weather.raceWeather(state.cupWeatherMode, hashSeed(`${state.cupRunId || "run"}:weather`), index);
}

function loadGridPreference() {
  try {
    const weather = window.localStorage.getItem("f1pixelcup.weather");
    if (Weather.MODES.some((m) => m.id === weather)) state.weatherMode = weather;
  } catch (err) {
    // Keep the default.
  }
  try {
    const stored = window.localStorage.getItem("f1pixelcup.grid");
    if (GRID_MODES.some((m) => m.id === stored)) state.gridMode = stored;
  } catch (err) {
    // Keep the default.
  }
}

function selectDriver(index) {
  if (state.phase !== "garage") return;
  setSelectedDriver(index);
  try {
    window.localStorage.setItem("f1pixelcup.driver", DRIVERS[state.selectedDriver].id);
  } catch (err) {
    // Preference just will not persist.
  }
  renderGarage();
}

function setSelectedDriver(index) {
  state.selectedDriver = ((index % DRIVERS.length) + DRIVERS.length) % DRIVERS.length;
  state.selectedKart = TEAMS.findIndex((t) => t.id === DRIVERS[state.selectedDriver].teamId);
}

// Every driver has their own career, so the game comes back to the driver you
// were racing: a ?driver= link (the site's "Open career"), else the driver you
// last picked, else the one you last raced, else Leclerc.
function loadDriverPreference() {
  const candidates = [];
  try {
    const url = new URL(window.location.href);
    const linked = url.searchParams.get("driver");
    if (linked !== null) {
      candidates.push(linked);
      // The link's driver becomes the chosen one; the address goes back to plain
      // play.html, so a reload later can't undo a different pick.
      if (DRIVERS.some((d) => d.id === linked)) window.localStorage.setItem("f1pixelcup.driver", linked);
      url.searchParams.delete("driver");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  } catch (err) {
    // No link driver.
  }
  try {
    candidates.push(window.localStorage.getItem("f1pixelcup.driver"));
  } catch (err) {
    // No stored driver.
  }
  try {
    if (window.Career) candidates.push(window.Career.lastDriverId());
  } catch (err) {
    // No career to go by.
  }
  const index = candidates.map((id) => DRIVERS.findIndex((d) => d.id === id)).find((i) => i >= 0);
  if (index !== undefined) setSelectedDriver(index);
}

function selectCup(index) {
  if (state.phase !== "garage") return;
  state.selectedCup = clamp(index, 0, CUPS.length - 1);
  renderGarage();
}

function selectDifficulty(index) {
  if (state.phase !== "garage") return;
  state.difficulty = clamp(index, 0, DIFFICULTIES.length - 1);
  try {
    window.localStorage.setItem("f1pixelcup.difficulty", String(state.difficulty));
  } catch (err) {
    // Preference just will not persist.
  }
  renderGarage();
}

function getSelectedCup() {
  return CUPS[state.selectedCup];
}

function getActiveCup() {
  return CUPS[state.activeCupIndex];
}

function loadDifficultyPreference() {
  loadGridPreference();
  try {
    const stored = window.localStorage.getItem("f1pixelcup.difficulty");
    if (stored !== null) state.difficulty = clamp(Number(stored) || 0, 0, DIFFICULTIES.length - 1);
  } catch (err) {
    // Keep the default.
  }
}

function buildCupEntries() {
  const playerDriver = DRIVERS[state.selectedDriver];
  const playerKart = getTeamForDriver(playerDriver);
  const remainingDrivers = shuffle(DRIVERS.filter((driver) => driver.id !== playerDriver.id));
  const cupEntries = [
    { driver: playerDriver, kart: playerKart, points: 0, isPlayer: true },
    ...remainingDrivers.slice(0, 19).map((driver) => ({
      driver,
      kart: getTeamForDriver(driver),
      points: 0,
      isPlayer: false,
    })),
  ];
  state.cupEntries = cupEntries;
}

// ---------------------------------------------------------------------------
// Qualifying. A one-lap shootout from a rolling start. CPU laps are simulated
// with the same physics and AI that race them -- alone on the circuit, at the
// chosen difficulty, mistakes and all -- so every time is a real lap.
// ---------------------------------------------------------------------------

// The rolling start: this far before the line, at this share of top speed.
const QUALI_RUN_UP = 320;
const QUALI_ROLL_SPEED = 0.7;
const QUALI_TIME_LIMIT_MS = 180000;

// Extra distance the player rolls in on autopilot before taking over.
const QUALI_RUN_IN = 260;

function placeForQualifying(racer, track, runIn = 0) {
  const route = getItemRoute(track);
  const d = track.totalLength - QUALI_RUN_UP - runIn;
  const w = route.toWorld(d, 0);
  // Tell the road lookup which stretch the car is on: the circuit runs past
  // itself in places, and the nearest bit of road may be another part of the lap.
  let segment = 0;
  while (segment < track.cumulativeStarts.length - 1 && track.cumulativeStarts[segment + 1] <= d) segment += 1;
  Object.assign(racer, {
    x: w.x, y: w.y, heading: w.heading, trackDistance: d, lat: 0, segmentHint: segment,
    speed: racer.physics.maxSpeed * QUALI_ROLL_SPEED,
    lap: 0, startedRaceLap: false, lapAccum: 0, lapStartAt: 0, lastLapTime: 0, bestLapTime: 0,
    splits: [], lastSplit: -1, finished: false,
  });
}

// A CPU driver's qualifying lap, simulated alone on the circuit with the same
// physics and AI that race them. It can be run in slices (a little each frame,
// so timing the field never freezes the page), carries its own random numbers
// when seeded (so any lap can be run again and checked), touches nothing
// visible (no particles, no race events), and always puts the race state back.
function createQualifyingSim(entry, track, seed = null) {
  return { entry, track, seed, rng: seed === null ? null : seed >>> 0, racer: null, now: 0, done: false, result: null };
}

function stepQualifyingSim(sim, budgetMs = Infinity) {
  if (sim.done) return true;
  const saved = {
    racers: state.racers, shots: state.shots, hazards: state.hazards, safetyCar: state.safetyCar,
    boxHiddenUntil: state.boxHiddenUntil, flagOutAt: state.flagOutAt, feed: state.feed, track: state.track,
    finishQueue: state.finishQueue, particles: state.particles, headless: state.headless,
  };
  const savedWorld = { ...WORLD };
  const realRandom = Math.random;
  if (sim.rng !== null) {
    Math.random = () => {
      sim.rng = (sim.rng + 0x6d2b79f5) >>> 0;
      let t = Math.imul(sim.rng ^ (sim.rng >>> 15), 1 | sim.rng);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const started = performance.now();
  try {
    state.track = sim.track;
    // Cars are kept inside the world box, which is sized to each circuit.
    Object.assign(WORLD, sim.track.world);
    if (!sim.racer) {
      sim.racer = createRacer(sim.entry.driver, sim.entry.kart, false, 99);
      placeForQualifying(sim.racer, sim.track);
    }
    Object.assign(state, {
      racers: [sim.racer], shots: [], hazards: [], safetyCar: null, flagOutAt: 0, feed: [], finishQueue: [],
      particles: [], headless: true, boxHiddenUntil: sim.track.itemBoxes.map(() => Infinity),
    });
    const racer = sim.racer;
    while (!racer.lastLapTime && sim.now < QUALI_TIME_LIMIT_MS) {
      sim.now += PHYSICS_STEP_MS;
      updateRacer(racer, PHYSICS_DT, sim.now);
      if (performance.now() - started >= budgetMs) break;
    }
    if (racer.lastLapTime > 0 || sim.now >= QUALI_TIME_LIMIT_MS) {
      // The flying lap began at the first crossing; once it ends, lapStartAt
      // has moved on to the next lap, so the start is the one before it.
      const lapStart = racer.lastLapTime > 0 ? racer.previousLapStartAt : racer.lapStartAt;
      sim.result = {
        timeMs: racer.lastLapTime > 0 ? racer.lastLapTime : null,
        splits: (racer.splits || []).slice(0, TIMING_POINTS_PER_LAP).map((t) => t - lapStart),
      };
      sim.done = true;
    }
  } catch (error) {
    console.warn(`Qualifying: ${sim.entry.driver.name}'s lap could not be simulated; no time.`, error);
    sim.result = { timeMs: null, splits: [] };
    sim.done = true;
  } finally {
    Object.assign(state, saved);
    Object.assign(WORLD, savedWorld);
    Math.random = realRandom;
  }
  return sim.done;
}

function simulateQualifyingLap(entry, track) {
  const sim = createQualifyingSim(entry, track);
  stepQualifyingSim(sim);
  return sim.result;
}

// The same lap with its own random numbers: its mistakes and line come from `seed`, nothing else.
function simulateQualifyingLapSeeded(entry, track, seed) {
  const sim = createQualifyingSim(entry, track, seed);
  stepQualifyingSim(sim);
  return sim.result;
}

function startQualifying(index) {
  const cup = getActiveCup();
  state.raceIndex = index;
  state.track = cup.tracks[index];
  setRaceWeather(index);
  Object.assign(WORLD, state.track.world);
  Object.assign(state, {
    shots: [], hazards: [], safetyCar: null, lastSafetyCarAt: null, fxFlashes: [], finishQueue: [], particles: [],
    simOffset: 0, stepAccum: 0, lastTick: null, flagOutAt: 0, resultsQueued: false, resultTimeoutAt: 0, finalLapAt: 0,
    paused: false, pausedAt: 0, camPos: null, camRoll: 0, hudLastPlace: 0, hudPlaceFlashUntil: 0,
  });
  // Set first, so every CPU lap reads the cup's difficulty.
  state.phase = "qualifyingSim";
  state.preparing = { trackId: state.track.id, painted: false };
  const playerEntry = state.cupEntries.find((entry) => entry.isPlayer);
  const player = createRacer(playerEntry.driver, playerEntry.kart, true, 0);
  // The player rolls in on autopilot while they get ready, and takes over at
  // the same point and speed the CPU laps start from.
  placeForQualifying(player, state.track, QUALI_RUN_IN);
  player.qualiAutopilot = true;
  state.racers = [player];
  state.playerId = player.id;
  state.gridOrder = [];
  // Qualifying has no power-ups.
  state.boxHiddenUntil = state.track.itemBoxes.map(() => Infinity);
  state.cameraHeading = player.heading;
  state.camLastHeading = player.heading;
  const runSeed = hashSeed(`${state.cupRunId || "run"}:${index}`);
  const sims = state.cupEntries.filter((entry) => !entry.isPlayer).map((entry, i) => (
    createQualifyingSim(entry, state.track, (runSeed + (i + 1) * 7919) >>> 0)));
  state.qualifying = {
    raceIndex: index, sims, times: [], poleSplits: [], poleTimeMs: null, playerTimeMs: null, order: null,
    readyElapsed: 0, handedOver: false, releasedAt: null, aborted: false,
  };
  if (window.Screens) window.Screens.showRace();
  addFeed(`${state.track.name} qualifying: the field is setting its times.`);
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A moment to settle before the rolling lap begins, spent rolling in on autopilot.
const QUALI_READY_MS = 1800;
// Time spent timing the field per frame, so the page never stalls.
const QUALI_SIM_BUDGET_MS = 6;

// Timing the field: a slice of the CPU laps each frame.
function updateQualifyingSim() {
  const q = state.qualifying;
  if (!q) return;
  const started = performance.now();
  for (const sim of q.sims) {
    if (sim.done) continue;
    const left = QUALI_SIM_BUDGET_MS - (performance.now() - started);
    if (left <= 0) break;
    stepQualifyingSim(sim, left);
  }
  const done = q.sims.filter((sim) => sim.done).length;
  setViewLoadingText(`Timing the field · ${done} / ${q.sims.length}`);
  if (done < q.sims.length) return;
  q.times = q.sims.map((sim) => ({ id: sim.entry.driver.id, timeMs: sim.result.timeMs, splits: sim.result.splits, seed: sim.seed }));
  const poleLap = q.times.filter((t) => t.timeMs).sort((a, b) => a.timeMs - b.timeMs)[0];
  q.poleSplits = poleLap ? poleLap.splits : [];
  q.poleTimeMs = poleLap ? poleLap.timeMs : null;
  state.phase = "qualifying";
  state.lastTick = performance.now();
  state.stepAccum = 0;
  addFeed(`${state.track.name} qualifying: one flying lap. Your time sets your grid.`);
  updateQualifyingTower(true);
}

function updateQualifying(dt, now) {
  const q = state.qualifying;
  const player = getPlayer();
  if (!q || !player) return;
  // Nothing starts until the circuit can be seen.
  if (worldView() === "loading") return;
  const steps = takePhysicsSteps(dt);
  for (let i = 0; i < steps && state.phase === "qualifying"; i += 1) stepQualifying(q, player);
  updateParticles(dt);
  updateQualifyingTower();
}

function stepQualifying(q, player) {
  const tick = (state.lastTick !== null ? state.lastTick : performance.now()) + PHYSICS_STEP_MS;
  if (!q.handedOver) {
    // Rolling in on autopilot at the CPU laps' starting speed.
    q.readyElapsed += PHYSICS_STEP_MS;
    const driving = player.isPlayer;
    player.isPlayer = false;
    updateRacer(player, PHYSICS_DT, tick);
    player.isPlayer = driving;
    player.speed = player.physics.maxSpeed * QUALI_ROLL_SPEED;
    if (q.readyElapsed >= QUALI_READY_MS) {
      q.handedOver = true;
      q.releasedAt = tick;
      player.qualiAutopilot = false;
    }
  } else {
    updateRacer(player, PHYSICS_DT, tick);
  }
  state.lastTick = tick;
  if (state.phase !== "qualifying") return;
  if (player.lastLapTime > 0 || q.aborted || (q.releasedAt !== null && tick - q.releasedAt > QUALI_TIME_LIMIT_MS)) {
    finishQualifying();
  }
}

// How far behind (+) or ahead (-) of the provisional pole the player was at
// the last timing point passed, in ms; null before the first one.
function qualifyingDeltaNow() {
  const q = state.qualifying;
  const player = getPlayer();
  if (!q || !player || !player.startedRaceLap || !player.splits) return null;
  const rel = player.splits.map((t) => t - player.lapStartAt);
  return Grid.qualifyingDelta(rel, q.poleSplits, player.lastSplit);
}

function qualifyingClassification() {
  const q = state.qualifying;
  const player = state.cupEntries.find((entry) => entry.isPlayer);
  const all = [...q.times.map((t) => ({ id: t.id, timeMs: t.timeMs })), { id: player.driver.id, timeMs: q.playerTimeMs }];
  const order = Grid.gridFromQualifying(all);
  const byId = Object.fromEntries(all.map((t) => [t.id, t.timeMs]));
  return order.map((id) => ({ id, timeMs: byId[id] }));
}

function finishQualifying() {
  const q = state.qualifying;
  const player = getPlayer();
  q.playerTimeMs = player.lastLapTime > 0 && !q.aborted ? player.lastLapTime : null;
  // Parked: the engine settles and the car is done for the session.
  player.finished = true;
  player.speed = 0;
  player.drifting = false;
  const rows = qualifyingClassification();
  q.order = rows.map((row) => row.id);
  state.phase = "qualifyingResults";
  const pole = rows[0];
  const place = q.order.indexOf(player.driver.id) + 1;
  const note = q.aborted ? "Lap aborted — you went back over the line, so no time was set."
    : !q.playerTimeMs ? "No time set within the session."
      : place === 1 ? `Pole position! ${formatLapTime(q.playerTimeMs)}.` : `You qualified ${formatOrdinal(place)} · ${formatLapTime(q.playerTimeMs)}.`;
  addFeed(note);
  if (!window.Screens) return;
  const cup = getActiveCup();
  window.Screens.showQualifying({
    kicker: `Qualifying · Race ${state.raceIndex + 1} of ${cup.tracks.length} · ${cup.name}`,
    title: state.track.name,
    note,
    rows: rows.map((row, i) => {
      const entry = state.cupEntries.find((e) => e.driver.id === row.id);
      return {
        position: i + 1,
        id: row.id,
        name: entry.driver.name,
        code: entry.driver.code,
        teamColor: entry.kart.body,
        time: row.timeMs ? formatLapTime(row.timeMs) : "No time",
        gap: i === 0 || !row.timeMs || !pole.timeMs ? "" : `+${formatGapTime(row.timeMs - pole.timeMs)}`,
        isPlayer: entry.isPlayer,
      };
    }),
  });
}

function startRaceFromQualifying() {
  if (state.phase !== "qualifyingResults") return;
  enterFullscreenMode();
  startRace(state.raceIndex);
}

// The timing tower during qualifying: the provisional classification.
function updateQualifyingTower(force = false) {
  if (!window.Screens) return;
  const now = performance.now();
  if (!force && now - (state.towerUpdatedAt || 0) < 250) return;
  state.towerUpdatedAt = now;
  const q = state.qualifying;
  const player = state.cupEntries.find((entry) => entry.isPlayer);
  const done = q.times.filter((t) => t.timeMs).sort((a, b) => a.timeMs - b.timeMs);
  const rows = done.map((t, i) => {
    const entry = state.cupEntries.find((e) => e.driver.id === t.id);
    return { position: i + 1, code: entry.driver.code, teamColor: entry.kart.body, isPlayer: false,
      gap: i === 0 ? formatLapTime(t.timeMs) : `+${formatGapTime(t.timeMs - done[0].timeMs)}` };
  });
  rows.push({ position: "—", code: player.driver.code, teamColor: player.kart.body, isPlayer: true, gap: "ON LAP" });
  window.Screens.updateTower(rows);
}

function layoutGrid(track, count) {
  const pts = track.points;
  const n = pts.length;
  const rowSpacing = 36;
  const laneSpacing = Math.min(28, track.roadWidth * 0.38);

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 2);
    const lane = index % 2 === 0 ? -1 : 1;
    let distBehind = row * rowSpacing + 12;

    // Walk backwards along the actual track segments from pts[0]
    let px = pts[0].x;
    let py = pts[0].y;
    let fwdHeading = track.startHeading;
    let segEnd = 0;

    while (distBehind > 0.5) {
      const segStart = (segEnd - 1 + n) % n;
      const fromPt = pts[segStart];
      const toPt = pts[segEnd];
      const segDx = toPt.x - fromPt.x;
      const segDy = toPt.y - fromPt.y;
      const segLen = Math.hypot(segDx, segDy);
      if (segLen < 0.1) { segEnd = segStart; continue; }
      const segFwdHeading = Math.atan2(segDy, segDx);
      if (distBehind <= segLen) {
        const t = 1 - distBehind / segLen;
        px = fromPt.x + segDx * t;
        py = fromPt.y + segDy * t;
        fwdHeading = segFwdHeading;
        distBehind = 0;
      } else {
        distBehind -= segLen;
        px = fromPt.x;
        py = fromPt.y;
        fwdHeading = segFwdHeading;
        segEnd = segStart;
      }
    }

    const perpX = -Math.sin(fwdHeading);
    const perpY = Math.cos(fwdHeading);
    const totalDistBehind = row * rowSpacing + 12;
    return {
      x: px + perpX * lane * laneSpacing,
      y: py + perpY * lane * laneSpacing,
      heading: fwdHeading,
      trackDistance: ((track.totalLength - totalDistBehind) % track.totalLength + track.totalLength) % track.totalLength,
    };
  });
}

function isFullscreenActive() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function exitFullscreenMode() {
  if (!isFullscreenActive()) return;
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function enterFullscreenMode() {
  if (isFullscreenActive()) return;
  const page = document.documentElement;
  const request = page.requestFullscreen ? page.requestFullscreen() : page.webkitRequestFullscreen ? page.webkitRequestFullscreen() : null;
  if (request && typeof request.catch === "function") request.catch(() => {});
}

function toggleFullscreen() {
  if (isFullscreenActive()) exitFullscreenMode();
  else enterFullscreenMode();
}

function startCup() {
  // Enter on a focused Start button fires both the key and the click.
  if (state.phase !== "garage") return;
  initAudio();
  if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
  state.activeCupIndex = state.selectedCup;
  state.raceIndex = 0;
  buildCupEntries();
  // One id per cup attempt ties its races to its cup bonus (see career.js).
  state.cupRunId = window.Career ? window.Career.startCupRun() : null;
  state.cupRecordedFor = null;
  state.cupDifficulty = state.difficulty;
  state.feed = [];
  state.cupGridMode = state.gridMode;
  state.cupWeatherMode = state.weatherMode;
  state.qualifying = null;
  addFeed(state.cupGridMode === "qualifying"
    ? `${getActiveCup().name}: qualifying sets every grid.`
    : `Lights out soon. ${getActiveCup().name} grid is forming — you start from the back.`);
  enterFullscreenMode();
  startRaceWeekend(0);
}

// Each race of the cup: straight to the grid, or qualifying first.
function startRaceWeekend(index) {
  if (state.cupGridMode === "qualifying") startQualifying(index);
  else startRace(index);
}

function startRace(index) {
  const activeCup = getActiveCup();
  state.phase = "countdown";
  if (window.Screens) window.Screens.showRace();
  state.track = activeCup.tracks[index];
  setRaceWeather(index);
  // The world box is sized to each circuit.
  Object.assign(WORLD, state.track.world);
  state.shots = [];
  state.hazards = [];
  state.safetyCar = null;
  state.lastSafetyCarAt = null;
  state.boxHiddenUntil = [];
  state.fxFlashes = [];
  state.simOffset = 0;
  state.stepAccum = 0;
  state.lastTick = null;
  state.finishQueue = [];
  state.particles = [];
  state.cameraHeading = state.track.startHeading;
  state.camPos = null;
  state.camRoll = 0;
  state.camLastHeading = state.track.startHeading;
  state.hudLastPlace = 0;
  state.hudPlaceFlashUntil = 0;
  state.resultsQueued = false;
  state.resultTimeoutAt = 0;
  state.flagOutAt = 0;
  state.chequerAt = 0;
  // The marshals' flags start afresh each race.
  state.marshalMemory = null;
  state.finalLapAt = 0;
  state.paused = false;
  state.pausedAt = 0;

  // The starting order: the qualifying classification, or from the back.
  const playerEntry = state.cupEntries.find((entry) => entry.isPlayer);
  const qualified = state.qualifying && state.qualifying.raceIndex === index && state.qualifying.order;
  state.gridOrder = qualified ? [...state.qualifying.order] : Grid.gridFromBack({
    playerId: playerEntry.driver.id,
    aiIds: state.cupEntries.filter((entry) => !entry.isPlayer).map((entry) => entry.driver.id),
    standings: Object.fromEntries(state.cupEntries.map((entry) => [entry.driver.id, entry.points])),
  });
  const lineUp = state.gridOrder.map((id) => state.cupEntries.find((entry) => entry.driver.id === id));
  state.preparing = { trackId: state.track.id, painted: false };
  const grid = layoutGrid(state.track, lineUp.length);
  state.racers = lineUp.map((entry, slot) => {
    const racer = createRacer(entry.driver, entry.kart, entry.isPlayer, slot);
    racer.x = grid[slot].x;
    racer.y = grid[slot].y;
    racer.heading = grid[slot].heading;
    racer.trackDistance = grid[slot].trackDistance;
    return racer;
  });
  const player = state.racers.find((racer) => racer.isPlayer);
  state.playerId = player.id;
  state.cameraHeading = player.heading;
  state.camPos = null;
  state.countdownStart = performance.now();
  state.raceStart = 0;
  addFeed(`${state.track.name} loaded. Red boxes hold the power-ups.`);
  if (state.weather === "wet") addFeed(`Rain at ${state.track.name}: the grip is down.`);
  updateStandingsUI();
  updatePlayerUI();
}

function getPlayer() {
  return state.racers.find((racer) => racer.id === state.playerId);
}

function updateCountdown(now) {
  const elapsed = (now - state.countdownStart) / 1000;
  const digits = ["3", "2", "1", "GO!"];
  const step = Math.floor(elapsed);
  if (step < digits.length) {
    ui.countdownBanner.classList.add("hidden");
    const litNow = clamp(Math.floor((elapsed - 0.35) / 0.62) + 1, 0, 5);
    if (litNow > 0 && litNow !== audio.lastBeepStep) {
      audio.lastBeepStep = litNow;
      sfx.lightBeep();
    }
  } else {
    ui.countdownBanner.classList.add("hidden");
    state.phase = "race";
    state.raceStart = now;
    // Lights out starts the race clock here; from now on it moves only with the physics.
    state.lastTick = now;
    state.simOffset = 0;
    audio.lastBeepStep = -1;
    sfx.lightsOut();
    addFeed("Lights out — go go go!");
  }
}

function updatePlayerUI() {
  const player = getPlayer();
  if (!player) return;
  player.lastKnownPlace = getSortedRacers().findIndex((racer) => racer.id === player.id) + 1;
}

function labelizeItem(item) {
  const powerUp = POWER_UPS.find((entry) => entry.id === item);
  return powerUp ? powerUp.name : item;
}

function getSortedRacers() {
  return [...state.racers].sort((a, b) => getRaceProgress(b) - getRaceProgress(a));
}

function getDisplayedLap(racer, track) {
  return racer.finished ? track.laps : Math.min(racer.lap + 1, track.laps);
}

function getRelativeTrackDistance(racer, track) {
  const baseDistance = racer.trackDistance || 0;
  if (!racer.startedRaceLap && baseDistance > track.totalLength * 0.5) {
    return baseDistance - track.totalLength;
  }
  return baseDistance;
}

function getRaceProgress(racer) {
  if (racer.finished) {
    return 100000 - (racer.finishPosition || 0) - (racer.finishPosition ? 0 : racer.finishTime / 1e9);
  }
  return racer.lap * state.track.totalLength + getRelativeTrackDistance(racer, state.track);
}

// ---------------------------------------------------------------------------
// Power-ups. The rules (odds, limits, how shots move and hit) live in
// powerups.js; this is where their effects happen.
// ---------------------------------------------------------------------------

// The clock the picture is drawn at. From lights-out until the race is left
// (results and podium included) it is the race clock at the last physics
// step; before that, wall time, frozen while paused (the countdown).
function renderClock() {
  if (state.lastTick !== null) return state.lastTick;
  return state.paused && state.pausedAt ? state.pausedAt : performance.now();
}

// The race clock is simulated time. It advances by exactly the time the
// physics steps cover -- no more when a slow machine drops frames (dt is
// capped), seven steps per frame when the field is fast-forwarded after the
// flag, and not at all while paused or while the tab is hidden. Every deadline
// in the race (spins, boosts, shots, oil, the safety car, the watchdog, lap
// and finish times) is on this clock, so every time shown is a real one.
// Between frames (key presses) it reads as the last step; tools that drive
// the race with their own clock pass their wall time in.
function raceNow(wall) {
  if (wall !== undefined) return wall + (state.simOffset || 0);
  if (state.lastTick !== null) return state.lastTick;
  return performance.now() + (state.simOffset || 0);
}

function raceSeconds(now) {
  return state.raceStart ? Math.max(0, (now - state.raceStart) / 1000) : 0;
}

function getItemRoute(track) {
  if (!track.itemRoute) track.itemRoute = PowerUps.makeRoute(track.points, track.roadWidth);
  return track.itemRoute;
}

function wrapLap(d) {
  const L = state.track.totalLength;
  return ((d % L) + L) % L;
}

function racerById(id) {
  return state.racers.find((racer) => racer.id === id);
}

// Trackside life for the renderer (docs/superpowers/specs/
// 2026-09-29-trackside-design.md, G3): each marshal post's flag, from the
// race as it is; where the TV helicopter is (trailing the race leader by
// 400); and whether the chequered flag is out, with the winner's colour for
// the fireworks.
const MARSHAL_GRACE_MS = 5000;
function tracksideFrame(now) {
  const track = state.track;
  if (!track || !window.Marshals) return null;
  if (!state.marshalMemory) state.marshalMemory = { posts: {} };
  // Off the line every car is slow: no flags for the first seconds.
  const racing = state.phase === "race" && !state.preparing && now - (state.raceStart || now) > MARSHAL_GRACE_MS;
  const flags = Marshals.flags(track.marshalPosts, state.racers, now, track.totalLength, state.marshalMemory.posts, racing);
  const leader = firstUnfinished() || getSortedRacers()[0];
  const winner = state.chequerAt || state.flagOutAt ? getSortedRacers().find((r) => r.finished) : null;
  return {
    posts: track.marshalPosts,
    flags,
    helicopter: leader ? { d: wrapLap((leader.trackDistance || 0) - 400) } : null,
    flagOutAt: state.chequerAt || state.flagOutAt || 0,
    winnerColour: winner && winner.kart ? winner.kart.body : null,
    // (The race runs fast-forward after the flag; the show runs on real
    // time, held while paused.)
    paused: Boolean(state.paused),
  };
}

function firstUnfinished() {
  return getSortedRacers().find((racer) => !racer.finished) || null;
}

function isProtected(racer, now) {
  return racer.protectedUntil > now || racer.formationUntil > now;
}

// Race events for the post-processing pass (boosts, hits) and anything else
// that wants to follow the race: itemUsed carries the item id.
function emitFx(type, racer, extra = {}) {
  if (state.headless || typeof window === "undefined" || typeof CustomEvent !== "function") return;
  window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type, racerId: racer.id, ...extra } }));
}

function addFlash(d, lat, color, size, now, ms = 400) {
  const w = getItemRoute(state.track).toWorld(d, lat);
  state.fxFlashes.push({ x: w.x, y: w.y, d, color, size, at: now, until: now + ms });
}

function itemBodies() {
  return state.racers.filter((r) => !r.finished).map((r) => ({ id: r.id, d: r.trackDistance || 0, lat: r.lat, speed: r.speed }));
}

function trailBodies() {
  return state.racers.filter((r) => r.trailingOil && !r.finished)
    .map((r) => ({ id: `trail:${r.id}`, ownerId: r.id, d: wrapLap((r.trackDistance || 0) - PowerUps.TRAIL_GAP), lat: r.lat, isTrail: true }));
}

function startRoulette(racer, now) {
  if (racer.currentItem !== "none" || racer.rouletteUntil > now) return;
  racer.rouletteUntil = now + PowerUps.TIMINGS.rouletteMs;
  if (racer.isPlayer) sfx.itemGet();
}

function finishRoulette(racer, now) {
  const leader = firstUnfinished() || racer;
  const gapFraction = Math.max(0, (getRaceProgress(leader) - getRaceProgress(racer)) / state.track.totalLength);
  racer.currentItem = PowerUps.rollItem({
    gapFraction,
    isLeader: leader.id === racer.id,
    raceTime: raceSeconds(now),
    lastSafetyCarAt: state.lastSafetyCarAt,
    stewardInFlight: state.shots.some((shot) => shot.type === "stewardPenalty"),
  });
  racer.rouletteUntil = 0;
  racer.itemHeldSince = now;
  // A human-like pause before the AI uses what it got.
  racer.itemReadyAt = now + (racer.isPlayer ? 0 : 500 + Math.random() * 1000);
  if (racer.isPlayer) addFeed(`Power-up ready: ${labelizeItem(racer.currentItem)}.`);
}

// The AI uses items for a reason, not at random: an Undercut when there is a
// car to aim at, oil trailed when someone is right behind, DRS and Overtake
// Mode on a straight or under attack, the rest as soon as it has reacted.
function maybeUseAiItem(racer, now) {
  if (state.flagOutAt || racer.isPlayer || racer.currentItem === "none") return;
  if (now < racer.itemReadyAt || racer.spinUntil > now) return;
  const T = PowerUps.TIMINGS;
  const L = state.track.totalLength;
  const me = { id: racer.id, d: racer.trackDistance || 0 };
  const { behind } = PowerUps.nearestGaps(me, itemBodies(), L);
  const item = racer.currentItem;
  if (item === "undercut") {
    if (carAhead(racer) && getRaceProgress(carAhead(racer)) - getRaceProgress(racer) <= L * 0.2) useItem(racer, now);
  } else if (item === "oilSlick") {
    if (racer.trailingOil) {
      if (now - racer.trailSince >= T.aiTrailMs) releaseTrail(racer, now);
    } else if (behind !== null && behind <= 60) {
      useItem(racer, now, { trail: true });
    } else if (now - racer.itemHeldSince >= T.aiHoldMs) {
      useItem(racer, now);
    }
  } else if (item === "drs" || item === "overtakeMode") {
    if (PowerUps.isStraight(getItemRoute(state.track), me.d) || (behind !== null && behind <= 40)) useItem(racer, now);
  } else {
    useItem(racer, now);
  }
}

function useItem(racer, now, { trail = false } = {}) {
  const item = racer.currentItem;
  if (!item || item === "none") return;
  const T = PowerUps.TIMINGS;
  const d = racer.trackDistance || 0;
  if (item === "oilSlick" && trail) {
    racer.trailingOil = true;
    racer.trailSince = now;
    emitFx("itemUsed", racer, { item: "oilSlick" });
    return;
  }
  racer.currentItem = "none";
  emitFx("itemUsed", racer, { item });
  racer.trailingOil = false;
  racer.oilHoldStart = 0;
  if (racer.isPlayer) sfx.itemUse();
  if (item === "drs") {
    racer.drsUntil = now + (PowerUps.isStraight(getItemRoute(state.track), d) ? T.drsStraightMs : T.drsMs);
    racer.boostUntil = Math.max(racer.boostUntil, racer.drsUntil);
  } else if (item === "overtakeMode") {
    racer.protectedUntil = now + T.overtakeModeMs;
    emitFx("overtakeMode", racer);
  } else if (item === "formationLap") {
    racer.formationUntil = now + T.formationLapMs;
  } else if (item === "oilSlick") {
    dropOil(racer, now, PowerUps.DROP_GAP);
  } else if (item === "undercut" || item === "debris" || item === "stewardPenalty") {
    fireShot(racer, item, now);
  } else if (item === "safetyCar") {
    deploySafetyCar(racer, now);
  }
  addFeed(`${racer.driver.code} used ${labelizeItem(item)}.`);
}

function dropOil(racer, now, gap) {
  const T = PowerUps.TIMINGS;
  state.hazards.push({
    type: "oilSlick",
    ownerId: racer.id,
    d: wrapLap((racer.trackDistance || 0) - gap),
    lat: racer.lat,
    armedAt: now + T.oilArmMs,
    expiresAt: now + T.oilLifeMs,
  });
}

function releaseTrail(racer, now) {
  if (!racer.trailingOil) return;
  racer.trailingOil = false;
  racer.currentItem = "none";
  racer.oilHoldStart = 0;
  dropOil(racer, now, PowerUps.TRAIL_GAP);
}

// The car directly ahead, if it is within a quarter of a lap.
function carAhead(racer) {
  const L = state.track.totalLength;
  let best = null;
  let bestGap = Infinity;
  state.racers.forEach((other) => {
    if (other.id === racer.id || other.finished) return;
    const gap = getRaceProgress(other) - getRaceProgress(racer);
    if (gap > 0 && gap <= L / 4 && gap < bestGap) { best = other; bestGap = gap; }
  });
  return best;
}

function fireShot(racer, requested, now) {
  let type = requested;
  const T = PowerUps.TIMINGS;
  const route = getItemRoute(state.track);
  const d = racer.trackDistance || 0;
  let speed;
  const target = type === "undercut" ? carAhead(racer) : type === "stewardPenalty" ? firstUnfinished() : null;
  // An Undercut with no car ahead is Debris from the start, fired the way the car points.
  if (type === "undercut" && !target) type = "debris";
  speed = racer.physics.maxSpeed * PowerUps.SHOT_SPEEDS[type];
  // Debris flies the way the car points; across the track that is a sideways
  // drift that bounces off the barriers.
  const rel = normalizeAngle(racer.heading - route.headingAt(d));
  const free = type === "debris";
  state.shots.push({
    type,
    ownerId: racer.id,
    d: wrapLap(d + PowerUps.DROP_GAP),
    lat: racer.lat,
    speed: free ? speed * Math.max(0.35, Math.cos(rel)) : speed,
    latVel: free || !target ? speed * Math.sin(rel) : 0,
    targetId: target ? target.id : "",
    targetLat: target ? target.lat : racer.lat,
    armedAt: now + T.armMs,
    expiresAt: now + T.lifeMs[type],
    age: 0,
  });
  if (type === "stewardPenalty" && target) addFeed(`Steward Penalty on ${target.driver.code}.`);
}

function spinRacer(racer, duration = 900, now = raceNow()) {
  if (!racer || isProtected(racer, now)) return false;
  // Brief grace period after recovering, so overlapping hits cannot pin a car.
  if (now < (racer.spinImmuneUntil || 0)) return false;
  racer.spinUntil = Math.max(racer.spinUntil, now + duration);
  racer.spinImmuneUntil = now + duration + 1400;
  if (racer.isPlayer) {
    addScreenShake(10, 420);
    sfx.spin();
  }
  racer.speed *= 0.55;
  emitFx("hitTaken", racer);
  return true;
}

function safetyCarActive(now) {
  return Boolean(state.safetyCar) && now < state.safetyCar.until;
}

function deploySafetyCar(racer, now) {
  const leader = firstUnfinished() || racer;
  const field = state.racers.filter((r) => !r.finished);
  const meanMax = field.reduce((s, r) => s + r.physics.maxSpeed, 0) / Math.max(1, field.length);
  // A new call brings it back out, from wherever it was (parked in the pits,
  // or still on its way in).
  state.safetyCar = {
    ownerId: racer.id,
    d: wrapLap((leader.trackDistance || 0) + 90),
    lat: 0,
    speed: meanMax * PowerUps.FACTORS.safetyCar,
    fieldSpeed: meanMax,
    until: now + PowerUps.TIMINGS.safetyCarMs,
    leaveUntil: 0,
    inLane: false,
    parked: false,
  };
  state.lastSafetyCarAt = raceSeconds(now);
  addFeed("Safety Car deployed.");
}

// While out, it drives the racing line at safety-car pace. Then it lights
// down, picks up speed and heads for the pits along the road's edge on the
// pit side; at the pit entry it turns into the lane, slows to the pit limit
// and parks at its own bay (pitlane.js), where it stays until called again.
const SC_LEAVING_PACE = 0.85;
const SC_PIT_LIMIT = 0.35;
function updateSafetyCar(dt, now) {
  const sc = state.safetyCar;
  if (sc) sc.drawFrom = null;
  if (!sc || sc.parked) return;
  sc.drawFrom = { d: sc.d, lat: sc.lat };
  const route = getItemRoute(state.track);
  const lane = state.track.pitLane;
  if (now >= sc.until) {
    if (!sc.leaving) {
      sc.leaving = true;
      addFeed("Safety Car in this lap. Racing resumes.");
    }
    if (!lane) {
      // No pit lane to go to: off to the edge of the road, and gone.
      if (!sc.leaveUntil) sc.leaveUntil = now + PowerUps.TIMINGS.safetyCarLeaveMs;
      sc.lat = Math.min(route.halfWidthAt(sc.d) - 6, sc.lat + 40 * dt);
      sc.speed *= Math.pow(0.4, dt);
      if (now >= sc.leaveUntil) state.safetyCar = null;
    } else {
      const way = Pit.wayIn(lane, sc.d, sc.inLane, sc.lat);
      sc.inLane = way.inLane;
      if (way.park) {
        sc.parked = true;
        sc.lat = way.lat;
        sc.d = lane.garages.bays[Pit.BAYS - 1].d;
        sc.speed = 0;
        sc.pace = 0;
        return;
      }
      // On the road it eases across to the edge; in the lane it follows it.
      sc.lat = sc.inLane ? way.lat : sc.lat + clamp(way.lat - sc.lat, -40 * dt, 40 * dt);
      const target = (sc.inLane ? SC_PIT_LIMIT : SC_LEAVING_PACE) * (sc.fieldSpeed || sc.speed);
      sc.speed += clamp(target - sc.speed, -120 * dt, 60 * dt);
    }
  } else {
    sc.lat += clamp(0 - sc.lat, -40 * dt, 40 * dt);
  }
  if (!state.safetyCar) return;
  // It has a body on the road: it slows behind a car in its lane rather than
  // driving through it. In the pit lane there is nobody to hold it up.
  const me = { id: "safetyCar", d: sc.d, lat: sc.lat };
  const onRoad = Math.abs(sc.lat) - PowerUps.CAR_WIDTH / 2 < state.track.roadWidth;
  sc.pace = onRoad ? Math.min(sc.speed, PowerUps.holdStationSpeed(me, itemBodies(), state.track.totalLength)) : sc.speed;
  sc.d = wrapLap(sc.d + sc.pace * dt);
}

function applyTrackBarrier(racer, surface) {
  const kartClearance = 12;
  const roadClamp = Math.max(6, surface.segmentWidth - kartClearance);
  if (surface.distance <= roadClamp) return;
  const fallbackDx = racer.x - surface.point.x;
  const fallbackDy = racer.y - surface.point.y;
  const fallbackLength = Math.hypot(fallbackDx, fallbackDy) || 1;
  const normalX = surface.normalX || fallbackDx / fallbackLength;
  const normalY = surface.normalY || fallbackDy / fallbackLength;
  const targetDistance = roadClamp;
  racer.x = surface.point.x + normalX * targetDistance;
  racer.y = surface.point.y + normalY * targetDistance;
  racer.speed = Math.min(racer.speed, racer.physics.maxSpeed * 0.48);
  alignRacerToSurface(racer, surface, 0.45, 0.82);
}

function getSurfaceForwardAngle(surface, heading) {
  const tangentAngle = Math.atan2(surface.tangentY, surface.tangentX);
  const reverseTangentAngle = normalizeAngle(tangentAngle + Math.PI);
  return Math.abs(normalizeAngle(tangentAngle - heading)) <= Math.PI / 2
    ? tangentAngle
    : reverseTangentAngle;
}

function alignRacerToSurface(racer, surface, turnBlend = 0.32) {
  const chosenAngle = getSurfaceForwardAngle(surface, racer.heading);
  racer.heading = lerpAngle(racer.heading, chosenAngle, turnBlend);
}

function updateLapProgress(racer, now, dt = 0) {
  const previousDistance = racer.trackDistance || 0;
  const currentDistance = getCourseDistanceForRacer(racer, state.track);
  const lapLength = state.track.totalLength;

  // Signed progress since the previous frame, wrapped into [-L/2, +L/2]. Using
  // the direction of travel rather than a raw speed threshold matters: the
  // front row reaches the line while still accelerating, and the old
  // `speed > 18` guard silently rejected that crossing. Once the previous
  // distance was past the line the crossing could never be re-detected, so the
  // pole car -- always the player -- lost a full lap and finished last.
  let delta = currentDistance - previousDistance;
  if (delta > lapLength / 2) delta -= lapLength;
  if (delta < -lapLength / 2) delta += lapLength;

  racer.trackDistance = currentDistance;
  racer.lapAccum = (racer.lapAccum || 0) + delta;

  // A genuine crossing is a wrap from the end of the lap back to the start,
  // made while moving forwards. Deliberately no speed or per-frame distance
  // threshold: at 120fps a car doing 60 advances well under a unit per frame,
  // and any such threshold silently swallows the crossing.
  const wrapped = previousDistance > lapLength * 0.75 && currentDistance < lapLength * 0.25;
  // Reversing back over the line hands the lap back, so progress round the
  // race stays continuous instead of jumping almost a lap ahead.
  const unwrapped = previousDistance < lapLength * 0.25 && currentDistance > lapLength * 0.75;
  // In qualifying there is one flying lap: backing over the line ends it.
  if (unwrapped && delta < 0 && racer.startedRaceLap && state.phase === "qualifying" && racer.id === state.playerId && state.qualifying) {
    state.qualifying.aborted = true;
    finishQualifying();
    return;
  }
  if (unwrapped && delta < 0 && racer.startedRaceLap) {
    racer.lapAccum += lapLength;
    if (racer.lap > 0) {
      racer.lap -= 1;
      racer.lapStartAt = racer.previousLapStartAt ?? racer.lapStartAt;
      racer.undoLapTime = true;
    } else {
      racer.startedRaceLap = false;
    }
    return;
  }
  if (!wrapped || delta <= 0) return;

  // The moment the car actually crossed the line, between this step and the
  // last: lap and race times are to the millisecond, not to the frame. The car
  // drove from where it was at the start of the step to where it is now; the
  // point where that path meets the start line gives the moment exactly.
  const line = getItemRoute(state.track).sample(0);
  const side = (x, y) => (x - line.x) * line.tx + (y - line.y) * line.ty;
  const was = side(racer.stepFromX ?? racer.x, racer.stepFromY ?? racer.y);
  const is = side(racer.x, racer.y);
  const pastLine = was < 0 && is >= 0
    ? is / (is - was)
    // (Pushed across in a tangle, say: fall back to distance round the lap.)
    : clamp(currentDistance / delta, 0, 1);
  const crossedAt = now - dt * 1000 * pastLine;

  if (!racer.startedRaceLap) {
    racer.startedRaceLap = true;
    racer.lapAccum = 0;
    racer.lapStartAt = crossedAt;
    return;
  }

  // A lap only counts if most of one was actually driven, so a car nudging
  // back and forth across the line cannot bank several.
  if (racer.lapAccum < lapLength * 0.5) return;
  racer.lapAccum = 0;

  if (racer.isPlayer) {
    sfx.lap();
    if (racer.lap + 1 === state.track.laps - 1) sfx.finalLap();
  }
  // Fast-forwarded laps are timed on the race clock, so they are true times.
  // A lap re-crossed after reversing over the line was already timed.
  if (racer.lapStartAt && !racer.undoLapTime) {
    racer.lastLapTime = crossedAt - racer.lapStartAt;
    if (!racer.bestLapTime || racer.lastLapTime < racer.bestLapTime) {
      racer.bestLapTime = racer.lastLapTime;
    }
  }
  racer.previousLapStartAt = racer.lapStartAt;
  racer.lapStartAt = racer.undoLapTime ? racer.lapStartAt : crossedAt;
  racer.undoLapTime = false;

  racer.lap += 1;
  if (racer.lap >= state.track.laps) {
    finishRacer(racer, crossedAt);
  }
}

// How tight the road is along the lap, every few units, for the CPU drivers
// (racecraft.js); worked out once per circuit.
const CURVE_STEP = 8;
const CURVE_WINDOW = 3;
function curvatureProfile(track) {
  if (track.aiCurvature) return track.aiCurvature;
  const route = getMainRoute(track);
  const n = Math.max(8, Math.round(track.totalLength / CURVE_STEP));
  const step = track.totalLength / n;
  const headings = Array.from({ length: n }, (_, i) => {
    const at = sampleRouteSurfaceAtDistance(route, i * step);
    return Math.atan2(at.tangentY, at.tangentX);
  });
  track.aiCurvature = { step, values: Racecraft.curvatureFromHeadings(headings, step, CURVE_WINDOW) };
  return track.aiCurvature;
}

// Whether a CPU car must brake now for the road ahead: it looks as far as it
// would take to stop, and checks each corner there against the speed it
// allows and the brakes the car has.
const CORNER_LOOK_STEP = 16;
function mustBrakeForCorners(racer, difficulty) {
  const speed = racer.speed;
  if (speed <= 0) return false;
  const wet = state.weather === "wet" && !racer.underRoof;
  const grip = wet ? Weather.WET.corner : 1;
  const decel = racer.physics.brakeRate * (wet ? Weather.WET.brake : 1);
  const profile = curvatureProfile(state.track);
  const L = state.track.totalLength;
  const from = racer.trackDistance || 0;
  const horizon = (speed * speed) / (2 * decel) + CORNER_LOOK_STEP * 2;
  const corners = [];
  for (let at = 0; at <= horizon; at += CORNER_LOOK_STEP) {
    const index = Math.floor((((from + at) % L) + L) % L / profile.step) % profile.values.length;
    corners.push({ at, speed: Racecraft.cornerSpeed(racer.physics, profile.values[index], { margin: difficulty.cornerMargin, grip }) });
  }
  return Racecraft.mustBrake(speed, corners, decel);
}

function updateRacer(racer, dt, now) {
  if (racer.finished) {
    racer.drawFrom = null;
    return;
  }
  // Where this step starts from, for timing the line crossing exactly, and
  // for drawing the car between its last two steps (placeForDrawing).
  racer.stepFromX = racer.x;
  racer.stepFromY = racer.y;
  racer.drawFrom = { x: racer.x, y: racer.y, heading: racer.heading };
  if (racer.rouletteUntil && now >= racer.rouletteUntil) {
    finishRoulette(racer, now);
  }

  const nextPoint = state.track.points[racer.waypointIndex % state.track.points.length];
  let targetAngle;
  if (racer.isPlayer) {
    targetAngle = Math.atan2(nextPoint.y - racer.y, nextPoint.x - racer.x);
  } else {
    const look = getDifficulty();
    const lookahead = look.lookBase + Math.abs(racer.speed) * look.lookSpeed;
    const aim = sampleRouteSurfaceAtDistance(
      getMainRoute(state.track), (racer.trackDistance || 0) + lookahead,
    );
    const aimX = aim.point.x + aim.normalX * racer.aiOffset;
    const aimY = aim.point.y + aim.normalY * racer.aiOffset;
    targetAngle = Math.atan2(aimY - racer.y, aimX - racer.x);
  }
  const surface = getActiveSurfaceInfo(racer, state.track, now);
  const offroad = !surface.onRoad;

  let throttle = 0;
  let brake = 0;
  let reverse = 0;
  let steerInput = 0;
  let drifting = false;
  let driftSide = 0;

  if (racer.isPlayer) {
    // Throttle stands on its own. Shift is the drift modifier, exactly as the
    // control card says -- it is not a deadman switch for the accelerator.
    throttle = input.throttle ? 1 : 0;
    if (input.brake && !input.throttle) {
      if (racer.speed > 18) {
        brake = 1;
      } else {
        reverse = 1;
      }
    }
    steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    drifting = input.drift && input.throttle && Math.abs(steerInput) > 0 && racer.speed > 70;
    driftSide = steerInput;
    if (racer.oilHoldStart && !racer.trailingOil && racer.currentItem === "oilSlick"
      && now - racer.oilHoldStart >= PowerUps.TIMINGS.trailHoldMs) {
      useItem(racer, now, { trail: true });
    }
  } else {
    const difficulty = getDifficulty();
    const angleDiff = normalizeAngle(targetAngle - racer.heading);
    throttle = 1;
    steerInput = clamp(angleDiff * 1.7, -1, 1);
    // Braking as a driver does: for each corner ahead, the fastest this car
    // can take it (its own turning, and wet, its grip -- racecraft.js), and
    // brakes when it could no longer slow to that in time. A better driver
    // dares nearer the limit (the difficulty's corner margin).
    if (mustBrakeForCorners(racer, difficulty)) brake = 1;
    drifting = Math.abs(angleDiff) > 0.48 && racer.speed > 80 && Math.random() < 0.78;
    driftSide = steerInput;

    // Occasional errors, so weaker fields are beatable without being slow.
    if (racer.mistakeUntil > now) {
      throttle *= 0.55;
      steerInput += Math.sin(now / 70 + racer.aiOffset) * 0.3;
    } else if (Math.random() < difficulty.mistakeRate * dt) {
      racer.mistakeUntil = now + 420 + Math.random() * 520;
    }
    maybeUseAiItem(racer, now);
  }

  if (racer.spinUntil > now) {
    throttle = 0.2;
    reverse = 0;
    steerInput = Math.sin(now / 60) * 1.2;
  }

  if (racer.formationUntil > now) {
    throttle = 1;
    brake = 0;
    reverse = 0;
    const angleDiff = normalizeAngle(targetAngle - racer.heading);
    steerInput = clamp(angleDiff * 2.2, -1, 1);
  }

  ({ throttle, brake, steerInput } = applyTrafficAvoidance(racer, throttle, brake, steerInput));

  const turnRate = racer.physics.turnRate * (0.45 + clamp(racer.speed / 180, 0.2, 1));
  // The yaw this step asks for (a drift adds to it, below); it is applied
  // once the grip has had its say.
  let yaw = steerInput * turnRate;
  // Wet, unless the car is under the tunnel's roof, where the road is dry.
  racer.underRoof = Boolean(state.track.tunnel && window.Venue
    && Venue.reverbAt(racer.trackDistance || 0, [state.track.tunnel], state.track.totalLength) > 0.5);
  const wet = state.weather === "wet" && !racer.underRoof;
  const traction = wet ? Weather.WET.accel : 1;
  const braking = wet ? Weather.WET.brake : 1;

  let targetSpeed = racer.physics.maxSpeed;
  const reverseTargetSpeed = -racer.physics.maxSpeed * 0.5;
  if (offroad) targetSpeed *= racer.physics.offroadFactor * (wet ? Weather.WET.offroad : 1);
  if (racer.boostUntil > now) targetSpeed *= PowerUps.FACTORS.boost;
  if (racer.protectedUntil > now) targetSpeed *= PowerUps.FACTORS.overtakeMode;
  if (racer.formationUntil > now) targetSpeed = racer.physics.maxSpeed * PowerUps.FACTORS.formationLap;
  const sc = state.safetyCar;
  if (sc && safetyCarActive(now) && racer.id !== sc.ownerId) {
    targetSpeed = Math.min(targetSpeed, racer.physics.maxSpeed * PowerUps.FACTORS.safetyCar);
  }

  if (!racer.isPlayer) {
    const difficulty = getDifficulty();
    targetSpeed *= difficulty.aiPace;
    if (difficulty.catchUp) {
      const human = getPlayer();
      if (human && human !== racer) {
        // Positive when this car is behind the player, negative when ahead.
        const gap = getRaceProgress(human) - getRaceProgress(racer);
        const catchUp = clamp(gap / (state.track.totalLength * 0.5), -1, 1);
        targetSpeed *= 1 + catchUp * difficulty.catchUp;
      }
    }
  }

  if (throttle > 0) {
    if (racer.speed < 0) {
      racer.speed = Math.min(0, racer.speed + racer.physics.brakeRate * braking * 0.95 * dt);
    }
    racer.speed = Math.min(targetSpeed, racer.speed + racer.physics.accelRate * traction * throttle * dt);
  } else if (reverse > 0) {
    if (racer.speed > 0) {
      racer.speed = Math.max(0, racer.speed - racer.physics.brakeRate * braking * 1.08 * reverse * dt);
    } else {
      racer.speed = Math.max(reverseTargetSpeed, racer.speed - racer.physics.accelRate * traction * reverse * dt);
    }
  } else {
    // Lifting off should coast, not anchor the car to the tarmac.
    if (racer.speed > 0) {
      racer.speed = Math.max(0, racer.speed - racer.physics.accelRate * 0.18 * dt);
    } else {
      racer.speed = Math.min(0, racer.speed + racer.physics.accelRate * 0.18 * dt);
    }
  }

  if (brake > 0) {
    if (racer.speed > 0) {
      racer.speed = Math.max(0, racer.speed - racer.physics.brakeRate * braking * brake * dt);
    } else {
      racer.speed = Math.min(0, racer.speed + racer.physics.brakeRate * braking * 0.6 * brake * dt);
    }
  }

  racer.speed *= Math.pow(offroad ? racer.physics.driftGrip : 0.992, dt * 60);

  // Behind the safety car nobody passes: rivals hold station behind the car
  // ahead. The safety car itself is solid for everyone, the car that called it
  // included -- that car is free to go round it, not through it.
  // Once the Safety Car is off the road (well into the pit lane, or parked)
  // it holds nobody up; just after the entry it is still on the road.
  const scOnRoad = sc && !sc.parked && Math.abs(sc.lat) - PowerUps.CAR_WIDTH / 2 < state.track.roadWidth;
  if (scOnRoad) {
    const me = { id: racer.id, d: racer.trackDistance || 0, lat: racer.lat };
    const scBody = { id: "safetyCar", d: sc.d, lat: sc.lat, speed: sc.pace ?? sc.speed };
    const held = safetyCarActive(now) && racer.id !== sc.ownerId;
    const L = state.track.totalLength;
    // Rivals queue single file behind the car ahead, wherever it is across the road.
    const cap = held
      ? PowerUps.holdStationSpeed(me, [...itemBodies(), scBody], L, { singleFile: true })
      : PowerUps.holdStationSpeed(me, [scBody], L);
    racer.speed = Math.min(racer.speed, cap);
  }

  if (drifting) {
    racer.drifting = true;
    racer.driftSide = driftSide >= 0 ? 1 : -1;
    racer.driftCharge += racer.physics.driftChargeRate * dt;
    yaw += racer.driftSide * Weather.DRIFT_YAW;
  } else if (racer.drifting) {
    if (racer.driftCharge > 1.6) {
      racer.boostUntil = Math.max(racer.boostUntil, now + 1400);
      if (racer.isPlayer) sfx.boost();
    } else if (racer.driftCharge > 0.9) {
      racer.boostUntil = Math.max(racer.boostUntil, now + 850);
      if (racer.isPlayer) sfx.boost();
    }
    racer.drifting = false;
    racer.driftCharge = 0;
  }

  // On a wet road the car can't corner as hard as it asks: past the grip's
  // share of the hardest it could corner in the dry at this speed, it
  // understeers. (Only wet: the dry is never capped. A spinning car is
  // already past any grip.)
  const gripLimit = Weather.dryLimitAt(racer.physics, racer.speed) * Weather.WET.corner;
  if (wet && !(racer.spinUntil > now)) yaw = Weather.capYaw(yaw, racer.speed, gripLimit);
  racer.yawRate = yaw;
  // How hard it is cornering (speed x yaw), for the checks and the spray.
  racer.latAccel = Math.abs(yaw * racer.speed);
  // A wet tyre near its limit slides, and scrubs speed.
  if (wet) racer.speed *= Weather.scrub(racer.latAccel, gripLimit, dt);
  racer.heading += yaw * dt;

  racer.x += Math.cos(racer.heading) * racer.speed * dt;
  racer.y += Math.sin(racer.heading) * racer.speed * dt;

  racer.x = clamp(racer.x, 24, WORLD.width - 24);
  racer.y = clamp(racer.y, 24, WORLD.height - 24);

  let barrierSurface = getActiveSurfaceInfo(racer, state.track, now);
  applyTrackBarrier(racer, barrierSurface);
  barrierSurface = getActiveSurfaceInfo(racer, state.track, now);
  const surfaceBlend = racer.isPlayer && racer.speed < -8 ? 0.04 : 0.22;
  alignRacerToSurface(racer, barrierSurface, surfaceBlend, 0.84);
  updateLapProgress(racer, now, dt);
  recordTimingPoint(racer, now);
  // Side offset from the centreline, for shots and oil (track coordinates).
  const along = getItemRoute(state.track).sample(racer.trackDistance || 0);
  racer.lat = (racer.x - along.x) * along.nx + (racer.y - along.y) * along.ny;

  const wantedWaypoint = desiredWaypointIndex(racer, state.track);
  if (wantedWaypoint !== racer.waypointIndex) {
    racer.waypointIndex = wantedWaypoint;
    racer.passedWaypoints += 1;
  }

  // Watchdog. If a car somehow makes no progress along the lap for a few
  // seconds, put it back on the racing line pointing the right way, so a
  // wedged car can never stop the field from completing the distance.
  if (!racer.stallCheckAt || now - racer.stallCheckAt > 3000) {
    const previous = racer.stallDistance || 0;
    const moved = Math.abs((racer.trackDistance || 0) - previous);
    const wrappedRound = moved > state.track.totalLength * 0.5;
    if (racer.stallCheckAt && !wrappedRound && moved < 40) {
      const rescue = sampleRouteSurfaceAtDistance(getMainRoute(state.track), racer.trackDistance || 0);
      racer.x = rescue.point.x;
      racer.y = rescue.point.y;
      racer.heading = Math.atan2(rescue.tangentY, rescue.tangentX);
      racer.speed = Math.max(racer.speed, 50);
      racer.spinUntil = 0;
    }
    racer.stallCheckAt = now;
    racer.stallDistance = racer.trackDistance || 0;
  }

  // Mario Kart boxes: the first car through breaks it (an item only if its
  // slot is empty), then it is gone for three seconds.
  state.track.itemBoxes.forEach((box, index) => {
    if ((state.boxHiddenUntil[index] || 0) > now) return;
    if (onSameStretch(racer, box, 40) && distance(racer, box) < 18) {
      state.boxHiddenUntil[index] = now + PowerUps.TIMINGS.boxHiddenMs;
      startRoulette(racer, now);
    }
  });

  const boosting = racer.boostUntil > now || racer.formationUntil > now;
  if (boosting !== racer.wasBoosting) {
    racer.wasBoosting = boosting;
    emitFx(boosting ? "boostStart" : "boostEnd", racer);
  }

  emitRacerParticles(racer, dt, now, offroad);
}

function finishRacer(racer, now) {
  if (racer.finished) return;
  racer.finished = true;
  if (racer.isPlayer) {
    sfx.finish();
    // The player's chequered flag: the trackside show starts (even when they
    // are the last car home).
    state.chequerAt = now;
  }
  racer.finishTime = now - state.raceStart;
  // Placed once the step is over, so cars crossing in the same step are
  // ordered by the moment each one actually crossed the line.
  racer.finishPosition = 0;
  state.finishQueue.push(racer);
}

function settleFinishers() {
  if (!state.finishQueue.length) return;
  const placed = state.racers.filter((racer) => racer.finished && racer.finishPosition > 0).length;
  state.finishQueue.sort((a, b) => a.finishTime - b.finishTime).forEach((racer, index) => {
    racer.finishPosition = placed + index + 1;
    addFeed(`${racer.driver.name} finished ${formatOrdinal(racer.finishPosition)}.`);
  });
  state.finishQueue = [];
}

function updateShots(dt, now) {
  const L = state.track.totalLength;
  const route = getItemRoute(state.track);
  const bodies = itemBodies();
  const trails = trailBodies();
  state.shots = state.shots.filter((shot) => {
    if (now > shot.expiresAt) return false;
    if (shot.type === "stewardPenalty") {
      const leader = firstUnfinished();
      if (!leader) return false;
      shot.targetId = leader.id;
    } else if (shot.type === "undercut" && shot.targetId) {
      const target = racerById(shot.targetId);
      const ahead = target ? PowerUps.wrapDelta(target.trackDistance || 0, shot.d, L) : 0;
      // Lost its target (finished, too far ahead, or slipped past it): from
      // here on it is Debris, exactly as the Debris card describes.
      if (!target || target.finished || ahead > L / 4 || ahead < -PowerUps.CAR_LENGTH) becomeDebris(shot, now);
      else shot.targetLat = target.lat;
    }
    PowerUps.advanceShot(shot, dt, route);
    if (shot.bouncedAt === shot.age) addFlash(shot.d, shot.lat, "#ffb347", 5, now, 250);

    if (shot.type === "stewardPenalty") {
      const victims = PowerUps.stewardVictims(shot, bodies, L, now);
      if (!victims.length) return true;
      const leader = racerById(victims[0]);
      const shrugged = isProtected(leader, now);
      victims.forEach((id, i) => spinRacer(racerById(id), i === 0 ? PowerUps.SPIN_MS.stewardLeader : PowerUps.SPIN_MS.stewardSplash, now));
      addFlash(leader.trackDistance, leader.lat, "#3aa0ff", 26, now, 500);
      addFeed(!shrugged ? `Steward Penalty lands on ${leader.driver.code}.`
        : `${leader.driver.code}'s Overtake Mode shrugs off the Steward Penalty.`);
      return false;
    }

    const hit = PowerUps.firstHit(shot, [...trails, ...bodies], L, now);
    if (!hit) return true;
    const label = labelizeItem(shot.type);
    if (hit.isTrail) {
      const owner = racerById(hit.ownerId);
      owner.trailingOil = false;
      owner.currentItem = "none";
      owner.oilHoldStart = 0;
      addFeed(`${owner.driver.code}'s oil slick stopped a ${label}.`);
    } else {
      const victim = racerById(hit.id);
      spinRacer(victim, PowerUps.SPIN_MS[shot.type], now);
      addFeed(`${label} hit ${victim.driver.code}.`);
    }
    addFlash(shot.d, shot.lat, shot.type === "undercut" ? "#ff3b30" : "#00d2be", 12, now);
    return false;
  });
}

function becomeDebris(shot, now) {
  const drift = (shot.targetLat ?? shot.lat) >= shot.lat ? 1 : -1;
  shot.type = "debris";
  shot.targetId = "";
  shot.latVel = drift * shot.speed * 0.25;
  shot.expiresAt = Math.min(shot.expiresAt, now + PowerUps.TIMINGS.lifeMs.debris);
}

function updateHazards(now) {
  const L = state.track.totalLength;
  const bodies = itemBodies();
  state.hazards = state.hazards.filter((hazard) => {
    if (now > hazard.expiresAt) return false;
    const victim = PowerUps.firstHit(hazard, bodies, L, now);
    if (!victim) return true;
    // Oil on a wet road: the spin lasts longer.
    const spun = racerById(victim.id);
    spinRacer(spun, PowerUps.SPIN_MS.oilSlick * (state.weather === "wet" && spun && !spun.underRoof ? Weather.WET.oilSpin : 1), now);
    return false;
  });
  state.fxFlashes = state.fxFlashes.filter((flash) => flash.until > now);
}

// World positions of everything the renderers draw.
function powerUpFrame(now) {
  if (!state.track) return { shots: [], hazards: [], trails: [], safetyCar: null, boxHidden: [], flashes: [] };
  const route = getItemRoute(state.track);
  const place = (d, lat) => ({ d, ...route.toWorld(d, lat) });
  return {
    shots: state.shots.map((shot) => ({ type: shot.type, ...place(shot.d, shot.lat), age: shot.age })),
    hazards: state.hazards.map((hazard) => ({ type: hazard.type, ...place(hazard.d, hazard.lat) })),
    trails: state.racers.filter((r) => r.trailingOil && !r.finished)
      .map((r) => ({ ownerId: r.id, ...place(wrapLap((r.trackDistance || 0) - PowerUps.TRAIL_GAP), r.lat) })),
    safetyCar: state.safetyCar ? { ...place(state.safetyCar.d, state.safetyCar.lat), leaving: Boolean(state.safetyCar.leaving), parked: Boolean(state.safetyCar.parked) } : null,
    boxHidden: state.track.itemBoxes.map((_, i) => (state.boxHiddenUntil[i] || 0) > now),
    flashes: state.fxFlashes.map((flash) => ({ ...flash, t: (now - flash.at) / (flash.until - flash.at) })),
  };
}

function handleRacerContacts(now) {
  for (let i = 0; i < state.racers.length; i += 1) {
    for (let j = i + 1; j < state.racers.length; j += 1) {
      const a = state.racers[i];
      const b = state.racers[j];
      if (a.finished || b.finished) continue;
      if (!onSameStretch(a, b)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDistance = 28;
      if (dist < minDistance) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDistance - dist;
        const weightFactorA = clamp(1 - a.stats.weight * 0.45, 0.3, 0.7);
        const weightFactorB = clamp(1 - b.stats.weight * 0.45, 0.3, 0.7);
        const totalFactor = weightFactorA + weightFactorB;
        const moveA = overlap * (weightFactorA / totalFactor);
        const moveB = overlap * (weightFactorB / totalFactor);

        a.x -= nx * moveA;
        a.y -= ny * moveA;
        b.x += nx * moveB;
        b.y += ny * moveB;

        const progressDelta = getRaceProgress(b) - getRaceProgress(a);
        const leaderIsB = progressDelta >= 0;
        const surfaceA = getActiveSurfaceInfo(a, state.track, now);
        const surfaceB = getActiveSurfaceInfo(b, state.track, now);
        const tangentX = (surfaceA.tangentX + surfaceB.tangentX) * 0.5 || surfaceA.tangentX || 1;
        const tangentY = (surfaceA.tangentY + surfaceB.tangentY) * 0.5 || surfaceA.tangentY || 0;
        const tangentLength = Math.hypot(tangentX, tangentY) || 1;
        const tx = tangentX / tangentLength;
        const ty = tangentY / tangentLength;
        const staggerPush = clamp(overlap * 1.5 + 6, 6, 22);
        const lateralBias = clamp(overlap * 0.5, 1.5, 5);

        if (leaderIsB) {
          a.x -= tx * staggerPush * 0.55;
          a.y -= ty * staggerPush * 0.55;
          b.x += tx * staggerPush * 0.65;
          b.y += ty * staggerPush * 0.65;
          a.speed = Math.max(0, a.speed * 0.82);
          b.speed = Math.min(b.physics.maxSpeed * 1.04, b.speed + 8);
        } else {
          b.x -= tx * staggerPush * 0.55;
          b.y -= ty * staggerPush * 0.55;
          a.x += tx * staggerPush * 0.65;
          a.y += ty * staggerPush * 0.65;
          b.speed = Math.max(0, b.speed * 0.82);
          a.speed = Math.min(a.physics.maxSpeed * 1.04, a.speed + 8);
        }

        a.x -= ny * lateralBias;
        a.y += nx * lateralBias;
        b.x += ny * lateralBias;
        b.y -= nx * lateralBias;

        if (a.isPlayer || b.isPlayer) {
          addScreenShake(clamp(overlap * 0.7, 2, 9), 220);
          if (overlap > 4) sfx.impact();
        }
        if (isProtected(a, now)) spinRacer(b, PowerUps.SPIN_MS.contact, now);
        if (isProtected(b, now)) spinRacer(a, PowerUps.SPIN_MS.contact, now);

        a.x = clamp(a.x, 24, WORLD.width - 24);
        a.y = clamp(a.y, 24, WORLD.height - 24);
        b.x = clamp(b.x, 24, WORLD.width - 24);
        b.y = clamp(b.y, 24, WORLD.height - 24);

        const correctedSurfaceA = getActiveSurfaceInfo(a, state.track, now);
        const correctedSurfaceB = getActiveSurfaceInfo(b, state.track, now);
        applyTrackBarrier(a, correctedSurfaceA);
        applyTrackBarrier(b, correctedSurfaceB);
        alignRacerToSurface(a, getActiveSurfaceInfo(a, state.track, now), 0.18, 0.86);
        alignRacerToSurface(b, getActiveSurfaceInfo(b, state.track, now), 0.18, 0.86);
      }
    }
  }
}

const FLAG_FAST_FORWARD = 7;

// All driving physics runs at one fixed step, whatever the frame rate: a 30 Hz
// laptop and a 144 Hz display simulate exactly the same race, and a player's
// qualifying lap is stepped exactly as the CPU laps are.
const PHYSICS_STEP_MS = 1000 / 60;
const PHYSICS_DT = 1 / 60;
// A very slow frame is not caught up in one go (that would spiral); the
// excess is let go, and the race runs slower for that moment instead.
const MAX_STEPS_PER_FRAME = 8;

// How many fixed steps this frame's time buys, keeping the remainder.
function takePhysicsSteps(dt) {
  state.stepAccum = (state.stepAccum || 0) + Math.min(Math.max(dt, 0), 0.25) * 1000;
  let steps = 0;
  while (state.stepAccum >= PHYSICS_STEP_MS - 1e-6 && steps < MAX_STEPS_PER_FRAME) {
    state.stepAccum -= PHYSICS_STEP_MS;
    steps += 1;
  }
  if (steps === MAX_STEPS_PER_FRAME) state.stepAccum = 0;
  return steps;
}

function updateRace(dt, now) {
  // After the player takes the flag the rest of the field is sub-stepped, and
  // everything on track -- shots, oil, the safety car, contacts -- steps with
  // it, each sub-step on its own tick of the race clock. Cars obey the same
  // physics, corners and barriers; they just cover the distance faster.
  // Step the clock on from the last physics step by this frame's own steps:
  // whatever wall time passed (a hitch, a pause, a hidden tab), the race only
  // moves on by the time the physics actually simulates.
  const physicsSteps = takePhysicsSteps(dt);
  const steps = physicsSteps * (state.flagOutAt ? FLAG_FAST_FORWARD : 1);
  const step = PHYSICS_STEP_MS;
  const from = state.lastTick !== null ? state.lastTick : now + state.simOffset - step;
  for (let index = 0; index < steps; index += 1) {
    const tick = from + (index + 1) * step;
    // After the flag the field runs FLAG_FAST_FORWARD steps to the player's one
    // (the player has finished, so in practice only the field moves).
    const playerSteps = index % (state.flagOutAt ? FLAG_FAST_FORWARD : 1) === 0;
    state.racers.forEach((racer) => {
      if (racer.finished || (!playerSteps && racer.isPlayer)) return;
      updateRacer(racer, PHYSICS_DT, tick);
    });
    settleFinishers();
    updateShots(PHYSICS_DT, tick);
    updateSafetyCar(PHYSICS_DT, tick);
    updateHazards(tick);
    handleRacerContacts(tick);
    handleRacerContacts(tick);
    handleRacerContacts(tick);
  }
  if (steps > 0) state.lastTick = from + steps * step;
  // Kept for tools that drive the race with their own clock (raceNow(wall)).
  state.simOffset = state.lastTick - now;
  const raceTime = state.lastTick;
  updateParticles(dt);
  updateStandingsUI();
  updatePlayerUI();

  const player = getPlayer();
  const everyoneFinished = state.racers.every((racer) => racer.finished);
  if (player && player.finished && !state.flagOutAt && !everyoneFinished) {
    state.flagOutAt = now;
    // Safety valve only. With the fast-forward above the field is home in a
    // few seconds; this exists so a wedged car can never hang the race.
    state.resultTimeoutAt = now + 60000;
    addFeed("Chequered flag — waiting for the rest of the field to come home.");
  }

  if (!state.resultsQueued && (everyoneFinished || (state.resultTimeoutAt && now >= state.resultTimeoutAt))) {
    state.resultsQueued = true;
    completeRemainingFinishers(raceTime);
    finalizeRace();
  }
}

// Timing points: each lap is split into this many, and every car's race-clock
// time at each one is kept, as real timing loops do. The gap between two cars
// is the difference in their times at the last point the one behind passed.
const TIMING_POINTS_PER_LAP = 24;
// Before any timing point is shared (the first moments), a distance lead is
// turned into seconds at a typical race speed.
const TOWER_REFERENCE_SPEED = 180;

function recordTimingPoint(racer, now) {
  const progress = getRaceProgress(racer);
  if (racer.finished || progress < 0) return;
  const index = Math.floor(progress / (state.track.totalLength / TIMING_POINTS_PER_LAP));
  if (!racer.splits) racer.splits = [];
  // Driving backwards: the next time it passes a point it is timed again.
  if (index < (racer.lastSplit ?? -1)) racer.lastSplit = index;
  // A jump of more than a few points in one step isn't driving (a rescue by
  // the watchdog): time it from the next point it genuinely reaches.
  if (index > (racer.lastSplit ?? -1) + 3) { racer.lastSplit = index; racer.splits[index] = now; return; }
  while ((racer.lastSplit ?? -1) < index) {
    racer.lastSplit = (racer.lastSplit ?? -1) + 1;
    racer.splits[racer.lastSplit] = now;
  }
}

// How far behind `ahead` the car `behind` is, in milliseconds; null if they
// share no timing point yet.
function timeGap(behind, ahead) {
  if (behind.finished && ahead.finished) return behind.finishTime - ahead.finishTime;
  const index = behind.lastSplit ?? -1;
  if (index < 0 || !ahead.splits || ahead.splits[index] === undefined) return null;
  return behind.splits[index] - ahead.splits[index];
}

function gapSeconds(behind, ahead) {
  const gap = timeGap(behind, ahead);
  // A timed gap is used unless the cars swapped places since the last timing
  // point they share (it would read negative); then, until the next point,
  // the distance between them at race speed stands in.
  if (gap !== null && gap >= 0) return gap / 1000;
  return Math.max(0, getRaceProgress(ahead) - getRaceProgress(behind)) / TOWER_REFERENCE_SPEED;
}

function getRaceStandings() {
  const sorted = getSortedRacers();
  const leader = sorted[0];
  return sorted.map((racer, index) => {
    let gap;
    if (index === 0) gap = leader.finished ? "FIN" : "LEADER";
    else gap = `+${formatGap(gapSeconds(racer, leader))}`;
    return { position: index + 1, code: racer.driver.code, teamColor: racer.kart.body, isPlayer: racer.id === state.playerId, gap };
  });
}

function updateStandingsUI() {
  if (!window.Screens) return;
  const now = performance.now();
  if (now - (state.towerUpdatedAt || 0) < 250) return;
  state.towerUpdatedAt = now;
  window.Screens.updateTower(getRaceStandings());
}

// The player's race, handed to the career profile. Called once per race, from
// finalizeRace, so a race abandoned before the flag is never recorded.
function recordPlayerRace(finishers, fastest) {
  const player = finishers.find((racer) => racer.isPlayer);
  if (!player || !window.Career) return null;
  try {
    return window.Career.recordRace({
      cupId: getActiveCup().id,
      cupRunId: state.cupRunId,
      raceIndex: state.raceIndex,
      trackId: state.track.id,
      difficulty: getDifficulty().id,
      driverId: player.driver.id,
      teamId: player.kart.id,
      position: finishers.indexOf(player) + 1,
      fieldSize: finishers.length,
      bestLapMs: player.bestLapTime || 0,
      fastestLap: Boolean(fastest && fastest.id === player.id),
      qualifying: playerQualifying(player),
    });
  } catch (error) {
    console.warn("Career: race not recorded", error);
    return null;
  }
}

// The player's qualifying result for this race, if the cup had qualifying.
function playerQualifying(player) {
  const q = state.qualifying;
  if (state.cupGridMode !== "qualifying" || !q || q.raceIndex !== state.raceIndex || !q.order) return undefined;
  return { position: q.order.indexOf(player.driver.id) + 1, timeMs: q.playerTimeMs };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function careerDifficultyName(id) {
  return (window.Career && window.Career.DIFFICULTY_NAMES[id]) || id;
}

// "Charles Leclerc" -> "Leclerc", as on the pit-lane career chip.
function surnameOf(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts[parts.length - 1] || "";
}

function careerForRace(summary) {
  if (!summary) return { lines: [], saved: true };
  const difficulty = careerDifficultyName(getDifficulty().id);
  const { before, after, delta } = summary.rating;
  const trend = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "=";
  // Every driver has their own career: the strip names whose it is.
  const driver = DRIVERS.find((d) => d.id === summary.driverId);
  const whose = driver ? `${surnameOf(driver.name)}: ` : "";
  // These lines are HTML (for the bold parts): every piece of text in them is escaped.
  const n = (value) => escapeHtml(Number(value) || 0);
  const lines = [
    `${escapeHtml(whose)}<strong>+${n(summary.careerPoints)} career points</strong> (${n(summary.racePoints)} × ${escapeHtml(difficulty)} ×${n(summary.multiplier)}) · total ${escapeHtml((Number(summary.careerTotal) || 0).toLocaleString())}`,
    `Rating ${n(before)} → <strong>${n(after)}</strong> ${escapeHtml(trend)} · ${escapeHtml(summary.tier)}`,
  ];
  if (summary.qualifying) {
    const q = summary.qualifying;
    lines.push(q.careerPoints > 0
      ? `Qualifying P${n(q.position)}: <strong>+${n(q.careerPoints)}</strong> (${n(q.points)} × ${escapeHtml(difficulty)} ×${n(q.multiplier)})${q.position === 1 ? " · Pole position" : ""}`
      : `Qualifying P${n(q.position)}: no points (top ten score)`);
  }
  if (summary.newBestLap) lines.push(`New best at ${escapeHtml(state.track.name)}: <strong>${escapeHtml(formatLapTime(summary.newBestLap.ms))}</strong>`);
  return { lines, saved: summary.saved };
}

function careerForCup(cup, playerPlace) {
  if (!cup) return { lines: [], saved: true };
  const lines = cup.bonus > 0
    ? [`<strong>Cup ${escapeHtml(formatOrdinal(playerPlace))} bonus +${escapeHtml(Number(cup.careerPoints) || 0)}</strong> (${escapeHtml(Number(cup.bonus) || 0)} × ${escapeHtml(careerDifficultyName(getDifficulty().id))} ×${escapeHtml(Number(cup.multiplier) || 0)}) · Career total ${escapeHtml((Number(cup.careerTotal) || 0).toLocaleString())}`]
    : [`Cup ${escapeHtml(formatOrdinal(playerPlace))}: no cup bonus (the top three score 50, 30 and 20 × difficulty) · Career total ${escapeHtml((Number(cup.careerTotal) || 0).toLocaleString())}`];
  const driver = state.cupEntries.find((entry) => entry.isPlayer);
  if (driver && lines.length) lines[0] = `${escapeHtml(surnameOf(driver.driver.name))}: ${lines[0]}`;
  return { lines, saved: cup.saved };
}

// The cup bonus, recorded as soon as the cup's last race is finalised, so
// leaving from the last results screen (Esc) still counts the cup. Guarded
// here and again inside career.js by cupRunId, so it is added exactly once.
function recordPlayerCup() {
  if (!window.Career || !state.cupRunId || state.cupRecordedFor === state.cupRunId) return;
  state.cupRecordedFor = state.cupRunId;
  const playerEntry = state.cupEntries.find((entry) => entry.isPlayer);
  try {
    state.lastCupCareer = playerEntry ? window.Career.recordCup({
      cupId: getActiveCup().id,
      cupRunId: state.cupRunId,
      driverId: playerEntry.driver.id,
      difficulty: getDifficulty().id,
      position: state.cupEntries.indexOf(playerEntry) + 1,
      cupPoints: playerEntry.points,
    }) : null;
  } catch (error) {
    console.warn("Career: cup not recorded", error);
    state.lastCupCareer = null;
  }
}

function finalizeRace() {
  const finishers = [...state.racers].sort((a, b) => a.finishPosition - b.finishPosition);
  finishers.forEach((racer, index) => {
    const entry = state.cupEntries.find((cupEntry) => cupEntry.driver.id === racer.driver.id);
    if (entry) entry.points += POINTS_TABLE[index] || 0;
  });
  // Bonus point for the fastest lap, top ten only, exactly as F1 scores it.
  const fastest = finishers.reduce((best, racer) => (
    racer.bestLapTime && (!best || racer.bestLapTime < best.bestLapTime) ? racer : best
  ), null);
  if (fastest && finishers.indexOf(fastest) < 10) {
    const entry = state.cupEntries.find((cupEntry) => cupEntry.driver.id === fastest.driver.id);
    if (entry) entry.points += 1;
    addFeed(`Fastest lap: ${fastest.driver.name} (${formatLapTime(fastest.bestLapTime)}) — bonus point.`);
  }
  state.lastRaceCareer = recordPlayerRace(finishers, fastest);
  state.cupEntries.sort((a, b) => b.points - a.points || a.driver.name.localeCompare(b.driver.name));
  if (state.raceIndex >= getActiveCup().tracks.length - 1) recordPlayerCup();
  showResults(finishers);
}

// Safety valve only (a car wedged for a minute after the flag). Cars placed
// here never crossed the line, so their times are estimates from their own
// pace, and marked as such on the results.
function completeRemainingFinishers(now) {
  const currentPlace = state.racers.filter((racer) => racer.finished).length;
  const unfinished = [...state.racers]
    .filter((racer) => !racer.finished)
    .sort((a, b) => getRaceProgress(b) - getRaceProgress(a));
  const elapsed = Math.max(1, now - state.raceStart);
  const distance = state.track.totalLength * state.track.laps;
  const timed = state.racers.filter((racer) => racer.finished && racer.finishTime > 0);
  const referencePace = timed.length
    ? distance / Math.max(...timed.map((racer) => racer.finishTime))
    : (racerMeanMaxSpeed() * 0.8) / 1000;
  let previous = Math.max(0, ...timed.map((racer) => racer.finishTime));
  unfinished.forEach((racer, index) => {
    const covered = Math.max(0, getRaceProgress(racer));
    const pace = Math.max(covered / elapsed, referencePace * 0.5);
    const estimate = elapsed + Math.max(0, distance - covered) / pace;
    racer.finished = true;
    racer.finishPosition = currentPlace + index + 1;
    racer.finishTime = Math.max(estimate, previous + 1);
    racer.timeEstimated = true;
    previous = racer.finishTime;
  });
}

function racerMeanMaxSpeed() {
  return state.racers.reduce((sum, racer) => sum + racer.physics.maxSpeed, 0) / Math.max(1, state.racers.length);
}

function showResults(finishers) {
  const activeCup = getActiveCup();
  const fastest = finishers.reduce((best, racer) => (
    racer.bestLapTime && (!best || racer.bestLapTime < best.bestLapTime) ? racer : best
  ), null);
  state.phase = "results";
  // The cup's last race: the podium's drivers start loading now.
  if (state.raceIndex === activeCup.tracks.length - 1 && worldView() === "3d" && window.Render3D.podium) {
    render3dSafely(() => window.Render3D.podium.preload());
  }
  if (!window.Screens) return;
  window.Screens.showResults({
    kicker: `Race ${state.raceIndex + 1} of ${activeCup.tracks.length} · ${activeCup.name}`,
    title: state.track.name,
    nextLabel: state.raceIndex === activeCup.tracks.length - 1 ? "Show podium" : "Next race",
    rows: finishers.map((racer, index) => {
      const cupEntry = state.cupEntries.find((entry) => entry.driver.id === racer.driver.id);
      const racePoints = POINTS_TABLE[index] || 0;
      return {
        place: index + 1,
        name: racer.driver.name,
        code: racer.driver.code,
        teamColor: racer.kart.body,
        time: `${racer.timeEstimated ? "~" : ""}${formatRaceTime(racer.finishTime)}`,
        gap: index === 0 ? "—" : `${racer.timeEstimated ? "~" : ""}+${formatGapTime(racer.finishTime - finishers[0].finishTime)}`,
        bestLap: formatLapTime(racer.bestLapTime),
        fastest: Boolean(fastest && racer.id === fastest.id),
        racePoints,
        cupPoints: cupEntry ? cupEntry.points : racePoints,
        isPlayer: racer.id === state.playerId,
      };
    }),
    career: careerForRace(state.lastRaceCareer),
  });
}

function showPodium() {
  const activeCup = getActiveCup();
  recordPlayerCup();
  state.phase = "podium";
  if (!window.Screens) return;
  const playerPlace = state.cupEntries.findIndex((entry) => entry.isPlayer) + 1;
  const podium = state.cupEntries.slice(0, 3).map((entry, index) => ({
    place: index + 1,
    driverId: entry.driver.id,
    name: entry.driver.name,
    team: entry.kart.name,
    teamColor: entry.kart.body,
    points: entry.points,
    isPlayer: entry.isPlayer,
  }));
  window.Screens.showPodium({
    kicker: `${activeCup.name} complete`,
    title: playerPlace === 1 ? "Cup winner" : `You finished ${formatOrdinal(playerPlace)}`,
    podium,
    career: careerForCup(state.lastCupCareer, playerPlace),
  });
  // The ceremony in 3D (r3d/podium.js): the cup's real top three. Until it
  // can draw, the screen's 2D steps stand in.
  state.podium3d = false;
  if (worldView() === "3d" && window.Render3D.podium) {
    render3dSafely(() => window.Render3D.podium.begin({ cup: { id: activeCup.id, name: activeCup.name }, podium }));
  }
}

const PODIUM_PLATES_AT = 2.2;

// The podium phase's frame: the ceremony behind the screen, its name plates
// placed under the drivers; the 2D steps while it loads or without 3D.
function drawPodiumScene() {
  ctx.clearRect(0, 0, view.width, view.height);
  showViewLoading(null);
  let frame = null;
  if (worldView() === "3d" && window.Render3D.podium) {
    const drawn = render3dSafely(() => window.Render3D.podium.frame(performance.now()));
    if (drawn.ok) frame = drawn.value;
  }
  const on = Boolean(frame && frame.drawing);
  if (on !== state.podium3d || on) {
    state.podium3d = on;
    // The plates come in as the camera settles, as a broadcast's captions do.
    if (window.Screens && window.Screens.placePodium) window.Screens.placePodium(on ? frame.anchors : null, on && frame.t >= PODIUM_PLATES_AT);
  }
}

function nextRace() {
  // Only from the results screen: a hidden, still-focused Next race button
  // must not skip a race in progress.
  if (state.phase !== "results") return;
  if (state.raceIndex >= getActiveCup().tracks.length - 1) {
    showPodium();
    return;
  }
  state.raceIndex += 1;
  enterFullscreenMode();
  startRaceWeekend(state.raceIndex);
}

// What Q does from the pause screen: once you've taken the flag it keeps your result.
function pauseQuitHint(finished) {
  return finished ? "Q to save your result and go to the pit lane" : "Q to quit to the pit lane";
}

// Leaving a race. Once the player has taken the flag their race is done: it is
// finalised (the cars still running are placed on their pace, as the time
// limit would) and counts, before going back to the pit lane.
function quitToPitLane() {
  const player = getPlayer();
  if (state.phase === "race" && player && player.finished && !state.resultsQueued) {
    state.resultsQueued = true;
    completeRemainingFinishers(raceNow());
    finalizeRace();
  }
  resetToGarage();
}

function resetToGarage() {
  const wasPaused = state.paused;
  state.paused = false;
  state.pausedAt = 0;
  if (wasPaused && audio.ready && audio.master) {
    audio.master.gain.setTargetAtTime(audio.enabled ? 0.55 : 0, audio.ctx.currentTime, 0.05);
  }
  state.phase = "garage";
  // The ceremony stops and frees its drivers, set and effects.
  if (window.Render3D && window.Render3D.podium) render3dSafely(() => window.Render3D.podium.end());
  state.podium3d = false;
  state.raceIndex = 0;
  state.track = getSelectedCup().tracks[0];
  // Nothing run from the pit lane is wet.
  state.weather = "dry";
  state.cupEntries = [];
  state.racers = [];
  state.shots = [];
  state.hazards = [];
  state.safetyCar = null;
  state.lastSafetyCarAt = null;
  state.boxHiddenUntil = [];
  state.fxFlashes = [];
  state.simOffset = 0;
  state.stepAccum = 0;
  state.lastTick = null;
  state.finishQueue = [];
  state.qualifying = null;
  state.preparing = null;
  state.gridOrder = [];
  state.cameraHeading = 0;
  state.camPos = null;
  state.camRoll = 0;
  addFeed("Back in the pit lane.");
  if (window.Screens) window.Screens.showPitLane();
}

function drawTrack(track) {
  state.viewMode = "driver";
  const restore = placeForDrawing();
  try {
    drawDriverView(track);
  } finally {
    restore();
  }
}

// The physics steps at 60 Hz; a screen refreshes at its own rate (120 Hz on
// many laptops). Drawn straight from the physics, cars would move on some
// frames and not others -- a judder, worst in a pack. So each frame draws
// every car between its last two steps, by how far the clock has got into
// the next one, and puts it back afterwards. (A jump -- a rescue, the grid --
// is drawn as it is.)
function placeForDrawing() {
  const alpha = clamp((state.stepAccum || 0) / PHYSICS_STEP_MS, 0, 1);
  const moved = [];
  state.racers.forEach((racer) => {
    const from = racer.drawFrom;
    if (!from || Math.hypot(racer.x - from.x, racer.y - from.y) > 60) return;
    moved.push([racer, racer.x, racer.y, racer.heading]);
    racer.x = from.x + (racer.x - from.x) * alpha;
    racer.y = from.y + (racer.y - from.y) * alpha;
    racer.heading = from.heading + normalizeAngle(racer.heading - from.heading) * alpha;
  });
  const sc = state.safetyCar;
  let scWas = null;
  if (sc && sc.drawFrom && state.track) {
    const L = state.track.totalLength;
    const along = ((sc.d - sc.drawFrom.d) % L + L * 1.5) % L - L / 2;
    if (Math.abs(along) < 60) {
      scWas = [sc.d, sc.lat];
      sc.d = ((sc.drawFrom.d + along * alpha) % L + L) % L;
      sc.lat = sc.drawFrom.lat + (sc.lat - sc.drawFrom.lat) * alpha;
    }
  }
  return () => {
    moved.forEach(([racer, x, y, heading]) => { racer.x = x; racer.y = y; racer.heading = heading; });
    if (scWas) [sc.d, sc.lat] = scWas;
  };
}

function drawTrackBarriers(points, width, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 9]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(40, 25, 47, 0.8)";
  ctx.setLineDash([10, 9]);
  ctx.stroke();
  ctx.restore();
}

function getRouteDistanceForPoint(point, segments, cumulativeStarts) {
  let bestDistance = Infinity;
  let bestRouteDistance = 0;
  let bestIndex = 0;
  const visit = (segment, index) => {
    const hit = closestPointOnSegment(point, segment);
    if (hit.distance < bestDistance) {
      bestDistance = hit.distance;
      bestRouteDistance = cumulativeStarts[index] + segment.length * hit.t;
      bestIndex = index;
    }
  };
  const windowed = segmentSearchOrder(point, segments);
  if (windowed) windowed.forEach((index) => visit(segments[index], index));
  if (!windowed || bestDistance > segments[bestIndex].width * 3) {
    bestDistance = Infinity;
    segments.forEach(visit);
  }
  if (segments.isMain && point.isRacer) point.segmentHint = bestIndex;
  return bestRouteDistance;
}

function getTrackDistanceForPoint(point, track) {
  return getRouteDistanceForPoint(point, track.segments, track.cumulativeStarts);
}

function sampleRouteSurfaceAtDistance(route, rawDistance) {
  if (!route.segments.length) {
    return {
      point: route.fallbackPoint || { x: 0, y: 0 },
      tangentX: 1,
      tangentY: 0,
      normalX: 0,
      normalY: 1,
      width: route.defaultWidth || 48,
    };
  }

  let distanceOnRoute = rawDistance;
  if (route.closed) {
    distanceOnRoute %= route.totalLength;
    if (distanceOnRoute < 0) distanceOnRoute += route.totalLength;
  } else {
    distanceOnRoute = clamp(distanceOnRoute, 0, route.totalLength);
  }

  for (let index = 0; index < route.segments.length; index += 1) {
    const segment = route.segments[index];
    const start = route.cumulativeStarts[index];
    const end = start + segment.length;
    if (distanceOnRoute <= end || index === route.segments.length - 1) {
      const t = segment.length === 0 ? 0 : (distanceOnRoute - start) / segment.length;
      const tangentLength = segment.length || 1;
      const tangentX = segment.dx / tangentLength;
      const tangentY = segment.dy / tangentLength;
      return {
        point: {
          x: lerp(segment.a.x, segment.b.x, t),
          y: lerp(segment.a.y, segment.b.y, t),
        },
        tangentX,
        tangentY,
        normalX: -tangentY,
        normalY: tangentX,
        width: segment.width,
      };
    }
  }

  return {
    point: route.fallbackPoint || route.segments[0].a,
    tangentX: 1,
    tangentY: 0,
    normalX: 0,
    normalY: 1,
    width: route.defaultWidth || 48,
  };
}

function getMainRoute(track) {
  if (!track.mainRoute) {
    track.mainRoute = {
      segments: track.segments,
      cumulativeStarts: track.cumulativeStarts,
      totalLength: track.totalLength,
      fallbackPoint: track.points[0],
      defaultWidth: track.roadWidth,
      closed: true,
    };
  }
  return track.mainRoute;
}

// The waypoint a car should be aiming at, derived from how far around the lap
// it actually is. The old code only advanced the index when a car came within
// 34 units of the point, so a car shoved wide missed it, kept chasing a target
// it could never reach, and circled the same corner for the rest of the race.
function desiredWaypointIndex(racer, track) {
  const starts = track.cumulativeStarts;
  const total = track.totalLength;
  const ahead = (((racer.trackDistance || 0) + 34) % total + total) % total;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] > ahead) return i % track.points.length;
  }
  return 0;
}

function getCameraRoute(player, track) {
  if (player.shortcutActive) {
    const shortcutDistance = getRouteDistanceForPoint(player, track.shortcutSegments, track.shortcutCumulativeStarts);
    const shortcutRoute = {
      segments: track.shortcutSegments,
      cumulativeStarts: track.shortcutCumulativeStarts,
      totalLength: track.shortcutTotalLength,
      fallbackPoint: track.shortcut.points[0],
      defaultWidth: track.shortcut.width,
      closed: false,
    };
    return {
      currentSurface: sampleRouteSurfaceAtDistance(shortcutRoute, shortcutDistance),
      ...shortcutRoute,
    };
  }
  const mainRoute = {
    segments: track.segments,
    cumulativeStarts: track.cumulativeStarts,
    totalLength: track.totalLength,
    fallbackPoint: track.points[0],
    defaultWidth: track.roadWidth,
    closed: true,
  };
  return {
    currentSurface: sampleRouteSurfaceAtDistance(mainRoute, player.trackDistance ?? 0),
    ...mainRoute,
  };
}

function getCameraBaseDistance(player, track, route) {
  return route.closed
    ? (player.trackDistance ?? 0)
    : getRouteDistanceForPoint(player, route.segments, route.cumulativeStarts);
}




function getCameraHeading(player, track) {
  const route = getCameraRoute(player, track);
  if (state.phase === "countdown" || Math.abs(player.speed) < 18) {
    state.cameraHeading = getSurfaceForwardAngle(route.currentSurface, player.heading || track.startHeading);
    return state.cameraHeading;
  }
  const currentAngle = getSurfaceForwardAngle(route.currentSurface, player.heading);
  const baseDistance = getCameraBaseDistance(player, track, route);
  const lookaheadDistance = clamp(70 + Math.abs(player.speed) * 0.55, 70, 190);
  const futureSurface = sampleRouteSurfaceAtDistance(route, baseDistance + lookaheadDistance);
  const futureAngle = getSurfaceForwardAngle(futureSurface, currentAngle);
  // Lean into the corner a little, but only a little. Aiming the camera at the
  // road a long way ahead points it across a hairpin instead of along it, and
  // the whole track then projects off the side of the screen.
  const bias = clamp(normalizeAngle(futureAngle - currentAngle), -0.42, 0.42);
  const chosenAngle = normalizeAngle(currentAngle + bias * 0.35);
  state.cameraHeading = state.cameraHeading
    ? lerpAngle(state.cameraHeading, chosenAngle, 0.22)
    : chosenAngle;
  // Hard limit on how far the smoothed camera may drift from the road, so the
  // road ahead can never leave the picture.
  const drift = clamp(normalizeAngle(state.cameraHeading - currentAngle), -0.5, 0.5);
  state.cameraHeading = normalizeAngle(currentAngle + drift);
  return state.cameraHeading;
}

// ---------------------------------------------------------------------------
// Camera rig. Everything drawn in the driver view goes through projectScene so
// the road, the karts, the scenery and the item boxes all agree on where the
// ground is.
// ---------------------------------------------------------------------------

function updateCameraRig(player, track) {
  const heading = getCameraHeading(player, track);
  const route = getCameraRoute(player, track);
  const baseDistance = getCameraBaseDistance(player, track, route);
  const here = sampleRouteSurfaceAtDistance(route, baseDistance);
  const behind = sampleRouteSurfaceAtDistance(route, baseDistance - CAMERA.back);

  // How far off the racing line the player is sitting right now.
  const lateral = (player.x - here.point.x) * here.normalX + (player.y - here.point.y) * here.normalY;
  // The camera only chases part of that offset, so the remainder reads on
  // screen as the car moving left and right in front of you.
  const follow = clamp(lateral * 0.8, -here.width * 2.2, here.width * 2.2);
  const target = {
    x: behind.point.x + behind.normalX * follow,
    y: behind.point.y + behind.normalY * follow,
  };

  state.camPos = state.camPos
    ? { x: lerp(state.camPos.x, target.x, 0.28), y: lerp(state.camPos.y, target.y, 0.28) }
    : target;

  // The smoothing above can lag a long way through a fast corner, which throws
  // the car across the screen. Nudge the camera sideways so the player always
  // stays near the middle of the picture.
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const side = -(player.x - state.camPos.x) * sinH + (player.y - state.camPos.y) * cosH;
  const maxSide = 15;
  if (Math.abs(side) > maxSide) {
    const excess = side - Math.sign(side) * maxSide;
    state.camPos = {
      x: state.camPos.x + -sinH * excess,
      y: state.camPos.y + cosH * excess,
    };
  }

  // Bank the horizon slightly into the corner.
  const turnRate = normalizeAngle(heading - (state.camLastHeading ?? heading));
  state.camLastHeading = heading;
  const targetRoll = clamp(turnRate * 5.2, -0.075, 0.075);
  state.camRoll = lerp(state.camRoll || 0, targetRoll, 0.12);

  return heading;
}

function projectScene(camOrigin, cameraHeading, worldPoint, worldHeight = 0) {
  const dx = worldPoint.x - camOrigin.x;
  const dy = worldPoint.y - camOrigin.y;
  const cos = Math.cos(cameraHeading);
  const sin = Math.sin(cameraHeading);
  const forward = dx * cos + dy * sin;
  const side = -dx * sin + dy * cos;
  if (forward < CAMERA.nearClip) {
    return { visible: false, forward, side, x: 0, y: 0, scale: 0 };
  }
  const invZ = CAMERA.focal / forward;
  return {
    visible: forward <= CAMERA.farClip,
    forward,
    side,
    x: view.width / 2 + side * invZ,
    y: CAMERA.horizon + (CAMERA.height - worldHeight) * invZ,
    scale: invZ,
  };
}

function projectDriverView(origin, cameraHeading, worldPoint) {
  const dx = worldPoint.x - origin.x;
  const dy = worldPoint.y - origin.y;
  const cos = Math.cos(cameraHeading);
  const sin = Math.sin(cameraHeading);
  const forward = dx * cos + dy * sin;
  const side = -dx * sin + dy * cos;
  return { forward, side };
}

function buildDriverRoadSamples(track, player, cameraHeading) {
  const route = getCameraRoute(player, track);
  const baseDistance = getCameraBaseDistance(player, track, route);
  const camOrigin = state.camPos || getCameraOrigin(player, cameraHeading);
  const cos = Math.cos(cameraHeading);
  const sin = Math.sin(cameraHeading);
  const halfCanvas = view.width / 2;
  const samples = [];

  for (let i = 0; i < 58; i += 1) {
    const ahead = -CAMERA.back + 2 + i * 8 + i * i * 0.44;
    const routeDistance = baseDistance + ahead;
    const sample = sampleRouteSurfaceAtDistance(route, routeDistance);
    const center = projectScene(camOrigin, cameraHeading, sample.point);
    if (center.forward > CAMERA.farClip) break;
    if (!center.visible) continue;

    // Each edge is projected from its own world position so corners keep their
    // shape, but the whole row shares the centre's ground height.
    const edgeX = (offset) => {
      const px = sample.point.x + sample.normalX * offset;
      const py = sample.point.y + sample.normalY * offset;
      const ex = px - camOrigin.x;
      const ey = py - camOrigin.y;
      const f = Math.max(ex * cos + ey * sin, CAMERA.nearClip);
      const s = -ex * sin + ey * cos;
      return halfCanvas + s * (CAMERA.focal / f);
    };

    const shoulder = sample.width + 13;
    samples.push({
      y: center.y,
      scale: center.scale,
      forward: center.forward,
      routeDistance,
      centerX: center.x,
      leftRoadX: edgeX(-sample.width),
      rightRoadX: edgeX(sample.width),
      leftShoulderX: edgeX(-shoulder),
      rightShoulderX: edgeX(shoulder),
      laneHalf: Math.max(1, sample.width * 0.045 * center.scale),
    });
  }
  return samples;
}

function drawDriverRoad(samples, track) {
  const lapLength = track.totalLength;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const far = samples[index + 1];
    const near = samples[index];
    if (far.y > near.y) continue;

    const band = Math.floor(near.routeDistance / 26);
    const grassColor = band % 2 === 0 ? track.bg.grass : shadeColor(track.bg.grass, -7);
    const roadColor = band % 2 === 0 ? "#4b4b58" : "#525260";
    const curbColor = band % 2 === 0 ? (track.bg.curbA || "#ff5f57") : (track.bg.curbB || "#fff0c9");

    // Verge either side, so the ground reads as moving underneath you.
    drawQuad(0, near.y, near.leftShoulderX, near.y, far.leftShoulderX, far.y, 0, far.y, grassColor);
    drawQuad(near.rightShoulderX, near.y, view.width, near.y, view.width, far.y, far.rightShoulderX, far.y, grassColor);

    drawQuad(
      near.leftShoulderX, near.y, near.rightShoulderX, near.y,
      far.rightShoulderX, far.y, far.leftShoulderX, far.y,
      shadeColor(track.bg.shoulder || "#8d8d9c", -6),
    );
    drawQuad(
      near.leftRoadX, near.y, near.rightRoadX, near.y,
      far.rightRoadX, far.y, far.leftRoadX, far.y,
      roadColor,
    );
    drawQuad(
      near.leftShoulderX, near.y, near.leftRoadX, near.y,
      far.leftRoadX, far.y, far.leftShoulderX, far.y,
      curbColor,
    );
    drawQuad(
      near.rightRoadX, near.y, near.rightShoulderX, near.y,
      far.rightShoulderX, far.y, far.rightRoadX, far.y,
      curbColor,
    );

    // Centre line dashes.
    if (band % 2 === 0) {
      drawQuad(
        near.centerX - near.laneHalf, near.y, near.centerX + near.laneHalf, near.y,
        far.centerX + far.laneHalf, far.y, far.centerX - far.laneHalf, far.y,
        "rgba(255, 240, 201, 0.5)",
      );
    }

    // Start / finish line, drawn wherever the lap boundary falls between rows.
    const nearLap = Math.floor(near.routeDistance / lapLength);
    const farLap = Math.floor(far.routeDistance / lapLength);
    if (nearLap !== farLap) {
      drawCheckerBand(near, far);
    }

    // Barriers, thickness scaled with distance so they taper properly.
    const nearWall = Math.max(1, near.scale * 7);
    const farWall = Math.max(1, far.scale * 7);
    const wallColor = band % 2 === 0 ? "#fff0c9" : "#2b1d34";
    drawQuad(
      near.leftShoulderX - nearWall, near.y, near.leftShoulderX, near.y,
      far.leftShoulderX, far.y, far.leftShoulderX - farWall, far.y,
      wallColor,
    );
    drawQuad(
      near.rightShoulderX, near.y, near.rightShoulderX + nearWall, near.y,
      far.rightShoulderX + farWall, far.y, far.rightShoulderX, far.y,
      wallColor,
    );
  }
}

function drawCheckerBand(near, far) {
  const cells = 16;
  for (let c = 0; c < cells; c += 1) {
    const t0 = c / cells;
    const t1 = (c + 1) / cells;
    const nx0 = lerp(near.leftRoadX, near.rightRoadX, t0);
    const nx1 = lerp(near.leftRoadX, near.rightRoadX, t1);
    const fx0 = lerp(far.leftRoadX, far.rightRoadX, t0);
    const fx1 = lerp(far.leftRoadX, far.rightRoadX, t1);
    drawQuad(nx0, near.y, nx1, near.y, fx1, far.y, fx0, far.y, c % 2 === 0 ? "#f4f1e8" : "#1b1620");
  }
}

function shadeColor(hex, amount) {
  if (typeof hex !== "string" || hex[0] !== "#" || hex.length < 7) return hex;
  const clampByte = (v) => Math.max(0, Math.min(255, v));
  const r = clampByte(parseInt(hex.slice(1, 3), 16) + amount);
  const g = clampByte(parseInt(hex.slice(3, 5), 16) + amount);
  const b = clampByte(parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function getCameraOrigin(player, cameraHeading) {
  return {
    x: player.x - Math.cos(cameraHeading) * CAMERA.back,
    y: player.y - Math.sin(cameraHeading) * CAMERA.back,
  };
}

// ---------------------------------------------------------------------------
// Scene contents
// ---------------------------------------------------------------------------

function drawDriverSceneDecor(track, player, cameraHeading) {
  const camOrigin = state.camPos || getCameraOrigin(player, cameraHeading);
  const sprites = track.decor.map((decor) => {
    const projected = projectScene(camOrigin, cameraHeading, decor);
    if (!projected.visible || projected.forward > 1200 || projected.forward < 46) return null;
    if (projected.x < -400 || projected.x > view.width + 400) return null;
    return { decor, ...projected, size: clamp(DECOR_WORLD_SIZE * projected.scale, 1, 210) };
  }).filter(Boolean).sort((a, b) => b.forward - a.forward);

  sprites.forEach(({ decor, x, y, size }) => {
    if (size < 1.5) return;
    if (decor.type === "tree" || decor.type === "cactus") {
      ctx.fillStyle = "#3f6a34";
      ctx.fillRect(x - size * 0.12, y - size * 0.5, size * 0.24, size * 0.5);
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.5, y - size * 1.25, size, size * 0.8);
    } else if (decor.type === "grandstand") {
      ctx.fillStyle = "#2b2331";
      ctx.fillRect(x - size * 1.1, y - size * 0.95, size * 2.2, size * 0.95);
      ctx.fillStyle = decor.color;
      for (let row = 0; row < 4; row += 1) {
        ctx.fillRect(x - size * 0.95, y - size * (0.85 - row * 0.19), size * 1.9, size * 0.1);
      }
      ctx.fillStyle = "#fff0c9";
      for (let dot = 0; dot < 9; dot += 1) {
        ctx.fillRect(x - size * 0.86 + dot * size * 0.2, y - size * 0.72, size * 0.09, size * 0.09);
      }
    } else if (decor.type === "house" || decor.type === "tower") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.5, y - size * 1.35, size, size * 1.35);
      ctx.fillStyle = "#ffe8ad";
      ctx.fillRect(x - size * 0.14, y - size * 0.75, size * 0.28, size * 0.28);
    } else if (decor.type === "billboard" || decor.type === "lamp") {
      ctx.fillStyle = "#5e4331";
      ctx.fillRect(x - size * 0.06, y - size * 0.95, size * 0.12, size * 0.95);
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.42, y - size * 1.45, size * 0.84, size * 0.5);
    } else if (decor.type === "ghost") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.3, y - size * 1.1, size * 0.6, size * 0.7);
      ctx.fillRect(x - size * 0.24, y - size * 0.4, size * 0.48, size * 0.24);
    } else {
      ctx.fillStyle = decor.color || "#c46631";
      ctx.fillRect(x - size * 0.5, y - size * 0.9, size, size * 0.7);
    }
  });
}

function isOnRenderedStretch(point, track, player, cache) {
  if (cache && cache.routeDistance !== undefined) {
    var routeDistance = cache.routeDistance;
  } else {
    var routeDistance = getRouteDistanceForPoint(point, track.segments, track.cumulativeStarts);
    if (cache) cache.routeDistance = routeDistance;
  }
  const lapLength = track.totalLength;
  let delta = (routeDistance - (player.trackDistance || 0)) % lapLength;
  if (delta > lapLength / 2) delta -= lapLength;
  if (delta < -lapLength / 2) delta += lapLength;
  return delta > -160 && delta < 900;
}

function drawDriverItemBoxesInScene(track, player, cameraHeading) {
  const camOrigin = state.camPos || getCameraOrigin(player, cameraHeading);
  const now = renderClock();
  track.itemBoxes
    .filter((box, index) => !((state.boxHiddenUntil[index] || 0) > now))
    .map((box) => ({ box, ...projectScene(camOrigin, cameraHeading, box, ITEM_BOX_HEIGHT) }))
    .filter((entry) => entry.visible && entry.forward < 700 && entry.forward > 26
      && isOnRenderedStretch(entry.box, track, player, entry.box))
    .sort((a, b) => b.forward - a.forward)
    .forEach(({ box, x, y, scale }) => {
      const size = clamp(ITEM_BOX_SIZE * scale, 1, 56);
      if (size < 1.5) return;
      const pulse = 1 + Math.sin(now / 180 + box.x * 0.01 + box.y * 0.01) * 0.09;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 700);
      ctx.scale(size * pulse * 0.05, size * pulse * 0.05);
      ctx.fillStyle = "#dc0000";
      ctx.fillRect(-11, -11, 22, 22);
      ctx.strokeStyle = "#fff0c9";
      ctx.lineWidth = 2;
      ctx.strokeRect(-11, -11, 22, 22);
      ctx.fillStyle = "rgba(255, 240, 201, 0.9)";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    });
}

function drawDriverItemsInScene(player, cameraHeading) {
  const camOrigin = state.camPos || getCameraOrigin(player, cameraHeading);
  const frame = powerUpFrame(renderClock());
  const colours = { undercut: "#dc0000", stewardPenalty: "#0090ff", debris: "#00d2be", oilSlick: "#111111", safetyCar: "#c9ced6" };
  [...frame.shots, ...frame.hazards, ...frame.trails.map((t) => ({ ...t, type: "oilSlick" })),
    // (The 2D view has no pit lane to show a parked Safety Car in.)
    ...(frame.safetyCar && !frame.safetyCar.parked ? [{ ...frame.safetyCar, type: "safetyCar" }] : [])]
    .map((item) => ({ item, ...projectScene(camOrigin, cameraHeading, item, item.type === "stewardPenalty" ? 16 : 3) }))
    .filter((entry) => entry.visible && entry.forward < 700 && isOnRenderedStretch(entry.item, state.track, player, null))
    .sort((a, b) => b.forward - a.forward)
    .forEach(({ item, x, y, scale }) => {
      const size = clamp((item.type === "safetyCar" ? 16 : 9) * scale, 2, 60);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = colours[item.type] || "#ffffff";
      if (item.type === "oilSlick") {
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.4, size * 0.45, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillRect(-size, -size * 0.8, size * 2, size * 1.6);
      }
      ctx.restore();
    });
}

// Every car, including the player's, sorted back to front so overtakes read
// correctly whichever side they happen on.
function drawDriverRacers(player, track, cameraHeading) {
  const camOrigin = state.camPos || getCameraOrigin(player, cameraHeading);
  const now = renderClock();
  const lapLength = track.totalLength;
  const relativeDistance = (racer) => {
    let delta = ((racer.trackDistance || 0) - (player.trackDistance || 0)) % lapLength;
    if (delta > lapLength / 2) delta -= lapLength;
    if (delta < -lapLength / 2) delta += lapLength;
    return delta;
  };
  state.racers
    .filter((racer) => !racer.finished || racer.id === player.id)
    .filter((racer) => {
      if (racer.id === player.id) return true;
      const delta = relativeDistance(racer);
      return delta > -160 && delta < 900;
    })
    .map((racer) => ({ racer, ...projectScene(camOrigin, cameraHeading, racer, 0) }))
    .filter((entry) => entry.visible && entry.forward < 900
      && entry.x > -260 && entry.x < view.width + 260)
    .sort((a, b) => b.forward - a.forward)
    .forEach(({ racer, x, y, scale, forward }) => {
      const spriteScale = scale * KART_SPRITE_SCALE;
      if (spriteScale < 0.04) return;
      const yaw = normalizeAngle(racer.heading - cameraHeading);
      drawKartRear(ctx, x, y, spriteScale, racer.kart, racer.driver, yaw, {
        isPlayer: racer.id === player.id,
        boosting: racer.formationUntil > now || racer.boostUntil > now,
        spinning: racer.spinUntil > now,
      });
    });
}

// Rear three-quarter view of an F1 car, anchored at its contact patch.
function drawKartRear(targetCtx, x, y, scale, kart, driver, yaw, opts = {}) {
  const sway = Math.sin(yaw) * 0.85;
  targetCtx.save();
  targetCtx.translate(x, y);
  targetCtx.scale(scale, scale);
  if (opts.spinning) targetCtx.rotate(Math.sin(renderClock() / 90) * 0.25);
  // Lean the body into the direction the car is pointing.
  targetCtx.transform(1, 0, sway * 0.34, 1, 0, 0);

  const body = kart.body;
  const trim = kart.trim;

  // Shadow on the tarmac.
  targetCtx.fillStyle = "rgba(0, 0, 0, 0.32)";
  targetCtx.fillRect(-17, -3, 34, 5);

  if (opts.isPlayer) {
    targetCtx.save();
    targetCtx.globalAlpha = 0.55;
    targetCtx.fillStyle = "#75d5ff";
    targetCtx.beginPath();
    targetCtx.ellipse(0, -1, 21, 5, 0, 0, TAU);
    targetCtx.fill();
    targetCtx.restore();
  }

  if (opts.boosting) {
    targetCtx.fillStyle = "rgba(255, 174, 66, 0.75)";
    targetCtx.fillRect(-5, -13, 10, 9);
    targetCtx.fillStyle = "rgba(255, 240, 201, 0.9)";
    targetCtx.fillRect(-2.5, -12, 5, 7);
  }

  // Rear tyres.
  targetCtx.fillStyle = "#14141c";
  targetCtx.fillRect(-17, -14, 8, 14);
  targetCtx.fillRect(9, -14, 8, 14);
  targetCtx.fillStyle = "#2c2c38";
  targetCtx.fillRect(-17, -12, 8, 2);
  targetCtx.fillRect(9, -12, 8, 2);

  // Diffuser and floor.
  targetCtx.fillStyle = "#1c1c26";
  targetCtx.fillRect(-9, -7, 18, 7);
  targetCtx.fillStyle = trim;
  targetCtx.fillRect(-9, -8, 18, 2);

  // Engine cover / bodywork.
  targetCtx.fillStyle = body;
  targetCtx.fillRect(-8, -20, 16, 13);
  targetCtx.fillStyle = shadeColor(body, -22);
  targetCtx.fillRect(-8, -20, 3, 13);
  targetCtx.fillStyle = trim;
  targetCtx.fillRect(-3, -20, 6, 13);

  // Airbox, halo and helmet.
  targetCtx.fillStyle = shadeColor(body, 14);
  targetCtx.fillRect(-4, -26, 8, 6);

  // Rear wing.
  targetCtx.fillStyle = "#12121a";
  targetCtx.fillRect(-15, -25, 30, 4);
  targetCtx.fillStyle = trim;
  targetCtx.fillRect(-15, -25, 30, 1.6);
  targetCtx.fillStyle = shadeColor(body, -30);
  targetCtx.fillRect(-15, -26, 3, 8);
  targetCtx.fillRect(12, -26, 3, 8);

  // The helmet, seen over the rear wing, in the driver's own design
  // (driver.helmet): the base with the crown on top -- at this size two blocks
  // read, a thin stripe doesn't. The halo crosses in front of it.
  const helmet = driver.helmet || { base: driver.color, crown: driver.color };
  targetCtx.fillStyle = helmet.base;
  targetCtx.fillRect(-3, -31, 6, 5);
  targetCtx.fillStyle = helmet.crown;
  targetCtx.fillRect(-3, -31, 6, 2.4);
  targetCtx.fillStyle = "#101018";
  targetCtx.fillRect(-5, -27.2, 10, 1.4);

  // Rain light.
  targetCtx.fillStyle = "#ff3b30";
  targetCtx.fillRect(-1.6, -12, 3.2, 3);

  targetCtx.restore();
}

function drawParallaxHorizon(track, cameraHeading) {
  const horizon = CAMERA.horizon;
  const span = 2600;
  const pan = -(cameraHeading / TAU) * span;
  const wrap = ((pan % span) + span) % span;

  ctx.fillStyle = track.bg.sun || "#ffe08a";
  const sunX = ((wrap + 1700) % span) - 300;
  ctx.beginPath();
  ctx.arc(sunX, horizon - 118, 30, 0, TAU);
  ctx.fill();

  for (let pass = -1; pass <= 1; pass += 1) {
    const offset = wrap + pass * span;
    ctx.save();
    ctx.translate(offset, 0);

    ctx.fillStyle = track.bg.horizonB || "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(0, horizon - 88);
    for (let i = 1; i <= 13; i += 1) {
      const hillHeight = 52 + ((i * 37) % 60);
      ctx.lineTo((i / 13) * span, horizon - hillHeight);
    }
    ctx.lineTo(span, horizon);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = track.bg.horizonA || "rgba(0, 0, 0, 0.26)";
    for (let i = 0; i < 26; i += 1) {
      const bx = i * 100 + (i % 2) * 14;
      const bw = 54 + (i % 3) * 24;
      const bh = 26 + ((i + 1) % 4) * 20;
      ctx.fillRect(bx, horizon - bh, bw, bh);
    }
    ctx.restore();
  }
}

function drawDriverView(track) {
  const player = getPlayer();
  if (!player) {
    drawGarageScene();
    return;
  }
  let cameraHeading = updateCameraRig(player, track);

  // The 3D renderer (render3d.js) draws the world when it has loaded; this
  // canvas then only carries the HUD on top. While it loads only the loading
  // state shows; the 2D view is only for when 3D is unavailable.
  const mode = worldView();
  // Timing the field shows its progress in the loading panel, over the circuit.
  const timing = state.phase === "qualifyingSim";
  if (state.preparing) setViewLoadingText(state.weather === "wet" ? "Building the circuit… it's raining" : "Building the circuit…");
  else if (!timing) setViewLoadingText("Warming up the car…");
  showViewLoading(mode === "loading" || timing || state.preparing ? "race" : null);
  if (mode === "loading") {
    ctx.clearRect(0, 0, view.width, view.height);
    return;
  }
  if (mode === "3d") {
    const now = renderClock();
    ctx.clearRect(0, 0, view.width, view.height);
    const surface = render3dSafely(() => window.Render3D.render({
      track,
      player,
      racers: state.racers,
      cameraHeading,
      camPos: state.camPos,
      roll: state.camRoll,
      shake: getScreenShake(),
      powerUps: powerUpFrame(now),
      particles: state.particles,
      now,
      // Real racing frames only, for the graphics auto tier: not the
      // countdown, qualifying, a pause, the loading panel, or the
      // fast-forward after the flag.
      racing: state.phase === "race" && !state.paused && !state.preparing && !state.flagOutAt,
      trackside: tracksideFrame(now),
      weather: state.weather,
    }));
    if (surface.ok) {
      const onKerb = surface.value && surface.value.onKerb;
      if (onKerb && state.phase === "race" && !state.paused && Math.abs(player.speed) > 40) sfx.kerb();
      drawDriverItemBadge(player);
      drawMiniMap(track, player, { x: view.width - 224, y: 12, width: 212, height: 212 });
      drawDriverHud(track, player);
      if (state.phase === "countdown") drawStartLights(now);
      drawLightsOutFlash(now);
      return;
    }
    // The 3D renderer failed on this frame: carry on in 2D from here.
  }

  state.fallbackFrames += 1;
  let samples = buildDriverRoadSamples(track, player, cameraHeading);
  const onScreen = samples.filter((sample) => sample.y > CAMERA.horizon - 4
    && sample.y < view.height + 500
    && sample.rightShoulderX > -300
    && sample.leftShoulderX < view.width + 300).length;
  const roadCollapsed = samples.length < 3 || onScreen < 3;
  if (roadCollapsed) {
    const fallbackRoute = getCameraRoute(player, track);
    cameraHeading = getSurfaceForwardAngle(fallbackRoute.currentSurface, player.heading);
    state.cameraHeading = cameraHeading;
    state.camPos = getCameraOrigin(player, cameraHeading);
    samples = buildDriverRoadSamples(track, player, cameraHeading);
  }

  ctx.clearRect(0, 0, view.width, view.height);

  ctx.save();
  const shake = getScreenShake();
  ctx.translate(shake.x, shake.y);
  // Bank the whole world slightly through corners.
  ctx.translate(view.width / 2, CAMERA.horizon);
  ctx.rotate(state.camRoll || 0);
  ctx.translate(-view.width / 2, -CAMERA.horizon);

  const sky = ctx.createLinearGradient(0, -120, 0, CAMERA.horizon + 40);
  sky.addColorStop(0, shadeColor(track.bg.sky, -26));
  sky.addColorStop(1, track.bg.sky);
  ctx.fillStyle = sky;
  ctx.fillRect(-400, -200, view.width + 800, CAMERA.horizon + 202);
  drawParallaxHorizon(track, cameraHeading);
  ctx.fillStyle = track.bg.grass;
  ctx.fillRect(-400, CAMERA.horizon, view.width + 800, view.height - CAMERA.horizon + 220);

  drawDriverRoad(samples, track);
  drawDriverSceneDecor(track, player, cameraHeading);
  drawDriverItemBoxesInScene(track, player, cameraHeading);
  drawDriverItemsInScene(player, cameraHeading);
  drawSceneParticles(player, cameraHeading);
  drawDriverRacers(player, track, cameraHeading);
  ctx.restore();

  drawSpeedLines(player);
  drawDriverItemBadge(player);
  drawMiniMap(track, player, { x: view.width - 224, y: 12, width: 212, height: 212 });
  drawDriverHud(track, player);
  if (state.phase === "countdown") drawStartLights(renderClock());
  drawLightsOutFlash(renderClock());
}

// Subtle speed streaks at the screen edges once you are really moving.
// ---------------------------------------------------------------------------
// Audio. Everything is synthesised with WebAudio -- no asset files, no loading.
// The context can only start after a user gesture, so initAudio() is called
// from the first click or key press.
// ---------------------------------------------------------------------------

const audio = {
  ctx: null,
  master: null,
  engine: null,
  screech: null,
  // The venue: reverb (tunnel, under a bridge) and the crowd (venue.js).
  venue: null,
  noiseBuffer: null,
  ready: false,
  enabled: true,
  lastBeepStep: -1,
};

function loadAudioPreference() {
  try {
    const stored = window.localStorage.getItem("f1pixelcup.sound");
    if (stored !== null) audio.enabled = stored === "on";
  } catch (err) {
    // Private browsing or blocked storage: just keep the default.
  }
}

function saveAudioPreference() {
  try {
    window.localStorage.setItem("f1pixelcup.sound", audio.enabled ? "on" : "off");
  } catch (err) {
    // Nothing to do; the preference simply will not persist.
  }
}

// A reverb's impulse: stereo noise decaying over `seconds`, a little
// different in each ear.
function makeReverbImpulse(ctxA, seconds) {
  const length = Math.floor(ctxA.sampleRate * seconds);
  const buffer = ctxA.createBuffer(2, length, ctxA.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
  }
  return buffer;
}

function makeNoiseBuffer(ctx, seconds = 1.4) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function initAudio() {
  if (audio.ready) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    audio.ctx = new AudioCtx();
  } catch (err) {
    return;
  }
  const ctxA = audio.ctx;
  audio.master = ctxA.createGain();
  audio.master.gain.value = audio.enabled ? 0.55 : 0;
  audio.master.connect(ctxA.destination);
  audio.noiseBuffer = makeNoiseBuffer(ctxA);

  // Engine: two detuned oscillators through a lowpass that opens with revs.
  const engineGain = ctxA.createGain();
  engineGain.gain.value = 0;
  const engineFilter = ctxA.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 700;
  engineFilter.Q.value = 6;
  const oscA = ctxA.createOscillator();
  oscA.type = "sawtooth";
  oscA.frequency.value = 55;
  const oscB = ctxA.createOscillator();
  oscB.type = "square";
  oscB.frequency.value = 82;
  const oscBGain = ctxA.createGain();
  oscBGain.gain.value = 0.4;
  oscA.connect(engineFilter);
  oscB.connect(oscBGain);
  oscBGain.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(audio.master);
  oscA.start();
  oscB.start();
  audio.engine = { oscA, oscB, gain: engineGain, filter: engineFilter };

  // Tyre scrub: looping noise through a bandpass, opened while sliding.
  const screechSource = ctxA.createBufferSource();
  screechSource.buffer = audio.noiseBuffer;
  screechSource.loop = true;
  const screechFilter = ctxA.createBiquadFilter();
  screechFilter.type = "bandpass";
  screechFilter.frequency.value = 1750;
  screechFilter.Q.value = 7;
  const screechGain = ctxA.createGain();
  screechGain.gain.value = 0;
  screechSource.connect(screechFilter);
  screechFilter.connect(screechGain);
  screechGain.connect(audio.master);
  screechSource.start();
  audio.screech = { gain: screechGain, filter: screechFilter };

  // The venue. The engine also feeds a reverb -- a room made of decaying
  // noise, a second long -- whose level rises in a tunnel or under a bridge.
  // And a crowd: noise shaped to a roar, swelling past the grandstands.
  const convolver = ctxA.createConvolver();
  convolver.buffer = makeReverbImpulse(ctxA, 1.1);
  const reverbGain = ctxA.createGain();
  reverbGain.gain.value = 0;
  // (The engine feeds it only on circuits with somewhere to ring: see
  // venueSound's caller.)
  convolver.connect(reverbGain);
  reverbGain.connect(audio.master);
  const crowdSource = ctxA.createBufferSource();
  // Its own, longer noise: a short loop sustained past a grandstand would be
  // heard repeating.
  crowdSource.buffer = makeNoiseBuffer(ctxA, 6);
  crowdSource.loop = true;
  const crowdFilter = ctxA.createBiquadFilter();
  crowdFilter.type = "bandpass";
  crowdFilter.frequency.value = 650;
  crowdFilter.Q.value = 0.7;
  const crowdGain = ctxA.createGain();
  crowdGain.gain.value = 0;
  crowdSource.connect(crowdFilter);
  crowdFilter.connect(crowdGain);
  crowdGain.connect(audio.master);
  crowdSource.start();
  // The floodlights' mains hum: 100 Hz and its first harmonic, very quiet.
  const humGain = ctxA.createGain();
  humGain.gain.value = 0;
  [100, 200].forEach((f, i) => {
    const osc = ctxA.createOscillator();
    osc.frequency.value = f;
    const g = ctxA.createGain();
    g.gain.value = i ? 0.35 : 1;
    osc.connect(g);
    g.connect(humGain);
    osc.start();
  });
  humGain.connect(audio.master);
  // The TV helicopter's rotor: low noise pulsed at the blades' beat.
  const rotorSource = ctxA.createBufferSource();
  rotorSource.buffer = makeNoiseBuffer(ctxA, 3);
  rotorSource.loop = true;
  const rotorFilter = ctxA.createBiquadFilter();
  rotorFilter.type = "lowpass";
  rotorFilter.frequency.value = 140;
  const rotorPulse = ctxA.createGain();
  rotorPulse.gain.value = 0.5;
  const beat = ctxA.createOscillator();
  beat.frequency.value = 11;
  const beatDepth = ctxA.createGain();
  beatDepth.gain.value = 0.5;
  beat.connect(beatDepth);
  beatDepth.connect(rotorPulse.gain);
  const rotorGain = ctxA.createGain();
  rotorGain.gain.value = 0;
  rotorSource.connect(rotorFilter);
  rotorFilter.connect(rotorPulse);
  rotorPulse.connect(rotorGain);
  rotorGain.connect(audio.master);
  rotorSource.start();
  beat.start();
  // Rain: a steady hiss of drops (the noise with its lows and highs taken
  // off), and the wet tyres' hiss, brighter and following the speed.
  const rainSource = ctxA.createBufferSource();
  rainSource.buffer = makeNoiseBuffer(ctxA, 5);
  rainSource.loop = true;
  const rainLow = ctxA.createBiquadFilter();
  rainLow.type = "highpass";
  rainLow.frequency.value = 500;
  const rainHigh = ctxA.createBiquadFilter();
  rainHigh.type = "lowpass";
  rainHigh.frequency.value = 5200;
  const rainGain = ctxA.createGain();
  rainGain.gain.value = 0;
  rainSource.connect(rainLow);
  rainLow.connect(rainHigh);
  rainHigh.connect(rainGain);
  rainGain.connect(audio.master);
  rainSource.start();
  const hissSource = ctxA.createBufferSource();
  hissSource.buffer = makeNoiseBuffer(ctxA, 2.3);
  hissSource.loop = true;
  const hissFilter = ctxA.createBiquadFilter();
  hissFilter.type = "bandpass";
  hissFilter.frequency.value = 2600;
  hissFilter.Q.value = 0.8;
  const hissGain = ctxA.createGain();
  hissGain.gain.value = 0;
  hissSource.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(audio.master);
  hissSource.start();
  audio.venue = { reverb: reverbGain, crowd: crowdGain, hum: humGain, rotor: rotorGain, rain: rainGain, hiss: hissGain, convolver, engineGain, feeding: false };

  audio.ready = true;
  updateSoundButton();
}

function setAudioEnabled(enabled) {
  audio.enabled = enabled;
  saveAudioPreference();
  if (audio.ready && audio.master) {
    // Stay silent if the game is paused, whatever the toggle says.
    const level = enabled && !state.paused ? 0.55 : 0;
    audio.master.gain.setTargetAtTime(level, audio.ctx.currentTime, 0.04);
  }
  updateSoundButton();
}

function updateSoundButton() {
  if (window.Screens) window.Screens.refreshSettings();
}

function audioReady() {
  return audio.ready && audio.enabled && audio.ctx && audio.ctx.state === "running";
}

// One-shot pitched blip.
function playTone(frequency, { endFrequency, type = "square", duration = 0.16, volume = 0.3, delay = 0 } = {}) {
  if (!audioReady()) return;
  const ctxA = audio.ctx;
  const start = ctxA.currentTime + delay;
  const osc = ctxA.createOscillator();
  const gain = ctxA.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

// One-shot noise burst, for impacts and scrapes.
function playNoise({ duration = 0.2, volume = 0.35, frequency = 900, type = "lowpass", sweepTo } = {}) {
  if (!audioReady()) return;
  const ctxA = audio.ctx;
  const start = ctxA.currentTime;
  const source = ctxA.createBufferSource();
  source.buffer = audio.noiseBuffer;
  const filter = ctxA.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, start);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), start + duration);
  const gain = ctxA.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  source.start(start);
  source.stop(start + duration + 0.02);
}

const sfxLastPlayed = {};

// Rate limit for sounds that can be triggered many times in a single frame.
function sfxAllowed(key, minimumGapMs) {
  const now = performance.now();
  if (now - (sfxLastPlayed[key] || 0) < minimumGapMs) return false;
  sfxLastPlayed[key] = now;
  return true;
}

const sfx = {
  lightBeep: () => playTone(620, { duration: 0.16, volume: 0.3, type: "square" }),
  lightsOut: () => {
    playTone(880, { duration: 0.45, volume: 0.34, type: "square" });
    playTone(1320, { duration: 0.45, volume: 0.18, type: "square", delay: 0.02 });
  },
  impact: () => {
    if (!sfxAllowed("impact", 130)) return;
    playNoise({ duration: 0.18, volume: 0.4, frequency: 1200, sweepTo: 180 });
    playTone(120, { endFrequency: 60, duration: 0.16, volume: 0.28, type: "triangle" });
  },
  spin: () => {
    if (!sfxAllowed("spin", 400)) return;
    playTone(420, { endFrequency: 90, duration: 0.6, volume: 0.3, type: "sawtooth" });
  },
  itemGet: () => {
    playTone(660, { duration: 0.09, volume: 0.24 });
    playTone(880, { duration: 0.09, volume: 0.24, delay: 0.09 });
    playTone(1180, { duration: 0.14, volume: 0.24, delay: 0.18 });
  },
  itemUse: () => playTone(300, { endFrequency: 900, duration: 0.18, volume: 0.28, type: "square" }),
  lap: () => {
    playTone(760, { duration: 0.12, volume: 0.26 });
    playTone(1140, { duration: 0.18, volume: 0.24, delay: 0.1 });
  },
  finalLap: () => {
    playTone(980, { duration: 0.14, volume: 0.3 });
    playTone(980, { duration: 0.14, volume: 0.3, delay: 0.18 });
  },
  finish: () => {
    [523, 659, 784, 1047].forEach((note, index) => {
      playTone(note, { duration: 0.3, volume: 0.3, delay: index * 0.13, type: "triangle" });
    });
  },
  // Short low thuds, repeated while the tyres are on a kerb.
  kerb: () => {
    if (!sfxAllowed("kerb", 70)) return;
    playNoise({ duration: 0.06, volume: 0.22, frequency: 260, sweepTo: 120 });
  },
  boost: () => {
    if (!sfxAllowed("boost", 260)) return;
    playTone(220, { endFrequency: 720, duration: 0.3, volume: 0.26, type: "sawtooth" });
  },
};

// Continuous engine and tyre noise, driven from the player's car each frame.
// How much of the venue the player hears where they are: the reverb level
// and the crowd's. Kept in state.venueSound (the checks read it).
function venueSound(player, racing) {
  const track = state.track;
  const out = { reverb: 0, crowd: 0, hum: 0, helicopter: 0, rain: 0, hiss: 0 };
  if (track && player && racing && window.Venue) {
    // The helicopter flies 400 behind the leader, 260 up and 220 aside:
    // heard faintly when it is near.
    const leader = firstUnfinished();
    if (leader) {
      const along = Venue.delta(player.trackDistance || 0, wrapLap((leader.trackDistance || 0) - 400), track.totalLength);
      const distance = Math.hypot(along, 220, 260);
      out.helicopter = Math.max(0, 1 - distance / 700);
    }
    out.reverb = Venue.reverbAt(player.trackDistance || 0, track.reverbZones, track.totalLength);
    out.crowd = Venue.crowdAt(player.trackDistance || 0, track.crowdStands, track.totalLength);
    out.hum = Venue.FLOODLIT.includes(track.id) ? 1 : 0;
    if (state.weather === "wet") {
      // Under the tunnel's roof the rain is shut out, and the road is dry.
      const covered = track.tunnel ? Venue.reverbAt(player.trackDistance || 0, [track.tunnel], track.totalLength) : 0;
      out.rain = 1 - covered;
      out.hiss = clamp(Math.abs(player.speed) / Math.max(1, player.physics.maxSpeed), 0, 1) * (1 - covered);
    }
  }
  state.venueSound = out;
  return out;
}

function updateEngineAudio(player) {
  if (!audio.ready || !audio.engine) return;
  const ctxA = audio.ctx;
  const now = ctxA.currentTime;
  const racing = state.phase === "race" || state.phase === "countdown" || state.phase === "qualifying";
  const maxSpeed = Math.max(1, player ? player.physics.maxSpeed : 1);
  const ratio = player ? clamp(Math.abs(player.speed) / maxSpeed, 0, 1.25) : 0;

  // Fake gearing: the note climbs, drops back, and climbs again.
  const geared = (ratio * 4) % 1;
  const base = 46 + geared * 58 + ratio * 66;
  audio.engine.oscA.frequency.setTargetAtTime(base, now, 0.05);
  audio.engine.oscB.frequency.setTargetAtTime(base * 1.5, now, 0.05);
  audio.engine.filter.frequency.setTargetAtTime(420 + ratio * 2400, now, 0.06);
  const idle = racing ? 0.055 : 0;
  const level = player && player.finished ? 0 : idle + ratio * 0.1;
  audio.engine.gain.gain.setTargetAtTime(level, now, 0.09);

  if (audio.venue) {
    // The convolver only runs where the circuit has a tunnel or a bridge.
    const rings = Boolean(state.track && state.track.reverbZones && state.track.reverbZones.length);
    if (rings !== audio.venue.feeding) {
      if (rings) audio.venue.engineGain.connect(audio.venue.convolver);
      else audio.venue.engineGain.disconnect(audio.venue.convolver);
      audio.venue.feeding = rings;
    }
    const venue = venueSound(player, racing);
    audio.venue.reverb.gain.setTargetAtTime(venue.reverb * 0.9, now, 0.08);
    audio.venue.crowd.gain.setTargetAtTime(venue.crowd * 0.07, now, 0.25);
    audio.venue.hum.gain.setTargetAtTime(venue.hum * 0.012, now, 0.4);
    audio.venue.rotor.gain.setTargetAtTime(venue.helicopter * 0.05, now, 0.3);
    audio.venue.rain.gain.setTargetAtTime(venue.rain * 0.045, now, 0.4);
    audio.venue.hiss.gain.setTargetAtTime(venue.hiss * 0.06, now, 0.1);
  }

  if (audio.screech) {
    const sliding = player && !player.finished
      && (player.drifting || (Math.abs(player.speed) > 60 && !findSurfaceInfo(player, state.track).onRoad));
    audio.screech.gain.gain.setTargetAtTime(sliding ? 0.13 : 0, now, 0.07);
  }
}

// ---------------------------------------------------------------------------
// Particles: drift smoke, boost flame and dirt kicked up off the kerbs. They
// live in world space and are projected through the same camera as everything
// else, so they sit on the track rather than floating on the glass.
// ---------------------------------------------------------------------------

const MAX_PARTICLES = 220;

function spawnParticle(particle) {
  if (state.particles.length >= MAX_PARTICLES) return;
  state.particles.push(particle);
}

// Smoke, sparks and screen shake draw their own random numbers, never the
// simulation's: how many puffs are alive depends on the frame rate, and if
// they shared Math.random with the AI, a 30 fps race would play out
// differently from a 60 fps one. The race itself is frame-rate independent.
let visualSeed = (Date.now() ^ 0x9e3779b9) >>> 0;
function visualRandom() {
  visualSeed = (visualSeed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(visualSeed ^ (visualSeed >>> 15), 1 | visualSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function emitRacerParticles(racer, dt, now, offroad) {
  if (state.headless) return;
  const boosting = racer.boostUntil > now || racer.formationUntil > now;
  const sliding = racer.drifting;
  const scuffing = offroad && Math.abs(racer.speed) > 40;
  if (!boosting && !sliding && !scuffing) return;

  racer.emitAccum = (racer.emitAccum || 0) + dt;
  const interval = 0.035;
  while (racer.emitAccum >= interval) {
    racer.emitAccum -= interval;
    const cos = Math.cos(racer.heading);
    const sin = Math.sin(racer.heading);
    const spread = (visualRandom() - 0.5) * 13;
    const px = racer.x - cos * 15 - sin * spread;
    const py = racer.y - sin * 15 + cos * spread;

    if (sliding) {
      // Smoke takes on the colour of the boost that is charging, so you can
      // see the drift ripening without looking away from the road.
      const charge = racer.driftCharge;
      const color = charge > 1.6 ? "#ff9a3c" : charge > 0.9 ? "#75d5ff" : "#e6e6ef";
      spawnParticle({
        x: px, y: py,
        vx: (visualRandom() - 0.5) * 28, vy: (visualRandom() - 0.5) * 28,
        life: 0.55, maxLife: 0.55, size: 5 + visualRandom() * 4, color, height: 3,
      });
    } else if (boosting) {
      spawnParticle({
        x: px, y: py,
        vx: (visualRandom() - 0.5) * 18, vy: (visualRandom() - 0.5) * 18,
        life: 0.3, maxLife: 0.3, size: 4 + visualRandom() * 3,
        color: visualRandom() < 0.5 ? "#ffd166" : "#ff6b35", height: 6,
      });
    } else {
      spawnParticle({
        x: px, y: py,
        vx: (visualRandom() - 0.5) * 24, vy: (visualRandom() - 0.5) * 24,
        life: 0.7, maxLife: 0.7, size: 4 + visualRandom() * 4, color: "#8f7a52", height: 3,
      });
    }
  }
}

function updateParticles(dt) {
  state.particles = state.particles.filter((particle) => {
    particle.life -= dt;
    if (particle.life <= 0) return false;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.94;
    particle.vy *= 0.94;
    return true;
  });
}

function drawSceneParticles(player, cameraHeading) {
  if (!state.particles.length) return;
  const camOrigin = state.camPos || getCameraOrigin(player, cameraHeading);
  state.particles
    .map((particle) => ({ particle, ...projectScene(camOrigin, cameraHeading, particle, particle.height) }))
    .filter((entry) => entry.visible && entry.forward < 700)
    .sort((a, b) => b.forward - a.forward)
    .forEach(({ particle, x, y, scale }) => {
      const size = clamp(particle.size * scale, 1, 34);
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1) * 0.72;
      ctx.fillStyle = particle.color;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.restore();
    });
}

function addScreenShake(magnitude, durationMs) {
  const now = performance.now();
  state.shakeMag = Math.min(11, Math.max(state.shakeMag || 0, magnitude));
  state.shakeUntil = Math.max(state.shakeUntil || 0, now + durationMs);
}

function getScreenShake() {
  if (state.paused) return { x: 0, y: 0 };
  const now = performance.now();
  if (now > (state.shakeUntil || 0)) return { x: 0, y: 0 };
  const remaining = ((state.shakeUntil - now) / 220);
  const mag = (state.shakeMag || 0) * clamp(remaining, 0, 1);
  return {
    x: (visualRandom() - 0.5) * mag * 2,
    y: (visualRandom() - 0.5) * mag * 2,
  };
}

// ---------------------------------------------------------------------------
// Start procedure: five red lights on, then out.
// ---------------------------------------------------------------------------

function drawStartLights(now) {
  const elapsed = (now - state.countdownStart) / 1000;
  const lit = clamp(Math.floor((elapsed - 0.35) / 0.62) + 1, 0, 5);
  const panelWidth = 358;
  const panelHeight = 96;
  const x = Math.round(view.width / 2 - panelWidth / 2);
  const y = 62;

  ctx.save();
  ctx.fillStyle = "rgba(10, 8, 16, 0.9)";
  ctx.fillRect(x, y, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(255, 240, 201, 0.32)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, panelWidth - 2, panelHeight - 2);
  // Gantry legs.
  ctx.fillStyle = "rgba(10, 8, 16, 0.9)";
  ctx.fillRect(x + 26, y - 16, 10, 16);
  ctx.fillRect(x + panelWidth - 36, y - 16, 10, 16);

  for (let i = 0; i < 5; i += 1) {
    const cx = x + 46 + i * 67;
    const on = i < lit;
    for (let row = 0; row < 2; row += 1) {
      const cy = y + 30 + row * 38;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, TAU);
      ctx.fillStyle = on ? "#e8231a" : "#2a1d22";
      ctx.fill();
      if (on) {
        ctx.strokeStyle = "rgba(255, 120, 100, 0.85)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 5, 4, 0, TAU);
        ctx.fillStyle = "rgba(255, 220, 210, 0.75)";
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(255, 240, 201, 0.14)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawLightsOutFlash(now) {
  const since = now - (state.raceStart || 0);
  if (!state.raceStart || since > 1100) return;
  const fade = 1 - since / 1100;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "#39d98a";
  ctx.font = "bold 84px Georgia";
  ctx.textAlign = "center";
  ctx.fillText("LIGHTS OUT", view.width / 2, 150);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawSpeedLines(player) {
  const ratio = clamp(Math.abs(player.speed) / Math.max(1, player.physics.maxSpeed), 0, 1.4);
  if (ratio < 0.62) return;
  const strength = (ratio - 0.62) / 0.6;
  const now = renderClock();
  ctx.save();
  ctx.globalAlpha = clamp(strength * 0.5, 0, 0.45);
  ctx.strokeStyle = "#fff0c9";
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i += 1) {
    const seed = (i * 97 + Math.floor(now / 45)) % 360;
    const t = (seed / 360);
    const edge = i % 2 === 0 ? -1 : 1;
    const x = view.width / 2 + edge * (view.width * 0.32 + t * view.width * 0.22);
    const y = CAMERA.horizon + 40 + t * (view.height - CAMERA.horizon);
    const len = 26 + strength * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + edge * len * 0.7, y + len * 0.42);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Mini map. Rotated so that "up" is always the direction you are looking, with
// a field-of-view wedge matching the camera on the main screen.
// ---------------------------------------------------------------------------

function getTrackMapGeometry(track) {
  if (track.mapGeometry) return track.mapGeometry;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  track.points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let radius = 1;
  track.points.forEach((point) => {
    radius = Math.max(radius, Math.hypot(point.x - cx, point.y - cy));
  });
  track.mapGeometry = { cx, cy, radius: (radius + track.roadWidth + 26) * 1.08 };
  return track.mapGeometry;
}

function drawMiniMap(track, player, frame) {
  const geo = getTrackMapGeometry(track);
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  const radius = Math.min(frame.width, frame.height) / 2 - 6;
  const scale = radius / geo.radius;
  // A world point straight ahead of the camera must land straight up.
  const rot = -(state.cameraHeading || 0) - Math.PI / 2;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  const toMap = (point) => {
    const dx = (point.x - geo.cx) * scale;
    const dy = (point.y - geo.cy) * scale;
    return { x: cx + dx * cosR - dy * sinR, y: cy + dx * sinR + dy * cosR };
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fillStyle = "rgba(8, 6, 14, 0.82)";
  ctx.fill();
  ctx.clip();

  // Track ribbon, drawn in world space so widths scale with the map.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(-geo.cx, -geo.cy);

  const ribbon = (points, width, color, dash) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  ribbon(track.points, (track.roadWidth + 20) * 2, "rgba(117, 213, 255, 0.22)");
  ribbon(track.points, (track.roadWidth + 8) * 2, "rgba(255, 240, 201, 0.5)");
  ribbon(track.points, track.roadWidth * 2, "#4d4d5e");
  ribbon(track.points, Math.max(2 / scale, track.roadWidth * 0.09), "rgba(255, 240, 201, 0.42)", [track.roadWidth * 0.6, track.roadWidth * 0.5]);
  ctx.restore();

  // Field of view wedge: this is literally what fills the screen in front of you.
  const fov = Math.atan(view.width / 2 / CAMERA.focal);
  const eye = toMap(state.camPos || player);
  const wedge = ctx.createRadialGradient(eye.x, eye.y, 0, eye.x, eye.y, radius * 1.15);
  wedge.addColorStop(0, "rgba(117, 213, 255, 0.42)");
  wedge.addColorStop(1, "rgba(117, 213, 255, 0)");
  ctx.beginPath();
  ctx.moveTo(eye.x, eye.y);
  ctx.arc(eye.x, eye.y, radius * 1.15, -Math.PI / 2 - fov, -Math.PI / 2 + fov);
  ctx.closePath();
  ctx.fillStyle = wedge;
  ctx.fill();

  // Start / finish line.
  const startPoint = toMap(track.points[0]);
  const startAngle = track.startHeading + rot + Math.PI / 2;
  const startHalf = Math.max(4, track.roadWidth * scale);
  ctx.save();
  ctx.translate(startPoint.x, startPoint.y);
  ctx.rotate(startAngle);
  const cell = Math.max(2, startHalf / 4);
  for (let i = -2; i < 2; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#fff0c9" : "#1f1826";
    ctx.fillRect(i * cell, -2, cell, 4);
  }
  ctx.restore();

  const pu = powerUpFrame(renderClock());
  pu.hazards.concat(pu.trails).forEach((h) => {
    const point = toMap(h);
    ctx.fillStyle = "#08080c";
    ctx.strokeStyle = "rgba(179, 107, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.6, 0, TAU);
    ctx.fill();
    ctx.stroke();
  });
  // The Safety Car: flashing while it leads the field, steady on its way
  // in, and off the map once parked in the pits.
  if (pu.safetyCar && !pu.safetyCar.parked) {
    const point = toMap(pu.safetyCar);
    ctx.fillStyle = !pu.safetyCar.leaving && Math.floor(renderClock() / 180) % 2 ? "#ffb000" : "#ffd000";
    ctx.fillRect(point.x - 3, point.y - 3, 6, 6);
  }

  // Rivals, then the player on top.
  const sorted = getSortedRacers();
  state.racers.forEach((racer) => {
    if (racer.id === player.id) return;
    const point = toMap(racer);
    const place = sorted.findIndex((entry) => entry.id === racer.id) + 1;
    drawMapBlip(point.x, point.y, racer.heading + rot, racer.driver.color, 3.1, "rgba(6, 4, 10, 0.9)");
    if (place <= 3) {
      ctx.strokeStyle = "rgba(231, 184, 61, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5.4, 0, TAU);
      ctx.stroke();
    }
  });

  const me = toMap(player);
  const pulse = 5.5 + Math.sin(renderClock() / 260) * 1.4;
  ctx.strokeStyle = "rgba(117, 213, 255, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(me.x, me.y, pulse, 0, TAU);
  ctx.stroke();
  drawMapBlip(me.x, me.y, player.heading + rot, "#75d5ff", 4.6, "#fff0c9");

  ctx.restore();

  // Bezel and heading marker.
  ctx.strokeStyle = "rgba(255, 240, 201, 0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = "#75d5ff";
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius - 1);
  ctx.lineTo(cx - 6, cy - radius - 11);
  ctx.lineTo(cx + 6, cy - radius - 11);
  ctx.closePath();
  ctx.fill();
}

function drawMapBlip(x, y, heading, color, size, outline) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.8, -size * 0.75);
  ctx.lineTo(-size * 0.35, 0);
  ctx.lineTo(-size * 0.8, size * 0.75);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// On-screen HUD: position and lap are always visible.
// ---------------------------------------------------------------------------

function getPlaceStyle(place) {
  if (place === 1) {
    return { label: "1st", fill: "#e7b83d", stroke: "#fff3b8", text: "#2f2206" };
  }
  if (place === 2) {
    return { label: "2nd", fill: "#c8d0df", stroke: "#f6fbff", text: "#223246" };
  }
  if (place === 3) {
    return { label: "3rd", fill: "#b97742", stroke: "#f0cfb1", text: "#30170a" };
  }
  return { label: formatOrdinal(place), fill: "#75d5ff", stroke: "#e9fbff", text: "#10253a" };
}

function hudPanel(x, y, w, h, accent) {
  ctx.fillStyle = "rgba(8, 6, 14, 0.9)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255, 240, 201, 0.24)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 4, h);
  }
}

function formatLapTime(ms) {
  if (!ms || ms <= 0) return "-:--.---";
  const total = Math.round(ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

// A whole race: 3:12.456.
function formatRaceTime(ms) {
  if (!ms || ms <= 0) return "-:--.---";
  const total = Math.round(ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

// Behind the winner: 4.321, or 1:04.321 past a minute.
function formatGapTime(ms) {
  const total = Math.max(0, Math.round(ms)) / 1000;
  if (total < 60) return total.toFixed(3);
  return formatRaceTime(ms);
}

function formatGap(seconds) {
  if (!Number.isFinite(seconds)) return "--.-";
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
  return seconds.toFixed(1);
}

// Qualifying: one panel -- the lap against the provisional pole -- and no
// position or interval (there is no one else on track).
function drawQualifyingHud(track, player) {
  const q = state.qualifying;
  const now = raceNow();
  const onLap = player.startedRaceLap;
  hudPanel(20, 16, 300, 134, "#c77dff");
  ctx.fillStyle = "rgba(255, 240, 201, 0.62)";
  ctx.font = "bold 11px Trebuchet MS";
  ctx.fillText(`${track.name.toUpperCase()} · QUALIFYING${state.weather === "wet" ? " · WET" : ""}`, 34, 34);
  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 22px Georgia";
  const label = state.phase === "qualifyingSim" ? "Timing the field…" : state.phase === "qualifyingResults" ? "Session over"
    : !(q && q.handedOver) ? "Get ready…" : onLap ? "Flying lap" : "Out lap";
  ctx.fillText(label, 34, 62);
  const liveLap = onLap && player.lapStartAt ? now - player.lapStartAt : 0;
  const row = (label, text, y, color) => {
    ctx.fillStyle = "rgba(255, 240, 201, 0.5)";
    ctx.font = "bold 11px Trebuchet MS";
    ctx.fillText(label, 34, y);
    ctx.fillStyle = color;
    ctx.font = "bold 16px Georgia";
    ctx.fillText(text, 306 - ctx.measureText(text).width, y);
  };
  row("LAP TIME", onLap ? formatLapTime(liveLap) : "-:--.---", 92, "#fff0c9");
  row("PROVISIONAL POLE", q && q.poleTimeMs ? formatLapTime(q.poleTimeMs) : "-:--.---", 114, "#c77dff");
  const delta = qualifyingDeltaNow();
  row("DELTA", delta === null ? "—" : `${delta <= 0 ? "−" : "+"}${formatGapTime(Math.abs(delta))}`, 136,
    delta === null ? "rgba(255, 240, 201, 0.5)" : delta <= 0 ? "#39d98a" : "#ff5f57");
  drawSpeedPanel(player);
}

function drawDriverHud(track, player) {
  if (state.phase === "qualifying" || state.phase === "qualifyingSim" || state.phase === "qualifyingResults") {
    drawQualifyingHud(track, player);
    return;
  }
  const sorted = getSortedRacers();
  const place = sorted.findIndex((racer) => racer.id === player.id) + 1;
  const total = sorted.length;
  const placeStyle = getPlaceStyle(place);
  const now = raceNow();

  // Flash the position panel whenever a place changes hands.
  if (state.hudLastPlace && state.hudLastPlace !== place && state.phase === "race") {
    state.hudPlaceFlashUntil = now + 1400;
    state.hudPlaceFlashDir = place < state.hudLastPlace ? 1 : -1;
  }
  state.hudLastPlace = place;

  // ---- Lap block, top left ----
  hudPanel(20, 16, 262, 116, placeStyle.fill);
  ctx.fillStyle = "rgba(255, 240, 201, 0.62)";
  ctx.font = "bold 11px Trebuchet MS";
  ctx.fillText(`${track.name.toUpperCase()}${state.weather === "wet" ? " · WET" : ""}`, 34, 34);

  ctx.fillStyle = "rgba(255, 240, 201, 0.6)";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.fillText("LAP", 34, 58);
  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 30px Georgia";
  const lapNow = getDisplayedLap(player, track);
  const lapNowWidth = ctx.measureText(`${lapNow}`).width;
  ctx.fillText(`${lapNow}`, 66, 62);
  ctx.font = "bold 17px Georgia";
  ctx.fillStyle = "rgba(255, 240, 201, 0.66)";
  ctx.fillText(`/ ${track.laps}`, 66 + lapNowWidth + 10, 62);

  // Lap progress bar.
  const lapFraction = clamp(getRelativeTrackDistance(player, track) / track.totalLength, 0, 1);
  ctx.fillStyle = "rgba(255, 240, 201, 0.16)";
  ctx.fillRect(34, 72, 232, 5);
  ctx.fillStyle = placeStyle.fill;
  ctx.fillRect(34, 72, 232 * lapFraction, 5);

  // Lap times.
  const liveLap = player.finished || !player.lapStartAt ? player.lastLapTime : now - player.lapStartAt;
  const timeRow = (label, value, y, color) => {
    ctx.fillStyle = "rgba(255, 240, 201, 0.5)";
    ctx.font = "bold 11px Trebuchet MS";
    ctx.fillText(label, 34, y);
    ctx.fillStyle = color;
    ctx.font = "bold 15px Georgia";
    const text = formatLapTime(value);
    ctx.fillText(text, 266 - ctx.measureText(text).width, y);
  };
  timeRow("THIS LAP", liveLap, 96, "#fff0c9");
  timeRow("BEST", player.bestLapTime, 116, "#39d98a");

  // ---- Position block, bottom left ----
  const flashing = now < (state.hudPlaceFlashUntil || 0);
  const flashPulse = flashing ? 0.4 + Math.abs(Math.sin(now / 110)) * 0.6 : 0;
  const px = 20;
  const py = view.height - 116;
  hudPanel(px, py, 168, 96, placeStyle.fill);
  if (flashing) {
    ctx.save();
    ctx.globalAlpha = flashPulse * 0.4;
    ctx.fillStyle = state.hudPlaceFlashDir > 0 ? "#39d98a" : "#ff5f57";
    ctx.fillRect(px, py, 168, 96);
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255, 240, 201, 0.6)";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.fillText("POSITION", px + 14, py + 24);

  ctx.fillStyle = placeStyle.fill;
  ctx.font = "bold 54px Georgia";
  const placeText = `P${place}`;
  const placeWidth = ctx.measureText(placeText).width;
  ctx.fillText(placeText, px + 12, py + 76);

  ctx.font = "bold 18px Georgia";
  ctx.fillStyle = "rgba(255, 240, 201, 0.55)";
  ctx.fillText(`/ ${total}`, px + 12 + placeWidth + 8, py + 76);

  if (flashing) {
    ctx.fillStyle = state.hudPlaceFlashDir > 0 ? "#39d98a" : "#ff5f57";
    ctx.font = "bold 22px Trebuchet MS";
    ctx.fillText(state.hudPlaceFlashDir > 0 ? "▲" : "▼", px + 138, py + 34);
  }

  // ---- Gap to the car ahead / behind ----
  const ahead = sorted[place - 2];
  const behind = sorted[place];
  hudPanel(px + 178, view.height - 116, 150, 96);
  ctx.fillStyle = "rgba(255, 240, 201, 0.6)";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.fillText("INTERVAL", px + 192, view.height - 92);

  const gapRow = (label, other, y, color) => {
    ctx.fillStyle = "rgba(255, 240, 201, 0.5)";
    ctx.font = "bold 11px Trebuchet MS";
    ctx.fillText(label, px + 192, y);
    ctx.fillStyle = color;
    ctx.font = "bold 17px Georgia";
    if (!other) {
      ctx.fillText("--.-", px + 232, y);
      return;
    }
    // Real intervals from the timing points, like the tower.
    const gap = other === ahead ? gapSeconds(player, ahead) : gapSeconds(behind, player);
    ctx.fillText(`${formatGap(Math.max(0, gap))}s`, px + 232, y);
  };
  gapRow("AHD", ahead, view.height - 64, "#ff8f6b");
  gapRow("BHD", behind, view.height - 34, "#75d5ff");

  // ---- Final lap call ----
  if (!player.finished && player.startedRaceLap && player.lap === track.laps - 1) {
    if (!state.finalLapAt) state.finalLapAt = now;
    if (now - state.finalLapAt < 3200) {
      const fade = 1 - (now - state.finalLapAt) / 3200;
      ctx.save();
      ctx.globalAlpha = 0.35 + fade * 0.65;
      ctx.fillStyle = "#e7b83d";
      ctx.font = "bold 46px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("FINAL LAP", view.width / 2, 196);
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  // ---- Waiting for the rest of the field ----
  if (state.flagOutAt && player.finished) {
    const done = state.racers.filter((racer) => racer.finished).length;
    const w = 420;
    const x = view.width / 2 - w / 2;
    hudPanel(x, 226, w, 92, "#e7b83d");
    ctx.fillStyle = "#e7b83d";
    ctx.font = "bold 30px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("CHEQUERED FLAG", view.width / 2, 264);
    ctx.fillStyle = "rgba(255, 240, 201, 0.75)";
    ctx.font = "bold 15px Trebuchet MS";
    ctx.fillText(`You finished P${player.finishPosition} — field coming home`, view.width / 2, 288);
    ctx.fillStyle = "#fff0c9";
    ctx.font = "bold 16px Georgia";
    ctx.fillText(`${done} / ${state.racers.length} classified`, view.width / 2, 310);
    ctx.textAlign = "left";
  }

  drawSpeedPanel(player);
}

// Speed, bottom right: in the race and on a qualifying lap alike.
function drawSpeedPanel(player) {
  const kph = Math.round(Math.abs(player.speed) * 1.45);
  const speedRatio = clamp(Math.abs(player.speed) / Math.max(1, player.physics.maxSpeed), 0, 1);
  const sx = view.width - 208;
  const sy = view.height - 116;
  hudPanel(sx, sy, 188, 96, "#39d98a");
  ctx.fillStyle = "rgba(255, 240, 201, 0.6)";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.fillText("SPEED", sx + 14, sy + 24);
  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 44px Georgia";
  const kphWidth = ctx.measureText(`${kph}`).width;
  ctx.fillText(`${kph}`, sx + 12, sy + 70);
  ctx.font = "bold 14px Trebuchet MS";
  ctx.fillStyle = "rgba(255, 240, 201, 0.55)";
  ctx.fillText("KM/H", sx + 12 + kphWidth + 12, sy + 70);

  // Speed bar.
  ctx.fillStyle = "rgba(255, 240, 201, 0.16)";
  ctx.fillRect(sx + 14, sy + 80, 160, 5);
  const speedGradient = ctx.createLinearGradient(sx + 14, 0, sx + 174, 0);
  speedGradient.addColorStop(0, "#39d98a");
  speedGradient.addColorStop(0.7, "#e7b83d");
  speedGradient.addColorStop(1, "#ff5f57");
  ctx.fillStyle = speedGradient;
  ctx.fillRect(sx + 14, sy + 80, 160 * speedRatio, 5);
}

const iconImages = {};

function itemIconImage(id) {
  if (!iconImages[id]) {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ITEM_ICONS[id])}`;
    iconImages[id] = img;
  }
  return iconImages[id];
}

// What the item slot shows. The roulette flicks through the real icons.
function hudItemState(player, now) {
  if (player.rouletteUntil > now) {
    const order = PowerUps.ITEM_ORDER;
    return { key: order[Math.floor(now / 90) % order.length], label: "Rolling…", hint: "Spinning now", rolling: true };
  }
  const key = player.currentItem;
  if (!key || key === "none") return null;
  let hint = "Press Space to use";
  if (key === "oilSlick") hint = player.trailingOil ? "TRAILING · release Space to drop" : "Tap Space: drop · Hold: trail";
  return { key, label: labelizeItem(key), hint, rolling: false };
}

function drawDriverItemBadge(player) {
  const now = renderClock();
  const slot = hudItemState(player, now);
  if (!slot) return;
  // Wide enough for the longest line (the TRAILING hint is the longest).
  ctx.save();
  ctx.font = "bold 18px Georgia";
  const labelWidth = ctx.measureText(slot.label).width;
  ctx.font = "12px Trebuchet MS";
  const hintWidth = ctx.measureText(slot.hint).width;
  ctx.restore();
  const panelWidth = Math.ceil(Math.max(236, 70 + Math.max(labelWidth, hintWidth) + 16));
  const panelHeight = 84;
  const panelX = Math.round(view.width / 2 - panelWidth / 2);
  const panelY = view.height - 104;

  ctx.save();
  ctx.fillStyle = "rgba(18, 10, 21, 0.84)";
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = slot.rolling ? "#ffd166" : player.trailingOil ? "#b36bff" : "rgba(255, 240, 201, 0.26)";
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  ctx.fillStyle = slot.rolling ? "#ffd166" : "#fff0c9";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.fillText("POWER UP", panelX + 14, panelY + 18);

  const img = itemIconImage(slot.key);
  if (img.complete && img.naturalWidth) ctx.drawImage(img, panelX + 12, panelY + 24, 48, 48);

  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 18px Georgia";
  ctx.fillText(slot.label, panelX + 70, panelY + 46);
  ctx.font = "12px Trebuchet MS";
  ctx.fillStyle = player.trailingOil ? "#d9b8ff" : "rgba(255, 240, 201, 0.8)";
  ctx.fillText(slot.hint, panelX + 70, panelY + 66);
  ctx.restore();
}


function drawQuad(ax, ay, bx, by, cx, cy, dx, dy, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fill();
}











function drawDecor(track) {
  track.decor.forEach((decor) => {
    if (decor.type === "tree") {
      ctx.fillStyle = "#24663d";
      ctx.fillRect(decor.x - 8, decor.y - 8, 16, 28);
      ctx.fillStyle = decor.color;
      ctx.beginPath();
      ctx.arc(decor.x, decor.y - 10, decor.size, 0, TAU);
      ctx.fill();
    } else if (decor.type === "house") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - decor.w / 2, decor.y - decor.h / 2, decor.w, decor.h);
      ctx.fillStyle = "#ffe8ad";
      ctx.fillRect(decor.x - 8, decor.y - 6, 16, 14);
    } else if (decor.type === "billboard") {
      ctx.fillStyle = "#6f4c2b";
      ctx.fillRect(decor.x - 4, decor.y, 8, 32);
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - decor.w / 2, decor.y - decor.h / 2, decor.w, decor.h);
    } else if (decor.type === "dock") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x, decor.y, decor.w, decor.h);
      ctx.fillStyle = "#2c3945";
      ctx.fillRect(decor.x, decor.y + decor.h, decor.w, 28);
    } else if (decor.type === "ghost") {
      ctx.fillStyle = decor.color;
      ctx.beginPath();
      ctx.arc(decor.x, decor.y, decor.size, Math.PI, TAU);
      ctx.lineTo(decor.x + decor.size, decor.y + decor.size);
      ctx.lineTo(decor.x + decor.size / 2, decor.y + decor.size / 2);
      ctx.lineTo(decor.x, decor.y + decor.size);
      ctx.lineTo(decor.x - decor.size / 2, decor.y + decor.size / 2);
      ctx.lineTo(decor.x - decor.size, decor.y + decor.size);
      ctx.closePath();
      ctx.fill();
    } else if (decor.type === "lamp") {
      ctx.fillStyle = "#493744";
      ctx.fillRect(decor.x - 3, decor.y, 6, 28);
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - 8, decor.y - 10, 16, 12);
    } else if (decor.type === "cactus") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - 6, decor.y - decor.size / 2, 12, decor.size);
      ctx.fillRect(decor.x - 18, decor.y - 6, 10, 22);
      ctx.fillRect(decor.x + 8, decor.y - 10, 10, 24);
    } else if (decor.type === "mesa") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - decor.w / 2, decor.y - decor.h / 2, decor.w, decor.h);
    } else if (decor.type === "arch") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - decor.w / 2, decor.y - decor.h / 2, decor.w, decor.h);
      ctx.clearRect(decor.x - 16, decor.y - 4, 32, 24);
    } else if (decor.type === "lava") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - decor.w / 2, decor.y - decor.h / 2, decor.w, decor.h);
      ctx.fillStyle = "#ffd166";
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(decor.x - decor.w / 2 + 10 + i * 20, decor.y - 8 + (i % 2) * 10, 12, 8);
      }
    } else if (decor.type === "tower") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - decor.w / 2, decor.y - decor.h / 2, decor.w, decor.h);
    } else if (decor.type === "chain") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(decor.x - decor.w / 2, decor.y - decor.h / 2, decor.w, decor.h);
    }
  });
}

function drawRoadRibbon(points, width, fill, stroke, closed) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width * 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = width * 1.78;
  ctx.stroke();
  ctx.restore();
}

function drawLaneStripe(points, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawOpenLaneStripe(points, color, width = 4, dash = [18, 12]) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
  ctx.restore();
}

function drawShortcutMapRoad() {
  // shortcuts disabled
}

function drawStartLine(track) {
  const a = track.points[0];
  const angle = track.startHeading + Math.PI / 2;
  const halfWidth = track.roadWidth / 2;
  const cell = 10;
  const tilesAcross = Math.max(2, Math.ceil(halfWidth / cell));
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(angle);
  for (let i = -tilesAcross; i <= tilesAcross; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? "#fff0c9" : "#1f1826";
      ctx.fillRect(i * cell, -halfWidth + j * cell, cell, cell);
    }
  }
  ctx.restore();
}

// Pausing. The race clock simply doesn't advance while paused, so race
// deadlines stay put; only the few things timed on the wall clock move on.
function shiftRaceClocks(delta) {
  ["countdownStart", "flagOutAt", "resultTimeoutAt", "shakeUntil"].forEach((field) => {
    if (state[field]) state[field] += delta;
  });
}

// Space came up (or focus went): a trailed slick is dropped, and a press too
// short to start trailing was a tap, which drops it too.
function letGoOfOil() {
  const player = getPlayer();
  if (!player || player.finished || player.currentItem !== "oilSlick") return;
  if (player.trailingOil) releaseTrail(player, raceNow());
  else if (player.oilHoldStart) useItem(player, raceNow());
}

function togglePause() {
  if (!["race", "countdown", "qualifying", "qualifyingSim"].includes(state.phase)) return;
  if (state.paused) {
    shiftRaceClocks(performance.now() - state.pausedAt);
    state.paused = false;
    state.pausedAt = 0;
    // Space let go of during the pause: act on it now the race is running.
    if (!input.space) letGoOfOil();
  } else {
    state.paused = true;
    state.pausedAt = performance.now();
  }
  if (audio.ready && audio.master) {
    audio.master.gain.setTargetAtTime(
      !audio.enabled || state.paused ? 0 : 0.55, audio.ctx.currentTime, 0.05,
    );
  }
}

function handleEscapeKey() {
  // An open overlay (career, settings, phone note) closes first.
  if (window.Screens && window.Screens.closeOverlay()) return;
  // After a race or a cup there is nothing to pause, so Esc is the way home.
  if (state.phase === "results" || state.phase === "podium" || state.phase === "qualifyingResults") {
    resetToGarage();
    return;
  }
  if (["race", "countdown", "qualifying", "qualifyingSim"].includes(state.phase)) togglePause();
}

function drawPauseOverlay() {
  ctx.save();
  ctx.fillStyle = "rgba(8, 6, 14, 0.62)";
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 62px Georgia";
  ctx.textAlign = "center";
  ctx.fillText("PAUSED", view.width / 2, view.height / 2 - 6);
  ctx.font = "bold 16px Trebuchet MS";
  ctx.fillStyle = "rgba(255, 240, 201, 0.7)";
  ctx.fillText("Esc or P to resume", view.width / 2, view.height / 2 + 30);
  ctx.fillStyle = "rgba(255, 240, 201, 0.5)";
  const me = getPlayer();
  ctx.fillText(pauseQuitHint(Boolean(me && me.finished && state.phase === "race")), view.width / 2, view.height / 2 + 54);
  ctx.textAlign = "left";
  ctx.restore();
}

function update(now) {
  fitViewToElement();
  // The real time since the last frame; physics turns it into fixed steps.
  const dt = clamp((now - (state.lastTimestamp || now)) / 1000, 0, 0.25);
  state.lastTimestamp = now;

  prepareCircuit();
  if (!state.paused && !state.preparing) {
    if (state.phase === "countdown") {
      // The lights don't start until the cars can be seen.
      if (worldView() === "loading") state.countdownStart = now;
      updateCountdown(now);
    } else if (state.phase === "race") {
      updateRace(dt, now);
    } else if (state.phase === "qualifyingSim") {
      updateQualifyingSim();
    } else if (state.phase === "qualifying") {
      updateQualifying(dt, now);
    }
  }

  updateEngineAudio(getPlayer());

  if (state.phase === "podium") {
    drawPodiumScene();
  } else if (state.phase !== "garage") {
    drawTrack(state.track);
    if (state.paused) drawPauseOverlay();
  } else {
    drawGarageScene();
  }

  requestAnimationFrame(update);
}

function drawGarageScene() {
  ctx.clearRect(0, 0, view.width, view.height);
  const driver = DRIVERS[state.selectedDriver];
  const team = getTeamForDriver(driver);
  const mode = worldView();
  showViewLoading(mode === "loading" ? "garage" : null);
  if (mode === "loading") return;
  // In 3D the car turns on the showroom floor behind this canvas.
  if (mode === "3d") {
    const shown = render3dSafely(() => window.Render3D.renderGarage(team, driver, performance.now()));
    if (shown.ok && shown.value) return;
  }
  // Only when 3D is unavailable: the team's showroom photo (taken from the
  // real 3D showroom) where the car would stand -- never the old 2D sprite.
  state.fallbackFrames += 1;
  state.garageFallback = "photo";
  drawShowroomPhoto(team);
}

const showroomPhotos = {};

function drawShowroomPhoto(team) {
  if (!showroomPhotos[team.id]) {
    const img = new Image();
    img.src = `./assets/shots/team-${team.id}.jpg`;
    showroomPhotos[team.id] = img;
  }
  const img = showroomPhotos[team.id];
  if (!img.complete || !img.naturalWidth) return;
  // The frame the photos were captured in (tools/capture-shots.js).
  const x = view.width * 0.42;
  const y = view.height * 0.3;
  const w = view.width * 0.54;
  const h = view.height * 0.66;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  // Feather every edge into the page, so it reads as the showroom, not a pasted picture.
  const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(7, 7, 12, 1)");
    g.addColorStop(1, "rgba(7, 7, 12, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  const edge = Math.min(w, h) * 0.18;
  fade(x, 0, x + edge, 0, x, y, edge, h);
  fade(x + w, 0, x + w - edge, 0, x + w - edge, y, edge, h);
  fade(0, y, 0, y + edge, x, y, w, edge);
  fade(0, y + h, 0, y + h - edge, x, y + h - edge, w, edge);
  ctx.restore();
}

function bindEvents() {
  ui.canvasShell.addEventListener("dblclick", toggleFullscreen);
  const refreshSettings = () => window.Screens && window.Screens.refreshSettings();
  document.addEventListener("fullscreenchange", refreshSettings);
  document.addEventListener("webkitfullscreenchange", refreshSettings);

  window.addEventListener("keydown", (event) => {
    if (!audio.ready) initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    if (event.key === "Escape") {
      event.preventDefault();
      handleEscapeKey();
      return;
    }
    // Pit lane keys: arrows pick a driver, Enter starts the cup. Nothing else
    // happens on these keys while in the garage.
    if (state.phase === "garage") {
      if (window.Screens && window.Screens.isOverlayOpen()) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        selectDriver(state.selectedDriver + (event.key === "ArrowRight" ? 1 : -1));
        if (window.Screens) window.Screens.revealSelectedDriver();
      } else if (event.key === "Enter" && !event.repeat) {
        // Enter on a focused pill, link or button belongs to that control --
        // except the driver tile already chosen: there, as with the arrow keys'
        // roving focus, Enter means "go with this driver" and starts the cup.
        const control = event.target && event.target.closest ? event.target.closest("button, a") : null;
        const chosenTile = control && control.matches(".driver-tile.is-on");
        if (control && control.id !== "start-cup" && !chosenTile) return;
        event.preventDefault();
        startCup();
      }
      return;
    }
    // Enter moves on from the qualifying classification (to the race) and
    // from the results (to the next race); the phase guards make a second
    // press -- or a click on the focused button -- harmless.
    if (event.key === "Enter" && !event.repeat && !(window.Screens && window.Screens.isOverlayOpen())) {
      if (state.phase === "qualifyingResults") { event.preventDefault(); startRaceFromQualifying(); return; }
      if (state.phase === "results") { event.preventDefault(); nextRace(); return; }
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") input.throttle = true;
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") input.brake = true;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = true;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = true;
    if (event.key === "Shift") input.drift = true;
    if (event.key.toLowerCase() === "p" && (state.phase === "race" || state.phase === "countdown" || state.phase === "qualifying")) {
      event.preventDefault();
      togglePause();
    }
    // A way out mid-race without having to finish it.
    if (event.key.toLowerCase() === "q" && state.paused) {
      event.preventDefault();
      quitToPitLane();
    }
    if (event.code === "Space") {
      event.preventDefault();
      input.space = true;
      const player = getPlayer();
      // A finished car is parked on the line: it has nothing left to fire.
      if (event.repeat || !player || player.finished || state.phase !== "race" || state.paused) return;
      if (player.currentItem === "oilSlick") {
        if (!player.trailingOil) player.oilHoldStart = raceNow();
      } else if (player.currentItem !== "none") {
        useItem(player, raceNow());
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") input.throttle = false;
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") input.brake = false;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = false;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = false;
    if (event.key === "Shift") input.drift = false;
    if (event.code === "Space") {
      input.space = false;
      // While paused the race is frozen: the slick is let go on resume.
      if (!state.paused) letGoOfOil();
    }
  });

  PowerUps.ITEM_ORDER.forEach(itemIconImage);

  // Losing focus loses the key-up: count Space as released rather than keep a
  // slick trailing forever (while paused, it drops on resume).
  window.addEventListener("blur", () => {
    input.space = false;
    if (!state.paused) letGoOfOil();
  });

  // A hidden tab stops drawing, but the race clock would keep running behind
  // it: pause instead, so nothing runs out while nobody is watching.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && ["race", "countdown", "qualifying", "qualifyingSim"].includes(state.phase) && !state.paused) togglePause();
  });
}

// The actions the screens may take, and the plain data they may read.
window.Game = {
  getPitLaneState,
  selectDriver,
  selectCup,
  selectDifficulty,
  selectGridMode,
  selectWeatherMode,
  startCup,
  startRaceFromQualifying,
  nextRace,
  backToPitLane: quitToPitLane,
  setSound(on) {
    initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    setAudioEnabled(on);
  },
  isSoundOn: () => audio.enabled,
  toggleFullscreen,
  isFullscreen: isFullscreenActive,
};

loadAudioPreference();
loadDifficultyPreference();
loadDriverPreference();
if (window.Screens) {
  window.Screens.init();
  window.Screens.showPitLane();
}
bindEvents();
requestAnimationFrame(update);
