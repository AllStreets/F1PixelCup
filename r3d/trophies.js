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
  3: { name: "bronze", color: "#a9642f", roughness: 0.34 },
  2: { name: "silver", color: "#dfe3e8", roughness: 0.2 },
  1: { name: "gold", color: "#f0b93a", roughness: 0.2 },
};
// The winner's stands on a dark plinth, part of it.
const PLINTH = { radius: 0.105, top: -0.17, bottom: -0.25 };

// A trophy: { group, place, metal, height, foot (y of its underside), top,
// baseRadius (where a presenter's hands hold it), radius (its widest) }.
// keep(list, thing) records what it makes, for the podium to free.
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
  // Handles: third's small ones at the cup's foot (as the model's are), the
  // winner's two great ones from the shoulder of the urn to its belly.
  const handle = (points, radius) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    const tube = geo(new THREE.TubeGeometry(curve, 16, radius, 8));
    [1, -1].forEach((sign) => {
      const mesh = new THREE.Mesh(tube, material);
      mesh.scale.x = sign;
      group.add(mesh);
    });
  };
  if (place === 3) handle([[0.078, 0.17], [0.102, 0.15], [0.106, 0.11], [0.072, 0.1]], 0.008);
  if (place === 1) {
    handle([[0.12, 0.31], [0.19, 0.33], [0.215, 0.26], [0.19, 0.17], [0.125, 0.14]], 0.012);
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
  const radius = place === 1 ? 0.215 : Math.max(...profile.map(([r]) => r), place === 3 ? 0.106 : 0);
  return { group, place, metal: metal.name, color: metal.color, foot, top, height: top - foot, baseRadius, radius };
}
