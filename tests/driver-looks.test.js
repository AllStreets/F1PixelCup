const test = require("node:test");
const assert = require("node:assert/strict");
const { DRIVERS } = require("../game-data.js");
const Faces = require("../faces.js");

const HEX = /^#[0-9a-f]{6}$/i;

test("every driver has a complete look", () => {
  assert.equal(DRIVERS.length, 20);
  DRIVERS.forEach((d) => {
    assert.ok(d.look, `${d.id} has a look`);
    assert.deepEqual(Faces.checkLook(d.look), [], `${d.id}'s look`);
  });
});

test("every driver's face is his own, and none pushed to an extreme", () => {
  const seen = new Set();
  DRIVERS.forEach((d) => {
    const key = JSON.stringify(d.look.shape);
    assert.ok(!seen.has(key), `${d.id}'s face is somebody else's`);
    seen.add(key);
    assert.ok(Object.keys(d.look.shape).length >= 6, `${d.id}'s face has its own shape`);
    // A likeness, never a caricature: no slider past 0.7.
    Object.entries(d.look.shape).forEach(([k, v]) => assert.ok(Math.abs(v) <= 0.7, `${d.id}'s ${k} is ${v}`));
  });
});

test("a look's colours, styles, heritage and shapes are checked", () => {
  const good = DRIVERS.find((d) => d.id === "leclerc").look;
  assert.deepEqual(Faces.checkLook(good), []);
  const broken = (patch) => Faces.checkLook({ ...good, ...patch });
  assert.ok(broken({ skin: "tan" }).length, "a colour must be a hex colour");
  assert.ok(broken({ hair: { style: "mohican", color: "#222222" } }).length, "unknown hair style");
  assert.ok(broken({ facialHair: "goatee" }).length, "unknown facial hair");
  assert.ok(broken({ heritage: { african: 0.5, asian: 0, caucasian: 0.2 } }).length, "heritage sums to 1");
  assert.ok(broken({ shape: { jaw_width: 1.4 } }).length, "a shape out of range");
  assert.ok(broken({ shape: { head_square: -0.3 } }).length, "a one-way shape below 0");
  assert.ok(broken({ shape: { chin_size: 0.2 } }).length, "an unknown shape");
  assert.ok(broken({ eyes: undefined }).length, "a missing field");
});

test("shapes become morph weights: two-way sliders pick their incr or decr key", () => {
  const w = Faces.morphWeights({ shape: { jaw_width: 0.4, nose_length: -0.25, head_square: 0.5 }, heritage: { african: 0.6, asian: 0, caucasian: 0.4 } });
  assert.equal(w.jaw_width_incr, 0.4);
  assert.equal(w.jaw_width_decr, 0);
  assert.equal(w.nose_length_decr, 0.25);
  assert.equal(w.nose_length_incr, 0);
  assert.equal(w.head_square, 0.5);
  assert.equal(w.ethnic_african, 0.6);
  assert.equal(w.ethnic_caucasian, 0.4);
  // Every morph key gets a weight, unset ones 0.
  Faces.MORPH_KEYS.forEach((k) => assert.equal(typeof w[k], "number", k));
});

test("the showcase pair look like themselves", () => {
  const lec = DRIVERS.find((d) => d.id === "leclerc").look;
  const ham = DRIVERS.find((d) => d.id === "hamilton").look;
  assert.equal(lec.facialHair, "none");
  assert.equal(lec.hair.style, "swept");
  assert.equal(ham.hair.style, "braids");
  assert.equal(ham.facialHair, "moustache");
  assert.ok(ham.heritage.african >= 0.4);
  // Every hair style and every kind of facial hair is used by somebody.
  Faces.HAIR_STYLES.forEach((s) => assert.ok(DRIVERS.some((d) => d.look.hair.style === s), `${s} is used`));
  Faces.FACIAL_HAIR.forEach((s) => assert.ok(DRIVERS.some((d) => d.look.facialHair === s), `${s} is used`));
  DRIVERS.forEach((d) => [d.look.skin, d.look.hair.color, d.look.beardColor, d.look.brow, d.look.eyes].forEach((c) => assert.match(c, HEX)));
});
