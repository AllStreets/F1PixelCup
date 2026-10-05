// The Safety Car's service entrances in 3D
// (docs/superpowers/specs/2026-10-05-safety-car-entries-design.md). Where
// they are is entrances.js's (window.Entrances, read from the track); this
// draws each one: its access road from the road's edge out through a gap in
// the barrier to a carport behind it, the gate in the gap (two leaves on
// posts, an amber beacon), and a marshal's booth by the gate. Everything
// claims its ground, so no scenery is built on it. The gate opens while the
// Safety Car is near it and shuts again after (updateEntrances).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, photo, canvasTexture } from "./textures.js";
import { wettable, WET_ROAD, WET_PAINT } from "./rain.js";

// Lifted over the run-off (0.03) and gravel (0.07), under the road (0.14).
const ROAD_LIFT = 0.12;
const LINE_LIFT = 0.16;
const GATE_H = 9;
const CARPORT_H = 15;
// The gate opens once the Safety Car is this near it, over OPEN_S.
const OPEN_NEAR = 170;
const OPEN_S = 0.8;

const owned = (m) => { m.userData.worldOwned = true; return m; };

// A strip along the access road's line between two offsets across it (left
// and right of its centre, in the road's own direction), from r0 to r1 along
// the lap past its standby spot. Before the standby spot (r < 0) the road
// runs on beside the track, under the carport.
function strip(e, course, r0, r1, a, b, lift, vScale = 20) {
  const pos = [];
  const uv = [];
  const idx = [];
  const at = (r) => {
    const d = e.startD + r;
    const lat = r < 0 ? e.side * e.far : e.latAt(d);
    return { p: e.lap.point(d, lat), h: course.heightAt(d) };
  };
  const steps = Math.max(2, Math.ceil((r1 - r0) / 3));
  for (let k = 0; k <= steps; k += 1) {
    const r = r0 + ((r1 - r0) * k) / steps;
    const { p, h } = at(r);
    const q0 = at(r - 1).p;
    const q1 = at(r + 1).p;
    const dx = q1.x - q0.x;
    const dy = q1.y - q0.y;
    const l = Math.hypot(dx, dy) || 1;
    // Across the road, towards the track's +n side (as e.side counts it).
    const nx = -dy / l;
    const ny = dx / l;
    const base = pos.length / 3;
    pos.push(p.x + nx * a, h + lift, p.y + ny * a, p.x + nx * b, h + lift, p.y + ny * b);
    uv.push(0, r / vScale, 1, r / vScale);
    if (k) idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// A box placed at a point, turned to face along the lap there (local x along
// the lap, local z out across it on the entrance's side).
function placed(geo, x, y, z, yaw) {
  return geo.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
}

function signTexture() {
  const tex = canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = "#14161b";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffb000";
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.fillStyle = "#f4f4f4";
    g.font = "900 italic 58px Trebuchet MS, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("SAFETY CAR", w / 2, h / 2 + 3);
  }, { repeat: false });
  tex.userData.print = true;
  return tex;
}

// Whether the barrier on a side is open at lap distance d: within one of
// the circuit's entrance gaps (r3d/track.js leaves it out there).
export function inEntranceGap(entrances, sign, d, total) {
  return (entrances || []).some((e) => e.side === sign && ((d - e.gap.from) % total + total) % total <= e.gap.length);
}

// Where the barrier stops either side of an entrance's gap: the last sample
// it is laid on before the gap, and the first after.
function barrierEnds(e, course) {
  const { samples, track } = course;
  const n = samples.length;
  const total = track.totalLength;
  const open = (i) => inEntranceGap([e], e.side, samples[(i + n) % n].d, total);
  let i = samples.findIndex((p) => open(p.i));
  while (open(i - 1)) i -= 1;
  let j = i;
  while (open(j + 1)) j += 1;
  return [samples[(i - 1 + n) % n].d, samples[(j + 1) % n].d];
}

export function buildEntrances(course, venue) {
  const group = new THREE.Group();
  group.name = "entrances";
  const list = course.track.entrances || [];
  group.userData = { gates: [], marshals: [], claimed: 0 };
  if (!list.length) return group;
  const tarmac = owned(wettable(new THREE.MeshStandardMaterial({ map: photo("asphalt_track", 2, 1), color: color("#62626a"), roughness: 0.9, side: THREE.DoubleSide }), WET_ROAD));
  const paint = owned(wettable(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, side: THREE.DoubleSide }), WET_PAINT));
  const steel = owned(new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.45, metalness: 0.7 }));
  const dark = owned(new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.6, metalness: 0.3 }));
  const stripe = owned(new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.5 }));
  const white = owned(new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 }));
  const roofMat = owned(new THREE.MeshStandardMaterial({ color: 0xcfd0d4, roughness: 0.55, metalness: 0.2 }));
  const glass = owned(new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.15, metalness: 0.5 }));
  const sign = owned(new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: venue.night ? 0.35 : 0.05 }));
  sign.emissiveMap = sign.map;
  const parts = { road: [], lines: [], steel: [], dark: [], stripe: [], white: [], roof: [], glass: [], sign: [] };
  const H = (d) => course.heightAt(d);

  list.forEach((e) => {
    // Its ground, claimed before anything else is placed round it.
    e.footprint.forEach((c) => course.occupied.add(c.x, c.y, c.r));
    group.userData.claimed += e.footprint.length;
    const yawAt = (d, lat) => {
      const a = e.lap.point(d - 2, lat);
      const b = e.lap.point(d + 2, lat);
      return -Math.atan2(b.y - a.y, b.x - a.x);
    };

    // The road, from past the carport's back to where it meets the track,
    // with its edge lines out to the gate and a stop line inside the gate.
    const from = -Entrances.CARPORT.back - 6;
    parts.road.push(strip(e, course, from, e.length, -e.halfWidth, e.halfWidth, ROAD_LIFT));
    const linesTo = e.gateU + e.halfWidth;
    [[-e.halfWidth + 0.4, -e.halfWidth + 1.6], [e.halfWidth - 1.6, e.halfWidth - 0.4]].forEach(([a, b]) => parts.lines.push(strip(e, course, from, linesTo, a, b, LINE_LIFT)));
    const stopAt = e.gateU - 20;
    parts.lines.push(strip(e, course, stopAt, stopAt + 1.6, -e.halfWidth + 0.4, e.halfWidth - 0.4, LINE_LIFT));

    // The gate: a post at each end of the gap in the barrier (where the
    // barrier, laid sample by sample, stops: r3d/track.js), two leaves hinged
    // on them.
    const ends = barrierEnds(e, course).map((d) => {
      const p = e.lap.point(d, e.side * e.barrier);
      return { d, x: p.x, z: p.y, h: H(d) };
    });
    const span = Math.hypot(ends[1].x - ends[0].x, ends[1].z - ends[0].z);
    const along = Math.atan2(ends[1].z - ends[0].z, ends[1].x - ends[0].x);
    ends.forEach((end) => {
      parts.dark.push(placed(new THREE.BoxGeometry(1.8, GATE_H + 2, 1.8), end.x, end.h + (GATE_H + 2) / 2, end.z, -along));
    });
    const gate = { entrance: e.index, x: (ends[0].x + ends[1].x) / 2, z: (ends[0].z + ends[1].z) / 2, open: 0, leaves: [], beacon: null };
    // Out, away from the track, across the barrier line.
    const outward = (() => {
      const o = e.lap.point(e.gateD, e.side * (e.barrier + 10));
      return Math.sign((o.x - gate.x) * -Math.sin(along) + (o.y - gate.z) * Math.cos(along)) || 1;
    })();
    ends.forEach((end, i) => {
      const leafLength = span / 2 - 0.6;
      const hinge = new THREE.Group();
      hinge.position.set(end.x, end.h, end.z);
      // Closed, each leaf runs from its post to the middle of the gap.
      hinge.rotation.y = -along + (i ? Math.PI : 0);
      const leaf = new THREE.Group();
      const bar = (lx, ly, lz, len, ht) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, ht, 0.5), steel);
        m.position.set(lx, ly, lz);
        m.castShadow = true;
        leaf.add(m);
      };
      bar(leafLength / 2, 1.2, 0, leafLength, 0.6);
      bar(leafLength / 2, GATE_H - 0.3, 0, leafLength, 0.6);
      bar(leafLength / 2, GATE_H / 2 + 0.4, 0, leafLength, 0.4);
      for (let k = 0; k <= 4; k += 1) bar(0.6 + ((leafLength - 1.2) * k) / 4, GATE_H / 2 + 0.4, 0, 0.35, GATE_H - 1);
      // A red-and-white board across its middle, to be seen from the track.
      const board = new THREE.Mesh(new THREE.BoxGeometry(leafLength * 0.8, 1.6, 0.7), i ? white : stripe);
      board.position.set(leafLength / 2, GATE_H / 2 + 0.4, 0);
      leaf.add(board);
      hinge.add(leaf);
      // Opening swings it out, away from the track, back against the barrier.
      hinge.userData = { closed: hinge.rotation.y, swing: (i ? 1 : -1) * outward * Math.PI * 0.92 };
      group.add(hinge);
      gate.leaves.push(hinge);
    });
    // The amber beacon on the downstream post: it flashes while the gate is open.
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12), owned(new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xffa000, emissiveIntensity: 0.15, roughness: 0.3 })));
    beacon.position.set(ends[1].x, ends[1].h + GATE_H + 2.7, ends[1].z);
    group.add(beacon);
    gate.beacon = beacon;
    group.userData.gates.push(gate);

    // The marshal's booth, just past the gap outside the barrier, facing the
    // road; the marshal stands by it, looking out over the gate.
    const bp = e.lap.point(e.boothD, e.side * (e.barrier + Entrances.BOOTH.out));
    const bh = H(e.boothD);
    const byaw = yawAt(e.boothD, e.side * (e.barrier + Entrances.BOOTH.out));
    const local = (lx, lz) => {
      // Local x along the lap, local z out from the track.
      const c = Math.cos(byaw);
      const s = Math.sin(byaw);
      const z = e.side * lz;
      return { x: bp.x + lx * c + z * s, z: bp.y - lx * s + z * c };
    };
    parts.white.push(placed(new THREE.BoxGeometry(8, 9, 7), bp.x, bh + 4.5, bp.y, byaw));
    parts.stripe.push(placed(new THREE.BoxGeometry(9, 1.4, 8), bp.x, bh + 9.7, bp.y, byaw));
    const win = local(0, -3.55);
    parts.glass.push(placed(new THREE.BoxGeometry(5.6, 3.2, 0.2), win.x, bh + 6, win.z, byaw));
    const stand = local(-6.5, -1.5);
    group.userData.marshals.push({ x: stand.x, y: bh, z: stand.z, lookX: gate.x, lookZ: gate.z });

    // The carport over the standby spot: posts, a roof, a back wall with its
    // sign, at the far end of the road.
    const mid = e.startD + (Entrances.CARPORT.front - Entrances.CARPORT.back) / 2;
    const cp = e.lap.point(mid, e.side * e.far);
    const ch = H(mid);
    const cyaw = yawAt(mid, e.side * e.far);
    const len = Entrances.CARPORT.back + Entrances.CARPORT.front;
    const half = Entrances.CARPORT.half;
    const at = (lx, lz) => {
      const c = Math.cos(cyaw);
      const s = Math.sin(cyaw);
      const z = e.side * lz;
      return { x: cp.x + lx * c + z * s, z: cp.y - lx * s + z * c };
    };
    [[-len / 2 + 1, -half + 1], [len / 2 - 1, -half + 1], [-len / 2 + 1, half - 1], [len / 2 - 1, half - 1]].forEach(([lx, lz]) => {
      const p = at(lx, lz);
      parts.dark.push(placed(new THREE.BoxGeometry(1, CARPORT_H, 1), p.x, ch + CARPORT_H / 2, p.z, cyaw));
    });
    parts.roof.push(placed(new THREE.BoxGeometry(len + 2, 1, half * 2 + 2), cp.x, ch + CARPORT_H + 0.5, cp.y, cyaw));
    const back = at(0, half - 0.5);
    parts.dark.push(placed(new THREE.BoxGeometry(len, CARPORT_H - 1, 1), back.x, ch + (CARPORT_H - 1) / 2, back.z, cyaw));
    // The sign along the roof's front edge, facing the track.
    const front = at(0, -half - 1.1);
    const s = new THREE.PlaneGeometry(len * 0.8, len * 0.15);
    // (Its face towards the track: -z local, turned to the entrance's side.)
    s.rotateY(e.side > 0 ? Math.PI : 0);
    parts.sign.push(placed(s, front.x, ch + CARPORT_H - 1.2, front.z, cyaw));
  });

  const add = (geos, mat, opts = {}) => {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = Boolean(opts.cast);
    m.receiveShadow = true;
    Object.assign(m.userData, opts.userData || {});
    m.name = opts.name || "";
    group.add(m);
    return m;
  };
  add(parts.road, tarmac, { userData: { ground: true }, name: "accessRoads" });
  add(parts.lines, paint, { userData: { ground: true }, name: "accessRoadLines" });
  add(parts.dark, dark, { cast: true, name: "gatePostsAndCarports" });
  add(parts.white, white, { cast: true, name: "marshalBooths" });
  add(parts.stripe, stripe, { cast: true, name: "marshalBoothRoofs" });
  add(parts.glass, glass, { name: "marshalBoothWindows" });
  add(parts.roof, roofMat, { cast: true, name: "carportRoofs" });
  add(parts.sign, sign, { name: "carportSigns" });
  return group;
}

// Per frame: each gate opens while the Safety Car (as drawn: { x, y, parked })
// is near it, and its beacon flashes; then it shuts again.
export function updateEntrances(group, sc, t, dt, cut = false) {
  if (!group || !group.userData.gates) return;
  group.userData.gates.forEach((gate) => {
    const near = Boolean(sc) && !sc.parked && Math.hypot(sc.x - gate.x, sc.y - gate.z) < OPEN_NEAR;
    const want = near ? 1 : 0;
    gate.open = cut ? want : gate.open + Math.max(-dt / OPEN_S, Math.min(dt / OPEN_S, want - gate.open));
    const ease = gate.open * gate.open * (3 - 2 * gate.open);
    gate.leaves.forEach((hinge) => { hinge.rotation.y = hinge.userData.closed + hinge.userData.swing * ease; });
    gate.beacon.material.emissiveIntensity = gate.open > 0.02 ? (Math.sin(t * 14) > 0 ? 3 : 0.4) : 0.15;
  });
}

// For the checks: each gate, how open it is.
export function inspectEntrances(group) {
  if (!group || !group.userData.gates) return null;
  return { gates: group.userData.gates.map((g) => ({ entrance: g.entrance, x: Math.round(g.x), z: Math.round(g.z), open: +g.open.toFixed(2) })), claimed: group.userData.claimed, marshals: group.userData.marshals.length };
}
