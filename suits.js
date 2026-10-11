// The marks on a driver's race suit and where they sit
// (docs/superpowers/specs/2026-10-12-race-suits-design.md): the race number,
// the three-letter code, the surname and the national flag. No team logos,
// crests or wordmarks. r3d/suit.js paints them on a sheet the suit's shader
// lays on the torso. Pure; in the page it defines window.Suits, in Node it is
// require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Suits = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // What a driver's suit says.
  function marks(driver) {
    return {
      number: String(driver.number),
      code: driver.code,
      surname: driver.name.split(" ").pop().toLocaleUpperCase(),
      country: driver.country,
    };
  }

  // The torso's front and back, each a square panel about the body's middle
  // from the belt up to the collar (metres, the figure's own heights). A
  // mark: x toward the figure's left, y its middle's height, w and h its box.
  // `reach`: how far from the middle the marks may lie (beyond it the sides
  // of the torso turn away and the shader fades them out).
  const LAYOUT = {
    panel: { width: 0.48, bottom: 0.96, height: 0.48 },
    reach: 0.15,
    front: {
      number: { x: 0.068, y: 1.315, w: 0.1, h: 0.078 },
      flag: { x: 0, y: 1.405, w: 0.042, h: 0.028 },
      code: { x: 0, y: 1.0075, w: 0.09, h: 0.03 },
    },
    back: {
      surname: { x: 0, y: 1.365, w: 0.26, h: 0.046 },
      number: { x: 0, y: 1.235, w: 0.2, h: 0.15 },
    },
  };

  // The decal sheet, front on its left half and back on its right, per tier.
  const SHEETS = { high: [2048, 1024], medium: [1024, 512], low: [512, 256] };
  const sheetSize = (tier) => SHEETS[tier] || SHEETS.high;

  // Where a point of a side lands on the sheet, 0..1 each way (v up). The
  // front is drawn as it is seen: the figure's left on the viewer's right.
  // From behind, the figure's left is on the viewer's left.
  function sheetUV(side, x, y) {
    const { width, bottom, height } = LAYOUT.panel;
    const across = side === "front" ? 0.5 + x / width : 0.5 - x / width;
    return [(side === "front" ? 0 : 0.5) + across / 2, (y - bottom) / height];
  }

  // A mark's box on a sheet of `size`, in pixels (y down).
  function sheetBox(side, mark, size) {
    const [u, v] = sheetUV(side, mark.x, mark.y);
    const w = (mark.w / LAYOUT.panel.width) * (size[0] / 2);
    const h = (mark.h / LAYOUT.panel.height) * size[1];
    return { x: u * size[0] - w / 2, y: (1 - v) * size[1] - h / 2, w, h };
  }

  // The ink that reads on a suit's colour: white on dark, near black on light.
  function ink(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return lum > 0.4 ? "#14161a" : "#ffffff";
  }

  return { marks, LAYOUT, sheetSize, sheetUV, sheetBox, ink };
}));
