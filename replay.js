// Replays (docs/superpowers/specs/2026-10-01-replays-design.md). Pure: the
// race's recording (its state every second physics step, in typed arrays),
// playing it back exactly and drawing between samples, and the maths of the
// TV cameras and the director. In the page it defines window.Replay; in Node
// it is require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Replay = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // A sample every second physics step: 30 Hz on the race clock.
  const SAMPLE_EVERY = 2;
  const CHUNK = 128;
  const OBJ_CHUNK = 1024;
  // Farther than this between two samples is a jump (a rescue), not driving.
  const JUMP = 60;
  const TAU = Math.PI * 2;

  const OBJECT_TYPES = ["undercut", "debris", "stewardPenalty", "oilSlick"];
  const FLAGS = ["none", "yellow", "green"];
  const KEYS = ["throttle", "brake", "left", "right", "drift", "item"];
  // The car's on/off states, one bit each; the drift's charge (0 to 2, as the
  // smoke colours it) takes the two bits after them.
  const BITS = ["spinning", "drs", "boosting", "formation", "protected", "drifting", "driftRight", "finished",
    "trailingOil", "offroad", "underRoof", "braking", "roulette"];
  const CHARGE_SHIFT = BITS.length;

  // ---- Quantisation (the same arithmetic stores and reads every field) ----
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // (+ 0 turns -0 into 0, as a typed array does.)
  const int = (v, lo, hi) => clamp(Math.round(Number(v) || 0), lo, hi) + 0;
  const wrapAngle = (h) => {
    let a = (Number(h) || 0) % TAU;
    if (a >= Math.PI) a -= TAU;
    if (a < -Math.PI) a += TAU;
    return a;
  };
  const Q = {
    heading: (h) => int((wrapAngle(h) / Math.PI) * 32768, -32768, 32767),
    speed: (v) => int(v * 64, -32768, 32767),
    lat: (v) => int(v * 128, -32768, 32767),
    steer: (v) => int(clamp(Number(v) || 0, -1, 1) * 127, -127, 127),
    throttle: (v) => int(clamp(Number(v) || 0, 0, 1) * 255, 0, 255),
    // The gap to the leader in fiftieths of a second, up to 21 minutes.
    gap: (v) => int(v * 50, 0, 65535),
    // A shot's age in milliseconds (they live seconds).
    age: (v) => int(v * 1000, 0, 65535),
    byte: (v) => int(v, 0, 255),
  };
  const D = {
    heading: (q) => (q / 32768) * Math.PI,
    speed: (q) => q / 64,
    lat: (q) => q / 128,
    steer: (q) => q / 127,
    throttle: (q) => q / 255,
    gap: (q) => q / 50,
    age: (q) => q / 1000,
  };
  const f32 = (v) => Math.fround(Number(v) || 0);

  function itemIndex(header, item) {
    const i = header.items.indexOf(item);
    return i < 0 ? 0 : i;
  }

  // (Unrolled: this runs for every car at every sample. Same order as BITS.)
  function carBits(c) {
    return (c.spinning ? 1 : 0) | (c.drs ? 2 : 0) | (c.boosting ? 4 : 0) | (c.formation ? 8 : 0)
      | (c.protected ? 16 : 0) | (c.drifting ? 32 : 0) | (c.driftRight ? 64 : 0) | (c.finished ? 128 : 0)
      | (c.trailingOil ? 256 : 0) | (c.offroad ? 512 : 0) | (c.underRoof ? 1024 : 0) | (c.braking ? 2048 : 0)
      | (c.roulette ? 4096 : 0) | (clamp(c.charge | 0, 0, 3) << CHARGE_SHIFT);
  }

  function quantizeCar(c, header) {
    const out = {
      x: f32(c.x), y: f32(c.y), d: f32(c.d), gap: D.gap(Q.gap(c.gap)),
      heading: D.heading(Q.heading(c.heading)), speed: D.speed(Q.speed(c.speed)), lat: D.lat(Q.lat(c.lat)),
      steer: D.steer(Q.steer(c.steer)), throttle: D.throttle(Q.throttle(c.throttle)),
      lap: Q.byte(c.lap), place: Q.byte(c.place), item: header.items[itemIndex(header, c.item)],
    };
    const bits = carBits(c);
    BITS.forEach((name, i) => { out[name] = Boolean(bits & (1 << i)); });
    out.charge = (bits >> CHARGE_SHIFT) & 3;
    return out;
  }

  function quantizeKeys(keys) {
    const out = {};
    KEYS.forEach((k) => { out[k] = Boolean(keys && keys[k]); });
    return out;
  }

  // What a sample reads back as: the documented quantisation of each field.
  function quantizeSample(s, header) {
    const sc = s.safetyCar;
    return {
      cars: header.cars.map((_, i) => quantizeCar(s.cars[i] || {}, header)),
      objects: (s.objects || []).map((o) => ({
        id: (o.id >>> 0) & 0xffff, type: OBJECT_TYPES[Math.max(0, OBJECT_TYPES.indexOf(o.type))], d: f32(o.d), lat: D.lat(Q.lat(o.lat)), age: D.age(Q.age(o.age)),
      })),
      safetyCar: sc ? { d: f32(sc.d), lat: D.lat(Q.lat(sc.lat)), leaving: Boolean(sc.leaving), parked: Boolean(sc.parked) } : null,
      boxes: Array.from({ length: header.boxes }, (_, i) => Boolean(s.boxes && s.boxes[i])),
      flags: Array.from({ length: header.posts }, (_, i) => FLAGS[Math.max(0, FLAGS.indexOf(s.flags && s.flags[i]))]),
      keys: quantizeKeys(s.keys),
      mid: s.mid ? header.cars.map((_, i) => quantizeMid(s.mid[i] || {})) : null,
    };
  }

  function quantizeMid(m) {
    return { x: f32(m.x), y: f32(m.y), heading: D.heading(Q.heading(m.heading)) };
  }

  // ---- The recording ----
  // header: { trackId, laps, weather, lapLength, t0, stepMs, items, boxes,
  // posts, playerId, cars: [{ id, name, code, number, team, color, isPlayer }] }
  function createRecording(header) {
    const n = header.cars.length;
    const boxWords = Math.ceil(header.boxes / 32);
    const sampleMs = header.stepMs * SAMPLE_EVERY;
    const chunks = [];
    const objChunks = [];
    let count = 0;
    let objCount = 0;

    function newChunk() {
      const c = CHUNK * n;
      return {
        x: new Float32Array(c), y: new Float32Array(c), d: new Float32Array(c), gap: new Uint16Array(c),
        heading: new Int16Array(c), speed: new Int16Array(c), lat: new Int16Array(c),
        steer: new Int8Array(c), throttle: new Uint8Array(c), lap: new Uint8Array(c), place: new Uint8Array(c), item: new Uint8Array(c),
        bits: new Uint16Array(c),
        // Where each car was at the step between this sample and the next.
        midX: new Float32Array(c), midY: new Float32Array(c), midHeading: new Int16Array(c),
        // Per sample.
        hasMid: new Uint8Array(CHUNK),
        objStart: new Uint32Array(CHUNK), objLen: new Uint16Array(CHUNK),
        scBits: new Uint8Array(CHUNK), scD: new Float32Array(CHUNK), scLat: new Int16Array(CHUNK),
        boxes: new Uint32Array(CHUNK * Math.max(1, boxWords)), flags: new Uint8Array(CHUNK * Math.max(1, header.posts)),
        keys: new Uint8Array(CHUNK),
      };
    }
    function newObjChunk() {
      return { id: new Uint16Array(OBJ_CHUNK), type: new Uint8Array(OBJ_CHUNK), d: new Float32Array(OBJ_CHUNK), lat: new Int16Array(OBJ_CHUNK), age: new Uint16Array(OBJ_CHUNK) };
    }

    const rec = {
      header,
      sampleMs,
      flashes: [],
      chequerAt: 0,
      get count() { return count; },
      get duration() { return Math.max(0, count - 1) * sampleMs; },

      push(s) {
        const ci = Math.floor(count / CHUNK);
        if (!chunks[ci]) chunks[ci] = newChunk();
        const ch = chunks[ci];
        const j = count % CHUNK;
        for (let i = 0; i < n; i += 1) {
          const c = s.cars[i] || {};
          const at = j * n + i;
          ch.x[at] = c.x || 0; ch.y[at] = c.y || 0; ch.d[at] = c.d || 0; ch.gap[at] = Q.gap(c.gap);
          ch.heading[at] = Q.heading(c.heading); ch.speed[at] = Q.speed(c.speed); ch.lat[at] = Q.lat(c.lat);
          ch.steer[at] = Q.steer(c.steer); ch.throttle[at] = Q.throttle(c.throttle);
          ch.lap[at] = Q.byte(c.lap); ch.place[at] = Q.byte(c.place); ch.item[at] = itemIndex(header, c.item);
          ch.bits[at] = carBits(c);
        }
        ch.hasMid[j] = 0;
        const objects = s.objects || [];
        ch.objStart[j] = objCount;
        ch.objLen[j] = objects.length;
        objects.forEach((o) => {
          const oi = Math.floor(objCount / OBJ_CHUNK);
          if (!objChunks[oi]) objChunks[oi] = newObjChunk();
          const oc = objChunks[oi];
          const k = objCount % OBJ_CHUNK;
          oc.id[k] = (o.id >>> 0) & 0xffff; oc.type[k] = Math.max(0, OBJECT_TYPES.indexOf(o.type));
          oc.d[k] = o.d || 0; oc.lat[k] = Q.lat(o.lat); oc.age[k] = Q.age(o.age);
          objCount += 1;
        });
        const sc = s.safetyCar;
        ch.scBits[j] = sc ? 1 | (sc.leaving ? 2 : 0) | (sc.parked ? 4 : 0) : 0;
        ch.scD[j] = sc ? sc.d || 0 : 0;
        ch.scLat[j] = sc ? Q.lat(sc.lat) : 0;
        for (let w = 0; w < boxWords; w += 1) {
          let word = 0;
          for (let b = 0; b < 32 && w * 32 + b < header.boxes; b += 1) if (s.boxes && s.boxes[w * 32 + b]) word |= 1 << b;
          ch.boxes[j * boxWords + w] = word >>> 0;
        }
        for (let p = 0; p < header.posts; p += 1) ch.flags[j * header.posts + p] = Math.max(0, FLAGS.indexOf(s.flags && s.flags[p]));
        let keys = 0;
        KEYS.forEach((k, b) => { if (s.keys && s.keys[k]) keys |= 1 << b; });
        ch.keys[j] = keys;
        count += 1;
        if (s.mid) rec.pushMid(s.mid);
      },

      // The cars' positions at the step after the last sample: positions are
      // kept every step (a contact can shove a car in one), the rest every two.
      pushMid(mid) {
        if (!count) return;
        const k = count - 1;
        const ch = chunks[Math.floor(k / CHUNK)];
        const j = k % CHUNK;
        for (let i = 0; i < n; i += 1) {
          const m = mid[i] || {};
          const at = j * n + i;
          ch.midX[at] = m.x || 0; ch.midY[at] = m.y || 0; ch.midHeading[at] = Q.heading(m.heading);
        }
        ch.hasMid[j] = 1;
      },

      addFlash(f) {
        rec.flashes.push({ x: f.x, y: f.y, d: f.d, color: f.color, size: f.size, at: f.at, until: f.until });
      },

      timeOf(k) { return header.t0 + k * sampleMs; },
      // The sample at or before race time t (a seek), clamped to the recording.
      indexAt(t) {
        if (!count) return 0;
        return clamp(Math.floor((t - header.t0) / sampleMs + 1e-9), 0, count - 1);
      },

      // Sample k exactly as stored.
      sampleAt(k) {
        const ch = chunks[Math.floor(k / CHUNK)];
        const j = k % CHUNK;
        const cars = [];
        for (let i = 0; i < n; i += 1) {
          const at = j * n + i;
          const bits = ch.bits[at];
          const car = {
            x: ch.x[at], y: ch.y[at], d: ch.d[at], gap: D.gap(ch.gap[at]),
            heading: D.heading(ch.heading[at]), speed: D.speed(ch.speed[at]), lat: D.lat(ch.lat[at]),
            steer: D.steer(ch.steer[at]), throttle: D.throttle(ch.throttle[at]),
            lap: ch.lap[at], place: ch.place[at], item: header.items[ch.item[at]],
          };
          BITS.forEach((name, b) => { car[name] = Boolean(bits & (1 << b)); });
          car.charge = (bits >> CHARGE_SHIFT) & 3;
          cars.push(car);
        }
        const objects = [];
        for (let o = ch.objStart[j]; o < ch.objStart[j] + ch.objLen[j]; o += 1) {
          const oc = objChunks[Math.floor(o / OBJ_CHUNK)];
          const k2 = o % OBJ_CHUNK;
          objects.push({ id: oc.id[k2], type: OBJECT_TYPES[oc.type[k2]], d: oc.d[k2], lat: D.lat(oc.lat[k2]), age: D.age(oc.age[k2]) });
        }
        const sb = ch.scBits[j];
        const boxes = [];
        for (let b = 0; b < header.boxes; b += 1) boxes.push(Boolean(ch.boxes[j * boxWords + (b >> 5)] & (1 << (b & 31))));
        const flags = [];
        for (let p = 0; p < header.posts; p += 1) flags.push(FLAGS[ch.flags[j * header.posts + p]]);
        const keys = {};
        KEYS.forEach((k3, b) => { keys[k3] = Boolean(ch.keys[j] & (1 << b)); });
        let mid = null;
        if (ch.hasMid[j]) {
          mid = [];
          for (let i = 0; i < n; i += 1) {
            const at = j * n + i;
            mid.push({ x: ch.midX[at], y: ch.midY[at], heading: D.heading(ch.midHeading[at]) });
          }
        }
        return {
          cars, objects, mid,
          safetyCar: sb & 1 ? { d: ch.scD[j], lat: D.lat(ch.scLat[j]), leaving: Boolean(sb & 2), parked: Boolean(sb & 4) } : null,
          boxes, flags, keys,
        };
      },

      // One car's controls at sample k (and the player's keys), without
      // decoding the whole sample: the input trace reads seconds of these.
      controls(k, i) {
        const ch = chunks[Math.floor(k / CHUNK)];
        const j = k % CHUNK;
        const at = j * n + i;
        const keys = {};
        KEYS.forEach((name, b) => { keys[name] = Boolean(ch.keys[j] & (1 << b)); });
        return { throttle: D.throttle(ch.throttle[at]), brake: Boolean(ch.bits[at] & (1 << BITS.indexOf("braking"))), steer: D.steer(ch.steer[at]), keys };
      },

      // The race at any time t. Positions go step by step (from each sample
      // to the step after it, then to the next sample), straight between two
      // steps as the race itself draws them; the rest goes between samples.
      frameAt(t) {
        const k = rec.indexAt(t);
        const a = rec.sampleAt(k);
        const last = k >= count - 1;
        let alpha = !last ? clamp((t - rec.timeOf(k)) / sampleMs, 0, 1) : 0;
        if (alpha < 1e-9) alpha = 0;
        const time = count ? clamp(t, header.t0, rec.timeOf(count - 1)) : t;
        const flashes = rec.flashes.filter((f) => f.at <= time && time < f.until)
          .map((f) => ({ ...f, t: (time - f.at) / (f.until - f.at) }));
        const frame = { t: time, k, alpha, ...a, flashes };
        if (!alpha) return frame;
        const b = rec.sampleAt(k + 1);
        const L = header.lapLength;
        const wrap = (v) => (v < 0 ? v + L : v >= L ? v - L : v);
        const along = (from, to) => ((to - from) % L + L * 1.5) % L - L / 2;
        const mix = (u, v, f = alpha) => u + (v - u) * f;
        // Which two steps the moment is between, and how far.
        const second = alpha * SAMPLE_EVERY >= 1;
        const f = second ? alpha * SAMPLE_EVERY - 1 : alpha * SAMPLE_EVERY;
        frame.cars = a.cars.map((ca, i) => {
          const cb = b.cars[i];
          const out = { ...ca };
          ["speed", "lat", "gap", "steer", "throttle"].forEach((field) => { out[field] = mix(ca[field], cb[field]); });
          out.d = Math.abs(along(ca.d, cb.d)) > JUMP * 2 ? (alpha < 0.5 ? ca.d : cb.d) : wrap(ca.d + along(ca.d, cb.d) * alpha);
          // The step between: recorded, or (none recorded) halfway, unless
          // the car jumped (then it is where it was until the jump).
          const jumped = Math.hypot(cb.x - ca.x, cb.y - ca.y) > JUMP;
          const m = a.mid ? a.mid[i]
            : jumped ? ca : { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2, heading: ca.heading + wrapAngle(cb.heading - ca.heading) / 2 };
          const p = second ? m : ca;
          const q = second ? cb : m;
          if (Math.hypot(q.x - p.x, q.y - p.y) > JUMP) {
            // A jump (a rescue) is drawn where the car is, at the nearer step.
            const at = f < 0.5 ? p : q;
            Object.assign(out, { x: at.x, y: at.y, heading: at.heading });
          } else {
            out.x = mix(p.x, q.x, f);
            out.y = mix(p.y, q.y, f);
            out.heading = p.heading + wrapAngle(q.heading - p.heading) * f;
          }
          return out;
        });
        frame.objects = a.objects.map((oa) => {
          const ob = b.objects.find((o) => o.id === oa.id);
          if (!ob || Math.abs(along(oa.d, ob.d)) > JUMP) return oa;
          return { ...oa, d: wrap(oa.d + along(oa.d, ob.d) * alpha), lat: mix(oa.lat, ob.lat), age: mix(oa.age, ob.age) };
        });
        if (a.safetyCar && b.safetyCar && Math.abs(along(a.safetyCar.d, b.safetyCar.d)) < JUMP) {
          frame.safetyCar = { ...a.safetyCar, d: wrap(a.safetyCar.d + along(a.safetyCar.d, b.safetyCar.d) * alpha), lat: mix(a.safetyCar.lat, b.safetyCar.lat) };
        }
        return frame;
      },

      // Memory held: every typed array allocated so far.
      bytes() {
        let total = 0;
        [...chunks, ...objChunks].forEach((c) => Object.values(c).forEach((arr) => { total += arr.byteLength; }));
        return total;
      },
    };
    return rec;
  }

  // ---- TV cameras ----
  const TV_CAM = {
    spacing: 450, radius: 5, margin: 10, offsets: [24, 60], search: 160,
    // Each camera sees the car for this share of the gap before it, and this after.
    before: 0.65, after: 0.35,
    // The zoom: a subject this wide fills the frame, within these lenses (vertical degrees).
    subject: 110, minFov: 4, maxFov: 40,
  };

  const wrapLap = (d, L) => ((d % L) + L) % L;

  // Is the spot clear by the claim system's rules (course.claim)?
  function clearAt(course, x, z, r, margin) {
    return course.clearance(x, z, r + 200) >= r + margin && !course.occupied.blocked(x, z, r);
  }

  function nearestClearSpot(course, ax, az, r, margin, search) {
    for (let rad = 0; rad <= search; rad += 12) {
      const steps = rad ? Math.max(6, Math.floor((TAU * rad) / 20)) : 1;
      for (let s = 0; s < steps; s += 1) {
        const a = (s / steps) * TAU;
        const x = ax + Math.cos(a) * rad;
        const z = az + Math.sin(a) * rad;
        if (clearAt(course, x, z, r, margin)) return { x, z };
      }
    }
    return null;
  }

  // Cameras round the lap, off the track: at each anchor, on whichever side
  // sees its stretch best (visible(from, to) answers line of sight), claimed
  // through the course's occupancy so nothing else is ever put there.
  function placeTvCameras(course, { height = 26, visible = null } = {}) {
    const C = TV_CAM;
    const L = course.track.totalLength;
    const count = Math.max(3, Math.round(L / C.spacing));
    const seg = L / count;
    const cams = [];
    for (let k = 0; k < count; k += 1) {
      const d = (k + 0.5) * seg;
      const p = course.sampleAt(d);
      let best = null;
      [1, -1].forEach((side) => C.offsets.forEach((off) => {
        const reach = (side > 0 ? p.outerR : p.outerL) + off;
        const spot = nearestClearSpot(course, p.x + p.nx * side * reach, p.y + p.ny * side * reach, C.radius, C.margin, C.search);
        if (!spot) return;
        const from = { x: spot.x, y: (p.h || 0) + height, z: spot.z };
        let seen = 0;
        if (visible) {
          for (let j = 0; j <= 7; j += 1) {
            const q = course.sampleAt(wrapLap(d - C.before * seg + (j / 7) * seg, L));
            if (visible(from, { x: q.x, y: (q.h || 0) + 4, z: q.y })) seen += 1;
          }
        }
        const score = seen * 1e6 - Math.hypot(spot.x - p.x, spot.z - p.y);
        if (!best || score > best.score) best = { score, ...from, d, side };
      }));
      if (!best) continue;
      course.occupied.add(best.x, best.z, C.radius);
      cams.push({ x: best.x, y: best.y, z: best.z, d: best.d, side: best.side });
    }
    // Coverage: from part of the way after the previous camera to part of
    // the way to the next.
    cams.forEach((c, k) => {
      const prev = cams[(k - 1 + cams.length) % cams.length];
      const gap = cams.length > 1 ? wrapLap(c.d - prev.d, L) : L;
      c.from = wrapLap(prev.d + C.after * gap, L);
    });
    cams.forEach((c, k) => { c.to = cams[(k + 1) % cams.length].from; });
    return cams;
  }

  // Which camera has the car at lap distance d.
  function tvCameraFor(cams, d, L) {
    if (!cams.length) return -1;
    if (cams.length === 1) return 0;
    for (let k = 0; k < cams.length; k += 1) {
      const c = cams[k];
      if (wrapLap(d - c.from, L) < wrapLap(c.to - c.from, L)) return k;
    }
    return 0;
  }

  // The lens that keeps a subject of the same width filling the frame at
  // this distance (vertical degrees, for a 16:9 picture).
  function zoomFov(distance, subject = TV_CAM.subject) {
    const fov = (2 * Math.atan(((subject * 9) / 16) / 2 / Math.max(1e-6, distance)) * 180) / Math.PI;
    return clamp(fov, TV_CAM.minFov, TV_CAM.maxFov);
  }

  // ---- The director ----
  const DIRECTOR = { shotMs: 6000, battleGap: 1.5, top: 6, cycle: ["trackside", "trackside", "onboard", "trackside", "helicopter"] };

  // The race cut into shots, once, so a seek always lands in the same one.
  // Times are ms from lights out.
  function directorShots(rec, opts = {}) {
    const o = { ...DIRECTOR, ...opts };
    const { header } = rec;
    const total = rec.duration;
    const ids = header.cars.map((c) => c.id);
    const shots = [];
    let pair = null;
    for (let start = 0, i = 0; start < total || i === 0; start += o.shotMs, i += 1) {
      const end = Math.min(total, start + o.shotMs);
      const s = rec.sampleAt(rec.indexAt(header.t0 + start));
      const order = s.cars.map((c, idx) => ({ ...c, id: ids[idx] })).sort((a, b) => a.place - b.place);
      let focusId;
      if (i === 0) {
        focusId = order[0].id;
        shots.push({ start, end, mode: "helicopter", focusId });
        continue;
      }
      const battle = (a, b) => a && b && !a.finished && !b.finished && b.gap - a.gap < o.battleGap;
      // The battle already on screen holds while it lasts.
      if (pair) {
        const a = order.find((c) => c.id === pair[0]);
        const b = order.find((c) => c.id === pair[1]);
        const [front, back] = a && b && a.place > b.place ? [b, a] : [a, b];
        pair = battle(front, back) && back.place <= o.top ? [front.id, back.id] : null;
      }
      if (!pair) {
        let best = null;
        for (let p = 0; p + 1 < Math.min(o.top, order.length); p += 1) {
          const gap = order[p + 1].gap - order[p].gap;
          if (battle(order[p], order[p + 1]) && (!best || gap < best.gap)) best = { gap, ids: [order[p].id, order[p + 1].id] };
        }
        pair = best ? best.ids : null;
      }
      if (pair) {
        focusId = pair[1];
      } else {
        const player = order.find((c) => c.id === header.playerId);
        const running = order.find((c) => !c.finished);
        focusId = player && !player.finished ? player.id : running ? running.id : header.playerId;
      }
      shots.push({ start, end, mode: o.cycle[(i - 1) % o.cycle.length], focusId });
      if (end >= total) break;
    }
    return shots;
  }

  function shotAt(shots, ms) {
    let lo = 0;
    let hi = shots.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (shots[mid].start <= ms) lo = mid; else hi = mid - 1;
    }
    return shots[lo];
  }

  // The next (dir 1) or previous (-1) car in the running order, round the ends.
  function neighbour(cars, id, dir) {
    const order = [...cars].sort((a, b) => a.place - b.place);
    const i = Math.max(0, order.findIndex((c) => c.id === id));
    return order[(i + dir + order.length) % order.length].id;
  }

  return {
    SAMPLE_EVERY, CHUNK, JUMP, OBJECT_TYPES, FLAGS, KEYS, BITS, TV_CAM, DIRECTOR,
    createRecording, quantizeSample, placeTvCameras, tvCameraFor, zoomFov, directorShots, shotAt, neighbour,
  };
}));
