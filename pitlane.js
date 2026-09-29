// The pit lane (docs/superpowers/specs/2026-09-29-trackside-design.md, G1).
// Pure geometry, shared by the physics (game.js: the safety car's way in), the
// renderer (r3d/track.js, r3d/landmarks.js) and the tests. In the page it
// defines window.Pit; in Node it is require()-able.
//
// The track data gives { side, entry, exit }: which side of the road (+1 or -1
// along the normal n = (-ty, tx)), and where the lane leaves and rejoins the
// road, as signed distances from the start line. Everything else follows from
// the road's half-width W:
//
//   W + 8 .. W + 11   the pit wall
//   W + 11 .. W + 47  the fast lane (centre W + 29)
//   W + 47 .. W + 59  the working lane, in front of the garages
//   W + 59 .. W + 95  the garages
//
// Over the first and last MOUTH of the zone the lane eases between the road's
// edge (W - 6) and its centre line on a smoothstep.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Pit = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // Offsets beyond the road's half-width. tools/tracks/build_tracks.py has the
  // same numbers; tests/pitlane.test.js checks they agree.
  const WALL_IN = 8;
  const WALL_OUT = 11;
  const LANE_CENTRE = 29;
  const LANE_HALF = 18;
  const WORK_OUT = 59;
  const GARAGE_OUT = 95;
  const EDGE_IN = 6;
  const MOUTH = 160;
  // Ten teams and the Safety Car, 30 apart.
  const BAY = 30;
  const BAYS = 11;

  const smooth = (t) => t * t * (3 - 2 * t);

  function lane(pit, total, halfWidth) {
    if (!pit || !(total > 0)) return null;
    const { side, entry, exit } = pit;
    const W = halfWidth;
    // Signed distance from the line, in (-total/2, total/2].
    const rel = (d) => {
      let r = ((d % total) + total) % total;
      if (r > total / 2) r -= total;
      return r;
    };
    const inZone = (d) => {
      const r = rel(d);
      return r >= entry && r <= exit;
    };
    // 0 at the mouths, 1 along the flat middle.
    const blend = (d) => {
      const r = rel(d);
      if (r < entry || r > exit) return 0;
      return smooth(Math.min(1, (r - entry) / MOUTH, (exit - r) / MOUTH));
    };
    const flatFrom = entry + MOUTH;
    const flatTo = exit - MOUTH;
    const edge = W - EDGE_IN;
    const centre = W + LANE_CENTRE;
    // The lane centre's offset from the centreline (signed), or null.
    const latAt = (d) => (inZone(d) ? side * (edge + (centre - edge) * blend(d)) : null);
    // The pit wall's inner face, only where the lane has cleared it.
    const wallAt = (d) => {
      const lat = latAt(d);
      return lat !== null && Math.abs(lat) - LANE_HALF >= W + WALL_OUT ? side * (W + WALL_IN) : null;
    };
    // How far out the circuit reaches on the pit side (unsigned), or null.
    const outerAt = (d) => {
      const lat = latAt(d);
      if (lat === null) return null;
      return Math.abs(lat) + LANE_HALF + (WORK_OUT - LANE_CENTRE - LANE_HALF) * blend(d);
    };
    // The garages: along the flat middle, the Safety Car's bay nearest the exit.
    const garageFrom = flatFrom + Math.max(0, (flatTo - flatFrom - BAY * BAYS) / 2);
    const bays = Array.from({ length: BAYS }, (_, i) => ({
      index: i,
      safetyCar: i === BAYS - 1,
      d: ((garageFrom + BAY * (i + 0.5)) % total + total) % total,
    }));
    return {
      side, entry, exit, length: exit - entry, flatFrom, flatTo,
      rel, inZone, blend, latAt, wallAt, outerAt,
      garages: { from: garageFrom, to: garageFrom + BAY * BAYS, inner: W + WORK_OUT, outer: W + GARAGE_OUT, bays },
      laneHalf: LANE_HALF,
      workOut: W + WORK_OUT,
    };
  }

  return { WALL_IN, WALL_OUT, LANE_CENTRE, LANE_HALF, WORK_OUT, GARAGE_OUT, EDGE_IN, MOUTH, BAY, BAYS, lane };
}));
