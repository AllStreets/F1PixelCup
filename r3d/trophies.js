// The podium's three trophies
// (docs/superpowers/specs/2026-10-12-trophy-presentation-design.md): third's
// is the cup the winner used to lift (the same profile and handles as the
// driver model's, tools/blender/build_driver.py), in bronze; second's a
// bigger goblet of its own, in silver; the winner's a grand urn on a plinth
// with handles and a lid, in gold. Each is lathed here, about its stem: the
// origin is where a hand grips it, +Y up to the cup.

import * as THREE from "three";

// [radius, height] up each trophy, from its foot (the stem is at height 0).
const PROFILES = {
  // The driver model's own trophy, turned the right way up.
  3: [[0.0, -0.12], [0.05, -0.12], [0.05, -0.09], [0.02, -0.08], [0.016, 0.0], [0.03, 0.03], [0.075, 0.1], [0.085, 0.2], [0.08, 0.21], [0.072, 0.2], [0.066, 0.11], [0.0, 0.05]],
  2: [[0.0, -0.17], [0.078, -0.17], [0.078, -0.15], [0.06, -0.135], [0.024, -0.12], [0.017, -0.06], [0.03, -0.045], [0.03, -0.03], [0.017, -0.015], [0.016, 0.02],
    [0.03, 0.05], [0.075, 0.1], [0.1, 0.19], [0.108, 0.31], [0.112, 0.33], [0.103, 0.325], [0.094, 0.2], [0.066, 0.115], [0.0, 0.08]],
  1: [[0.0, -0.17], [0.07, -0.17], [0.075, -0.155], [0.05, -0.135], [0.022, -0.115], [0.018, -0.03], [0.034, -0.015], [0.034, 0.0], [0.018, 0.015], [0.02, 0.05],
    [0.05, 0.075], [0.12, 0.13], [0.142, 0.22], [0.134, 0.3], [0.118, 0.33], [0.124, 0.345], [0.124, 0.355], [0.1, 0.365], [0.06, 0.4], [0.03, 0.42], [0.016, 0.44], [0.026, 0.455], [0.022, 0.475], [0.0, 0.49]],
};
// The metals: colour, how rough (bronze is satin, gold and silver bright).
export const METALS = {
  3: { name: "bronze", color: "#c98a52", roughness: 0.3 },
  2: { name: "silver", color: "#dfe3e8", roughness: 0.2 },
  1: { name: "gold", color: "#f0b93a", roughness: 0.2 },
};
// The winner's stands on a dark plinth, part of it.
const PLINTH = { radius: 0.105, top: -0.17, bottom: -0.25 };
// Its two great handles, from the shoulder of the urn to its belly, and
// third's small ones at the cup's foot (as the driver model's are):
// [x, y] along each, and the tube's radius.
const HANDLES = {
  1: { points: [[0.12, 0.31], [0.19, 0.33], [0.215, 0.26], [0.19, 0.17], [0.125, 0.14]], radius: 0.012 },
  3: { points: [[0.078, 0.17], [0.102, 0.15], [0.106, 0.11], [0.072, 0.1]], radius: 0.008 },
};

// Where a second hand holds each, under the first: this far down the stem (m).
const LOWER = { 3: 0.07, 2: 0.09, 1: 0.085 };

// How far out a trophy's own metal reaches at height y (from its stem), its
// handles aside: the lathe's outline (and the plinth's).
function radiusAt(place, y) {
  const profile = PROFILES[place];
  let r = place === 1 && y >= PLINTH.bottom && y <= PLINTH.top ? PLINTH.radius * 1.06 : 0;
  for (let i = 1; i < profile.length; i += 1) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    if (y < lo || y > hi) continue;
    r = Math.max(r, hi - lo < 1e-9 ? Math.max(r0, r1) : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0));
  }
  return r;
}

// A trophy: { group, place, metal, height, foot (y of its underside), top,
// baseRadius (where a presenter's hands hold it), radius (its widest, handles
// and all), bowl (its cup's), lower (where a second hand holds its stem),
// gapTo(point): how far a point given in the trophy's own space is from its
// metal (negative inside it) }. geo and mat record what is made, for the
// podium to free.
export function buildTrophy(place, { geo, mat }) {
  const profile = PROFILES[place];
  const metal = METALS[place];
  const material = mat(new THREE.MeshStandardMaterial({ name: `trophy_${metal.name}`, color: metal.color, metalness: 1, roughness: metal.roughness, envMapIntensity: 3.2 }));
  const group = new THREE.Group();
  group.name = `trophy${place}`;
  const body = new THREE.Mesh(geo(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), place === 3 ? 28 : 40)), material);
  group.add(body);
  let foot = profile[0][1];
  let baseRadius = Math.max(...profile.filter(([, y]) => y < foot + 0.03).map(([r]) => r));
  const handle = ({ points, radius }) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const tube = geo(new THREE.TubeGeometry(curve, 16, radius, 8));
    [1, -1].forEach((sign) => {
      const mesh = new THREE.Mesh(tube, material);
      mesh.scale.x = sign;
      group.add(mesh);
    });
  };
  if (HANDLES[place]) handle(HANDLES[place]);
  if (place === 1) {
    const wood = mat(new THREE.MeshStandardMaterial({ name: "trophy_plinth", color: "#1c1512", roughness: 0.35, metalness: 0.1 }));
    const plinth = new THREE.Mesh(geo(new THREE.CylinderGeometry(PLINTH.radius, PLINTH.radius * 1.06, PLINTH.top - PLINTH.bottom, 40)), wood);
    plinth.position.y = (PLINTH.top + PLINTH.bottom) / 2;
    group.add(plinth);
    // A plate on the plinth, as a winner's trophy carries.
    const plate = new THREE.Mesh(geo(new THREE.CylinderGeometry(PLINTH.radius * 1.012, PLINTH.radius * 1.012, 0.03, 40, 1, true, -0.5, 1.0)), material);
    plate.position.y = (PLINTH.top + PLINTH.bottom) / 2;
    group.add(plate);
    foot = PLINTH.bottom;
    baseRadius = PLINTH.radius;
  }
  group.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  const top = Math.max(...profile.map(([, y]) => y));
  const handles = HANDLES[place];
  const reach = handles ? Math.max(...handles.points.map(([x]) => x)) + handles.radius : 0;
  const radius = Math.max(...profile.map(([r]) => r), reach);
  function gapTo(p) {
    const out = Math.hypot(p.x, p.z);
    // Its body: the nearest of the outline at this height, its foot and its top.
    let gap = p.y < foot ? Math.hypot(Math.max(0, out - baseRadius), foot - p.y)
      : p.y > top ? Math.hypot(out, p.y - top)
        : out - radiusAt(place, p.y);
    // Its handles, in the plane across it (x), one each side.
    if (handles) {
      handles.points.forEach(([x, y], i) => {
        const [nx, ny] = handles.points[i + 1] || [x, y];
        for (let k = 0; k < 4; k += 1) gap = Math.min(gap, Math.hypot(Math.abs(p.x) - (x + ((nx - x) * k) / 4), p.y - (y + ((ny - y) * k) / 4), p.z) - handles.radius);
      });
    }
    return gap;
  }
  const bowl = Math.max(...profile.map(([r]) => r));
  return { group, place, metal: metal.name, color: metal.color, foot, top, height: top - foot, baseRadius, radius, bowl, lower: LOWER[place], gapTo };
}
