// Starting grids and qualifying: who lines up where. (What qualifying is worth
// to a career lives in career.js, with the rest of the scoring.) Pure rules;
// in the page this defines window.Grid, in Node it is require()-able.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Grid = api;
}(typeof self !== "undefined" ? self : this, function () {
  function shuffled(ids, rng) {
    const copy = [...ids];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Mario Kart style: the player starts at the back. The CPU cars line up by
  // cup standings (leader on pole); ties, and the first race of a cup, are
  // settled by a draw.
  function gridFromBack({ playerId, aiIds, standings = {}, rng = Math.random }) {
    const drawn = shuffled(aiIds, rng);
    const order = drawn
      .map((id, draw) => ({ id, points: standings[id] || 0, draw }))
      .sort((a, b) => b.points - a.points || a.draw - b.draw)
      .map((entry) => entry.id);
    return [...order, playerId];
  }

  // The grid is the qualifying classification. A car without a valid time
  // lines up behind every car with one, in the order given.
  function gridFromQualifying(times) {
    const valid = (t) => Number.isFinite(t) && t > 0;
    return times
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => {
        const va = valid(a.timeMs);
        const vb = valid(b.timeMs);
        if (va && vb) return a.timeMs - b.timeMs || a.index - b.index;
        if (va !== vb) return va ? -1 : 1;
        return a.index - b.index;
      })
      .map((entry) => entry.id);
  }

  // How far behind (positive) or ahead (negative) of pole the player is at a
  // timing point, in ms; null until both have a time there.
  function qualifyingDelta(playerSplits, poleSplits, index) {
    const mine = playerSplits && playerSplits[index];
    const pole = poleSplits && poleSplits[index];
    if (!Number.isFinite(mine) || !Number.isFinite(pole)) return null;
    return mine - pole;
  }

  return { gridFromBack, gridFromQualifying, qualifyingDelta };
}));
