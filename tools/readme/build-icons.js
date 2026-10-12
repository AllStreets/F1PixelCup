// The README's icons (docs/readme/icons/*.svg), in the game's own icon style
// (item-icons.js): a top-lit dark tile with an accent bar and a flat glyph in
// white plus one colour, on a 4 px grid of a 64x64 box. GitHub strips inline
// SVG and CSS from a README, so each icon is a file with its colours inside.
// The eight power-ups are the game's own icons, written out as they are; the
// rest are drawn here, each in the colour of what it stands for. The dark tile
// carries its own ground, so every icon reads on GitHub's light and dark themes.
//
//   node tools/readme/build-icons.js        (tests/readme.test.js checks the files are current)
const fs = require("node:fs");
const path = require("node:path");
const ITEM_ICONS = require("../../item-icons.js");

const WHITE = "#f5f7fb";
const INK = "#0c0e13";
const GREY = "#8a94a6";

// The tile of item-icons.js, its edge a little stronger so it shows on a dark
// page. `bar` is the accent bar's colour, or two colours for a split bar.
const tile = (id, bar, glyph) => {
  const bars = Array.isArray(bar)
    ? `<rect x="14" y="55" width="17" height="4" rx="2" fill="${bar[0]}"/><rect x="33" y="55" width="17" height="4" rx="2" fill="${bar[1]}"/>`
    : `<rect x="14" y="55" width="36" height="4" rx="2" fill="${bar}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`
    + `<defs><linearGradient id="tile-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d212b"/><stop offset="1" stop-color="#0c0e13"/></linearGradient></defs>`
    + `<rect width="64" height="64" rx="14" fill="url(#tile-${id})"/>`
    + `<rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#ffffff" stroke-opacity=".22"/>`
    + bars + glyph + `</svg>\n`;
};
const stroke = (colour, width, d, dashes = "") => `<path fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="${dashes ? "butt" : "round"}" stroke-linejoin="round"${dashes ? ` stroke-dasharray="${dashes}"` : ""} d="${d}"/>`;

const RED = "#e8002d";
const GOLD = "#ffc22e";
const BLUE = "#2f9bff";
const P1 = "#75d5ff";
const P2 = "#ff7ac6";
const LAP = "M18 42c-7-6-6-18 3-22s14 5 22 2 11 6 6 13-10 4-15 8-10 4-16-1z";

const DRAWN = {
  // A lap of asphalt with a red and white kerb and the start line.
  circuits: [RED, stroke(GREY, 7, LAP)
    + stroke(WHITE, 3, "M17 38c-4-6-3-13 4-17")
    + stroke(RED, 3, "M17 38c-4-6-3-13 4-17", "4 4")
    + `<rect x="34" y="17" width="3" height="9" rx="1" fill="${WHITE}"/>`],
  // A helmet in racing red, visor down.
  grid: [RED, `<path fill="${RED}" d="M10 38c0-13 10-23 23-23 12 0 21 8 21 19v7a4 4 0 0 1-4 4H22c-7 0-12-2-12-7z"/>`
    + `<path fill="${WHITE}" d="M30 27h24v8H36c-4 0-6-3-6-8z"/>`
    + `<rect x="14" y="40" width="20" height="2.5" rx="1.25" fill="${INK}" fill-opacity=".35"/>`],
  // The cup, in gold on its plinth.
  cups: [GOLD, stroke(GOLD, 3.5, "M22 15h-6v3a8 8 0 0 0 8 8M42 15h6v3a8 8 0 0 1-8 8")
    + `<path fill="${GOLD}" d="M21 11h22v11a11 11 0 0 1-22 0z"/>`
    + `<rect x="30" y="32" width="4" height="8" fill="${WHITE}"/>`
    + `<rect x="23" y="39" width="18" height="5" rx="2" fill="${WHITE}"/>`
    + `<rect x="19" y="45" width="26" height="5" rx="2" fill="${WHITE}" fill-opacity=".6"/>`],
  // A die: the draw of a random cup.
  choices: ["#00d2be", `<rect x="14" y="11" width="36" height="36" rx="8" fill="#00d2be"/>`
    + [[24, 21], [40, 21], [32, 29], [24, 37], [40, 37]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${WHITE}"/>`).join("")],
  // A cloud and its rain.
  weather: [BLUE, `<path fill="${WHITE}" d="M20 36a9 9 0 0 1 .8-18 12.5 12.5 0 0 1 24 2.4A8 8 0 0 1 44 36z"/>`
    + stroke(BLUE, 4, "M24 41l-3 8M34 41l-3 8M44 41l-3 8")],
  // An item box.
  powerups: [RED, `<rect x="14" y="11" width="36" height="36" rx="7" fill="${RED}"/>`
    + `<rect x="17" y="14" width="30" height="30" rx="5" fill="none" stroke="${WHITE}" stroke-opacity=".35" stroke-width="2"/>`
    + stroke(WHITE, 5, "M26 24a6.2 6.2 0 1 1 9.4 5.3c-2.2 1.4-3.4 2.6-3.4 4.7")
    + `<circle cx="32" cy="40" r="2.8" fill="${WHITE}"/>`],
  // A TV camera, recording.
  replays: ["#ff3b30", `<circle cx="19" cy="18" r="5.5" fill="${WHITE}"/><circle cx="32" cy="18" r="5.5" fill="${WHITE}"/>`
    + `<rect x="9" y="24" width="32" height="22" rx="4" fill="${WHITE}"/>`
    + `<path fill="${WHITE}" fill-opacity=".7" d="M41 32l14-7v20l-14-7z"/>`
    + `<circle cx="25" cy="35" r="5.5" fill="#ff3b30"/>`],
  // The three steps, the winner's in gold.
  podium: [GOLD, `<rect x="8" y="33" width="16" height="17" rx="1.5" fill="${WHITE}"/>`
    + `<rect x="40" y="39" width="16" height="11" rx="1.5" fill="${WHITE}" fill-opacity=".7"/>`
    + `<rect x="24" y="23" width="16" height="27" rx="1.5" fill="${GOLD}"/>`
    + `<path fill="${INK}" d="M29.5 31l3.2-3H34.5v14h-3.4V32.6l-1.6 1.3z"/>`
    + `<path fill="${GOLD}" d="M32 9l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z"/>`],
  // Two gamepads: P1's blue and P2's pink, as the game tags them.
  players: [[P1, P2], [[8, 13, P1], [26, 31, P2]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="30" height="18" rx="9" fill="${c}"/>`
    + `<rect x="${x + 6}" y="${y + 7.5}" width="8" height="3" rx="1" fill="${INK}"/><rect x="${x + 8.5}" y="${y + 5}" width="3" height="8" rx="1" fill="${INK}"/>`
    + `<circle cx="${x + 20}" cy="${y + 11}" r="2" fill="${INK}"/><circle cx="${x + 24.5}" cy="${y + 7}" r="2" fill="${INK}"/>`).join("")],
  // The chequered flag.
  trackside: [GREY, `<rect x="12" y="10" width="3.5" height="42" rx="1.75" fill="${WHITE}"/>`
    + `<rect x="15.5" y="12" width="36" height="27" rx="2" fill="${WHITE}"/>`
    + [0, 1, 2].flatMap((r) => [0, 1, 2, 3].filter((c) => (r + c) % 2 === 0).map((c) => `<rect x="${15.5 + c * 9}" y="${12 + r * 9}" width="9" height="9" fill="${GREY}"/>`)).join("")],
  // Bars climbing, and the line through them.
  career: ["#00d46a", `<rect x="11" y="40" width="9" height="10" rx="1.5" fill="${WHITE}" fill-opacity=".5"/>`
    + `<rect x="24" y="33" width="9" height="17" rx="1.5" fill="${WHITE}" fill-opacity=".75"/>`
    + `<rect x="37" y="26" width="9" height="24" rx="1.5" fill="${WHITE}"/>`
    + stroke("#00d46a", 4, "M11 30l12-9 9 5 18-14M41 12h9v9")],
  // A speaker and its sound.
  sound: ["#ff8a00", `<path fill="${WHITE}" d="M9 25h9l11-9v30l-11-9H9z"/>`
    + stroke("#ff8a00", 4, "M36 24a10 10 0 0 1 0 14M43 17a20 20 0 0 1 0 28")],
  // The moon over a night race.
  night: ["#8f96ff", `<path fill="#8f96ff" d="M38 11a20 20 0 1 0 15 31 17 17 0 0 1-15-31z"/>`
    + `<circle cx="47" cy="17" r="2.2" fill="${WHITE}"/><circle cx="53" cy="29" r="1.6" fill="${WHITE}" fill-opacity=".8"/><circle cx="42" cy="26" r="1.3" fill="${WHITE}" fill-opacity=".6"/>`],
  // A clock turned back: the historic circuits.
  historic: ["#d09a5c", `<circle cx="32" cy="31" r="17" fill="none" stroke="#d09a5c" stroke-width="5"/>`
    + stroke(WHITE, 4, "M32 20v11l-8 5")],
  // The keys: W A S D lit in P1's blue.
  keyboard: [P1, `<rect x="7" y="16" width="50" height="32" rx="6" fill="${WHITE}"/>`
    + [0, 1, 2, 3, 4].map((c) => `<rect x="${12 + c * 8.4}" y="21" width="6" height="6" rx="1.5" fill="${c === 1 ? "#1f9fe0" : INK}" fill-opacity="${c === 1 ? 1 : 0.8}"/>`).join("")
    + [0, 1, 2, 3, 4].map((c) => `<rect x="${12 + c * 8.4}" y="29.5" width="6" height="6" rx="1.5" fill="${c < 3 ? "#1f9fe0" : INK}" fill-opacity="${c < 3 ? 1 : 0.8}"/>`).join("")
    + `<rect x="20" y="38.5" width="24" height="5" rx="1.5" fill="${INK}" fill-opacity=".8"/>`],
  // A gamepad.
  gamepad: ["#9b7bff", `<path fill="${WHITE}" d="M19 19h26a12 12 0 0 1 12 12v8a8 8 0 0 1-14.6 4.5L40 40H24l-2.4 3.5A8 8 0 0 1 7 39v-8a12 12 0 0 1 12-12z"/>`
    + `<rect x="15" y="28.5" width="11" height="3.6" rx="1" fill="${INK}"/><rect x="18.7" y="24.8" width="3.6" height="11" rx="1" fill="${INK}"/>`
    + `<circle cx="42" cy="26.5" r="2.6" fill="#9b7bff"/><circle cx="47" cy="31" r="2.6" fill="#9b7bff"/><circle cx="37" cy="31" r="2.6" fill="#9b7bff"/><circle cx="42" cy="35.5" r="2.6" fill="#9b7bff"/>`],
};

// The power-ups' own icons, with the stronger edge.
const item = (svg) => `${svg.replace('stroke-opacity=".09"', 'stroke-opacity=".22"')}\n`;

function icons() {
  const out = {};
  Object.entries(DRAWN).forEach(([id, [bar, glyph]]) => { out[id] = tile(id, bar, glyph); });
  Object.keys(ITEM_ICONS).forEach((id) => { out[`item-${id}`] = item(ITEM_ICONS[id]); });
  return out;
}

if (require.main === module) {
  const dir = path.join(__dirname, "..", "..", "docs", "readme", "icons");
  fs.mkdirSync(dir, { recursive: true });
  Object.entries(icons()).forEach(([id, svg]) => fs.writeFileSync(path.join(dir, `${id}.svg`), svg));
  console.log(`${Object.keys(icons()).length} icons written to docs/readme/icons/`);
}

module.exports = { icons };
