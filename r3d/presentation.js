// The trophy presentation, in the podium's scene
// (docs/superpowers/specs/2026-10-12-trophy-presentation-design.md): the
// table, the three trophies (r3d/trophies.js), the presenter
// (r3d/presenter.js), and each frame's handing over: where ceremony.js says
// everyone and everything is, the hands are put there (r3d/gestures.js).
// r3d/podium.js builds it with its own scene and calls update() each frame
// after the drivers' poses. Everything here follows from the time alone, so
// the ceremony can be carried on from any moment.

import * as THREE from "three";
import { buildTrophy } from "./trophies.js";
import { buildPresenter, presenterFor } from "./presenter.js";
import { rigOf, reach, walk, turn, settle } from "./gestures.js";
import { color } from "./textures.js";

const UP = new THREE.Vector3(0, 1, 0);
// (The ceremony's own ease: ceremony.js keeps its for itself.)
const ease = (a, b, t) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
// How a trophy leans in the hand that holds it up (rad, about the hand's own x).
const LEAN = -0.7;
// The right hand takes the stem this far under the cup (m).
const UNDER = 0.04;
// How a hand comes to a stem another hand holds, and leaves it: from this
// far beyond the trophy's foot on its own side, a little below (m).
const APPROACH = { x: 0.14, y: 0.04 };
// A forearm's thickness, and a figure's chest, waist and head (m, from the bone).
const ARM = 0.032;
const BODY = [["chest", 0.15, 0.1], ["spine", 0.14, 0.05], ["head", 0.105, 0.09]];

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
    const sum = new THREE.Vector3();
    points.forEach((v) => { const d = v.clone().sub(mean); sum.addScaledVector(d, d.dot(axis)); });
    axis.copy(sum.normalize());
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
  const grips = { R: frame(gripR, axis), L: frame(gripL, axisL) };
  // A trophy leans in the hand that has it, so its foot and its cup stand
  // clear of the wrist and the forearm: `stem` is the way it then stands.
  grips.R.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), LEAN));
  grips.R.stem = new THREE.Vector3(0, 1, 0).applyQuaternion(grips.R.quat);
  grips.L.stem = mirror(grips.R.stem.clone().transformDirection(restR)).transformDirection(invL);
  return grips;
}

export function createPresentation({ scene, Ceremony, entries, cup, tier, figures, cupColour, geo, mat }) {
  const T = Ceremony.TABLE;
  const PASS = Ceremony.PASS;
  const handover = Object.fromEntries(Ceremony.HANDOVERS.map((h) => [h.place, h]));

  // ---- The table: a dark cloth to the floor, a band in the cup's colour, a pale top ----
  const cloth = mat(new THREE.MeshStandardMaterial({ color: "#141a33", roughness: 0.85 }));
  const band = mat(new THREE.MeshStandardMaterial({ color: color(cupColour), roughness: 0.6 }));
  const top = mat(new THREE.MeshStandardMaterial({ color: "#efe9dc", roughness: 0.7 }));
  const skirt = new THREE.Mesh(geo(new THREE.BoxGeometry(T.width, T.height - 0.02, T.length)), cloth);
  skirt.position.set(T.x, (T.height - 0.02) / 2, T.z);
  const slab = new THREE.Mesh(geo(new THREE.BoxGeometry(T.width + 0.04, 0.02, T.length + 0.04)), top);
  slab.position.set(T.x, T.height - 0.01, T.z);
  const ribbon = new THREE.Mesh(geo(new THREE.BoxGeometry(T.width + 0.006, 0.05, T.length + 0.006)), band);
  ribbon.position.set(T.x, T.height - 0.12, T.z);
  [skirt, slab, ribbon].forEach((m) => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  skirt.name = "trophy-table";

  // ---- The trophies, on it (toward the presenter's side) ----
  const trophies = {};
  const PLACES = [3, 2, 1];
  PLACES.forEach((place) => {
    const trophy = buildTrophy(place, { geo, mat });
    trophy.table = new THREE.Vector3(T.x + T.near, T.height - trophy.foot, T.z + T.on[place]);
    trophy.group.position.copy(trophy.table);
    scene.add(trophy.group);
    trophies[place] = trophy;
  });

  // ---- The presenter ----
  const who = presenterFor(cup, entries);
  const presenter = buildPresenter(who, tier);
  presenter.rig = rigOf(presenter.model);
  const waits = Ceremony.presenterAt(0);
  presenter.root.position.set(waits.x, 0, waits.z);
  presenter.root.rotation.y = waits.heading - Math.PI / 2;
  scene.add(presenter.root);

  // The drivers' rigs by place, and the grips (the same build for every figure).
  const drivers = {};
  figures.forEach((f) => { drivers[f.entry.place] = { ...f, rig: rigOf(f.fig.model), place: f.entry.place, reach: 0 }; });
  const grips = gripsOf(drivers[1].rig);
  const stemR = { local: grips.R.stem, world: new THREE.Vector3() };
  const stemL = { local: grips.L.stem, world: new THREE.Vector3() };

  // What the frame's solving left: how far each hand ended from what it
  // was put on (the arm's reach permitting), and where each trophy is.
  const state = { t: -1, presenter: null, where: {}, hands: { take: {}, join: {}, hold: {}, presenter: null } };
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const pole = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const pr = new THREE.Vector3();
  const dr = new THREE.Vector3(-1, 0, 0);

  // A figure's own directions in the world, from the way it faces (0: +z).
  const forwardOf = (heading, out) => out.set(Math.sin(heading), 0, Math.cos(heading));
  const rightOf = (heading, out) => out.set(-Math.cos(heading), 0, Math.sin(heading));
  // A trophy standing, turned with whoever has it (its handles across them).
  const standing = (heading, out) => out.setFromAxisAngle(UP, heading);
  const ON_TABLE = standing(Ceremony.presenterAt(Ceremony.HANDOVERS[0].pick).heading, new THREE.Quaternion());
  const HELD = standing(0, new THREE.Quaternion());

  // Where a presenter carries one: in front of the waist, its foot at about a metre.
  function carryPoint(P, trophy, out) {
    forwardOf(P.heading, ahead);
    return out.set(P.x, 1.0 - trophy.foot, P.z).addScaledVector(ahead, 0.3 + trophy.baseRadius);
  }
  // In front of a driver's chest, where the hands change over; and by their
  // left side, where the left hand keeps it (the figure's own space: x
  // ahead, -z its left).
  const chestPoint = (d, trophy, out) => d.fig.root.localToWorld(out.set(0.24 + trophy.bowl, 1.16, -0.02));
  const holdPoint = (d, trophy, out) => d.fig.root.localToWorld(out.set(0.2 + trophy.bowl, 1.08, -(0.2 + trophy.bowl * 0.8)));
  // How far a driver has stepped forward on their step.
  const forwardOn = (d) => d.fig.root.position.z - d.step.standZ;

  // The world point of a hand's grip.
  const gripPoint = (rig, s, out) => rig.arms[s].hand.localToWorld(out.copy(grips[s].at));

  // One frame: t seconds into the ceremony. The drivers' figures have their
  // poses for the frame (and their places) already.
  function update(t, dt) {
    const P = Ceremony.presenterAt(t);
    state.t = t;
    state.presenter = P;
    state.hands.presenter = null;
    presenter.root.visible = P.on;
    PLACES.forEach((place) => { drivers[place].fig.root.updateMatrixWorld(true); settle(drivers[place].rig); });
    rightOf(P.heading, pr);

    // The presenter's trophy this moment (being taken, carried or given), if any.
    const busy = Ceremony.HANDOVERS.find((h) => t >= h.pick && t < h.release);
    if (P.on) {
      presenter.root.position.set(P.x, 0, P.z);
      presenter.root.rotation.y = P.heading - Math.PI / 2;
      presenter.play("stand");
      presenter.update(dt);
      presenter.root.updateMatrixWorld(true);
      settle(presenter.rig);
      walk(presenter.rig, P.stride, P.walking, pr, { arms: !busy });
      // A slight lean to the table as the trophy is taken; a nod once it is given.
      if (P.take > 0) { turn(presenter.rig.bones.spine, pr, -0.1 * P.take); turn(presenter.rig.bones.chest, pr, -0.06 * P.take); }
      if (P.nod > 0) { turn(presenter.rig.bones.head, pr, -0.34 * P.nod); turn(presenter.rig.bones.chest, pr, -0.1 * P.nod); }
    }

    PLACES.forEach((place) => {
      const trophy = trophies[place];
      const h = handover[place];
      const d = drivers[place];
      const { where, pass } = Ceremony.trophyAt(place, t);
      state.where[place] = where;
      const g = trophy.group;
      const point = Ceremony.handPoint(place, forwardOn(d));
      d.reach = Ceremony.reachAt(place, t);
      // The driver bends to it (the presenter stands lower): more, the further back they stand.
      if (d.reach > 0) {
        const bend = 0.4 + 0.9 * Math.max(0, Ceremony.STEP_FORWARD - forwardOn(d));
        turn(d.rig.bones.spine, dr, -bend * d.reach);
        turn(d.rig.bones.chest, dr, -0.2 * d.reach);
      }
      if (where === "table") {
        g.position.copy(trophy.table);
        g.quaternion.copy(ON_TABLE);
      } else if (where === "presenter") {
        // Straight up off the table, then in to the carry; then held up to the driver.
        carryPoint(P, trophy, v1);
        const u = ease(h.lifted, h.carried, t);
        const inward = ease(0.4, 1, u);
        g.position.set(
          trophy.table.x + (v1.x - trophy.table.x) * inward,
          trophy.table.y + 0.07 * Math.min(1, u / 0.3) + (v1.y - trophy.table.y - 0.07) * inward,
          trophy.table.z + (v1.z - trophy.table.z) * inward,
        );
        if (P.raise > 0) g.position.lerp(v2.set(point[0], point[1], point[2]), P.raise);
        standing(P.heading, g.quaternion);
      }
      // The driver's right hand: out to the stem as it is held up, and on
      // it where it was given until the presenter has let go.
      if (d.reach > 0) {
        v3.set(point[0], point[1], point[2]);
        if (where === "presenter") v3.copy(g.position);
        v3.y -= UNDER;
        pole.set(-0.3, -1, -0.2);
        stemR.world.copy(UP);
        state.hands.take[place] = reach(d.rig, "R", v3, { weight: d.reach, grip: grips.R.at, pole, axis: stemR });
      }
      if (where === "right" || where === "left") {
        const gone = ease(0, PASS.joined, pass);
        if (pass > 0 && where === "right") {
          // Down in front of the chest, upright, for the left hand to take.
          pole.set(-0.6, -1, -0.2);
          stemR.world.copy(UP);
          chestPoint(d, trophy, v3).y -= UNDER;
          reach(d.rig, "R", v3, { weight: gone, grip: grips.R.at, pole, axis: stemR });
        }
        if (where === "right") {
          // In the right hand, standing as the hand holds it (eased from
          // how the presenter held it, once they have let go).
          d.rig.arms.R.hand.getWorldQuaternion(q1).multiply(grips.R.quat);
          standing(h.stands[2], q2).slerp(q1, ease(h.release, h.release + 0.4, t));
          g.quaternion.copy(q2).slerp(HELD, gone);
          gripPoint(d.rig, "R", g.position).addScaledVector(v1.copy(UP).applyQuaternion(g.quaternion), UNDER);
          if (pass > 0) {
            // The left hand comes to the stem, under the right: from below
            // and beside it (never down through the cup).
            v1.copy(UP).applyQuaternion(g.quaternion);
            v3.copy(g.position).addScaledVector(v1, -trophy.lower);
            const short = 1 - ease(PASS.joined * 0.55, PASS.joined, pass);
            v3.x += (APPROACH.x + trophy.baseRadius) * short;
            v3.y -= APPROACH.y * short;
            pole.set(0.6, -1, -0.2);
            stemL.world.copy(v1);
            state.hands.join[place] = reach(d.rig, "L", v3, { weight: ease(0.06, PASS.joined * 0.6, pass), grip: grips.L.at, pole, axis: stemL });
          }
        } else {
          // The left hand has it: from the chest to the driver's side, and
          // kept there; the right lets go.
          const go = ease(PASS.given, 1, pass);
          chestPoint(d, trophy, v1).lerp(holdPoint(d, trophy, v2), go);
          v3.copy(v1).addScaledVector(UP, -trophy.lower);
          pole.set(0.6, -1, -0.2);
          stemL.world.copy(UP);
          state.hands.hold[place] = reach(d.rig, "L", v3, { weight: 1, grip: grips.L.at, pole, axis: stemL });
          gripPoint(d.rig, "L", g.position).addScaledVector(UP, trophy.lower);
          g.quaternion.copy(HELD);
          // (Away to its own side first, clear of the cup, then back to its pose.)
          const still = 1 - ease(PASS.given + 0.1, PASS.given + 0.36, pass);
          if (still > 0) {
            const away = ease(PASS.given, PASS.given + 0.14, pass);
            pole.set(-0.6, -1, -0.2);
            stemR.world.copy(UP);
            v3.copy(g.position);
            v3.x -= (APPROACH.x + trophy.bowl) * away;
            v3.y -= UNDER + APPROACH.y * away;
            reach(d.rig, "R", v3, { weight: still, grip: grips.R.at, pole, axis: stemR });
          }
        }
      }
      g.updateMatrixWorld(true);
    });

    // The presenter's hands: on the foot of the trophy being taken, carried
    // or given, one each side; they let go a moment after the driver has it.
    if (P.on && busy) {
      const trophy = trophies[busy.place];
      const w = t < busy.lifted ? ease(busy.pick, busy.lifted - 0.04, t) : 1 - ease(busy.contact + 0.08, busy.release, t);
      if (w > 0) {
        let worst = 0;
        [["R", 1], ["L", -1]].forEach(([s, sign]) => {
          v1.set(0, trophy.foot + 0.04, 0).applyQuaternion(trophy.group.quaternion).add(trophy.group.position).addScaledVector(pr, sign * (trophy.baseRadius + 0.012));
          pole.set(0, -1, 0).addScaledVector(pr, sign * 0.6);
          worst = Math.max(worst, reach(presenter.rig, s, v1, { weight: w, grip: grips[s].at, pole }));
        });
        state.hands.presenter = { place: busy.place, gap: worst, weight: w };
      }
    }
  }

  // ---- What the checks read (worked out when asked, not every frame) ----
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  // How far a forearm (elbow to just short of the wrist: the hand itself is
  // on the stem) stays from a trophy's metal.
  function armGap(rig, s, trophy) {
    rig.arms[s].fore.getWorldPosition(a);
    rig.arms[s].hand.getWorldPosition(b);
    let gap = Infinity;
    for (let k = 0; k <= 8; k += 1) gap = Math.min(gap, trophy.gapTo(trophy.group.worldToLocal(c.copy(a).lerp(b, (k / 8) * 0.8))) - ARM);
    return gap;
  }
  // And a figure's chest, waist and head.
  function bodyGap(rig, trophy) {
    let gap = Infinity;
    BODY.forEach(([name, radius, up]) => {
      rig.bones[name].getWorldPosition(c);
      c.y += up;
      gap = Math.min(gap, trophy.gapTo(trophy.group.worldToLocal(c)) - radius);
    });
    return gap;
  }

  function inspect() {
    const P = state.presenter;
    const on = Boolean(P && P.on);
    return {
      presenter: {
        id: who.id, kind: who.kind, on, shown: presenter.root.visible, x: presenter.root.position.x, z: presenter.root.position.z, looks: presenter.looks(),
        // Clear of every trophy (the one in hand as well), body and arms.
        body: on ? Math.min(...PLACES.map((place) => bodyGap(presenter.rig, trophies[place]))) : null,
        arms: on ? Math.min(...PLACES.flatMap((place) => ["R", "L"].map((s) => armGap(presenter.rig, s, trophies[place])))) : null,
        hands: state.hands.presenter ? { ...state.hands.presenter } : null,
      },
      table: { x: T.x, z: T.z, height: T.height, width: T.width, length: T.length },
      trophies: PLACES.map((place) => {
        const trophy = trophies[place];
        const p = trophy.group.getWorldPosition(new THREE.Vector3());
        const d = drivers[place];
        const others = PLACES.filter((x) => x !== place).map((x) => trophies[x]);
        return {
          place, metal: trophy.metal, color: trophy.color, height: trophy.height, radius: trophy.radius, where: state.where[place] || "table",
          x: p.x, y: p.y, z: p.z, foot: p.y + trophy.foot,
          // How upright it stands (1: straight up).
          upright: new THREE.Vector3(0, 1, 0).applyQuaternion(trophy.group.quaternion).y,
          // Clear of the other two (their widest, side by side).
          apart: Math.min(...others.map((o) => (p.y + trophy.foot > o.group.position.y + o.top || o.group.position.y + o.foot > p.y + trophy.top ? Infinity
            : Math.hypot(o.group.position.x - p.x, o.group.position.z - p.z) - o.radius - trophy.radius))),
          // The driver's own body and forearms, clear of its metal.
          body: bodyGap(d.rig, trophy),
          arms: { R: armGap(d.rig, "R", trophy), L: armGap(d.rig, "L", trophy) },
          // How far each of the driver's hands (its grip) is from the stem.
          grip: { R: gripPoint(d.rig, "R", new THREE.Vector3()).distanceTo(p), L: gripPoint(d.rig, "L", new THREE.Vector3()).distanceTo(p) },
        };
      }),
      hands: { take: { ...state.hands.take }, join: { ...state.hands.join }, hold: { ...state.hands.hold } },
    };
  }

  function dispose() {
    const skeletons = new Set();
    presenter.model.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) skeletons.add(n.skeleton); });
    skeletons.forEach((sk) => sk.dispose());
    presenter.dispose();
  }

  return { update, inspect, dispose, presenter, sheet: presenter.sheet };
}
