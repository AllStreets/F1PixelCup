// The trophy presentation, in the podium's scene
// (docs/superpowers/specs/2026-10-12-trophy-presentation-design.md): the
// table, the three trophies (r3d/trophies.js), the presenter
// (r3d/presenter.js), and each frame's handing over: where ceremony.js says
// everyone and everything is, the hands are put there (r3d/gestures.js).
// r3d/podium.js builds it with its own scene and calls update() each frame
// after the drivers' poses.

import * as THREE from "three";
import { buildTrophy } from "./trophies.js";
import { buildPresenter, presenterFor } from "./presenter.js";
import { rigOf, reach, walk, turn, settle } from "./gestures.js";
import { color } from "./textures.js";

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, t) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// Where a hand grips, from the driver model's own trophy (a prop on the
// right hand): the point on its stem and the way it stands, in the right
// hand bone's space, and the same mirrored for the left.
function gripsOf(rig) {
  let prop = null;
  rig.bones.hand_R.traverse((n) => { if (n.isMesh && n.name === "trophy") prop = n; });
  if (!prop) throw new Error("the figure's right hand has no trophy to take the grip from");
  prop.updateMatrix();
  const pos = prop.geometry.attributes.position;
  const points = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) points.push(p.fromBufferAttribute(pos, i).applyMatrix4(prop.matrix).clone());
  const mean = points.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / points.length);
  // Its long axis: the direction the points spread most along (power iteration).
  const axis = new THREE.Vector3(0.3, 1, 0.2).normalize();
  for (let k = 0; k < 30; k += 1) {
    const next = new THREE.Vector3();
    points.forEach((v) => { const d = v.clone().sub(mean); next.addScaledVector(d, d.dot(axis)); });
    axis.copy(next.normalize());
  }
  // Which end is the cup: the wider one.
  let lo = Infinity;
  let hi = -Infinity;
  points.forEach((v) => { const along = v.clone().sub(mean).dot(axis); lo = Math.min(lo, along); hi = Math.max(hi, along); });
  const widthNear = (end) => Math.max(...points.map((v) => {
    const d = v.clone().sub(mean);
    const along = d.dot(axis);
    return Math.abs(along - end) < 0.04 ? d.addScaledVector(axis, -along).length() : 0;
  }));
  if (widthNear(lo) > widthNear(hi)) { axis.negate(); [lo, hi] = [-hi, -lo]; }
  // The stem is 0.21 m below the rim (tools/blender/build_driver.py's profile).
  const gripR = mean.clone().addScaledVector(axis, hi - 0.21);
  const index = (name) => rig.body.skeleton.bones.indexOf(rig.bones[name]);
  const restR = rig.body.skeleton.boneInverses[index("hand_R")].clone().invert();
  const invL = rig.body.skeleton.boneInverses[index("hand_L")];
  const mirror = (v) => v.set(v.x, v.y, -v.z);
  const gripL = mirror(gripR.clone().applyMatrix4(restR)).applyMatrix4(invL);
  const axisL = mirror(axis.clone().transformDirection(restR)).transformDirection(invL);
  const frame = (at, up) => ({ at, up, quat: new THREE.Quaternion().setFromUnitVectors(UP, up) });
  return { R: frame(gripR, axis), L: frame(gripL, axisL) };
}

export function createPresentation({ scene, Ceremony, entries, cup, tier, figures, cupColour, geo, mat }) {
  const T = Ceremony.TABLE;
  const handover = Object.fromEntries(Ceremony.HANDOVERS.map((h) => [h.place, h]));

  // ---- The table: a cloth to the floor in the cup's colour, a pale top ----
  const cloth = mat(new THREE.MeshStandardMaterial({ color: "#141a33", roughness: 0.85 }));
  const band = mat(new THREE.MeshStandardMaterial({ color: color(cupColour), roughness: 0.6 }));
  const top = mat(new THREE.MeshStandardMaterial({ color: "#efe9dc", roughness: 0.7 }));
  const skirt = new THREE.Mesh(geo(new THREE.BoxGeometry(T.width, T.height - 0.02, T.depth)), cloth);
  skirt.position.set(T.x, (T.height - 0.02) / 2, T.z);
  const slab = new THREE.Mesh(geo(new THREE.BoxGeometry(T.width + 0.04, 0.02, T.depth + 0.04)), top);
  slab.position.set(T.x, T.height - 0.01, T.z);
  // A band in the cup's colour round the cloth.
  const ribbon = new THREE.Mesh(geo(new THREE.BoxGeometry(T.width + 0.006, 0.05, T.depth + 0.006)), band);
  ribbon.position.set(T.x, T.height - 0.12, T.z);
  [skirt, slab, ribbon].forEach((m) => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  skirt.name = "trophy-table";

  // ---- The trophies, on it ----
  const trophies = {};
  [3, 2, 1].forEach((place) => {
    const trophy = buildTrophy(place, { geo, mat });
    trophy.table = new THREE.Vector3(T.x + T.on[place], T.height - trophy.foot, T.z);
    trophy.group.position.copy(trophy.table);
    scene.add(trophy.group);
    trophies[place] = trophy;
  });

  // ---- The presenter ----
  const who = presenterFor(cup, entries);
  const presenter = buildPresenter(who, tier);
  presenter.rig = rigOf(presenter.model);
  const off = Ceremony.presenterAt(-1);
  presenter.root.position.set(off.x, 0, off.z);
  scene.add(presenter.root);

  // The drivers' rigs, and the grips (the same build for every figure).
  const drivers = figures.map((f) => ({ ...f, rig: rigOf(f.fig.model), place: f.entry.place }));
  const grips = gripsOf(drivers[0].rig);

  const gaps = { reach: {}, carry: 0, hold: {} };
  const state = { where: {}, presenter: null };
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const upright = new THREE.Quaternion();
  const pole = new THREE.Vector3();

  // A figure's own directions in the world, from the way it faces (0: +z).
  const forwardOf = (heading, out) => out.set(Math.sin(heading), 0, Math.cos(heading));
  const rightOf = (heading, out) => out.set(-Math.cos(heading), 0, Math.sin(heading));

  // Where a driver takes their trophy: out in front of the right shoulder
  // and down, where the presenter (on the floor, below) can hold it up to.
  function handoverPoint(d, out) {
    d.rig.arms.R.upper.getWorldPosition(out);
    // (Toward the side the presenter stands on.)
    const side = Math.sign(Ceremony.PRESENT.spotSide[d.place]);
    return out.set(out.x + (side < 0 ? -0.1 : 0.26), d.step.height + 1.4 - 0.4, d.fig.root.position.z + 0.44);
  }

  // Where a presenter carries one: in front of the waist, its base at about a metre.
  function carryPoint(P, trophy, out) {
    forwardOf(P.heading, v1);
    return out.set(P.x, 1.0 - trophy.foot - 0.035, P.z).addScaledVector(v1, 0.36);
  }

  // The world point of a hand's grip.
  const gripPoint = (rig, s, out) => rig.arms[s].hand.localToWorld(out.copy(grips[s].at));

  // One frame: t seconds into the ceremony. The drivers' figures have their
  // poses for the frame (and their places) already.
  function update(t, dt) {
    const P = Ceremony.presenterAt(t);
    state.presenter = P;
    presenter.root.visible = P.on;
    presenter.root.position.set(P.x, 0, P.z);
    presenter.root.rotation.y = P.heading - Math.PI / 2;
    presenter.play("stand");
    presenter.update(dt);
    presenter.root.updateMatrixWorld(true);
    drivers.forEach((d) => d.fig.root.updateMatrixWorld(true));
    settle(presenter.rig);
    drivers.forEach((d) => settle(d.rig));
    const pr = rightOf(P.heading, new THREE.Vector3());

    // The presenter's trophy this moment (the one being taken, carried or given), if any.
    const busy = Ceremony.HANDOVERS.find((h) => t >= h.pick - 0.5 && t < h.release + 0.35);
    if (P.on) {
      walk(presenter.rig, P.stride, P.walking, pr, { arms: !busy || t < busy.pick - 0.3 });
      // A slight bow to the table as the trophy is taken; a nod once it is given.
      if (P.take > 0) { turn(presenter.rig.bones.spine, pr, -0.3 * P.take); turn(presenter.rig.bones.chest, pr, -0.2 * P.take); }
      if (P.nod > 0) { turn(presenter.rig.bones.head, pr, -0.34 * P.nod); turn(presenter.rig.bones.chest, pr, -0.1 * P.nod); }
    }

    // The drivers reach (a lean with it) before the trophies are placed.
    drivers.forEach((d) => {
      const w = Ceremony.reachAt(d.place, t);
      d.reach = w;
      if (w > 0) turn(d.rig.bones.chest, rightOf(0, v1), -0.24 * w);
    });

    [3, 2, 1].forEach((place) => {
      const trophy = trophies[place];
      const h = handover[place];
      const d = drivers.find((x) => x.place === place);
      const { where, pass } = Ceremony.trophyAt(place, t);
      state.where[place] = where;
      const g = trophy.group;
      if (where === "table") {
        g.position.copy(trophy.table);
        g.quaternion.copy(upright);
      } else if (where === "presenter") {
        // Up off the table to the carry, then held up to the driver.
        carryPoint(P, trophy, v1);
        v1.lerp(trophy.table, 1 - smooth(h.lifted, h.carried, t));
        if (t < h.carried) v1.y += 0.05 * Math.sin(Math.PI * smooth(h.lifted, h.carried, t));
        g.position.copy(v1).lerp(handoverPoint(d, v2), P.raise);
        g.quaternion.copy(upright);
      }
      // The driver's right hand: out to the trophy's stem as it is held up.
      if (d.reach > 0) {
        const target = where === "presenter" ? v3.copy(g.position) : handoverPoint(d, v3);
        pole.set(-0.5, -1, -0.2);
        const gap = reach(d.rig, "R", target, { weight: d.reach, grip: grips.R.at, pole });
        if (where === "presenter" && t > h.contact - 0.12) gaps.reach[place] = gap;
      }
      if (where === "right" || where === "left") {
        // In the right hand, standing as the hand holds it (eased from upright
        // as the presenter lets go).
        const hand = d.rig.arms.R.hand;
        gripPoint(d.rig, "R", v1);
        hand.getWorldQuaternion(q1).multiply(grips.R.quat);
        q2.copy(upright).slerp(q1, smooth(h.contact, h.release + 0.25, t));
        if (pass > 0) {
          // To the left hand: the left comes to the stem, then the trophy
          // goes with it to where it is held, upright, beside the chest.
          v2.set(0.2 + trophy.radius, 1.08, -(0.2 + trophy.radius * 0.8));
          d.fig.root.localToWorld(v2);
          const go = smooth(0.45, 1, pass);
          v1.lerp(v2, go);
          q2.slerp(upright, go);
        }
        g.position.copy(v1);
        g.quaternion.copy(q2);
        if (pass > 0) {
          pole.set(0.5, -1, -0.3);
          v3.copy(g.position).addScaledVector(v2.set(0, 1, 0).applyQuaternion(g.quaternion), -0.035 * (1 - smooth(0.45, 1, pass)));
          const gap = reach(d.rig, "L", v3, { weight: smooth(0, 0.45, pass), grip: grips.L.at, pole });
          if (pass >= 1) gaps.hold[place] = gap;
        }
      }
      g.updateMatrixWorld(true);
    });

    // The presenter's hands: on the base of the trophy being taken, carried
    // or given, one each side; let go a moment after the driver has it.
    if (P.on && busy) {
      const trophy = trophies[busy.place];
      const w = t < busy.lifted ? P.take : 1 - smooth(busy.release, busy.release + 0.3, t);
      if (w > 0) {
        let worst = 0;
        [["R", 1], ["L", -1]].forEach(([s, sign]) => {
          v1.set(0, trophy.foot + 0.04, 0).applyQuaternion(trophy.group.quaternion).add(trophy.group.position).addScaledVector(pr, sign * (trophy.baseRadius + 0.012));
          pole.set(0, -1, 0).addScaledVector(pr, sign * 0.6);
          worst = Math.max(worst, reach(presenter.rig, s, v1, { weight: w, grip: grips[s].at, pole }));
        });
        if (w >= 1) gaps.carry = Math.max(gaps.carry, worst);
      }
    }
  }

  function inspect() {
    const P = state.presenter;
    return {
      presenter: { id: who.id, kind: who.kind, on: Boolean(P && P.on), x: presenter.root.position.x, z: presenter.root.position.z, looks: presenter.looks() },
      table: { x: T.x, z: T.z, height: T.height },
      trophies: [3, 2, 1].map((place) => {
        const trophy = trophies[place];
        const p = trophy.group.getWorldPosition(new THREE.Vector3());
        const d = drivers.find((x) => x.place === place);
        const chest = d.rig.bones.chest.getWorldPosition(new THREE.Vector3());
        return {
          place, metal: trophy.metal, color: trophy.color, height: trophy.height, radius: trophy.radius, where: state.where[place] || "table",
          x: p.x, y: p.y, z: p.z, foot: p.y + trophy.foot,
          // How far its axis is from the driver's chest, less its own width.
          clear: Math.hypot(p.x - chest.x, p.z - chest.z) - trophy.radius,
          rightGrip: gripPoint(d.rig, "R", new THREE.Vector3()).distanceTo(p),
          leftGrip: gripPoint(d.rig, "L", new THREE.Vector3()).distanceTo(p),
        };
      }),
      gaps: { reach: { ...gaps.reach }, carry: gaps.carry, hold: { ...gaps.hold } },
    };
  }

  function dispose() {
    const skeletons = new Set();
    presenter.model.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) skeletons.add(n.skeleton); });
    skeletons.forEach((sk) => sk.dispose());
    presenter.dispose();
  }

  // (Shown while the scene compiles; off stage, and hidden, until its cue.)
  return { update, inspect, dispose, presenter, sheet: presenter.sheet, hide: () => { presenter.root.visible = false; } };
}
