// The drivers' faces (docs/superpowers/specs/2026-10-01-driver-faces-design.md):
// what a driver's `look` in game-data.js may say, how it is checked, and how
// its shape sliders become the head's morph target weights (the shape keys
// tools/blender/driver_head.py bakes from MakeHuman's targets). Pure; in the
// page it defines window.Faces (r3d/driver.js imports it for that); in Node it
// is require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Faces = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // Two-way sliders, -1..1: each is a pair of keys, name_incr and name_decr.
  const TWO_WAY = [
    "head_width", "face_length", "head_depth", "head_age", "head_fat",
    "jaw_width", "chin_width", "chin_prominent", "chin_height",
    "cheekbones", "cheek_volume",
    "nose_length", "nose_width", "nose_depth", "nose_hump", "nose_tip", "nose_flare", "nose_volume",
    "brow_forward", "brow_height", "brow_angle", "forehead_height", "forehead_slope",
    "lips_volume", "mouth_width", "mouth_corners",
    "eye_size", "eye_angle", "eye_open", "eye_bag", "eye_spacing",
    "ear_size", "ear_out", "neck_width",
  ];
  // One-way sliders, 0..1.
  const ONE_WAY = [
    "head_square", "head_oval", "head_round", "head_triangular", "head_invertedtriangular",
    "head_rectangular", "head_diamond", "chin_cleft",
  ];
  // MakeHuman's three ethnic blend targets, as a mix summing to 1.
  const HERITAGE = ["african", "asian", "caucasian"];
  const MORPH_KEYS = [
    ...TWO_WAY.flatMap((k) => [`${k}_incr`, `${k}_decr`]),
    ...ONE_WAY,
    ...HERITAGE.map((h) => `ethnic_${h}`),
  ];
  const HAIR_STYLES = ["crop", "swept", "textured", "curly", "long_back", "braids", "buzz", "side_part", "fringe", "messy"];
  // How full a driver's hair is against his style's own (its depth scaled).
  const HAIR_VOLUME = [0.6, 1.5];
  // A driver's brows: how thick against a plain brow; how arched (-1 flat
  // or falling, 1 high); how far the tail drops (0..1); how far toward the
  // nose they start (0 close, 1 apart).
  const BROW_SHAPE = { thickness: [0.5, 1.6], arch: [-1, 1], tail: [0, 1], gap: [0, 1] };
  const FACIAL_HAIR = ["none", "stubble", "short_beard", "full_beard", "moustache"];
  const HEX = /^#[0-9a-f]{6}$/i;

  // Every problem with a look, as text; [] when it is complete and in range.
  function checkLook(look) {
    const out = [];
    if (!look || typeof look !== "object") return ["no look"];
    ["skin", "beardColor", "brow", "eyes"].forEach((k) => {
      if (!HEX.test(look[k] || "")) out.push(`${k} is not a colour`);
    });
    if (!look.hair || !HAIR_STYLES.includes(look.hair.style)) out.push("unknown hair style");
    if (!look.hair || !HEX.test(look.hair.color || "")) out.push("hair colour is not a colour");
    const vol = look.hair && look.hair.volume;
    if (!(typeof vol === "number" && vol >= HAIR_VOLUME[0] && vol <= HAIR_VOLUME[1])) out.push("hair volume out of range");
    const brows = look.brows || {};
    Object.entries(BROW_SHAPE).forEach(([k, [lo, hi]]) => {
      if (!(typeof brows[k] === "number" && brows[k] >= lo && brows[k] <= hi)) out.push(`brows' ${k} out of range`);
    });
    if (Object.keys(brows).some((k) => !(k in BROW_SHAPE))) out.push("unknown brow shape");
    if (!FACIAL_HAIR.includes(look.facialHair)) out.push("unknown facial hair");
    const her = look.heritage || {};
    const total = HERITAGE.reduce((n, h) => n + (her[h] || 0), 0);
    if (Object.keys(her).some((h) => !HERITAGE.includes(h))) out.push("unknown heritage key");
    if (HERITAGE.some((h) => (her[h] || 0) < 0) || Math.abs(total - 1) > 1e-6) out.push("heritage must be shares summing to 1");
    Object.entries(look.shape || {}).forEach(([k, v]) => {
      if (TWO_WAY.includes(k)) {
        if (!(typeof v === "number" && v >= -1 && v <= 1)) out.push(`${k} out of -1..1`);
      } else if (ONE_WAY.includes(k)) {
        if (!(typeof v === "number" && v >= 0 && v <= 1)) out.push(`${k} out of 0..1`);
      } else out.push(`unknown shape ${k}`);
    });
    return out;
  }

  // The morph target weights for a look: every key in MORPH_KEYS, unset ones 0.
  function morphWeights(look) {
    const w = Object.fromEntries(MORPH_KEYS.map((k) => [k, 0]));
    Object.entries((look && look.shape) || {}).forEach(([k, v]) => {
      if (TWO_WAY.includes(k)) {
        w[`${k}_incr`] = Math.max(0, v);
        w[`${k}_decr`] = Math.max(0, -v);
      } else if (ONE_WAY.includes(k)) w[k] = v;
    });
    // The keys are each blend target less the even mix the head is built
    // with, so shares summing to 1 give MakeHuman's own blend.
    const her = (look && look.heritage) || { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 };
    HERITAGE.forEach((h) => { w[`ethnic_${h}`] = her[h] || 0; });
    return w;
  }

  return { TWO_WAY, ONE_WAY, HERITAGE, MORPH_KEYS, HAIR_STYLES, HAIR_VOLUME, BROW_SHAPE, FACIAL_HAIR, checkLook, morphWeights };
}));
