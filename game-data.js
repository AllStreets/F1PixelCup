// Game data shared by the landing page and the game: teams, drivers,
// difficulties, circuits, cups and power-ups. Plain data and one lookup.
// A classic script (these become page globals); require()-able in Node for
// the tests.

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
  { id: "verstappen", name: "Max Verstappen", code: "VER", number: 1, teamId: "redBull", title: "Four-Time Champion", color: "#1e41b2", accent: "#e8bf00", stats: { speed: 0.96, acceleration: 0.80, handling: 0.88, weight: 0.70, traction: 0.86, drift: 0.82 } },
  { id: "lawson", name: "Liam Lawson", code: "LAW", number: 30, teamId: "redBull", title: "Rising Kiwi", color: "#1e41b2", accent: "#ffffff", stats: { speed: 0.80, acceleration: 0.78, handling: 0.78, weight: 0.62, traction: 0.76, drift: 0.75 } },
  { id: "leclerc", name: "Charles Leclerc", code: "LEC", number: 16, teamId: "ferrari", title: "Monaco Maestro", color: "#dc0000", accent: "#ffed00", stats: { speed: 0.90, acceleration: 0.84, handling: 0.88, weight: 0.62, traction: 0.82, drift: 0.87 } },
  { id: "hamilton", name: "Lewis Hamilton", code: "HAM", number: 44, teamId: "ferrari", title: "Seven-Time Legend", color: "#dc0000", accent: "#ffffff", stats: { speed: 0.92, acceleration: 0.82, handling: 0.90, weight: 0.65, traction: 0.84, drift: 0.88 } },
  { id: "norris", name: "Lando Norris", code: "NOR", number: 4, teamId: "mclaren", title: "Speed and Flair", color: "#ff8000", accent: "#0093cc", stats: { speed: 0.88, acceleration: 0.86, handling: 0.87, weight: 0.58, traction: 0.84, drift: 0.84 } },
  { id: "piastri", name: "Oscar Piastri", code: "PIA", number: 81, teamId: "mclaren", title: "Clinical Rookie", color: "#ff8000", accent: "#ffffff", stats: { speed: 0.86, acceleration: 0.84, handling: 0.84, weight: 0.56, traction: 0.82, drift: 0.81 } },
  { id: "russell", name: "George Russell", code: "RUS", number: 63, teamId: "mercedes", title: "Mr. Saturday", color: "#00d2be", accent: "#c0c0c0", stats: { speed: 0.86, acceleration: 0.82, handling: 0.85, weight: 0.62, traction: 0.83, drift: 0.82 } },
  { id: "antonelli", name: "Kimi Antonelli", code: "ANT", number: 12, teamId: "mercedes", title: "Next Gen Talent", color: "#00d2be", accent: "#ffffff", stats: { speed: 0.80, acceleration: 0.84, handling: 0.82, weight: 0.54, traction: 0.79, drift: 0.80 } },
  { id: "alonso", name: "Fernando Alonso", code: "ALO", number: 14, teamId: "astonMartin", title: "Grandmaster Racer", color: "#006f62", accent: "#cedc00", stats: { speed: 0.84, acceleration: 0.80, handling: 0.92, weight: 0.64, traction: 0.87, drift: 0.90 } },
  { id: "stroll", name: "Lance Stroll", code: "STR", number: 18, teamId: "astonMartin", title: "Consistent Charger", color: "#006f62", accent: "#ffffff", stats: { speed: 0.76, acceleration: 0.74, handling: 0.76, weight: 0.62, traction: 0.76, drift: 0.73 } },
  { id: "gasly", name: "Pierre Gasly", code: "GAS", number: 10, teamId: "alpine", title: "French Fighter", color: "#0090ff", accent: "#ff87bc", stats: { speed: 0.78, acceleration: 0.80, handling: 0.80, weight: 0.60, traction: 0.78, drift: 0.79 } },
  { id: "doohan", name: "Jack Doohan", code: "DOO", number: 7, teamId: "alpine", title: "Alpine Debutant", color: "#0090ff", accent: "#ffffff", stats: { speed: 0.74, acceleration: 0.78, handling: 0.76, weight: 0.58, traction: 0.74, drift: 0.75 } },
  { id: "albon", name: "Alex Albon", code: "ALB", number: 23, teamId: "williams", title: "Smooth Operator", color: "#005aff", accent: "#ffffff", stats: { speed: 0.76, acceleration: 0.78, handling: 0.79, weight: 0.62, traction: 0.77, drift: 0.77 } },
  { id: "sainz", name: "Carlos Sainz", code: "SAI", number: 55, teamId: "williams", title: "Smooth Carlos", color: "#005aff", accent: "#ff0000", stats: { speed: 0.84, acceleration: 0.80, handling: 0.84, weight: 0.64, traction: 0.81, drift: 0.82 } },
  { id: "bearman", name: "Oliver Bearman", code: "BEA", number: 87, teamId: "haas", title: "Haas Headliner", color: "#e8002d", accent: "#ffffff", stats: { speed: 0.74, acceleration: 0.75, handling: 0.76, weight: 0.58, traction: 0.73, drift: 0.74 } },
  { id: "ocon", name: "Esteban Ocon", code: "OCO", number: 31, teamId: "haas", title: "Gritty Veteran", color: "#e8002d", accent: "#888888", stats: { speed: 0.76, acceleration: 0.76, handling: 0.78, weight: 0.60, traction: 0.75, drift: 0.76 } },
  { id: "tsunoda", name: "Yuki Tsunoda", code: "TSU", number: 22, teamId: "racingBulls", title: "Rapid Racer", color: "#6692ff", accent: "#ffffff", stats: { speed: 0.77, acceleration: 0.81, handling: 0.80, weight: 0.54, traction: 0.77, drift: 0.82 } },
  { id: "hadjar", name: "Isack Hadjar", code: "HAD", number: 6, teamId: "racingBulls", title: "F2 Champion", color: "#6692ff", accent: "#ff0000", stats: { speed: 0.75, acceleration: 0.80, handling: 0.78, weight: 0.56, traction: 0.75, drift: 0.78 } },
  { id: "hulkenberg", name: "Nico Hülkenberg", code: "HUL", number: 27, teamId: "sauber", title: "The Hulk Returns", color: "#39ff14", accent: "#000000", stats: { speed: 0.76, acceleration: 0.77, handling: 0.78, weight: 0.64, traction: 0.76, drift: 0.75 } },
  { id: "bortoleto", name: "Gabriel Bortoleto", code: "BOR", number: 5, teamId: "sauber", title: "F2 Champion", color: "#39ff14", accent: "#ffffff", stats: { speed: 0.72, acceleration: 0.78, handling: 0.76, weight: 0.55, traction: 0.73, drift: 0.76 } },
];

// Difficulty changes how well the AI drives, not what its cars are made of.
// On Pro the rivals run exactly the player's physics (aiPace 1); Legend adds a 5% pace edge.
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
    // better drivers: a 5% pace edge on top of a near-perfect racing line.
    // Tuned by simulated laps (tools/checks/grid-check.js): later braking and a
    // longer look ahead than Pro made Legend run wide and lose time, so it
    // keeps Pro's line and wins on pace and precision: measured 2.5-9.5% quicker
    // than Pro depending on the circuit (least at Monza, where corners, not
    // top speed, set the lap), and Pro is 7-15% quicker than Rookie.
    id: "legend", name: "Legend",
    aiPace: 1.05, brakeBias: 0.62, lineNoise: 5, mistakeRate: 0.015, catchUp: 0,
    lookBase: 76, lookSpeed: 0.52,
  },
];

// Circuits in cup order. lengthM is the real lap length in metres, from the
// bacinger/f1-circuits data the outlines come from.
const CIRCUITS = [
  { id: "monza", name: "Autodromo di Monza", country: "Italy", theme: "Italian speed temple", lengthM: 5793, laps: 5, roadWidth: 33, bg: { sky: "#87ceeb", grass: "#4a8c3f", accent: "#ffe08a", road: "#484850", shoulder: "#c8c0b0", horizonA: "#2a5a30", horizonB: "#5a9a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe08a" } },
  { id: "spa", name: "Circuit de Spa-Francorchamps", country: "Belgium", theme: "Belgian forest circuit", lengthM: 7004, laps: 5, roadWidth: 33, bg: { sky: "#6a8faf", grass: "#2d5a27", accent: "#c8d8e8", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1a3a1a", horizonB: "#3a6a35", curbA: "#dc0000", curbB: "#ffffff", sun: "#ddeeff" } },
  { id: "silverstone", name: "Silverstone Circuit", country: "Great Britain", theme: "British airfield classic", lengthM: 5891, laps: 5, roadWidth: 33, bg: { sky: "#aac8e0", grass: "#4c8840", accent: "#e8f0e0", road: "#505058", shoulder: "#c0b8a8", horizonA: "#304828", horizonB: "#5a7848", curbA: "#dc0000", curbB: "#ffffff", sun: "#d8e8f0" } },
  { id: "suzuka", name: "Suzuka International Racing Course", country: "Japan", theme: "Japanese technical masterpiece", lengthM: 5807, laps: 5, roadWidth: 33, bg: { sky: "#9fd0e8", grass: "#3a7a38", accent: "#ffeedd", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1e4a1e", horizonB: "#408040", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" } },
  { id: "monaco", name: "Circuit de Monaco", country: "Monaco", theme: "Street circuit showpiece", lengthM: 3337, laps: 5, roadWidth: 33, bg: { sky: "#4db8e8", grass: "#3a6a88", accent: "#ffeedd", road: "#505060", shoulder: "#c8c0b8", horizonA: "#184858", horizonB: "#3878a8", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" } },
  { id: "singapore", name: "Marina Bay Street Circuit", country: "Singapore", theme: "Night city circuit", lengthM: 4928, laps: 5, roadWidth: 33, bg: { sky: "#0a0a1e", grass: "#1a1a3a", accent: "#ffa500", road: "#3a3848", shoulder: "#545060", horizonA: "#0a0a28", horizonB: "#1a1a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ff8800" } },
  { id: "bahrain", name: "Bahrain International Circuit", country: "Bahrain", theme: "Desert twilight circuit", lengthM: 5412, laps: 5, roadWidth: 33, bg: { sky: "#cc8833", grass: "#8a6a3a", accent: "#ffe8aa", road: "#585050", shoulder: "#c8b888", horizonA: "#6a4820", horizonB: "#aa7838", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffcc44" } },
  { id: "interlagos", name: "Autódromo José Carlos Pace", country: "Brazil", theme: "Brazilian passion circuit", lengthM: 4309, laps: 5, roadWidth: 33, bg: { sky: "#5598cc", grass: "#3c7838", accent: "#ffe8aa", road: "#484850", shoulder: "#b0a898", horizonA: "#1e4820", horizonB: "#3a7838", curbA: "#009c3b", curbB: "#ffdf00", sun: "#ffdd44" } },
];

const CUP_DEFS = [
  { id: "trophyCup", name: "Trophy Cup", icon: "Trophy Cup", circuitIds: ["monza", "spa", "silverstone", "suzuka"] },
  { id: "constructorCup", name: "Constructor Cup", icon: "Constructor Cup", circuitIds: ["monaco", "singapore", "bahrain", "interlagos"] },
];

// The eight power-ups, common to rare (the same order as PowerUps.ITEM_ORDER).
// Each is an F1 idea with a Mario Kart counterpart. The site's cards and the
// game's HUD both read this copy, so it must say exactly what the game does.
const POWER_UPS = [
  { id: "oilSlick", name: "Oil Slick", counterpart: "Banana",
    effect: "Drops a slick behind you that spins whoever drives through it, you included. Trail it behind your car and it blocks one Undercut or Debris from behind.",
    controls: "Tap Space to drop it. Hold Space to trail it; let go to drop it." },
  { id: "debris", name: "Debris", counterpart: "Green shell",
    effect: "Fired straight ahead. It bounces off the edges of the track for six seconds and spins anyone it hits, you included.",
    controls: "Space to fire." },
  { id: "drs", name: "DRS", counterpart: "Mushroom",
    effect: "Opens your rear wing for a two-second boost, or three seconds if you use it on a straight.",
    controls: "Space to open the wing." },
  { id: "undercut", name: "Undercut", counterpart: "Red shell",
    effect: "Follows the track round the corners to the car ahead of you and spins it. A trailed Oil Slick stops it.",
    controls: "Space to fire." },
  { id: "overtakeMode", name: "Overtake Mode", counterpart: "Star",
    effect: "Five seconds faster and untouchable: shots, oil and contact can't spin you, and any car you touch spins.",
    controls: "Space to deploy." },
  { id: "stewardPenalty", name: "Steward Penalty", counterpart: "Blue shell",
    effect: "Flies over the field to the race leader and hands them a long spin, and anyone right beside them.",
    controls: "Space to call the stewards." },
  { id: "formationLap", name: "Formation Lap", counterpart: "Bullet Bill",
    effect: "Four seconds of autopilot at huge speed along the racing line, untouchable, spinning anyone in the way.",
    controls: "Space to engage." },
  { id: "safetyCar", name: "Safety Car", counterpart: "Lightning",
    effect: "A safety car comes out ahead of the leader for five seconds. Every rival is slowed to its pace and can't overtake. You aren't.",
    controls: "Space to deploy it." },
];

// Who drives in each promo shot on the site (tools/capture-shots.js takes the
// pictures; landing.js names them in the alt text): Leclerc first and Hamilton
// second, in the order the site shows them, then the rest of the grid.
const SHOT_DRIVERS = {
  hero: "leclerc",
  items: {
    oilSlick: "leclerc", debris: "hamilton", drs: "norris", undercut: "verstappen",
    overtakeMode: "piastri", stewardPenalty: "russell", formationLap: "alonso", safetyCar: "albon",
  },
  circuits: {
    monza: "leclerc", spa: "hamilton", silverstone: "norris", suzuka: "tsunoda",
    monaco: "verstappen", singapore: "russell", bahrain: "gasly", interlagos: "hulkenberg",
  },
};

if (typeof module === "object" && module.exports) {
  module.exports = { TEAMS, DRIVERS, DIFFICULTIES, CIRCUITS, CUP_DEFS, POWER_UPS, SHOT_DRIVERS, getTeamForDriver };
}
