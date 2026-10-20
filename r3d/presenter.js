// The dignitary who presents the podium's trophies
// (docs/design/specs/2026-10-12-trophy-presentation-design.md): the
// driver figure with a look of their own (faces.js) and formal wear. A man in
// a dark suit and tie or a woman in a trouser suit, drawn from the podium
// itself (the cup and its top three), so the same podium has the same one.
// Nobody on the grid, and nobody real.

import * as THREE from "three";
import "../suits.js";
import { buildDriver } from "./driver.js";

const Suits = globalThis.Suits;

const PRESENTERS = [
  {
    id: "presenter-man",
    kind: "man",
    outfit: { suit: "#161d33", shirt: "#f4f4f0", accent: "#7d1626", tie: true, shoes: "#0c0c0e" },
    look: {
      skin: "#c99a7c", beardColor: "#6f6a66", brow: "#5a554f", eyes: "#5b6f7c",
      hair: { style: "side_part", color: "#8e8a85", volume: 0.9 },
      brows: { thickness: 1.1, arch: 0.1, tail: 0.4, gap: 0.5, density: 0.8 },
      facialHair: "none",
      heritage: { african: 0, asian: 0.1, caucasian: 0.9 },
      shape: { head_age: 0.75, head_fat: 0.25, jaw_width: 0.3, nose_length: 0.3, nose_width: 0.2, brow_forward: 0.2, lips_volume: -0.3, eye_bag: 0.5, forehead_height: 0.3, head_rectangular: 0.3, chin_width: 0.2 },
    },
  },
  {
    id: "presenter-woman",
    kind: "woman",
    outfit: { suit: "#0f4a3c", shirt: "#f1ead8", accent: "#d9b45a", tie: false, shoes: "#0c0c0e" },
    look: {
      skin: "#8f5f43", beardColor: "#1a1412", brow: "#1e1714", eyes: "#3a2a1e",
      hair: { style: "long_back", color: "#1b1412", volume: 1.35 },
      brows: { thickness: 0.7, arch: 0.55, tail: 0.5, gap: 0.6, density: 0.9 },
      facialHair: "none",
      heritage: { african: 0.45, asian: 0.15, caucasian: 0.4 },
      shape: { head_age: 0.15, jaw_width: -0.6, chin_width: -0.5, chin_prominent: -0.3, cheekbones: 0.5, cheek_volume: 0.2, nose_width: -0.3, nose_length: -0.2, lips_volume: 0.6, eye_size: 0.4, eye_open: 0.3, brow_height: 0.4, brow_forward: -0.5, neck_width: -0.6, head_oval: 0.5, mouth_corners: 0.3 },
    },
  },
];

// Which presenter a podium has: from its cup and top three, always the same.
export function presenterFor(cup, entries) {
  const key = `${cup.id}|${cup.name}|${entries.map((e) => e.driver.id).join(",")}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return PRESENTERS[(h >>> 7) % PRESENTERS.length];
}

// The front and back of the jacket, on the suit's own sheet (suits.js: the
// torso's panels): in front the shirt in the V of the lapels, the lapels'
// edges, a tie or the blouse's neckline and a brooch, buttons; behind, the
// jacket's collar, the seam down the middle and its vent.
function formalSheet(outfit, tier) {
  const size = Suits.sheetSize(tier);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = size;
  const g = canvas.getContext("2d");
  const { panel } = Suits.LAYOUT;
  // The front panel is the sheet's left half, the back its right (sheetUV
  // says where a point of the cloth lands): x across the chest (m, 0 the
  // middle), y up (m).
  const at = (x, y, side = "front") => {
    const [u, v] = Suits.sheetUV(side, x, y);
    return [u * size[0], (1 - v) * size[1]];
  };
  const poly = (points, fill, side = "front") => {
    g.beginPath();
    points.forEach(([x, y], i) => { const [px, py] = at(x, y, side); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const top = panel.bottom + panel.height;
  const vee = outfit.tie ? 1.17 : 1.2;
  // The shirt (or blouse) in the V.
  poly([[-0.075, top], [0.075, top], [0, vee]], outfit.shirt);
  // The lapels: a lighter edge along the V, each side.
  const lapel = "rgba(255, 255, 255, 0.1)";
  poly([[-0.075, top], [-0.115, top], [-0.118, 1.33], [0, vee - 0.012], [0, vee]], lapel);
  poly([[0.075, top], [0.115, top], [0.118, 1.33], [0, vee - 0.012], [0, vee]], lapel);
  if (outfit.tie) {
    // The knot, then the blade down to the V.
    poly([[-0.017, top], [0.017, top], [0.012, top - 0.035], [-0.012, top - 0.035]], outfit.accent);
    poly([[-0.011, top - 0.035], [0.011, top - 0.035], [0.02, vee + 0.03], [0, vee + 0.002], [-0.02, vee + 0.03]], outfit.accent);
  } else {
    // A brooch on the lapel.
    const [bx, by] = at(-0.09, 1.34);
    g.fillStyle = outfit.accent;
    g.beginPath();
    g.arc(bx, by, size[1] * 0.012, 0, Math.PI * 2);
    g.fill();
  }
  // Two buttons below the V.
  [vee - 0.05, vee - 0.11].forEach((y) => {
    const [bx, by] = at(0.006, y);
    g.fillStyle = "rgba(0, 0, 0, 0.55)";
    g.beginPath();
    g.arc(bx, by, size[1] * 0.007, 0, Math.PI * 2);
    g.fill();
  });
  // Behind: the jacket's collar (the shirt's shows over it: the figure's own
  // collar band), the seam down the middle of the back, the vent at its foot.
  const seam = "rgba(0, 0, 0, 0.42)";
  poly([[-0.085, top], [0.085, top], [0.07, top - 0.035], [-0.07, top - 0.035]], lapel, "back");
  poly([[-0.0016, top - 0.04], [0.0016, top - 0.04], [0.0016, panel.bottom + 0.15], [-0.0016, panel.bottom + 0.15]], seam, "back");
  poly([[-0.004, panel.bottom + 0.15], [0.004, panel.bottom + 0.15], [0.007, panel.bottom], [-0.007, panel.bottom]], seam, "back");
  // (A woman's jacket is cut in at the waist: a dart each side of the seam.)
  if (!outfit.tie) [-0.07, 0.07].forEach((x) => poly([[x - 0.0012, 1.3], [x + 0.0012, 1.3], [x * 0.8 + 0.0012, panel.bottom + 0.04], [x * 0.8 - 0.0012, panel.bottom + 0.04]], seam, "back"));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.anisotropy = 4;
  tex.userData = { marks: { formal: outfit.tie ? "suit and tie" : "trouser suit", back: "collar, seam and vent" }, size };
  return tex;
}

// The figure, dressed: buildDriver's, in the outfit instead of a race suit.
export function buildPresenter(who, tier) {
  const fig = buildDriver({ id: who.id, name: who.kind, look: who.look }, null, {
    headwear: "none",
    tier,
    outfit: { ...who.outfit, sheet: formalSheet(who.outfit, tier), hands: who.look.skin },
  });
  fig.root.name = who.id;
  return fig;
}
