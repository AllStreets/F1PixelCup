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

  return {
    START_RATING,
    DIFFICULTY_NAMES,
    multiplierFor,
    raceAward,
    cupAward,
    rateRace,
    tierFor,
  };
}));
