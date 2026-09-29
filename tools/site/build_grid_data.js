// Build assets/data/grid-2025.json -- the site's facts about the game's 2025
// grid -- from an F1DB JSON release (CC BY 4.0, https://github.com/f1db/f1db).
//
//   gh release download <tag> -R f1db/f1db -p f1db-json-splitted.zip
//   unzip f1db-json-splitted.zip -d f1db
//   node tools/site/build_grid_data.js f1db <tag>
//
// The game's grid is the lineup that started the season in Melbourne; drivers
// who changed seat during 2025 keep the game's team and list their 2025 seats.
// 2025 wins, podiums and poles count Grands Prix only (not sprints). Career
// totals are F1DB's as of the release. The output is committed: the site never
// fetches at run time.
const fs = require("node:fs");
const path = require("node:path");
const { DRIVERS, TEAMS } = require("../../game-data.js");

const [dir, release] = process.argv.slice(2);
if (!dir || !release) {
  console.error("usage: node tools/site/build_grid_data.js <f1db-json-dir> <release-tag>");
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

const countries = Object.fromEntries(load("countries").map((c) => [c.id, c]));
const drivers = Object.fromEntries(load("drivers").map((d) => [d.id, d]));
const constructors = Object.fromEntries(load("constructors").map((c) => [c.id, c]));
const results = load("races-race-results").filter((r) => r.year === YEAR);
const driverStandings = load("seasons-driver-standings").filter((s) => s.year === YEAR);
const teamStandings = load("seasons-constructor-standings").filter((s) => s.year === YEAR);
const seats = load("seasons-entrants-drivers").filter((e) => e.year === YEAR && !e.testDriver && e.rounds);

const need = (value, what) => {
  if (value === undefined || value === null) throw new Error(`F1DB has no ${what}`);
  return value;
};

const out = {
  source: {
    name: "F1DB",
    url: "https://github.com/f1db/f1db",
    release,
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: `Race data from F1DB (${release}), licensed CC BY 4.0.`,
  },
  drivers: DRIVERS.map((game) => {
    const f1dbId = need(DRIVER_IDS[game.id], `mapping for ${game.id}`);
    const d = need(drivers[f1dbId], `driver ${f1dbId}`);
    if (d.abbreviation !== game.code) throw new Error(`${game.id}: F1DB code ${d.abbreviation}, game ${game.code}`);
    const mine = results.filter((r) => r.driverId === f1dbId);
    const standing = need(driverStandings.find((s) => s.driverId === f1dbId), `${YEAR} standing for ${f1dbId}`);
    return {
      id: game.id,
      f1dbId,
      name: d.name,
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
          .map((e) => ({ teamId: gameTeamOf[e.constructorId] || e.constructorId, rounds: e.roundsText || String(e.rounds) }))
          .sort((a, b) => parseInt(a.rounds, 10) - parseInt(b.rounds, 10)),
      },
      career: {
        starts: d.totalRaceStarts,
        wins: d.totalRaceWins,
        podiums: d.totalPodiums,
        poles: d.totalPolePositions,
        titles: d.totalChampionshipWins,
      },
    };
  }),
  teams: TEAMS.map((game) => {
    const f1dbId = need(TEAM_IDS[game.id], `mapping for ${game.id}`);
    const c = need(constructors[f1dbId], `constructor ${f1dbId}`);
    const standing = need(teamStandings.find((s) => s.constructorId === f1dbId), `${YEAR} standing for ${f1dbId}`);
    return {
      id: game.id,
      f1dbId,
      name: c.name,
      fullName: c.fullName,
      country: need(countries[c.countryId], `country ${c.countryId}`).name,
      season: {
        position: standing.positionNumber,
        points: standing.points,
        champion: Boolean(standing.championshipWon),
        wins: results.filter((r) => r.constructorId === f1dbId && r.positionNumber === 1).length,
      },
      career: { titles: c.totalChampionshipWins, wins: c.totalRaceWins },
    };
  }),
};

const target = path.join(__dirname, "..", "..", "assets", "data", "grid-2025.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), target)}: ${out.drivers.length} drivers, ${out.teams.length} teams`);
