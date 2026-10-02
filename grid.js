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
  // settled by a draw. Two players share the last row, the one higher in the
  // standings first (player 1 on a tie).
  function gridFromBack({ playerId, playerIds, aiIds, standings = {}, rng = Math.random }) {
    const drawn = shuffled(aiIds, rng);
    const order = drawn
      .map((id, draw) => ({ id, points: standings[id] || 0, draw }))
      .sort((a, b) => b.points - a.points || a.draw - b.draw)
      .map((entry) => entry.id);
    const humans = (playerIds || [playerId])
      .map((id, index) => ({ id, points: standings[id] || 0, index }))
      .sort((a, b) => b.points - a.points || a.index - b.index)
      .map((entry) => entry.id);
    return [...order, ...humans];
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

  // The start zone: the grid (20 cars, 36 apart in pairs, the first row 12
  // behind the line, so the last row 336 back), with a wide margin, plus the
  // launch just after the line. No item box may sit in it: the field would
  // start on top of them. (Boxes are hidden in qualifying, so the qualifying
  // roll-in from 580 back never meets one; the margin covers it anyway, so
  // the run-up looks clear too.)
  const START_ZONE_BEFORE = 640;
  const START_ZONE_AFTER = 160;

  // d is a distance round the lap from the start line, totalLength the lap.
  function inStartZone(d, totalLength) {
    const lap = ((d % totalLength) + totalLength) % totalLength;
    return lap < START_ZONE_AFTER || lap > totalLength - START_ZONE_BEFORE;
  }

  // Belt and braces for the circuit data: boxes carry d, their distance round
  // the lap; any in the start zone are left out.
  function boxesClearOfStart(boxes, totalLength) {
    return boxes.filter((box) => !inStartZone(box.d, totalLength));
  }

  return {
    gridFromBack, gridFromQualifying, qualifyingDelta,
    START_ZONE_BEFORE, START_ZONE_AFTER, inStartZone, boxesClearOfStart,
  };
}));
