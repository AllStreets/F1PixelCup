// The teams' crests (docs/superpowers/specs/2026-10-12-team-crests-design.md):
// original marks drawn for this game, one per team, in the team's colours.
// Each has a silhouette of its own, an abstract motif and the team's
// three-letter code. None copies a real mark: no official logos, no sponsor
// names. Also where the crest, the race number, the team's name and the flag
// sit on the race suit (r3d/suit.js paints them there). Pure; in the page it
// defines window.Crests, in Node it is require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Crests = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // Everything is drawn in a 100 by 100 box. A shape is points joined by
  // straight lines, or a path of M, L, C and Z with absolute coordinates.
  const poly = (pts) => `M${pts.map((p) => p.join(" ")).join(" L")} Z`;
  // A circle as four curves (0.5523: the handle that makes a quarter circle).
  const round = (cx, cy, rx, ry = rx) => {
    const kx = +(rx * 0.5523).toFixed(2), ky = +(ry * 0.5523).toFixed(2);
    return `M${cx} ${cy - ry} C${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy} C${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry} `
      + `C${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy} C${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry} Z`;
  };
  // A pill lying on its side.
  const pill = (x0, x1, y0, y1) => {
    const r = (y1 - y0) / 2, k = +(r * 0.5523).toFixed(2), cy = (y0 + y1) / 2;
    return `M${x0 + r} ${y0} L${x1 - r} ${y0} C${x1 - r + k} ${y0} ${x1} ${cy - k} ${x1} ${cy} C${x1} ${cy + k} ${x1 - r + k} ${y1} ${x1 - r} ${y1} `
      + `L${x0 + r} ${y1} C${x0 + r - k} ${y1} ${x0} ${cy + k} ${x0} ${cy} C${x0} ${cy - k} ${x0 + r - k} ${y0} ${x0 + r} ${y0} Z`;
  };
  // A path drawn smaller about a point: the field inside its edge.
  const inset = (d, k, cx = 50, cy = 50) => {
    let i = 0;
    return d.replace(/-?\d+(\.\d+)?/g, (n) => {
      const c = i % 2 === 0 ? cx : cy;
      i += 1;
      return String(+(c + (Number(n) - c) * k).toFixed(2));
    });
  };

  const SHAPES = {
    hexagon: poly([[50, 3], [91, 26], [91, 74], [50, 97], [9, 74], [9, 26]]),
    roundel: round(50, 50, 47),
    diamond: poly([[50, 2], [98, 50], [50, 98], [2, 50]]),
    shield: "M9 6 L91 6 L91 50 C91 76 72 90 50 98 C28 90 9 76 9 50 Z",
    octagon: poly([[31, 4], [69, 4], [96, 31], [96, 69], [69, 96], [31, 96], [4, 69], [4, 31]]),
    triangle: poly([[50, 3], [98, 92], [2, 92]]),
    pennant: poly([[14, 3], [86, 3], [86, 97], [50, 78], [14, 97]]),
    bevel: poly([[5, 5], [72, 5], [95, 28], [95, 95], [28, 95], [5, 72]]),
    plate: poly([[7, 5], [93, 5], [93, 56], [50, 97], [7, 56]]),
    stadium: pill(2, 98, 22, 78),
  };

  // The motifs: abstract marks, each a list of [path, which colour].
  const MOTIFS = {
    // Two wedges, one behind the other, driving forward.
    wedges: [[poly([[26, 20], [50, 33], [26, 46], [33, 33]]), "accent"], [poly([[48, 20], [76, 33], [48, 46], [56, 33]]), "edge"]],
    // A compass star: four points.
    compass: [[poly([[50, 12], [56, 30], [74, 36], [56, 42], [50, 60], [44, 42], [26, 36], [44, 30]]), "accent"]],
    // A level bar across the middle, a notch cut from its top edge.
    notch: [[poly([[20, 42], [44, 42], [50, 49], [56, 42], [80, 42], [72, 56], [28, 56]]), "accent"]],
    // An arrowhead, pointing up.
    arrowhead: [[poly([[50, 14], [72, 50], [57, 44], [50, 54], [43, 44], [28, 50]]), "accent"]],
    // One peak.
    peak: [[poly([[50, 16], [78, 50], [66, 50], [50, 31], [34, 50], [22, 50]]), "accent"]],
    // A snow cap on the triangle's summit.
    snowcap: [[poly([[50, 12], [66, 42], [58, 37], [50, 45], [42, 37], [34, 42]]), "accent"]],
    // Two waves.
    waves: [["M24 22 C33 14 41 14 50 22 C59 30 67 30 76 22 L76 30 C67 38 59 38 50 30 C41 22 33 22 24 30 Z", "accent"],
      ["M24 38 C33 30 41 30 50 38 C59 46 67 46 76 38 L76 46 C67 54 59 54 50 46 C41 38 33 38 24 46 Z", "accent"]],
    // A band across one corner.
    band: [[poly([[5, 46], [46, 5], [64, 5], [5, 64]]), "accent"]],
    // Twin pillars.
    pillars: [[poly([[32, 14], [44, 14], [44, 50], [32, 50]]), "accent"], [poly([[56, 14], [68, 14], [68, 50], [56, 50]]), "edge"]],
    // Two slashes at one end.
    slashes: [[poly([[14, 62], [22, 62], [30, 38], [22, 38]]), "accent"], [poly([[26, 62], [32, 62], [40, 38], [34, 38]]), "accent"]],
  };

  // field: the crest's ground; edge: its border; accent: the motif; ink: the
  // code. code: where the letters sit, [x, y of their baseline, size].
  const CRESTS = {
    redBull: { shape: "hexagon", motif: "wedges", code: "RBR", field: "#1e41b2", edge: "#e8bf00", accent: "#e0142d", ink: "#ffffff", text: [50, 74, 23] },
    ferrari: { shape: "roundel", motif: "compass", code: "FER", field: "#dc0000", edge: "#ffed00", accent: "#ffed00", ink: "#ffffff", text: [50, 82, 20] },
    mclaren: { shape: "diamond", motif: "notch", code: "MCL", field: "#ff8000", edge: "#0093cc", accent: "#0b1e33", ink: "#0b1e33", text: [50, 76, 17] },
    mercedes: { shape: "shield", motif: "arrowhead", code: "MER", field: "#101418", edge: "#c0c0c0", accent: "#00d2be", ink: "#c0c0c0", text: [50, 78, 21] },
    astonMartin: { shape: "octagon", motif: "peak", code: "AMR", field: "#006f62", edge: "#cedc00", accent: "#cedc00", ink: "#ffffff", text: [50, 78, 23] },
    alpine: { shape: "triangle", motif: "snowcap", code: "ALP", field: "#0090ff", edge: "#ff87bc", accent: "#ffffff", ink: "#ffffff", text: [50, 80, 21] },
    williams: { shape: "pennant", motif: "waves", code: "WIL", field: "#005aff", edge: "#ffffff", accent: "#ffffff", ink: "#ffffff", text: [50, 71, 21] },
    haas: { shape: "bevel", motif: "band", code: "HAA", field: "#ffffff", edge: "#15171a", accent: "#e8002d", ink: "#15171a", text: [58, 82, 23] },
    racingBulls: { shape: "plate", motif: "pillars", code: "RCB", field: "#ffffff", edge: "#6692ff", accent: "#e0142d", ink: "#1a2a6c", text: [50, 76, 20] },
    sauber: { shape: "stadium", motif: "slashes", code: "SAU", field: "#2a2a2a", edge: "#39ff14", accent: "#39ff14", ink: "#ffffff", text: [63, 59, 25] },
  };
  // How far inside its edge each silhouette's field is drawn.
  const INSET = { triangle: 0.84, diamond: 0.88, stadium: 0.9 };

  function crestFor(team) {
    return (team && CRESTS[team.id]) || null;
  }

  // The crest's paths, back to front: [{ d, fill }]. The first is its outline.
  function paths(crest) {
    const outline = SHAPES[crest.shape];
    // (The triangle's middle is lower than the box's.)
    const cy = crest.shape === "triangle" ? 62 : 50;
    return [
      { d: outline, fill: crest.edge },
      { d: inset(outline, INSET[crest.shape] || 0.9, 50, cy), fill: crest.field },
      ...MOTIFS[crest.motif].map(([d, key]) => ({ d, fill: crest[key] })),
    ];
  }

  const FONT = "'Titillium Web', 'Trebuchet MS', system-ui, sans-serif";

  // As an SVG string, `size` CSS pixels square, named for screen readers.
  function svg(team, size = 48) {
    const c = crestFor(team);
    if (!c) return "";
    const [x, y, s] = c.text;
    const name = String(team.name || team.id).replace(/[<>&]/g, "");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" class="crest">`
      + `<title>${name} crest</title>`
      + paths(c).map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join("")
      + `<text x="${x}" y="${y}" font-family="${FONT.replace(/'/g, "")}" font-size="${s}" font-weight="900" font-style="italic" text-anchor="middle" fill="${c.ink}">${c.code}</text>`
      + "</svg>";
  }

  // On a 2D canvas, in a `size` square with its corner at (x, y). (Path2D
  // reads the same path strings the SVG uses.)
  function draw(g, team, x, y, size) {
    const c = crestFor(team);
    if (!c) return false;
    g.save();
    g.translate(x, y);
    g.scale(size / 100, size / 100);
    paths(c).forEach((p) => {
      g.fillStyle = p.fill;
      g.fill(new Path2D(p.d));
    });
    const [tx, ty, ts] = c.text;
    g.font = `italic 900 ${ts}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillStyle = c.ink;
    g.fillText(c.code, tx, ty);
    g.restore();
    return true;
  }

  // Real sponsor and brand names: no crest's text may hold one (tested).
  const BANNED = [
    "Oracle", "Petronas", "Shell", "Santander", "HP", "Aramco", "Cognizant", "BWT", "Castrol", "Komatsu", "Gulf", "MoneyGram",
    "Visa", "Cash App", "Stake", "Kick", "Rolex", "Pirelli", "Mobil", "Google", "Chrome", "Mastercard", "OKX", "Ineos",
    "Marlboro", "Puma", "Alpinestars", "Sparco", "Heineken", "DHL", "AWS", "Lenovo", "Qatar", "Red Bull", "Ferrari",
    "Mercedes", "McLaren", "Aston Martin", "Williams", "Haas", "Sauber", "Audi", "Renault", "Honda", "AMG",
  ];

  // Where things sit on the suit: the torso's front and back, each a panel
  // PANEL.width wide about the body's middle and PANEL.height tall from
  // PANEL.bottom (metres, the figure's own heights). A decal: x toward the
  // figure's left, y its middle's height, w and h its box.
  const PANEL = { width: 0.36, bottom: 1.08, height: 0.36 };
  const SUIT = {
    panel: PANEL,
    front: {
      crest: { x: 0.072, y: 1.318, w: 0.086, h: 0.086 },
      number: { x: -0.072, y: 1.318, w: 0.08, h: 0.07 },
      name: { x: 0, y: 1.222, w: 0.2, h: 0.036 },
      flag: { x: 0, y: 1.405, w: 0.039, h: 0.026 },
    },
    back: {
      crest: { x: 0, y: 1.398, w: 0.05, h: 0.05 },
      name: { x: 0, y: 1.335, w: 0.24, h: 0.042 },
      number: { x: 0, y: 1.215, w: 0.18, h: 0.14 },
    },
  };
  // The decal sheet, front on its left half and back on its right, per tier.
  const SHEETS = { high: [2048, 1024], medium: [1024, 512], low: [512, 256] };
  const sheetSize = (tier) => SHEETS[tier] || SHEETS.high;
  // Where a point of a side lands on the sheet, 0..1 each way (v up). The
  // front is drawn as it is seen: the figure's left on the viewer's right.
  function sheetUV(side, x, y) {
    const across = side === "front" ? 0.5 + x / PANEL.width : 0.5 - x / PANEL.width;
    return [(side === "front" ? 0 : 0.5) + across / 2, (y - PANEL.bottom) / PANEL.height];
  }

  return { for: crestFor, paths, svg, draw, BANNED, SUIT, sheetSize, sheetUV, FONT };
}));
