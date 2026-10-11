// The teams' original crests and where they sit on the suit
// (docs/superpowers/specs/2026-10-12-team-crests-design.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const { TEAMS } = require("../game-data.js");
const Crests = require("../crests.js");

test("crests: every team has its own, in its own colours", () => {
  assert.equal(TEAMS.length, 10);
  TEAMS.forEach((team) => {
    const c = Crests.for(team);
    assert.ok(c, `${team.id} has a crest`);
    assert.match(c.code, /^[A-Z]{3}$/, `${team.id}'s code`);
    [c.field, c.ink, c.accent, c.edge].forEach((col) => assert.match(col, /^#[0-9a-f]{6}$/i));
    // The team's own two colours carry the crest.
    const own = [team.body.toLowerCase(), team.trim.toLowerCase()];
    assert.ok([c.field, c.accent, c.edge, c.ink].filter((col) => own.includes(col.toLowerCase())).length >= 2, `${team.id}'s crest wears its colours`);
  });
  assert.equal(Crests.for({ id: "nobody" }), null);
});

test("crests: no two alike: silhouette, motif and code all differ", () => {
  const all = TEAMS.map((t) => Crests.for(t));
  ["shape", "motif", "code"].forEach((k) => assert.equal(new Set(all.map((c) => c[k])).size, 10, `${k}s differ`));
  // And the outlines themselves differ, not only their names.
  assert.equal(new Set(all.map((c) => Crests.paths(c)[0].d)).size, 10);
});

test("crests: drawn as SVG from the same paths the suit's canvas paints", () => {
  TEAMS.forEach((team) => {
    const svg = Crests.svg(team, 64);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 100 100"[^>]*width="64"/);
    assert.ok(svg.endsWith("</svg>"));
    const c = Crests.for(team);
    assert.ok(svg.includes(`>${c.code}</text>`), "the code is its only text");
    assert.equal((svg.match(/<text/g) || []).length, 1);
    Crests.paths(c).forEach((p) => {
      assert.ok(svg.includes(`d="${p.d}"`), "every path is in the SVG");
      // Inside the 100 by 100 box.
      (p.d.match(/-?\d+(\.\d+)?/g) || []).map(Number).forEach((n) => assert.ok(n >= 0 && n <= 100, `${team.id}: ${n} in ${p.d}`));
    });
    assert.ok(team.name && svg.includes(`<title>${team.name} crest</title>`), "named for screen readers");
  });
});

test("crests: nothing real: no sponsor or brand name in any crest's text", () => {
  assert.ok(Crests.BANNED.length >= 20);
  TEAMS.forEach((team) => {
    const text = Crests.svg(team, 64).replace(/<title>.*?<\/title>/, "").replace(/<[^>]+>/g, " ").toLowerCase();
    Crests.BANNED.forEach((name) => assert.ok(!text.includes(name.toLowerCase()), `${team.id}'s crest says ${name}`));
    // The motifs are abstract: none is named for a real emblem.
    assert.doesNotMatch(Crests.for(team).motif, /horse|bull|star3|wings|swoosh|arrow-a/);
  });
});

test("crests: the decals sit on the chest and the back, each in its place", () => {
  const L = Crests.SUIT;
  const inside = (panel, d) => d.x - d.w / 2 >= -panel.width / 2 && d.x + d.w / 2 <= panel.width / 2 && d.y - d.h / 2 >= panel.bottom && d.y + d.h / 2 <= panel.bottom + panel.height;
  Object.values(L.front).forEach((d) => assert.ok(inside(L.panel, d), `front decal ${JSON.stringify(d)}`));
  Object.values(L.back).forEach((d) => assert.ok(inside(L.panel, d), `back decal ${JSON.stringify(d)}`));
  // x is toward the figure's left: the crest on the left chest (the heart
  // side), the number on the right, the name across the middle below them.
  assert.ok(L.front.crest.x > 0.04 && L.front.number.x < -0.04);
  assert.ok(L.front.crest.w >= 0.075, "the crest is large enough to read from the podium's cameras");
  assert.ok(Math.abs(L.front.name.x) < 0.001 && L.front.name.y + L.front.name.h / 2 < L.front.crest.y - L.front.crest.h / 2);
  // On the chest: between the belt (1.03 m) and the collar's yoke (1.44 m).
  [...Object.values(L.front), ...Object.values(L.back)].forEach((d) => assert.ok(d.y - d.h / 2 > 1.05 && d.y + d.h / 2 < 1.44));
  // None overlaps another on its side.
  const clear = (a, b) => Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
  [L.front, L.back].forEach((side) => {
    const ds = Object.values(side);
    ds.forEach((a, i) => ds.slice(i + 1).forEach((b) => assert.ok(clear(a, b), `${JSON.stringify(a)} over ${JSON.stringify(b)}`)));
  });
  // The sheet per tier: smaller on the lower tiers.
  assert.deepEqual([Crests.sheetSize("high"), Crests.sheetSize("medium"), Crests.sheetSize("low")], [[2048, 1024], [1024, 512], [512, 256]]);
  // Where a point of the torso lands on the sheet: the front's left chest
  // is on the sheet's left half, to the viewer's right of its middle.
  const uv = Crests.sheetUV("front", L.front.crest.x, L.front.crest.y);
  assert.ok(uv[0] > 0.25 && uv[0] < 0.5 && uv[1] > 0 && uv[1] < 1);
  const uvBack = Crests.sheetUV("back", 0, L.back.number.y);
  assert.equal(uvBack[0], 0.75);
});
