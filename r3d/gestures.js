// Gestures laid over a figure's own poses (r3d/driver.js), for the podium's
// trophy presentation: an arm solved to put its hand on a point (two bones,
// shoulder to wrist), a walk that swings the legs with the distance covered,
// a nod, a lean. Each works on the bones as they are after the figure's
// pose for the frame, so a gesture eases in and out by its weight.
// (docs/superpowers/specs/2026-10-12-trophy-presentation-design.md)

import * as THREE from "three";

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const d = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const q3 = new THREE.Quaternion();

// The figure's bones by name (the body's skeleton), and what a gesture needs
// to know of its build: the arms' lengths and the leg's (hip to ankle).
export function rigOf(model) {
  let body = null;
  model.traverse((n) => { if (n.isSkinnedMesh && n.name === "body") body = n; });
  if (!body) model.traverse((n) => { if (!body && n.isSkinnedMesh) body = n; });
  const bones = {};
  body.skeleton.bones.forEach((bone) => { bones[bone.name] = bone; });
  const need = ["root", "spine", "chest", "head", "upper_arm_L", "forearm_L", "hand_L", "upper_arm_R", "forearm_R", "hand_R", "thigh_L", "shin_L", "thigh_R", "shin_R"];
  need.forEach((name) => { if (!bones[name]) throw new Error(`the figure has no ${name} bone`); });
  const arm = (s) => ({ upper: bones[`upper_arm_${s}`], fore: bones[`forearm_${s}`], hand: bones[`hand_${s}`],
    l1: bones[`forearm_${s}`].position.length(), l2: bones[`hand_${s}`].position.length() });
  const foot = bones.shin_L.children.find((n) => n.isBone);
  const leg = bones.shin_L.position.length() + (foot ? foot.position.length() : bones.shin_L.position.length());
  return { model, body, bones, list: Object.values(bones), arms: { L: arm("L"), R: arm("R") }, leg };
}

// A pose only writes a bone when its value changes (three's mixer), so a
// bone a gesture has turned may still hold that turn next frame. settle()
// puts each such bone back as its pose left it, before the frame's gestures:
// call it once a frame, after the figure's pose is updated.
const memo = new WeakMap();
function wrote(bone) {
  let m = memo.get(bone);
  if (!m) { m = { base: bone.quaternion.clone(), written: new THREE.Quaternion(), touched: false }; memo.set(bone, m); }
  return m;
}
function before(bone) {
  const m = wrote(bone);
  if (!m.touched) { m.base.copy(bone.quaternion); m.touched = true; }
}
function after(bone) {
  wrote(bone).written.copy(bone.quaternion);
}
export function settle(rig) {
  for (let i = 0; i < rig.list.length; i += 1) {
    const bone = rig.list[i];
    const m = memo.get(bone);
    if (!m || !m.touched) continue;
    // Still as the last gesture left it: the pose did not write it. Else the pose's own.
    if (bone.quaternion.equals(m.written)) bone.quaternion.copy(m.base);
    m.touched = false;
  }
  rig.model.updateMatrixWorld(true);
}

// Turn a bone about an axis given in the world, by an angle, blended by weight.
export function turn(bone, axisWorld, angle, weight = 1) {
  if (!weight || !angle) return;
  before(bone);
  bone.parent.getWorldQuaternion(q);
  bone.getWorldQuaternion(q2);
  q3.setFromAxisAngle(axisWorld, angle * weight).multiply(q2);
  bone.quaternion.copy(q.invert().multiply(q3));
  bone.updateMatrixWorld(true);
  after(bone);
}

// Swing a bone so that the point `from` (world, riding on the bone) comes to
// lie in the direction of `to` from the bone's own origin.
function aim(bone, from, to) {
  bone.getWorldPosition(a);
  b.copy(from).sub(a).normalize();
  c.copy(to).sub(a).normalize();
  q3.setFromUnitVectors(b, c);
  bone.parent.getWorldQuaternion(q);
  bone.getWorldQuaternion(q2);
  q3.multiply(q2);
  bone.quaternion.copy(q.invert().multiply(q3));
  bone.updateMatrixWorld(true);
}

// Put the point `grip` (in the hand bone's space; the wrist itself if not
// given) on `target` (world), by bending the arm at the elbow toward `pole`
// (a world direction the elbow favours: down and out, as arms hang).
// axis: { local, world }: the hand is turned as well, so that its own
// direction `local` (a grip's, in the hand bone's space) lies along `world`
// (the stem it closes on). weight 0 leaves the pose as it is, 1 puts the
// hand there, between is a blend of the two. Returns how far the grip would
// be from the target at full weight (0 when it is in reach).
const wrist = new THREE.Vector3();
const elbow = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const goal = new THREE.Vector3();
const along = new THREE.Vector3();
const side = new THREE.Vector3();
const reached = new THREE.Vector3();
const posed = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
// The hand's turn moves where the wrist must be for the grip to land, and
// the forearm's turn moves the hand: solved a few times over, each from the last.
const PASSES = 3;
const CHAIN = ["upper", "fore", "hand"];
export function reach(rig, s, target, weight, pole, grip = null, axis = null) {
  if (weight <= 0) return 0;
  const arm = rig.arms[s];
  for (let i = 0; i < 3; i += 1) { before(arm[CHAIN[i]]); posed[i].copy(arm[CHAIN[i]].quaternion); }
  for (let pass = 0; pass < (grip || axis ? PASSES : 1); pass += 1) {
    if (axis) {
      // The hand, turned the short way to lie along the stem.
      arm.hand.getWorldQuaternion(q2);
      a.copy(axis.local).applyQuaternion(q2).normalize();
      q3.setFromUnitVectors(a, axis.world).multiply(q2);
      arm.hand.parent.getWorldQuaternion(q);
      arm.hand.quaternion.copy(q.invert().multiply(q3));
      arm.hand.updateMatrixWorld(true);
    }
    goal.copy(target);
    if (grip) {
      arm.hand.getWorldPosition(wrist);
      d.copy(grip);
      arm.hand.localToWorld(d);
      goal.sub(d.sub(wrist));
    }
    arm.upper.getWorldPosition(shoulder);
    along.copy(goal).sub(shoulder);
    const max = (arm.l1 + arm.l2) * 0.999;
    const dist = Math.min(max, Math.max(Math.abs(arm.l1 - arm.l2) + 1e-4, along.length()));
    along.normalize();
    // The elbow: on the circle where the two bones' spheres meet, on the pole's side.
    const x = (arm.l1 * arm.l1 - arm.l2 * arm.l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, arm.l1 * arm.l1 - x * x));
    side.copy(pole).addScaledVector(along, -pole.dot(along));
    if (side.lengthSq() < 1e-8) side.set(0, -1, 0).addScaledVector(along, along.y);
    side.normalize();
    elbow.copy(shoulder).addScaledVector(along, x).addScaledVector(side, h);
    arm.fore.getWorldPosition(d);
    aim(arm.upper, d, elbow);
    arm.hand.getWorldPosition(d);
    goal.copy(shoulder).addScaledVector(along, dist);
    aim(arm.fore, d, goal);
    if (axis) {
      // (The arm's turn carried the hand with it: back along the stem.)
      arm.hand.getWorldQuaternion(q2);
      a.copy(axis.local).applyQuaternion(q2).normalize();
      q3.setFromUnitVectors(a, axis.world).multiply(q2);
      arm.hand.parent.getWorldQuaternion(q);
      arm.hand.quaternion.copy(q.invert().multiply(q3));
      arm.hand.updateMatrixWorld(true);
    }
  }
  if (grip) arm.hand.localToWorld(reached.copy(grip));
  else arm.hand.getWorldPosition(reached);
  const gap = reached.distanceTo(target);
  // The blend: each bone part of the way from its pose to where the reach put it.
  for (let i = 0; i < 3; i += 1) {
    const bone = arm[CHAIN[i]];
    if (weight < 1) bone.quaternion.copy(posed[i].slerp(bone.quaternion, weight));
    after(bone);
  }
  arm.upper.updateMatrixWorld(true);
  return gap;
}

// Walking: the legs swing with the distance covered (stride: metres walked),
// by as much as it takes for a step that long (so the feet do not slide);
// the arms swing against them unless they carry something. amount 0..1 eases
// it in. right: the figure's own right, in the world.
export const STRIDE = 1.7;
const LIMBS = [["L", 1], ["R", -1]].map(([s, sign]) => ({ sign, thigh: `thigh_${s}`, shin: `shin_${s}`, upper: `upper_arm_${s}`, fore: `forearm_${s}` }));
export function walk(rig, stride, amount, right, arms = true) {
  if (amount <= 0) return;
  const phase = (stride / STRIDE) * 2 * Math.PI;
  // Two steps to a stride, each the chord a leg sweeps: 2 * leg * sin(swing).
  const reachOfLeg = Math.asin(Math.min(1, STRIDE / (4 * rig.leg)));
  const swing = Math.sin(phase) * reachOfLeg * amount;
  const { bones } = rig;
  // (About the figure's right, a limb that hangs down swings forward for a
  // positive angle.) A thigh forward, the other back; each knee bends as its
  // leg comes through; the arms swing against the legs.
  for (let i = 0; i < 2; i += 1) {
    const limb = LIMBS[i];
    const forward = swing * limb.sign;
    turn(bones[limb.thigh], right, forward);
    turn(bones[limb.shin], right, -(Math.max(0, Math.cos(phase) * limb.sign) * 0.75 + 0.08) * amount);
    if (arms) {
      turn(bones[limb.upper], right, -forward * 0.6);
      turn(bones[limb.fore], right, 0.25 * amount);
    }
  }
}
