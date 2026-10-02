const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Data = require("../game-data.js");

function trackShapes() {
  const src = fs.readFileSync(path.join(__dirname, "..", "tracks-data.js"), "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${src}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, context);
  return context.TRACK_SHAPES;
}

test("20 drivers, two per team, unique numbers and codes", () => {
  assert.equal(Data.DRIVERS.length, 20);
  const codes = Data.DRIVERS.map((d) => d.code);
  codes.forEach((code) => assert.match(code, /^[A-Z]{3}$/));
  assert.equal(new Set(codes).size, 20);
  assert.equal(new Set(Data.DRIVERS.map((d) => d.number)).size, 20);
  Data.TEAMS.forEach((team) => {
    assert.equal(Data.DRIVERS.filter((d) => d.teamId === team.id).length, 2, team.id);
  });
});

test("getTeamForDriver finds the driver's team", () => {
  const norris = Data.DRIVERS.find((d) => d.id === "norris");
  assert.equal(Data.getTeamForDriver(norris).id, "mclaren");
});

// The 2025 calendar, race by race (docs/superpowers/specs/2026-10-01-calendar-design.md).
const CALENDAR_2025 = ["albertpark", "shanghai", "suzuka", "bahrain", "jeddah", "miami", "imola", "monaco",
  "barcelona", "montreal", "redbullring", "silverstone", "spa", "hungaroring", "zandvoort", "monza",
  "baku", "singapore", "cota", "mexico", "interlagos", "lasvegas", "losail", "yasmarina"];
const CALENDAR_CUPS = [
  ["openingCup", "Opening Cup"], ["springCup", "Spring Cup"], ["summerCup", "Summer Cup"],
  ["classicsCup", "Classics Cup"], ["autumnCup", "Autumn Cup"], ["finaleCup", "Finale Cup"],
];
const lapLength = (points) => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length];
  return sum + Math.hypot(b.x - a.x, b.y - a.y);
}, 0);

test("every circuit has a real outline, a country, a real length and its own weather odds", () => {
  const shapes = trackShapes();
  const HEX = /^#[0-9a-f]{6}$/i;
  Data.CIRCUITS.forEach((c) => {
    assert.ok(shapes[c.id], `${c.id} missing from tracks-data.js`);
    assert.ok(c.name.length > 0 && c.country.length > 0 && c.theme.length > 0, c.id);
    assert.ok(c.lengthM > 3000 && c.lengthM < 8000, c.id);
    assert.equal(c.laps, 5);
    assert.equal(c.roadWidth, 33);
    assert.ok(c.rainChance >= 0 && c.rainChance <= 1, `${c.id} rainChance ${c.rainChance}`);
    ["sky", "grass", "accent", "road", "shoulder", "horizonA", "horizonB", "curbA", "curbB", "sun"].forEach((k) => assert.match(c.bg[k], HEX, `${c.id}.bg.${k}`));
    // The outline is the real circuit, at the shared scale (1.3 units a metre),
    // a little shorter where the relaxation opens tight corners out (Monaco's
    // hairpins the most).
    const units = lapLength(shapes[c.id].points);
    assert.ok(Math.abs(units / 1.3 - c.lengthM) / c.lengthM < 0.08, `${c.id}: ${Math.round(units / 1.3)} m against ${c.lengthM}`);
  });
  assert.equal(Data.CIRCUITS.find((c) => c.id === "spa").lengthM, 7004);
  // Rain where it really rains: Spa the wettest, the desert almost never.
  const chance = (id) => (Data.CIRCUITS.find((c) => c.id === id) || {}).rainChance;
  assert.ok(chance("spa") >= Math.max(...Data.CIRCUITS.map((c) => c.rainChance)));
  assert.ok(chance("bahrain") < 0.05);
});

test("all 24 circuits of 2025, in the order of the calendar", () => {
  assert.deepEqual(Data.CIRCUITS.map((c) => c.id), CALENDAR_2025);
});

test("the six calendar cups are the only cups; the season races the whole calendar", () => {
  assert.deepEqual(Data.CUP_DEFS.map((cup) => [cup.id, cup.name]), CALENDAR_CUPS);
  assert.deepEqual(Data.CUP_DEFS.flatMap((cup) => cup.circuitIds), CALENDAR_2025);
  assert.equal(Data.SEASON.id, "season");
  assert.equal(Data.SEASON.name, "2025 Season");
  assert.deepEqual(Data.SEASON.circuitIds, CALENDAR_2025);
  assert.ok(!Data.CUP_DEFS.some((cup) => cup.id === Data.SEASON.id));
});

test("the calendar cups: four races each, in calendar order", () => {
  const built = CALENDAR_CUPS.map(([id]) => Data.CUP_DEFS.find((cup) => cup.id === id));
  built.forEach((cup, i) => {
    assert.ok(cup, CALENDAR_CUPS[i][0]);
    assert.equal(cup.name, CALENDAR_CUPS[i][1]);
    assert.deepEqual(cup.circuitIds, CALENDAR_2025.slice(i * 4, i * 4 + 4), cup.id);
  });
  // Every cup races circuits that exist; every circuit is in a cup.
  const ids = Data.CIRCUITS.map((c) => c.id);
  Data.CUP_DEFS.forEach((cup) => cup.circuitIds.forEach((id) => assert.ok(ids.includes(id), `${cup.id}: ${id}`)));
  ids.forEach((id) => assert.ok(Data.CUP_DEFS.some((cup) => cup.circuitIds.includes(id)), `${id} is in no cup`));
});

const PowerUps = require("../powerups.js");
const ITEM_ICONS = require("../item-icons.js");

test("the roster is exactly the eight items, common to rare, with full card copy", () => {
  assert.deepEqual(Data.POWER_UPS.map((p) => p.id), PowerUps.ITEM_ORDER);
  Data.POWER_UPS.forEach((p) => {
    ["name", "counterpart", "effect", "controls"].forEach((field) => {
      assert.equal(typeof p[field], "string", `${p.id}.${field}`);
      assert.ok(p[field].trim().length > 0, `${p.id}.${field}`);
    });
  });
  const counterparts = Object.fromEntries(Data.POWER_UPS.map((p) => [p.id, p.counterpart]));
  assert.deepEqual(counterparts, {
    oilSlick: "Banana", debris: "Green shell", drs: "Mushroom", undercut: "Red shell",
    overtakeMode: "Star", stewardPenalty: "Blue shell", formationLap: "Bullet Bill", safetyCar: "Lightning",
  });
});

test("the removed power-ups are gone", () => {
  ["graining", "engineBlast", "drsSignPost", "overtake", "powerDeploy"].forEach((id) => {
    assert.equal(Data.POWER_UPS.find((p) => p.id === id), undefined, id);
  });
});

test("every power-up has a painted SVG icon", () => {
  PowerUps.ITEM_ORDER.forEach((id) => {
    // (The style of each icon is tested in item-icons.test.js.)
    assert.match(ITEM_ICONS[id], /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64" height="64" viewBox="0 0 64 64">[\s\S]*<\/svg>$/, id);
  });
});

test("difficulties match the career multipliers", () => {
  assert.deepEqual(Data.DIFFICULTIES.map((d) => d.id), ["rookie", "pro", "legend"]);
});

test("card copy matches the game: debris bounces off the track edges, not barriers", () => {
  const debris = Data.POWER_UPS.find((p) => p.id === "debris");
  assert.doesNotMatch(debris.effect, /barrier/i);
  assert.match(debris.effect, /edges of the track/);
});

test("promo shots feature the whole grid: Leclerc first, Hamilton second, six teams or more", () => {
  const { SHOT_DRIVERS, DRIVERS, CIRCUITS, POWER_UPS } = Data;
  const teamOf = (id) => DRIVERS.find((d) => d.id === id).teamId;
  const itemOrder = POWER_UPS.map((p) => p.id);
  const items = itemOrder.map((id) => SHOT_DRIVERS.items[id]);
  const circuits = CIRCUITS.map((c) => SHOT_DRIVERS.circuits[c.id]);
  for (const set of [items, circuits]) {
    set.forEach((id) => assert.ok(DRIVERS.some((d) => d.id === id), `${id} is a driver`));
    assert.equal(set[0], "leclerc");
    assert.equal(set[1], "hamilton");
    assert.ok(new Set(set.map(teamOf)).size >= 6, "six teams or more");
  }
  assert.equal(new Set(items).size, items.length, "no driver twice in the items");
  // 24 circuits and 20 drivers: nobody more than twice.
  circuits.forEach((id) => assert.ok(circuits.filter((x) => x === id).length <= 2, `${id} in more than two circuit shots`));
  assert.equal(SHOT_DRIVERS.hero, "leclerc");
});

test("every team has a short name for captions", () => {
  const want = { redBull: "Red Bull", ferrari: "Ferrari", mclaren: "McLaren", mercedes: "Mercedes", astonMartin: "Aston Martin",
    alpine: "Alpine", williams: "Williams", haas: "Haas", racingBulls: "Racing Bulls", sauber: "Sauber" };
  Data.TEAMS.forEach((t) => assert.equal(t.short, want[t.id], t.id));
});

test("every driver has a helmet design: valid colours, a known motif, no two alike", () => {
  const HEX = /^#[0-9a-f]{6}$/i;
  const MOTIFS = ["band", "crown", "split", "flash", "tricolore"];
  const seen = new Set();
  Data.DRIVERS.forEach((d) => {
    const h = d.helmet;
    assert.ok(h, `${d.id} has a helmet`);
    ["base", "crown", "stripe", "visor"].forEach((k) => assert.match(h[k], HEX, `${d.id}.${k}`));
    assert.ok(MOTIFS.includes(h.motif), `${d.id} motif ${h.motif}`);
    seen.add(d.id);
  });
  // Told apart on track: no two drivers close in both base and crown colour.
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  Data.DRIVERS.forEach((a, i) => Data.DRIVERS.slice(i + 1).forEach((b) => {
    const apart = dist(a.helmet.base, b.helmet.base) + dist(a.helmet.crown, b.helmet.crown);
    assert.ok(apart > 120, `${a.id} and ${b.id} helmets are too alike (${Math.round(apart)})`);
  }));
  // The two favourites are told apart at a glance.
  const lec = Data.DRIVERS.find((d) => d.id === "leclerc").helmet;
  const ham = Data.DRIVERS.find((d) => d.id === "hamilton").helmet;
  assert.notEqual(lec.base, ham.base);
});

test("no title sponsors in team names or descriptions", () => {
  const SPONSORS = /moneygram|visa|cash app|stake|kick|bwt|aramco|oracle|petronas|mastercard|hp\b|atlassian|red bull racing honda/i;
  Data.TEAMS.forEach((t) => {
    assert.doesNotMatch(t.name, SPONSORS, t.id);
    assert.doesNotMatch(t.style, SPONSORS, t.id);
  });
});
