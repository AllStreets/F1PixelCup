// Trackside life (docs/superpowers/specs/2026-09-29-trackside-design.md, G3):
// marshal posts with their flags, the TV helicopter over the leader, fireworks
// when the chequered flag falls, and the starter waving it. The game decides
// what happens (game.js tracksideFrame, marshals.js); this draws it.
import * as THREE from "three";
import { footprintClear } from "./track.js";
import { canvasTexture } from "./textures.js";

const mat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, ...extra });

// A flag: a cloth with a wave in it, swinging on its pole.
function flagCloth(width, height, material) {
  const geo = new THREE.PlaneGeometry(width, height, 8, 2);
  geo.translate(width / 2, 0, 0);
  const cloth = new THREE.Mesh(geo, material);
  cloth.userData.rest = geo.attributes.position.array.slice();
  return cloth;
}

function waveCloth(cloth, t, strength) {
  const pos = cloth.geometry.attributes.position;
  const rest = cloth.userData.rest;
  for (let i = 0; i < pos.count; i += 1) {
    const x = rest[i * 3];
    pos.setZ(i, Math.sin(x * 0.9 - t * 9) * 0.5 * strength * (x / 6));
  }
  pos.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Marshal posts: beside the track at each post's lap distance, on the outside
// of the bend where there is one, past the barrier, claiming their footprint
// like any scenery (moved along a little where the spot is taken).
// ---------------------------------------------------------------------------

const FLAG_COLOURS = { yellow: 0xffd400, green: 0x16a34a };

export function buildMarshalPosts(course, posts, venue) {
  const group = new THREE.Group();
  group.name = "marshals";
  const hut = mat(0xf2f2f2);
  const roof = mat(0xe10600);
  const orange = mat(0xff7a00);
  const skin = mat(0xd9a07a);
  const pole = mat(0x333338, { metalness: 0.5 });
  const flagMats = {
    yellow: new THREE.MeshStandardMaterial({ color: FLAG_COLOURS.yellow, roughness: 0.6, side: THREE.DoubleSide, emissive: FLAG_COLOURS.yellow, emissiveIntensity: venue.night ? 0.4 : 0.05 }),
    green: new THREE.MeshStandardMaterial({ color: FLAG_COLOURS.green, roughness: 0.6, side: THREE.DoubleSide, emissive: FLAG_COLOURS.green, emissiveIntensity: venue.night ? 0.4 : 0.05 }),
  };
  const total = course.track.totalLength;
  (posts || []).forEach((post) => {
    // Moved only back along the lap where the spot is taken, so a post still
    // watches the whole of its stretch.
    for (const shift of [0, -30, -60, -90, -120]) {
      const p = course.sampleAt(((post.d + shift) % total + total) % total);
      const side = p.curve > 0.0015 ? -1 : p.curve < -0.0015 ? 1 : (post.index % 2 ? 1 : -1);
      const off = side * ((side > 0 ? p.outerR : p.outerL) + 14);
      const x = p.x + p.nx * off;
      const z = p.y + p.ny * off;
      if (!footprintClear(course, x, z, Math.atan2(p.ty, p.tx), 6, 6, 3) || course.occupied.blocked(x, z, 7)) continue;
      course.occupied.add(x, z, 7);
      const g = new THREE.Group();
      const add = (geo, m, px, py, pz) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(px, py, pz); mesh.castShadow = true; g.add(mesh); return mesh; };
      // Up on a platform, to see (and be seen) over the barrier -- standing
      // on the ground, and taller beside a bridge's raised road.
      const deck = 8 + p.h;
      [[-3.5, -1], [3.5, -1], [-3.5, 6], [3.5, 6]].forEach(([lx, lz]) => add(new THREE.BoxGeometry(0.6, deck, 0.6), pole, lx, deck / 2, lz));
      add(new THREE.BoxGeometry(9, 0.6, 8.5), pole, 0, deck, 2.5);
      add(new THREE.BoxGeometry(8, 7, 4.5), hut, 0, deck + 3.5, 4);
      add(new THREE.BoxGeometry(9, 0.8, 8.5), roof, 0, deck + 7.4, 2.5);
      // The marshal, in orange, at the front of the platform (local -z faces
      // the road), the flag in hand.
      add(new THREE.CylinderGeometry(0.9, 1.1, 4, 8), orange, 2, deck + 2.3, -0.5);
      add(new THREE.SphereGeometry(0.8, 10, 8), skin, 2, deck + 4.9, -0.5);
      // The flag on its pole, held at the marshal's hand, swung to and fro.
      const hand = new THREE.Group();
      hand.position.set(2.9, deck + 3.6, -0.5);
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), pole);
      staff.position.y = 3.2;
      hand.add(staff);
      const flag = flagCloth(5, 3, flagMats.yellow);
      flag.position.set(0, 5.2, 0);
      hand.add(flag);
      hand.visible = false;
      g.add(hand);
      g.position.set(x, 0, z);
      // Local -z toward the road.
      g.rotation.y = Math.atan2(x - p.x, z - p.y);
      g.userData.post = { index: post.index, d: post.d, flag, hand, flagMats, state: "none" };
      group.add(g);
      return;
    }
  });
  return group;
}

export function updateMarshalPosts(group, flags, t) {
  if (!group) return;
  group.children.forEach((g) => {
    const post = g.userData.post;
    const state = flags ? flags[post.index] || "none" : "none";
    post.state = state;
    post.hand.visible = state !== "none";
    if (state === "none") return;
    post.flag.material = post.flagMats[state];
    // Waved: the pole swung side to side, the cloth rippling.
    post.hand.rotation.z = Math.sin(t * 6 + post.index) * 0.7;
    waveCloth(post.flag, t, 1);
  });
}

// ---------------------------------------------------------------------------
// The TV helicopter: 260 up, beside the track, 400 behind the race leader,
// easing after them; its rotor turning.
// ---------------------------------------------------------------------------

export const HELI_HEIGHT = 260;
export const HELI_ASIDE = 220;

export function buildHelicopter() {
  const g = new THREE.Group();
  g.name = "helicopter";
  const body = mat(0x1b2a44, { metalness: 0.4, roughness: 0.4 });
  const glass = mat(0x9fc4dd, { metalness: 0.6, roughness: 0.1 });
  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  const cabin = add(new THREE.SphereGeometry(4, 16, 12), body, 0, 0, 0);
  cabin.scale.set(1.6, 1, 1);
  add(new THREE.SphereGeometry(2.6, 12, 10), glass, 3.6, 0.6, 0).scale.set(1, 0.8, 1.1);
  add(new THREE.BoxGeometry(12, 1.2, 1.2), body, -10, 0.8, 0);
  add(new THREE.BoxGeometry(1, 3, 0.4), body, -16, 2, 0);
  [-1, 1].forEach((s) => add(new THREE.BoxGeometry(9, 0.3, 0.3), body, 0, -4.4, s * 2.6));
  const rotor = new THREE.Group();
  rotor.position.set(0, 4.6, 0);
  [0, Math.PI / 2].forEach((a) => {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(26, 0.2, 1), body);
    blade.rotation.y = a;
    rotor.add(blade);
  });
  g.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 0.5), body);
  tail.position.set(-16, 2.5, 0.5);
  g.add(tail);
  g.userData = { rotor, tail, placed: false };
  g.visible = false;
  return g;
}

const heliWant = new THREE.Vector3();
export function updateHelicopter(heli, world, target, dt) {
  if (!heli) return;
  const course = world && world.course;
  if (!target || !course) { heli.visible = false; return; }
  const p = course.sampleAt(target.d);
  const want = heliWant.set(p.x + p.nx * HELI_ASIDE, p.h + HELI_HEIGHT, p.y + p.ny * HELI_ASIDE);
  // On a new circuit, or far behind (a restart), it is simply there.
  if (heli.userData.world !== world || heli.position.distanceTo(want) > 900) { heli.position.copy(want); heli.userData.world = world; }
  // Easing after them (quick enough to keep station 400 behind).
  heli.position.lerp(want, 1 - Math.exp(-dt * 3));
  heli.rotation.y = -Math.atan2(p.ty, p.tx);
  heli.userData.rotor.rotation.y += dt * 38;
  heli.userData.tail.rotation.z += dt * 60;
  heli.visible = true;
}

// ---------------------------------------------------------------------------
// Fireworks: when the chequered flag falls, shells burst over the stands by
// the line for six seconds, in the winner's colour, gold and white. Fewer
// shells on the lighter graphics tiers.
// ---------------------------------------------------------------------------

export const FIREWORK_SHELLS = { high: 8, medium: 5, low: 3 };
const PER_SHELL = 90;
const SHOW_MS = 6000;

export function buildFireworks() {
  const max = FIREWORK_SHELLS.high * PER_SHELL;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  geo.setDrawRange(0, 0);
  const sparkTex = canvasTexture(32, 32, (g2, w, h) => {
    const grad = g2.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = grad;
    g2.fillRect(0, 0, w, h);
  }, { repeat: false });
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 11, map: sparkTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  points.frustumCulled = false;
  points.name = "fireworks";
  points.userData = { shells: [], forFlag: 0 };
  return points;
}

// Where the shells burst: over the grandstands near the line, else over the
// line itself, past the barrier.
function burstSites(course, stands) {
  const total = course.track.totalLength;
  const near = (stands || []).filter((s) => Math.min(s.d, total - s.d) < 1500);
  if (near.length) return near.map((s) => ({ x: s.x, z: s.y }));
  const p = course.samples[0];
  return [-1, 1].map((side) => ({ x: p.x + p.nx * side * (p.outerR + 60), z: p.y + p.ny * side * (p.outerR + 60) }));
}

// `since`: milliseconds of the show so far (render3d.js keeps it, on real
// time held while paused).
export function updateFireworks(points, course, frame, stands, since, tier) {
  if (!points) return 0;
  const data = points.userData;
  const flagAt = frame && frame.flagOutAt;
  if (!flagAt || !course) { points.visible = false; points.geometry.setDrawRange(0, 0); data.forFlag = 0; return 0; }
  if (data.forFlag !== flagAt) {
    // A new show: plan its shells.
    data.forFlag = flagAt;
    const sites = burstSites(course, stands);
    const count = FIREWORK_SHELLS[tier] || FIREWORK_SHELLS.low;
    const colours = [frame.winnerColour || "#ffd400", "#ffd400", "#ffffff"].map((c) => new THREE.Color(c));
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    data.shells = Array.from({ length: count }, (_, k) => {
      const site = sites[k % sites.length];
      return {
        at: (k / count) * (SHOW_MS - 1500) + rand() * 300,
        x: site.x + (rand() - 0.5) * 120,
        y: course.heightAt(0) + 150 + rand() * 80,
        z: site.z + (rand() - 0.5) * 120,
        colour: colours[k % colours.length],
        dirs: Array.from({ length: PER_SHELL }, () => {
          const u = rand() * 2 - 1; const a = rand() * Math.PI * 2; const r = Math.sqrt(1 - u * u);
          return [r * Math.cos(a), u, r * Math.sin(a)];
        }),
      };
    });
  }
  const pos = points.geometry.attributes.position;
  const col = points.geometry.attributes.color;
  let n = 0;
  data.shells.forEach((shell) => {
    const age = (since - shell.at) / 1000;
    if (age < 0 || age > 1.6) return;
    const fade = Math.max(0, 1 - age / 1.6);
    shell.dirs.forEach(([dx, dy, dz]) => {
      const speed = 55;
      pos.setXYZ(n, shell.x + dx * speed * age, shell.y + dy * speed * age - 30 * age * age, shell.z + dz * speed * age);
      col.setXYZ(n, shell.colour.r * fade, shell.colour.g * fade, shell.colour.b * fade);
      n += 1;
    });
  });
  pos.needsUpdate = true;
  col.needsUpdate = true;
  points.geometry.setDrawRange(0, n);
  points.visible = n > 0;
  return n;
}

// ---------------------------------------------------------------------------
// The starter: by the line, past the barrier, waving the chequered flag once
// the leader has taken it.
// ---------------------------------------------------------------------------

export function buildStarter(course) {
  // Just before the line, past the barrier on the side away from the pit
  // wall; like any scenery it needs its ground clear (moved back along the
  // lap where it isn't).
  const lane = course.pitLane;
  const side = lane ? -lane.side : -1;
  const total = course.track.totalLength;
  let spot = null;
  for (const back of [20, 50, 80, 110, 140]) {
    const p = course.sampleAt(total - back);
    const off = side * ((side > 0 ? p.outerR : p.outerL) + 12);
    const x = p.x + p.nx * off;
    const z = p.y + p.ny * off;
    if (!footprintClear(course, x, z, Math.atan2(p.ty, p.tx), 4, 4, 3) || course.occupied.blocked(x, z, 5)) continue;
    course.occupied.add(x, z, 5);
    spot = { p, x, z };
    break;
  }
  if (!spot) return null;
  const g = new THREE.Group();
  g.name = "starter";
  const stand = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 5), mat(0x2a2d34));
  stand.position.y = 6;
  g.add(stand);
  const person = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 4, 8), mat(0xffffff));
  person.position.y = 14;
  g.add(person);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), mat(0xd9a07a));
  head.position.y = 16.6;
  g.add(head);
  const chequer = canvasTexture(64, 40, (g2, w, h) => {
    for (let i = 0; i < 8; i += 1) for (let j = 0; j < 5; j += 1) { g2.fillStyle = (i + j) % 2 ? "#111" : "#f4f4f4"; g2.fillRect(i * 8, j * 8, 8, 8); }
  }, { repeat: false });
  // The chequered flag on its pole, in the starter's raised hand.
  const hand = new THREE.Group();
  hand.position.set(0.9, 15.4, 0);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), mat(0x333338, { metalness: 0.5 }));
  staff.position.y = 3;
  hand.add(staff);
  const flag = flagCloth(6, 4, new THREE.MeshStandardMaterial({ map: chequer, side: THREE.DoubleSide, roughness: 0.6 }));
  flag.position.set(0, 4.6, 0);
  hand.add(flag);
  hand.visible = false;
  g.add(hand);
  g.position.set(spot.x, spot.p.h, spot.z);
  g.rotation.y = Math.atan2(spot.p.x - spot.x, spot.p.y - spot.z);
  g.userData.flag = flag;
  g.userData.hand = hand;
  return g;
}

// `since`: the show's milliseconds since the flag fell.
export function updateStarter(starter, flagOutAt, since, t) {
  if (!starter) return false;
  const waving = Boolean(flagOutAt) && since < 20000;
  starter.userData.hand.visible = waving;
  if (waving) {
    // Waved over the head, side to side.
    starter.userData.hand.rotation.z = Math.sin(t * 7) * 0.8;
    waveCloth(starter.userData.flag, t, 1);
  }
  return waving;
}
