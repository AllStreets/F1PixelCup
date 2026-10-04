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
  // blue eyes, small and a little hooded; a broad, square face with a wide,
  // strong jaw; thin lips; light, fairly straight brows.
  verstappen: { skin: "#dcae93", hair: { style: "crop", color: "#6a4f37", volume: 1.05 }, facialHair: "stubble", beardColor: "#6f5139", brow: "#6a5038", brows: { thickness: 0.85, arch: 0.1, tail: 0.3, gap: 0.5 }, eyes: "#5d7fa3", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_width: 0.35, jaw_width: 0.6, face_length: -0.15, chin_width: 0.3, cheek_volume: 0.25, head_square: 0.45, eye_size: -0.35, eye_open: -0.2, eye_spacing: -0.15, nose_width: 0.25, nose_length: -0.15, lips_volume: -0.35, brow_height: -0.2 } },
  // Light brown hair, textured and pushed up; clean shaven; a young, lean,
  // angular face, high cheekbones; thin, lightly arched brows.
  lawson: { skin: "#e0b298", hair: { style: "textured", color: "#5c4231", volume: 1.1 }, facialHair: "none", beardColor: "#5c4231", brow: "#58412f", brows: { thickness: 0.7, arch: 0.35, tail: 0.4, gap: 0.6 }, eyes: "#6b7f8c", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.6, face_length: 0.2, cheek_volume: -0.25, cheekbones: 0.35, jaw_width: 0.2, chin_prominent: 0.25, head_invertedtriangular: 0.4, nose_length: 0.15, nose_tip: 0.1, eye_size: 0.1, mouth_width: 0.1 } },
  // Dark brown hair swept up and back; clean shaven; green eyes, large,
  // their outer corners turned a little down; a long, lean face with a
  // defined jaw and high cheekbones; a long straight nose; a wide mouth;
  // thick, straight dark brows set low; ears that stand out a little.
  leclerc: { skin: "#d39f82", hair: { style: "swept", color: "#2b1d14", volume: 0.85 }, facialHair: "none", beardColor: "#2b1d14", brow: "#3e2b1e", brows: { thickness: 1.35, arch: 0.1, tail: 0.3, gap: 0.4 }, eyes: "#6b8a5a", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.45, head_width: -0.2, jaw_width: 0.55, chin_prominent: 0.25, cheekbones: 0.7, cheek_volume: -0.55, head_fat: -0.5, head_oval: 0.3, nose_length: 0.45, nose_hump: 0.25, nose_width: -0.15, nose_tip: -0.2, brow_height: -0.55, brow_forward: 0.45, eye_size: 0.55, eye_angle: -0.5, mouth_width: 0.3, lips_volume: -0.1, ear_out: 0.55 } },
  // Braids tied back into a bun; a close-trimmed moustache joined to a short
  // beard on the chin and along the jaw; high cheekbones, a broad nose, full
  // lips, almond eyes under thick, straight brows.
  hamilton: { skin: "#8a6046", hair: { style: "braids", color: "#1a1410", volume: 1 }, facialHair: "moustache", beardColor: "#2a211b", brow: "#1c1410", brows: { thickness: 1.15, arch: 0.2, tail: 0.4, gap: 0.45 }, eyes: "#3b2416", heritage: { african: 0.6, asian: 0, caucasian: 0.4 },
    shape: { face_length: 0.3, head_width: -0.15, cheekbones: 0.75, cheek_volume: -0.55, jaw_width: 0.35, chin_prominent: 0.25, head_fat: -0.4, head_diamond: 0.3, nose_width: 0.45, nose_flare: 0.35, nose_length: -0.1, nose_tip: 0.15, nose_depth: -0.1, lips_volume: 0.45, mouth_width: 0.2, eye_open: -0.25, eye_angle: 0.2, eye_size: -0.1, brow_height: -0.25, brow_forward: 0.35, head_age: 0.45 } },
  // Wavy brown hair, tousled; a light stubble; a round, open face, a small,
  // upturned nose and a wide smile; soft, arched brows.
  norris: { skin: "#dfb196", hair: { style: "messy", color: "#4e3727", volume: 1.2 }, facialHair: "stubble", beardColor: "#5a4030", brow: "#4a3426", brows: { thickness: 0.95, arch: 0.4, tail: 0.5, gap: 0.5 }, eyes: "#6e5a42", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_round: 0.5, head_width: 0.2, face_length: -0.25, cheek_volume: 0.45, jaw_width: -0.1, chin_prominent: -0.15, nose_length: -0.35, nose_tip: 0.45, nose_width: 0.1, mouth_width: 0.5, lips_volume: 0.2, eye_size: 0.2, head_age: -0.4 } },
  // Dark brown hair parted at the side, the fringe brushed across; clean
  // shaven; a long, narrow face and a narrow chin; deep-set eyes under
  // thick, straight brows.
  piastri: { skin: "#ddb093", hair: { style: "side_part", color: "#2e2119", volume: 0.95 }, facialHair: "none", beardColor: "#2e2119", brow: "#30231a", brows: { thickness: 1.25, arch: -0.1, tail: 0.2, gap: 0.45 }, eyes: "#5a4632", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.5, head_width: -0.4, chin_width: -0.35, cheek_volume: -0.35, jaw_width: 0.1, head_rectangular: 0.3, nose_length: 0.35, nose_width: -0.2, eye_size: -0.15, eye_angle: -0.25, brow_forward: 0.35, brow_height: -0.35, mouth_width: -0.15, lips_volume: -0.2, head_age: -0.4 } },
  // Brown hair neatly parted and swept up; clean shaven; a tall face and a
  // strong, long chin; blue eyes; brows arched and fairly fine.
  russell: { skin: "#dfb59b", hair: { style: "side_part", color: "#4a3424", volume: 1.25 }, facialHair: "none", beardColor: "#4a3424", brow: "#45322a", brows: { thickness: 0.85, arch: 0.45, tail: 0.5, gap: 0.55 }, eyes: "#5f7d97", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.55, jaw_width: 0.35, chin_prominent: 0.55, chin_height: 0.15, head_rectangular: 0.4, nose_length: 0.25, nose_depth: 0.2, cheek_volume: -0.2, eye_size: -0.1, brow_height: 0.2, mouth_width: 0.2, lips_volume: -0.2 } },
  // Thick dark hair with a fringe; clean shaven; a young, rounder face, big
  // brown eyes, thick dark brows.
  antonelli: { skin: "#d9a989", hair: { style: "fringe", color: "#24180f", volume: 1.25 }, facialHair: "none", beardColor: "#24180f", brow: "#2a1d14", brows: { thickness: 1.2, arch: 0.25, tail: 0.4, gap: 0.5 }, eyes: "#4a3524", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.85, cheek_volume: 0.4, head_round: 0.4, face_length: -0.15, nose_length: 0.15, nose_width: 0.2, nose_tip: 0.1, eye_size: 0.35, lips_volume: 0.3, jaw_width: -0.2, mouth_width: 0.1 } },
  // Short dark hair, greying; a dark stubble; a strong, curved nose,
  // deep-set eyes under heavy brows; thin lips; an older face.
  alonso: { skin: "#c99877", hair: { style: "crop", color: "#3b3530", volume: 0.9 }, facialHair: "stubble", beardColor: "#3d342d", brow: "#221a14", brows: { thickness: 1.4, arch: 0.1, tail: 0.55, gap: 0.35 }, eyes: "#3e2a1c", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: 0.85, nose_hump: 0.8, nose_length: 0.55, nose_depth: 0.5, nose_tip: -0.35, brow_forward: 0.65, brow_height: -0.45, eye_size: -0.35, eye_open: -0.3, cheek_volume: -0.4, cheekbones: 0.35, jaw_width: 0.3, face_length: 0.2, lips_volume: -0.35, mouth_width: 0.2 } },
  // Dark hair cropped and pushed up at the front; a light stubble; a long
  // face, a long nose, narrow eyes.
  stroll: { skin: "#dcac8f", hair: { style: "crop", color: "#33251b", volume: 1.35 }, facialHair: "stubble", beardColor: "#3a2a1e", brow: "#30231a", brows: { thickness: 1.0, arch: 0.15, tail: 0.35, gap: 0.5 }, eyes: "#4c3a2a", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.4, head_width: -0.15, nose_length: 0.45, nose_depth: 0.25, nose_width: 0.1, eye_size: -0.25, eye_angle: -0.3, cheek_volume: -0.2, jaw_width: 0.15, chin_prominent: 0.15, lips_volume: 0.1 } },
  // Dark hair swept back and longer, a trimmed beard; olive skin, high
  // cheekbones, deep-set eyes, thick brows.
  gasly: { skin: "#cf9f80", hair: { style: "long_back", color: "#2a1e16", volume: 1 }, facialHair: "full_beard", beardColor: "#33251b", brow: "#271b13", brows: { thickness: 1.2, arch: 0.2, tail: 0.4, gap: 0.45 }, eyes: "#4a3424", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { cheekbones: 0.55, jaw_width: 0.35, face_length: 0.15, cheek_volume: -0.3, head_diamond: 0.3, nose_length: 0.2, nose_hump: 0.2, eye_size: -0.15, brow_height: -0.3, brow_forward: 0.3 } },
  // Light brown hair cropped short; clean shaven; a young, open face, a
  // square jaw; blue eyes; light, fine brows.
  doohan: { skin: "#e3b89e", hair: { style: "crop", color: "#7a5a3e", volume: 0.85 }, facialHair: "none", beardColor: "#7a5a3e", brow: "#73563c", brows: { thickness: 0.75, arch: 0.2, tail: 0.4, gap: 0.55 }, eyes: "#5f86a6", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.65, jaw_width: 0.25, chin_width: 0.2, head_square: 0.3, face_length: 0.1, cheek_volume: 0.15, nose_width: 0.15, nose_length: -0.1, eye_size: 0.15, mouth_width: 0.25, lips_volume: 0.1 } },
  // Black hair, textured with a fringe; clean shaven; dark eyes; a softly
  // rounded face and a wide smile.
  albon: { skin: "#d6a684", hair: { style: "textured", color: "#18120e", volume: 1.05 }, facialHair: "none", beardColor: "#18120e", brow: "#1d1611", brows: { thickness: 1.0, arch: 0.05, tail: 0.35, gap: 0.5 }, eyes: "#3a2618", heritage: { african: 0, asian: 0.5, caucasian: 0.5 },
    shape: { cheek_volume: 0.3, head_width: 0.2, head_round: 0.3, face_length: -0.1, nose_width: 0.25, nose_hump: -0.3, nose_depth: -0.2, eye_size: -0.2, eye_angle: 0.1, mouth_width: 0.35, jaw_width: 0.15 } },
  // Dark brown hair swept back, a short beard; olive skin, a broad, square
  // jaw; heavy, straight brows.
  sainz: { skin: "#cc9b7b", hair: { style: "swept", color: "#2a1d15", volume: 1.3 }, facialHair: "short_beard", beardColor: "#3b2a1f", brow: "#251a12", brows: { thickness: 1.3, arch: 0.0, tail: 0.3, gap: 0.4 }, eyes: "#4a3424", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { jaw_width: 0.5, head_width: 0.2, chin_width: 0.3, head_square: 0.45, nose_length: 0.3, nose_width: 0.25, nose_depth: 0.2, brow_forward: 0.35, brow_height: -0.35, eye_size: -0.25, cheek_volume: -0.1, lips_volume: -0.1 } },
  // Dark blond hair, a fringe; clean shaven; a young, round face, a short,
  // upturned nose; light, arched brows.
  bearman: { skin: "#e2b59a", hair: { style: "fringe", color: "#6b5038", volume: 1.05 }, facialHair: "none", beardColor: "#6b5038", brow: "#5c4430", brows: { thickness: 0.8, arch: 0.35, tail: 0.45, gap: 0.55 }, eyes: "#6a7f8a", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.85, cheek_volume: 0.5, head_round: 0.5, face_length: -0.25, nose_length: -0.15, nose_tip: 0.3, eye_size: 0.2, lips_volume: 0.2, jaw_width: -0.1, chin_prominent: -0.2 } },
  // Very short dark hair, a dark stubble; a long, narrow face and a long
  // chin; ears that stand out.
  ocon: { skin: "#d2a283", hair: { style: "buzz", color: "#1e1612", volume: 1 }, facialHair: "stubble", beardColor: "#241a14", brow: "#211812", brows: { thickness: 1.0, arch: 0.2, tail: 0.4, gap: 0.5 }, eyes: "#45301f", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.45, chin_height: 0.15, chin_prominent: 0.35, head_width: -0.3, head_triangular: 0.3, nose_length: 0.3, nose_width: 0.15, eye_size: -0.1, cheek_volume: -0.35, cheekbones: 0.3, ear_out: 0.45 } },
  // Black hair, full and textured on top; clean shaven; dark eyes; a broad,
  // round face.
  tsunoda: { skin: "#dcae8a", hair: { style: "textured", color: "#15100c", volume: 1.35 }, facialHair: "none", beardColor: "#15100c", brow: "#1a140f", brows: { thickness: 0.95, arch: 0.15, tail: 0.4, gap: 0.55 }, eyes: "#2e2016", heritage: { african: 0, asian: 1, caucasian: 0 },
    shape: { head_width: 0.25, cheek_volume: 0.4, head_round: 0.4, face_length: -0.3, nose_width: 0.3, nose_depth: -0.2, eye_size: -0.25, mouth_width: 0.2, jaw_width: 0.2, head_age: -0.3 } },
  // Dark curls on top, a light stubble; olive skin; a young face, a long,
  // strong nose.
  hadjar: { skin: "#c99a7a", hair: { style: "curly", color: "#1c140f", volume: 1.3 }, facialHair: "stubble", beardColor: "#211812", brow: "#1d1510", brows: { thickness: 1.15, arch: 0.25, tail: 0.4, gap: 0.45 }, eyes: "#3e2a1c", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.7, face_length: 0.25, nose_length: 0.45, nose_hump: 0.3, nose_width: 0.15, nose_depth: 0.3, lips_volume: 0.25, cheek_volume: -0.1, eye_size: 0.1, jaw_width: -0.1 } },
  // Dark blond hair swept back, a short beard; blue eyes; a tall, long face
  // and a strong chin.
  hulkenberg: { skin: "#e0b39a", hair: { style: "swept", color: "#6a5038", volume: 0.9 }, facialHair: "short_beard", beardColor: "#6e533a", brow: "#5c4632", brows: { thickness: 0.9, arch: 0.15, tail: 0.45, gap: 0.5 }, eyes: "#5d86a8", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { face_length: 0.5, chin_prominent: 0.4, head_age: 0.55, head_width: -0.1, head_rectangular: 0.4, jaw_width: 0.3, nose_length: 0.3, eye_size: -0.25, brow_height: -0.15, cheek_volume: -0.25 } },
  // Dark brown hair, curly on top; clean shaven; a young, oval face.
  bortoleto: { skin: "#d4a385", hair: { style: "curly", color: "#2a1e16", volume: 1 }, facialHair: "none", beardColor: "#2a1e16", brow: "#2a1e16", brows: { thickness: 1.05, arch: 0.3, tail: 0.35, gap: 0.5 }, eyes: "#4a3424", heritage: { african: 0, asian: 0, caucasian: 1 },
    shape: { head_age: -0.75, head_oval: 0.3, face_length: 0.1, cheek_volume: 0.2, nose_length: 0.2, nose_width: 0.2, eye_size: 0.1, mouth_width: 0.2, jaw_width: 0.1 } },
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

// Circuits in the order of the 2025 calendar
// (docs/superpowers/specs/2026-10-01-calendar-design.md). lengthM is the real
// lap length in metres, from the bacinger/f1-circuits data the outlines come
// from; rainChance is how often Changeable weather rains there (weather.js);
// short is the name the place goes by, where a full name won't fit; places
// are the other names a search should find it by (choices.js).
const CIRCUITS = [
  { id: "albertpark", short: "Albert Park", places: "Melbourne", name: "Albert Park Circuit", country: "Australia", theme: "Melbourne parkland lakeside", lengthM: 5278, laps: 5, roadWidth: 33, rainChance: 0.2, bg: { sky: "#78b4e4", grass: "#5c9a46", accent: "#ffe8b0", road: "#4a4a52", shoulder: "#c4bca8", horizonA: "#2c5a34", horizonB: "#5a9450", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff0c0" } },
  { id: "shanghai", short: "Shanghai", name: "Shanghai International Circuit", country: "China", theme: "Spiralling modern classic", lengthM: 5451, laps: 5, roadWidth: 33, rainChance: 0.3, bg: { sky: "#aecbe2", grass: "#5e8c4e", accent: "#f0e4c8", road: "#4c4c54", shoulder: "#c0bab0", horizonA: "#46604a", horizonB: "#7a9a78", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff2d8" } },
  { id: "suzuka", short: "Suzuka", name: "Suzuka International Racing Course", country: "Japan", theme: "Japanese technical masterpiece", lengthM: 5807, laps: 5, roadWidth: 33, rainChance: 0.3, bg: { sky: "#9fd0e8", grass: "#3a7a38", accent: "#ffeedd", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1e4a1e", horizonB: "#408040", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" } },
  { id: "bahrain", short: "Bahrain", places: "Sakhir", name: "Bahrain International Circuit", country: "Bahrain", theme: "Desert twilight circuit", lengthM: 5412, laps: 5, roadWidth: 33, rainChance: 0.02, bg: { sky: "#cc8833", grass: "#8a6a3a", accent: "#ffe8aa", road: "#585050", shoulder: "#c8b888", horizonA: "#6a4820", horizonB: "#aa7838", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffcc44" } },
  { id: "jeddah", short: "Jeddah", places: "Red Sea", name: "Jeddah Corniche Circuit", country: "Saudi Arabia", theme: "Night street circuit on the Red Sea", lengthM: 6175, laps: 5, roadWidth: 33, rainChance: 0.02, bg: { sky: "#0b1026", grass: "#2a2a36", accent: "#7fe0c0", road: "#3a3846", shoulder: "#58545e", horizonA: "#0a0c22", horizonB: "#1a2048", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffd9a0" } },
  { id: "miami", short: "Miami", places: "USA Florida", name: "Miami International Autodrome", country: "United States", theme: "Stadium circuit in the sun", lengthM: 5412, laps: 5, roadWidth: 33, rainChance: 0.15, bg: { sky: "#5ab6f0", grass: "#6aa84a", accent: "#ffd27f", road: "#4a4a54", shoulder: "#c6bea8", horizonA: "#2a6a6a", horizonB: "#5ab0a0", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff1c4" } },
  { id: "imola", short: "Imola", places: "Emilia-Romagna", name: "Autodromo Enzo e Dino Ferrari", country: "Italy", theme: "Old-school parkland classic", lengthM: 4909, laps: 5, roadWidth: 33, rainChance: 0.3, bg: { sky: "#8cc0e6", grass: "#4f8a40", accent: "#ffe7a8", road: "#48484f", shoulder: "#c2b9a6", horizonA: "#2c5a2c", horizonB: "#5a8a4c", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffeec0" } },
  { id: "monaco", short: "Monaco", name: "Circuit de Monaco", country: "Monaco", theme: "Street circuit showpiece", lengthM: 3337, laps: 5, roadWidth: 33, rainChance: 0.15, bg: { sky: "#4db8e8", grass: "#3a6a88", accent: "#ffeedd", road: "#505060", shoulder: "#c8c0b8", horizonA: "#184858", horizonB: "#3878a8", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" } },
  { id: "barcelona", short: "Barcelona", places: "Catalonia", name: "Circuit de Barcelona-Catalunya", country: "Spain", theme: "The test track among the hills", lengthM: 4655, laps: 5, roadWidth: 33, rainChance: 0.1, bg: { sky: "#7fbde8", grass: "#8c9a52", accent: "#ffe0a0", road: "#4a4850", shoulder: "#cbbd9c", horizonA: "#5a6a3a", horizonB: "#8a9a5a", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff0c0" } },
  { id: "montreal", short: "Montréal", places: "Quebec", name: "Circuit Gilles Villeneuve", country: "Canada", theme: "Island circuit on the St Lawrence", lengthM: 4361, laps: 5, roadWidth: 33, rainChance: 0.3, bg: { sky: "#86bde6", grass: "#4f8c42", accent: "#ffe6b0", road: "#48484f", shoulder: "#bfb8a8", horizonA: "#2a5a3a", horizonB: "#5a8a5a", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff2cc" } },
  { id: "redbullring", short: "Red Bull Ring", places: "Spielberg Styria", name: "Red Bull Ring", country: "Austria", theme: "Short and fast in the Styrian hills", lengthM: 4318, laps: 5, roadWidth: 33, rainChance: 0.3, bg: { sky: "#7ab6e6", grass: "#4f9440", accent: "#fff0c0", road: "#46464e", shoulder: "#bdb7a6", horizonA: "#2a4a2a", horizonB: "#4a7a48", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff4d0" } },
  { id: "silverstone", short: "Silverstone", places: "UK Britain England", name: "Silverstone Circuit", country: "Great Britain", theme: "British airfield classic", lengthM: 5891, laps: 5, roadWidth: 33, rainChance: 0.35, bg: { sky: "#aac8e0", grass: "#4c8840", accent: "#e8f0e0", road: "#505058", shoulder: "#c0b8a8", horizonA: "#304828", horizonB: "#5a7848", curbA: "#dc0000", curbB: "#ffffff", sun: "#d8e8f0" } },
  { id: "spa", short: "Spa", name: "Circuit de Spa-Francorchamps", country: "Belgium", theme: "Belgian forest circuit", lengthM: 7004, laps: 5, roadWidth: 33, rainChance: 0.5, bg: { sky: "#6a8faf", grass: "#2d5a27", accent: "#c8d8e8", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1a3a1a", horizonB: "#3a6a35", curbA: "#dc0000", curbB: "#ffffff", sun: "#ddeeff" } },
  { id: "hungaroring", short: "Hungaroring", places: "Budapest", name: "Hungaroring", country: "Hungary", theme: "Twisting bowl in the hills", lengthM: 4381, laps: 5, roadWidth: 33, rainChance: 0.2, bg: { sky: "#88bfe8", grass: "#86a050", accent: "#ffe6a6", road: "#4a4a50", shoulder: "#c6bc9e", horizonA: "#4a6a34", horizonB: "#7a9a54", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff0c0" } },
  { id: "zandvoort", short: "Zandvoort", places: "Holland", name: "Circuit Zandvoort", country: "Netherlands", theme: "Seaside rollercoaster in the dunes", lengthM: 4259, laps: 5, roadWidth: 33, rainChance: 0.3, bg: { sky: "#9cc6e4", grass: "#a8b07a", accent: "#ffd9a0", road: "#4a4a52", shoulder: "#d6c9a4", horizonA: "#6a7a5a", horizonB: "#a8a878", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff2d0" } },
  { id: "monza", short: "Monza", name: "Autodromo di Monza", country: "Italy", theme: "Italian speed temple", lengthM: 5793, laps: 5, roadWidth: 33, rainChance: 0.15, bg: { sky: "#87ceeb", grass: "#4a8c3f", accent: "#ffe08a", road: "#484850", shoulder: "#c8c0b0", horizonA: "#2a5a30", horizonB: "#5a9a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe08a" } },
  { id: "baku", short: "Baku", name: "Baku City Circuit", country: "Azerbaijan", theme: "Castle walls and the longest flat-out run", lengthM: 6003, laps: 5, roadWidth: 33, rainChance: 0.05, bg: { sky: "#86b8e0", grass: "#8a9a6a", accent: "#ffe2a8", road: "#4a4a52", shoulder: "#c8bea4", horizonA: "#5a6a62", horizonB: "#8a9a88", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff0cc" } },
  { id: "singapore", short: "Singapore", name: "Marina Bay Street Circuit", country: "Singapore", theme: "Night city circuit", lengthM: 4928, laps: 5, roadWidth: 33, rainChance: 0.25, bg: { sky: "#0a0a1e", grass: "#1a1a3a", accent: "#ffa500", road: "#3a3848", shoulder: "#545060", horizonA: "#0a0a28", horizonB: "#1a1a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ff8800" } },
  { id: "cota", short: "Austin", places: "USA Texas", name: "Circuit of the Americas", country: "United States", theme: "Up the hill to Turn 1 in Texas", lengthM: 5514, laps: 5, roadWidth: 33, rainChance: 0.1, bg: { sky: "#7cb8ea", grass: "#9a9e5a", accent: "#ffdca0", road: "#4a4850", shoulder: "#c9bb98", horizonA: "#5a6a3a", horizonB: "#8a945a", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff0c4" } },
  { id: "mexico", short: "Mexico City", places: "Mexico City", name: "Autódromo Hermanos Rodríguez", country: "Mexico", theme: "High-altitude stadium circuit", lengthM: 4304, laps: 5, roadWidth: 33, rainChance: 0.15, bg: { sky: "#8cbde4", grass: "#7a9a50", accent: "#ffe0a0", road: "#48484f", shoulder: "#c2b8a0", horizonA: "#4a6040", horizonB: "#7a8f62", curbA: "#dc0000", curbB: "#ffffff", sun: "#fff2cc" } },
  { id: "interlagos", short: "Interlagos", places: "São Paulo", name: "Autódromo José Carlos Pace", country: "Brazil", theme: "Brazilian passion circuit", lengthM: 4309, laps: 5, roadWidth: 33, rainChance: 0.4, bg: { sky: "#5598cc", grass: "#3c7838", accent: "#ffe8aa", road: "#484850", shoulder: "#b0a898", horizonA: "#1e4820", horizonB: "#3a7838", curbA: "#009c3b", curbB: "#ffdf00", sun: "#ffdd44" } },
  { id: "lasvegas", short: "Las Vegas", places: "USA Nevada", name: "Las Vegas Strip Circuit", country: "United States", theme: "Saturday night down the Strip", lengthM: 6201, laps: 5, roadWidth: 33, rainChance: 0.02, bg: { sky: "#0c0a24", grass: "#2a2836", accent: "#ff5ad0", road: "#3a3846", shoulder: "#58545e", horizonA: "#140f30", horizonB: "#2a1f50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffd2f0" } },
  { id: "losail", short: "Lusail", places: "Doha", name: "Lusail International Circuit", country: "Qatar", theme: "Floodlit curves in the desert", lengthM: 5380, laps: 5, roadWidth: 33, rainChance: 0.02, bg: { sky: "#0a0e22", grass: "#3a3226", accent: "#ffd9a0", road: "#3a3846", shoulder: "#5e564a", horizonA: "#100c1e", horizonB: "#2a2234", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffcf90" } },
  { id: "yasmarina", short: "Yas Marina", places: "Abu Dhabi", name: "Yas Marina Circuit", country: "United Arab Emirates", theme: "Night race at the marina", lengthM: 5281, laps: 5, roadWidth: 33, rainChance: 0.02, bg: { sky: "#0d1230", grass: "#2a3040", accent: "#7fd0ff", road: "#3a3848", shoulder: "#565262", horizonA: "#101438", horizonB: "#2a2f60", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffb070" } },
];

// The 2025 calendar as six 4-race cups, in order. (The Trophy and
// Constructor Cups before them became these: season.js resolveCup.)
const CUP_DEFS = [
  { id: "openingCup", name: "Opening Cup", icon: "Opening Cup", circuitIds: ["albertpark", "shanghai", "suzuka", "bahrain"] },
  { id: "springCup", name: "Spring Cup", icon: "Spring Cup", circuitIds: ["jeddah", "miami", "imola", "monaco"] },
  { id: "summerCup", name: "Summer Cup", icon: "Summer Cup", circuitIds: ["barcelona", "montreal", "redbullring", "silverstone"] },
  { id: "classicsCup", name: "Classics Cup", icon: "Classics Cup", circuitIds: ["spa", "hungaroring", "zandvoort", "monza"] },
  { id: "autumnCup", name: "Autumn Cup", icon: "Autumn Cup", circuitIds: ["baku", "singapore", "cota", "mexico"] },
  { id: "finaleCup", name: "Finale Cup", icon: "Finale Cup", circuitIds: ["interlagos", "lasvegas", "losail", "yasmarina"] },
];

// The whole calendar as one championship (season.js).
const SEASON = { id: "season", name: "2025 Season", icon: "2025 Season", circuitIds: CIRCUITS.map((c) => c.id) };

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
    albertpark: "leclerc", shanghai: "hamilton", jeddah: "alonso", miami: "antonelli", imola: "lawson",
    barcelona: "sainz", montreal: "stroll", redbullring: "hadjar", hungaroring: "piastri", zandvoort: "bearman",
    baku: "albon", cota: "ocon", mexico: "bortoleto", lasvegas: "doohan", losail: "norris", yasmarina: "russell",
    monza: "leclerc", spa: "hamilton", silverstone: "norris", suzuka: "tsunoda",
    monaco: "verstappen", singapore: "russell", bahrain: "gasly", interlagos: "hulkenberg",
  },
  // Race day: the replay follows Leclerc (the onboard rides with Hamilton,
  // whose recorded controls draw the trace), the podium is the cup's top three
  // in this order, and the split screen is P1 then P2.
  raceDay: {
    replay: "leclerc", onboard: "hamilton",
    podium: ["leclerc", "hamilton", "norris"],
    players: ["leclerc", "hamilton"],
  },
};

if (typeof module === "object" && module.exports) {
  module.exports = { TEAMS, DRIVERS, DIFFICULTIES, CIRCUITS, CUP_DEFS, SEASON, POWER_UPS, SHOT_DRIVERS, getTeamForDriver };
}
