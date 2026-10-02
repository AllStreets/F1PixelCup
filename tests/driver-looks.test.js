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
  // No two the same in hair (style and volume) and brows together.
  const tops = new Set(DRIVERS.map((d) => JSON.stringify([d.look.hair.style, d.look.hair.volume, d.look.brows])));
  assert.equal(tops.size, DRIVERS.length);
  const seen = new Set();
  DRIVERS.forEach((d) => {
    const key = JSON.stringify(d.look.shape);
    assert.ok(!seen.has(key), `${d.id}'s face is somebody else's`);
    seen.add(key);
    assert.ok(Object.keys(d.look.shape).length >= 6, `${d.id}'s face has its own shape`);
    // A likeness, never a caricature: no slider past 0.85.
    Object.entries(d.look.shape).forEach(([k, v]) => assert.ok(Math.abs(v) <= 0.85, `${d.id}'s ${k} is ${v}`));
  });
});

test("a look's colours, styles, heritage, shapes, hair and brows are checked", () => {
  const good = DRIVERS.find((d) => d.id === "leclerc").look;
  assert.deepEqual(Faces.checkLook(good), []);
  // Each broken look is refused for that reason, and only that one.
  const refused = (patch, why) => assert.deepEqual(Faces.checkLook({ ...good, ...patch }), [why], why);
  const hair = (h) => ({ hair: { ...good.hair, ...h } });
  const brows = (b) => ({ brows: { ...good.brows, ...b } });
  refused({ skin: "tan" }, "skin is not a colour");
  refused(hair({ style: "mohican" }), "unknown hair style");
  refused({ facialHair: "goatee" }, "unknown facial hair");
  refused({ heritage: { african: 0.5, asian: 0, caucasian: 0.2 } }, "heritage must be shares summing to 1");
  refused({ shape: { jaw_width: 1.4 } }, "jaw_width out of -1..1");
  refused({ shape: { head_square: -0.3 } }, "head_square out of 0..1");
  refused({ shape: { chin_size: 0.2 } }, "unknown shape chin_size");
  refused({ eyes: undefined }, "eyes is not a colour");
  refused(hair({ volume: 2 }), "hair volume out of range");
  refused(hair({ volume: 0.4 }), "hair volume out of range");
  refused({ hair: { style: good.hair.style, color: good.hair.color } }, "no hair volume");
  refused(hair({ volumn: 1 }), "unknown hair key");
  refused({ brows: undefined }, "no brows");
  refused(brows({ thickness: 3 }), "brows' thickness out of range");
  refused(brows({ arch: "high" }), "brows' arch out of range");
  refused({ brows: { thickness: 1, arch: 0, tail: 0.5 } }, "brows' gap out of range");
  refused(brows({ curl: 1 }), "unknown brow shape");
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
