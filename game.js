const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  driverGrid: document.getElementById("driver-grid"),
  kartGrid: document.getElementById("kart-grid"),
  statBars: document.getElementById("stat-bars"),
  driverName: document.getElementById("driver-name"),
  kartName: document.getElementById("kart-name"),
  trackList: document.getElementById("track-list"),
  startCup: document.getElementById("start-cup"),
  cupGrid: document.getElementById("cup-grid"),
  countdownBanner: document.getElementById("countdown-banner"),
  trackTheme: document.getElementById("track-theme"),
  trackName: document.getElementById("track-name"),
  lapIndicator: document.getElementById("lap-indicator"),
  placeIndicator: document.getElementById("place-indicator"),
  raceIndicator: document.getElementById("race-indicator"),
  toggleView: document.getElementById("toggle-view"),
  fullscreenView: document.getElementById("fullscreen-view"),
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
};

const TAU = Math.PI * 2;
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

function trackDefinition(options) {
  const { points } = options;
  const roadWidth = options.roadWidth * TRACK_WIDTH_SCALE;
  const startHeading = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const shortcut = {
    ...options.shortcut,
    width: options.shortcut.width * SHORTCUT_WIDTH_SCALE,
  };
  const segments = buildSegments(points, roadWidth, true);
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

const TRACKS = [
  trackDefinition({
    id: "monza",
    name: "Autodromo di Monza",
    theme: "Italian speed temple",
    roadWidth: 50,
    laps: 3,
    bg: { sky: "#87ceeb", grass: "#4a8c3f", accent: "#ffe08a", road: "#484850", shoulder: "#c8c0b0", horizonA: "#2a5a30", horizonB: "#5a9a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe08a" },
    points: [
      { x: 120, y: 425 },
      { x: 858, y: 425 },
      { x: 928, y: 388 },
      { x: 952, y: 322 },
      { x: 918, y: 268 },
      { x: 878, y: 258 },
      { x: 842, y: 290 },
      { x: 860, y: 234 },
      { x: 822, y: 175 },
      { x: 682, y: 140 },
      { x: 470, y: 128 },
      { x: 265, y: 136 },
      { x: 152, y: 168 },
      { x: 114, y: 252 },
      { x: 106, y: 355 },
    ],
    shortcut: {
      entry: { x: 928, y: 388 },
      exit: { x: 860, y: 234 },
      width: 30,
      points: [
        { x: 928, y: 388 },
        { x: 955, y: 340 },
        { x: 948, y: 278 },
        { x: 900, y: 245 },
        { x: 860, y: 234 },
      ],
      color: "#00d2be",
    },
    decor: [
      { type: "grandstand", x: 490, y: 90, w: 200, h: 36, color: "#dc0000" },
      { type: "grandstand", x: 490, y: 465, w: 160, h: 30, color: "#dc0000" },
      { type: "billboard", x: 960, y: 305, w: 88, h: 24, color: "#e8bf00" },
      { type: "tower", x: 108, y: 190, w: 40, h: 60, color: "#888888" },
      { type: "billboard", x: 680, y: 100, w: 100, h: 24, color: "#ffffff" },
    ],
    itemBoxes: [
      { x: 460, y: 410 },
      { x: 760, y: 410 },
      { x: 940, y: 310 },
      { x: 840, y: 255 },
      { x: 580, y: 135 },
      { x: 300, y: 140 },
      { x: 118, y: 300 },
      { x: 200, y: 408 },
    ],
  }),
  trackDefinition({
    id: "spa",
    name: "Circuit de Spa-Francorchamps",
    theme: "Belgian forest circuit",
    roadWidth: 52,
    laps: 3,
    bg: { sky: "#6a8faf", grass: "#2d5a27", accent: "#c8d8e8", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1a3a1a", horizonB: "#3a6a35", curbA: "#dc0000", curbB: "#ffffff", sun: "#ddeeff" },
    points: [
      { x: 132, y: 455 },
      { x: 670, y: 455 },
      { x: 752, y: 430 },
      { x: 800, y: 374 },
      { x: 792, y: 314 },
      { x: 748, y: 282 },
      { x: 700, y: 262 },
      { x: 655, y: 222 },
      { x: 650, y: 165 },
      { x: 715, y: 130 },
      { x: 842, y: 116 },
      { x: 942, y: 140 },
      { x: 978, y: 188 },
      { x: 962, y: 248 },
      { x: 900, y: 272 },
      { x: 850, y: 296 },
      { x: 818, y: 356 },
      { x: 858, y: 418 },
      { x: 804, y: 452 },
    ],
    shortcut: {
      entry: { x: 852, y: 296 },
      exit: { x: 858, y: 418 },
      width: 28,
      points: [
        { x: 852, y: 296 },
        { x: 808, y: 325 },
        { x: 808, y: 388 },
        { x: 858, y: 418 },
      ],
      color: "#00d2be",
    },
    decor: [
      { type: "tree", x: 60, y: 260, size: 28, color: "#1e5c18" },
      { type: "tree", x: 990, y: 320, size: 24, color: "#1e5c18" },
      { type: "grandstand", x: 750, y: 80, w: 140, h: 28, color: "#dc0000" },
      { type: "billboard", x: 672, y: 100, w: 96, h: 24, color: "#ffffff" },
      { type: "tower", x: 985, y: 160, w: 38, h: 58, color: "#888888" },
    ],
    itemBoxes: [
      { x: 380, y: 440 },
      { x: 720, y: 440 },
      { x: 770, y: 348 },
      { x: 720, y: 245 },
      { x: 780, y: 128 },
      { x: 960, y: 218 },
      { x: 872, y: 435 },
      { x: 200, y: 442 },
    ],
  }),
  trackDefinition({
    id: "silverstone",
    name: "Silverstone Circuit",
    theme: "British airfield classic",
    roadWidth: 54,
    laps: 3,
    bg: { sky: "#aac8e0", grass: "#4c8840", accent: "#e8f0e0", road: "#505058", shoulder: "#c0b8a8", horizonA: "#304828", horizonB: "#5a7848", curbA: "#dc0000", curbB: "#ffffff", sun: "#d8e8f0" },
    points: [
      { x: 138, y: 372 },
      { x: 562, y: 382 },
      { x: 652, y: 358 },
      { x: 724, y: 310 },
      { x: 762, y: 252 },
      { x: 782, y: 190 },
      { x: 742, y: 148 },
      { x: 658, y: 130 },
      { x: 520, y: 122 },
      { x: 378, y: 128 },
      { x: 255, y: 140 },
      { x: 162, y: 178 },
      { x: 118, y: 252 },
      { x: 116, y: 322 },
    ],
    shortcut: {
      entry: { x: 724, y: 310 },
      exit: { x: 742, y: 148 },
      width: 30,
      points: [
        { x: 724, y: 310 },
        { x: 780, y: 258 },
        { x: 790, y: 195 },
        { x: 762, y: 155 },
        { x: 742, y: 148 },
      ],
      color: "#00d2be",
    },
    decor: [
      { type: "grandstand", x: 340, y: 84, w: 180, h: 32, color: "#dc0000" },
      { type: "grandstand", x: 340, y: 420, w: 140, h: 28, color: "#3366cc" },
      { type: "billboard", x: 785, y: 108, w: 90, h: 22, color: "#e8bf00" },
      { type: "house", x: 980, y: 248, w: 52, h: 38, color: "#ccddcc" },
      { type: "tower", x: 118, y: 198, w: 36, h: 52, color: "#888888" },
    ],
    itemBoxes: [
      { x: 335, y: 368 },
      { x: 620, y: 368 },
      { x: 754, y: 275 },
      { x: 760, y: 168 },
      { x: 580, y: 128 },
      { x: 305, y: 132 },
      { x: 128, y: 285 },
      { x: 250, y: 375 },
    ],
  }),
  trackDefinition({
    id: "suzuka",
    name: "Suzuka International Racing Course",
    theme: "Japanese technical masterpiece",
    roadWidth: 50,
    laps: 3,
    bg: { sky: "#9fd0e8", grass: "#3a7a38", accent: "#ffeedd", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1e4a1e", horizonB: "#408040", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" },
    points: [
      { x: 158, y: 418 },
      { x: 238, y: 358 },
      { x: 322, y: 298 },
      { x: 422, y: 268 },
      { x: 548, y: 260 },
      { x: 668, y: 255 },
      { x: 790, y: 242 },
      { x: 875, y: 215 },
      { x: 945, y: 172 },
      { x: 962, y: 122 },
      { x: 918, y: 88 },
      { x: 818, y: 80 },
      { x: 678, y: 90 },
      { x: 548, y: 108 },
      { x: 438, y: 132 },
      { x: 332, y: 165 },
      { x: 248, y: 218 },
      { x: 210, y: 302 },
      { x: 205, y: 375 },
    ],
    shortcut: {
      entry: { x: 238, y: 358 },
      exit: { x: 422, y: 268 },
      width: 28,
      points: [
        { x: 238, y: 358 },
        { x: 305, y: 320 },
        { x: 378, y: 282 },
        { x: 422, y: 268 },
      ],
      color: "#00d2be",
    },
    decor: [
      { type: "grandstand", x: 688, y: 50, w: 160, h: 28, color: "#dc0000" },
      { type: "billboard", x: 960, y: 148, w: 80, h: 22, color: "#ffffff" },
      { type: "tree", x: 80, y: 320, size: 24, color: "#2a6a28" },
      { type: "tower", x: 975, y: 95, w: 36, h: 52, color: "#cc0000" },
      { type: "grandstand", x: 500, y: 222, w: 120, h: 24, color: "#e8bf00" },
    ],
    itemBoxes: [
      { x: 290, y: 385 },
      { x: 490, y: 258 },
      { x: 720, y: 248 },
      { x: 950, y: 148 },
      { x: 858, y: 88 },
      { x: 590, y: 105 },
      { x: 340, y: 148 },
      { x: 218, y: 265 },
    ],
  }),
  trackDefinition({
    id: "monaco",
    name: "Circuit de Monaco",
    theme: "Street circuit showpiece",
    roadWidth: 44,
    laps: 3,
    bg: { sky: "#4db8e8", grass: "#3a6a88", accent: "#ffeedd", road: "#505060", shoulder: "#c8c0b8", horizonA: "#184858", horizonB: "#3878a8", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" },
    points: [
      { x: 215, y: 400 },
      { x: 545, y: 400 },
      { x: 625, y: 378 },
      { x: 668, y: 335 },
      { x: 655, y: 282 },
      { x: 600, y: 252 },
      { x: 512, y: 238 },
      { x: 418, y: 240 },
      { x: 332, y: 262 },
      { x: 265, y: 305 },
      { x: 244, y: 370 },
      { x: 256, y: 432 },
      { x: 295, y: 468 },
      { x: 360, y: 495 },
      { x: 448, y: 502 },
      { x: 532, y: 492 },
      { x: 612, y: 476 },
      { x: 672, y: 460 },
    ],
    shortcut: {
      entry: { x: 625, y: 378 },
      exit: { x: 612, y: 476 },
      width: 25,
      points: [
        { x: 625, y: 378 },
        { x: 648, y: 422 },
        { x: 630, y: 468 },
        { x: 612, y: 476 },
      ],
      color: "#445566",
    },
    decor: [
      { type: "house", x: 500, y: 195, w: 120, h: 38, color: "#e8e0d0" },
      { type: "grandstand", x: 420, y: 540, w: 120, h: 28, color: "#dc0000" },
      { type: "billboard", x: 670, y: 300, w: 70, h: 20, color: "#e8bf00" },
      { type: "lamp", x: 238, y: 272, size: 16, color: "#ffee88" },
      { type: "lamp", x: 670, y: 440, size: 16, color: "#ffee88" },
    ],
    itemBoxes: [
      { x: 375, y: 388 },
      { x: 600, y: 360 },
      { x: 558, y: 245 },
      { x: 368, y: 248 },
      { x: 252, y: 338 },
      { x: 322, y: 488 },
      { x: 528, y: 498 },
      { x: 650, y: 468 },
    ],
  }),
  trackDefinition({
    id: "singapore",
    name: "Marina Bay Street Circuit",
    theme: "Night city circuit",
    roadWidth: 48,
    laps: 3,
    bg: { sky: "#0a0a1e", grass: "#1a1a3a", accent: "#ffa500", road: "#3a3848", shoulder: "#545060", horizonA: "#0a0a28", horizonB: "#1a1a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ff8800" },
    points: [
      { x: 128, y: 422 },
      { x: 482, y: 422 },
      { x: 558, y: 392 },
      { x: 582, y: 328 },
      { x: 558, y: 268 },
      { x: 610, y: 242 },
      { x: 700, y: 242 },
      { x: 775, y: 252 },
      { x: 838, y: 215 },
      { x: 875, y: 165 },
      { x: 928, y: 142 },
      { x: 958, y: 185 },
      { x: 945, y: 238 },
      { x: 898, y: 272 },
      { x: 832, y: 298 },
      { x: 772, y: 355 },
      { x: 758, y: 435 },
      { x: 658, y: 462 },
      { x: 518, y: 458 },
      { x: 388, y: 445 },
    ],
    shortcut: {
      entry: { x: 832, y: 298 },
      exit: { x: 758, y: 435 },
      width: 28,
      points: [
        { x: 832, y: 298 },
        { x: 802, y: 368 },
        { x: 782, y: 428 },
        { x: 758, y: 435 },
      ],
      color: "#00d2be",
    },
    decor: [
      { type: "tower", x: 520, y: 378, w: 48, h: 70, color: "#1a2a4a" },
      { type: "tower", x: 960, y: 115, w: 42, h: 65, color: "#1a2a4a" },
      { type: "lamp", x: 130, y: 388, size: 18, color: "#ffaa44" },
      { type: "lamp", x: 730, y: 222, size: 18, color: "#ffaa44" },
      { type: "grandstand", x: 680, y: 498, w: 130, h: 26, color: "#dc0000" },
    ],
    itemBoxes: [
      { x: 295, y: 410 },
      { x: 565, y: 355 },
      { x: 650, y: 245 },
      { x: 858, y: 188 },
      { x: 950, y: 212 },
      { x: 878, y: 282 },
      { x: 762, y: 398 },
      { x: 560, y: 452 },
    ],
  }),
  trackDefinition({
    id: "bahrain",
    name: "Bahrain International Circuit",
    theme: "Desert twilight circuit",
    roadWidth: 52,
    laps: 3,
    bg: { sky: "#cc8833", grass: "#8a6a3a", accent: "#ffe8aa", road: "#585050", shoulder: "#c8b888", horizonA: "#6a4820", horizonB: "#aa7838", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffcc44" },
    points: [
      { x: 128, y: 405 },
      { x: 718, y: 405 },
      { x: 808, y: 382 },
      { x: 868, y: 335 },
      { x: 890, y: 278 },
      { x: 868, y: 222 },
      { x: 816, y: 175 },
      { x: 728, y: 148 },
      { x: 608, y: 138 },
      { x: 475, y: 142 },
      { x: 355, y: 158 },
      { x: 252, y: 192 },
      { x: 165, y: 252 },
      { x: 125, y: 335 },
    ],
    shortcut: {
      entry: { x: 868, y: 335 },
      exit: { x: 868, y: 222 },
      width: 30,
      points: [
        { x: 868, y: 335 },
        { x: 922, y: 308 },
        { x: 928, y: 252 },
        { x: 868, y: 222 },
      ],
      color: "#e8bf00",
    },
    decor: [
      { type: "grandstand", x: 420, y: 360, w: 160, h: 32, color: "#dc0000" },
      { type: "house", x: 940, y: 290, w: 60, h: 42, color: "#c8a870" },
      { type: "billboard", x: 590, y: 98, w: 100, h: 26, color: "#e8bf00" },
      { type: "tower", x: 130, y: 222, w: 38, h: 58, color: "#a08050" },
      { type: "billboard", x: 250, y: 158, w: 82, h: 22, color: "#ffffff" },
    ],
    itemBoxes: [
      { x: 380, y: 392 },
      { x: 680, y: 392 },
      { x: 878, y: 308 },
      { x: 888, y: 252 },
      { x: 728, y: 152 },
      { x: 480, y: 145 },
      { x: 225, y: 218 },
      { x: 135, y: 375 },
    ],
  }),
  trackDefinition({
    id: "interlagos",
    name: "Autódromo José Carlos Pace",
    theme: "Brazilian passion circuit",
    roadWidth: 50,
    laps: 3,
    bg: { sky: "#5598cc", grass: "#3c7838", accent: "#ffe8aa", road: "#484850", shoulder: "#b0a898", horizonA: "#1e4820", horizonB: "#3a7838", curbA: "#009c3b", curbB: "#ffdf00", sun: "#ffdd44" },
    points: [
      { x: 182, y: 448 },
      { x: 525, y: 448 },
      { x: 640, y: 415 },
      { x: 698, y: 358 },
      { x: 688, y: 292 },
      { x: 622, y: 245 },
      { x: 518, y: 228 },
      { x: 398, y: 232 },
      { x: 292, y: 260 },
      { x: 205, y: 318 },
      { x: 148, y: 408 },
    ],
    shortcut: {
      entry: { x: 518, y: 228 },
      exit: { x: 292, y: 260 },
      width: 28,
      points: [
        { x: 518, y: 228 },
        { x: 418, y: 215 },
        { x: 322, y: 238 },
        { x: 292, y: 260 },
      ],
      color: "#009c3b",
    },
    decor: [
      { type: "grandstand", x: 360, y: 192, w: 140, h: 28, color: "#009c3b" },
      { type: "tree", x: 80, y: 310, size: 26, color: "#2a6a28" },
      { type: "tree", x: 985, y: 380, size: 22, color: "#2a6a28" },
      { type: "billboard", x: 620, y: 205, w: 92, h: 24, color: "#ffdf00" },
      { type: "tower", x: 700, y: 325, w: 36, h: 52, color: "#888888" },
    ],
    itemBoxes: [
      { x: 345, y: 435 },
      { x: 595, y: 432 },
      { x: 698, y: 328 },
      { x: 652, y: 262 },
      { x: 465, y: 232 },
      { x: 338, y: 244 },
      { x: 175, y: 365 },
      { x: 245, y: 445 },
    ],
  }),
];

const CUPS = [
  { id: "trophyCup", name: "Trophy Cup", icon: "Trophy Cup", tracks: TRACKS.slice(0, 4) },
  { id: "constructorCup", name: "Constructor Cup", icon: "Constructor Cup", tracks: TRACKS.slice(4, 8) },
];



const state = {
  selectedDriver: 0,
  selectedKart: 0,
  selectedCup: 0,
  activeCupIndex: 0,
  phase: "garage",
  raceIndex: 0,
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
  viewMode: "driver",
  cameraHeading: 0,
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

function findClosestSurfaceOnSegments(point, segments, defaultWidth, isShortcut) {
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

  segments.forEach((segment, segmentIndex) => {
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
  });

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

function shouldUseShortcutRoute(racer, track, mainSurface, shortcutSurface, now) {
  const entryWindow = Math.max(track.shortcut.width * 3.3, 110);
  const exitWindow = Math.max(track.shortcut.width * 2.6, 80);
  const nearEntry = distance(racer, track.shortcut.entry) < entryWindow;
  const nearExit = distance(racer, track.shortcut.exit) < exitWindow;
  const shortcutAlong = track.shortcutTotalLength
    ? getRouteDistanceForPoint(racer, track.shortcutSegments, track.shortcutCumulativeStarts)
    : 0;

  if (racer.shortcutActive) {
    if (nearExit && mainSurface.onRoad && shortcutAlong > track.shortcutTotalLength * 0.58) {
      return false;
    }
    if (shortcutAlong > track.shortcutTotalLength * 0.84 && mainSurface.distance <= mainSurface.segmentWidth * 1.02) {
      return false;
    }
    if (!shortcutSurface.onRoad && mainSurface.onRoad && shortcutAlong > track.shortcutTotalLength * 0.18) {
      return false;
    }
    return shortcutSurface.distance <= shortcutSurface.segmentWidth * 1.06 || !mainSurface.onRoad;
  }

  const allowedToTake = racer.isPlayer || racer.aiUseShortcut || racer.boostUntil > now || racer.starUntil > now || racer.bulletUntil > now;
  return allowedToTake
    && nearEntry
    && shortcutSurface.onRoad
    && shortcutSurface.distance <= mainSurface.distance + 12;
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
    if (forward < -16 || forward > 72 || Math.abs(side) > 34) return;

    const forwardWeight = 1 - clamp((forward + 16) / 88, 0, 1);
    const sideWeight = 1 - clamp(Math.abs(side) / 34, 0, 1);
    const pressure = forwardWeight * sideWeight;
    const steerAway = side >= 0 ? -1 : 1;
    steerAdjust += steerAway * pressure * (racer.isPlayer ? 0.34 : 0.72);

    if (forward > -4) {
      throttleScale = Math.min(throttleScale, racer.isPlayer ? 0.88 : 0.68 - pressure * 0.18);
      brakeBoost = Math.max(brakeBoost, racer.isPlayer ? pressure * 0.08 : pressure * 0.42);
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
    inkUntil: 0,
    driftCharge: 0,
    drifting: false,
    driftSide: 0,
    aiOffset: (Math.random() - 0.5) * 32,
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
  ui.startCup.textContent = `Enter ${selectedCup.icon} ${selectedCup.name}`;
  renderDriverButtons();
  renderKartButtons();
  renderCupButtons();
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
        <strong>${cup.icon} ${cup.name}</strong>
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

function renderCupButtons() {
  ui.cupGrid.innerHTML = CUPS.map((cup, index) => `
    <button class="${index === state.selectedCup ? "active" : ""}" data-cup-index="${index}" type="button">
      ${cup.icon} ${cup.name}
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
  const first = track.points[0];
  const heading = track.startHeading;
  const side = heading + Math.PI / 2;
  const rowSpacing = 24;
  const laneSpacing = Math.min(26, track.roadWidth * 0.34);
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 2);
    const lane = index % 2 === 0 ? -1 : 1;
    const distanceBehindStart = row * rowSpacing + 10;
    return {
      x: first.x - Math.cos(heading) * distanceBehindStart + Math.cos(side) * lane * laneSpacing,
      y: first.y - Math.sin(heading) * distanceBehindStart + Math.sin(side) * lane * laneSpacing,
      heading,
      trackDistance: (track.totalLength - distanceBehindStart + track.totalLength) % track.totalLength,
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
  state.activeCupIndex = state.selectedCup;
  state.raceIndex = 0;
  buildCupEntries();
  state.feed = [];
  addFeed(`Lights out soon. ${getActiveCup().name} grid is forming.`);
  enterFullscreenMode();
  startRace(0);
}

function startRace(index) {
  const activeCup = getActiveCup();
  state.phase = "countdown";
  state.track = activeCup.tracks[index];
  state.items = [];
  state.hazards = [];
  state.particles = [];
  state.cameraHeading = state.track.startHeading;
  state.resultsQueued = false;
  state.resultTimeoutAt = 0;
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
    ui.countdownBanner.textContent = digits[step];
    ui.countdownBanner.classList.remove("hidden");
  } else {
    ui.countdownBanner.classList.add("hidden");
    state.phase = "race";
    state.raceStart = now;
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

function maybeUseAiItem(racer, now) {
  if (racer.isPlayer || racer.currentItem === "none" || racer.itemCooldownUntil > now || racer.spinUntil > now) return;
  const sorted = getSortedRacers();
  const place = sorted.findIndex((entry) => entry.id === racer.id) + 1;
  const shouldUse = Math.random() < 0.008 + place * 0.0007;
  if (shouldUse) {
    useItem(racer, racer.currentItem, now);
  }
}

function useItem(racer, item, now) {
  if (!item || item === "none") return;
  racer.currentItem = "none";
  racer.itemCooldownUntil = now + 900;
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
  racer.spinUntil = Math.max(racer.spinUntil, now + duration);
  racer.speed *= 0.45;
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
  const crossingBand = Math.max(36, state.track.totalLength * 0.12);
  const crossedForward = previousDistance > state.track.totalLength - crossingBand
    && currentDistance < crossingBand
    && racer.speed > 18;

  racer.trackDistance = currentDistance;

  if (!crossedForward) return;
  if (!racer.startedRaceLap) {
    racer.startedRaceLap = true;
    return;
  }

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
  const targetAngle = Math.atan2(nextPoint.y - racer.y, nextPoint.x - racer.x);
  const surface = getActiveSurfaceInfo(racer, state.track, now);
  const offroad = !surface.onRoad;

  let throttle = 0;
  let brake = 0;
  let reverse = 0;
  let steerInput = 0;
  let drifting = false;
  let driftSide = 0;

  if (racer.isPlayer) {
    const driveHeld = input.drift;
    const wantsForward = driveHeld && input.throttle;
    const wantsBack = driveHeld && input.brake && !wantsForward;
    throttle = wantsForward ? 1 : 0;
    if (wantsBack) {
      if (racer.speed > 18) {
        brake = 1;
      } else {
        reverse = 1;
      }
    }
    steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    drifting = driveHeld && wantsForward && Math.abs(steerInput) > 0 && racer.speed > 70;
    driftSide = steerInput;
  } else {
    const angleDiff = normalizeAngle(targetAngle - racer.heading);
    throttle = 1;
    steerInput = clamp(angleDiff * 1.7, -1, 1);
    const turnSeverity = Math.abs(angleDiff);
    if (turnSeverity > 0.52 && racer.speed > racer.physics.maxSpeed * 0.62) {
      brake = 1;
    }
    const nearShortcut = distance(racer, state.track.shortcut.entry) < 90;
    if (nearShortcut && (racer.currentItem === "mushroom" || racer.starUntil > now || racer.boostUntil > now)) {
      racer.aiUseShortcut = true;
    }
    if (racer.aiUseShortcut && distance(racer, state.track.shortcut.exit) < 60) {
      racer.aiUseShortcut = false;
    }
    if (racer.aiUseShortcut) {
      const entryTarget = distance(racer, state.track.shortcut.entry) > 32 ? state.track.shortcut.entry : state.track.shortcut.exit;
      steerInput = clamp(normalizeAngle(Math.atan2(entryTarget.y - racer.y, entryTarget.x - racer.x) - racer.heading) * 1.9, -1, 1);
    }
    drifting = Math.abs(angleDiff) > 0.48 && racer.speed > 80 && Math.random() < 0.78;
    driftSide = steerInput;
    maybeUseAiItem(racer, now);
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
  const reverseTargetSpeed = -racer.physics.maxSpeed;
  if (offroad) targetSpeed *= racer.physics.offroadFactor;
  if (racer.boostUntil > now) targetSpeed *= 1.22;
  if (racer.starUntil > now) targetSpeed *= 1.1;
  if (racer.bulletUntil > now) targetSpeed = racer.physics.maxSpeed * 1.42;
  if (racer.shrinkUntil > now) targetSpeed *= 0.76;

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
    if (racer.speed > 0) {
      racer.speed = Math.max(0, racer.speed - racer.physics.accelRate * 0.45 * dt);
    } else {
      racer.speed = Math.min(0, racer.speed + racer.physics.accelRate * 0.45 * dt);
    }
  }

  if (brake > 0) {
    if (racer.speed > 0) {
      racer.speed = Math.max(0, racer.speed - racer.physics.brakeRate * brake * dt);
    } else {
      racer.speed = Math.min(0, racer.speed + racer.physics.brakeRate * 0.6 * brake * dt);
    }
  }

  racer.speed *= offroad ? racer.physics.driftGrip : 0.992;

  if (drifting) {
    racer.drifting = true;
    racer.driftSide = driftSide >= 0 ? 1 : -1;
    racer.driftCharge += racer.physics.driftChargeRate * dt;
    racer.heading += racer.driftSide * 0.8 * dt;
  } else if (racer.drifting) {
    if (racer.driftCharge > 1.6) {
      racer.boostUntil = Math.max(racer.boostUntil, now + 1400);
    } else if (racer.driftCharge > 0.9) {
      racer.boostUntil = Math.max(racer.boostUntil, now + 850);
    }
    racer.drifting = false;
    racer.driftCharge = 0;
  }

  racer.x += Math.cos(racer.heading) * racer.speed * dt;
  racer.y += Math.sin(racer.heading) * racer.speed * dt;

  racer.x = clamp(racer.x, 24, canvas.width - 24);
  racer.y = clamp(racer.y, 24, canvas.height - 24);

  let barrierSurface = getActiveSurfaceInfo(racer, state.track, now);
  applyTrackBarrier(racer, barrierSurface);
  barrierSurface = getActiveSurfaceInfo(racer, state.track, now);
  alignRacerToSurface(racer, barrierSurface, racer.isPlayer ? 0.28 : 0.22, 0.84);
  updateLapProgress(racer, now);

  if (distance(racer, nextPoint) < 34) {
    racer.waypointIndex = (racer.waypointIndex + 1) % state.track.points.length;
    racer.passedWaypoints += 1;
  }

  state.track.itemBoxes.forEach((box) => {
    if (distance(racer, box) < 18) {
      startRoulette(racer);
    }
  });
}

function finishRacer(racer, now) {
  if (racer.finished) return;
  racer.finished = true;
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

    return item.x > -40 && item.x < canvas.width + 40 && item.y > -40 && item.y < canvas.height + 40;
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
      const minDistance = 24;
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
        const staggerPush = clamp(overlap * 0.95 + 3.5, 3, 10);
        const lateralBias = clamp(overlap * 0.3, 0.8, 3.2);

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

        if (a.starUntil > now || a.bulletUntil > now) spinRacer(b, 700);
        if (b.starUntil > now || b.bulletUntil > now) spinRacer(a, 700);

        a.x = clamp(a.x, 24, canvas.width - 24);
        a.y = clamp(a.y, 24, canvas.height - 24);
        b.x = clamp(b.x, 24, canvas.width - 24);
        b.y = clamp(b.y, 24, canvas.height - 24);

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

function updateRace(dt, now) {
  state.racers.forEach((racer) => updateRacer(racer, dt, now));
  updateItems(dt, now);
  updateHazards(now);
  handleRacerContacts(now);
  handleRacerContacts(now);
  updateStandingsUI();
  updatePlayerUI();

  const player = getPlayer();
  const everyoneFinished = state.racers.every((racer) => racer.finished);
  if (player && player.finished && !state.resultTimeoutAt && !everyoneFinished) {
    state.resultTimeoutAt = now + 4500;
    addFeed("Chequered flag out, positions being confirmed.");
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

function finalizeRace() {
  const finishers = [...state.racers].sort((a, b) => a.finishPosition - b.finishPosition);
  finishers.forEach((racer, index) => {
    const entry = state.cupEntries.find((cupEntry) => cupEntry.driver.id === racer.driver.id);
    if (entry) entry.points += POINTS_TABLE[index] || 0;
  });
  state.cupEntries.sort((a, b) => b.points - a.points || a.driver.name.localeCompare(b.driver.name));
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
  ui.resultsKicker.textContent = `Race ${state.raceIndex + 1} Results`;
  ui.resultsTitle.textContent = `${state.track.name} Complete`;
  ui.resultsTable.innerHTML = `
    <div class="results-header">
      <span>Place</span>
      <span>Driver</span>
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
          <span>${racePoints}</span>
          <span>${cupEntry ? cupEntry.points : racePoints}</span>
        </div>
      `;
    }).join("")}
  `;
  ui.resultsButton.textContent = state.raceIndex === activeCup.tracks.length - 1 ? "Show Podium" : "Next Race";
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
  state.phase = "garage";
  state.raceIndex = 0;
  state.track = getSelectedCup().tracks[0];
  state.cupEntries = [];
  state.racers = [];
  state.items = [];
  state.hazards = [];
  state.cameraHeading = 0;
  ui.resultsModal.classList.add("hidden");
  ui.podiumModal.classList.add("hidden");
  syncOverlayState();
  addFeed("Back in the pit lane.");
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
  segments.forEach((segment, index) => {
    const hit = closestPointOnSegment(point, segment);
    if (hit.distance < bestDistance) {
      bestDistance = hit.distance;
      bestRouteDistance = cumulativeStarts[index] + segment.length * hit.t;
    }
  });
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
  const lookaheadDistance = clamp(136 + Math.abs(player.speed) * 1.1, 136, 320);
  const futureSurface = sampleRouteSurfaceAtDistance(route, baseDistance + lookaheadDistance);
  const futureAngle = getSurfaceForwardAngle(futureSurface, currentAngle);
  const chosenAngle = lerpAngle(currentAngle, futureAngle, 0.62);
  state.cameraHeading = state.cameraHeading
    ? lerpAngle(state.cameraHeading, chosenAngle, 0.28)
    : chosenAngle;
  return state.cameraHeading;
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
  const samples = [];
  for (let i = 0; i < 44; i += 1) {
    const ahead = 8 + i * 16 + i * i * 0.62;
    const sample = sampleRouteSurfaceAtDistance(route, baseDistance + ahead);
    const centerProjection = projectDriverView(player, cameraHeading, sample.point);
    if (centerProjection.forward < 10) continue;
    const depth = clamp(centerProjection.forward / 980, 0, 1);
    const perspective = lerp(3.9, 0.22, Math.pow(depth, 0.84));
    const shoulderWidth = sample.width + 10;
    const leftRoadPoint = {
      x: sample.point.x - sample.normalX * sample.width,
      y: sample.point.y - sample.normalY * sample.width,
    };
    const rightRoadPoint = {
      x: sample.point.x + sample.normalX * sample.width,
      y: sample.point.y + sample.normalY * sample.width,
    };
    const leftShoulderPoint = {
      x: sample.point.x - sample.normalX * shoulderWidth,
      y: sample.point.y - sample.normalY * shoulderWidth,
    };
    const rightShoulderPoint = {
      x: sample.point.x + sample.normalX * shoulderWidth,
      y: sample.point.y + sample.normalY * shoulderWidth,
    };
    const centerX = canvas.width / 2 + centerProjection.side * perspective;
    const leftRoadX = canvas.width / 2 + projectDriverView(player, cameraHeading, leftRoadPoint).side * perspective;
    const rightRoadX = canvas.width / 2 + projectDriverView(player, cameraHeading, rightRoadPoint).side * perspective;
    const leftShoulderX = canvas.width / 2 + projectDriverView(player, cameraHeading, leftShoulderPoint).side * perspective;
    const rightShoulderX = canvas.width / 2 + projectDriverView(player, cameraHeading, rightShoulderPoint).side * perspective;
    const y = canvas.height - 42 - Math.pow(depth, 0.8) * 432;
    samples.push({
      centerX,
      leftRoadX,
      rightRoadX,
      leftShoulderX,
      rightShoulderX,
      y,
      laneHalf: Math.max(2, (rightRoadX - leftRoadX) * 0.055),
      depth,
    });
  }
  return samples;
}

function drawDriverView(track) {
  const player = getPlayer();
  if (!player) {
    drawGarageScene();
    return;
  }
  let cameraHeading = getCameraHeading(player, track);
  let samples = buildDriverRoadSamples(track, player, cameraHeading);
  const roadCollapsed = samples.length < 2
    || samples.every((sample) => sample.rightShoulderX < -60 || sample.leftShoulderX > canvas.width + 60);
  if (roadCollapsed) {
    const fallbackRoute = getCameraRoute(player, track);
    cameraHeading = getSurfaceForwardAngle(fallbackRoute.currentSurface, player.heading);
    state.cameraHeading = cameraHeading;
    samples = buildDriverRoadSamples(track, player, cameraHeading);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = track.bg.sky;
  ctx.fillRect(0, 0, canvas.width, 194);
  drawParallaxHorizon(track);
  ctx.fillStyle = "#d7d0ea";
  ctx.fillRect(0, 154, canvas.width, 4);
  ctx.fillStyle = track.bg.grass;
  ctx.fillRect(0, 158, canvas.width, canvas.height - 158);

  drawDriverSceneDecor(track, player, cameraHeading);
  drawDriverRoad(samples, track);
  drawDriverItemBoxesInScene(track, player, cameraHeading);
  drawDriverOpponents(player, track, cameraHeading);
  drawDriverItemBadge(player);
  drawCockpit(player);
  drawDriverItemsInScene(player, cameraHeading);
  drawMiniMap(track, player, { x: canvas.width - 292, y: 18, width: 268, height: 144 });
  drawDriverHud(track, player);
  drawPlayerEffects();
}

function drawDriverItemBadge(player) {
  const rouletteActive = player.rouletteUntil > performance.now();
  const hasItem = player.currentItem && player.currentItem !== "none";
  if (!rouletteActive && !hasItem) return;

  const itemKey = rouletteActive ? "roulette" : player.currentItem;
  const itemLabel = rouletteActive ? "Roulette" : labelizeItem(player.currentItem);
  const icon = ITEM_ICONS[itemKey] || "?";
  const panelX = 28;
  const panelY = canvas.height - 146;
  const panelWidth = 186;
  const panelHeight = 84;

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

function drawParallaxHorizon(track) {
  ctx.fillStyle = track.bg.sun || "#ffe08a";
  ctx.beginPath();
  ctx.arc(canvas.width - 172, 72, 34, 0, TAU);
  ctx.fill();

  ctx.fillStyle = track.bg.horizonB || "rgba(0, 0, 0, 0.18)";
  ctx.beginPath();
  ctx.moveTo(0, 164);
  ctx.lineTo(0, 118);
  ctx.lineTo(90, 136);
  ctx.lineTo(186, 110);
  ctx.lineTo(302, 136);
  ctx.lineTo(412, 104);
  ctx.lineTo(538, 142);
  ctx.lineTo(660, 108);
  ctx.lineTo(788, 138);
  ctx.lineTo(920, 102);
  ctx.lineTo(1024, 140);
  ctx.lineTo(1024, 164);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = track.bg.horizonA || "rgba(0, 0, 0, 0.26)";
  for (let i = 0; i < 11; i += 1) {
    const x = i * 96 + (i % 2) * 12;
    const w = 52 + (i % 3) * 22;
    const h = 24 + ((i + 1) % 4) * 18;
    ctx.fillRect(x, 164 - h, w, h);
  }
}

function drawDriverRoad(samples, track) {
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const far = samples[index + 1];
    const near = samples[index];
    const stripeColor = index % 2 === 0 ? "#d8cfeb" : "#c7bbdd";
    const curbColor = index % 2 === 0 ? (track.bg.curbA || "#ff5f57") : (track.bg.curbB || "#fff0c9");
    const barrierColor = index % 2 === 0 ? "#fff0c9" : "#2b1d34";
    drawQuad(
      near.leftShoulderX,
      near.y,
      near.rightShoulderX,
      near.y,
      far.rightShoulderX,
      far.y,
      far.leftShoulderX,
      far.y,
      stripeColor,
    );
    drawQuad(
      near.leftRoadX,
      near.y,
      near.rightRoadX,
      near.y,
      far.rightRoadX,
      far.y,
      far.leftRoadX,
      far.y,
      "#575766",
    );
    drawQuad(
      near.leftShoulderX,
      near.y,
      near.leftRoadX,
      near.y,
      far.leftRoadX,
      far.y,
      far.leftShoulderX,
      far.y,
      curbColor,
    );
    drawQuad(
      near.rightRoadX,
      near.y,
      near.rightShoulderX,
      near.y,
      far.rightShoulderX,
      far.y,
      far.rightRoadX,
      far.y,
      curbColor,
    );
    drawQuad(
      near.leftShoulderX - 7,
      near.y,
      near.leftShoulderX + 2,
      near.y,
      far.leftShoulderX + 2,
      far.y,
      far.leftShoulderX - 7,
      far.y,
      barrierColor,
    );
    drawQuad(
      near.rightShoulderX - 2,
      near.y,
      near.rightShoulderX + 7,
      near.y,
      far.rightShoulderX + 7,
      far.y,
      far.rightShoulderX - 2,
      far.y,
      barrierColor,
    );
    drawQuad(
      near.centerX - near.laneHalf,
      near.y,
      near.centerX + near.laneHalf,
      near.y,
      far.centerX + far.laneHalf,
      far.y,
      far.centerX - far.laneHalf,
      far.y,
      index % 2 === 0 ? "#fff0c9" : "#575766",
    );
  }
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

function drawDriverSceneDecor(track, player, cameraHeading) {
  const decorSprites = track.decor.map((decor) => {
    const worldPoint = { x: decor.x, y: decor.y };
    const projected = projectDriverView(player, cameraHeading, worldPoint);
    if (projected.forward < 20 || projected.forward > 560) return null;
    const depth = clamp(projected.forward / 560, 0, 1);
    const x = canvas.width / 2 + projected.side * lerp(3.2, 0.28, depth);
    const y = canvas.height - 68 - Math.pow(depth, 0.82) * 342;
    const size = lerp(68, 10, depth);
    return { decor, x, y, size, depth };
  }).filter(Boolean).sort((a, b) => b.depth - a.depth);

  decorSprites.forEach(({ decor, x, y, size }) => {
    if (decor.type === "tree" || decor.type === "cactus") {
      ctx.fillStyle = "#3f6a34";
      ctx.fillRect(x - size * 0.12, y - size * 0.2, size * 0.24, size * 0.8);
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.5, y - size * 0.9, size, size * 0.7);
    } else if (decor.type === "grandstand") {
      ctx.fillStyle = "#2b2331";
      ctx.fillRect(x - size * 0.7, y - size * 0.36, size * 1.4, size * 0.52);
      ctx.fillStyle = decor.color;
      for (let row = 0; row < 3; row += 1) {
        ctx.fillRect(x - size * 0.58, y - size * (0.28 + row * 0.1), size * 1.16, size * 0.06);
      }
      ctx.fillStyle = "#fff0c9";
      for (let dot = 0; dot < 6; dot += 1) {
        ctx.fillRect(x - size * 0.48 + dot * size * 0.18, y - size * 0.22, size * 0.06, size * 0.06);
      }
    } else if (decor.type === "house" || decor.type === "tower") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.5, y - size * 0.9, size, size * 0.9);
      ctx.fillStyle = "#ffe8ad";
      ctx.fillRect(x - size * 0.12, y - size * 0.4, size * 0.24, size * 0.2);
    } else if (decor.type === "billboard" || decor.type === "lamp") {
      ctx.fillStyle = "#5e4331";
      ctx.fillRect(x - size * 0.06, y - size * 0.12, size * 0.12, size * 0.72);
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.34, y - size * 0.76, size * 0.68, size * 0.28);
    } else if (decor.type === "ghost") {
      ctx.fillStyle = decor.color;
      ctx.fillRect(x - size * 0.28, y - size * 0.72, size * 0.56, size * 0.48);
      ctx.fillRect(x - size * 0.22, y - size * 0.24, size * 0.44, size * 0.18);
    } else {
      ctx.fillStyle = decor.color || "#c46631";
      ctx.fillRect(x - size * 0.48, y - size * 0.7, size * 0.96, size * 0.5);
    }
  });
}

function drawDriverOpponents(player, track, cameraHeading) {
  const visible = state.racers
    .filter((racer) => racer.id !== player.id && !racer.finished)
    .map((racer) => {
      const projected = projectDriverView(player, cameraHeading, racer);
      return { racer, ...projected };
    })
    .filter((entry) => entry.forward > -40 && entry.forward < 500 && Math.abs(entry.side) < 280)
    .sort((a, b) => b.forward - a.forward);

  visible.forEach(({ racer, forward, side }) => {
    const depth = clamp((forward + 40) / 540, 0, 1);
    const x = canvas.width / 2 + side * lerp(3.3, 0.25, depth);
    const y = canvas.height - 72 - Math.pow(depth, 0.82) * 336;
    const scale = clamp(lerp(1.7, 0.26, depth), 0.25, 2);
    drawKart(ctx, x, y, 0, racer.kart, racer.driver, scale);
  });
}

function drawCockpit(player) {
  const team = getTeamForDriver(player.driver);
  const cx = canvas.width / 2;
  const ch = canvas.height;
  // Front wing
  ctx.fillStyle = team.body;
  ctx.fillRect(cx - 170, ch - 52, 340, 28);
  ctx.fillStyle = team.trim;
  ctx.fillRect(cx - 170, ch - 58, 340, 8);
  // Nosecone
  ctx.fillStyle = team.body;
  ctx.fillRect(cx - 60, ch - 80, 120, 36);
  // Halo bar
  ctx.fillStyle = team.body;
  ctx.fillRect(cx - 6, ch - 110, 12, 64);
  // Dashboard
  ctx.fillStyle = "#0a0a18";
  ctx.fillRect(cx - 100, ch - 88, 200, 46);
  ctx.strokeStyle = team.trim;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 100, ch - 88, 200, 46);
  // Steering wheel
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, ch - 58, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#222";
  ctx.fillRect(cx - 14, ch - 62, 28, 8);
  ctx.fillRect(cx - 4, ch - 68, 8, 20);
}

function drawDriverItemsInScene(player, cameraHeading) {
  state.items.forEach((item) => {
    const projected = projectDriverView(player, cameraHeading, item);
    if (projected.forward < 10 || projected.forward > 360 || Math.abs(projected.side) > 200) return;
    const depth = clamp(projected.forward / 360, 0, 1);
    const x = canvas.width / 2 + projected.side * lerp(3.5, 0.32, depth);
    const y = canvas.height - 70 - Math.pow(depth, 0.82) * 310;
    const scale = lerp(1.2, 0.24, depth);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = item.type === "undercut" ? "#dc0000" : item.type === "stewardPenalty" ? "#0090ff" : "#00d2be";
    ctx.fillRect(-10, -8, 20, 16);
    ctx.restore();
  });
}

function drawDriverItemBoxesInScene(track, player, cameraHeading) {
  track.itemBoxes.forEach((box) => {
    const projected = projectDriverView(player, cameraHeading, box);
    if (projected.forward < 18 || projected.forward > 420 || Math.abs(projected.side) > 220) return;
    const depth = clamp(projected.forward / 420, 0, 1);
    const x = canvas.width / 2 + projected.side * lerp(3.4, 0.3, depth);
    const y = canvas.height - 72 - Math.pow(depth, 0.82) * 324;
    const scale = lerp(1.5, 0.22, depth);
    const pulse = 1 + Math.sin((performance.now() / 180) + box.x * 0.01 + box.y * 0.01) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(performance.now() / 700);
    ctx.scale(scale * pulse, scale * pulse);
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

function drawMiniMap(track, player, frame) {
  const mapPadding = Math.max(track.roadWidth + 18, track.shortcut.width + 18);
  const allPoints = [
    ...track.points.flatMap((point) => ([
      { x: point.x - mapPadding, y: point.y - mapPadding },
      { x: point.x + mapPadding, y: point.y + mapPadding },
    ])),
    ...track.shortcut.points.flatMap((point) => ([
      { x: point.x - mapPadding, y: point.y - mapPadding },
      { x: point.x + mapPadding, y: point.y + mapPadding },
    ])),
  ];
  const bounds = allPoints.reduce((memo, point) => ({
    minX: Math.min(memo.minX, point.x),
    maxX: Math.max(memo.maxX, point.x),
    minY: Math.min(memo.minY, point.y),
    maxY: Math.max(memo.maxY, point.y),
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  });
  const innerPadding = 14;
  const mapWidth = frame.width - innerPadding * 2;
  const mapHeight = frame.height - innerPadding * 2;
  const scale = Math.min(
    mapWidth / Math.max(1, bounds.maxX - bounds.minX),
    mapHeight / Math.max(1, bounds.maxY - bounds.minY),
  );
  const drawnWidth = Math.max(1, bounds.maxX - bounds.minX) * scale;
  const drawnHeight = Math.max(1, bounds.maxY - bounds.minY) * scale;
  const offsetX = frame.x + innerPadding + (mapWidth - drawnWidth) / 2;
  const offsetY = frame.y + innerPadding + (mapHeight - drawnHeight) / 2;
  const toMini = (point) => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: offsetY + (point.y - bounds.minY) * scale,
  });
  const miniWidth = (worldWidth) => Math.max(1.5, worldWidth * scale);

  ctx.fillStyle = "rgba(18, 10, 21, 0.78)";
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  ctx.strokeStyle = "rgba(255, 240, 201, 0.24)";
  ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 14px Trebuchet MS";
  ctx.fillText("Mini Map", frame.x + 12, frame.y + 16);

  const drawPath = (points, width, color, closed) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const first = toMini(points[0]);
    ctx.moveTo(first.x, first.y);
    points.slice(1).forEach((point) => {
      const mini = toMini(point);
      ctx.lineTo(mini.x, mini.y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  const drawMiniRibbon = (points, width, fill, stroke, closed) => {
    drawPath(points, miniWidth(width) * 2, stroke, closed);
    drawPath(points, miniWidth(width) * 1.78, fill, closed);
  };

  const drawMiniTrackBarriers = (points, color, closed) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, scale * 3);
    ctx.setLineDash([Math.max(4, scale * 10), Math.max(3, scale * 9)]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const first = toMini(points[0]);
    ctx.moveTo(first.x, first.y);
    points.slice(1).forEach((point) => {
      const mini = toMini(point);
      ctx.lineTo(mini.x, mini.y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  const drawMiniLane = (points, color, closed, width = Math.max(1.2, scale * 4), dash = [Math.max(6, scale * 18), Math.max(4, scale * 12)]) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.lineCap = "round";
    ctx.beginPath();
    const first = toMini(points[0]);
    ctx.moveTo(first.x, first.y);
    points.slice(1).forEach((point) => {
      const mini = toMini(point);
      ctx.lineTo(mini.x, mini.y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  const drawMiniStartLine = () => {
    const a = toMini(track.points[0]);
    const angle = track.startHeading + Math.PI / 2;
    const width = Math.max(8, miniWidth(track.roadWidth + 12));
    const cell = Math.max(2, scale * 10);
    const tilesAcross = Math.max(4, Math.ceil((width * 2) / cell / 2));
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);
    for (let i = -tilesAcross; i <= tilesAcross; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        ctx.fillStyle = (i + j) % 2 === 0 ? "#fff0c9" : "#1f1826";
        ctx.fillRect(i * cell, -width + j * cell, cell, cell);
      }
    }
    ctx.restore();
  };

  drawMiniRibbon(track.shortcut.points, track.shortcut.width + 11, "#efe3c8", "#f8eed8", false);
  drawMiniRibbon(track.shortcut.points, track.shortcut.width + 4, track.shortcut.color || "#b6854f", track.shortcut.color || "#b6854f", false);
  drawMiniLane(track.shortcut.points, "#fff4cf", false, Math.max(1.1, scale * 3), [Math.max(5, scale * 14), Math.max(3, scale * 9)]);
  drawMiniRibbon(track.points, track.roadWidth + 12, track.bg.shoulder, track.bg.shoulder, true);
  drawMiniRibbon(track.points, track.roadWidth, track.bg.road, track.bg.road, true);
  drawMiniTrackBarriers(track.points, "rgba(255, 240, 201, 0.92)", true);
  drawMiniLane(track.points, "#fff0c9", true);
  drawMiniStartLine();
  const entryMini = toMini(track.shortcut.entry);
  const exitMini = toMini(track.shortcut.exit);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(entryMini.x - 3, entryMini.y - 3, 6, 6);
  ctx.fillStyle = "#86efac";
  ctx.fillRect(exitMini.x - 3, exitMini.y - 3, 6, 6);

  state.racers.forEach((racer) => {
    const mini = toMini(racer);
    drawMiniKartIcon(
      mini.x,
      mini.y,
      racer.heading,
      racer.id === player?.id ? "#12284c" : racer.driver.color,
      racer.id === player?.id ? "#fff0c9" : "#20152c",
    );
  });
}

function drawMiniKartIcon(x, y, heading, bodyColor, outlineColor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = outlineColor;
  ctx.fillRect(-5, -4, 10, 8);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-4, -3, 8, 6);
  ctx.fillStyle = outlineColor;
  ctx.fillRect(2, -2, 3, 4);
  ctx.fillRect(-2, -5, 2, 2);
  ctx.fillRect(-2, 3, 2, 2);
  ctx.restore();
}

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

function drawDriverHud(track, player) {
  const sorted = getSortedRacers();
  const place = sorted.findIndex((racer) => racer.id === player.id) + 1;
  const lapText = `Lap ${getDisplayedLap(player, track)} / ${track.laps}`;
  const placeStyle = getPlaceStyle(place);

  ctx.fillStyle = "rgba(18, 10, 21, 0.78)";
  ctx.fillRect(20, 18, 178, 70);
  ctx.strokeStyle = "rgba(255, 240, 201, 0.22)";
  ctx.strokeRect(20, 18, 178, 70);
  ctx.fillStyle = "#fff0c9";
  ctx.font = "bold 18px Georgia";
  ctx.fillText(track.name, 32, 44);
  ctx.font = "bold 16px Trebuchet MS";
  ctx.fillText(lapText, 32, 69);

  ctx.fillStyle = placeStyle.fill;
  ctx.fillRect(canvas.width - 146, 170, 118, 52);
  ctx.strokeStyle = placeStyle.stroke;
  ctx.strokeRect(canvas.width - 146, 170, 118, 52);
  ctx.fillStyle = placeStyle.text;
  ctx.font = "bold 28px Georgia";
  ctx.fillText(placeStyle.label, canvas.width - 118, 204);
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

function drawShortcutMapRoad(track) {
  drawRoadRibbon(track.shortcut.points, track.shortcut.width + 11, "#efe3c8", "#f8eed8", false);
  drawRoadRibbon(track.shortcut.points, track.shortcut.width + 4, track.shortcut.color || "#b6854f", track.shortcut.color || "#b6854f", false);
  drawOpenLaneStripe(track.shortcut.points, "#fff4cf", 3, [14, 9]);
  drawOpenLaneStripe(track.shortcut.points, "rgba(43, 29, 52, 0.88)", 1, [14, 9]);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(track.shortcut.entry.x - 6, track.shortcut.entry.y - 6, 12, 12);
  ctx.fillStyle = "#86efac";
  ctx.fillRect(track.shortcut.exit.x - 6, track.shortcut.exit.y - 6, 12, 12);
}

function drawStartLine(track) {
  const a = track.points[0];
  const angle = track.startHeading + Math.PI / 2;
  const width = track.roadWidth + 12;
  const cell = 10;
  const tilesAcross = Math.max(4, Math.ceil((width * 2) / cell / 2));
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(angle);
  for (let i = -tilesAcross; i <= tilesAcross; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? "#fff0c9" : "#1f1826";
      ctx.fillRect(i * cell, -width + j * cell, cell, cell);
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
    ctx.fillRect(0, 0, canvas.width, 24);
    ctx.fillRect(0, 0, 34, 184);
    ctx.fillRect(canvas.width - 34, 0, 34, 184);
    [[92, 46, 88, 22], [canvas.width - 184, 42, 96, 24], [canvas.width / 2 - 44, 28, 88, 18]].forEach(([x, y, w, h]) => {
      ctx.fillRect(x, y, w, h);
    });
    ctx.restore();
  }
}

function update(now) {
  const dt = clamp((now - (state.lastTimestamp || now)) / 1000, 0, 0.033);
  state.lastTimestamp = now;

  if (state.phase === "countdown") {
    updateCountdown(now);
  } else if (state.phase === "race") {
    updateRace(dt, now);
  }

  if (state.phase !== "garage") {
    drawTrack(state.track);
  } else {
    drawGarageScene();
  }

  requestAnimationFrame(update);
}

function drawGarageScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#080812";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Carbon grid background
  ctx.fillStyle = "#0e0e1e";
  for (let y = 0; y < canvas.height; y += 32) {
    ctx.fillRect(0, y, canvas.width, 16);
  }
  const driver = DRIVERS[state.selectedDriver];
  const team = getTeamForDriver(driver);
  // Team color stripe
  ctx.fillStyle = team.body;
  ctx.fillRect(0, 0, 8, canvas.height);
  ctx.fillStyle = team.trim;
  ctx.fillRect(8, 0, 4, canvas.height);
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
  ui.canvasShell.addEventListener("dblclick", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateViewControls);
  document.addEventListener("webkitfullscreenchange", updateViewControls);

  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") input.throttle = true;
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") input.brake = true;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = true;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = true;
    if (event.key === "Shift") input.drift = true;
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

renderGarage();
updateViewControls();
syncOverlayState();
bindEvents();
requestAnimationFrame(update);
