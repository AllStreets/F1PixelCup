// What makes each circuit look like where it is.
//
// Every landmark claims its footprint through course.findSpot / course.claim,
// which refuse anything that would touch the circuit or something already
// placed. Nothing here can end up on the track.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, seeded, hashString, canvasTexture, buildingMaterial, photo } from "./textures.js";
import { ribbon, footprintClear, scatterTrees } from "./track.js";
import { tracksideModel, LANDMARK_SCALE } from "./models.js";
import { buildYachts } from "./yachts.js";

// ---------------------------------------------------------------------------
// Venue settings
// ---------------------------------------------------------------------------

export const VENUES = {
  monza: {
    ground: "grass", groundTint: "#7fa865", standColor: "#dc0000", stand: "open",
    trees: [{ kind: "broadleaf", count: 1300, tint: "#3d7535" }],
    hills: { tint: "#5d7d57", count: 16, height: [120, 260] },
    extras: ["monzaBanking"],
  },
  spa: {
    ground: "grass", groundTint: "#5f8a4d", standColor: "#f2c200", stand: "open",
    trees: [{ kind: "conifer", count: 2000, tint: "#1e4a2a" }, { kind: "conifer", count: 500, tint: "#24522c", near: 90, seed: 7 }],
    hills: { tint: "#2c5232", count: 22, height: [300, 650] },
    fogNear: 700, fogFar: 3200,
    extras: ["spaPits"],
  },
  silverstone: {
    ground: "grass", groundTint: "#86ad6a", standColor: "#0a2a6a", stand: "covered",
    trees: [{ kind: "broadleaf", count: 380, tint: "#4a7a3a" }],
    hills: { tint: "#6d8a62", count: 10, height: [80, 160] },
    pit: "wing",
    extras: ["silverstoneWing", "hangars"],
  },
  suzuka: {
    ground: "grass", groundTint: "#76a55e", standColor: "#dc0000", stand: "covered",
    trees: [{ kind: "broadleaf", count: 900, tint: "#2f6a36" }, { kind: "conifer", count: 300, tint: "#244f2c", seed: 3 }],
    hills: { tint: "#40704a", count: 18, height: [200, 420] },
    extras: ["ferrisWheel"],
  },
  monaco: {
    ground: "water", standColor: "#dc0000", stand: "covered",
    trees: [{ kind: "palm", count: 120, tint: "#3f7a3a", near: 60 }],
    // The casino claims its square first; the town fills in round it.
    extras: ["casino", "monacoCity", "yachts", "mountains"],
    // The harbour: yachts moored stern-to at the town's edge, more at anchor.
    // The start straight's harbour front first, where the pit lane is not.
    harbour: { quay: 190, moored: 46, anchored: 22, wind: 0.5, prefer: { side: -1, from: -560, to: 560 } },
    runoffTint: "#b8b4ac",
  },
  singapore: {
    ground: "city", night: true, standColor: "#e03030", stand: "covered",
    trees: [{ kind: "broadleaf", count: 140, tint: "#2d5a3a", near: 80 }],
    extras: ["marinaBaySands", "yachts", "flyer", "singaporeCity", "skyline", "floodlights"],
    // A few at anchor on Marina Bay, in front of Marina Bay Sands.
    harbour: { anchored: 6, anchorIn: "marinaBaySands", wind: 2.2 },
  },
  bahrain: {
    ground: "sand", standColor: "#b8001f", stand: "covered", runoffTint: "#b8a888", gravelTint: "#e0c89a",
    trees: [{ kind: "palm", count: 170, tint: "#5e7a34", near: 140 }],
    hills: { tint: "#c9a36a", count: 26, height: [40, 110], flat: true },
    extras: ["sakhirTower", "floodlights"],
  },
  interlagos: {
    ground: "grass", groundTint: "#79a562", standColor: "#009c3b", stand: "open",
    trees: [{ kind: "broadleaf", count: 650, tint: "#336c33" }],
    hills: { tint: "#56804c", count: 16, height: [160, 320] },
    extras: ["spTowers", "lake", "skyline", "favela"],
  },
  // The 2025 calendar's other circuits (docs/superpowers/specs/2026-10-01-calendar-design.md).
  // `landmarks` names what Stage J builds there; nothing here draws it yet.
  albertpark: {
    // Parkland round Albert Park Lake, Melbourne's towers to the north.
    ground: "grass", groundTint: "#7fae62", standColor: "#1d5fa8", stand: "covered",
    trees: [{ kind: "broadleaf", count: 900, tint: "#4f7d45" }, { kind: "broadleaf", count: 260, tint: "#5d8a4a", near: 80, seed: 5 }, { kind: "palm", count: 40, tint: "#56803e", near: 50, seed: 9 }],
    lake: { tint: "#3d7fa6", count: 140 },
    skyline: { arc: [Math.PI * 1.2, Math.PI * 1.8], count: 90, height: [110, 340] },
    extras: ["infieldLake", "skylineArc"],
    landmarks: ["melbourneSkyline"],
  },
  shanghai: {
    // Flat ground in Jiading, a hazy afternoon, the city far to the south-east.
    ground: "grass", groundTint: "#88a86c", standColor: "#c8102e", stand: "covered", runoffTint: "#bdb8ae",
    trees: [{ kind: "broadleaf", count: 520, tint: "#4a7244" }, { kind: "broadleaf", count: 200, tint: "#557a48", near: 70, seed: 4 }],
    skyline: { arc: [Math.PI * 0.05, Math.PI * 0.5], count: 70, height: [90, 300] },
    extras: ["skylineArc"],
    fogNear: 900, fogFar: 3800,
    landmarks: ["shanghaiGrandstand"],
  },
  jeddah: {
    // At night on the Corniche: the Red Sea to the west, the city to the east.
    ground: "city", night: true, standColor: "#00843d", stand: "covered", runoffTint: "#9a968e",
    trees: [{ kind: "palm", count: 240, tint: "#4e7a3a", near: 70 }],
    coast: { bearing: Math.PI, tint: "#14506e" },
    skyline: { arc: [-Math.PI * 0.35, Math.PI * 0.35], count: 90, height: [70, 280] },
    extras: ["coast", "skylineArc", "floodlights"],
    landmarks: ["kingFahdFountain"],
  },
  miami: {
    // Round the stadium on Miami Gardens' flat lawns: palms, sun, and water
    // in the infield (the real marina is a painted set by turns 6 to 8).
    ground: "grass", groundTint: "#93bf62", standColor: "#00a3ad", stand: "covered", runoffTint: "#aaa69c",
    trees: [{ kind: "palm", count: 360, tint: "#4f8a3c", near: 90 }, { kind: "broadleaf", count: 160, tint: "#3f7a3a", near: 260, seed: 6 }],
    lake: { tint: "#38c2cc", count: 5 },
    extras: ["infieldLake"],
    landmarks: ["miamiStadium"],
  },
  imola: {
    // Parkland under the Apennine foothills, trees to the barriers.
    ground: "grass", groundTint: "#78a25a", standColor: "#d40000", stand: "open",
    trees: [{ kind: "broadleaf", count: 1500, tint: "#3c6e34" }, { kind: "conifer", count: 320, tint: "#2f5a30", near: 70, seed: 3 }],
    hills: { tint: "#5d8551", count: 18, height: [180, 380] },
    extras: [],
    landmarks: ["sennaMonument"],
  },
  barcelona: {
    // Dry Catalan hills round Montmeló, umbrella pines and scrub.
    ground: "grass", groundTint: "#a7aa66", standColor: "#c60b1e", stand: "covered", runoffTint: "#c2b49a", gravelTint: "#d9c9a3",
    trees: [{ kind: "conifer", count: 700, tint: "#4a6a3a" }, { kind: "broadleaf", count: 260, tint: "#6a8048", near: 120, seed: 2 }],
    hills: { tint: "#8f9a62", count: 16, height: [160, 360] },
    extras: [],
    landmarks: ["montmeloHills"],
  },
  montreal: {
    // An island in the St Lawrence: the river to the east, the rowing basin
    // to the west, the city across the water to the north-west.
    ground: "grass", groundTint: "#7cab5e", standColor: "#d52b1e", stand: "open",
    trees: [{ kind: "broadleaf", count: 520, tint: "#3f7a3a", near: 140 }, { kind: "conifer", count: 120, tint: "#2f5a34", near: 100, seed: 8 }],
    coast: [{ bearing: 0, tint: "#2c6688", sand: "#a3a892" }, { bearing: Math.PI, tint: "#3a7896", sand: "#a3a892" }],
    skyline: { arc: [Math.PI * 1.2, Math.PI * 1.55], count: 70, height: [90, 300] },
    extras: ["coast", "skylineArc"],
    landmarks: ["biosphere"],
  },
  redbullring: {
    // High in the Styrian hills: steep green slopes and pine forest.
    ground: "grass", groundTint: "#73ac52", standColor: "#2e5fa8", stand: "open",
    trees: [{ kind: "conifer", count: 1300, tint: "#2a4f2e" }, { kind: "broadleaf", count: 260, tint: "#3f6e36", near: 120, seed: 4 }],
    hills: { tint: "#4f7a48", count: 22, height: [320, 720] },
    fogNear: 900, fogFar: 4400,
    extras: [],
    landmarks: ["hillsideStands"],
  },
  hungaroring: {
    // A bowl in the dry hills east of Budapest: the crowd watches from the slopes.
    ground: "grass", groundTint: "#9cad62", standColor: "#cd2a3e", stand: "open", runoffTint: "#c4b89c",
    trees: [{ kind: "broadleaf", count: 900, tint: "#4d7a3c" }, { kind: "broadleaf", count: 200, tint: "#5a8444", near: 110, seed: 6 }],
    hills: { tint: "#859c5c", count: 18, height: [120, 260] },
    extras: [],
    landmarks: ["valleyStands"],
  },
  zandvoort: {
    // In the dunes by the North Sea, the beach just to the west.
    ground: "grass", groundTint: "#aab37c", standColor: "#ff6a00", stand: "open", runoffTint: "#d2c6a2", gravelTint: "#e2d4ae",
    trees: [{ kind: "conifer", count: 220, tint: "#4d6a45", near: 160 }],
    hills: { tint: "#c4bd88", count: 40, height: [45, 110] },
    coast: { bearing: Math.PI, tint: "#4b7489", sand: "#e4d6ad" },
    extras: ["coast"],
    landmarks: ["dunes"],
  },
  baku: {
    // Through the old city and along the Caspian boulevard: stone, sea,
    // towers on the hill.
    ground: "city", standColor: "#00b5e2", stand: "covered", runoffTint: "#b3a98f",
    trees: [{ kind: "palm", count: 90, tint: "#56803e", near: 50 }, { kind: "broadleaf", count: 140, tint: "#4a7340", near: 60, seed: 3 }],
    coast: { bearing: Math.PI * 0.38, tint: "#2f6d8c", sand: "#c8bfa4" },
    skyline: { arc: [Math.PI * 0.9, Math.PI * 1.45], count: 110, height: [70, 260] },
    extras: ["coast", "bakuCity", "skylineArc"],
    landmarks: ["flameTowers", "oldCityWalls", "maidenTower"],
  },
  cota: {
    // Texas hill country outside Austin: dry grass, live oaks, big skies.
    ground: "grass", groundTint: "#a9a964", standColor: "#bf0a30", stand: "covered", runoffTint: "#c4b394",
    trees: [{ kind: "broadleaf", count: 700, tint: "#566f3a" }, { kind: "broadleaf", count: 160, tint: "#61783f", near: 140, seed: 5 }],
    hills: { tint: "#9a9a62", count: 14, height: [90, 200], flat: true },
    skyline: { arc: [Math.PI * 1.15, Math.PI * 1.4], count: 40, height: [80, 260] },
    extras: ["skylineArc"],
    landmarks: ["observationTower"],
  },
  mexico: {
    // A sports park in the middle of the city: towers all round, the stadium
    // the last corners run through.
    ground: "grass", groundTint: "#8dab5c", standColor: "#006847", stand: "covered", runoffTint: "#bdb39a",
    trees: [{ kind: "broadleaf", count: 600, tint: "#4a7a3c" }, { kind: "palm", count: 60, tint: "#58803e", near: 90, seed: 7 }],
    skyline: { arc: [0, Math.PI * 2], count: 150, height: [50, 210] },
    extras: ["skylineArc"],
    landmarks: ["foroSol"],
  },
  lasvegas: {
    // Saturday night on the Strip: the resorts lit up along the west side,
    // the city's towers all round.
    ground: "city", night: true, standColor: "#7a3cff", stand: "covered", runoffTint: "#8c8896",
    trees: [{ kind: "palm", count: 140, tint: "#4e7a3a", near: 50 }],
    skyline: { arc: [0, Math.PI * 2], count: 120, height: [60, 220] },
    extras: ["vegasStrip", "skylineArc", "floodlights"],
    landmarks: ["sphere", "stripResorts"],
  },
  losail: {
    // Under the lights in the desert north of Doha, Lusail's towers to the south.
    ground: "sand", night: true, standColor: "#8a1538", stand: "covered", runoffTint: "#a89a80", gravelTint: "#c8b48a",
    trees: [{ kind: "palm", count: 110, tint: "#4e7234", near: 80 }],
    hills: { tint: "#a08a64", count: 14, height: [30, 80], flat: true },
    skyline: { arc: [Math.PI * 0.3, Math.PI * 0.7], count: 70, height: [80, 300] },
    extras: ["skylineArc", "floodlights"],
    landmarks: ["litGrandstand"],
  },
  yasmarina: {
    // Night at the marina on Yas Island: water and yachts beside the track,
    // the open water to the west.
    ground: "city", night: true, standColor: "#00732f", stand: "covered", runoffTint: "#8f8a80",
    trees: [{ kind: "palm", count: 220, tint: "#4e7a3a", near: 70 }],
    lake: { tint: "#123a5a", count: 40 },
    coast: { bearing: Math.PI * 0.85, tint: "#0f3352", sand: "#a89c80" },
    skyline: { arc: [Math.PI * 1.6, Math.PI * 2.1], count: 60, height: [70, 220] },
    extras: ["infieldLake", "lakeYachts", "coast", "skylineArc", "floodlights"],
    landmarks: ["yasHotel"],
  },
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const std = (col, extra = {}) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, ...extra });

function addMesh(group, geo, mat, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  group.add(m);
  return m;
}

export function waterMaterial(tint = "#2a6f96") {
  return new THREE.MeshPhongMaterial({ color: color(tint), specular: 0x9fc4dd, shininess: 90 });
}

// Whether any of a round footprint lies in the sea (coastline).
function wet(course, x, z, radius) {
  return (course.seas || []).some((sea) => x * sea.ux + z * sea.uz + radius > sea.shore);
}

// Slide a big round thing (a hill, a tower, a bay) straight away from the
// middle of the circuit until its whole footprint is clear of the track.
function pushClear(course, x, z, radius, margin = 40) {
  const b = course.bounds;
  let dx = x - b.cx;
  let dz = z - b.cz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  for (let i = 0; i < 200; i += 1) {
    if (course.clearance(x, z, radius + margin + 120) >= radius + margin) return { x, z };
    x += dx * 40;
    z += dz * 40;
  }
  return null;
}

// The garages' height and their open doors (people stand in them: a 1.78 m
// person is 10.7 units at the car's scale, so the door is 17.4, 2.9 m).
const GARAGE_HEIGHT = 21;
const GARAGE_DOOR = 17.4;
const GARAGE_RECESS = 9;

const TEAM_COLOURS = ["#1e41b2", "#dc0000", "#ff8000", "#00d2be", "#006f62", "#0090ff", "#005aff", "#e8002d", "#6692ff", "#39ff14"];

// The garages, behind the pit lane's working lane (pitlane.js): one bay per
// team and the Safety Car's by the exit, following the lane round, with the
// hospitality floor above and the circuit's name on the front. Everything
// stays within the garages' depth, and all bays share one mesh per material
// (a frame per team colour).
function garages(course, group, venue) {
  const lane = course.pitLane;
  if (!lane) return;
  const { garages: g } = lane;
  const side = lane.side;
  const front = g.front;
  const depth = g.outer - front;
  const mid = (front + g.outer) / 2;
  const wing = venue.pit === "wing";
  const mats = {
    shell: std(0xd9d9dd),
    glass: std(0x5f7f9f, { metalness: 0.6, roughness: 0.15, emissive: venue.night ? 0x886644 : 0x000000, emissiveIntensity: 0.5 }),
    // The garage inside: dark, under its own lights.
    inside: std(0x2c2e35, { roughness: 0.9, emissive: 0xfff1dc, emissiveIntensity: venue.night ? 0.12 : 0.05 }),
    // Light roofs, short of white: the sun on white would bloom to a glare.
    roof: std(wing ? 0xdadade : 0xcfd0d4, { roughness: 0.55 }),
  };
  const parts = { shell: [], glass: [], inside: [], roof: [] };
  const frames = new Map();
  const bays = new THREE.Group();
  bays.name = "garages";
  g.bays.forEach((bay, i) => {
    const p = course.sampleAt(bay.d);
    // Local x along the lap, local z out from the lane (away from the road).
    const m = new THREE.Matrix4().makeRotationY(-Math.atan2(p.ty, p.tx) + (side > 0 ? 0 : Math.PI));
    m.setPosition(p.x + p.nx * side * mid, p.h, p.y + p.ny * side * mid);
    const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).applyMatrix4(m);
    // The shell round an open door: the back of the garage, the walls
    // either side of the door and the lintel over it. The door is a recess
    // the crew stand in (r3d/people.js), lit inside, tall enough for them.
    const back = depth - GARAGE_RECESS;
    parts.shell.push(box(30.4, GARAGE_HEIGHT, back, 0, GARAGE_HEIGHT / 2, GARAGE_RECESS / 2));
    [-1, 1].forEach((u) => parts.shell.push(box(3.2, GARAGE_HEIGHT, GARAGE_RECESS, u * 13.6, GARAGE_HEIGHT / 2, -depth / 2 + GARAGE_RECESS / 2)));
    parts.shell.push(box(24, GARAGE_HEIGHT - GARAGE_DOOR, GARAGE_RECESS, 0, (GARAGE_HEIGHT + GARAGE_DOOR) / 2, -depth / 2 + GARAGE_RECESS / 2));
    // The back wall of the bay, just proud of the shell's face behind it.
    parts.inside.push(box(24, GARAGE_DOOR, 0.6, 0, GARAGE_DOOR / 2, -depth / 2 + GARAGE_RECESS - 0.35));
    parts.inside.push(box(24, 0.3, GARAGE_RECESS, 0, 0.15, -depth / 2 + GARAGE_RECESS / 2));
    const colour = bay.safetyCar ? "#c9ced6" : TEAM_COLOURS[i % TEAM_COLOURS.length];
    if (!frames.has(colour)) frames.set(colour, []);
    frames.get(colour).push(box(26, 1.4, 0.8, 0, GARAGE_DOOR + 0.7, -depth / 2 - 0.3), box(1.2, GARAGE_DOOR, 0.8, -12.6, GARAGE_DOOR / 2, -depth / 2 - 0.3), box(1.2, GARAGE_DOOR, 0.8, 12.6, GARAGE_DOOR / 2, -depth / 2 - 0.3));
    // The hospitality floor, set back a little from the doors.
    parts.glass.push(box(30.4, 10, depth - 2, 0, GARAGE_HEIGHT + 5, 1));
    if (wing) {
      // Silverstone's Wing: the roof rises and falls like an aerofoil.
      const lift = Math.sin(((i + 0.5) / g.bays.length) * Math.PI) * 10;
      parts.roof.push(new THREE.BoxGeometry(31, 2, depth).rotateX(-0.12).translate(0, GARAGE_HEIGHT + 13 + lift, 0).applyMatrix4(m));
    } else {
      parts.roof.push(box(31, 2, depth, 0, GARAGE_HEIGHT + 11, 0));
    }
    // A marker per bay, for the checks (no mesh of its own).
    const marker = new THREE.Object3D();
    marker.applyMatrix4(m);
    marker.userData.bay = { index: i, safetyCar: bay.safetyCar, d: bay.d, depth, recess: GARAGE_RECESS };
    bays.add(marker);
    course.occupied.add(marker.position.x, marker.position.z, Math.hypot(15, depth / 2) + 2);
  });
  Object.entries(parts).forEach(([k, list]) => {
    const mesh = new THREE.Mesh(mergeGeometries(list), mats[k]);
    mesh.castShadow = k !== "inside";
    mesh.receiveShadow = true;
    mesh.name = `garages:${k}`;
    bays.add(mesh);
  });
  frames.forEach((list, colour) => {
    const mesh = new THREE.Mesh(mergeGeometries(list), std(color(colour), { roughness: 0.4, emissive: color(colour), emissiveIntensity: venue.night ? 0.35 : 0.08 }));
    mesh.name = "garages:frame";
    bays.add(mesh);
  });
  group.add(bays);
  // The circuit's name across the middle of the front.
  const centre = course.sampleAt(g.bays[Math.floor(g.bays.length / 2)].d);
  const signTex = canvasTexture(1024, 96, (cx, w, h) => {
    cx.fillStyle = "#111";
    cx.fillRect(0, 0, w, h);
    cx.fillStyle = "#fff";
    cx.font = "900 italic 60px Trebuchet MS, sans-serif";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.fillText(wing ? "THE WING" : course.track.name.toUpperCase(), w / 2, h / 2 + 2);
  }, { repeat: false });
  signTex.userData.print = true;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(150, 7), new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveIntensity: venue.night ? 0.6 : 0.1, emissiveMap: signTex }));
  const face = front - 0.4;
  sign.position.set(centre.x + centre.nx * side * face, centre.h + GARAGE_HEIGHT + 5, centre.y + centre.ny * side * face);
  // Facing the lane: toward the road.
  sign.rotation.y = -Math.atan2(centre.ty, centre.tx) + (side > 0 ? Math.PI : 0);
  group.add(sign);
}

// The signature corners' name boards (their positions from OpenStreetMap,
// in the track data): on the outside of the corner, past the barrier, facing
// the track. Where the spot is taken it moves along the corner, and then to
// its inside.
function cornerBoards(course, group, venue) {
  const corners = course.track.corners || [];
  corners.forEach((c) => {
    const total = course.track.totalLength;
    // The outside of the bend first (curve > 0 turns toward +n, so the
    // outside is -n), then the inside, along the corner.
    const tries = [];
    [1, -1].forEach((which) => [0, -40, 40, -80, 80].forEach((shift) => tries.push([which, shift, 14, 1])));
    // Then further back from the barrier, and then a smaller board (a
    // hairpin with a grandstand round its outside: Zandvoort's Hugenholtz),
    // where those are all taken.
    [1, -1].forEach((which) => [0, -40, 40, -80, 80].forEach((shift) => tries.push([which, shift, 44, 1])));
    [1, -1].forEach((which) => [0, -40, 40, -80, 80].forEach((shift) => tries.push([which, shift, 14, 0.6])));
    for (const [which, shift, back, size] of tries) {
      const p = course.sampleAt(((c.d + shift) % total + total) % total);
      const bend = course.sampleAt(c.d);
      const side = (bend.curve > 0 ? -1 : 1) * which;
      const off = side * ((side > 0 ? p.outerR : p.outerL) + back);
      const x = p.x + p.nx * off;
      const z = p.y + p.ny * off;
      const angle = Math.atan2(p.ty, p.tx);
      if (!footprintClear(course, x, z, angle, 38 * size, 4, 6) || course.occupied.blocked(x, z, 38 * size)) continue;
      course.occupied.add(x, z, 38 * size);
      const g = new THREE.Group();
      g.name = `corner:${c.board}`;
      const tex = canvasTexture(1024, 256, (cx, w, h) => {
        cx.fillStyle = "#101418";
        cx.fillRect(0, 0, w, h);
        cx.fillStyle = "#e10600";
        cx.fillRect(0, h - 22, w, 22);
        cx.fillStyle = "#ffffff";
        cx.textAlign = "center";
        cx.textBaseline = "middle";
        cx.font = `900 italic ${c.aka ? 104 : 124}px Trebuchet MS, sans-serif`;
        cx.fillText(c.board, w / 2, c.aka ? 96 : 118, w - 48);
        if (c.aka) {
          cx.font = "700 58px Trebuchet MS, sans-serif";
          cx.fillStyle = "#c9ced6";
          cx.fillText(c.aka, w / 2, 190);
        }
      }, { repeat: false });
      tex.userData.print = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(72, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: venue.night ? 0.5 : 0.05 }));
      face.position.set(0, 20, 0.6);
      g.add(face);
      addMesh(g, new THREE.BoxGeometry(74, 20, 1), std(0x2a2d34), 0, 20, 0);
      [-30, 30].forEach((u) => addMesh(g, new THREE.BoxGeometry(2, 12, 2), std(0x2a2d34), u, 5, 0));
      g.position.set(x, p.h, z);
      g.scale.setScalar(size);
      // The board's face (+z) toward the road.
      g.rotation.y = Math.atan2(p.x - x, p.y - z);
      g.userData.corner = { board: c.board, d: c.d };
      group.add(g);
      return;
    }
  });
}

function hills(course, group, { tint, count, height, flat }, rand) {
  const b = course.bounds;
  const cx = b.cx;
  const cz = b.cz;
  const rx = (b.maxX - b.minX) / 2 + 900;
  const rz = (b.maxZ - b.minZ) / 2 + 900;
  const mat = std(color(tint), { flatShading: true, roughness: 0.95 });
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.3;
    const d = 1 + rand() * 0.6;
    const h = height[0] + rand() * (height[1] - height[0]);
    const w = h * (flat ? 5 : 2.2) + rand() * 200;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const hill = new THREE.Mesh(geo, mat);
    const depth = w * (0.7 + rand() * 0.6);
    hill.scale.set(w, h, depth);
    // The icosahedron's footprint is at most its larger horizontal radius.
    const spot = pushClear(course, cx + Math.cos(a) * rx * d, cz + Math.sin(a) * rz * d, Math.max(w, depth));
    if (!spot || wet(course, spot.x, spot.z, Math.max(w, depth))) continue;
    hill.position.set(spot.x, -h * 0.15, spot.z);
    hill.rotation.y = rand() * Math.PI;
    hill.receiveShadow = true;
    group.add(hill);
  }
}

function ferrisWheel(group, x, z, radius, { lit = false, rimColour = "#e8e8f0" } = {}) {
  const g = new THREE.Group();
  const steel = std(color(rimColour), { metalness: 0.5, roughness: 0.35, emissive: lit ? color(rimColour) : new THREE.Color(0), emissiveIntensity: lit ? 0.8 : 0 });
  const hubY = radius + 14;
  const wheel = new THREE.Group();
  wheel.position.y = hubY;
  [-4, 4].forEach((z0) => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 1.2, 8, 64), steel);
    rim.position.z = z0;
    wheel.add(rim);
  });
  for (let s = 0; s < 16; s += 1) {
    const a = (s / 16) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, radius, 4), steel);
    spoke.position.set(Math.cos(a) * radius / 2, Math.sin(a) * radius / 2, 0);
    spoke.rotation.z = a - Math.PI / 2;
    wheel.add(spoke);
  }
  const cabins = [];
  for (let s = 0; s < 24; s += 1) {
    const a = (s / 24) * Math.PI * 2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 5), std(color(TEAM_COLOURS[s % TEAM_COLOURS.length]), { emissive: lit ? 0x443322 : 0x000000 }));
    cab.position.set(Math.cos(a) * radius, Math.sin(a) * radius - 4, 0);
    wheel.add(cab);
    cabins.push(cab);
  }
  g.add(wheel);
  [-1, 1].forEach((side) => {
    [-1, 1].forEach((lean) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, hubY * 1.08, 6), steel);
      leg.position.set(lean * hubY * 0.2, hubY / 2, side * 10);
      leg.rotation.z = lean * -0.38;
      leg.castShadow = true;
      g.add(leg);
    });
  });
  g.position.set(x, 0, z);
  g.userData.animate = (dt) => {
    wheel.rotation.z += dt * 0.05;
    cabins.forEach((c) => { c.rotation.z = -wheel.rotation.z; });
  };
  group.add(g);
  return g;
}

// Buildings along the circuit, as one instanced mesh.
function streetBlocks(course, group, rand, { rows, height, depth, width, palette, night, glass, maxCount, spacing = 7, setback = 6, lit }) {
  const mat = buildingMaterial({ night, glass, litShare: lit ?? 0.45 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, maxCount);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let count = 0;
  const { samples } = course;
  for (let row = 0; row < rows; row += 1) {
    for (let i = 0; i < samples.length && count < maxCount; i += spacing) {
      const p = samples[i];
      if (p.h > 0.5) continue;
      for (const side of [-1, 1]) {
        if (count >= maxCount) break;
        const d = depth[0] + rand() * (depth[1] - depth[0]);
        const w = width[0] + rand() * (width[1] - width[0]);
        const h = (height[0] + rand() * (height[1] - height[0])) * (1 + row * 0.5);
        const outer = side > 0 ? p.outerR : p.outerL;
        const off = side * (outer + setback + row * (depth[1] + 14) + d / 2 + rand() * 10);
        const x = p.x + p.nx * off;
        const z = p.y + p.ny * off;
        const angle = Math.atan2(p.ty, p.tx);
        if (!footprintClear(course, x, z, angle, w / 2, d / 2, 3)) continue;
        const r = Math.max(w, d) / 2;
        if (course.occupied.blocked(x, z, r * 0.8)) continue;
        course.occupied.add(x, z, r * 0.8);
        q.setFromAxisAngle(up, -angle);
        m.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(w, h, d));
        mesh.setMatrixAt(count, m);
        mesh.setColorAt(count, color(palette[Math.floor(rand() * palette.length)]));
        count += 1;
      }
    }
  }
  mesh.count = count;
  group.add(mesh);
  return count;
}

// A ring of towers out past the circuit, for a city on the horizon.
function skyline(course, group, rand, { night, count = 90, arc = [0, Math.PI * 2], height = [80, 320] }) {
  const b = course.bounds;
  const mat = buildingMaterial({ night, glass: night ? "#1a2238" : "#7d95b0", litShare: 0.55 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const rx = (b.maxX - b.minX) / 2 + 1300;
  const rz = (b.maxZ - b.minZ) / 2 + 1300;
  const palette = night ? ["#3a3f4a", "#2c3240", "#4a4e58"] : ["#c9ccd2", "#aeb4bd", "#e1e3e6", "#9aa3ad"];
  let placed = 0;
  for (let i = 0; i < count; i += 1) {
    const a = arc[0] + rand() * (arc[1] - arc[0]);
    const d = 1 + rand() * 0.35;
    const w = 40 + rand() * 60;
    const h = height[0] + rand() * (height[1] - height[0]);
    const depth = w * (0.6 + rand() * 0.8);
    const spot = pushClear(course, b.cx + Math.cos(a) * rx * d, b.cz + Math.sin(a) * rz * d, Math.hypot(w, depth) / 2, 60);
    if (!spot || wet(course, spot.x, spot.z, Math.hypot(w, depth) / 2)) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    m.compose(new THREE.Vector3(spot.x, h / 2, spot.z), q, new THREE.Vector3(w, h, depth));
    mesh.setMatrixAt(placed, m);
    mesh.setColorAt(placed, color(palette[placed % palette.length]));
    placed += 1;
  }
  mesh.count = placed;
  group.add(mesh);
}

// A floodlight's pool of light on the road: soft, warm, added to what is
// there. Lying on the ground, it is not scenery over the track.
let poolTexture = null;
function lightPoolTexture() {
  if (!poolTexture) {
    poolTexture = canvasTexture(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, "rgba(255,244,214,1)");
      grad.addColorStop(0.55, "rgba(255,236,196,0.45)");
      grad.addColorStop(1, "rgba(255,230,190,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }, { repeat: false });
  }
  return poolTexture;
}

function floodlights(course, group, venue) {
  const poleMat = std(0x33333a);
  const headMat = std(0xffffff, { emissive: 0xfff4d0, emissiveIntensity: 3 });
  // Brighter pools at night than at dusk.
  const poolMat = new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: venue.night ? 0.32 : 0.14, toneMapped: false });
  const every = 26;
  const { samples } = course;
  const parts = { poles: [], heads: [], pools: [] };
  let open = 0;
  for (let i = 0; i < samples.length; i += every) {
    const p = samples[i];
    const side = (i / every) % 2 ? 1 : -1;
    // Past the barrier (it stands 2 beyond the run-off's edge) by 10.
    const off = side * ((side > 0 ? p.outerR : p.outerL) + 12);
    const x = p.x + p.nx * off;
    const z = p.y + p.ny * off;
    // (No room at all where two stretches share their run-off.)
    if (course.clearance(x, z) < 8) continue;
    open += 1;
    if (course.occupied.blocked(x, z, 3)) continue;
    course.occupied.add(x, z, 4);
    parts.poles.push(new THREE.CylinderGeometry(0.9, 1.3, 70, 6).translate(x, p.h + 35, z));
    // Lamp head sits behind the pole, never out over the run-off.
    parts.heads.push(new THREE.BoxGeometry(10, 3, 4).rotateY(-Math.atan2(p.ty, p.tx)).translate(x + p.nx * side * 3, p.h + 70, z + p.ny * side * 3));
    // Its light falls across the near half of the road.
    const reach = side * course.width * 0.35;
    parts.pools.push(new THREE.PlaneGeometry(110, 110).rotateX(-Math.PI / 2).translate(p.x + p.nx * reach, p.h + 0.3, p.y + p.ny * reach));
  }
  if (!parts.poles.length) return;
  // One mesh each for the poles, the lamps and the pools of light.
  const poles = new THREE.Mesh(mergeGeometries(parts.poles), poleMat);
  poles.name = "floodlights";
  poles.userData.count = parts.poles.length;
  // Out of how many spots with room by the barrier (for the checks: few
  // taken by anything else).
  poles.userData.spots = open;
  poles.castShadow = true;
  const heads = new THREE.Mesh(mergeGeometries(parts.heads), headMat);
  const pools = new THREE.Mesh(mergeGeometries(parts.pools), poolMat);
  pools.userData.ground = true;
  pools.renderOrder = 1;
  group.add(poles, heads, pools);
}

// The sea along one side of the circuit, toward `bearing` (0 east, PI/2
// south): everything past the circuit's furthest reach that way, with a beach
// in front of it. Nothing grows in it.
function coastline(course, group, { bearing, tint = "#2a6f96", sand = "#cdbb94" }) {
  const ux = Math.cos(bearing);
  const uz = Math.sin(bearing);
  // The furthest the circuit reaches that way: its barriers, the pit
  // complex out to the back of the garages, and the track data's grandstands,
  // billboards and towers (they stand on land).
  let far = -Infinity;
  course.samples.forEach((p) => {
    far = Math.max(far, p.x * ux + p.y * uz + Math.max(p.outerL, p.outerR) + 60);
  });
  (course.track.decor || []).forEach((d) => {
    far = Math.max(far, d.x * ux + d.y * uz + 90);
  });
  const shore = far + 40;
  // Remembered, so the hills and the skyline stay on land (wet).
  (course.seas = course.seas || []).push({ ux, uz, shore });
  const size = 40000;
  const b = course.bounds;
  const along = b.cx * ux + b.cz * uz;
  const at = (dist) => [b.cx + ux * (dist - along), b.cz + uz * (dist - along)];
  const [wx, wz] = at(shore + size / 2);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).rotateY(-bearing), waterMaterial(tint));
  sea.position.set(wx, 0.08, wz);
  sea.userData.ground = true;
  sea.name = "sea";
  group.add(sea);
  const [sx, sz] = at(shore - 20);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(60, size).rotateX(-Math.PI / 2).rotateY(-bearing), new THREE.MeshStandardMaterial({ color: color(sand), roughness: 1 }));
  beach.position.set(sx, 0.05, sz);
  beach.receiveShadow = true;
  beach.userData.ground = true;
  group.add(beach);
  // Keep the trees and everything after out of the water: discs over the
  // sea as far as anything is ever placed (the trees' pad round the circuit).
  const reach = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 1600;
  // (Circles of 90 from 50 out: the claim starts at the beach, never inside
  // the barriers, where the floodlights and marshal posts stand.)
  for (let d = shore + 50; d < shore + 1400; d += 120) {
    for (let t = -reach; t <= reach; t += 120) {
      const [x, z] = at(d);
      course.occupied.add(x - uz * t, z + ux * t, 90);
    }
  }
}

// ---------------------------------------------------------------------------
// Landmarks built in Blender (assets/landmarks/*.glb, r3d/models.js)
// ---------------------------------------------------------------------------

// Landmarks are modelled in metres and drawn at the city's scale: its
// windows are 8 units a storey (buildingMaterial), about 2.5 units a metre
// (docs/superpowers/specs/2026-10-01-trackside-blender-design.md).
export { LANDMARK_SCALE };

// Facades with a grid of rooms read off the model's UVs (metres: u along
// the wall, v up): glass between the floor slabs and mullions, and at night
// a share of the rooms lit, warm and a few cool.
// floors: how much a room's light follows its floor's (1: whole floors
// together, an office; lower: a hotel, its rooms each their own).
function facadeMaterial(night, { glass = "#3e5a78", slab = "#c9cdd2", lit = 0.55, floors = 0.65 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.35 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlass = { value: color(glass) };
    shader.uniforms.uSlab = { value: color(slab) };
    shader.uniforms.uNight = { value: night ? 1 : 0 };
    shader.uniforms.uLit = { value: lit };
    shader.uniforms.uFloors = { value: floors };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFacade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n// glTF flips v: back to metres up the wall.\nvFacade = vec2(uv.x, 1.0 - uv.y);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 vFacade; uniform vec3 uGlass; uniform vec3 uSlab; uniform float uNight; uniform float uLit; uniform float uFloors;
        float facadeHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        // Rooms 4 m wide, floors 3.2 m: the glass in an inset, its frame
        // and the floor slab round it (the technique of the user's Chicago
        // city, not its assets).
        vec2 cell = vec2(vFacade.x / 4.0, vFacade.y / 3.2);
        vec2 f = fract(cell);
        vec2 room = floor(cell);
        // Where a room is smaller than a pixel or two, the wall's average
        // instead of its pattern: no shimmer, no noise far away; nearer, the
        // frames' edges soften by a pixel's width so they never alias.
        float fw = max(fwidth(cell.x), fwidth(cell.y));
        // (Slim mullions, broad floor slabs: the floors read as bands.)
        float glassIn = smoothstep(0.015 - fw, 0.04 + fw, f.x) * smoothstep(0.015 - fw, 0.04 + fw, 1.0 - f.x)
          * smoothstep(0.16 - fw, 0.24 + fw, f.y) * smoothstep(0.03 - fw, 0.08 + fw, 1.0 - f.y);
        float farAway = smoothstep(0.22, 0.55, fw);
        float glassShare = 0.78;
        float inset = mix(glassIn, glassShare, farAway);
        diffuseColor.rgb = mix(uSlab, uGlass, inset);
        // The walls darken toward the ground (the light reaches less of them).
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 14.0, vFacade.y));
        // Whole floors light together (a hotel's evening), a room here and
        // there apart from its floor.
        float floorH = facadeHash(vec2(room.y * 0.37, 7.1));
        float roomH = facadeHash(room + floor(vFacade.x / 37.0));
        float lit = step(mix(roomH, floorH, uFloors), uLit) * step(5.0, vFacade.y);
        // A lit room is not a lamp-bright tile: its curtains drawn part way
        // (the light across some of the glass, softened at its edge), lit
        // brighter low in the room than at the ceiling, each its own
        // brightness; the unlit glass carries the glow of the lit around it
        // a little (Chicago's window shading, in spirit).
        float curtain = 0.35 + 0.65 * facadeHash(room * 2.3 + 1.7);
        float side = facadeHash(room + 4.4) < 0.5 ? f.x : 1.0 - f.x;
        float drawn = smoothstep(curtain + 0.06 + fw, curtain - 0.06 - fw, side);
        float glow = mix(1.0, 0.7, smoothstep(0.24, 0.95, f.y));
        float level = (0.45 + 0.4 * roomH) * glow;
        float near = lit * level * glassIn * mix(0.25, 1.0, drawn);
        float on = mix(near, uLit * 0.42 * glassShare, farAway);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        vec3 roomLight = mix(vec3(1.0, 0.74, 0.44), vec3(0.85, 0.9, 1.0), step(0.9, facadeHash(vec2(room.y, 5.7))));
        // The unlit rooms keep a faint glow from the corridors.
        totalEmissiveRadiance += (roomLight * on * 0.55 + vec3(0.05, 0.045, 0.04) * inset) * uNight;`);
  };
  m.customProgramCacheKey = () => `facade-v6-${night ? 1 : 0}-${glass}-${lit}-${floors}`;
  return m;
}

// A landmark's own materials, lit for the venue by their role.
function dressLandmark(model, venue) {
  const made = new Map();
  const night = Boolean(venue.night);
  const dressed = (src) => {
    if (made.has(src.name)) return made.get(src.name);
    let out;
    // At night the glass reads dark and the rooms carry the tower.
    if (src.name === "facade") out = facadeMaterial(night, night ? { glass: "#22303f", slab: "#3a4049", lit: 0.5, floors: 0.45 } : {});
    else {
      out = src.clone();
      if (src.name === "window_lit") Object.assign(out, { emissive: color(night ? "#ffe6c0" : "#000000"), emissiveIntensity: night ? 1.6 : 0 });
      // The Flyer's rim: its lights at night.
      if (src.name === "led") Object.assign(out, { emissive: color("#bfe4ff"), emissiveIntensity: night ? 1.3 : 0 });
      if (src.name === "pool") Object.assign(out, { emissive: color("#3fb4e8"), emissiveIntensity: night ? 1.4 : 0.1 });
      if (src.name === "glass") Object.assign(out, { roughness: 0.12, metalness: 0.5, emissive: color("#ffcf8a"), emissiveIntensity: night ? 0.35 : 0 });
      if (src.name === "gold") Object.assign(out, { metalness: 0.9, roughness: 0.3 });
      // The SkyPark's hull at night: dark, so its band of light reads.
      if (src.name === "skypark" && night) out.color = color("#454b55");
    }
    out.name = src.name;
    out.userData.worldOwned = true;
    made.set(src.name, out);
    return out;
  };
  model.traverse((m) => {
    if (!m.isMesh) return;
    m.material = dressed(m.material);
    m.castShadow = true;
    m.receiveShadow = true;
  });
}

// A rectangle (in the model's metres) per named part, as the model has it.
function partRects(template, names) {
  template.updateMatrixWorld(true);
  return names.map((n) => {
    const node = template.getObjectByName(n);
    const box = new THREE.Box3().setFromObject(node);
    return { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z };
  });
}

// Grid points over a rectangle placed at (x, z) turned by yaw, `step` apart.
function rectPoints(rect, scale, x, z, yaw, step) {
  const pts = [];
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const nx = Math.max(1, Math.ceil(((rect.x1 - rect.x0) * scale) / step));
  const nz = Math.max(1, Math.ceil(((rect.z1 - rect.z0) * scale) / step));
  for (let i = 0; i <= nx; i += 1) {
    for (let k = 0; k <= nz; k += 1) {
      const lx = (rect.x0 + ((rect.x1 - rect.x0) * i) / nx) * scale;
      const lz = (rect.z0 + ((rect.z1 - rect.z0) * k) / nz) * scale;
      pts.push([x + lx * cs + lz * sn, z - lx * sn + lz * cs]);
    }
  }
  return pts;
}

// Place a model beside the circuit with its front (-z) to the track: tries
// lap distances, sides and gaps in turn until every rectangle's ground is
// clear of the circuit (by `margin`) and of everything placed; then claims it.
// With `forecourt`, the ground between the barrier and the model's front is
// claimed too, so nothing else is built in front of it.
// With `gapFirst`, nearest the barrier wins: each gap is tried at every
// anchor before the next gap; otherwise the nearest anchor wins.
function placeModel(course, { rects, scale, anchors, gaps, margin = 12, step = 14, forecourt = false, gapFirst = false }) {
  const total = course.track.totalLength;
  const front = Math.min(...rects.map((r) => r.z0)) * scale;
  const tries = gapFirst
    ? gaps.flatMap((gap) => anchors.map((a) => ({ ...a, gap })))
    : anchors.flatMap((a) => gaps.map((gap) => ({ ...a, gap })));
  for (const { d, side, gap } of tries) {
    const p = course.sampleAt(((d % total) + total) % total);
    const off = side * ((side > 0 ? p.outerR : p.outerL) + 2 + gap - front);
    const x = p.x + p.nx * off;
    const z = p.y + p.ny * off;
    const yaw = Math.atan2(x - p.x, z - p.y);
    // Each part's own ground in front of it, out to the barrier's margin.
    const court = forecourt ? rects.map((r) => ({ x0: r.x0, x1: r.x1, z0: (front - Math.max(0, gap - margin - 4)) / scale, z1: r.z0 })) : [];
    const pts = [...rects, ...court].flatMap((r) => rectPoints(r, scale, x, z, yaw, step));
    if (pts.some(([px, pz]) => course.clearance(px, pz) < margin || course.occupied.blocked(px, pz, step * 0.5))) continue;
    pts.forEach(([px, pz]) => course.occupied.add(px, pz, step * 0.75));
    return { x, z, yaw, p, side, claimed: [...rects, ...court] };
  }
  return null;
}

// Lap distances round an anchor (a share of the lap), nearest first, on the
// given sides.
function anchorsAround(course, share, spread, sides) {
  const total = course.track.totalLength;
  const out = [];
  for (let k = 0; k <= 12; k += 1) {
    [1, -1].forEach((sgn) => {
      if (k === 0 && sgn < 0) return;
      const d = total * share + sgn * k * spread;
      sides(course.sampleAt(((d % total) + total) % total)).forEach((side) => out.push({ d, side }));
    });
  }
  return out;
}

// A landmark from its model, placed with placeModel (its whole footprint,
// or the named parts' rectangles), dressed for the venue. Returns it, or
// null (no model, or no room: the caller falls back to its stand-in).
function modelLandmark(course, group, venue, { name, model, parts, anchors, gaps, margin, forecourt = false, gapFirst = false, step }) {
  const template = tracksideModel(model);
  if (!template) return null;
  let rects;
  if (parts) rects = partRects(template, parts);
  else {
    template.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(template);
    rects = [{ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }];
  }
  const spot = placeModel(course, { rects, scale: LANDMARK_SCALE, gaps, anchors, margin, forecourt, gapFirst, step });
  if (!spot) return null;
  const made = template.clone(true);
  dressLandmark(made, venue);
  made.scale.setScalar(LANDMARK_SCALE);
  made.position.set(spot.x, 0, spot.z);
  made.rotation.y = spot.yaw;
  made.name = `landmark:${name}`;
  made.userData.landmark = { name, fromModel: true, yaw: spot.yaw, trackAt: { x: Math.round(spot.p.x), z: Math.round(spot.p.y), d: Math.round(spot.p.d) } };
  group.add(made);
  return made;
}

// The middle of the pit lane's zone (a lap distance), or null.
function pitMiddle(course) {
  const lane = course.pitLane;
  if (!lane) return null;
  const inZone = course.samples.filter((p) => lane.outerAt(p.d) !== null);
  return inZone.length ? inZone[Math.floor(inZone.length / 2)].d : null;
}

// The Casino de Monte-Carlo and the Hôtel de Paris, at Casino Square: about
// a third of the lap, on the outside of the bend (else its inside), the
// square paved in front of them.
function casinoModel(course, group, venue) {
  const template = tracksideModel("casino");
  if (!template) return false;
  const rects = partRects(template, ["casino", "hotel_de_paris"]);
  const spot = placeModel(course, {
    rects, scale: LANDMARK_SCALE, gaps: [8, 20, 35, 55, 80, 110], forecourt: true, gapFirst: true,
    anchors: anchorsAround(course, 0.33, 60, (p) => (p.curve > 0 ? [-1, 1] : [1, -1])),
  });
  if (!spot) return false;
  const model = template.clone(true);
  dressLandmark(model, venue);
  model.scale.setScalar(LANDMARK_SCALE);
  model.position.set(spot.x, 0, spot.z);
  model.rotation.y = spot.yaw;
  model.name = "landmark:casino";
  model.userData.landmark = { name: "casino", fromModel: true, yaw: spot.yaw, trackAt: { x: Math.round(spot.p.x), z: Math.round(spot.p.y), d: Math.round(spot.p.d) } };
  // The square: paving under the casino and the hotel and in front of them,
  // exactly the ground they claimed.
  const paving = new THREE.MeshStandardMaterial({ map: photo("concrete_floor_02", 4, 4), color: color("#d8cdb8"), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  paving.userData.worldOwned = true;
  const pad = new THREE.Mesh(
    mergeGeometries(spot.claimed.map((r) => new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2).translate((r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2))),
    paving,
  );
  pad.receiveShadow = true;
  pad.userData.ground = true;
  model.add(pad);
  group.add(model);
  return true;
}

// Marina Bay Sands across the water from the pit straight, on the side away
// from the pits, the bay between it and the circuit.
function marinaBaySandsModel(course, group, venue) {
  const template = tracksideModel("marinaBaySands");
  if (!template) return false;
  const rects = partRects(template, ["tower_1", "tower_2", "tower_3", "skypark"]);
  const lane = course.pitLane;
  const away = lane ? -lane.side : 1;
  // The bay in front: from the barrier to the towers' feet.
  const bayDepth = 110;
  const front = Math.min(...rects.map((r) => r.z0));
  const span = rects.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), x1: Math.max(a.x1, r.x1) }), { x0: Infinity, x1: -Infinity });
  const bay = { x0: span.x0, x1: span.x1, z0: front - bayDepth, z1: front - 4 };
  const spot = placeModel(course, {
    rects: [...rects, bay], scale: LANDMARK_SCALE, gaps: [15, 40, 80, 130, 200, 300], step: 24,
    anchors: anchorsAround(course, 0, 120, () => [away, -away]),
  });
  if (!spot) return false;
  const model = template.clone(true);
  dressLandmark(model, venue);
  model.scale.setScalar(LANDMARK_SCALE);
  model.position.set(spot.x, 0, spot.z);
  model.rotation.y = spot.yaw;
  model.name = "landmark:marinaBaySands";
  // Its bay (model metres), for the yachts at anchor.
  model.userData.bay = bay;
  model.userData.landmark = { name: "marinaBaySands", fromModel: true, yaw: spot.yaw, trackAt: { x: Math.round(spot.p.x), z: Math.round(spot.p.y), d: Math.round(spot.p.d) } };
  const bayWater = waterMaterial("#0e2238");
  bayWater.userData.worldOwned = true;
  const water = new THREE.Mesh(
    // The bay: exactly the ground claimed for it.
    new THREE.PlaneGeometry(bay.x1 - bay.x0, bay.z1 - bay.z0).rotateX(-Math.PI / 2).translate((bay.x0 + bay.x1) / 2, 0.05, (bay.z0 + bay.z1) / 2),
    bayWater,
  );
  water.userData.ground = true;
  model.add(water);
  // The bay's stone edge, a promenade round the water (inside the ground it claimed).
  const edge = new THREE.MeshStandardMaterial({ color: color("#8d8a84"), roughness: 0.9 });
  edge.userData.worldOwned = true;
  const kerb = (w, d, x, z) => new THREE.BoxGeometry(w, 0.8, d).translate(x, 0.4, z);
  const bw = bay.x1 - bay.x0;
  const bd = bay.z1 - bay.z0;
  const cx = (bay.x0 + bay.x1) / 2;
  const cz = (bay.z0 + bay.z1) / 2;
  const promenade = new THREE.Mesh(mergeGeometries([
    kerb(bw, 3, cx, bay.z0 + 1.5), kerb(bw, 3, cx, bay.z1 - 1.5),
    kerb(3, bd, bay.x0 + 1.5, cz), kerb(3, bd, bay.x1 - 1.5, cz),
  ]), edge);
  promenade.receiveShadow = true;
  model.add(promenade);
  group.add(model);
  return true;
}

// ---------------------------------------------------------------------------
// Circuit-specific landmarks
// ---------------------------------------------------------------------------

const EXTRAS = {
  // Spa: the old pit building at the foot of Eau Rouge.
  spaPits(course, group, venue) {
    modelLandmark(course, group, venue, {
      name: "spaPits", model: "spaPits", gaps: [10, 22, 40, 70, 110],
      anchors: anchorsAround(course, 0.06, 40, () => [1, -1]),
    });
  },

  // Silverstone: the Wing, the pit and paddock building, behind the garages.
  silverstoneWing(course, group, venue) {
    const mid = pitMiddle(course);
    const side = course.pitLane ? course.pitLane.side : 1;
    modelLandmark(course, group, venue, {
      name: "silverstoneWing", model: "silverstoneWing", gaps: [10, 30, 60, 100, 160, 240], step: 20,
      anchors: anchorsAround(course, (mid ?? 0) / course.track.totalLength, 40, () => [side, -side]),
    });
  },

  // São Paulo: two of its towers on the skyline.
  spTowers(course, group, venue) {
    modelLandmark(course, group, venue, {
      name: "spTowers", model: "spTowers", gaps: [380, 520, 700, 900], step: 30,
      anchors: anchorsAround(course, 0.5, 200, () => [1, -1]),
    });
  },

  // The old high-speed banking, left standing in the park.
  monzaBanking(course, group, venue) {
    // The old banking stands in the park inside the lap.
    const lap = modelLandmark(course, group, venue, {
      name: "monzaBanking", model: "monzaBanking", gaps: [14, 30, 60, 100, 160, 240, 340], step: 24, gapFirst: true,
      anchors: anchorsAround(course, 0.3, 90, (p) => (p.curve > 0 ? [1, -1] : [-1, 1])),
    });
    if (lap) return;
    const b = course.bounds;
    const spot = course.findSpot(b.cx + 200, b.cz - 200, 230, 1400, 20);
    if (!spot) return;
    const radius = 200;
    const pos = [];
    const idx = [];
    const steps = 48;
    const span = Math.PI * 0.9;
    for (let s = 0; s <= steps; s += 1) {
      const a = -span / 2 + (s / steps) * span;
      [[radius - 30, 0], [radius + 30, 30]].forEach(([r, y]) => pos.push(spot.x + Math.cos(a) * r, y, spot.z + Math.sin(a) * r));
      if (s > 0) {
        const i = s * 2;
        idx.push(i - 2, i, i - 1, i - 1, i, i + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, std(0xa8a49a, { side: THREE.DoubleSide, roughness: 0.95 }));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
  },

  // Airfield hangars across the infield.
  hangars(course, group, venue, rand) {
    const b = course.bounds;
    for (let i = 0; i < 4; i += 1) {
      const spot = course.findSpot(b.minX + rand() * (b.maxX - b.minX), b.minZ + rand() * (b.maxZ - b.minZ), 60, 700, 20);
      if (!spot) continue;
      const hangar = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 90, 20, 1, false, 0, Math.PI), std(0x9aa0a6, { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
      hangar.rotation.set(0, rand() * Math.PI, Math.PI / 2);
      hangar.rotation.order = "YXZ";
      hangar.position.set(spot.x, 0, spot.z);
      hangar.castShadow = true;
      group.add(hangar);
    }
  },

  ferrisWheel(course, group, venue) {
    // The amusement park's wheel, beyond the main straight.
    const away = course.pitLane ? -course.pitLane.side : 1;
    if (modelLandmark(course, group, venue, {
      name: "suzukaWheel", model: "suzukaWheel", gaps: [40, 80, 140, 220, 320, 450],
      anchors: anchorsAround(course, 0.0, 90, () => [away, -away]),
    })) return null;
    const s = course.samples[0];
    const spot = course.findSpot(s.x + s.nx * 420, s.y + s.ny * 420, 80, 1200, 20);
    if (spot) return ferrisWheel(group, spot.x, spot.z, 70);
    return null;
  },

  // Monaco: the circuit runs on a strip of town between the harbour and the
  // hill, lined with apartment blocks.
  monacoCity(course, group, venue, rand) {
    const land = new THREE.MeshStandardMaterial({ map: photo("concrete_floor_02", 1, 1), color: color("#d6cfc2"), roughness: 0.95, side: THREE.DoubleSide });
    const plate = new THREE.Mesh(ribbon(course.samples, (p) => -(p.outerL + 190), (p) => p.outerR + 190, 0.01, 80), land);
    plate.receiveShadow = true;
    plate.userData.ground = true;
    group.add(plate);
    streetBlocks(course, group, rand, {
      rows: 2, height: [26, 70], depth: [38, 64], width: [30, 58], maxCount: 700, spacing: 6,
      palette: ["#f1dcc0", "#e9c9a0", "#f6e8d0", "#dba98c", "#f0d0b4", "#e6d6b6", "#fff1dc", "#d9c2a4"],
      night: false, glass: "#5b7690",
    });
  },

  yachts(course, group, venue, rand) {
    if (buildYachts(course, group, venue, rand)) return;
    if (!venue.harbour || venue.harbour.anchorIn) return;
    const b = course.bounds;
    const hullMat = std(0xffffff, { roughness: 0.3 });
    const count = 60;
    const hulls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), hullMat, count);
    const cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0x2a3a4a, { roughness: 0.2, metalness: 0.4 }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    for (let t = 0; t < 2000 && placed < count; t += 1) {
      const x = b.minX - 400 + rand() * (b.maxX - b.minX + 800);
      const z = b.minZ - 400 + rand() * (b.maxZ - b.minZ + 800);
      if (course.clearance(x, z, 320) < 215) continue;
      if (course.occupied.blocked(x, z, 22)) continue;
      course.occupied.add(x, z, 22);
      const len = 24 + rand() * 30;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      m.compose(new THREE.Vector3(x, 2.5, z), q, new THREE.Vector3(len, 5, len * 0.28));
      hulls.setMatrixAt(placed, m);
      m.compose(new THREE.Vector3(x, 7, z), q, new THREE.Vector3(len * 0.5, 4, len * 0.2));
      cabins.setMatrixAt(placed, m);
      placed += 1;
    }
    hulls.count = cabins.count = placed;
    hulls.castShadow = true;
    group.add(hulls, cabins);
  },

  mountains(course, group, venue, rand) {
    const b = course.bounds;
    const mat = std(0x8f8a78, { flatShading: true, roughness: 1 });
    for (let i = 0; i < 9; i += 1) {
      const h = 380 + rand() * 520;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
      hill.scale.set(h * 1.6, h, h * 1.2);
      const spot = pushClear(course, b.minX - 300 + (i / 8) * (b.maxX - b.minX + 600), b.minZ - 900 - rand() * 400, h * 1.6);
      if (!spot) continue;
      hill.position.set(spot.x, -h * 0.1, spot.z);
      group.add(hill);
    }
  },

  casino(course, group, venue) {
    if (casinoModel(course, group, venue)) return;
    const b = course.bounds;
    const spot = course.findSpot(b.cx, b.minZ + 150, 52, 900, 8);
    if (!spot) return;
    const g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(80, 26, 50), std(0xf1e4c8), 0, 13, 0);
    [-28, 28].forEach((x) => {
      addMesh(g, new THREE.BoxGeometry(14, 42, 14), std(0xeadbbd), x, 21, -14);
      addMesh(g, new THREE.SphereGeometry(7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x6f8f7a, { metalness: 0.4 }), x, 42, -14);
    });
    addMesh(g, new THREE.SphereGeometry(14, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x7f9e88, { metalness: 0.4 }), 0, 26, 0);
    g.position.set(spot.x, 0, spot.z);
    g.name = "landmark:casino";
    g.userData.landmark = { name: "casino", fromModel: false };
    group.add(g);
  },

  singaporeCity(course, group, venue, rand) {
    streetBlocks(course, group, rand, {
      rows: 2, height: [50, 170], depth: [40, 70], width: [36, 64], maxCount: 520, spacing: 9, setback: 12,
      palette: ["#4a5566", "#5a6070", "#3c4452", "#6a7280", "#50586a"],
      night: true, glass: "#1d2a40", lit: 0.3,
    });
  },

  marinaBaySands(course, group, venue) {
    if (marinaBaySandsModel(course, group, venue)) return;
    const b = course.bounds;
    const spot = course.findSpot(b.maxX + 120, b.cz, 128, 1400, 20);
    if (!spot) return;
    const g = new THREE.Group();
    const mat = buildingMaterial({ night: true, glass: "#22304a", litShare: 0.7 });
    [-55, 0, 55].forEach((x) => {
      const t = addMesh(g, new THREE.BoxGeometry(26, 200, 60), mat, x, 100, 0);
      t.material.color = color("#9aa4b0");
    });
    addMesh(g, new THREE.BoxGeometry(220, 8, 32), std(0xd0d4da, { emissive: 0x334466, emissiveIntensity: 0.6 }), 10, 206, 0);
    const lights = addMesh(g, new THREE.BoxGeometry(221, 1.5, 33), std(0x88ccff, { emissive: 0x66aaff, emissiveIntensity: 1.5 }), 10, 202, 0);
    lights.castShadow = false;
    g.position.set(spot.x, 0, spot.z);
    g.rotation.y = 0.4;
    g.name = "landmark:marinaBaySands";
    g.userData.landmark = { name: "marinaBaySands", fromModel: false };
    group.add(g);
    // The bay beside it.
    const baySpot = pushClear(course, spot.x + 650, spot.z, 700, 20);
    if (baySpot) {
      const bay = new THREE.Mesh(new THREE.CircleGeometry(700, 48), waterMaterial("#0e2238"));
      bay.rotation.x = -Math.PI / 2;
      bay.position.set(baySpot.x, 0.05, baySpot.z);
      group.add(bay);
    }
  },

  flyer(course, group, venue) {
    // Where it really stands: beside the pit building by the start, on the
    // pit side (Marina Bay Sands is across the water on the other), as near
    // the circuit as the garages allow, the ground between kept clear of the
    // city's blocks so it is seen from the track.
    const side = course.pitLane ? course.pitLane.side : 1;
    if (modelLandmark(course, group, venue, {
      name: "singaporeFlyer", model: "singaporeFlyer", gaps: [30, 60, 100, 150, 220, 320, 440], step: 24,
      forecourt: true, gapFirst: true,
      anchors: anchorsAround(course, 0.0, 60, () => [side]),
    })) return null;
    const b = course.bounds;
    const spot = course.findSpot(b.maxX + 80, b.minZ + 100, 95, 1400, 20);
    return spot ? ferrisWheel(group, spot.x, spot.z, 80, { lit: true, rimColour: "#9fd8ff" }) : null;
  },

  skyline(course, group, venue, rand) {
    skyline(course, group, rand, { night: Boolean(venue.night), count: venue.night ? 120 : 70, arc: venue.night ? [0, Math.PI * 2] : [Math.PI * 1.1, Math.PI * 1.9] });
  },

  floodlights(course, group, venue) {
    floodlights(course, group, venue);
  },

  sakhirTower(course, group, venue) {
    // The VIP tower, behind the pits by the start.
    const side = course.pitLane ? course.pitLane.side : 1;
    if (modelLandmark(course, group, venue, {
      name: "sakhirTower", model: "sakhirTower", gaps: [30, 60, 100, 160, 240, 340],
      anchors: anchorsAround(course, (pitMiddle(course) ?? 0) / course.track.totalLength, 40, () => [side, -side]),
    })) return;
    const s = course.samples[0];
    const spot = course.findSpot(s.x + s.nx * 220, s.y + s.ny * 220, 40, 1200, 16);
    if (!spot) return;
    const g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(24, 150, 24), std(0xd8ccb4), 0, 75, 0);
    addMesh(g, new THREE.BoxGeometry(56, 30, 44), std(0xece2cf), 0, 165, 0);
    addMesh(g, new THREE.BoxGeometry(58, 12, 46), std(0x5f7f9f, { metalness: 0.6, roughness: 0.15, emissive: 0x332211 }), 0, 158, 0);
    addMesh(g, new THREE.ConeGeometry(12, 30, 4), std(0xd8ccb4), 0, 195, 0);
    g.position.set(spot.x, 0, spot.z);
    group.add(g);
  },

  lake(course, group) {
    const b = course.bounds;
    for (const r of [170, 130, 100]) {
      const spot = course.findSpot(b.cx, b.cz, r, 700, 25);
      if (spot) {
        const lake = new THREE.Mesh(new THREE.CircleGeometry(r, 40), waterMaterial("#2f6a7a"));
        lake.rotation.x = -Math.PI / 2;
        lake.scale.set(1, 0.75, 1);
        lake.position.set(spot.x, 0.1, spot.z);
        group.add(lake);
        return;
      }
    }
  },

  // Colourful houses climbing the hills around the circuit.
  favela(course, group, venue, rand) {
    const count = 360;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, { roughness: 0.9 }), count);
    const palette = ["#e8b64a", "#d9603b", "#4f8fc0", "#e6e0cf", "#8fbf6a", "#c75a8a", "#f0d27a"];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    for (let t = 0; t < 6000 && placed < count; t += 1) {
      const p = course.samples[Math.floor(rand() * course.samples.length)];
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * ((side > 0 ? p.outerR : p.outerL) + 120 + rand() * 360);
      const x = p.x + p.nx * off;
      const z = p.y + p.ny * off;
      if (course.clearance(x, z, 200) < 30 || course.occupied.blocked(x, z, 10)) continue;
      course.occupied.add(x, z, 9);
      const w = 12 + rand() * 10;
      const h = 8 + rand() * 14;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      m.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(w, h, w * 0.9));
      mesh.setMatrixAt(placed, m);
      mesh.setColorAt(placed, color(palette[placed % palette.length]));
      placed += 1;
    }
    mesh.count = placed;
    mesh.castShadow = true;
    group.add(mesh);
  },

  // Baku's old city and boulevard: low stone-coloured blocks close along the
  // walls.
  bakuCity(course, group, venue, rand) {
    streetBlocks(course, group, rand, {
      rows: 2, height: [18, 52], depth: [30, 56], width: [26, 52], maxCount: 520, spacing: 7, setback: 8,
      palette: ["#d9c9a6", "#cdb995", "#e3d6b8", "#bfae8a", "#d4c3a0", "#c9b48c"],
      night: false, glass: "#5d7486",
    });
  },

  // The Strip: tall resorts, lit, close along the circuit.
  vegasStrip(course, group, venue, rand) {
    streetBlocks(course, group, rand, {
      rows: 2, height: [60, 200], depth: [40, 80], width: [40, 80], maxCount: 360, spacing: 10, setback: 14,
      palette: ["#d8c79a", "#c9a46a", "#e6dccb", "#9fb3c8", "#c48a9a", "#b9a2d6", "#f0e0b0"],
      night: true, glass: "#2a2440", lit: 0.7,
    });
  },

  // Moored yachts on the infield's water (Yas Marina's harbour).
  lakeYachts(course, group, venue, rand) {
    const water = course.lakes || [];
    if (!water.length) return;
    const count = 40;
    const hulls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, { roughness: 0.3, emissive: venue.night ? 0x222222 : 0x000000 }), count);
    const cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0x2a3a4a, { roughness: 0.2, metalness: 0.4, emissive: venue.night ? 0x664422 : 0x000000 }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const placed = [];
    for (let t = 0; t < 2000 && placed.length < count; t += 1) {
      const disc = water[Math.floor(rand() * water.length)];
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (disc.r - 30);
      const x = disc.x + Math.cos(a) * r;
      const z = disc.z + Math.sin(a) * r;
      const len = 18 + rand() * 26;
      // Clear of the barriers and of each other, by their lengths.
      if (course.clearance(x, z, 120) < 45 || placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.len + len) / 2 + 6)) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      m.compose(new THREE.Vector3(x, 2.2, z), q, new THREE.Vector3(len, 4.5, len * 0.28));
      hulls.setMatrixAt(placed.length, m);
      m.compose(new THREE.Vector3(x, 6, z), q, new THREE.Vector3(len * 0.5, 3.5, len * 0.2));
      cabins.setMatrixAt(placed.length, m);
      placed.push({ x, z, len });
    }
    hulls.count = cabins.count = placed.length;
    hulls.castShadow = true;
    group.add(hulls, cabins);
  },

  // A lake filling the circuit's infield (Albert Park): overlapping discs,
  // the largest that fit first, each clear of the barriers, so the water
  // takes the infield's shape.
  infieldLake(course, group, venue, rand) {
    const { tint = "#3a789e", count = 40 } = venue.lake || {};
    const ring = course.samples;
    const inside = (x, z) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    const b = course.bounds;
    const parts = [];
    for (const r of [320, 260, 210, 170, 130, 100, 75]) {
      for (let t = 0; t < 900 && parts.length < count; t += 1) {
        const x = b.minX + rand() * (b.maxX - b.minX);
        const z = b.minZ + rand() * (b.maxZ - b.minZ);
        if (!inside(x, z) || course.clearance(x, z, r + 120) < r + 45) continue;
        // Join the water already there where it can (one lake, not puddles).
        if (parts.length && !parts.some((q) => Math.hypot(q.x - x, q.z - z) < (q.r + r) * 0.9)) continue;
        // Round the stands and towers already standing in the infield.
        if (course.occupied.blocked(x, z, r + 8)) continue;
        parts.push({ x, z, r });
      }
    }
    if (!parts.length) return;
    const discs = parts.map((q) => new THREE.CircleGeometry(q.r, 40).rotateX(-Math.PI / 2).translate(q.x, 0.1, q.z));
    const lake = new THREE.Mesh(mergeGeometries(discs), waterMaterial(tint));
    lake.userData.ground = true;
    lake.name = "lake";
    group.add(lake);
    // Nothing else stands in the water. (Claimed once all the discs are
    // placed: they overlap each other.) The boats know where it is.
    parts.forEach((q) => course.occupied.add(q.x, q.z, q.r));
    course.lakes = parts;
  },

  // The sea (venue.coast: coastline's settings), on one side or several (an
  // island: Montréal).
  coast(course, group, venue) {
    [].concat(venue.coast).forEach((shore) => coastline(course, group, shore));
  },

  // Towers on the horizon in one direction only (the venue's skyline: an arc
  // of bearings, 0 east, PI/2 south).
  skylineArc(course, group, venue, rand) {
    const { arc, count, height } = venue.skyline;
    skyline(course, group, rand, { night: Boolean(venue.night), count, arc, height });
  },
};

// ---------------------------------------------------------------------------

export function buildLandmarks(course, venue) {
  const group = new THREE.Group();
  const rand = seeded(hashString(course.track.id) ^ 0x5bd1e995);
  const animated = [];
  garages(course, group, venue);
  cornerBoards(course, group, venue);
  (venue.extras || []).forEach((name) => {
    const made = EXTRAS[name]?.(course, group, venue, rand);
    if (made?.userData?.animate) animated.push(made);
  });
  if (venue.hills) hills(course, group, venue.hills, rand);
  (venue.trees || []).forEach((t, i) => {
    group.add(scatterTrees(course, { ...t, night: venue.night, seed: (t.seed || 0) + i * 31 }));
  });
  group.userData.animate = (dt) => animated.forEach((o) => o.userData.animate(dt));
  return group;
}
