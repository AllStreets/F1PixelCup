// Power-up rules: which item a box gives, and the limits on the strongest ones.
// Pure logic, no drawing. In the page this defines window.PowerUps; in Node it
// is require()-able for the tests. The odds follow Mario Kart 8 Deluxe: the
// column you roll from is set by your place, or by how far you are behind the
// leader if that is further back; the weakest items are the most common and
// the strongest are the rarest
// (docs/superpowers/specs/2026-10-05-balance-design.md).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PowerUps = api;
}(typeof self !== "undefined" ? self : this, function () {
  // Common to rare. Also the order a blocked roll moves back down, and the
  // order the site shows the cards in.
  const ITEM_ORDER = ["drs", "oilSlick", "debris", "undercut", "overtakeMode", "formationLap", "stewardPenalty", "safetyCar"];
  const COLUMNS = ["lead", "front", "mid", "back", "tail"];

  // The back of the field rolls the fast items (DRS, Overtake Mode, the
  // Formation Lap) most: they are what gets a car past the others.
  const table = {
    drs: [10, 15, 24, 30, 33],
    oilSlick: [55, 40, 25, 5, 0],
    debris: [35, 33, 15, 8, 4],
    undercut: [0, 12, 20, 16, 12],
    overtakeMode: [0, 0, 12, 20, 24],
    formationLap: [0, 0, 2, 10, 16],
    stewardPenalty: [0, 0, 2, 6, 6],
    safetyCar: [0, 0, 0, 5, 5],
  };
  const ODDS = Object.fromEntries(COLUMNS.map((col, c) => [col, Object.fromEntries(ITEM_ORDER.map((id) => [id, table[id][c]]))]));

  // Seconds of race time.
  const LIMITS = { strongItemsAfter: 15, safetyCarAfter: 20, safetyCarCooldown: 30 };
  const STRONG = ["stewardPenalty", "formationLap", "safetyCar"];

  // By place, the field is cut in quarters behind the leader (20 cars:
  // P2-P5 front, P6-P10 mid, P11-P15 back, P16-P20 tail). By the gap, it is
  // the share of a lap behind the leader. A bunched field and a strung-out one
  // both give the cars at the back the back's odds.
  function columnByGap(gapFraction) {
    const gap = Math.max(0, gapFraction || 0);
    if (gap < 0.06) return "front";
    if (gap < 0.16) return "mid";
    if (gap < 0.30) return "back";
    return "tail";
  }

  function columnByPlace(place, field) {
    if (!(place > 1 && field > 1)) return "front";
    const share = place / field;
    if (share <= 0.25) return "front";
    if (share <= 0.5) return "mid";
    if (share <= 0.75) return "back";
    return "tail";
  }

  function columnFor(gapFraction, isLeader, place = 0, field = 0) {
    if (isLeader) return "lead";
    const byGap = columnByGap(gapFraction);
    const byPlace = columnByPlace(place, field);
    return COLUMNS.indexOf(byPlace) > COLUMNS.indexOf(byGap) ? byPlace : byGap;
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

  function rollItem({ gapFraction = 0, isLeader = false, place = 0, field = 0, raceTime = 0, lastSafetyCarAt = null, stewardInFlight = false, rng = Math.random } = {}) {
    const odds = ODDS[columnFor(gapFraction, isLeader, place, field)];
    const live = ITEM_ORDER.filter((id) => odds[id] > 0);
    let r = Math.min(Math.max(rng(), 0), 0.999999999) * 100;
    let pick = live[live.length - 1];
    for (const id of live) {
      r -= odds[id];
      if (r < 0) { pick = id; break; }
    }
    const ctx = { raceTime, lastSafetyCarAt, stewardInFlight };
    // Held back, it moves down to the next commoner item the column allows
    // (never up to a rarer, stronger one).
    for (let i = ITEM_ORDER.indexOf(pick); i >= 0; i -= 1) {
      const id = ITEM_ORDER[i];
      if (odds[id] > 0 && !isBlocked(id, ctx)) return id;
    }
    return ITEM_ORDER[0];
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

  // ---------------------------------------------------------------------------
  // Track coordinates. Shots, oil and the safety car live at a distance round
  // the lap (d) and a side offset from the centreline (lat), so they follow the
  // road through every corner, can never cross a barrier, and never meet a car
  // on the other level of a bridge (the two levels are far apart in d).
  // ---------------------------------------------------------------------------

  const CAR_LENGTH = 26;
  const CAR_WIDTH = 16;
  const SHOT_EDGE = 8;
  const LAT_HOMING = 120;
  const TRAIL_GAP = 28;
  const DROP_GAP = 18;
  const SHOT_SPEEDS = { undercut: 1.6, stewardPenalty: 1.6, debris: 1.45 };
  // drsKick: the share of top speed DRS adds at once (the mushroom's burst).
  const FACTORS = { boost: 1.22, drsKick: 0.2, overtakeMode: 1.2, formationLap: 1.5, safetyCar: 0.55 };
  // How long each hit spins a car, and the share of its speed it keeps. The
  // Steward Penalty (the blue shell) is the heaviest of all: the leader all but
  // stops. The Oil Slick (the banana) is a short spin.
  const SPIN_MS = { undercut: 1100, debris: 1000, oilSlick: 850, stewardLeader: 2600, stewardSplash: 1200, contact: 650 };
  const SPIN_KEEP = { undercut: 0.45, debris: 0.5, oilSlick: 0.65, stewardLeader: 0.08, stewardSplash: 0.4, contact: 0.7 };
  const TIMINGS = {
    rouletteMs: 1100, boxHiddenMs: 1000, armMs: 300, oilArmMs: 1000, oilLifeMs: 30000,
    drsMs: 3000, drsStraightMs: 4500, overtakeModeMs: 8000, formationLapMs: 6000,
    // A Formation Lap ends only once the car is clear of every other car;
    // this long at most past its time, it ends wherever it is.
    formationGraceMs: 2000,
    safetyCarMs: 7000, safetyCarLeaveMs: 2000, trailHoldMs: 200, aiTrailMs: 6000, aiHoldMs: 8000,
    // A Steward Penalty has no time limit: it ends on the leader, or when nobody is left racing.
    lifeMs: { undercut: 12000, debris: 8000, stewardPenalty: Infinity },
  };
  const STRAIGHT_SPAN = 120;
  const STRAIGHT_TURN = 0.12;

  function makeRoute(points, halfWidth) {
    const n = points.length;
    const starts = [];
    const segs = [];
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      starts.push(total);
      segs.push({ a, b, dx, dy, len });
      total += len;
    }
    function locate(d) {
      const w = ((d % total) + total) % total;
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= w) lo = mid; else hi = mid - 1;
      }
      const s = segs[lo];
      return { s, t: s.len ? (w - starts[lo]) / s.len : 0 };
    }
    function sample(d) {
      const { s, t } = locate(d);
      const l = s.len || 1;
      const tx = s.dx / l;
      const ty = s.dy / l;
      return { x: s.a.x + s.dx * t, y: s.a.y + s.dy * t, tx, ty, nx: -ty, ny: tx };
    }
    return {
      length: total,
      // Where the track data narrows the road (a point's `w`, its share of
      // the usual width), in between its points.
      halfWidthAt(d) {
        const { s, t } = locate(d);
        return halfWidth * ((s.a.w ?? 1) * (1 - t) + (s.b.w ?? 1) * t);
      },
      sample,
      toWorld(d, lat) {
        const s = sample(d);
        return { x: s.x + s.nx * lat, y: s.y + s.ny * lat, heading: Math.atan2(s.ty, s.tx) };
      },
      headingAt(d) {
        const s = sample(d);
        return Math.atan2(s.ty, s.tx);
      },
    };
  }

  function wrapDelta(a, b, lapLength) {
    let d = (a - b) % lapLength;
    if (d > lapLength / 2) d -= lapLength;
    if (d < -lapLength / 2) d += lapLength;
    return d;
  }

  function angleBetween(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  function isStraight(route, d) {
    const h0 = route.headingAt(d);
    for (let k = 20; k <= STRAIGHT_SPAN; k += 20) {
      if (Math.abs(angleBetween(route.headingAt(d + k), h0)) >= STRAIGHT_TURN) return false;
    }
    return true;
  }

  function advanceShot(shot, dt, route) {
    const L = route.length;
    shot.age = (shot.age || 0) + dt;
    shot.d = (((shot.d + shot.speed * dt) % L) + L) % L;
    const limit = route.halfWidthAt(shot.d) - SHOT_EDGE;
    const homing = shot.type === "undercut" && shot.targetId;
    if (homing || shot.type === "stewardPenalty") {
      const aim = homing ? shot.targetLat : 0;
      const step = LAT_HOMING * dt;
      shot.lat += Math.max(-step, Math.min(step, aim - shot.lat));
    } else {
      shot.lat += (shot.latVel || 0) * dt;
      // Reflect off the edge; a loop because a huge dt could cross it twice.
      for (let i = 0; i < 4 && Math.abs(shot.lat) > limit; i += 1) {
        shot.lat = Math.sign(shot.lat) * (2 * limit - Math.abs(shot.lat));
        shot.latVel = -(shot.latVel || 0);
        shot.bounces = (shot.bounces || 0) + 1;
        shot.bouncedAt = shot.age;
      }
    }
    shot.lat = Math.max(-limit, Math.min(limit, shot.lat));
    return shot;
  }

  function shotHits(shot, body, lapLength) {
    return Math.abs(wrapDelta(body.d, shot.d, lapLength)) < CAR_LENGTH
      && Math.abs((body.lat || 0) - (shot.lat || 0)) < CAR_WIDTH;
  }

  // Arming only protects the car that fired (and its own trailed oil): a car
  // right in front is hit at once, as a Mario Kart shell would.
  function firstHit(shot, bodies, lapLength, nowMs) {
    const armed = nowMs >= (shot.armedAt || 0);
    let best = null;
    let bestGap = Infinity;
    for (const b of bodies) {
      const own = b.id === shot.ownerId || b.ownerId === shot.ownerId;
      if (own && (shot.type === "undercut" || !armed)) continue;
      if (!shotHits(shot, b, lapLength)) continue;
      const gap = Math.abs(wrapDelta(b.d, shot.d, lapLength));
      if (gap < bestGap) { best = b; bestGap = gap; }
    }
    return best;
  }

  function stewardVictims(shot, bodies, lapLength, nowMs) {
    if (nowMs < (shot.armedAt || 0)) return [];
    const target = bodies.find((b) => b.id === shot.targetId && !b.isTrail);
    if (!target) return [];
    if (Math.abs(wrapDelta(target.d, shot.d, lapLength)) >= CAR_LENGTH) return [];
    const splash = bodies.filter((b) => b !== target && !b.isTrail
      && Math.abs(wrapDelta(b.d, target.d, lapLength)) < CAR_LENGTH
      && Math.abs((b.lat || 0) - (target.lat || 0)) < CAR_WIDTH);
    return [target.id, ...splash.map((b) => b.id)];
  }

  // singleFile: behind the safety car the queue is single file, so a car
  // across the road still counts as the car ahead.
  function holdStationSpeed(body, others, lapLength, { singleFile = false } = {}) {
    let cap = Infinity;
    for (const o of others) {
      if (o.id === body.id) continue;
      const ahead = wrapDelta(o.d, body.d, lapLength);
      const inLane = singleFile || Math.abs((o.lat || 0) - (body.lat || 0)) < CAR_WIDTH * 1.5;
      if (ahead > 0 && ahead < CAR_LENGTH * 1.5 && inLane) {
        cap = Math.min(cap, Math.max(0, o.speed || 0));
      }
    }
    return cap;
  }

  // Two cars touch when their footprints overlap (along and across are the
  // one's offset from the other, in track coordinates). The way they overlap
  // least is the way they met: wheel to wheel ("side") or nose to tail ("rear").
  function contactKind(along, across) {
    const deepAlong = CAR_LENGTH - Math.abs(along);
    const deepAcross = CAR_WIDTH - Math.abs(across);
    if (deepAlong <= 0 || deepAcross <= 0) return null;
    return deepAcross < deepAlong ? "side" : "rear";
  }

  // Whether a car can come off a Formation Lap here: no other car on top of
  // it or right in front of or behind it in its lane.
  function formationClear(body, others, lapLength) {
    return !others.some((o) => o.id !== body.id
      && Math.abs(wrapDelta(o.d, body.d, lapLength)) < CAR_LENGTH * 1.25
      && Math.abs((o.lat || 0) - (body.lat || 0)) < CAR_WIDTH * 1.25);
  }

  function nearestGaps(body, bodies, lapLength) {
    let ahead = null;
    let behind = null;
    for (const o of bodies) {
      if (o.id === body.id) continue;
      const delta = wrapDelta(o.d, body.d, lapLength);
      if (delta > 0 && (ahead === null || delta < ahead)) ahead = delta;
      if (delta < 0 && (behind === null || -delta < behind)) behind = -delta;
    }
    return { ahead, behind };
  }

  return {
    ITEM_ORDER, COLUMNS, ODDS, LIMITS, columnFor, isBlocked, rollItem, overallShares, rarityFor,
    CAR_LENGTH, CAR_WIDTH, SHOT_EDGE, LAT_HOMING, TRAIL_GAP, DROP_GAP, SHOT_SPEEDS, FACTORS, SPIN_MS, SPIN_KEEP, TIMINGS,
    makeRoute, wrapDelta, isStraight, advanceShot, shotHits, firstHit, stewardVictims, holdStationSpeed, nearestGaps,
    contactKind, formationClear,
  };
}));
