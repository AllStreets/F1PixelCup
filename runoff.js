// The run-off and the barriers round a circuit
// (docs/superpowers/specs/2026-10-05-balance-design.md). Real circuits fold
// back on themselves, so each sample along the lap measures how much room it
// has on either side before another stretch of the circuit, and the run-off
// and barriers shrink to fit. The renderer (r3d/track.js) draws the barriers
// here, and the physics (game.js) stops cars at the same place: what you see
// is what you hit. Pure; in the page it defines window.Runoff (an ES module
// importing it gets the same), in Node it is require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Runoff = api;
}(typeof self !== "undefined" ? self : this, () => {
  const SAMPLE_STEP = 6;
  const BRIDGE_HEIGHT = 26;
  const BRIDGE_FLAT = 110;   // half-length of the level bridge deck
  const BRIDGE_RAMP = 360;   // length of each ramp
  const STREET = new Set(["monaco", "singapore", "jeddah", "miami", "baku", "lasvegas"]);
  // A barrier is drawn this far outside the run-off's edge.
  const BARRIER_GAP = 1;

  const smooth = (t) => t * t * (3 - 2 * t);

  // The samples round the lap of a track (game.js trackDefinition: its
  // segments, cumulativeStarts, totalLength, roadWidth, bridges, pitLane),
  // each with its run-off either side (outerL, outerR: the run-off's outer
  // edge, along the normal n = (-ty, tx), "right" being +n).
  function profile(track) {
    const width = track.roadWidth;
    const street = STREET.has(track.id);
    const runoffBase = street ? width + 14 : width + 38;
    const total = track.totalLength;
    const segs = track.segments;
    const starts = track.cumulativeStarts;

    // Bridges: the later pass over a crossing climbs over the earlier one.
    const bridgeDistances = (track.bridges || []).map((b) => starts[b.over % starts.length]);
    const heightAt = (d) => {
      let h = 0;
      for (const bd of bridgeDistances) {
        let dd = Math.abs(((d - bd) % total + total) % total);
        dd = Math.min(dd, total - dd);
        const t = 1 - Math.max(0, dd - BRIDGE_FLAT) / BRIDGE_RAMP;
        if (t > 0) h = Math.max(h, BRIDGE_HEIGHT * smooth(Math.min(1, t)));
      }
      return h;
    };

    const count = Math.ceil(total / SAMPLE_STEP);
    const samples = [];
    let seg = 0;
    for (let i = 0; i < count; i += 1) {
      const d = (i / count) * total;
      while (seg < segs.length - 1 && starts[seg] + segs[seg].length < d) seg += 1;
      const s = segs[seg];
      const t = s.length ? (d - starts[seg]) / s.length : 0;
      // The road's half-width here: narrower where the track data says so
      // (a point's `w`: Shanghai's snail).
      const wid = width * ((s.a.w ?? 1) * (1 - t) + (s.b.w ?? 1) * t);
      samples.push({ i, x: s.a.x + s.dx * t, y: s.a.y + s.dy * t, d, h: heightAt(d), wid });
    }
    const n = samples.length;
    const k = 3;
    samples.forEach((p, i) => {
      const a = samples[(i - k + n) % n];
      const b = samples[(i + k) % n];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      p.tx = tx / len;
      p.ty = ty / len;
      p.nx = -p.ty;
      p.ny = p.tx;
    });
    samples.forEach((p, i) => {
      const q = samples[(i + 2) % n];
      p.curve = (p.tx * q.ty - p.ty * q.tx) / (2 * SAMPLE_STEP);
    });

    // Grid of samples for neighbourhood queries.
    const cell = 80;
    const grid = new Map();
    samples.forEach((p) => {
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(p);
    });
    const near = (x, z, r, visit) => {
      for (let ix = Math.floor((x - r) / cell); ix <= Math.floor((x + r) / cell); ix += 1) {
        for (let iz = Math.floor((z - r) / cell); iz <= Math.floor((z + r) / cell); iz += 1) {
          const list = grid.get(`${ix},${iz}`);
          if (list) list.forEach(visit);
        }
      }
    };

    // Room either side before another stretch of the circuit (half the gap, so
    // two neighbours share it). Beside a pit complex, all the room up to it: its
    // garages may stand nearer another stretch than that stretch's usual
    // run-off, where the track data puts a wall there (pitlane.js `clear`).
    const minArc = Math.ceil(260 / SAMPLE_STEP);
    const lane = track.pitLane || null;
    const pitReach = samples.map((q) => {
      if (!lane || !lane.inZone(q.d)) return null;
      return lane.atGarage(q.d) ? lane.garages.outer : lane.outerAt(q.d);
    });
    const reachMax = Math.max(0, ...pitReach.filter((r) => r !== null));
    samples.forEach((p) => {
      let left = Infinity;
      let right = Infinity;
      near(p.x, p.y, Math.max(runoffBase * 2 + 20, reachMax + runoffBase + 10), (q) => {
        let gap = Math.abs(q.i - p.i);
        gap = Math.min(gap, n - gap);
        if (gap < minArc || Math.abs(q.h - p.h) > 10) return;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dist = Math.hypot(dx, dy);
        const side = dx * p.nx + dy * p.ny;
        // On q's pit side: up to its pit complex; otherwise half the gap.
        const reach = pitReach[q.i];
        const room = reach !== null && -(dx * q.nx + dy * q.ny) * lane.side > 0 ? dist - reach : dist / 2;
        if (side >= 0) right = Math.min(right, room);
        else left = Math.min(left, room);
      });
      // Offsets are measured along the normal: +n is "right", -n is "left".
      // (Where the road narrows, its run-off is in proportion.)
      const share = p.wid / width;
      p.outerR = Math.max(p.wid + 10 * share, Math.min(p.wid + (runoffBase - width) * share, right - 3));
      p.outerL = Math.max(p.wid + 10 * share, Math.min(p.wid + (runoffBase - width) * share, left - 3));
    });

    // The pit complex is part of the circuit: through its zone the pit side
    // reaches out to the working lane, in front of the garages. So the run-off,
    // the barrier line, clearance() -- and with it every piece of scenery and
    // the scenery audit -- take it in. The track data made sure there is room.
    if (lane) {
      samples.forEach((p) => {
        const reach = lane.outerAt(p.d);
        if (reach === null) return;
        if (lane.side > 0) p.outerR = Math.max(p.outerR, reach);
        else p.outerL = Math.max(p.outerL, reach);
      });
    }

    // The sample nearest a lap distance (they are total / n apart, a little
    // under SAMPLE_STEP).
    const sampleAt = (d) => samples[((Math.round((d * n) / total) % n) + n) % n];

    return { width, street, runoffBase, samples, heightAt, near, sampleAt };
  }

  // The walls a car can meet at lap distance d on one side of the road
  // (side >= 0: along +n), as offsets from the centreline, for a car whose
  // centre is `offset` out on that side: `outer`, the face it can't go past,
  // and `inner`, the face it can't come back in past (or null). Usually the
  // barrier past the run-off and nothing inside it. In the pit zone, where the
  // lane has cleared the road, the pit wall stands between them: from the road
  // it is the outer face; from the lane, the inner one, with the lane's own
  // edge outside. (In the mouths, where the lane opens off the road, there is
  // no pit wall.)
  function wallLimits(prof, lane, d, side, offset = 0) {
    const p = prof.sampleAt(d);
    const barrier = (side >= 0 ? p.outerR : p.outerL) + BARRIER_GAP;
    if (lane && Math.sign(side || 1) === lane.side && lane.wallAt(d) !== null) {
      // (Which side of the wall the car is: beyond its middle, the lane's.)
      if (offset > (lane.wallIn + lane.wallOut) / 2) return { inner: lane.wallOut, outer: barrier };
      return { inner: null, outer: Math.min(barrier, lane.wallIn) };
    }
    return { inner: null, outer: barrier };
  }

  return { SAMPLE_STEP, BRIDGE_HEIGHT, STREET, BARRIER_GAP, profile, wallLimits };
}));
