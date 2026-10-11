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
// to know of its build: the arms' lengths, and where each hand's grip is
// (in the hand bone's own space).
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
  return { model, body, bones, arms: { L: arm("L"), R: arm("R") } };
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
  Object.values(rig.bones).forEach((bone) => {
    const m = memo.get(bone);
    if (!m || !m.touched) return;
    // Still as the last gesture left it: the pose did not write it. Else the pose's own.
    if (bone.quaternion.equals(m.written)) bone.quaternion.copy(m.base);
    m.touched = false;
  });
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
function aim(bone, from, to, weight) {
  before(bone);
  bone.getWorldPosition(a);
  b.copy(from).sub(a).normalize();
  c.copy(to).sub(a).normalize();
  q3.setFromUnitVectors(b, c);
  if (weight < 1) q3.slerp(q2.identity(), 1 - weight);
  bone.parent.getWorldQuaternion(q);
  bone.getWorldQuaternion(q2);
  q3.multiply(q2);
  bone.quaternion.copy(q.invert().multiply(q3));
  bone.updateMatrixWorld(true);
  after(bone);
}

// Put the point `grip` (in the hand bone's space; the wrist itself if not
// given) on `target` (world), by bending the arm at the elbow toward `pole`
// (a world direction the elbow favours: down and out, as arms hang).
// weight 0 leaves the pose as it is. Returns how far the grip ends from the
// target (0 when it is in reach).
const wrist = new THREE.Vector3();
const elbow = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const goal = new THREE.Vector3();
const along = new THREE.Vector3();
const side = new THREE.Vector3();
export function reach(rig, s, target, { weight = 1, pole, grip = null } = {}) {
  if (weight <= 0) return 0;
  const arm = rig.arms[s];
  // Twice: the hand's turn (and so where the wrist must be for the grip to
  // land) follows the forearm's.
  for (let pass = 0; pass < (grip ? 3 : 1); pass += 1) {
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
    aim(arm.upper, d, elbow, weight);
    arm.hand.getWorldPosition(d);
    c.copy(shoulder).addScaledVector(along, dist);
    aim(arm.fore, d, c.clone(), weight);
  }
  const end = new THREE.Vector3();
  if (grip) arm.hand.localToWorld(end.copy(grip));
  else arm.hand.getWorldPosition(end);
  return end.distanceTo(target);
}

// Walking: the legs swing with the distance covered (stride: metres walked),
// the arms against them unless they carry something; amount 0..1 eases it in.
// forward, right: the figure's own directions in the world.
const STRIDE = 1.35;
export function walk(rig, stride, amount, right, { arms = true } = {}) {
  if (amount <= 0) return;
  const phase = (stride / STRIDE) * 2 * Math.PI;
  const swing = Math.sin(phase) * 0.5 * amount;
  const { bones } = rig;
  // (About the figure's right, a limb that hangs down swings forward for a
  // positive angle.) A thigh forward, the other back; each knee bends as its
  // leg comes through; the arms swing against the legs.
  [["L", 1], ["R", -1]].forEach(([s, sign]) => {
    const forward = swing * sign;
    turn(bones[`thigh_${s}`], right, forward);
    turn(bones[`shin_${s}`], right, -(Math.max(0, Math.cos(phase) * sign) * 0.75 + 0.08) * amount);
    if (arms) {
      turn(bones[`upper_arm_${s}`], right, -forward * 0.6);
      turn(bones[`forearm_${s}`], right, 0.25 * amount);
    }
  });
}
