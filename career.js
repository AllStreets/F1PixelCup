// Career scoring and the saved player profile.
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
    return TIERS.find(([floor]) => rating >= floor)[1];
  }

  // ---------------------------------------------------------------------------
  // The saved profile. One JSON document under one key, read fresh before every
  // record (so a second tab's progress is never overwritten) and written whole
  // in one setItem (so a crash cannot leave half a profile).
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = "f1pixelcup.profile";
  const BACKUP_PREFIX = "f1pixelcup.profile.backup.";
  const PROFILE_VERSION = 1;
  const HISTORY_LIMIT = 5000;

  function defaultUuid() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    const part = () => Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${part()}-${part()}`;
  }

  function freshProfile(at, uuid) {
    return {
      version: PROFILE_VERSION,
      profileId: uuid(),
      createdAt: at,
      updatedAt: at,
      careerPoints: 0,
      rating: START_RATING,
      ratedRaces: 0,
      totals: { races: 0, wins: 0, podiums: 0, cupsCompleted: 0, cupsWon: 0 },
      bestLaps: {},
      history: [],
    };
  }

  const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

  // A save this version of the game understands.
  function recognised(raw) {
    return Boolean(raw) && typeof raw === "object" && !Array.isArray(raw)
      && isNumber(raw.version) && raw.version >= 1 && raw.version <= PROFILE_VERSION;
  }

  // Fill in anything an older or partial save lacks, keeping what it has.
  // Future format changes add their upgrade steps here, keyed on raw.version.
  function upgrade(raw, at, uuid) {
    const base = freshProfile(at, uuid);
    return {
      ...base,
      ...raw,
      version: PROFILE_VERSION,
      totals: { ...base.totals, ...(raw.totals || {}) },
      bestLaps: { ...(raw.bestLaps || {}) },
      history: Array.isArray(raw.history) ? raw.history : [],
    };
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function createCareer({ storage = null, now = () => new Date(), uuid = defaultUuid } = {}) {
    // Used when storage is missing or throws, so a session still adds up.
    let memory = null;

    function write(profile) {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(profile));
        return true;
      } catch (error) {
        return false;
      }
    }

    function read() {
      const at = now().toISOString();
      let raw;
      try {
        raw = storage ? storage.getItem(STORAGE_KEY) : null;
      } catch (error) {
        memory = memory || freshProfile(at, uuid);
        return memory;
      }
      if (raw === null || raw === undefined) {
        memory = memory || freshProfile(at, uuid);
        return memory;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        parsed = null;
      }
      if (!recognised(parsed)) {
        // Never throw a save away: keep it under a backup key, then start over.
        try {
          storage.setItem(`${BACKUP_PREFIX}${Date.parse(at)}`, raw);
        } catch (error) {
          // A fresh profile is still better than none.
        }
        memory = freshProfile(at, uuid);
        write(memory);
        return memory;
      }
      memory = upgrade(parsed, at, uuid);
      return memory;
    }

    function commit(profile) {
      profile.updatedAt = now().toISOString();
      if (profile.history.length > HISTORY_LIMIT) {
        profile.history = profile.history.slice(-HISTORY_LIMIT);
      }
      memory = profile;
      return write(profile);
    }

    function recordRace(result) {
      const profile = read();
      const at = now().toISOString();
      const award = raceAward(result);
      const rating = rateRace({
        rating: profile.rating,
        ratedRaces: profile.ratedRaces,
        position: result.position,
        fieldSize: result.fieldSize,
        difficulty: result.difficulty,
      });
      const lap = isNumber(result.bestLapMs) && result.bestLapMs > 0 ? result.bestLapMs : null;

      profile.careerPoints += award.careerPoints;
      profile.rating = rating.after;
      profile.ratedRaces += 1;
      profile.totals.races += 1;
      if (result.position === 1) profile.totals.wins += 1;
      if (result.position >= 1 && result.position <= 3) profile.totals.podiums += 1;

      let newBestLap = null;
      if (lap !== null) {
        const previous = profile.bestLaps[result.trackId];
        if (!previous || lap < previous.ms) {
          profile.bestLaps[result.trackId] = {
            ms: lap, at, difficulty: result.difficulty, driverId: result.driverId, teamId: result.teamId,
          };
          newBestLap = { trackId: result.trackId, ms: lap, previousMs: previous ? previous.ms : null };
        }
      }

      profile.history.push({
        id: uuid(),
        type: "race",
        at,
        cupId: result.cupId,
        cupRunId: result.cupRunId,
        raceIndex: result.raceIndex,
        trackId: result.trackId,
        difficulty: result.difficulty,
        driverId: result.driverId,
        teamId: result.teamId,
        position: result.position,
        fieldSize: result.fieldSize,
        bestLapMs: lap,
        fastestLap: Boolean(result.fastestLap),
        racePoints: award.racePoints,
        careerPointsEarned: award.careerPoints,
        ratingBefore: rating.before,
        ratingAfter: rating.after,
      });

      const saved = commit(profile);
      return {
        racePoints: award.racePoints,
        multiplier: award.multiplier,
        careerPoints: award.careerPoints,
        careerTotal: profile.careerPoints,
        rating: { before: rating.before, after: rating.after, delta: rating.delta },
        tier: tierFor(rating.after),
        newBestLap,
        saved,
      };
    }

    function recordCup(result) {
      const profile = read();
      const award = cupAward(result);
      const existing = result.cupRunId
        && profile.history.find((entry) => entry.type === "cup" && entry.cupRunId === result.cupRunId);
      if (existing) {
        return {
          bonus: award.bonus,
          multiplier: award.multiplier,
          careerPoints: existing.careerPointsEarned,
          careerTotal: profile.careerPoints,
          alreadyRecorded: true,
          saved: true,
        };
      }
      profile.careerPoints += award.careerPoints;
      profile.totals.cupsCompleted += 1;
      if (result.position === 1) profile.totals.cupsWon += 1;
      profile.history.push({
        id: uuid(),
        type: "cup",
        at: now().toISOString(),
        cupId: result.cupId,
        cupRunId: result.cupRunId,
        difficulty: result.difficulty,
        position: result.position,
        cupPoints: result.cupPoints,
        careerPointsEarned: award.careerPoints,
      });
      const saved = commit(profile);
      return {
        bonus: award.bonus,
        multiplier: award.multiplier,
        careerPoints: award.careerPoints,
        careerTotal: profile.careerPoints,
        alreadyRecorded: false,
        saved,
      };
    }

    return {
      recordRace,
      recordCup,
      getProfile: () => clone(read()),
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
    multiplierFor,
    raceAward,
    cupAward,
    rateRace,
    tierFor,
    createCareer,
  };
  // In the page, Career.recordRace etc. work straight away on localStorage.
  if (typeof root.document !== "undefined") Object.assign(api, createCareer({ storage: browserStorage() }));
  return api;
}));
