// Power-up rules: which item a box gives, and the limits on the strongest ones.
// Pure logic, no drawing. In the page this defines window.PowerUps; in Node it
// is require()-able for the tests. The odds follow Mario Kart 8 Deluxe: the
// column you roll from is set by how far you are behind the leader, the weakest
// items are the most common and the strongest are the rarest.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PowerUps = api;
}(typeof self !== "undefined" ? self : this, function () {
  // Common to rare. Also the order a blocked roll moves along, and the order
  // the site shows the cards in.
  const ITEM_ORDER = ["oilSlick", "debris", "drs", "undercut", "overtakeMode", "stewardPenalty", "formationLap", "safetyCar"];
  const COLUMNS = ["lead", "front", "mid", "back", "tail"];

  const table = {
    oilSlick: [55, 35, 20, 10, 5],
    debris: [35, 30, 20, 10, 5],
    drs: [10, 15, 20, 20, 20],
    undercut: [0, 20, 25, 15, 10],
    overtakeMode: [0, 0, 10, 18, 20],
    stewardPenalty: [0, 0, 5, 12, 13],
    formationLap: [0, 0, 0, 10, 18],
    safetyCar: [0, 0, 0, 5, 9],
  };
  const ODDS = Object.fromEntries(COLUMNS.map((col, c) => [col, Object.fromEntries(ITEM_ORDER.map((id) => [id, table[id][c]]))]));

  // Seconds of race time.
  const LIMITS = { strongItemsAfter: 15, safetyCarAfter: 20, safetyCarCooldown: 30 };
  const STRONG = ["stewardPenalty", "formationLap", "safetyCar"];

  function columnFor(gapFraction, isLeader) {
    if (isLeader) return "lead";
    const gap = Math.max(0, gapFraction || 0);
    if (gap < 0.06) return "front";
    if (gap < 0.16) return "mid";
    if (gap < 0.30) return "back";
    return "tail";
  }

  function isBlocked(id, { raceTime = 0, lastSafetyCarAt = null, stewardInFlight = false } = {}) {
    if (STRONG.includes(id) && raceTime < LIMITS.strongItemsAfter) return true;
    if (id === "safetyCar") {
      if (raceTime < LIMITS.safetyCarAfter) return true;
      if (lastSafetyCarAt !== null && lastSafetyCarAt !== undefined && raceTime - lastSafetyCarAt < LIMITS.safetyCarCooldown) return true;
    }
    if (id === "stewardPenalty" && stewardInFlight) return true;
    return false;
  }

  function rollItem({ gapFraction = 0, isLeader = false, raceTime = 0, lastSafetyCarAt = null, stewardInFlight = false, rng = Math.random } = {}) {
    const odds = ODDS[columnFor(gapFraction, isLeader)];
    const live = ITEM_ORDER.filter((id) => odds[id] > 0);
    let r = Math.min(Math.max(rng(), 0), 0.999999999) * 100;
    let pick = live[live.length - 1];
    for (const id of live) {
      r -= odds[id];
      if (r < 0) { pick = id; break; }
    }
    const ctx = { raceTime, lastSafetyCarAt, stewardInFlight };
    const start = ITEM_ORDER.indexOf(pick);
    for (let k = 0; k < ITEM_ORDER.length; k += 1) {
      const id = ITEM_ORDER[(start + k) % ITEM_ORDER.length];
      if (odds[id] > 0 && !isBlocked(id, ctx)) return id;
    }
    return "oilSlick";
  }

  function overallShares(spread = { lead: 1, front: 4, mid: 5, back: 5, tail: 5 }) {
    const cars = COLUMNS.reduce((s, col) => s + (spread[col] || 0), 0) || 1;
    return Object.fromEntries(ITEM_ORDER.map((id) => [id,
      COLUMNS.reduce((s, col) => s + (spread[col] || 0) * ODDS[col][id], 0) / cars]));
  }

  function rarityFor(share) {
    if (share >= 15) return "Common";
    if (share >= 10) return "Uncommon";
    if (share >= 5) return "Rare";
    return "Very rare";
  }

  return { ITEM_ORDER, COLUMNS, ODDS, LIMITS, columnFor, isBlocked, rollItem, overallShares, rarityFor };
}));
