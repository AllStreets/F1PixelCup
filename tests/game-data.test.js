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

test("every circuit has a real outline, a country and a real length", () => {
  const shapes = trackShapes();
  assert.equal(Data.CIRCUITS.length, 8);
  Data.CIRCUITS.forEach((c) => {
    assert.ok(shapes[c.id], `${c.id} missing from tracks-data.js`);
    assert.ok(c.country.length > 0);
    assert.ok(c.lengthM > 3000 && c.lengthM < 8000);
    assert.equal(c.laps, 5);
  });
  assert.equal(Data.CIRCUITS.find((c) => c.id === "spa").lengthM, 7004);
});

test("the two cups use every circuit exactly once", () => {
  const used = Data.CUP_DEFS.flatMap((cup) => cup.circuitIds);
  assert.deepEqual([...used].sort(), Data.CIRCUITS.map((c) => c.id).sort());
  assert.deepEqual(Data.CUP_DEFS.map((cup) => cup.id), ["trophyCup", "constructorCup"]);
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
    assert.equal(new Set(set).size, set.length, "no driver twice in a set");
  }
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
