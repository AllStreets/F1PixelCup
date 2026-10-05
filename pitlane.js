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
//   W + 63 .. W + 95  the garages (their fronts 4 back from the working lane,
//                     so a straight bay on a curving lane never reaches it;
//                     W + 83 at the back where only shallow ones fit)
//
// Over the first and last MOUTH of the zone the lane eases between the road's
// edge (W - 6) and its centre line on a smoothstep. The track data places the
// eleven bays (`bays`, signed distances from the line) where there is room.
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
  const GARAGE_OUT_SHALLOW = 83;
  const GARAGE_FRONT = 4;
  // How far the pit complex keeps from any other stretch's road edge (past
  // its run-off and barrier): circuits, and the street circuits.
  const CLEAR = 46;
  const CLEAR_STREET = 22;
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
    // (A distance already in that range comes back exactly: the lane's own
    // entry and exit are in it, never a rounding error outside.)
    const rel = (d) => {
      let r = d % total;
      if (r > total / 2) r -= total;
      else if (r <= -total / 2) r += total;
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
    // The garages: where the track data put them, else one run across the
    // middle of the flat part. The Safety Car's bay is the last, nearest the exit.
    const centred = flatFrom + Math.max(0, (flatTo - flatFrom - BAY * BAYS) / 2);
    const at = pit.bays || Array.from({ length: BAYS }, (_, i) => centred + BAY * (i + 0.5));
    const bays = at.map((r, i) => ({ index: i, safetyCar: i === at.length - 1, rel: r, d: ((r % total) + total) % total }));
    // Whether a lap distance is in front of a garage (within `pad` of one).
    const atGarage = (d, pad = 0) => {
      const r = rel(d);
      return bays.some((b) => Math.abs(r - b.rel) <= BAY / 2 + pad);
    };
    return {
      side, entry, exit, length: exit - entry, flatFrom, flatTo, halfWidth: W,
      rel, inZone, blend, latAt, wallAt, outerAt, atGarage,
      garages: { inner: W + WORK_OUT, front: W + WORK_OUT + GARAGE_FRONT, outer: W + (pit.garageOut || GARAGE_OUT), bays },
      laneHalf: LANE_HALF,
      workOut: W + WORK_OUT,
    };
  }

  // Where the Safety Car drives on its way in (game.js): along the road's edge
  // on the pit side until the entry, then down the lane, easing into the
  // working lane over the last 80 before its bay, where it parks. `entered`
  // is whether it has already turned in; `lat` is where it is across the road.
  // It turns in only from the road's edge (it can't swerve across): one
  // inside the zone that never took the entry goes round again.
  // Returns { lat, inLane, park }.
  const TURN_IN = 20;
  const EASE = 80;
  function wayIn(lane, d, entered, lat) {
    const W = lane.halfWidth;
    const side = lane.side;
    const r = lane.rel(d);
    // On the edge itself, not still closing on it (a jump onto the lane's line).
    const atEdge = Math.abs(lat - side * (W - EDGE_IN)) <= 0.5;
    const takingEntry = atEdge && r >= lane.entry && r <= lane.entry + TURN_IN;
    if (!entered && !takingEntry) return { lat: side * (W - EDGE_IN), inLane: false, park: false };
    const { lat: park, rel: bay } = parkAt(lane);
    if (r >= bay) return { lat: park, inLane: true, park: true };
    const inLane = lane.latAt(d);
    const t = Math.max(0, Math.min(1, (r - (bay - EASE)) / EASE));
    return { lat: inLane + (park - inLane) * smooth(t), inLane: true, park: false };
  }

  // Where the Safety Car parks: across the working lane, in front of its bay
  // (the last, nearest the exit).
  function parkAt(lane) {
    const W = lane.halfWidth;
    const bay = lane.garages.bays[lane.garages.bays.length - 1];
    return { d: bay.d, rel: bay.rel, lat: lane.side * (W + (LANE_CENTRE + LANE_HALF + WORK_OUT) / 2) };
  }

  // Its way out, called again (game.js): from its bay, easing out of the
  // working lane into the lane over the first 80, down the lane to the exit,
  // where the lane itself brings it back to the road's edge on the pit side.
  // Every step derived from the lane, so it can't leave it. Returns
  // { lat, onRoad }: onRoad once it is on the road's edge (at the exit).
  function wayOut(lane, d) {
    const W = lane.halfWidth;
    const edge = lane.side * (W - EDGE_IN);
    const park = parkAt(lane);
    const r = lane.rel(d);
    if (r < park.rel) return { lat: park.lat, onRoad: false };
    const inLane = lane.latAt(d);
    if (inLane === null || r >= lane.exit) return { lat: edge, onRoad: true };
    const t = Math.max(0, Math.min(1, (r - park.rel) / EASE));
    const lat = park.lat + (inLane - park.lat) * smooth(t);
    return { lat, onRoad: Math.abs(lat - edge) < 1e-6 };
  }

  return { WALL_IN, WALL_OUT, LANE_CENTRE, LANE_HALF, WORK_OUT, GARAGE_OUT, GARAGE_OUT_SHALLOW, GARAGE_FRONT, CLEAR, CLEAR_STREET, EDGE_IN, MOUTH, BAY, BAYS, lane, wayIn, wayOut, parkAt };
}));
