// The season: the whole calendar as one championship
// (docs/superpowers/specs/2026-10-01-calendar-design.md). Pure: the points,
// the drivers' and constructors' standings, the save and its checks, and the
// cup the pit lane remembers. A season is its settings and the results of the
// races run so far; everything else is worked out from those, so a save can't
// disagree with itself. In the page it defines window.Season; in Node it is
// require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Season = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // As the cups score: the top ten, and one for the fastest lap in the top ten.
  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const STORAGE_KEY = "f1pixelcup.season.v1";
  const VERSION = 1;
  const DIFFICULTIES = ["rookie", "pro", "legend"];
  const GRID_MODES = ["back", "qualifying"];
  const WEATHER_MODES = ["dry", "wet", "changeable"];

  const pointsFor = (position) => POINTS[position - 1] || 0;

  function start({ runId, driverId, difficulty, gridMode, weatherMode, trackIds, field, teamOf }) {
    return {
      version: VERSION,
      runId: String(runId),
      driverId,
      difficulty,
      gridMode,
      weatherMode,
      trackIds: [...trackIds],
      field: [...field],
      teams: Object.fromEntries(field.map((id) => [id, teamOf[id]])),
      results: [],
      nextRace: 0,
    };
  }

  const isOver = (season) => season.nextRace >= season.trackIds.length;

  // One race's result: the finishing order (every driver once) and who set
  // the fastest lap (or null). Returns the season after it; the one given is
  // left as it was.
  function addRace(season, { order, fastest }) {
    if (isOver(season)) throw new Error("the season is over");
    if (!sameField(order, season.field)) throw new Error("a result must place every driver once");
    const results = [...season.results, { order: [...order], fastest: fastest && season.field.includes(fastest) ? fastest : null }];
    return { ...season, results, nextRace: results.length };
  }

  function sameField(order, field) {
    return Array.isArray(order) && order.length === field.length && new Set(order).size === field.length
      && order.every((id) => field.includes(id));
  }

  // Each driver's points and finishing positions, race by race.
  function tally(season) {
    const rows = new Map(season.field.map((id) => [id, { driverId: id, teamId: season.teams[id], points: 0, finishes: [] }]));
    season.results.forEach(({ order, fastest }) => {
      order.forEach((id, i) => {
        const row = rows.get(id);
        row.points += pointsFor(i + 1);
        row.finishes.push(i + 1);
      });
      if (fastest && order.indexOf(fastest) < 10) rows.get(fastest).points += 1;
    });
    return [...rows.values()];
  }

  // Points first; level on points, the countback: most wins, then most
  // seconds, and so on down the order.
  function compareCountback(a, b) {
    if (a.points !== b.points) return b.points - a.points;
    const most = Math.max(0, ...a.finishes, ...b.finishes);
    for (let p = 1; p <= most; p += 1) {
      const diff = b.finishes.filter((x) => x === p).length - a.finishes.filter((x) => x === p).length;
      if (diff) return Math.sign(diff);
    }
    return 0;
  }

  function rank(rows, name) {
    return rows
      .sort((a, b) => compareCountback(a, b) || String(name(a)).localeCompare(String(name(b))))
      .map((row, i) => ({ ...row, position: i + 1, wins: row.finishes.filter((p) => p === 1).length }));
  }

  function driverStandings(season) {
    return rank(tally(season), (r) => r.driverId);
  }

  // Both drivers' points together, and both drivers' finishes for the countback.
  function constructorStandings(season) {
    const teams = new Map();
    tally(season).forEach((row) => {
      if (!teams.has(row.teamId)) teams.set(row.teamId, { teamId: row.teamId, points: 0, finishes: [], drivers: [] });
      const team = teams.get(row.teamId);
      team.points += row.points;
      team.finishes.push(...row.finishes);
      team.drivers.push(row.driverId);
    });
    return rank([...teams.values()], (r) => r.teamId);
  }

  function serialize(season) {
    return JSON.stringify(season);
  }

  // A saved season, checked against the game it is loaded into: the same
  // calendar and drivers, known settings, every result a whole race. Anything
  // wrong and it is ignored (null), never half-loaded.
  function parse(text, { trackIds, field, teamOf }) {
    let raw;
    try {
      raw = typeof text === "string" ? JSON.parse(text) : null;
    } catch (err) {
      return null;
    }
    if (!raw || typeof raw !== "object" || raw.version !== VERSION) return null;
    const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
    if (!sameList(raw.trackIds, trackIds) || !sameField(raw.field, field) || !field.includes(raw.driverId)) return null;
    if (!DIFFICULTIES.includes(raw.difficulty) || !GRID_MODES.includes(raw.gridMode) || !WEATHER_MODES.includes(raw.weatherMode)) return null;
    if (typeof raw.runId !== "string" || !raw.runId || !Array.isArray(raw.results) || raw.results.length > trackIds.length) return null;
    const ok = raw.results.every((r) => r && sameField(r.order, field) && (r.fastest === null || field.includes(r.fastest)));
    if (!ok) return null;
    let season = start({ ...raw, trackIds, field: raw.field, teamOf });
    raw.results.forEach((r) => { season = addRace(season, r); });
    return season;
  }

  // The cup the pit lane remembers, by id. The two cups before the calendar
  // (and the index a build may have kept for them) go to the calendar cup with
  // their first circuit; anything else to the first cup.
  const OLD_CUPS = { trophyCup: "monza", constructorCup: "monaco" };
  const OLD_INDICES = ["trophyCup", "constructorCup"];
  function resolveCup(stored, cups) {
    const ids = cups.map((c) => c.id);
    if (ids.includes(stored)) return stored;
    const old = OLD_CUPS[stored] ? stored : /^\d+$/.test(String(stored)) ? OLD_INDICES[Number(stored)] : null;
    const home = old && cups.find((c) => (c.circuitIds || []).includes(OLD_CUPS[old]));
    return home ? home.id : ids[0];
  }

  return {
    POINTS, STORAGE_KEY, VERSION,
    start, addRace, isOver, driverStandings, constructorStandings, compareCountback, serialize, parse, resolveCup,
  };
}));
