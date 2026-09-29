// Career scoring and the saved player profile -- one career per driver.
//
// Two numbers, as agreed in docs/superpowers/specs/2026-09-27-scoring-career-design.md:
// career points (race points scaled by difficulty, plus a cup bonus; only ever
// go up) and a skill rating (Elo against a fixed-strength AI field per
// difficulty; goes up and down). This file has no DOM code. In the browser it
// defines window.Career; in Node it is require()-able for the tests.

(function attach(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Career = api;
}(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const CUP_BONUS = [50, 30, 20];
  const MULTIPLIER = { rookie: 1, pro: 2, legend: 3 };
  // Qualifying positions P1..P10, before the difficulty multiplier.
  const QUALI_POINTS = [10, 6, 4, 2, 2, 2, 2, 2, 2, 2];
  const FIELD_STRENGTH = { rookie: 1000, pro: 1400, legend: 1800 };
  const DIFFICULTY_NAMES = { rookie: "Rookie", pro: "Pro", legend: "Legend" };
  const START_RATING = 1200;
  const PROVISIONAL_RACES = 10;
  const K_PROVISIONAL = 40;
  const K_SETTLED = 24;
  // Highest first: the first threshold the rating reaches names the tier.
  const TIERS = [
    [1850, "World Champion"],
    [1700, "F1"],
    [1500, "F2"],
    [1300, "F3"],
    [1100, "F4"],
    [-Infinity, "Karting"],
  ];

  function multiplierFor(difficulty) {
    if (!Object.prototype.hasOwnProperty.call(MULTIPLIER, difficulty)) {
      throw new Error(`Unknown difficulty: ${difficulty}`);
    }
    return MULTIPLIER[difficulty];
  }

  function raceAward({ position, fastestLap, difficulty }) {
    const multiplier = multiplierFor(difficulty);
    const base = POINTS_TABLE[position - 1] || 0;
    const bonus = fastestLap && position >= 1 && position <= 10 ? 1 : 0;
    const racePoints = base + bonus;
    return { racePoints, multiplier, careerPoints: racePoints * multiplier };
  }

  function qualifyingAward({ position, difficulty }) {
    const multiplier = multiplierFor(difficulty);
    const points = QUALI_POINTS[position - 1] || 0;
    return { points, multiplier, careerPoints: points * multiplier };
  }

  function cupAward({ position, difficulty }) {
    const multiplier = multiplierFor(difficulty);
    const bonus = CUP_BONUS[position - 1] || 0;
    return { bonus, multiplier, careerPoints: bonus * multiplier };
  }

  function rateRace({ rating, ratedRaces, position, fieldSize, difficulty }) {
    multiplierFor(difficulty);
    const field = FIELD_STRENGTH[difficulty];
    const place = Math.min(Math.max(position, 1), Math.max(fieldSize, 1));
    const actual = fieldSize > 1 ? (fieldSize - place) / (fieldSize - 1) : 1;
    const expected = 1 / (1 + 10 ** ((field - rating) / 400));
    const k = ratedRaces < PROVISIONAL_RACES ? K_PROVISIONAL : K_SETTLED;
    const delta = Math.round(k * (actual - expected)) || 0;
    return { before: rating, after: rating + delta, delta, expected, actual, k };
  }

  function tierFor(rating) {
    if (typeof rating !== "number" || !Number.isFinite(rating)) return "Karting";
    return TIERS.find(([floor]) => rating >= floor)[1];
  }

  // ---------------------------------------------------------------------------
  // The saved profile: one career per driver. One JSON document under one key,
  // read fresh before every record (so a second tab's progress is never
  // overwritten) and written whole in one setItem (so a crash cannot leave half
  // a profile). Version 1 was a single shared career; it is split by driver the
  // first time it is read (see migrateV1).
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = "f1pixelcup.profile";
  const BACKUP_PREFIX = "f1pixelcup.profile.backup.";
  const PROFILE_VERSION = 2;
  // Per driver.
  const HISTORY_LIMIT = 5000;
  // Who a career with no driver on record belongs to: the game's default driver.
  const DEFAULT_DRIVER = "leclerc";
  const TOTAL_KEYS = ["races", "wins", "podiums", "cupsCompleted", "cupsWon", "poles"];

  function defaultUuid() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    const part = () => Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${part()}-${part()}`;
  }

  function freshProfile(at, uuid) {
    return { version: PROFILE_VERSION, profileId: uuid(), createdAt: at, updatedAt: at, lastDriverId: null, drivers: {} };
  }

  function freshDriver(driverId) {
    return {
      driverId,
      careerPoints: 0,
      rating: START_RATING,
      ratedRaces: 0,
      totals: Object.fromEntries(TOTAL_KEYS.map((key) => [key, 0])),
      bestLaps: {},
      history: [],
    };
  }

  const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const numberOr = (value, fallback) => (isNumber(value) && value >= 0 ? value : fallback);
  const stringOr = (value, fallback) => (typeof value === "string" && value ? value : fallback);

  // A save this version of the game understands (v1 is migrated, v2 is current).
  function recognised(raw) {
    return isObject(raw) && isNumber(raw.version) && raw.version >= 1 && raw.version <= PROFILE_VERSION;
  }

  // A save written by a newer version of the game. It is not ours to touch.
  function fromNewerVersion(raw) {
    return isObject(raw) && isNumber(raw.version) && raw.version > PROFILE_VERSION;
  }

  function cleanTotals(raw) {
    const totals = isObject(raw) ? raw : {};
    return Object.fromEntries(TOTAL_KEYS.map((key) => [key, numberOr(totals[key], 0)]));
  }

  function cleanBestLaps(raw) {
    const bestLaps = {};
    if (isObject(raw)) {
      Object.keys(raw).forEach((trackId) => {
        const lap = raw[trackId];
        if (isObject(lap) && isNumber(lap.ms) && lap.ms > 0) bestLaps[trackId] = lap;
      });
    }
    return bestLaps;
  }

  // Fill in anything a partial driver career lacks, and drop any field of the
  // wrong type, keeping everything that is sound.
  function cleanDriver(driverId, raw) {
    const base = freshDriver(driverId);
    return {
      driverId,
      careerPoints: numberOr(raw.careerPoints, base.careerPoints),
      rating: numberOr(raw.rating, base.rating),
      ratedRaces: numberOr(raw.ratedRaces, base.ratedRaces),
      totals: cleanTotals(raw.totals),
      bestLaps: cleanBestLaps(raw.bestLaps),
      history: Array.isArray(raw.history) ? raw.history.filter(isObject) : [],
    };
  }

  // A v2 save, repaired: a hand-edited or damaged save must never stop the game.
  function cleanV2(raw, at, uuid) {
    const base = freshProfile(at, uuid);
    const drivers = {};
    if (isObject(raw.drivers)) {
      Object.keys(raw.drivers).forEach((driverId) => {
        if (isObject(raw.drivers[driverId])) drivers[driverId] = cleanDriver(driverId, raw.drivers[driverId]);
      });
    }
    return {
      version: PROFILE_VERSION,
      profileId: stringOr(raw.profileId, base.profileId),
      createdAt: stringOr(raw.createdAt, base.createdAt),
      updatedAt: stringOr(raw.updatedAt, base.updatedAt),
      lastDriverId: stringOr(raw.lastDriverId, null),
      drivers,
    };
  }

  // One shared career (v1) becomes one per driver (v2), with nothing lost:
  // the history is replayed in order -- each race to the driver who drove it,
  // each cup to the driver of its races -- and each driver's rating is worked
  // out again from 1200 on their own races. Whatever the history can't account
  // for goes to the most-raced driver (or Leclerc, with no history at all).
  function migrateV1(raw, at, uuid) {
    const base = freshProfile(at, uuid);
    const history = Array.isArray(raw.history) ? raw.history.filter(isObject) : [];
    const drivers = {};
    const driver = (id) => (drivers[id] = drivers[id] || freshDriver(id));
    const cupDriver = {};
    history.forEach((entry) => {
      if (entry.type === "race" && typeof entry.driverId === "string" && entry.cupRunId) cupDriver[entry.cupRunId] = entry.driverId;
    });
    let lastDriver = null;
    let replayedPoints = 0;
    const replayedTotals = Object.fromEntries(TOTAL_KEYS.map((key) => [key, 0]));
    let ratedInHistory = 0;

    history.forEach((entry) => {
      if (entry.type === "race") {
        const id = stringOr(entry.driverId, lastDriver || DEFAULT_DRIVER);
        lastDriver = id;
        const d = driver(id);
        const quali = isObject(entry.qualifying) ? entry.qualifying : null;
        const points = numberOr(entry.careerPointsEarned, 0) + (quali ? numberOr(quali.careerPoints, 0) : 0);
        d.careerPoints += points;
        replayedPoints += points;
        const position = entry.position;
        const rated = isNumber(position) && position >= 1 && isNumber(entry.fieldSize)
          && Object.prototype.hasOwnProperty.call(MULTIPLIER, entry.difficulty);
        const replayed = { ...entry };
        if (rated) {
          const r = rateRace({ rating: d.rating, ratedRaces: d.ratedRaces, position, fieldSize: entry.fieldSize, difficulty: entry.difficulty });
          d.rating = r.after;
          d.ratedRaces += 1;
          ratedInHistory += 1;
          replayed.ratingBefore = r.before;
          replayed.ratingAfter = r.after;
        }
        d.totals.races += 1;
        replayedTotals.races += 1;
        if (position === 1) { d.totals.wins += 1; replayedTotals.wins += 1; }
        if (isNumber(position) && position >= 1 && position <= 3) { d.totals.podiums += 1; replayedTotals.podiums += 1; }
        if (quali && quali.position === 1) { d.totals.poles += 1; replayedTotals.poles += 1; }
        if (isNumber(entry.bestLapMs) && entry.bestLapMs > 0 && typeof entry.trackId === "string") {
          const previous = d.bestLaps[entry.trackId];
          if (!previous || entry.bestLapMs < previous.ms) {
            d.bestLaps[entry.trackId] = { ms: entry.bestLapMs, at: stringOr(entry.at, at), difficulty: entry.difficulty, teamId: entry.teamId };
          }
        }
        d.history.push(replayed);
      } else if (entry.type === "cup") {
        const id = cupDriver[entry.cupRunId] || lastDriver || DEFAULT_DRIVER;
        const d = driver(id);
        const points = numberOr(entry.careerPointsEarned, 0);
        d.careerPoints += points;
        replayedPoints += points;
        d.totals.cupsCompleted += 1;
        replayedTotals.cupsCompleted += 1;
        if (entry.position === 1) { d.totals.cupsWon += 1; replayedTotals.cupsWon += 1; }
        d.history.push({ ...entry });
      } else {
        driver(lastDriver || DEFAULT_DRIVER).history.push({ ...entry });
      }
    });

    // What the history can't account for (trimmed history, a hand-made save).
    const mostRaced = Object.values(drivers).sort((a, b) => b.totals.races - a.totals.races)[0];
    const heir = () => (mostRaced || driver(DEFAULT_DRIVER));
    const extraPoints = numberOr(raw.careerPoints, 0) - replayedPoints;
    const totals = cleanTotals(raw.totals);
    const extraTotals = TOTAL_KEYS.filter((key) => totals[key] > replayedTotals[key]);
    const legacyRating = ratedInHistory === 0 && numberOr(raw.rating, START_RATING) !== START_RATING;
    if (extraPoints > 0) heir().careerPoints += extraPoints;
    extraTotals.forEach((key) => { heir().totals[key] += totals[key] - replayedTotals[key]; });
    if (legacyRating) {
      heir().rating = numberOr(raw.rating, START_RATING);
      heir().ratedRaces = numberOr(raw.ratedRaces, 0);
    }
    // Best laps the history no longer shows.
    Object.entries(cleanBestLaps(raw.bestLaps)).forEach(([trackId, lap]) => {
      const d = driver(stringOr(lap.driverId, heir().driverId));
      if (!d.bestLaps[trackId] || lap.ms < d.bestLaps[trackId].ms) {
        d.bestLaps[trackId] = { ms: lap.ms, at: stringOr(lap.at, at), difficulty: lap.difficulty, teamId: lap.teamId };
      }
    });
    // A driver with nothing at all to their name isn't a career.
    Object.keys(drivers).forEach((id) => {
      const d = drivers[id];
      const empty = d.careerPoints === 0 && d.history.length === 0 && TOTAL_KEYS.every((key) => d.totals[key] === 0)
        && Object.keys(d.bestLaps).length === 0 && d.rating === START_RATING;
      if (empty) delete drivers[id];
    });
    return {
      version: PROFILE_VERSION,
      profileId: stringOr(raw.profileId, base.profileId),
      createdAt: stringOr(raw.createdAt, base.createdAt),
      updatedAt: stringOr(raw.updatedAt, base.updatedAt),
      lastDriverId: lastDriver || (Object.keys(drivers).length ? heir().driverId : null),
      drivers,
    };
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function createCareer({ storage = null, now = () => new Date(), uuid = defaultUuid } = {}) {
    // The profile as this session last knew it. It is only preferred over
    // storage while saving is failing (storage missing, blocked or full), so a
    // session still adds up; otherwise storage is the truth, and an emptied
    // storage means a fresh profile, not the last one read.
    let memory = null;
    let unsaved = false;
    // Set when the save in storage must not be overwritten (it is from a newer
    // version of the game, or it could not be backed up before a change). The
    // session then plays from memory and nothing is written.
    let locked = false;

    function write(profile) {
      if (!storage || locked) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(profile));
        return true;
      } catch (error) {
        return false;
      }
    }

    // Keep a copy of a save before replacing it; false if that isn't possible.
    function backUp(key, raw) {
      try {
        storage.setItem(key, raw);
        return true;
      } catch (error) {
        return false;
      }
    }

    function read() {
      const at = now().toISOString();
      if ((unsaved || locked) && memory) return memory;
      let raw;
      try {
        raw = storage ? storage.getItem(STORAGE_KEY) : null;
      } catch (error) {
        memory = memory || freshProfile(at, uuid);
        return memory;
      }
      if (raw === null || raw === undefined) {
        memory = freshProfile(at, uuid);
        return memory;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        parsed = null;
      }
      if (fromNewerVersion(parsed)) {
        locked = true;
        memory = freshProfile(at, uuid);
        return memory;
      }
      if (!recognised(parsed)) {
        // Never throw a save away: keep it under a backup key, then start over.
        // If the backup cannot be written, leave the save exactly where it is.
        if (!backUp(`${BACKUP_PREFIX}${Date.parse(at)}`, raw)) {
          locked = true;
          memory = freshProfile(at, uuid);
          return memory;
        }
        memory = freshProfile(at, uuid);
        write(memory);
        return memory;
      }
      if (parsed.version === 1) {
        // Split the shared career by driver, keeping the v1 save as a backup.
        // Without a backup the v1 save stays as it is and the session plays
        // from memory.
        memory = migrateV1(parsed, at, uuid);
        if (!backUp(`${BACKUP_PREFIX}v1-${Date.parse(at)}`, raw)) {
          locked = true;
          return memory;
        }
        write(memory);
        return memory;
      }
      memory = cleanV2(parsed, at, uuid);
      return memory;
    }

    function commit(profile) {
      profile.updatedAt = now().toISOString();
      Object.values(profile.drivers).forEach((d) => {
        if (d.history.length > HISTORY_LIMIT) d.history = d.history.slice(-HISTORY_LIMIT);
      });
      memory = profile;
      unsaved = !write(profile);
      return !unsaved;
    }

    function requireDriver(result, what) {
      if (!result || typeof result.driverId !== "string" || !result.driverId) {
        throw new Error(`Career: ${what} needs a driverId`);
      }
      return result.driverId;
    }

    function recordRace(result) {
      const driverId = requireDriver(result, "recordRace");
      const profile = read();
      const d = profile.drivers[driverId] || (profile.drivers[driverId] = freshDriver(driverId));
      const at = now().toISOString();
      const award = raceAward(result);
      const rating = rateRace({
        rating: d.rating,
        ratedRaces: d.ratedRaces,
        position: result.position,
        fieldSize: result.fieldSize,
        difficulty: result.difficulty,
      });
      const lap = isNumber(result.bestLapMs) && result.bestLapMs > 0 ? result.bestLapMs : null;
      // Qualifying, when the cup had it: points for the grid position, and poles.
      const quali = isObject(result.qualifying) && isNumber(result.qualifying.position) ? (() => {
        const q = qualifyingAward({ position: result.qualifying.position, difficulty: result.difficulty });
        const timeMs = isNumber(result.qualifying.timeMs) && result.qualifying.timeMs > 0 ? result.qualifying.timeMs : null;
        return { position: result.qualifying.position, timeMs, ...q };
      })() : null;

      d.careerPoints += award.careerPoints + (quali ? quali.careerPoints : 0);
      if (quali && quali.position === 1) d.totals.poles += 1;
      d.rating = rating.after;
      d.ratedRaces += 1;
      d.totals.races += 1;
      if (result.position === 1) d.totals.wins += 1;
      if (result.position >= 1 && result.position <= 3) d.totals.podiums += 1;

      let newBestLap = null;
      if (lap !== null) {
        const previous = d.bestLaps[result.trackId];
        if (!previous || lap < previous.ms) {
          d.bestLaps[result.trackId] = { ms: lap, at, difficulty: result.difficulty, teamId: result.teamId };
          newBestLap = { trackId: result.trackId, ms: lap, previousMs: previous ? previous.ms : null };
        }
      }

      d.history.push({
        id: uuid(),
        type: "race",
        at,
        cupId: result.cupId,
        cupRunId: result.cupRunId,
        raceIndex: result.raceIndex,
        trackId: result.trackId,
        difficulty: result.difficulty,
        driverId,
        teamId: result.teamId,
        position: result.position,
        fieldSize: result.fieldSize,
        bestLapMs: lap,
        fastestLap: Boolean(result.fastestLap),
        racePoints: award.racePoints,
        careerPointsEarned: award.careerPoints,
        qualifying: quali ? { position: quali.position, timeMs: quali.timeMs, points: quali.points, careerPoints: quali.careerPoints } : null,
        ratingBefore: rating.before,
        ratingAfter: rating.after,
      });
      profile.lastDriverId = driverId;

      const saved = commit(profile);
      return {
        driverId,
        qualifying: quali,
        racePoints: award.racePoints,
        multiplier: award.multiplier,
        careerPoints: award.careerPoints,
        careerTotal: d.careerPoints,
        rating: { before: rating.before, after: rating.after, delta: rating.delta },
        tier: tierFor(rating.after),
        newBestLap,
        saved,
      };
    }

    function recordCup(result) {
      const driverId = requireDriver(result, "recordCup");
      const profile = read();
      const award = cupAward(result);
      // Once per cup attempt, whichever driver it was first recorded for.
      const existing = result.cupRunId && Object.values(profile.drivers).some((d) => (
        d.history.some((entry) => entry.type === "cup" && entry.cupRunId === result.cupRunId)));
      const d = profile.drivers[driverId] || (profile.drivers[driverId] = freshDriver(driverId));
      if (existing) {
        const recorded = Object.values(profile.drivers).flatMap((x) => x.history)
          .find((entry) => entry.type === "cup" && entry.cupRunId === result.cupRunId);
        return {
          bonus: award.bonus,
          multiplier: award.multiplier,
          careerPoints: recorded.careerPointsEarned,
          careerTotal: d.careerPoints,
          alreadyRecorded: true,
          saved: true,
        };
      }
      d.careerPoints += award.careerPoints;
      d.totals.cupsCompleted += 1;
      if (result.position === 1) d.totals.cupsWon += 1;
      d.history.push({
        id: uuid(),
        type: "cup",
        at: now().toISOString(),
        cupId: result.cupId,
        cupRunId: result.cupRunId,
        driverId,
        difficulty: result.difficulty,
        position: result.position,
        cupPoints: result.cupPoints,
        careerPointsEarned: award.careerPoints,
      });
      profile.lastDriverId = driverId;
      const saved = commit(profile);
      return {
        bonus: award.bonus,
        multiplier: award.multiplier,
        careerPoints: award.careerPoints,
        careerTotal: d.careerPoints,
        alreadyRecorded: false,
        saved,
      };
    }

    function getDriver(driverId) {
      const profile = read();
      return clone(profile.drivers[driverId] || freshDriver(driverId));
    }

    function listDrivers() {
      const profile = read();
      return Object.values(profile.drivers)
        .map((d) => ({
          driverId: d.driverId,
          careerPoints: d.careerPoints,
          rating: d.rating,
          tier: tierFor(d.rating),
          races: d.totals.races,
          wins: d.totals.wins,
          lastRaceAt: (d.history.filter((h) => h.type === "race").slice(-1)[0] || {}).at || null,
        }))
        .sort((a, b) => b.rating - a.rating || b.careerPoints - a.careerPoints);
    }

    return {
      recordRace,
      recordCup,
      getProfile: () => clone(read()),
      getDriver,
      listDrivers,
      startCupRun: () => uuid(),
    };
  }

  function browserStorage() {
    try {
      return root.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  const api = {
    START_RATING,
    DIFFICULTY_NAMES,
    STORAGE_KEY,
    BACKUP_PREFIX,
    PROFILE_VERSION,
    HISTORY_LIMIT,
    DEFAULT_DRIVER,
    multiplierFor,
    raceAward,
    qualifyingAward,
    QUALI_POINTS,
    cupAward,
    rateRace,
    tierFor,
    createCareer,
  };
  // In the page, Career.recordRace etc. work straight away on localStorage.
  if (typeof root.document !== "undefined") Object.assign(api, createCareer({ storage: browserStorage() }));
  return api;
}));
