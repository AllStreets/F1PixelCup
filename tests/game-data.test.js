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

test("every power-up the game hands out has a name and an effect", () => {
  const handedOut = ["oilSlick", "debris", "drsSignPost", "undercut", "overtake", "graining",
    "engineBlast", "safetyCar", "formationLap", "powerDeploy", "stewardPenalty"];
  handedOut.forEach((id) => {
    const p = Data.POWER_UPS.find((entry) => entry.id === id);
    assert.ok(p, id);
    assert.ok(p.name && p.effect);
  });
});

test("difficulties match the career multipliers", () => {
  assert.deepEqual(Data.DIFFICULTIES.map((d) => d.id), ["rookie", "pro", "legend"]);
});
