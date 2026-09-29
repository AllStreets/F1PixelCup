const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ICONS = require("../item-icons.js");

// The item ids, from the game's own data.
const sandbox = {};
vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, "..", "game-data.js"), "utf8")}\nthis.POWER_UPS = POWER_UPS;`, sandbox);
const IDS = sandbox.POWER_UPS.map((p) => p.id);

// The accents from the style guide (docs/superpowers/specs/2026-09-29-power-ups-beauty-design.md).
const ACCENTS = {
  drs: "#00d46a", overtakeMode: "#ffd400", oilSlick: "#9b7bff", debris: "#8a94a6",
  undercut: "#e8002d", stewardPenalty: "#2f7bff", formationLap: "#ff8a00", safetyCar: "#ffb000",
};

test("every power-up has an icon, and nothing else does", () => {
  assert.deepEqual(Object.keys(ICONS).filter((k) => k !== "ACCENTS").sort(), [...IDS].sort());
});

for (const id of Object.keys(ACCENTS)) {
  test(`${id}: one SVG on the 64 grid, in the shared style`, () => {
    const svg = ICONS[id];
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">[\s\S]*<\/svg>$/);
    assert.equal((svg.match(/<svg/g) || []).length, 1);
    // Balanced tags: every opened element is closed or self-closed.
    const opened = (svg.match(/<(?!\/)[a-zA-Z]+[^>]*[^/]>/g) || []).length;
    const closed = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
    assert.equal(opened, closed);
    // Letters are drawn, never typed.
    assert.doesNotMatch(svg, /<text|font-family/);
    // The shared tile, its gradient id unique to this icon.
    assert.match(svg, new RegExp(`<linearGradient id="tile-${id}"`));
    assert.match(svg, new RegExp(`fill="url\\(#tile-${id}\\)"`));
    assert.match(svg, /stop-color="#1d212b"[\s\S]*stop-color="#0c0e13"/);
    // The accent bar and the glyph use the item's accent.
    assert.match(svg, new RegExp(`<rect x="14" y="55" width="36" height="4" rx="2" fill="${ACCENTS[id]}"/>`));
    assert.ok(svg.split(ACCENTS[id]).length - 1 >= 2, "the glyph uses the accent too");
    // No glow, blur or drop shadow in a glyph.
    assert.doesNotMatch(svg, /filter|feGaussianBlur|drop-shadow/);
  });
}

test("the accents are published for the HUD and site", () => {
  assert.deepEqual(ICONS.ACCENTS, ACCENTS);
});
