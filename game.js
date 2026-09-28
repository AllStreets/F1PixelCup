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
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
}

const ui = {
  driverGrid: document.getElementById("driver-grid"),
  kartGrid: document.getElementById("kart-grid"),
  statBars: document.getElementById("stat-bars"),
  driverName: document.getElementById("driver-name"),
  kartName: document.getElementById("kart-name"),
  trackList: document.getElementById("track-list"),
  startCup: document.getElementById("start-cup"),
  cupGrid: document.getElementById("cup-grid"),
  difficultyGrid: document.getElementById("difficulty-grid"),
  countdownBanner: document.getElementById("countdown-banner"),
  trackTheme: document.getElementById("track-theme"),
  trackName: document.getElementById("track-name"),
  lapIndicator: document.getElementById("lap-indicator"),
  placeIndicator: document.getElementById("place-indicator"),
  raceIndicator: document.getElementById("race-indicator"),
  toggleView: document.getElementById("toggle-view"),
  fullscreenView: document.getElementById("fullscreen-view"),
  soundToggle: document.getElementById("sound-toggle"),
  canvasShell: document.getElementById("canvas-shell"),
  itemName: document.getElementById("item-name"),
  itemIcon: document.getElementById("item-icon"),
  itemSlot: document.getElementById("item-slot"),
  itemCopy: document.getElementById("item-copy"),
  miniStandings: document.getElementById("mini-standings"),
  raceStatus: document.getElementById("race-status"),
  statusFeed: document.getElementById("status-feed"),
  resultsModal: document.getElementById("results-modal"),
  resultsKicker: document.getElementById("results-kicker"),
  resultsTitle: document.getElementById("results-title"),
  resultsTable: document.getElementById("results-table"),
  resultsGarageButton: document.getElementById("results-garage-button"),
  resultsButton: document.getElementById("results-button"),
  podiumModal: document.getElementById("podium-modal"),
  podiumKicker: document.getElementById("podium-kicker"),
  podiumTitle: document.getElementById("podium-title"),
  podiumScene: document.getElementById("podium-scene"),
  restartButton: document.getElementById("restart-button"),
  resultsCareer: document.getElementById("results-career"),
  podiumCareer: document.getElementById("podium-career"),
  careerTier: document.getElementById("career-tier"),
  careerStats: document.getElementById("career-stats"),
  careerBests: document.getElementById("career-bests"),
};

const TAU = Math.PI * 2;

// The play area is no longer the size of the canvas. The canvas is just the
// window we look through; circuits are laid out in this larger world.
const WORLD = { width: 1800, height: 1100 };
// Difficulty changes how well the AI drives, not what its cars are made of.
// On Pro and Legend the rivals run exactly the player's physics; aiPace is 1.
// Rookie is the only setting that hands out a machinery handicap.
const DIFFICULTIES = [
  {
    id: "rookie", name: "Rookie",
    aiPace: 0.90,      // the only speed handicap in the game
    brakeBias: 0.44,   // lifts early for corners
    lineNoise: 36,     // wanders off the ideal line
    mistakeRate: 0.5,  // errors per second
    catchUp: 0.12,
    lookBase: 52, lookSpeed: 0.34,   // barely looks past the next corner
  },
  {
    id: "pro", name: "Pro",
    aiPace: 1.0, brakeBias: 0.58, lineNoise: 20, mistakeRate: 0.16, catchUp: 0.05,
    lookBase: 76, lookSpeed: 0.52,
  },
  {
    // The only setting where rivals are quicker than you rather than just
    // better drivers: a 4% pace edge on top of a near-perfect racing line.
    id: "legend", name: "Legend",
    aiPace: 1.04, brakeBias: 0.82, lineNoise: 5, mistakeRate: 0.015, catchUp: 0,
    lookBase: 108, lookSpeed: 0.74,
  },
];

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
const ITEM_ICONS = {
  none: "?",
  roulette: "7",
  oilSlick: "O",
  debris: "D",
  undercut: "U",
  overtake: "OT",
  powerDeploy: "PD",
  safetyCar: "SC",
  graining: "G",
  engineBlast: "EB",
  formationLap: "FL",
  stewardPenalty: "SP",
  drsSignPost: "DS",
};

const TEAMS = [
  { id: "redBull", name: "Red Bull Racing", car: "RB21", style: "Navy livery, fastest car on the grid.", body: "#1e41b2", trim: "#e8bf00", stats: { speed: 0.06, acceleration: 0.01, handling: 0.02, weight: 0.04, traction: 0.03, drift: 0.01 } },
  { id: "ferrari", name: "Scuderia Ferrari", car: "SF-25", style: "Iconic Scuderia red with yellow accents.", body: "#dc0000", trim: "#ffed00", stats: { speed: 0.04, acceleration: 0.03, handling: 0.04, weight: 0.01, traction: 0.02, drift: 0.03 } },
  { id: "mclaren", name: "McLaren F1 Team", car: "MCL39", style: "Papaya orange with electric blue trim.", body: "#ff8000", trim: "#0093cc", stats: { speed: 0.05, acceleration: 0.04, handling: 0.03, weight: -0.01, traction: 0.03, drift: 0.02 } },
  { id: "mercedes", name: "Mercedes-AMG F1", car: "W16", style: "Silver arrows with teal highlights.", body: "#00d2be", trim: "#c0c0c0", stats: { speed: 0.02, acceleration: 0.03, handling: 0.03, weight: 0.01, traction: 0.02, drift: 0.01 } },
  { id: "astonMartin", name: "Aston Martin F1", car: "AMR25", style: "British racing green with lime.", body: "#006f62", trim: "#cedc00", stats: { speed: -0.01, acceleration: -0.01, handling: 0.02, weight: 0.02, traction: 0.02, drift: 0.01 } },
  { id: "alpine", name: "BWT Alpine F1", car: "A525", style: "French blue with pink BWT gradient.", body: "#0090ff", trim: "#ff87bc", stats: { speed: -0.02, acceleration: -0.01, handling: 0.01, weight: -0.01, traction: -0.01, drift: 0 } },
  { id: "williams", name: "Williams Racing", car: "FW47", style: "Royal blue and white livery.", body: "#005aff", trim: "#ffffff", stats: { speed: -0.03, acceleration: -0.01, handling: -0.01, weight: -0.01, traction: -0.01, drift: -0.01 } },
  { id: "haas", name: "MoneyGram Haas F1", car: "VF-25", style: "White and red with black accents.", body: "#e8002d", trim: "#ffffff", stats: { speed: -0.03, acceleration: -0.02, handling: -0.01, weight: 0, traction: -0.01, drift: -0.01 } },
  { id: "racingBulls", name: "Visa Cash App RB", car: "VCARB 02", style: "White with blue and red accents.", body: "#6692ff", trim: "#ffffff", stats: { speed: -0.02, acceleration: 0.01, handling: 0.01, weight: -0.01, traction: 0, drift: 0 } },
  { id: "sauber", name: "Stake F1 / Sauber", car: "C45", style: "Black with neon green Stake branding.", body: "#2a2a2a", trim: "#39ff14", stats: { speed: -0.04, acceleration: -0.02, handling: -0.01, weight: -0.01, traction: -0.01, drift: -0.01 } },
];

function getTeamForDriver(driver) {
  return TEAMS.find((t) => t.id === driver.teamId) || TEAMS[0];
}

const DRIVERS = [
  { id: "verstappen", name: "Max Verstappen", number: 1, teamId: "redBull", title: "Four-Time Champion", color: "#1e41b2", accent: "#e8bf00", stats: { speed: 0.96, acceleration: 0.80, handling: 0.88, weight: 0.70, traction: 0.86, drift: 0.82 } },
  { id: "lawson", name: "Liam Lawson", number: 30, teamId: "redBull", title: "Rising Kiwi", color: "#1e41b2", accent: "#ffffff", stats: { speed: 0.80, acceleration: 0.78, handling: 0.78, weight: 0.62, traction: 0.76, drift: 0.75 } },
  { id: "leclerc", name: "Charles Leclerc", number: 16, teamId: "ferrari", title: "Monaco Maestro", color: "#dc0000", accent: "#ffed00", stats: { speed: 0.90, acceleration: 0.84, handling: 0.88, weight: 0.62, traction: 0.82, drift: 0.87 } },
  { id: "hamilton", name: "Lewis Hamilton", number: 44, teamId: "ferrari", title: "Seven-Time Legend", color: "#dc0000", accent: "#ffffff", stats: { speed: 0.92, acceleration: 0.82, handling: 0.90, weight: 0.65, traction: 0.84, drift: 0.88 } },
  { id: "norris", name: "Lando Norris", number: 4, teamId: "mclaren", title: "Speed and Flair", color: "#ff8000", accent: "#0093cc", stats: { speed: 0.88, acceleration: 0.86, handling: 0.87, weight: 0.58, traction: 0.84, drift: 0.84 } },
  { id: "piastri", name: "Oscar Piastri", number: 81, teamId: "mclaren", title: "Clinical Rookie", color: "#ff8000", accent: "#ffffff", stats: { speed: 0.86, acceleration: 0.84, handling: 0.84, weight: 0.56, traction: 0.82, drift: 0.81 } },
  { id: "russell", name: "George Russell", number: 63, teamId: "mercedes", title: "Mr. Saturday", color: "#00d2be", accent: "#c0c0c0", stats: { speed: 0.86, acceleration: 0.82, handling: 0.85, weight: 0.62, traction: 0.83, drift: 0.82 } },
  { id: "antonelli", name: "Kimi Antonelli", number: 12, teamId: "mercedes", title: "Next Gen Talent", color: "#00d2be", accent: "#ffffff", stats: { speed: 0.80, acceleration: 0.84, handling: 0.82, weight: 0.54, traction: 0.79, drift: 0.80 } },
  { id: "alonso", name: "Fernando Alonso", number: 14, teamId: "astonMartin", title: "Grandmaster Racer", color: "#006f62", accent: "#cedc00", stats: { speed: 0.84, acceleration: 0.80, handling: 0.92, weight: 0.64, traction: 0.87, drift: 0.90 } },
  { id: "stroll", name: "Lance Stroll", number: 18, teamId: "astonMartin", title: "Consistent Charger", color: "#006f62", accent: "#ffffff", stats: { speed: 0.76, acceleration: 0.74, handling: 0.76, weight: 0.62, traction: 0.76, drift: 0.73 } },
  { id: "gasly", name: "Pierre Gasly", number: 10, teamId: "alpine", title: "French Fighter", color: "#0090ff", accent: "#ff87bc", stats: { speed: 0.78, acceleration: 0.80, handling: 0.80, weight: 0.60, traction: 0.78, drift: 0.79 } },
  { id: "doohan", name: "Jack Doohan", number: 7, teamId: "alpine", title: "Alpine Debutant", color: "#0090ff", accent: "#ffffff", stats: { speed: 0.74, acceleration: 0.78, handling: 0.76, weight: 0.58, traction: 0.74, drift: 0.75 } },
  { id: "albon", name: "Alex Albon", number: 23, teamId: "williams", title: "Smooth Operator", color: "#005aff", accent: "#ffffff", stats: { speed: 0.76, acceleration: 0.78, handling: 0.79, weight: 0.62, traction: 0.77, drift: 0.77 } },
  { id: "sainz", name: "Carlos Sainz", number: 55, teamId: "williams", title: "Smooth Carlos", color: "#005aff", accent: "#ff0000", stats: { speed: 0.84, acceleration: 0.80, handling: 0.84, weight: 0.64, traction: 0.81, drift: 0.82 } },
  { id: "bearman", name: "Oliver Bearman", number: 87, teamId: "haas", title: "Haas Headliner", color: "#e8002d", accent: "#ffffff", stats: { speed: 0.74, acceleration: 0.75, handling: 0.76, weight: 0.58, traction: 0.73, drift: 0.74 } },
  { id: "ocon", name: "Esteban Ocon", number: 31, teamId: "haas", title: "Gritty Veteran", color: "#e8002d", accent: "#888888", stats: { speed: 0.76, acceleration: 0.76, handling: 0.78, weight: 0.60, traction: 0.75, drift: 0.76 } },
  { id: "tsunoda", name: "Yuki Tsunoda", number: 22, teamId: "racingBulls", title: "Rapid Racer", color: "#6692ff", accent: "#ffffff", stats: { speed: 0.77, acceleration: 0.81, handling: 0.80, weight: 0.54, traction: 0.77, drift: 0.82 } },
  { id: "hadjar", name: "Isack Hadjar", number: 6, teamId: "racingBulls", title: "F2 Champion", color: "#6692ff", accent: "#ff0000", stats: { speed: 0.75, acceleration: 0.80, handling: 0.78, weight: 0.56, traction: 0.75, drift: 0.78 } },
  { id: "hulkenberg", name: "Nico Hülkenberg", number: 27, teamId: "sauber", title: "The Hulk Returns", color: "#39ff14", accent: "#000000", stats: { speed: 0.76, acceleration: 0.77, handling: 0.78, weight: 0.64, traction: 0.76, drift: 0.75 } },
  { id: "bortoleto", name: "Gabriel Bortoleto", number: 5, teamId: "sauber", title: "F2 Champion", color: "#39ff14", accent: "#ffffff", stats: { speed: 0.72, acceleration: 0.78, handling: 0.76, weight: 0.55, traction: 0.73, drift: 0.76 } },
];

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
  };
}

// Circuit outlines, scenery placement and item boxes come from TRACK_SHAPES
// (tracks-data.js), generated from the real circuits by tools/tracks.
const TRACKS = [
  trackDefinition({
    id: "monza",
    name: "Autodromo di Monza",
    theme: "Italian speed temple",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#87ceeb", grass: "#4a8c3f", accent: "#ffe08a", road: "#484850", shoulder: "#c8c0b0", horizonA: "#2a5a30", horizonB: "#5a9a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe08a" },
  }),
  trackDefinition({
    id: "spa",
    name: "Circuit de Spa-Francorchamps",
    theme: "Belgian forest circuit",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#6a8faf", grass: "#2d5a27", accent: "#c8d8e8", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1a3a1a", horizonB: "#3a6a35", curbA: "#dc0000", curbB: "#ffffff", sun: "#ddeeff" },
  }),
  trackDefinition({
    id: "silverstone",
    name: "Silverstone Circuit",
    theme: "British airfield classic",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#aac8e0", grass: "#4c8840", accent: "#e8f0e0", road: "#505058", shoulder: "#c0b8a8", horizonA: "#304828", horizonB: "#5a7848", curbA: "#dc0000", curbB: "#ffffff", sun: "#d8e8f0" },
  }),
  trackDefinition({
    id: "suzuka",
    name: "Suzuka International Racing Course",
    theme: "Japanese technical masterpiece",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#9fd0e8", grass: "#3a7a38", accent: "#ffeedd", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1e4a1e", horizonB: "#408040", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" },
  }),
  trackDefinition({
    id: "monaco",
    name: "Circuit de Monaco",
    theme: "Street circuit showpiece",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#4db8e8", grass: "#3a6a88", accent: "#ffeedd", road: "#505060", shoulder: "#c8c0b8", horizonA: "#184858", horizonB: "#3878a8", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" },
  }),
  trackDefinition({
    id: "singapore",
    name: "Marina Bay Street Circuit",
    theme: "Night city circuit",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#0a0a1e", grass: "#1a1a3a", accent: "#ffa500", road: "#3a3848", shoulder: "#545060", horizonA: "#0a0a28", horizonB: "#1a1a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ff8800" },
  }),
  trackDefinition({
    id: "bahrain",
    name: "Bahrain International Circuit",
    theme: "Desert twilight circuit",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#cc8833", grass: "#8a6a3a", accent: "#ffe8aa", road: "#585050", shoulder: "#c8b888", horizonA: "#6a4820", horizonB: "#aa7838", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffcc44" },
  }),
  trackDefinition({
    id: "interlagos",
    name: "Autódromo José Carlos Pace",
    theme: "Brazilian passion circuit",
    roadWidth: 33,
    laps: 5,
    bg: { sky: "#5598cc", grass: "#3c7838", accent: "#ffe8aa", road: "#484850", shoulder: "#b0a898", horizonA: "#1e4820", horizonB: "#3a7838", curbA: "#009c3b", curbB: "#ffdf00", sun: "#ffdd44" },
  }),
];

const CUPS = [
  { id: "trophyCup", name: "Trophy Cup", icon: "Trophy Cup", tracks: TRACKS.slice(0, 4) },
  { id: "constructorCup", name: "Constructor Cup", icon: "Constructor Cup", tracks: TRACKS.slice(4, 8) },
];



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
  selectedDriver: 0,
  selectedKart: 0,
  selectedCup: 0,
  difficulty: 1,
  activeCupIndex: 0,
  phase: "garage",
  raceIndex: 0,
  cupRunId: null,
  cupRecordedFor: null,
  cupDifficulty: null,
  lastRaceCareer: null,
  lastCupCareer: null,
  track: CUPS[0].tracks[0],
  racers: [],
  playerId: "",
  items: [],
  hazards: [],
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

function shouldUseShortcutRoute() {
  return false;
}

function getActiveSurfaceInfo(racer, track, now) {
  const { mainSurface, shortcutSurface } = getSurfacePair(racer, track);
  racer.shortcutActive = shouldUseShortcutRoute(racer, track, mainSurface, shortcutSurface, now);
  return racer.shortcutActive ? shortcutSurface : mainSurface;
}

function applyTrafficAvoidance(racer, throttle, brake, steerInput) {
  const cos = Math.cos(racer.heading);
  const sin = Math.sin(racer.heading);
  let throttleScale = 1;
  let brakeBoost = 0;
  let steerAdjust = 0;

  state.racers.forEach((other) => {
    if (other.id === racer.id || other.finished) return;
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
    starUntil: 0,
    bulletUntil: 0,
    shrinkUntil: 0,
    spinUntil: 0,
    spinImmuneUntil: 0,
    mistakeUntil: 0,
    lapAccum: 0,
    stallCheckAt: 0,
    stallDistance: 0,
    lapStartAt: 0,
    lastLapTime: 0,
    bestLapTime: 0,
    inkUntil: 0,
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
  renderFeed();
}

function renderFeed() {
  ui.statusFeed.innerHTML = state.feed
    .map((entry) => `<div class="feed-line">${entry.message}</div>`)
    .join("");
}

function renderDriverButtons() {
  ui.driverGrid.innerHTML = DRIVERS.map((driver, index) => {
    const active = index === state.selectedDriver ? "active" : "";
    return `
      <button class="driver-card ${active}" data-driver-index="${index}" type="button">
        <canvas class="driver-avatar" width="112" height="72" data-driver-canvas="${index}"></canvas>
        <div class="driver-nameplate">
          <strong>${driver.name}</strong>
          <span>${driver.title}</span>
        </div>
      </button>
    `;
  }).join("");

  ui.driverGrid.querySelectorAll("[data-driver-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDriver = Number(button.dataset.driverIndex);
      const selD = DRIVERS[state.selectedDriver];
      state.selectedKart = TEAMS.findIndex((t) => t.id === selD.teamId);
      renderGarage();
    });
  });

  ui.driverGrid.querySelectorAll("[data-driver-canvas]").forEach((node) => {
    const driver = DRIVERS[Number(node.dataset.driverCanvas)];
    drawDriverPortrait(node, driver);
  });
}

function renderKartButtons() {
  const driver = DRIVERS[state.selectedDriver];
  const team = getTeamForDriver(driver);
  state.selectedKart = TEAMS.findIndex((t) => t.id === driver.teamId);
  ui.kartGrid.innerHTML = `
    <div class="kart-card">
      <canvas class="kart-preview" width="132" height="72" data-kart-canvas="single"></canvas>
      <div class="kart-copy">
        <strong>${team.car}</strong>
        <span>${team.style}</span>
      </div>
    </div>
  `;
  ui.kartGrid.querySelectorAll("[data-kart-canvas]").forEach((node) => {
    drawKartPreview(node, team);
  });
}

function renderGarage() {
  const driver = DRIVERS[state.selectedDriver];
  const kart = getTeamForDriver(driver);
  const stats = combineStats(driver, kart);
  const team = kart;
  const selectedCup = getSelectedCup();
  if (state.phase === "garage") {
    state.track = selectedCup.tracks[0];
    ui.trackTheme.textContent = selectedCup.tracks[0].theme;
    ui.trackName.textContent = selectedCup.tracks[0].name;
    ui.raceIndicator.textContent = `1 / ${selectedCup.tracks.length}`;
  }
  ui.driverName.textContent = driver.name;
  ui.kartName.textContent = `${team.car} (${team.name})`;
  ui.startCup.textContent = `Enter ${selectedCup.name}`;
  renderDriverButtons();
  renderKartButtons();
  renderCupButtons();
  renderDifficultyButtons();
  ui.statBars.innerHTML = Object.entries(stats).map(([key, value]) => `
    <div class="stat-row">
      <span>${labelizeStat(key)}</span>
      <div class="stat-track"><div class="stat-fill" style="width: ${Math.round(value * 100)}%"></div></div>
      <strong>${Math.round(value * 100)}</strong>
    </div>
  `).join("");
  ui.trackList.innerHTML = CUPS.map((cup) => `
    <section class="track-group ${cup.id === selectedCup.id ? "active" : ""}">
      <div class="track-group-title">
        <strong>${cup.name}</strong>
        <span class="muted">${cup.tracks.length} races</span>
      </div>
      <div class="track-group-list">
        ${cup.tracks.map((track, index) => `
          <div class="track-group-row">
            <strong>${index + 1}.</strong>
            <span><strong>${track.name}</strong> <span class="muted">(${track.theme})</span></span>
          </div>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function labelizeStat(stat) {
  return {
    speed: "Top Speed",
    acceleration: "Acceleration",
    handling: "Handling",
    weight: "Downforce",
    traction: "Tyre Grip",
    drift: "Drift",
  }[stat] || stat;
}

function drawDriverPortrait(canvasNode, driver) {
  const local = canvasNode.getContext("2d");
  local.clearRect(0, 0, canvasNode.width, canvasNode.height);
  const team = getTeamForDriver(driver);
  local.fillStyle = "#0a0a12";
  local.fillRect(0, 0, canvasNode.width, canvasNode.height);
  // Helmet body
  local.fillStyle = driver.color;
  local.fillRect(22, 10, 68, 48);
  // Visor
  local.fillStyle = driver.accent;
  local.fillRect(26, 22, 60, 18);
  // Visor tint
  local.fillStyle = "rgba(0,0,0,0.35)";
  local.fillRect(26, 22, 60, 18);
  // Chin guard
  local.fillStyle = team.body;
  local.fillRect(28, 40, 56, 14);
  // Number
  local.fillStyle = "#ffffff";
  local.font = "bold 13px monospace";
  local.textAlign = "center";
  local.fillText(`#${driver.number}`, 56, 54);
  local.textAlign = "left";
}

function drawKartPreview(canvasNode, kart) {
  const local = canvasNode.getContext("2d");
  local.clearRect(0, 0, canvasNode.width, canvasNode.height);
  local.imageSmoothingEnabled = false;
  local.fillStyle = "#0a0a12";
  local.fillRect(0, 0, canvasNode.width, canvasNode.height);
  // Draw F1 car preview using a dummy neutral driver
  const dummyDriver = { color: kart.trim, accent: "#ffffff", number: "" };
  drawKart(local, 66, 38, 0, kart, dummyDriver, 1.6);
  local.fillStyle = "#f0f0f0";
  local.font = "bold 11px monospace";
  local.fillText(kart.car, 8, 65);
}

function getSelectedCup() {
  return CUPS[state.selectedCup];
}

function getActiveCup() {
  return CUPS[state.activeCupIndex];
}

function renderDifficultyButtons() {
  ui.difficultyGrid.innerHTML = DIFFICULTIES.map((difficulty, index) => `
    <button class="${index === state.difficulty ? "active" : ""}" data-difficulty-index="${index}" type="button">
      ${difficulty.name}
    </button>
  `).join("");

  ui.difficultyGrid.querySelectorAll("[data-difficulty-index]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.phase !== "garage") return;
      state.difficulty = Number(button.dataset.difficultyIndex);
      try {
        window.localStorage.setItem("f1pixelcup.difficulty", String(state.difficulty));
      } catch (err) {
        // Preference just will not persist.
      }
      renderGarage();
    });
  });
}

function loadDifficultyPreference() {
  try {
    const stored = window.localStorage.getItem("f1pixelcup.difficulty");
    if (stored !== null) state.difficulty = clamp(Number(stored) || 0, 0, DIFFICULTIES.length - 1);
  } catch (err) {
    // Keep the default.
  }
}

function renderCupButtons() {
  ui.cupGrid.innerHTML = CUPS.map((cup, index) => `
    <button class="${index === state.selectedCup ? "active" : ""}" data-cup-index="${index}" type="button">
      ${cup.name}
    </button>
  `).join("");

  ui.cupGrid.querySelectorAll("[data-cup-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCup = Number(button.dataset.cupIndex);
      renderGarage();
    });
  });
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
  const shell = ui.canvasShell;
  if (!shell || isFullscreenActive()) return;
  state.viewMode = "driver";
  updateViewControls();
  const request = shell.requestFullscreen
    ? shell.requestFullscreen()
    : shell.webkitRequestFullscreen
      ? shell.webkitRequestFullscreen()
      : null;
  if (request && typeof request.catch === "function") {
    request.catch(() => {});
  }
}

function syncOverlayState() {
  const overlayOpen = !ui.resultsModal.classList.contains("hidden") || !ui.podiumModal.classList.contains("hidden");
  ui.canvasShell.classList.toggle("overlay-open", overlayOpen);
  document.body.classList.toggle("overlay-open", overlayOpen);
}

function updateViewControls() {
  ui.fullscreenView.textContent = isFullscreenActive() ? "Exit Full Screen" : "Full Screen";
}

function toggleViewMode() {
  state.viewMode = "driver";
  updateViewControls();
}

function toggleFullscreen() {
  const shell = ui.canvasShell;
  if (!shell) return;
  if (isFullscreenActive()) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    return;
  }
  enterFullscreenMode();
}

function startCup() {
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
  addFeed(`Lights out soon. ${getActiveCup().name} grid is forming.`);
  enterFullscreenMode();
  startRace(0);
}

function startRace(index) {
  const activeCup = getActiveCup();
  state.phase = "countdown";
  state.track = activeCup.tracks[index];
  // The world box is sized to each circuit.
  Object.assign(WORLD, state.track.world);
  state.items = [];
  state.hazards = [];
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
  state.finalLapAt = 0;
  state.paused = false;
  state.pausedAt = 0;
  ui.resultsModal.classList.add("hidden");
  ui.podiumModal.classList.add("hidden");
  syncOverlayState();
  ui.trackTheme.textContent = state.track.theme;
  ui.trackName.textContent = state.track.name;
  ui.raceIndicator.textContent = `${index + 1} / ${activeCup.tracks.length}`;
  ui.raceStatus.textContent = "Waiting on the grid";

  const grid = layoutGrid(state.track, state.cupEntries.length);
  state.racers = state.cupEntries.map((entry, slot) => {
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
  addFeed(`${state.track.name} loaded. DRS shortcut zone is somewhere on circuit.`);
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
    audio.lastBeepStep = -1;
    sfx.lightsOut();
    addFeed("Lights out — go go go!");
  }
}

function updatePlayerUI() {
  const player = getPlayer();
  if (!player) return;
  const sorted = getSortedRacers();
  const place = sorted.findIndex((racer) => racer.id === player.id) + 1;
  player.lastKnownPlace = place;
  ui.placeIndicator.textContent = formatOrdinal(place);
  ui.lapIndicator.textContent = `${getDisplayedLap(player, state.track)} / ${state.track.laps}`;
  const leader = sorted[0];
  ui.raceStatus.textContent = player.finished
    ? `Finished ${formatOrdinal(player.finishPosition)} on ${state.track.name}`
    : `Leader: ${leader.driver.name} | You are ${formatOrdinal(place)}`;
  if (player.rouletteUntil > performance.now()) {
    ui.itemName.textContent = "Roulette";
    ui.itemIcon.textContent = ITEM_ICONS.roulette;
    ui.itemSlot.classList.add("ready");
    ui.itemCopy.textContent = "Power-up roulette spinning...";
  } else if (player.currentItem !== "none") {
    ui.itemName.textContent = labelizeItem(player.currentItem);
    ui.itemIcon.textContent = ITEM_ICONS[player.currentItem];
    ui.itemSlot.classList.add("ready");
    ui.itemCopy.textContent = "Press Space to activate power-up.";
  } else {
    ui.itemName.textContent = "None";
    ui.itemIcon.textContent = ITEM_ICONS.none;
    ui.itemSlot.classList.remove("ready");
    ui.itemCopy.textContent = "Hit a power-up box to start the roulette.";
  }
}

function labelizeItem(item) {
  return {
    oilSlick: "Oil Slick",
    debris: "Debris",
    undercut: "Undercut",
    overtake: "Overtake",
    powerDeploy: "Power Deploy",
    safetyCar: "Safety Car",
    graining: "Graining",
    engineBlast: "Engine Blast",
    formationLap: "Formation Lap",
    stewardPenalty: "Steward Penalty",
    drsSignPost: "DRS Sign",
  }[item] || item;
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
    return 100000 - racer.finishPosition;
  }
  return racer.lap * state.track.totalLength + getRelativeTrackDistance(racer, state.track);
}

function assignItemForPlace(place) {
  const pools = [
    ["oilSlick", "debris", "drsSignPost"],
    ["oilSlick", "debris", "undercut", "drsSignPost"],
    ["debris", "undercut", "overtake", "graining"],
    ["undercut", "overtake", "graining", "engineBlast"],
    ["overtake", "safetyCar", "graining", "engineBlast", "formationLap"],
    ["overtake", "powerDeploy", "safetyCar", "engineBlast", "formationLap", "stewardPenalty"],
  ];
  const poolIndex = place <= 2 ? 0 : place <= 4 ? 1 : place <= 6 ? 2 : place <= 8 ? 3 : place <= 10 ? 4 : 5;
  const pool = pools[poolIndex];
  return pool[Math.floor(Math.random() * pool.length)];
}

function startRoulette(racer) {
  if (racer.currentItem !== "none" || racer.rouletteUntil > performance.now()) return;
  racer.rouletteUntil = performance.now() + 1100;
  if (racer.isPlayer) sfx.itemGet();
  addFeed(`${racer.driver.name} hit a power-up box.`);
}

function finishRoulette(racer) {
  const sorted = getSortedRacers();
  const place = sorted.findIndex((entry) => entry.id === racer.id) + 1;
  racer.currentItem = assignItemForPlace(place);
  racer.rouletteUntil = 0;
  if (racer.isPlayer) {
    addFeed(`Power-up ready: ${labelizeItem(racer.currentItem)}.`);
  }
}

function maybeUseAiItem(racer, now, dt) {
  if (state.flagOutAt) return;
  if (racer.isPlayer || racer.currentItem === "none" || racer.itemCooldownUntil > now || racer.spinUntil > now) return;
  const sorted = getSortedRacers();
  const place = sorted.findIndex((entry) => entry.id === racer.id) + 1;
  // Expressed per second rather than per frame, otherwise a high refresh rate
  // turns the field into a firing squad and nobody can move.
  const usesPerSecond = 0.16 + place * 0.011;
  if (Math.random() < usesPerSecond * Math.max(dt, 0)) {
    useItem(racer, racer.currentItem, now);
  }
}

function useItem(racer, item, now) {
  if (!item || item === "none") return;
  racer.currentItem = "none";
  racer.itemCooldownUntil = now + 2600;
  if (racer.isPlayer) sfx.itemUse();
  if (item === "oilSlick" || item === "drsSignPost") {
    state.hazards.push({
      type: item,
      x: racer.x - Math.cos(racer.heading) * 18,
      y: racer.y - Math.sin(racer.heading) * 18,
      radius: item === "oilSlick" ? 10 : 12,
      ownerId: racer.id,
      expiresAt: now + 22000,
    });
  } else if (item === "debris" || item === "undercut" || item === "stewardPenalty" || item === "engineBlast") {
    const target = item === "debris" ? null : chooseTarget(racer, item);
    state.items.push({
      type: item,
      x: racer.x + Math.cos(racer.heading) * 18,
      y: racer.y + Math.sin(racer.heading) * 18,
      heading: racer.heading,
      speed: item === "engineBlast" ? 140 : item === "stewardPenalty" ? 220 : 205,
      ownerId: racer.id,
      targetId: target ? target.id : "",
      expiresAt: now + 12000,
      armedAt: now + 500,
    });
  } else if (item === "overtake") {
    racer.boostUntil = Math.max(racer.boostUntil, now + 1550);
  } else if (item === "powerDeploy") {
    racer.starUntil = now + 5000;
    racer.boostUntil = Math.max(racer.boostUntil, now + 2600);
  } else if (item === "safetyCar") {
    state.racers.forEach((other) => {
      if (other.id !== racer.id && !other.finished) {
        other.shrinkUntil = now + 4700;
        other.spinUntil = Math.max(other.spinUntil, now + 600);
      }
    });
  } else if (item === "graining") {
    state.racers.forEach((other) => {
      if (other.id !== racer.id && !other.finished) {
        other.inkUntil = now + 6200;
      }
    });
  } else if (item === "formationLap") {
    racer.bulletUntil = now + 4200;
    racer.boostUntil = Math.max(racer.boostUntil, now + 4200);
  }
  addFeed(`${racer.driver.name} used ${labelizeItem(item)}.`);
}

function chooseTarget(racer, item) {
  const sorted = getSortedRacers();
  if (item === "stewardPenalty") return sorted[0].id === racer.id ? sorted[1] : sorted[0];
  const ahead = sorted.filter((entry) => getRaceProgress(entry) > getRaceProgress(racer) && !entry.finished);
  return ahead[0] || null;
}

function spinRacer(racer, duration = 900) {
  const now = performance.now();
  // Brief grace period after recovering, so overlapping hits cannot pin a car.
  if (now < (racer.spinImmuneUntil || 0)) return;
  racer.spinUntil = Math.max(racer.spinUntil, now + duration);
  racer.spinImmuneUntil = now + duration + 1400;
  if (racer.isPlayer) {
    addScreenShake(10, 420);
    sfx.spin();
  }
  racer.speed *= 0.55;
}

function applyTrackBarrier(racer, surface) {
  const kartClearance = racer.shrinkUntil > performance.now() ? 8 : 12;
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

function updateLapProgress(racer, now) {
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
  if (!wrapped || delta <= 0) return;

  if (!racer.startedRaceLap) {
    racer.startedRaceLap = true;
    racer.lapAccum = 0;
    racer.lapStartAt = now;
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
  // Cars being fast-forwarded after the flag cover a lap in a fraction of the
  // wall clock, so timing those laps would post impossible times and steal the
  // fastest-lap point. Only laps run at normal speed are timed.
  const fastForwarded = state.flagOutAt && !racer.isPlayer;
  if (racer.lapStartAt && !fastForwarded) {
    racer.lastLapTime = now - racer.lapStartAt;
    if (!racer.bestLapTime || racer.lastLapTime < racer.bestLapTime) {
      racer.bestLapTime = racer.lastLapTime;
    }
  }
  racer.lapStartAt = now;

  racer.lap += 1;
  if (racer.lap >= state.track.laps) {
    finishRacer(racer, now);
  }
}

function updateRacer(racer, dt, now) {
  if (racer.finished) return;
  if (racer.rouletteUntil && now >= racer.rouletteUntil) {
    finishRoulette(racer);
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
  } else {
    const difficulty = getDifficulty();
    const angleDiff = normalizeAngle(targetAngle - racer.heading);
    throttle = 1;
    steerInput = clamp(angleDiff * 1.7, -1, 1);
    const turnSeverity = Math.abs(angleDiff);
    // A better driver carries the corner further before lifting.
    if (turnSeverity > difficulty.brakeBias && racer.speed > racer.physics.maxSpeed * 0.62) {
      brake = 1;
    }
    drifting = Math.abs(angleDiff) > 0.48 && racer.speed > 80 && Math.random() < 0.78;
    driftSide = steerInput;

    // Occasional errors, so weaker fields are beatable without being slow.
    if (racer.mistakeUntil > now) {
      throttle *= 0.55;
      steerInput += Math.sin(now / 70 + racer.aiOffset) * 0.3;
    } else if (Math.random() < difficulty.mistakeRate * dt) {
      racer.mistakeUntil = now + 420 + Math.random() * 520;
    }
    maybeUseAiItem(racer, now, dt);
  }

  if (racer.spinUntil > now) {
    throttle = 0.2;
    reverse = 0;
    steerInput = Math.sin(now / 60) * 1.2;
  }

  if (racer.bulletUntil > now) {
    throttle = 1;
    brake = 0;
    reverse = 0;
    const angleDiff = normalizeAngle(targetAngle - racer.heading);
    steerInput = clamp(angleDiff * 2.2, -1, 1);
  }

  ({ throttle, brake, steerInput } = applyTrafficAvoidance(racer, throttle, brake, steerInput));

  const turnRate = racer.physics.turnRate * (0.45 + clamp(racer.speed / 180, 0.2, 1)) * (racer.shrinkUntil > now ? 0.9 : 1);
  racer.heading += steerInput * turnRate * dt;

  let targetSpeed = racer.physics.maxSpeed;
  const reverseTargetSpeed = -racer.physics.maxSpeed * 0.5;
  if (offroad) targetSpeed *= racer.physics.offroadFactor;
  if (racer.boostUntil > now) targetSpeed *= 1.22;
  if (racer.starUntil > now) targetSpeed *= 1.1;
  if (racer.bulletUntil > now) targetSpeed = racer.physics.maxSpeed * 1.42;
  if (racer.shrinkUntil > now) targetSpeed *= 0.76;

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
      racer.speed = Math.min(0, racer.speed + racer.physics.brakeRate * 0.95 * dt);
    }
    racer.speed = Math.min(targetSpeed, racer.speed + racer.physics.accelRate * throttle * dt);
  } else if (reverse > 0) {
    if (racer.speed > 0) {
      racer.speed = Math.max(0, racer.speed - racer.physics.brakeRate * 1.08 * reverse * dt);
    } else {
      racer.speed = Math.max(reverseTargetSpeed, racer.speed - racer.physics.accelRate * reverse * dt);
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
      racer.speed = Math.max(0, racer.speed - racer.physics.brakeRate * brake * dt);
    } else {
      racer.speed = Math.min(0, racer.speed + racer.physics.brakeRate * 0.6 * brake * dt);
    }
  }

  racer.speed *= Math.pow(offroad ? racer.physics.driftGrip : 0.992, dt * 60);

  if (drifting) {
    racer.drifting = true;
    racer.driftSide = driftSide >= 0 ? 1 : -1;
    racer.driftCharge += racer.physics.driftChargeRate * dt;
    racer.heading += racer.driftSide * 0.8 * dt;
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

  racer.x += Math.cos(racer.heading) * racer.speed * dt;
  racer.y += Math.sin(racer.heading) * racer.speed * dt;

  racer.x = clamp(racer.x, 24, WORLD.width - 24);
  racer.y = clamp(racer.y, 24, WORLD.height - 24);

  let barrierSurface = getActiveSurfaceInfo(racer, state.track, now);
  applyTrackBarrier(racer, barrierSurface);
  barrierSurface = getActiveSurfaceInfo(racer, state.track, now);
  const surfaceBlend = racer.isPlayer && racer.speed < -8 ? 0.04 : 0.22;
  alignRacerToSurface(racer, barrierSurface, surfaceBlend, 0.84);
  updateLapProgress(racer, now);

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

  state.track.itemBoxes.forEach((box) => {
    if (distance(racer, box) < 18) {
      startRoulette(racer);
    }
  });

  emitRacerParticles(racer, dt, now, offroad);
}

function finishRacer(racer, now) {
  if (racer.finished) return;
  racer.finished = true;
  if (racer.isPlayer) sfx.finish();
  const finishedCount = state.racers.filter((entry) => entry.finished).length;
  racer.finishPosition = finishedCount;
  racer.finishTime = now - state.raceStart;
  addFeed(`${racer.driver.name} finished ${formatOrdinal(finishedCount)}.`);
}

function updateItems(dt, now) {
  state.items = state.items.filter((item) => {
    if (item.expiresAt < now) return false;
    const owner = state.racers.find((racer) => racer.id === item.ownerId);
    if (!owner) return false;
    if (item.targetId) {
      const target = state.racers.find((racer) => racer.id === item.targetId);
      if (target && !target.finished) {
        const angle = Math.atan2(target.y - item.y, target.x - item.x);
        item.heading += normalizeAngle(angle - item.heading) * 0.08;
      }
    }
    item.x += Math.cos(item.heading) * item.speed * dt;
    item.y += Math.sin(item.heading) * item.speed * dt;

    const hit = state.racers.find((racer) => {
      if (racer.id === item.ownerId || racer.finished) return false;
      return distance(item, racer) < 16;
    });

    if (hit && item.armedAt <= now) {
      spinRacer(hit, item.type === "blueShell" ? 1200 : 850);
      if (item.type === "bobOmb") {
        applyAreaBlast(item, 86, item.ownerId);
      }
      return false;
    }

    return item.x > -40 && item.x < WORLD.width + 40 && item.y > -40 && item.y < WORLD.height + 40;
  });
}

function applyAreaBlast(point, radius, ownerId) {
  state.racers.forEach((racer) => {
    if (racer.id !== ownerId && !racer.finished && distance(point, racer) < radius) {
      spinRacer(racer, 1000);
    }
  });
}

function updateHazards(now) {
  state.hazards = state.hazards.filter((hazard) => {
    if (hazard.expiresAt < now) return false;
    const victim = state.racers.find((racer) => {
      if (racer.id === hazard.ownerId || racer.finished) return false;
      return distance(hazard, racer) < hazard.radius + 8;
    });
    if (victim) {
      spinRacer(victim, hazard.type === "drsSignPost" ? 1050 : 820);
      return false;
    }
    return true;
  });
}

function handleRacerContacts(now) {
  for (let i = 0; i < state.racers.length; i += 1) {
    for (let j = i + 1; j < state.racers.length; j += 1) {
      const a = state.racers[i];
      const b = state.racers[j];
      if (a.finished || b.finished) continue;
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
        if (a.starUntil > now || a.bulletUntil > now) spinRacer(b, 700);
        if (b.starUntil > now || b.bulletUntil > now) spinRacer(a, 700);

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

function updateRace(dt, now) {
  state.racers.forEach((racer) => {
    if (racer.finished) return;
    // Sub-stepping rather than a speed multiplier, so the cars still obey the
    // same physics, corners and barriers -- they simply cover the remaining
    // distance faster in real time.
    const steps = state.flagOutAt && !racer.isPlayer ? FLAG_FAST_FORWARD : 1;
    for (let step = 0; step < steps; step += 1) updateRacer(racer, dt, now);
  });
  updateItems(dt, now);
  updateHazards(now);
  updateParticles(dt);
  handleRacerContacts(now);
  handleRacerContacts(now);
  handleRacerContacts(now);
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
    completeRemainingFinishers(now);
    finalizeRace();
  }
}

function updateStandingsUI() {
  const sorted = getSortedRacers();
  ui.miniStandings.innerHTML = sorted.slice(0, 6).map((racer, index) => {
    const cupEntry = state.cupEntries.find((entry) => entry.driver.id === racer.driver.id);
    return `
      <div class="standing-row">
        <strong>${formatOrdinal(index + 1)}</strong>
        <span>${racer.driver.name}</span>
        <span>${cupEntry ? cupEntry.points : 0} pts</span>
        <span>${racer.finished ? "FIN" : `L${getDisplayedLap(racer, state.track)}`}</span>
      </div>
    `;
  }).join("");
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
    });
  } catch (error) {
    console.warn("Career: race not recorded", error);
    return null;
  }
}

function careerDifficultyName(id) {
  return (window.Career && window.Career.DIFFICULTY_NAMES[id]) || id;
}

function renderCareerStrip(node, lines, saved) {
  if (!node) return;
  if (!lines.length) {
    node.innerHTML = "";
    node.classList.add("hidden");
    return;
  }
  const warning = saved === false
    ? `<p class="career-strip-warning">Progress couldn't be saved in this browser.</p>`
    : "";
  node.innerHTML = lines.map((line) => `<p>${line}</p>`).join("") + warning;
  node.classList.remove("hidden");
}

function renderRaceCareer(summary) {
  if (!summary) {
    renderCareerStrip(ui.resultsCareer, [], true);
    return;
  }
  const difficulty = careerDifficultyName(getDifficulty().id);
  const { before, after, delta } = summary.rating;
  const trend = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "=";
  const lines = [
    `<strong>+${summary.careerPoints} career points</strong> (${summary.racePoints} × ${difficulty} ×${summary.multiplier})`,
    `Rating ${before} → <strong>${after}</strong> ${trend} · ${summary.tier}`,
  ];
  if (summary.newBestLap) {
    lines.push(`New best at ${state.track.name}: <strong>${formatLapTime(summary.newBestLap.ms)}</strong>`);
  }
  renderCareerStrip(ui.resultsCareer, lines, summary.saved);
}

// Career panel in the garage: totals, rating and the best lap on each circuit.
function renderCareerPanel() {
  if (!window.Career || !ui.careerStats) return;
  try {
    drawCareerPanel(window.Career.getProfile());
  } catch (error) {
    // A damaged save must never stop the garage (or the game) from working.
    console.warn("Career: panel not drawn", error);
  }
}

function drawCareerPanel(profile) {
  const totals = profile.totals;
  ui.careerTier.textContent = `${window.Career.tierFor(profile.rating)} · ${profile.rating}`;
  const stats = [
    ["Career points", profile.careerPoints.toLocaleString()],
    ["Rating", profile.rating],
    ["Races", totals.races],
    ["Wins", totals.wins],
    ["Podiums", totals.podiums],
    ["Cups won", `${totals.cupsWon} / ${totals.cupsCompleted}`],
  ];
  ui.careerStats.innerHTML = stats.map(([label, value]) => `
    <div class="career-stat"><span>${label}</span><strong>${value}</strong></div>
  `).join("");
  ui.careerBests.innerHTML = TRACKS.map((track) => {
    const best = profile.bestLaps[track.id];
    return `<div class="career-best"><span>${track.name}</span><strong>${best ? formatLapTime(best.ms) : "—"}</strong></div>`;
  }).join("");
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
      difficulty: getDifficulty().id,
      position: state.cupEntries.indexOf(playerEntry) + 1,
      cupPoints: playerEntry.points,
    }) : null;
  } catch (error) {
    console.warn("Career: cup not recorded", error);
    state.lastCupCareer = null;
  }
  renderCareerPanel();
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
  renderCareerPanel();
  state.cupEntries.sort((a, b) => b.points - a.points || a.driver.name.localeCompare(b.driver.name));
  if (state.raceIndex >= getActiveCup().tracks.length - 1) recordPlayerCup();
  showResults(finishers);
}

function completeRemainingFinishers(now) {
  const currentPlace = state.racers.filter((racer) => racer.finished).length;
  const unfinished = [...state.racers]
    .filter((racer) => !racer.finished)
    .sort((a, b) => getRaceProgress(b) - getRaceProgress(a));

  unfinished.forEach((racer, index) => {
    racer.finished = true;
    racer.finishPosition = currentPlace + index + 1;
    racer.finishTime = now - state.raceStart + (index + 1) * 120;
  });
}

function showResults(finishers) {
  const activeCup = getActiveCup();
  exitFullscreenMode();
  const fastest = finishers.reduce((best, racer) => (
    racer.bestLapTime && (!best || racer.bestLapTime < best.bestLapTime) ? racer : best
  ), null);
  ui.resultsKicker.textContent = `Race ${state.raceIndex + 1} Results`;
  ui.resultsTitle.textContent = `${state.track.name} Complete`;
  ui.resultsTable.innerHTML = `
    <div class="results-header">
      <span>Place</span>
      <span>Driver</span>
      <span>Best Lap</span>
      <span>Race Pts</span>
      <span>Cup Pts</span>
    </div>
    ${finishers.map((racer, index) => {
      const cupEntry = state.cupEntries.find((entry) => entry.driver.id === racer.driver.id);
      const racePoints = POINTS_TABLE[index] || 0;
      return `
        <div class="results-row ${racer.isPlayer ? "player-row" : ""}">
          <strong>${formatOrdinal(index + 1)}</strong>
          <span>${racer.driver.name}</span>
          <span class="${fastest && racer.id === fastest.id ? "fastest-lap" : ""}">${formatLapTime(racer.bestLapTime)}</span>
          <span>${racePoints}</span>
          <span>${cupEntry ? cupEntry.points : racePoints}</span>
        </div>
      `;
    }).join("")}
  `;
  ui.resultsButton.textContent = state.raceIndex === activeCup.tracks.length - 1 ? "Show Podium" : "Next Race";
  renderRaceCareer(state.lastRaceCareer);
  ui.resultsModal.classList.remove("hidden");
  state.phase = "results";
  syncOverlayState();
}

function showPodium() {
  exitFullscreenMode();
  const activeCup = getActiveCup();
  const topThree = [...state.cupEntries].slice(0, 3);
  ui.podiumKicker.textContent = `${activeCup.icon} ${activeCup.name} Complete`;
  ui.podiumTitle.textContent = `${activeCup.name} Trophy Stage`;
  ui.podiumScene.innerHTML = `
    <div class="podium-glow"></div>
    ${[
      { place: 2, entry: topThree[1], className: "second", medal: "silver", size: "medium" },
      { place: 1, entry: topThree[0], className: "first", medal: "gold", size: "large" },
      { place: 3, entry: topThree[2], className: "third", medal: "bronze", size: "small" },
    ].map(({ place, entry, className, medal, size }) => `
      <div class="podium-slot ${className}">
        <div class="podium-trophy ${medal} ${size}">
          <div class="cup"></div>
          <div class="stem"></div>
          <div class="base"></div>
        </div>
        <div class="podium-pedestal">
          <p class="podium-place">${formatOrdinal(place)} Place</p>
          <strong class="podium-name">${entry.driver.name}</strong>
          <p class="podium-meta">${entry.points} points</p>
          <p class="podium-meta">${entry.kart.name}</p>
        </div>
      </div>
    `).join("")}
  `;
  recordPlayerCup();
  const cup = state.lastCupCareer;
  renderCareerStrip(ui.podiumCareer, cup && cup.bonus > 0
    ? [`<strong>Cup ${formatOrdinal(state.cupEntries.findIndex((entry) => entry.isPlayer) + 1)} bonus +${cup.careerPoints}</strong> (${cup.bonus} × ${careerDifficultyName(getDifficulty().id)} ×${cup.multiplier}) · Career total ${cup.careerTotal.toLocaleString()}`]
    : [], cup ? cup.saved : true);
  ui.podiumModal.classList.remove("hidden");
  ui.resultsModal.classList.add("hidden");
  state.phase = "podium";
  syncOverlayState();
}

function nextRace() {
  ui.resultsModal.classList.add("hidden");
  syncOverlayState();
  if (state.raceIndex >= getActiveCup().tracks.length - 1) {
    showPodium();
    return;
  }
  state.raceIndex += 1;
  enterFullscreenMode();
  startRace(state.raceIndex);
}

function resetToGarage() {
  exitFullscreenMode();
  const wasPaused = state.paused;
  state.paused = false;
  state.pausedAt = 0;
  if (wasPaused && audio.ready && audio.master) {
    audio.master.gain.setTargetAtTime(audio.enabled ? 0.55 : 0, audio.ctx.currentTime, 0.05);
  }
  state.phase = "garage";
  state.raceIndex = 0;
  state.track = getSelectedCup().tracks[0];
  state.cupEntries = [];
  state.racers = [];
  state.items = [];
  state.hazards = [];
  state.cameraHeading = 0;
  state.camPos = null;
  state.camRoll = 0;
  ui.resultsModal.classList.add("hidden");
  ui.podiumModal.classList.add("hidden");
  syncOverlayState();
  addFeed("Back in the pit lane.");
  renderCareerPanel();
}

function drawTrack(track) {
  state.viewMode = "driver";
  drawDriverView(track);
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
  const now = performance.now();
  track.itemBoxes
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
  state.items
    .map((item) => ({ item, ...projectScene(camOrigin, cameraHeading, item, 4) }))
    .filter((entry) => entry.visible && entry.forward < 700
      && isOnRenderedStretch(entry.item, state.track, player, null))
    .sort((a, b) => b.forward - a.forward)
    .forEach(({ item, x, y, scale }) => {
      const size = clamp(9 * scale, 2, 46);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = item.type === "undercut" ? "#dc0000" : item.type === "stewardPenalty" ? "#0090ff" : "#00d2be";
      ctx.fillRect(-size, -size * 0.8, size * 2, size * 1.6);
      ctx.strokeStyle = "rgba(255, 240, 201, 0.75)";
      ctx.lineWidth = Math.max(1, size * 0.16);
      ctx.strokeRect(-size, -size * 0.8, size * 2, size * 1.6);
      ctx.restore();
    });
}

// Every car, including the player's, sorted back to front so overtakes read
// correctly whichever side they happen on.
function drawDriverRacers(player, track, cameraHeading) {
  const camOrigin = state.camPos || getCameraOrigin(player, cameraHeading);
  const now = performance.now();
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
        boosting: racer.bulletUntil > now || racer.boostUntil > now,
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
  if (opts.spinning) targetCtx.rotate(Math.sin(performance.now() / 90) * 0.25);
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
  targetCtx.fillStyle = driver.color;
  targetCtx.fillRect(-3, -25, 6, 5);
  targetCtx.fillStyle = "#101018";
  targetCtx.fillRect(-5, -27, 10, 1.6);

  // Rear wing.
  targetCtx.fillStyle = "#12121a";
  targetCtx.fillRect(-15, -25, 30, 4);
  targetCtx.fillStyle = trim;
  targetCtx.fillRect(-15, -25, 30, 1.6);
  targetCtx.fillStyle = shadeColor(body, -30);
  targetCtx.fillRect(-15, -26, 3, 8);
  targetCtx.fillRect(12, -26, 3, 8);

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
  // canvas then only carries the HUD on top. Without it, fall back to 2D.
  if (window.Render3D && window.Render3D.ready) {
    const now = performance.now();
    ctx.clearRect(0, 0, view.width, view.height);
    const surface = window.Render3D.render({
      track,
      player,
      racers: state.racers,
      cameraHeading,
      camPos: state.camPos,
      roll: state.camRoll,
      shake: getScreenShake(),
      items: state.items,
      particles: state.particles,
      now,
    });
    if (surface && surface.onKerb && state.phase === "race" && !state.paused && Math.abs(player.speed) > 40) sfx.kerb();
    drawSpeedLines(player);
    drawDriverItemBadge(player);
    drawMiniMap(track, player, { x: view.width - 224, y: 12, width: 212, height: 212 });
    drawDriverHud(track, player);
    if (state.phase === "countdown") drawStartLights(now);
    drawLightsOutFlash(now);
    drawPlayerEffects();
    return;
  }

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
  if (state.phase === "countdown") drawStartLights(performance.now());
  drawLightsOutFlash(performance.now());
  drawPlayerEffects();
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

function makeNoiseBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * 1.4);
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
  if (ui.soundToggle) {
    ui.soundToggle.textContent = audio.enabled ? "Sound: On" : "Sound: Off";
    ui.soundToggle.setAttribute("aria-pressed", audio.enabled ? "true" : "false");
  }
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
function updateEngineAudio(player) {
  if (!audio.ready || !audio.engine) return;
  const ctxA = audio.ctx;
  const now = ctxA.currentTime;
  const racing = state.phase === "race" || state.phase === "countdown";
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

function emitRacerParticles(racer, dt, now, offroad) {
  const boosting = racer.boostUntil > now || racer.bulletUntil > now;
  const sliding = racer.drifting;
  const scuffing = offroad && Math.abs(racer.speed) > 40;
  if (!boosting && !sliding && !scuffing) return;

  racer.emitAccum = (racer.emitAccum || 0) + dt;
  const interval = 0.035;
  while (racer.emitAccum >= interval) {
    racer.emitAccum -= interval;
    const cos = Math.cos(racer.heading);
    const sin = Math.sin(racer.heading);
    const spread = (Math.random() - 0.5) * 13;
    const px = racer.x - cos * 15 - sin * spread;
    const py = racer.y - sin * 15 + cos * spread;

    if (sliding) {
      // Smoke takes on the colour of the boost that is charging, so you can
      // see the drift ripening without looking away from the road.
      const charge = racer.driftCharge;
      const color = charge > 1.6 ? "#ff9a3c" : charge > 0.9 ? "#75d5ff" : "#e6e6ef";
      spawnParticle({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 28, vy: (Math.random() - 0.5) * 28,
        life: 0.55, maxLife: 0.55, size: 5 + Math.random() * 4, color, height: 3,
      });
    } else if (boosting) {
      spawnParticle({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18,
        life: 0.3, maxLife: 0.3, size: 4 + Math.random() * 3,
        color: Math.random() < 0.5 ? "#ffd166" : "#ff6b35", height: 6,
      });
    } else {
      spawnParticle({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 24, vy: (Math.random() - 0.5) * 24,
        life: 0.7, maxLife: 0.7, size: 4 + Math.random() * 4, color: "#8f7a52", height: 3,
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
  const now = performance.now();
  if (now > (state.shakeUntil || 0)) return { x: 0, y: 0 };
  const remaining = ((state.shakeUntil - now) / 220);
  const mag = (state.shakeMag || 0) * clamp(remaining, 0, 1);
  return {
    x: (Math.random() - 0.5) * mag * 2,
    y: (Math.random() - 0.5) * mag * 2,
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
  const now = performance.now();
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
  const pulse = 5.5 + Math.sin(performance.now() / 260) * 1.4;
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
  if (!ms || ms <= 0) return "--:--.--";
  const total = ms / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function formatGap(seconds) {
  if (!Number.isFinite(seconds)) return "--.-";
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
  return seconds.toFixed(1);
}

function drawDriverHud(track, player) {
  const sorted = getSortedRacers();
  const place = sorted.findIndex((racer) => racer.id === player.id) + 1;
  const total = sorted.length;
  const placeStyle = getPlaceStyle(place);
  const now = performance.now();

  // Flash the position panel whenever a place changes hands.
  if (state.hudLastPlace && state.hudLastPlace !== place && state.phase === "racing") {
    state.hudPlaceFlashUntil = now + 1400;
    state.hudPlaceFlashDir = place < state.hudLastPlace ? 1 : -1;
  }
  state.hudLastPlace = place;

  // ---- Lap block, top left ----
  hudPanel(20, 16, 262, 116, placeStyle.fill);
  ctx.fillStyle = "rgba(255, 240, 201, 0.62)";
  ctx.font = "bold 11px Trebuchet MS";
  ctx.fillText(track.name.toUpperCase(), 34, 34);

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
  const referenceSpeed = Math.max(Math.abs(player.speed), 45);
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
    const gap = Math.abs(getRaceProgress(other) - getRaceProgress(player)) / referenceSpeed;
    ctx.fillText(`${formatGap(gap)}s`, px + 232, y);
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

  // ---- Speed, bottom right ----
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


function drawDriverItemBadge(player) {
  const rouletteActive = player.rouletteUntil > performance.now();
  const hasItem = player.currentItem && player.currentItem !== "none";
  if (!rouletteActive && !hasItem) return;

  const itemKey = rouletteActive ? "roulette" : player.currentItem;
  const itemLabel = rouletteActive ? "Roulette" : labelizeItem(player.currentItem);
  const icon = ITEM_ICONS[itemKey] || "?";
  const panelWidth = 186;
  const panelHeight = 84;
  const panelX = Math.round(view.width / 2 - panelWidth / 2);
  const panelY = view.height - 104;

  ctx.save();
  ctx.fillStyle = "rgba(18, 10, 21, 0.84)";
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = rouletteActive ? "#ffd166" : "rgba(255, 240, 201, 0.26)";
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  ctx.fillStyle = rouletteActive ? "#ffd166" : "#fff0c9";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.fillText("POWER UP", panelX + 14, panelY + 18);

  ctx.fillStyle = rouletteActive ? "#ffe08a" : "#75d5ff";
  ctx.fillRect(panelX + 14, panelY + 28, 42, 42);
  ctx.fillStyle = "#20152c";
  ctx.font = "bold 24px Georgia";
  ctx.fillText(icon, panelX + 28, panelY + 58);

  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 18px Georgia";
  ctx.fillText(itemLabel, panelX + 70, panelY + 48);
  ctx.font = "13px Trebuchet MS";
  ctx.fillStyle = "rgba(255, 240, 201, 0.8)";
  ctx.fillText(rouletteActive ? "Spinning now" : "Press Space to use", panelX + 70, panelY + 67);
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

function drawItemBoxes(track) {
  const pulse = 6 + Math.sin(performance.now() / 180) * 2;
  track.itemBoxes.forEach((box) => {
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.rotate(performance.now() / 700);
    ctx.fillStyle = "#dc0000";
    ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.strokeStyle = "#fff0c9";
    ctx.strokeRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.restore();
  });
}

function drawHazards() {
  state.hazards.forEach((hazard) => {
    if (hazard.type === "oilSlick") {
      ctx.fillStyle = "#888800";
      ctx.beginPath();
      ctx.moveTo(hazard.x, hazard.y - 10);
      ctx.lineTo(hazard.x + 8, hazard.y + 10);
      ctx.lineTo(hazard.x - 8, hazard.y + 10);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#dc0000";
      ctx.fillRect(hazard.x - 9, hazard.y - 9, 18, 18);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(hazard.x - 9, hazard.y - 9, 18, 18);
    }
  });
}

function drawItems() {
  state.items.forEach((item) => {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.heading);
    ctx.fillStyle = item.type === "engineBlast" ? "#ff4400" : item.type === "stewardPenalty" ? "#0090ff" : item.type === "undercut" ? "#dc0000" : "#00d2be";
    ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = "#fff0c9";
    ctx.fillRect(-3, -8, 6, 4);
    ctx.restore();
  });
}

function drawRacers() {
  const sorted = [...state.racers].sort((a, b) => a.y - b.y);
  sorted.forEach((racer) => {
    drawKart(ctx, racer.x, racer.y, racer.heading, racer.kart, racer.driver, racer.shrinkUntil > performance.now() ? 0.82 : 1);
    if (racer.starUntil > performance.now()) {
      ctx.strokeStyle = "#ffe36e";
      ctx.strokeRect(racer.x - 16, racer.y - 16, 32, 32);
    }
    if (racer.isPlayer) {
      ctx.fillStyle = "#fff0c9";
      ctx.fillRect(racer.x - 14, racer.y - 30, 28, 4);
    }
  });
}

function drawKart(targetCtx, x, y, heading, kart, driver, scale = 1) {
  targetCtx.save();
  targetCtx.translate(x, y);
  targetCtx.rotate(heading);
  targetCtx.scale(scale, scale);
  // Rear wing
  targetCtx.fillStyle = kart.trim;
  targetCtx.fillRect(-22, -14, 7, 28);
  // Wheels
  targetCtx.fillStyle = "#111118";
  targetCtx.fillRect(7, -13, 7, 6);
  targetCtx.fillRect(7, 7, 7, 6);
  targetCtx.fillRect(-18, -13, 7, 6);
  targetCtx.fillRect(-18, 7, 7, 6);
  // Main body / sidepods
  targetCtx.fillStyle = kart.body;
  targetCtx.fillRect(-14, -7, 30, 14);
  // Sidepod detail
  targetCtx.fillStyle = kart.trim;
  targetCtx.fillRect(-10, -11, 20, 4);
  targetCtx.fillRect(-10, 7, 20, 4);
  // Nose
  targetCtx.fillStyle = kart.body;
  targetCtx.fillRect(16, -4, 8, 8);
  // Front wing
  targetCtx.fillStyle = kart.trim;
  targetCtx.fillRect(18, -13, 6, 26);
  // Cockpit opening
  targetCtx.fillStyle = "#0a0a18";
  targetCtx.fillRect(-2, -4, 11, 8);
  // Halo
  targetCtx.fillStyle = kart.body;
  targetCtx.fillRect(-1, -5, 2, 10);
  targetCtx.fillRect(7, -5, 2, 10);
  // Helmet
  targetCtx.fillStyle = driver.color;
  targetCtx.fillRect(0, -3, 8, 6);
  // Visor
  targetCtx.fillStyle = driver.accent;
  targetCtx.fillRect(1, -2, 5, 4);
  targetCtx.restore();
}

function drawPlayerEffects() {
  const player = getPlayer();
  if (!player) return;
  if (player.inkUntil > performance.now()) {
    ctx.save();
    ctx.fillStyle = "rgba(18, 10, 21, 0.22)";
    ctx.fillRect(0, 0, view.width, 24);
    ctx.fillRect(0, 0, 34, 184);
    ctx.fillRect(view.width - 34, 0, 34, 184);
    [[92, 46, 88, 22], [view.width - 184, 42, 96, 24], [view.width / 2 - 44, 28, 88, 18]].forEach(([x, y, w, h]) => {
      ctx.fillRect(x, y, w, h);
    });
    ctx.restore();
  }
}

// Pausing shifts every deadline in flight. Without this, a paused boost, spin,
// item cooldown or lap timer would all expire the instant the game resumes.
const RACER_TIME_FIELDS = ["rouletteUntil", "itemCooldownUntil", "boostUntil", "starUntil", "bulletUntil", "shrinkUntil", "spinUntil", "spinImmuneUntil", "inkUntil", "lapStartAt"];

function shiftRaceClocks(delta) {
  state.racers.forEach((racer) => {
    RACER_TIME_FIELDS.forEach((field) => {
      if (racer[field]) racer[field] += delta;
    });
  });
  state.items.forEach((item) => {
    if (item.expiresAt) item.expiresAt += delta;
    if (item.armedAt) item.armedAt += delta;
  });
  state.hazards.forEach((hazard) => {
    if (hazard.expiresAt) hazard.expiresAt += delta;
  });
  ["raceStart", "flagOutAt", "resultTimeoutAt", "countdownStart",
   "hudPlaceFlashUntil", "finalLapAt", "shakeUntil"].forEach((field) => {
    if (state[field]) state[field] += delta;
  });
}

function togglePause() {
  if (state.phase !== "race" && state.phase !== "countdown") return;
  if (state.paused) {
    shiftRaceClocks(performance.now() - state.pausedAt);
    state.paused = false;
    state.pausedAt = 0;
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
  // After a race or a cup there is nothing to pause, so Esc is the way home.
  if (state.phase === "results" || state.phase === "podium") {
    resetToGarage();
    return;
  }
  if (state.phase === "race" || state.phase === "countdown") {
    togglePause();
  }
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
  ctx.fillText("Q to quit to the pit lane", view.width / 2, view.height / 2 + 54);
  ctx.textAlign = "left";
  ctx.restore();
}

function update(now) {
  fitViewToElement();
  const dt = clamp((now - (state.lastTimestamp || now)) / 1000, 0, 0.033);
  state.lastTimestamp = now;

  if (!state.paused) {
    if (state.phase === "countdown") {
      updateCountdown(now);
    } else if (state.phase === "race") {
      updateRace(dt, now);
    }
  }

  updateEngineAudio(getPlayer());

  if (state.phase !== "garage") {
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
  // In 3D the selected car turns on a showroom floor behind this canvas, and
  // this canvas only lays the driver details over a fade on the left.
  const showroom = Boolean(window.Render3D && window.Render3D.ready
    && window.Render3D.renderGarage(team, driver, performance.now()));
  if (showroom) {
    const fade = ctx.createLinearGradient(0, 0, view.width * 0.55, 0);
    fade.addColorStop(0, "rgba(8, 8, 18, 0.85)");
    fade.addColorStop(1, "rgba(8, 8, 18, 0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, view.width, view.height);
  } else {
    ctx.fillStyle = "#080812";
    ctx.fillRect(0, 0, view.width, view.height);
    // Carbon grid background
    ctx.fillStyle = "#0e0e1e";
    for (let y = 0; y < view.height; y += 32) {
      ctx.fillRect(0, y, view.width, 16);
    }
  }
  // Team color stripe
  ctx.fillStyle = team.body;
  ctx.fillRect(0, 0, 8, view.height);
  ctx.fillStyle = team.trim;
  ctx.fillRect(8, 0, 4, view.height);
  // Title
  ctx.fillStyle = "#f0f0f0";
  ctx.font = "bold 36px Georgia";
  ctx.fillText("Pit Lane", 56, 78);
  // Driver name
  ctx.fillStyle = team.body;
  ctx.font = "bold 28px Georgia";
  ctx.fillText(driver.name, 56, 120);
  ctx.fillStyle = "#f0f0f0";
  ctx.font = "18px Trebuchet MS";
  ctx.fillText(`#${driver.number}  ${driver.title}`, 56, 148);
  ctx.fillText(team.name, 56, 172);
  ctx.fillText(team.car, 56, 196);
  if (showroom) return;
  // Draw the car large
  drawKart(ctx, 320, 320, 0, team, driver, 5.5);
  // Team color swatch
  ctx.fillStyle = team.body;
  ctx.fillRect(460, 158, 340, 220);
  ctx.fillStyle = "#0a0a18";
  ctx.fillRect(472, 170, 316, 196);
  // Helmet preview
  const hx = 630, hy = 260;
  ctx.fillStyle = driver.color;
  ctx.fillRect(hx - 60, hy - 55, 120, 90);
  ctx.fillStyle = driver.accent;
  ctx.fillRect(hx - 54, hy - 30, 108, 30);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(hx - 54, hy - 30, 108, 30);
  ctx.fillStyle = team.body;
  ctx.fillRect(hx - 48, hy + 5, 96, 24);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`#${driver.number}`, hx, hy + 24);
  ctx.textAlign = "left";
}

function bindEvents() {
  ui.startCup.addEventListener("click", startCup);
  ui.resultsGarageButton.addEventListener("click", resetToGarage);
  ui.resultsButton.addEventListener("click", nextRace);
  ui.restartButton.addEventListener("click", resetToGarage);
  if (ui.toggleView) {
    ui.toggleView.addEventListener("click", toggleViewMode);
  }
  ui.fullscreenView.addEventListener("click", toggleFullscreen);
  ui.soundToggle.addEventListener("click", () => {
    initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    setAudioEnabled(!audio.enabled);
  });
  ui.canvasShell.addEventListener("dblclick", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateViewControls);
  document.addEventListener("webkitfullscreenchange", updateViewControls);

  window.addEventListener("keydown", (event) => {
    if (!audio.ready) initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") input.throttle = true;
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") input.brake = true;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = true;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = true;
    if (event.key === "Shift") input.drift = true;
    if (event.key === "Escape") {
      event.preventDefault();
      handleEscapeKey();
    }
    if (event.key.toLowerCase() === "p" && (state.phase === "race" || state.phase === "countdown")) {
      event.preventDefault();
      togglePause();
    }
    // A way out mid-race without having to finish it.
    if (event.key.toLowerCase() === "q" && state.paused) {
      event.preventDefault();
      resetToGarage();
    }
    if (event.code === "Space") {
      event.preventDefault();
      const player = getPlayer();
      if (player && state.phase === "race" && player.currentItem !== "none") {
        useItem(player, player.currentItem, performance.now());
        updatePlayerUI();
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
  });
}

loadAudioPreference();
loadDifficultyPreference();
updateSoundButton();
renderGarage();
renderCareerPanel();
updateViewControls();
syncOverlayState();
bindEvents();
requestAnimationFrame(update);
