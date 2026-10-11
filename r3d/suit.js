// The race suit's marks and detail
// (docs/superpowers/specs/2026-10-12-race-suits-design.md). A sheet per
// driver (a canvas: the race number, the flag and the code for the front, the
// surname and number for the back; suits.js says where), laid on the torso
// by the suit's shader from the body's rest position, so it stays on the
// cloth in every pose. The same shader draws a race suit's detail: the zip,
// the quilted seams, the ankle cuffs. No team logos, crests or wordmarks.

import * as THREE from "three";
import "../suits.js";
import { drawFlag } from "./flags.js";

const Suits = globalThis.Suits;
const FONT = "'Titillium Web', 'Trebuchet MS', system-ui, sans-serif";

// Text fitted to a box: as tall as the box, squeezed if it is too wide.
function fitText(g, text, box, weight, spacing = 0) {
  const size = box.h * 1.18;
  g.font = `${weight} ${Math.round(size)}px ${FONT}`;
  if ("letterSpacing" in g) g.letterSpacing = `${(spacing * size).toFixed(1)}px`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const m = g.measureText(text);
  const squeeze = Math.min(1, box.w / Math.max(1, m.width));
  g.save();
  // (Half the trailing letter space back, so the word sits centred.)
  g.translate(box.x + box.w / 2 + (spacing * size * squeeze) / 2, box.y + box.h * 0.94);
  g.scale(squeeze, 1);
  return () => { g.restore(); if ("letterSpacing" in g) g.letterSpacing = "0px"; };
}

// The sheet for a driver in a suit of these colours.
export function suitSheet(driver, { suit, trim }, tier = "high") {
  const size = Suits.sheetSize(tier);
  const marks = Suits.marks(driver);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = size;
  const g = canvas.getContext("2d");
  const ink = Suits.ink(suit);
  const L = Suits.LAYOUT;
  const box = (side, key) => Suits.sheetBox(side, L[side][key], size);
  // A number: heavy italics in the ink, a keyline in the trim's colour where
  // that reads against the suit.
  const number = (b) => {
    const done = fitText(g, marks.number, b, "italic 900");
    if (Suits.ink(trim) !== ink || trim.toLowerCase() !== suit.toLowerCase()) {
      g.lineJoin = "round";
      g.lineWidth = Math.max(2, b.h * 0.09);
      g.strokeStyle = trim;
      g.strokeText(marks.number, 0, 0);
    }
    g.fillStyle = ink;
    g.fillText(marks.number, 0, 0);
    done();
  };
  number(box("front", "number"));
  number(box("back", "number"));
  // The flag, with a fine keyline so a white field shows on a white suit.
  const f = box("front", "flag");
  if (drawFlag(g, marks.country, f.x, f.y, f.w, f.h)) {
    g.strokeStyle = "rgba(0, 0, 0, 0.45)";
    g.lineWidth = Math.max(1, size[1] / 512);
    g.strokeRect(f.x, f.y, f.w, f.h);
  }
  // The code on the belt (the trim's colour: its own ink), the surname
  // across the shoulders.
  let done = fitText(g, marks.code, box("front", "code"), "italic 900", 0.12);
  g.fillStyle = Suits.ink(trim);
  g.fillText(marks.code, 0, 0);
  done();
  done = fitText(g, marks.surname, box("back", "surname"), "700", 0.1);
  g.fillStyle = ink;
  g.fillText(marks.surname, 0, 0);
  done();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData = { marks, size };
  return tex;
}

// The suit's shader on one of the body's materials: the sheet on the torso,
// and on the suit itself (`detail`) a race suit's seams and cuffs.
export function wearSuit(material, sheet, { detail, trim }) {
  const { panel, reach } = Suits.LAYOUT;
  const uniforms = {
    suitSheet: { value: sheet },
    suitPanel: { value: new THREE.Vector3(panel.width, panel.bottom, panel.height) },
    suitReach: { value: reach + 0.02 },
    suitTrim: { value: new THREE.Color(trim) },
  };
  material.userData.uniforms = uniforms;
  if (detail) material.defines = { ...(material.defines || {}), SUIT_DETAIL: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRest;\nvarying vec3 vRestN;")
      // (Before skinning: where this point of the cloth is on the body at rest.)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;\nvRestN = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform sampler2D suitSheet;
        uniform vec3 suitPanel;
        uniform float suitReach;
        uniform vec3 suitTrim;
        varying vec3 vRest;
        varying vec3 vRestN;
        // A seam: a fine dark line where a coordinate (metres) crosses zero.
        float suitSeam(float d) {
          float w = max(fwidth(d), 0.0001);
          return 1.0 - smoothstep(0.0007, 0.0007 + w * 1.5, abs(d));
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          // Toward the figure's left (the figure faces +X, its left is -Z).
          float lx = -vRest.z;
          vec3 rn = normalize(vRestN);
          #ifdef SUIT_DETAIL
            // Quilting: seam lines every 5.5 cm, across the torso and legs
            // and across the arms (which hang at 45 degrees at rest).
            bool arm = abs(lx) > 0.2 && vRest.y > 0.8;
            float along = arm ? (abs(lx) + (1.4 - vRest.y)) * 0.7071 : vRest.y;
            float quilt = suitSeam((fract(along / 0.055) - 0.5) * 0.055);
            // A seam down each side of the chest, and the zip down the front.
            float torso = step(1.03, vRest.y) * step(vRest.y, 1.44) * step(abs(lx), 0.2);
            float panelSeam = suitSeam(abs(lx) - 0.118) * torso * step(vRest.y, 1.37);
            float front = smoothstep(0.2, 0.5, rn.x);
            float zip = (1.0 - smoothstep(0.0022, 0.0034, abs(lx))) * front * step(1.03, vRest.y) * step(vRest.y, 1.45);
            // A yoke seam across the chest and the shoulder blades, and the
            // zip's placket, a shade darker either side of it.
            float yoke = suitSeam(vRest.y - 1.372) * step(abs(lx), 0.2) * smoothstep(0.2, 0.5, abs(rn.x));
            float placket = (1.0 - smoothstep(0.011, 0.013, abs(lx))) * front * step(1.03, vRest.y) * step(vRest.y, 1.45);
            diffuseColor.rgb *= 1.0 - 0.3 * max(max(quilt * 0.55, panelSeam), yoke) - 0.07 * placket;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.3, zip);
            // Ankle cuffs in the trim's colour.
            float cuff = step(0.162, vRest.y) * step(vRest.y, 0.2);
            diffuseColor.rgb = mix(diffuseColor.rgb, suitTrim, cuff);
          #endif
          // The marks: the sheet's front half where the cloth faces forward,
          // its back half where it faces back, on the torso only.
          float facing = smoothstep(0.2, 0.5, abs(rn.x)) * (1.0 - smoothstep(suitReach - 0.01, suitReach, abs(lx)));
          float across = 0.5 + (rn.x > 0.0 ? lx : -lx) / suitPanel.x;
          float up = (vRest.y - suitPanel.y) / suitPanel.z;
          if (facing > 0.0 && across > 0.0 && across < 1.0 && up > 0.0 && up < 1.0) {
            vec4 mark = texture2D(suitSheet, vec2((rn.x > 0.0 ? 0.0 : 0.5) + across * 0.5, up));
            diffuseColor.rgb = mix(diffuseColor.rgb, mark.rgb, mark.a * facing);
          }
        }`);
  };
  material.customProgramCacheKey = () => (detail ? "driver-suit-detail" : "driver-suit");
  return material;
}
