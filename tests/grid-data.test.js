const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Data = require("../game-data.js");

const file = path.join(__dirname, "..", "assets", "data", "grid-2025.json");
const grid = () => JSON.parse(fs.readFileSync(file, "utf8"));
const count = (v) => Number.isInteger(v) && v >= 0;

test("the grid data credits F1DB under CC BY 4.0", () => {
  const { source } = grid();
  assert.equal(source.name, "F1DB");
  assert.equal(source.license, "CC BY 4.0");
  assert.match(source.url, /^https:\/\/github\.com\/f1db\/f1db/);
  assert.match(source.licenseUrl, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(source.release, /^v\d{4}\.\d+\.\d+$/);
  assert.ok(source.attribution.includes("F1DB"));
});

test("20 drivers and 10 teams, one to one with the game's grid", () => {
  const g = grid();
  assert.deepEqual(g.drivers.map((d) => d.id).sort(), Data.DRIVERS.map((d) => d.id).sort());
  assert.deepEqual(g.teams.map((t) => t.id).sort(), Data.TEAMS.map((t) => t.id).sort());
  g.drivers.forEach((d) => {
    const game = Data.DRIVERS.find((x) => x.id === d.id);
    assert.equal(d.melbourneTeamId, game.teamId, d.id);
    assert.equal(d.number, game.number, `${d.id} number`);
    assert.equal(d.code, game.code, `${d.id} code`);
  });
});

test("every driver has a full, sane record", () => {
  const g = grid();
  const positions = new Set();
  g.drivers.forEach((d) => {
    ["f1dbId", "name", "nationality", "dateOfBirth"].forEach((k) => assert.ok(typeof d[k] === "string" && d[k], `${d.id}.${k}`));
    assert.match(d.dateOfBirth, /^\d{4}-\d{2}-\d{2}$/);
    ["position", "points", "wins", "podiums", "poles"].forEach((k) => assert.ok(count(d.season[k]), `${d.id}.season.${k}`));
    ["starts", "wins", "podiums", "poles", "titles"].forEach((k) => assert.ok(count(d.career[k]), `${d.id}.career.${k}`));
    assert.ok(d.season.teams.length >= 1 && d.season.teams.every((t) => typeof t.teamId === "string" && typeof t.rounds === "string"));
    assert.ok(d.career.wins >= d.season.wins && d.career.podiums >= d.season.podiums);
    assert.ok(!positions.has(d.season.position), `${d.id} shares a championship position`);
    positions.add(d.season.position);
  });
});

test("every team has a full, sane record; positions 1-10 once each", () => {
  const g = grid();
  g.teams.forEach((t) => {
    ["f1dbId", "name", "fullName", "country"].forEach((k) => assert.ok(typeof t[k] === "string" && t[k], `${t.id}.${k}`));
    ["position", "points", "wins"].forEach((k) => assert.ok(count(t.season[k]), `${t.id}.season.${k}`));
    ["titles", "wins"].forEach((k) => assert.ok(count(t.career[k]), `${t.id}.career.${k}`));
  });
  assert.deepEqual(g.teams.map((t) => t.season.position).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("the 2025 champions are as F1DB has them", () => {
  const g = grid();
  const champ = g.drivers.find((d) => d.season.position === 1);
  assert.equal(champ.id, "norris");
  assert.equal(champ.season.points, 423);
  const team = g.teams.find((t) => t.season.position === 1);
  assert.equal(team.id, "mclaren");
  assert.equal(team.season.points, 833);
});

test("a driver's 2025 seats are in the order they drove them", () => {
  const tsunoda = grid().drivers.find((d) => d.id === "tsunoda");
  assert.deepEqual(tsunoda.season.teams, [{ teamId: "racingBulls", rounds: "1-2" }, { teamId: "redBull", rounds: "3-24" }]);
});
