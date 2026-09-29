// Build assets/data/grid-2025.json -- the site's facts about the game's 2025
// grid -- from an F1DB JSON release (CC BY 4.0, https://github.com/f1db/f1db).
//
//   gh release download <tag> -R f1db/f1db -p f1db-json-splitted.zip
//   unzip f1db-json-splitted.zip -d f1db
//   node tools/site/build_grid_data.js f1db <tag>
//
// The game's grid is the lineup that started the season in Melbourne; drivers
// who changed seat during 2025 keep the game's team and list their 2025 seats.
// Everything is a snapshot at the end of 2025: the season's wins, podiums and
// poles (Grands Prix only, not sprints), and careers counted from F1DB's race
// rows up to and including 2025 -- the rule is checked against F1DB's own
// all-time totals first, so it counts the way F1DB does. The output is a
// script (window.GRID_2025), committed, so the pages need no fetch at all.
const fs = require("node:fs");
const path = require("node:path");
const { DRIVERS, TEAMS } = require("../../game-data.js");

const [dir, release] = process.argv.slice(2);
if (!dir || !/^v\d{4}\.\d+\.\d+$/.test(release || "")) {
  console.error("usage: node tools/site/build_grid_data.js <f1db-json-dir> <release-tag, e.g. v2026.15.1>");
  process.exit(1);
}
const load = (name) => JSON.parse(fs.readFileSync(path.join(dir, `f1db-${name}.json`), "utf8"));

const YEAR = 2025;
// Game ids to F1DB ids.
const DRIVER_IDS = {
  verstappen: "max-verstappen", lawson: "liam-lawson", leclerc: "charles-leclerc", hamilton: "lewis-hamilton",
  norris: "lando-norris", piastri: "oscar-piastri", russell: "george-russell", antonelli: "kimi-antonelli",
  alonso: "fernando-alonso", stroll: "lance-stroll", gasly: "pierre-gasly", doohan: "jack-doohan",
  albon: "alexander-albon", sainz: "carlos-sainz-jr", bearman: "oliver-bearman", ocon: "esteban-ocon",
  tsunoda: "yuki-tsunoda", hadjar: "isack-hadjar", hulkenberg: "nico-hulkenberg", bortoleto: "gabriel-bortoleto",
};
const TEAM_IDS = {
  redBull: "red-bull", ferrari: "ferrari", mclaren: "mclaren", mercedes: "mercedes", astonMartin: "aston-martin",
  alpine: "alpine", williams: "williams", haas: "haas", racingBulls: "racing-bulls", sauber: "kick-sauber",
};
const gameTeamOf = Object.fromEntries(Object.entries(TEAM_IDS).map(([game, f1db]) => [f1db, game]));

const need = (value, what) => {
  if (value === undefined || value === null) throw new Error(`F1DB has no ${what}`);
  return value;
};

const countries = Object.fromEntries(load("countries").map((c) => [c.id, c]));
const drivers = Object.fromEntries(load("drivers").map((d) => [d.id, d]));
const constructors = Object.fromEntries(load("constructors").map((c) => [c.id, c]));
const allResults = load("races-race-results");
const results = allResults.filter((r) => r.year === YEAR);
const upTo2025 = allResults.filter((r) => r.year <= YEAR);
const allDriverStandings = load("seasons-driver-standings");
const allTeamStandings = load("seasons-constructor-standings");
const driverStandings = allDriverStandings.filter((s) => s.year === YEAR);
const teamStandings = allTeamStandings.filter((s) => s.year === YEAR);
const seats = load("seasons-entrants-drivers").filter((e) => e.year === YEAR && !e.testDriver && e.rounds);

// Counting a career from the race rows, the way F1DB counts it.
const NOT_STARTED = new Set(["DNS", "DNQ", "DNPQ", "DNP", "EX"]);
function driverCareer(rows, f1dbId, standings) {
  const mine = rows.filter((r) => r.driverId === f1dbId);
  return {
    starts: mine.filter((r) => !NOT_STARTED.has(r.positionText)).length,
    wins: mine.filter((r) => r.positionNumber === 1).length,
    podiums: mine.filter((r) => r.positionNumber >= 1 && r.positionNumber <= 3).length,
    poles: mine.filter((r) => r.polePosition).length,
    titles: standings.filter((s) => s.driverId === f1dbId && s.championshipWon).length,
  };
}
// A race won by a shared car lists two winners: count races, not rows.
function teamCareer(rows, f1dbId, standings) {
  return {
    wins: new Set(rows.filter((r) => r.constructorId === f1dbId && r.positionNumber === 1).map((r) => r.raceId)).size,
    titles: standings.filter((s) => s.constructorId === f1dbId && s.championshipWon).length,
  };
}
// First, the rule over every year must give F1DB's own totals.
Object.values(DRIVER_IDS).forEach((id) => {
  const d = need(drivers[id], `driver ${id}`);
  const all = driverCareer(allResults, id, allDriverStandings);
  const want = { starts: d.totalRaceStarts, wins: d.totalRaceWins, podiums: d.totalPodiums, poles: d.totalPolePositions, titles: d.totalChampionshipWins };
  Object.keys(want).forEach((k) => { if (all[k] !== want[k]) throw new Error(`${id} ${k}: counted ${all[k]}, F1DB says ${want[k]}`); });
});
Object.values(TEAM_IDS).forEach((id) => {
  const c = need(constructors[id], `constructor ${id}`);
  const all = teamCareer(allResults, id, allTeamStandings);
  if (all.wins !== c.totalRaceWins || all.titles !== c.totalChampionshipWins) throw new Error(`${id}: counted ${JSON.stringify(all)}, F1DB says ${c.totalRaceWins} wins, ${c.totalChampionshipWins} titles`);
});
const upToStandings = (list) => list.filter((s) => s.year <= YEAR);

const seasonRaces = load("races").filter((r) => r.year === YEAR).sort((a, b) => a.round - b.round);
const opener = need(seasonRaces[0], `${YEAR} races`);

const out = {
  season: { year: YEAR, firstRace: opener.date, rounds: seasonRaces.length, careersTo: `the end of ${YEAR}` },
  source: {
    name: "F1DB",
    url: "https://github.com/f1db/f1db",
    release,
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    author: "Marcel Overdijk",
    attribution: `Race data from F1DB by Marcel Overdijk (${release}), CC BY 4.0; adapted: ${YEAR} figures and careers to the end of ${YEAR} counted from its race results, names matched to the game's teams.`,
  },
  drivers: DRIVERS.map((game) => {
    const f1dbId = need(DRIVER_IDS[game.id], `mapping for ${game.id}`);
    const d = need(drivers[f1dbId], `driver ${f1dbId}`);
    if (d.abbreviation !== game.code) throw new Error(`${game.id}: F1DB code ${d.abbreviation}, game ${game.code}`);
    const mine = results.filter((r) => r.driverId === f1dbId);
    const standing = need(driverStandings.find((s) => s.driverId === f1dbId), `${YEAR} standing for ${f1dbId}`);
    need(standing.positionNumber, `${YEAR} position for ${f1dbId}`);
    return {
      id: game.id,
      f1dbId,
      name: game.name,
      f1dbName: d.name,
      number: game.number,
      code: game.code,
      nationality: need(countries[d.nationalityCountryId], `country ${d.nationalityCountryId}`).demonym,
      dateOfBirth: d.dateOfBirth,
      melbourneTeamId: game.teamId,
      season: {
        position: standing.positionNumber,
        points: standing.points,
        champion: Boolean(standing.championshipWon),
        wins: mine.filter((r) => r.positionNumber === 1).length,
        podiums: mine.filter((r) => r.positionNumber >= 1 && r.positionNumber <= 3).length,
        poles: mine.filter((r) => r.polePosition).length,
        // In the order they drove them.
        teams: seats.filter((e) => e.driverId === f1dbId)
          .map((e) => ({ teamId: need(gameTeamOf[e.constructorId], `a game team for ${e.constructorId}`), rounds: need(e.roundsText, `rounds for ${f1dbId}`) }))
          .sort((a, b) => parseInt(a.rounds, 10) - parseInt(b.rounds, 10)),
      },
      career: driverCareer(upTo2025, f1dbId, upToStandings(allDriverStandings)),
    };
  }),
  teams: TEAMS.map((game) => {
    const f1dbId = need(TEAM_IDS[game.id], `mapping for ${game.id}`);
    const c = need(constructors[f1dbId], `constructor ${f1dbId}`);
    const standing = need(teamStandings.find((s) => s.constructorId === f1dbId), `${YEAR} standing for ${f1dbId}`);
    need(standing.positionNumber, `${YEAR} position for ${f1dbId}`);
    return {
      id: game.id,
      f1dbId,
      // The game's name for the team (no title sponsors), and F1DB's.
      name: game.name,
      f1dbName: c.name,
      country: need(countries[c.countryId], `country ${c.countryId}`).name,
      season: {
        position: standing.positionNumber,
        points: standing.points,
        champion: Boolean(standing.championshipWon),
        wins: teamCareer(results, f1dbId, []).wins,
      },
      // Under this name (F1DB's constructor): Racing Bulls' wins as Toro
      // Rosso or AlphaTauri, for instance, are not counted here.
      career: teamCareer(upTo2025, f1dbId, upToStandings(allTeamStandings)),
    };
  }),
};

const target = path.join(__dirname, "..", "..", "assets", "data", "grid-2025.js");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `// Generated by tools/site/build_grid_data.js from F1DB (CC BY 4.0). Do not edit by hand.\nwindow.GRID_2025 = ${JSON.stringify(out, null, 2)};\n`);
console.log(`wrote ${path.relative(process.cwd(), target)}: ${out.drivers.length} drivers, ${out.teams.length} teams`);
