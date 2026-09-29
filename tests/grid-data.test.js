const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Data = require("../game-data.js");

const vm = require("node:vm");

// The data ships as a script (window.GRID_2025), so the pages need no fetch.
const file = path.join(__dirname, "..", "assets", "data", "grid-2025.js");
const grid = () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  // (Through JSON: objects from another realm fail strict deep-equality.)
  return JSON.parse(JSON.stringify(sandbox.window.GRID_2025));
};
const count = (v) => Number.isInteger(v) && v >= 0;

test("the grid data credits F1DB under CC BY 4.0", () => {
  const { source } = grid();
  assert.equal(source.name, "F1DB");
  assert.equal(source.license, "CC BY 4.0");
  assert.match(source.url, /^https:\/\/github\.com\/f1db\/f1db/);
  assert.match(source.licenseUrl, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(source.release, /^v\d{4}\.\d+\.\d+$/);
  assert.equal(source.author, "Marcel Overdijk");
  // CC BY 4.0 asks for the author, the licence and a note of what was changed.
  assert.match(source.attribution, /F1DB by Marcel Overdijk/);
  assert.match(source.attribution, /adapted/);
});

test("every site page credits F1DB with the licence link and the release in the data", () => {
  const { source } = grid();
  ["index.html", "drivers.html", "teams.html"].forEach((page) => {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    assert.match(footer, /href="https:\/\/github\.com\/f1db\/f1db"/, page);
    assert.match(footer, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"/, page);
    assert.ok(footer.includes(source.release), `${page} names release ${source.release}`);
    assert.match(footer, /Marcel Overdijk/, page);
    assert.match(footer, /adapted/i, page);
    assert.match(footer, /not affiliated with Formula 1, the FIA or the teams/, page);
  });
});

test("20 drivers and 10 teams, one to one with the game's grid", () => {
  const g = grid();
  assert.deepEqual(g.drivers.map((d) => d.id).sort(), Data.DRIVERS.map((d) => d.id).sort());
  assert.deepEqual(g.teams.map((t) => t.id).sort(), Data.TEAMS.map((t) => t.id).sort());
  g.drivers.forEach((d) => {
    const game = Data.DRIVERS.find((x) => x.id === d.id);
    assert.equal(d.melbourneTeamId, game.teamId, d.id);
    // The game's names, everywhere.
    assert.equal(d.name, game.name, `${d.id} name`);
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
    ["f1dbId", "name", "f1dbName", "country"].forEach((k) => assert.ok(typeof t[k] === "string" && t[k], `${t.id}.${k}`));
    assert.equal(t.name, Data.TEAMS.find((x) => x.id === t.id).name, `${t.id} uses the game's name`);
    ["position", "points", "wins"].forEach((k) => assert.ok(count(t.season[k]), `${t.id}.season.${k}`));
    ["titles", "wins"].forEach((k) => assert.ok(count(t.career[k]), `${t.id}.career.${k}`));
  });
  assert.deepEqual(g.teams.map((t) => t.season.position).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("the 2025 champions are as F1DB has them, and only they are flagged", () => {
  const g = grid();
  const champ = g.drivers.find((d) => d.season.position === 1);
  assert.equal(champ.id, "norris");
  assert.equal(champ.season.points, 423);
  assert.deepEqual(g.drivers.filter((d) => d.season.champion).map((d) => d.id), ["norris"]);
  const team = g.teams.find((t) => t.season.position === 1);
  assert.equal(team.id, "mclaren");
  assert.equal(team.season.points, 833);
  assert.deepEqual(g.teams.filter((t) => t.season.champion).map((t) => t.id), ["mclaren"]);
});

test("careers stop at the end of 2025: a 2025 snapshot, whatever later races the release holds", () => {
  const g = grid();
  assert.equal(g.season.careersTo, "the end of 2025");
  assert.equal(g.season.rounds, 24);
  const by = (id) => g.drivers.find((d) => d.id === id);
  // Antonelli's first wins came in 2026; Hamilton's last were in 2024.
  assert.equal(by("antonelli").career.wins, 0);
  assert.equal(by("hamilton").career.wins, 105);
  assert.equal(by("hamilton").career.titles, 7);
  assert.equal(by("verstappen").career.titles, 4);
  const team = (id) => g.teams.find((t) => t.id === id);
  assert.equal(team("ferrari").career.titles, 16);
  assert.equal(team("mclaren").career.titles, 10);
});

test("the seat changes of 2025", () => {
  const by = (id) => grid().drivers.find((d) => d.id === id);
  assert.deepEqual(by("lawson").season.teams, [{ teamId: "redBull", rounds: "1-2" }, { teamId: "racingBulls", rounds: "3-24" }]);
  assert.deepEqual(by("doohan").season.teams, [{ teamId: "alpine", rounds: "1-6" }]);
});

test("a driver's 2025 seats are in the order they drove them", () => {
  const tsunoda = grid().drivers.find((d) => d.id === "tsunoda");
  assert.deepEqual(tsunoda.season.teams, [{ teamId: "racingBulls", rounds: "1-2" }, { teamId: "redBull", rounds: "3-24" }]);
});

test("the season opener is on record (ages are given as of it)", () => {
  const { season } = grid();
  assert.equal(season.year, 2025);
  assert.equal(season.firstRace, "2025-03-16");
});
