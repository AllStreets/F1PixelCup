// National flags, drawn on a 2D canvas for the podium's banners
// (r3d/podium.js): each driver's racing nationality (game-data.js: country).
// Plain geometry in each flag's own colours; arms and fine emblems are left
// off at this size (Spain's arms, Brazil's stars and motto).

// (0.382: the inner radius of a regular five-pointed star; seven-pointed
// stars, the Commonwealth Star's kind, are given theirs.)
const star = (g, cx, cy, r, points, inner = 0.382) => {
  g.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const d = i % 2 ? r * inner : r;
    g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  g.closePath();
  g.fill();
};

const bands = (g, w, h, colours, vertical = false, weights = null) => {
  const ws = weights || colours.map(() => 1);
  const total = ws.reduce((a, b) => a + b, 0);
  let at = 0;
  colours.forEach((c, i) => {
    const size = ws[i] / total;
    g.fillStyle = c;
    if (vertical) g.fillRect(at * w, 0, Math.ceil(size * w), h);
    else g.fillRect(0, at * h, w, Math.ceil(size * h));
    at += size;
  });
};

// The Union Flag in a w by h box at the origin: St Andrew's white saltire,
// St Patrick's red one counterchanged on it (in each arm the red lies to
// one side of the centre line, the same way round the flag), then St
// George's cross in its white border.
function unionFlag(g, w, h, red = "#c8102e") {
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.fillStyle = "#012169";
  g.fillRect(0, 0, w, h);
  const len = Math.hypot(w, h);
  // Unit vector along the falling diagonal and its normal.
  const d = [w / len, h / len];
  g.strokeStyle = "#ffffff";
  g.lineWidth = h * 0.2;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(w, h);
  g.moveTo(w, 0); g.lineTo(0, h);
  g.stroke();
  // Each arm from the centre outwards, a red strip a third of the white
  // wide, shifted towards its anticlockwise edge.
  const arm = (dx, dy) => {
    const nx = dy;
    const ny = -dx;
    const off = h * 0.0333;
    const half = h * 0.0333;
    g.beginPath();
    g.moveTo(w / 2 + nx * (off - half), h / 2 + ny * (off - half));
    g.lineTo(w / 2 + nx * (off + half), h / 2 + ny * (off + half));
    g.lineTo(w / 2 + nx * (off + half) + dx * len, h / 2 + ny * (off + half) + dy * len);
    g.lineTo(w / 2 + nx * (off - half) + dx * len, h / 2 + ny * (off - half) + dy * len);
    g.closePath();
    g.fill();
  };
  g.fillStyle = red;
  arm(-d[0], -d[1]);
  arm(d[0], -d[1]);
  arm(d[0], d[1]);
  arm(-d[0], d[1]);
  g.fillStyle = "#ffffff";
  g.fillRect(w / 2 - h * 0.1667, 0, h * 0.3333, h);
  g.fillRect(0, h / 2 - h * 0.1667, w, h * 0.3333);
  g.fillStyle = red;
  g.fillRect(w / 2 - h * 0.1, 0, h * 0.2, h);
  g.fillRect(0, h / 2 - h * 0.1, w, h * 0.2);
  g.restore();
}

const FLAGS = {
  Netherlands: (g, w, h) => bands(g, w, h, ["#ae1c28", "#ffffff", "#21468b"]),
  France: (g, w, h) => bands(g, w, h, ["#0055a4", "#ffffff", "#ef4135"], true),
  Italy: (g, w, h) => bands(g, w, h, ["#009246", "#ffffff", "#ce2b37"], true),
  Germany: (g, w, h) => bands(g, w, h, ["#000000", "#dd0000", "#ffce00"]),
  Monaco: (g, w, h) => bands(g, w, h, ["#ce1126", "#ffffff"]),
  Thailand: (g, w, h) => bands(g, w, h, ["#a51931", "#f4f5f8", "#2d2a4a", "#f4f5f8", "#a51931"], false, [1, 1, 2, 1, 1]),
  Spain: (g, w, h) => bands(g, w, h, ["#aa151b", "#f1bf00", "#aa151b"], false, [1, 2, 1]),
  Japan: (g, w, h) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#bc002d";
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
    g.fill();
  },
  Canada: (g, w, h) => {
    bands(g, w, h, ["#d80621", "#ffffff", "#d80621"], true, [1, 2, 1]);
    // The maple leaf, as eleven points on a stem.
    const leaf = [[0, -0.42], [0.07, -0.27], [0.16, -0.31], [0.12, -0.08], [0.26, -0.18], [0.29, -0.09], [0.4, -0.07], [0.33, 0.06], [0.38, 0.1], [0.17, 0.25], [0.2, 0.32], [0.02, 0.29], [0.02, 0.44]];
    g.fillStyle = "#d80621";
    g.beginPath();
    // (Sized to sit inside the white: the box is 3:2, the flag itself 2:1.)
    const k = 0.8;
    leaf.forEach(([x, y]) => g.lineTo(w / 2 + x * h * k, h / 2 + y * h * k));
    [...leaf].reverse().forEach(([x, y]) => g.lineTo(w / 2 - x * h * k, h / 2 + y * h * k));
    g.closePath();
    g.fill();
  },
  "United Kingdom": (g, w, h) => unionFlag(g, w, h),
  Australia: (g, w, h) => {
    g.fillStyle = "#012169";
    g.fillRect(0, 0, w, h);
    unionFlag(g, w / 2, h / 2, "#e4002b");
    g.fillStyle = "#ffffff";
    star(g, w * 0.25, h * 0.75, h * 0.15, 7, 0.444);
    [[0.75, 0.83, 0.07], [0.75, 0.17, 0.07], [0.62, 0.45, 0.07], [0.87, 0.37, 0.07]].forEach(([x, y, r]) => star(g, w * x, h * y, h * r, 7, 0.444));
    star(g, w * 0.8, h * 0.55, h * 0.04, 5);
  },
  "New Zealand": (g, w, h) => {
    g.fillStyle = "#012169";
    g.fillRect(0, 0, w, h);
    unionFlag(g, w / 2, h / 2);
    // The Southern Cross: four red stars edged in white, the lowest the largest.
    [[0.75, 0.2, 0.055], [0.66, 0.44, 0.055], [0.84, 0.4, 0.048], [0.75, 0.78, 0.062]].forEach(([x, y, r]) => {
      g.fillStyle = "#ffffff";
      star(g, w * x, h * y, h * r * 1.3, 5);
      g.fillStyle = "#c8102e";
      star(g, w * x, h * y, h * r, 5);
    });
  },
  Brazil: (g, w, h) => {
    g.fillStyle = "#009c3b";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffdf00";
    g.beginPath();
    g.moveTo(w * 0.08, h / 2); g.lineTo(w / 2, h * 0.1); g.lineTo(w * 0.92, h / 2); g.lineTo(w / 2, h * 0.9);
    g.closePath();
    g.fill();
    g.fillStyle = "#002776";
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.25, 0, Math.PI * 2);
    g.fill();
  },
};

export const hasFlag = (country) => Boolean(FLAGS[country]);

// The flag in the box (x, y, w, h); false (and nothing drawn) for a country
// without one here.
export function drawFlag(g, country, x, y, w, h) {
  const paint = FLAGS[country];
  if (!paint) return false;
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  paint(g, w, h);
  g.restore();
  g.save();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 2;
  g.strokeRect(x, y, w, h);
  g.restore();
  return true;
}
