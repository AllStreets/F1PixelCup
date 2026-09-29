// What makes each circuit look like where it is.
//
// Every landmark claims its footprint through course.findSpot / course.claim,
// which refuse anything that would touch the circuit or something already
// placed. Nothing here can end up on the track.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, seeded, hashString, canvasTexture, buildingMaterial, photo } from "./textures.js";
import { ribbon, footprintClear, scatterTrees } from "./track.js";

// ---------------------------------------------------------------------------
// Venue settings
// ---------------------------------------------------------------------------

export const VENUES = {
  monza: {
    ground: "grass", groundTint: "#7fa865", standColor: "#dc0000",
    trees: [{ kind: "broadleaf", count: 1300, tint: "#3d7535" }],
    hills: { tint: "#5d7d57", count: 16, height: [120, 260] },
    extras: ["monzaBanking"],
  },
  spa: {
    ground: "grass", groundTint: "#5f8a4d", standColor: "#f2c200",
    trees: [{ kind: "conifer", count: 2000, tint: "#1e4a2a" }, { kind: "conifer", count: 500, tint: "#24522c", near: 90, seed: 7 }],
    hills: { tint: "#2c5232", count: 22, height: [300, 650] },
    fogNear: 700, fogFar: 3200,
  },
  silverstone: {
    ground: "grass", groundTint: "#86ad6a", standColor: "#0a2a6a",
    trees: [{ kind: "broadleaf", count: 380, tint: "#4a7a3a" }],
    hills: { tint: "#6d8a62", count: 10, height: [80, 160] },
    pit: "wing",
    extras: ["hangars"],
  },
  suzuka: {
    ground: "grass", groundTint: "#76a55e", standColor: "#dc0000",
    trees: [{ kind: "broadleaf", count: 900, tint: "#2f6a36" }, { kind: "conifer", count: 300, tint: "#244f2c", seed: 3 }],
    hills: { tint: "#40704a", count: 18, height: [200, 420] },
    extras: ["ferrisWheel"],
  },
  monaco: {
    ground: "water", standColor: "#dc0000",
    trees: [{ kind: "palm", count: 120, tint: "#3f7a3a", near: 60 }],
    extras: ["monacoCity", "yachts", "mountains", "casino"],
    runoffTint: "#b8b4ac",
  },
  singapore: {
    ground: "city", night: true, standColor: "#e03030",
    trees: [{ kind: "broadleaf", count: 140, tint: "#2d5a3a", near: 80 }],
    extras: ["singaporeCity", "marinaBaySands", "flyer", "skyline", "floodlights"],
  },
  bahrain: {
    ground: "sand", standColor: "#b8001f", runoffTint: "#b8a888", gravelTint: "#e0c89a",
    trees: [{ kind: "palm", count: 170, tint: "#5e7a34", near: 140 }],
    hills: { tint: "#c9a36a", count: 26, height: [40, 110], flat: true },
    extras: ["sakhirTower", "floodlights"],
  },
  interlagos: {
    ground: "grass", groundTint: "#79a562", standColor: "#009c3b",
    trees: [{ kind: "broadleaf", count: 650, tint: "#336c33" }],
    hills: { tint: "#56804c", count: 16, height: [160, 320] },
    extras: ["lake", "skyline", "favela"],
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
    inside: std(0x1c1d22, { roughness: 0.9 }),
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
    parts.shell.push(box(30.4, 12, depth, 0, 6, 0));
    // The open door: a dark bay framed in the team's colour, lit inside.
    parts.inside.push(box(24, 9, 0.6, 0, 4.5, -depth / 2 - 0.2));
    const colour = bay.safetyCar ? "#c9ced6" : TEAM_COLOURS[i % TEAM_COLOURS.length];
    if (!frames.has(colour)) frames.set(colour, []);
    frames.get(colour).push(box(26, 1.4, 0.8, 0, 9.7, -depth / 2 - 0.3), box(1.2, 9, 0.8, -12.6, 4.5, -depth / 2 - 0.3), box(1.2, 9, 0.8, 12.6, 4.5, -depth / 2 - 0.3));
    // The hospitality floor, set back a little from the doors.
    parts.glass.push(box(30.4, 10, depth - 2, 0, 17, 1));
    if (wing) {
      // Silverstone's Wing: the roof rises and falls like an aerofoil.
      const lift = Math.sin(((i + 0.5) / g.bays.length) * Math.PI) * 10;
      parts.roof.push(new THREE.BoxGeometry(31, 2, depth).rotateX(-0.12).translate(0, 25 + lift, 0).applyMatrix4(m));
    } else {
      parts.roof.push(box(31, 2, depth, 0, 23, 0));
    }
    // A marker per bay, for the checks (no mesh of its own).
    const marker = new THREE.Object3D();
    marker.applyMatrix4(m);
    marker.userData.bay = { index: i, safetyCar: bay.safetyCar, d: bay.d, depth };
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
  sign.position.set(centre.x + centre.nx * side * face, centre.h + 17, centre.y + centre.ny * side * face);
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
    [1, -1].forEach((which) => [0, -40, 40, -80, 80].forEach((shift) => tries.push([which, shift])));
    for (const [which, shift] of tries) {
      const p = course.sampleAt(((c.d + shift) % total + total) % total);
      const bend = course.sampleAt(c.d);
      const side = (bend.curve > 0 ? -1 : 1) * which;
      const off = side * ((side > 0 ? p.outerR : p.outerL) + 14);
      const x = p.x + p.nx * off;
      const z = p.y + p.ny * off;
      const angle = Math.atan2(p.ty, p.tx);
      if (!footprintClear(course, x, z, angle, 38, 4, 6) || course.occupied.blocked(x, z, 38)) continue;
      course.occupied.add(x, z, 38);
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
        cx.fillText(c.board, w / 2, c.aka ? 96 : 118);
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
    if (!spot) continue;
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
    if (!spot) continue;
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
  for (let i = 0; i < samples.length; i += every) {
    const p = samples[i];
    const side = (i / every) % 2 ? 1 : -1;
    const off = side * ((side > 0 ? p.outerR : p.outerL) + 9);
    const x = p.x + p.nx * off;
    const z = p.y + p.ny * off;
    if (course.occupied.blocked(x, z, 3) || course.clearance(x, z) < 8) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 70, 6), poleMat);
    pole.position.set(x, p.h + 35, z);
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 4), headMat);
    // Lamp head sits behind the pole, never out over the run-off.
    head.position.set(x + p.nx * side * 3, p.h + 70, z + p.ny * side * 3);
    head.rotation.y = -Math.atan2(p.ty, p.tx);
    group.add(head);
    // Its light falls across the near half of the road.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), poolMat);
    const reach = side * course.width * 0.35;
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x + p.nx * reach, p.h + 0.3, p.y + p.ny * reach);
    pool.userData.ground = true;
    pool.renderOrder = 1;
    group.add(pool);
  }
}

// ---------------------------------------------------------------------------
// Circuit-specific landmarks
// ---------------------------------------------------------------------------

const EXTRAS = {
  // The old high-speed banking, left standing in the park.
  monzaBanking(course, group) {
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

  ferrisWheel(course, group) {
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

  casino(course, group) {
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
    group.add(g);
  },

  singaporeCity(course, group, venue, rand) {
    streetBlocks(course, group, rand, {
      rows: 2, height: [50, 170], depth: [40, 70], width: [36, 64], maxCount: 520, spacing: 9, setback: 12,
      palette: ["#4a5566", "#5a6070", "#3c4452", "#6a7280", "#50586a"],
      night: true, glass: "#1d2a40", lit: 0.3,
    });
  },

  marinaBaySands(course, group) {
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

  flyer(course, group) {
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

  sakhirTower(course, group) {
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
