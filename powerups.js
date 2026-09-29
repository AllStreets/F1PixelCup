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

  // ---------------------------------------------------------------------------
  // Track coordinates. Shots, oil and the safety car live at a distance round
  // the lap (d) and a side offset from the centreline (lat), so they follow the
  // road through every corner, can never cross a barrier, and never meet a car
  // on the other level of a bridge (the two levels are far apart in d).
  // ---------------------------------------------------------------------------

  const CAR_LENGTH = 26;
  const CAR_WIDTH = 16;
  const SHOT_EDGE = 8;
  const LAT_HOMING = 90;
  const TRAIL_GAP = 14;
  const DROP_GAP = 18;
  const SHOT_SPEEDS = { undercut: 1.35, stewardPenalty: 1.6, debris: 1.2 };
  const FACTORS = { boost: 1.22, overtakeMode: 1.10, formationLap: 1.42, safetyCar: 0.55 };
  const SPIN_MS = { undercut: 850, debris: 850, oilSlick: 820, stewardLeader: 1600, stewardSplash: 1000, contact: 700 };
  const TIMINGS = {
    rouletteMs: 1100, boxHiddenMs: 3000, armMs: 300, oilArmMs: 1000, oilLifeMs: 20000,
    drsMs: 2000, drsStraightMs: 3000, overtakeModeMs: 5000, formationLapMs: 4000,
    safetyCarMs: 5000, safetyCarLeaveMs: 2000, trailHoldMs: 200, aiTrailMs: 6000, aiHoldMs: 8000,
    lifeMs: { undercut: 12000, debris: 6000, stewardPenalty: 30000 },
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
      segs.push({ a, dx, dy, len });
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
      halfWidthAt: () => halfWidth,
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

  function firstHit(shot, bodies, lapLength, nowMs) {
    if (nowMs < (shot.armedAt || 0)) return null;
    let best = null;
    let bestGap = Infinity;
    for (const b of bodies) {
      if (shot.type === "undercut" && (b.id === shot.ownerId || b.ownerId === shot.ownerId)) continue;
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

  function holdStationSpeed(body, others, lapLength) {
    let cap = Infinity;
    for (const o of others) {
      if (o.id === body.id) continue;
      const ahead = wrapDelta(o.d, body.d, lapLength);
      if (ahead > 0 && ahead < CAR_LENGTH * 1.5 && Math.abs((o.lat || 0) - (body.lat || 0)) < CAR_WIDTH * 1.5) {
        cap = Math.min(cap, Math.max(0, o.speed || 0));
      }
    }
    return cap;
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
    CAR_LENGTH, CAR_WIDTH, SHOT_EDGE, LAT_HOMING, TRAIL_GAP, DROP_GAP, SHOT_SPEEDS, FACTORS, SPIN_MS, TIMINGS,
    makeRoute, wrapDelta, isStraight, advanceShot, shotHits, firstHit, stewardVictims, holdStationSpeed, nearestGaps,
  };
}));
