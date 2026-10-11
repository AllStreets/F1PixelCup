// The marks on the race suits and where they sit
// (docs/superpowers/specs/2026-10-12-race-suits-design.md).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DRIVERS, TEAMS } = require("../game-data.js");
const Suits = require("../suits.js");

test("suits: every driver's own marks: number, code, surname, country", () => {
  DRIVERS.forEach((d) => {
    const m = Suits.marks(d);
    assert.equal(m.number, String(d.number));
    assert.equal(m.code, d.code);
    assert.match(m.code, /^[A-Z]{3}$/);
    assert.equal(m.country, d.country);
    assert.ok(!m.surname.includes(" ") && m.surname.length >= 4, `${d.name}: ${m.surname}`);
  });
  // Spelt out (the same in every reader's locale: a Turkish one would dot the I).
  const surname = (id) => Suits.marks(DRIVERS.find((d) => d.id === id)).surname;
  assert.deepEqual(["hamilton", "leclerc", "hulkenberg", "piastri", "antonelli"].map(surname), ["HAMILTON", "LECLERC", "HÜLKENBERG", "PIASTRI", "ANTONELLI"]);
  // A flag the game can draw for every country raced under.
  const flags = fs.readFileSync(path.join(__dirname, "..", "r3d", "flags.js"), "utf8");
  new Set(DRIVERS.map((d) => d.country)).forEach((c) => assert.ok(flags.includes(`"${c}"`) || new RegExp(`\\b${c}:`).test(flags), `a flag for ${c}`));
});

test("suits: no team marks: nothing on the suit names or pictures a team", () => {
  const all = Object.keys(Suits.LAYOUT.front).concat(Object.keys(Suits.LAYOUT.back));
  assert.deepEqual([...new Set(all)].sort(), ["code", "flag", "number", "surname"]);
  DRIVERS.forEach((d) => {
    const text = Object.values(Suits.marks(d)).join(" ").toLowerCase();
    TEAMS.forEach((t) => assert.ok(!text.includes(t.short.toLowerCase()), `${d.id}'s suit says ${t.short}`));
  });
});

test("suits: the marks sit on the chest, the belt and the back, each in its place", () => {
  const L = Suits.LAYOUT;
  const P = L.panel;
  const inside = (d) => d.x - d.w / 2 >= -P.width / 2 && d.x + d.w / 2 <= P.width / 2 && d.y - d.h / 2 >= P.bottom && d.y + d.h / 2 <= P.bottom + P.height;
  [...Object.values(L.front), ...Object.values(L.back)].forEach((d) => assert.ok(inside(d), JSON.stringify(d)));
  // x is toward the figure's left: the number on the left chest (the heart
  // side), large enough to read from the podium's cameras.
  assert.ok(L.front.number.x > 0.04 && L.front.number.h >= 0.07);
  // The flag under the collar, in the middle; the code on the belt
  // (0.985 to 1.03 m, build_driver.py).
  assert.ok(Math.abs(L.front.flag.x) < 0.001 && L.front.flag.y > 1.38);
  assert.ok(L.front.code.y - L.front.code.h / 2 >= 0.985 && L.front.code.y + L.front.code.h / 2 <= 1.03);
  // The back: the surname across the shoulders over a larger number.
  assert.ok(L.back.surname.y > L.back.number.y && L.back.number.h > L.front.number.h * 1.5);
  // Everything else between the belt and the collar's yoke (1.44 m), and
  // within the torso's width (the marks fade out 17 cm from the middle).
  [L.front.number, L.front.flag, L.back.surname, L.back.number].forEach((d) => {
    assert.ok(d.y - d.h / 2 > 1.05 && d.y + d.h / 2 < 1.44, JSON.stringify(d));
  });
  [...Object.values(L.front), ...Object.values(L.back)].forEach((d) => assert.ok(Math.abs(d.x) + d.w / 2 <= L.reach, JSON.stringify(d)));
  // No mark touches a seam: the one down each side of the chest and back,
  // or the yoke seam across its own side.
  const S = Suits.SEAMS;
  [...Object.values(L.front), ...Object.values(L.back)].forEach((d) => {
    const left = Math.abs(d.x) - d.w / 2, right = Math.abs(d.x) + d.w / 2;
    assert.ok(right < S.panel - 0.004 || left > S.panel + 0.004, `${JSON.stringify(d)} on the panel seam`);
  });
  [[L.front, S.yokeFront], [L.back, S.yokeBack]].forEach(([side, y]) => Object.values(side).forEach((d) => {
    assert.ok(Math.abs(d.y - y) > d.h / 2 + 0.004, `${JSON.stringify(d)} on the yoke seam`);
  }));
  // None over another.
  const clear = (a, b) => Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
  [L.front, L.back].forEach((side) => {
    const ds = Object.values(side);
    ds.forEach((a, i) => ds.slice(i + 1).forEach((b) => assert.ok(clear(a, b), `${JSON.stringify(a)} over ${JSON.stringify(b)}`)));
  });
});

test("suits: the sheet: front on its left half as it is seen, back on its right, smaller on lower tiers", () => {
  assert.deepEqual([Suits.sheetSize("high"), Suits.sheetSize("medium"), Suits.sheetSize("low")], [[2048, 1024], [1024, 512], [512, 256]]);
  const L = Suits.LAYOUT;
  // The figure's left chest is to the viewer's right of the front's middle.
  const n = Suits.sheetUV("front", L.front.number.x, L.front.number.y);
  assert.ok(n[0] > 0.25 && n[0] < 0.5 && n[1] > 0.5 && n[1] < 1, String(n));
  assert.deepEqual(Suits.sheetUV("front", 0, L.panel.bottom), [0.25, 0]);
  assert.equal(Suits.sheetUV("back", 0, L.back.number.y)[0], 0.75);
  // Seen from behind, the figure's left is on the viewer's left.
  assert.ok(Suits.sheetUV("back", 0.1, 1.2)[0] < 0.75);
  // A mark's box in the sheet's pixels (y down).
  const box = Suits.sheetBox("back", L.back.number, [2048, 1024]);
  assert.ok(box.x >= 1024 && box.x + box.w <= 2048 && box.y >= 0 && box.y + box.h <= 1024);
  assert.equal(Math.round(box.w), Math.round(L.back.number.w / L.panel.width * 1024));
  // The panel is no wider than the marks may reach: none of the sheet is
  // spent on the sides of the torso, where nothing is ever drawn.
  assert.ok(Math.abs(L.panel.width / 2 - (L.reach + 0.02)) < 1e-9);
});

test("suits: the ink reads on every team's suit and belt", () => {
  assert.equal(Suits.ink("#ffffff"), "#14161a");
  assert.equal(Suits.ink("#17191c"), "#ffffff");
  assert.equal(Suits.ink("#d40000"), "#ffffff");
  assert.equal(Suits.ink("#ffe000"), "#14161a");
  assert.ok(Math.abs(Suits.contrast("#ffffff", "#000000") - 21) < 1e-9);
  // Every colour a suit or its trim (the belt) may be: the cars' liveries
  // (r3d/car.js), the suits that differ from them (r3d/driver.js), and the
  // teams' own colours where there is no livery.
  const hexes = (file, from, to) => {
    const src = fs.readFileSync(path.join(__dirname, "..", "r3d", file), "utf8");
    const part = src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
    return [...part.matchAll(/(?:base|trim|suit): "(#[0-9a-f]{6})"/gi)].map((m) => m[1]);
  };
  const colours = [...hexes("car.js", "const LIVERIES", "\n};"), ...hexes("driver.js", "const SUITS", "\n};"), ...TEAMS.flatMap((t) => [t.body, t.trim])];
  assert.ok(colours.length >= 30, `${colours.length} colours`);
  colours.forEach((c) => {
    const k = Suits.contrast(Suits.ink(c), c);
    assert.ok(k >= 4.5, `ink on ${c}: ${k.toFixed(1)} to 1`);
    // And it is the better of the two inks.
    assert.ok(k >= Math.max(Suits.contrast("#ffffff", c), Suits.contrast("#14161a", c)) - 1e-9);
  });
});
