// Game data shared by the landing page and the game: teams, drivers,
// difficulties, circuits, cups and power-ups. Plain data and one lookup.
// A classic script (these become page globals); require()-able in Node for
// the tests.

const TEAMS = [
  { id: "redBull", short: "Red Bull", name: "Red Bull Racing", car: "RB21", style: "Deep navy with red and yellow.", body: "#1e41b2", trim: "#e8bf00", stats: { speed: 0.06, acceleration: 0.01, handling: 0.02, weight: 0.04, traction: 0.03, drift: 0.01 } },
  { id: "ferrari", short: "Ferrari", name: "Scuderia Ferrari", car: "SF-25", style: "Iconic Scuderia red with yellow accents.", body: "#dc0000", trim: "#ffed00", stats: { speed: 0.04, acceleration: 0.03, handling: 0.04, weight: 0.01, traction: 0.02, drift: 0.03 } },
  { id: "mclaren", short: "McLaren", name: "McLaren F1 Team", car: "MCL39", style: "Papaya orange with electric blue trim.", body: "#ff8000", trim: "#0093cc", stats: { speed: 0.05, acceleration: 0.04, handling: 0.03, weight: -0.01, traction: 0.03, drift: 0.02 } },
  { id: "mercedes", short: "Mercedes", name: "Mercedes-AMG F1", car: "W16", style: "Silver arrows with teal highlights.", body: "#00d2be", trim: "#c0c0c0", stats: { speed: 0.02, acceleration: 0.03, handling: 0.03, weight: 0.01, traction: 0.02, drift: 0.01 } },
  { id: "astonMartin", short: "Aston Martin", name: "Aston Martin F1", car: "AMR25", style: "British racing green with lime.", body: "#006f62", trim: "#cedc00", stats: { speed: -0.01, acceleration: -0.01, handling: 0.02, weight: 0.02, traction: 0.02, drift: 0.01 } },
  { id: "alpine", short: "Alpine", name: "Alpine F1 Team", car: "A525", style: "French blue fading to pink.", body: "#0090ff", trim: "#ff87bc", stats: { speed: -0.02, acceleration: -0.01, handling: 0.01, weight: -0.01, traction: -0.01, drift: 0 } },
  { id: "williams", short: "Williams", name: "Williams Racing", car: "FW47", style: "Royal blue and white livery.", body: "#005aff", trim: "#ffffff", stats: { speed: -0.03, acceleration: -0.01, handling: -0.01, weight: -0.01, traction: -0.01, drift: -0.01 } },
  { id: "haas", short: "Haas", name: "Haas F1 Team", car: "VF-25", style: "White and red with black accents.", body: "#e8002d", trim: "#ffffff", stats: { speed: -0.03, acceleration: -0.02, handling: -0.01, weight: 0, traction: -0.01, drift: -0.01 } },
  { id: "racingBulls", short: "Racing Bulls", name: "Racing Bulls", car: "VCARB 02", style: "White with blue and red accents.", body: "#6692ff", trim: "#ffffff", stats: { speed: -0.02, acceleration: 0.01, handling: 0.01, weight: -0.01, traction: 0, drift: 0 } },
  { id: "sauber", short: "Sauber", name: "Sauber F1 Team", car: "C45", style: "Black with neon green accents.", body: "#2a2a2a", trim: "#39ff14", stats: { speed: -0.04, acceleration: -0.02, handling: -0.01, weight: -0.01, traction: -0.01, drift: -0.01 } },
];

function getTeamForDriver(driver) {
  return TEAMS.find((t) => t.id === driver.teamId) || TEAMS[0];
}

// Each driver's helmet (docs/superpowers/specs/2026-09-29-helmets-design.md):
// original art in their signature colours -- no logos, no sponsor marks.
const DRIVERS = [
  { id: "verstappen", name: "Max Verstappen", code: "VER", number: 1, teamId: "redBull", title: "Four-Time Champion", color: "#1e41b2", accent: "#e8bf00", stats: { speed: 0.96, acceleration: 0.80, handling: 0.88, weight: 0.70, traction: 0.86, drift: 0.82 }, helmet: { base: "#0f1a3c", crown: "#ff6a13", stripe: "#e10600", visor: "#10141c", motif: "flash" } },
  { id: "lawson", name: "Liam Lawson", code: "LAW", number: 30, teamId: "redBull", title: "Rising Kiwi", color: "#1e41b2", accent: "#ffffff", stats: { speed: 0.80, acceleration: 0.78, handling: 0.78, weight: 0.62, traction: 0.76, drift: 0.75 }, helmet: { base: "#111111", crown: "#ffffff", stripe: "#1e41b2", visor: "#10141c", motif: "crown" } },
  { id: "leclerc", name: "Charles Leclerc", code: "LEC", number: 16, teamId: "ferrari", title: "Monaco Maestro", color: "#dc0000", accent: "#ffed00", stats: { speed: 0.90, acceleration: 0.84, handling: 0.88, weight: 0.62, traction: 0.82, drift: 0.87 }, helmet: { base: "#ffffff", crown: "#d40000", stripe: "#0b1e4d", visor: "#10141c", motif: "band" } },
  { id: "hamilton", name: "Lewis Hamilton", code: "HAM", number: 44, teamId: "ferrari", title: "Seven-Time Legend", color: "#dc0000", accent: "#ffffff", stats: { speed: 0.92, acceleration: 0.82, handling: 0.90, weight: 0.65, traction: 0.84, drift: 0.88 }, helmet: { base: "#ffd400", crown: "#d40000", stripe: "#111111", visor: "#3a2a0a", motif: "crown" } },
  { id: "norris", name: "Lando Norris", code: "NOR", number: 4, teamId: "mclaren", title: "Speed and Flair", color: "#ff8000", accent: "#0093cc", stats: { speed: 0.88, acceleration: 0.86, handling: 0.87, weight: 0.58, traction: 0.84, drift: 0.84 }, helmet: { base: "#e4ff1a", crown: "#1c1c1c", stripe: "#00a3e0", visor: "#1b3a5c", motif: "flash" } },
  { id: "piastri", name: "Oscar Piastri", code: "PIA", number: 81, teamId: "mclaren", title: "Clinical Contender", color: "#ff8000", accent: "#ffffff", stats: { speed: 0.86, acceleration: 0.84, handling: 0.84, weight: 0.56, traction: 0.82, drift: 0.81 }, helmet: { base: "#ff8000", crown: "#0b1e4d", stripe: "#ffffff", visor: "#10141c", motif: "band" } },
  { id: "russell", name: "George Russell", code: "RUS", number: 63, teamId: "mercedes", title: "Mr. Saturday", color: "#00d2be", accent: "#c0c0c0", stats: { speed: 0.86, acceleration: 0.82, handling: 0.85, weight: 0.62, traction: 0.83, drift: 0.82 }, helmet: { base: "#111111", crown: "#00c5b5", stripe: "#ffffff", visor: "#10141c", motif: "split" } },
  { id: "antonelli", name: "Kimi Antonelli", code: "ANT", number: 12, teamId: "mercedes", title: "Next Gen Talent", color: "#00d2be", accent: "#ffffff", stats: { speed: 0.80, acceleration: 0.84, handling: 0.82, weight: 0.54, traction: 0.79, drift: 0.80 }, helmet: { base: "#ffffff", crown: "#009246", stripe: "#ce2b37", visor: "#10141c", motif: "tricolore" } },
  { id: "alonso", name: "Fernando Alonso", code: "ALO", number: 14, teamId: "astonMartin", title: "Grandmaster Racer", color: "#006f62", accent: "#cedc00", stats: { speed: 0.84, acceleration: 0.80, handling: 0.92, weight: 0.64, traction: 0.87, drift: 0.90 }, helmet: { base: "#1a3a8f", crown: "#ffd100", stripe: "#d40000", visor: "#10141c", motif: "flash" } },
  { id: "stroll", name: "Lance Stroll", code: "STR", number: 18, teamId: "astonMartin", title: "Consistent Charger", color: "#006f62", accent: "#ffffff", stats: { speed: 0.76, acceleration: 0.74, handling: 0.76, weight: 0.62, traction: 0.76, drift: 0.73 }, helmet: { base: "#ffffff", crown: "#111111", stripe: "#d40000", visor: "#10141c", motif: "crown" } },
  { id: "gasly", name: "Pierre Gasly", code: "GAS", number: 10, teamId: "alpine", title: "French Fighter", color: "#0090ff", accent: "#ff87bc", stats: { speed: 0.78, acceleration: 0.80, handling: 0.80, weight: 0.60, traction: 0.78, drift: 0.79 }, helmet: { base: "#ffffff", crown: "#3fa9f5", stripe: "#0f2a6b", visor: "#10141c", motif: "split" } },
  { id: "doohan", name: "Jack Doohan", code: "DOO", number: 7, teamId: "alpine", title: "Alpine Debutant", color: "#0090ff", accent: "#ffffff", stats: { speed: 0.74, acceleration: 0.78, handling: 0.76, weight: 0.58, traction: 0.74, drift: 0.75 }, helmet: { base: "#ffd100", crown: "#0a3d91", stripe: "#ffffff", visor: "#10141c", motif: "band" } },
  { id: "albon", name: "Alex Albon", code: "ALB", number: 23, teamId: "williams", title: "Williams Spearhead", color: "#005aff", accent: "#ffffff", stats: { speed: 0.76, acceleration: 0.78, handling: 0.79, weight: 0.62, traction: 0.77, drift: 0.77 }, helmet: { base: "#1d4ed8", crown: "#ffffff", stripe: "#e10600", visor: "#10141c", motif: "crown" } },
  { id: "sainz", name: "Carlos Sainz", code: "SAI", number: 55, teamId: "williams", title: "Smooth Operator", color: "#005aff", accent: "#ff0000", stats: { speed: 0.84, acceleration: 0.80, handling: 0.84, weight: 0.64, traction: 0.81, drift: 0.82 }, helmet: { base: "#d40000", crown: "#ffd100", stripe: "#0b1e4d", visor: "#10141c", motif: "flash" } },
  { id: "bearman", name: "Oliver Bearman", code: "BEA", number: 87, teamId: "haas", title: "Haas Headliner", color: "#e8002d", accent: "#ffffff", stats: { speed: 0.74, acceleration: 0.75, handling: 0.76, weight: 0.58, traction: 0.73, drift: 0.74 }, helmet: { base: "#111111", crown: "#ffd400", stripe: "#ffffff", visor: "#10141c", motif: "band" } },
  { id: "ocon", name: "Esteban Ocon", code: "OCO", number: 31, teamId: "haas", title: "Gritty Veteran", color: "#e8002d", accent: "#888888", stats: { speed: 0.76, acceleration: 0.76, handling: 0.78, weight: 0.60, traction: 0.75, drift: 0.76 }, helmet: { base: "#e10600", crown: "#ffffff", stripe: "#0f2a6b", visor: "#10141c", motif: "tricolore" } },
  { id: "tsunoda", name: "Yuki Tsunoda", code: "TSU", number: 22, teamId: "racingBulls", title: "Rapid Racer", color: "#6692ff", accent: "#ffffff", stats: { speed: 0.77, acceleration: 0.81, handling: 0.80, weight: 0.54, traction: 0.77, drift: 0.82 }, helmet: { base: "#111111", crown: "#e10600", stripe: "#ffffff", visor: "#10141c", motif: "split" } },
  { id: "hadjar", name: "Isack Hadjar", code: "HAD", number: 6, teamId: "racingBulls", title: "F2 Runner-up", color: "#6692ff", accent: "#ff0000", stats: { speed: 0.75, acceleration: 0.80, handling: 0.78, weight: 0.56, traction: 0.75, drift: 0.78 }, helmet: { base: "#5ab4ff", crown: "#ffffff", stripe: "#0f2a6b", visor: "#10141c", motif: "band" } },
  { id: "hulkenberg", name: "Nico Hülkenberg", code: "HUL", number: 27, teamId: "sauber", title: "The Hulk Returns", color: "#39ff14", accent: "#000000", stats: { speed: 0.76, acceleration: 0.77, handling: 0.78, weight: 0.64, traction: 0.76, drift: 0.75 }, helmet: { base: "#ffffff", crown: "#ffcc00", stripe: "#111111", visor: "#10141c", motif: "flash" } },
  { id: "bortoleto", name: "Gabriel Bortoleto", code: "BOR", number: 5, teamId: "sauber", title: "F2 Champion", color: "#39ff14", accent: "#ffffff", stats: { speed: 0.72, acceleration: 0.78, handling: 0.76, weight: 0.55, traction: 0.73, drift: 0.76 }, helmet: { base: "#009c3b", crown: "#ffdf00", stripe: "#002776", visor: "#10141c", motif: "crown" } },
];

// Each driver's face, for the podium, where they stand bareheaded
// (docs/superpowers/specs/2026-10-01-driver-faces-design.md): skin, hair and
// beard, eyes, MakeHuman's ethnic blend, and the face's shape sliders
// (faces.js), worked out from public photos of each driver in 2025, used as
// reference only.
const LOOKS = {
  // Dark blond hair cropped short and pushed up at the front, a light stubble;
  // blue eyes; a broad face with a strong, wide jaw.
  verstappen: { skin: "#dcae93", hair: { style: "crop", color: "#5e4632" }, facialHair: "stubble", beardColor: "#6a4e38", brow: "#5a4330", eyes: "#5d7fa3", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_width: 0.36, jaw_width: 0.63, face_length: -0.18, cheek_volume: 0.27, chin_prominent: 0.27, nose_width: 0.27, nose_length: -0.18, eye_size: -0.27, eye_open: -0.18, brow_height: -0.27, lips_volume: -0.27, head_age: -0.18, neck_width: 0.4 } },
  // Light brown hair, textured with a fringe; clean shaven; a young face.
  lawson: { skin: "#e0b298", hair: { style: "textured", color: "#5c4231" }, facialHair: "none", beardColor: "#5c4231", brow: "#4f3a2b", eyes: "#6b7f8c", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.7, face_length: 0.09, jaw_width: 0.27, nose_length: 0.18, nose_tip: 0.18, eye_size: 0.18, cheek_volume: 0.18, mouth_width: 0.18, neck_width: 0.3 } },
  // Dark brown hair swept up and back; clean shaven; green eyes; a long,
  // lean face, a defined jaw, a long straight nose, thick straight brows set
  // low, ears that stand out a little.
  leclerc: { skin: "#d39f82", hair: { style: "swept", color: "#2b1d14" }, facialHair: "none", beardColor: "#2b1d14", brow: "#4a3424", eyes: "#6b8a5a", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.3, head_width: -0.15, jaw_width: 0.45, chin_width: 0.15, chin_prominent: 0.15, cheekbones: 0.5, cheek_volume: -0.4, head_fat: -0.4, nose_length: 0.3, nose_width: -0.05, nose_depth: 0.2, nose_tip: -0.1, brow_height: -0.45, brow_forward: 0.45, eye_size: 0.45, eye_open: 0.1, eye_angle: -0.35, mouth_width: 0.4, mouth_corners: 0.15, lips_volume: -0.1, ear_out: 0.45, neck_width: 0.4 } },
  // Braids tied back into a bun; a moustache joined to a short beard on the
  // chin and along the jaw; high cheekbones, a broad nose, full lips.
  hamilton: { skin: "#8a6046", hair: { style: "braids", color: "#1a1410" }, facialHair: "moustache", beardColor: "#221a15", brow: "#1c1410", eyes: "#3b2416", heritage: { african: 0.6, asian: 0, caucasian: 0.4 },
    shape: { face_length: 0.36, head_width: -0.18, cheekbones: 0.6, cheek_volume: -0.54, jaw_width: 0.27, chin_prominent: 0.18, head_fat: -0.36, nose_width: 0.45, nose_flare: 0.3, nose_length: -0.18, nose_tip: 0.18, nose_depth: -0.18, lips_volume: 0.4, mouth_width: 0.18, eye_open: -0.18, eye_angle: 0.18, brow_height: -0.18, brow_forward: 0.36, head_age: 0.45, neck_width: 0.1 } },
  // Wavy brown hair, curly on top; a light stubble; a round, open face.
  norris: { skin: "#dfb196", hair: { style: "curly", color: "#4e3727" }, facialHair: "stubble", beardColor: "#5a4030", brow: "#4a3426", eyes: "#6e5a42", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_width: 0.18, face_length: -0.18, cheek_volume: 0.36, head_round: 0.54, nose_length: -0.27, nose_tip: 0.36, eye_size: 0.18, mouth_width: 0.45, lips_volume: 0.18, jaw_width: 0.09, head_age: -0.54, neck_width: 0.3 } },
  // Dark brown hair with a fringe brushed to the side; clean shaven; a long,
  // narrow face.
  piastri: { skin: "#ddb093", hair: { style: "textured", color: "#2e2119" }, facialHair: "none", beardColor: "#2e2119", brow: "#33261c", eyes: "#5a4632", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.54, head_width: -0.45, cheek_volume: -0.36, jaw_width: 0.18, chin_width: -0.18, nose_length: 0.36, nose_width: -0.18, eye_size: -0.09, eye_angle: -0.18, mouth_width: -0.09, head_age: -0.54, neck_width: 0.3 } },
  // Brown hair neatly swept up; clean shaven; a tall face, a strong chin.
  russell: { skin: "#dfb59b", hair: { style: "swept", color: "#4a3424" }, facialHair: "none", beardColor: "#4a3424", brow: "#45322a", eyes: "#5f7d97", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.63, jaw_width: 0.36, chin_prominent: 0.63, chin_height: 0.27, nose_length: 0.27, nose_depth: 0.18, cheek_volume: -0.18, eye_size: -0.09, brow_height: 0.18, mouth_width: 0.18, neck_width: 0.3 } },
  // Thick dark hair with a fringe; clean shaven; a young, rounder face.
  antonelli: { skin: "#d9a989", hair: { style: "textured", color: "#24180f" }, facialHair: "none", beardColor: "#24180f", brow: "#2a1d14", eyes: "#4a3524", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.7, cheek_volume: 0.45, head_round: 0.36, face_length: -0.09, nose_length: 0.18, nose_width: 0.18, eye_size: 0.27, lips_volume: 0.27, jaw_width: -0.18, neck_width: 0.2 } },
  // Dark hair cropped short, a dark stubble; a strong, curved nose,
  // deep-set eyes under heavy brows, an older face.
  alonso: { skin: "#c99877", hair: { style: "crop", color: "#2a221d" }, facialHair: "stubble", beardColor: "#33291f", brow: "#221a14", eyes: "#3e2a1c", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: 0.7, nose_hump: 0.7, nose_length: 0.63, nose_depth: 0.63, nose_tip: -0.36, brow_forward: 0.7, brow_height: -0.45, eye_size: -0.36, eye_open: -0.27, cheek_volume: -0.45, cheekbones: 0.36, jaw_width: 0.36, face_length: 0.18, lips_volume: -0.27, neck_width: 0.4 } },
  // Dark hair swept up at the front; a light stubble; a long face.
  stroll: { skin: "#dcac8f", hair: { style: "swept", color: "#33251b" }, facialHair: "stubble", beardColor: "#3a2a1e", brow: "#30231a", eyes: "#4c3a2a", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.45, head_width: -0.18, nose_length: 0.45, nose_depth: 0.27, jaw_width: 0.18, eye_size: -0.18, eye_angle: -0.27, cheek_volume: -0.18, mouth_width: 0.09, neck_width: 0.3 } },
  // Dark hair swept back, a trimmed beard; olive skin, high cheekbones.
  gasly: { skin: "#cf9f80", hair: { style: "long_back", color: "#2a1e16" }, facialHair: "full_beard", beardColor: "#33251b", brow: "#271b13", eyes: "#4a3424", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { cheekbones: 0.54, jaw_width: 0.36, face_length: 0.18, cheek_volume: -0.27, nose_length: 0.18, eye_size: -0.09, brow_height: -0.27, brow_forward: 0.27, neck_width: 0.4 } },
  // Light brown hair cropped short; clean shaven; a young, open face.
  doohan: { skin: "#e3b89e", hair: { style: "crop", color: "#7a5a3e" }, facialHair: "none", beardColor: "#7a5a3e", brow: "#6a4e36", eyes: "#5f86a6", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.7, cheek_volume: 0.27, jaw_width: 0.27, face_length: 0.09, nose_width: 0.09, eye_size: 0.09, mouth_width: 0.27, neck_width: 0.3 } },
  // Black hair, textured with a fringe; clean shaven; dark eyes, a softly
  // rounded face.
  albon: { skin: "#d6a684", hair: { style: "textured", color: "#18120e" }, facialHair: "none", beardColor: "#18120e", brow: "#1d1611", eyes: "#3a2618", heritage: { african: 0, asian: 0.5, caucasian: 0.5 },
    shape: { cheek_volume: 0.27, head_width: 0.09, nose_width: 0.18, nose_hump: -0.36, eye_size: -0.18, mouth_width: 0.27, jaw_width: 0.18, neck_width: 0.3 } },
  // Dark brown hair, a short beard; olive skin, a broad jaw.
  sainz: { skin: "#cc9b7b", hair: { style: "swept", color: "#2a1d15" }, facialHair: "short_beard", beardColor: "#3b2a1f", brow: "#251a12", eyes: "#4a3424", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { jaw_width: 0.54, head_width: 0.18, chin_width: 0.27, nose_length: 0.27, nose_width: 0.18, brow_forward: 0.36, brow_height: -0.36, eye_size: -0.18, cheek_volume: -0.09, neck_width: 0.4 } },
  // Dark blond hair, textured, a fringe; clean shaven; a young, round face.
  bearman: { skin: "#e2b59a", hair: { style: "textured", color: "#6b5038" }, facialHair: "none", beardColor: "#6b5038", brow: "#5c4430", eyes: "#6a7f8a", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.7, cheek_volume: 0.54, head_round: 0.45, face_length: -0.18, nose_length: -0.09, nose_tip: 0.27, eye_size: 0.18, lips_volume: 0.18, jaw_width: 0.09, neck_width: 0.2 } },
  // Very short dark hair, a dark stubble; a long face and a long chin.
  ocon: { skin: "#d2a283", hair: { style: "buzz", color: "#1e1612" }, facialHair: "stubble", beardColor: "#241a14", brow: "#211812", eyes: "#45301f", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.63, chin_height: 0.15, chin_prominent: 0.36, head_width: -0.27, nose_length: 0.36, nose_width: 0.18, eye_size: -0.09, cheek_volume: -0.36, cheekbones: 0.27, ear_out: 0.36, neck_width: 0.4 } },
  // Black hair, textured on top; clean shaven; dark eyes, a broad, round face.
  tsunoda: { skin: "#dcae8a", hair: { style: "textured", color: "#15100c" }, facialHair: "none", beardColor: "#15100c", brow: "#1a140f", eyes: "#2e2016", heritage: { african: 0, asian: 1, caucasian: 0 },
    shape: { head_width: 0.18, cheek_volume: 0.36, face_length: -0.27, nose_width: 0.18, eye_size: -0.18, mouth_width: 0.18, jaw_width: 0.18, head_age: -0.36, neck_width: 0.3 } },
  // Dark curls on top, a light stubble; olive skin; a young face.
  hadjar: { skin: "#c99a7a", hair: { style: "curly", color: "#1c140f" }, facialHair: "stubble", beardColor: "#211812", brow: "#1d1510", eyes: "#3e2a1c", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.7, face_length: 0.18, nose_length: 0.36, nose_width: 0.18, nose_depth: 0.27, lips_volume: 0.27, eye_size: 0.09, cheek_volume: 0.09, jaw_width: 0.09, neck_width: 0.3 } },
  // Dark blond hair swept to the side, a short beard; blue eyes; a tall,
  // long face.
  hulkenberg: { skin: "#e0b39a", hair: { style: "swept", color: "#6a5038" }, facialHair: "short_beard", beardColor: "#6e533a", brow: "#5c4632", eyes: "#5d86a8", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.63, chin_prominent: 0.45, head_age: 0.63, head_width: -0.09, jaw_width: 0.36, nose_length: 0.36, eye_size: -0.18, brow_height: -0.18, cheek_volume: -0.27, neck_width: 0.4 } },
  // Dark brown hair, textured and wavy on top; clean shaven; a young face.
  bortoleto: { skin: "#d4a385", hair: { style: "curly", color: "#2a1e16" }, facialHair: "none", beardColor: "#2a1e16", brow: "#2a1e16", eyes: "#4a3424", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.7, face_length: 0.09, cheek_volume: 0.18, nose_length: 0.18, nose_width: 0.18, eye_size: 0.09, mouth_width: 0.18, jaw_width: 0.09, neck_width: 0.3 } },
};
DRIVERS.forEach((d) => { d.look = LOOKS[d.id]; });

// Difficulty changes how well the AI drives, not what its cars are made of.
// On Pro the rivals run exactly the player's physics (aiPace 1); Legend adds a 5% pace edge.
// Rookie is the only setting that hands out a machinery handicap.
const DIFFICULTIES = [
  {
    id: "rookie", name: "Rookie",
    aiPace: 0.90,      // the only speed handicap in the game
    cornerMargin: 0.7, // takes corners well inside what the car can do (racecraft.js)
    lineNoise: 36,     // wanders off the ideal line
    mistakeRate: 0.5,  // errors per second
    catchUp: 0.12,
    lookBase: 52, lookSpeed: 0.34,   // barely looks past the next corner
  },
  {
    id: "pro", name: "Pro",
    aiPace: 1.0, cornerMargin: 0.85, lineNoise: 20, mistakeRate: 0.16, catchUp: 0.05,
    lookBase: 76, lookSpeed: 0.52,
  },
  {
    // The only setting where rivals are quicker than you rather than just
    // better drivers: a 5% pace edge, a near-perfect line and corners taken
    // nearest the limit (racecraft.js). Measured by simulated laps
    // (tools/checks/grid-check.js): 5-7% quicker than Pro, and Pro 10-12%
    // quicker than Rookie.
    id: "legend", name: "Legend",
    aiPace: 1.05, cornerMargin: 0.93, lineNoise: 5, mistakeRate: 0.015, catchUp: 0,
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
