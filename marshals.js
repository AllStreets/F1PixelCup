// Marshal posts and their flags (docs/design/specs/2026-09-29-trackside-design.md,
// G3). Pure: where the posts stand round the lap, and which flag each shows
// for the race as it is. In the page it defines window.Marshals; in Node it is
// require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Marshals = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // A post every SPACING round the lap, each watching the stretch AHEAD of it
  // -- up to the next post, so every stretch is watched.
  const SPACING = 600;
  const AHEAD = SPACING;
  // A car slower than this share of its top speed is stopped (or near it).
  const CRAWL = 0.1;
  // After the incident clears, the green flag for this long.
  const GREEN_MS = 2000;

  // Lap distances of the posts, starting a little after the line.
  function posts(total) {
    const count = Math.max(1, Math.floor(total / SPACING));
    const step = total / count;
    return Array.from({ length: count }, (_, i) => ({ index: i, d: (step * (i + 0.5)) % total }));
  }

  // Whether a racer is an incident: spinning, or crawling where it shouldn't.
  function incident(racer, now) {
    if (!racer || racer.finished) return false;
    if ((racer.spinUntil || 0) > now) return true;
    const max = racer.physics ? racer.physics.maxSpeed : 0;
    return max > 0 && Math.abs(racer.speed || 0) < max * CRAWL;
  }

  // The flag at each post: "yellow" while a car in the stretch ahead is an
  // incident, "green" for GREEN_MS after it clears, else "none". `memory` keeps
  // when each post last showed yellow (the caller holds it across frames).
  // `racing` is false before the start (cars on the grid are not incidents).
  function flags(postList, racers, now, total, memory, racing) {
    return postList.map((post) => {
      let yellow = false;
      if (racing) {
        yellow = racers.some((r) => {
          const ahead = (((r.trackDistance || 0) - post.d) % total + total) % total;
          return ahead <= AHEAD && incident(r, now);
        });
      }
      if (yellow) {
        memory[post.index] = now;
        return "yellow";
      }
      const last = memory[post.index];
      // (A time ahead of now is a stale memory, not a recent incident.)
      return last !== undefined && now >= last && now - last < GREEN_MS ? "green" : "none";
    });
  }

  // Whether the chequered flag waves: some car is on the last lap (it has
  // `laps - 1` behind it) and nobody has finished. It stops when the first
  // car takes the flag, whoever it is. `racers`: { lap, finished }.
  function chequered(racers, laps) {
    if (!racers || !racers.length || racers.some((r) => r.finished)) return false;
    return racers.some((r) => (r.lap || 0) >= laps - 1);
  }

  // The official's flag arm (the people model's right arm, in its metres: a
  // figure faces +x, up is +y, its right is +z): straight from the shoulder
  // to the wrist, swung about the shoulder in the plane it faces. `wave` 0
  // the arm down at their side, 1 raised over the head and swinging; `t` in
  // seconds. Returns the arm's angle from straight down (what the person
  // shader turns it by), the wrist, and the pole's lean from upright (towards
  // the road): held out low over the rail at rest, along the arm when waving. The renderer
  // (r3d/trackside.js, r3d/people.js) draws both from this.
  const FLAG_ARM = { shoulder: [0, 1.42, 0.19], wrist: [0, 0.84, 0.27], raise: 2.6, swing: 0.32, rate: 7, rest: 1.25 };
  function flagPose(wave, t) {
    const w = Math.max(0, Math.min(1, wave));
    const angle = w * (FLAG_ARM.raise + FLAG_ARM.swing * Math.sin(t * FLAG_ARM.rate));
    const [sx, sy, sz] = FLAG_ARM.shoulder;
    const dx = FLAG_ARM.wrist[0] - sx;
    const dy = FLAG_ARM.wrist[1] - sy;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const wrist = [sx + dx * c - dy * sn, sy + dx * sn + dy * c, FLAG_ARM.wrist[2] + 0 * sz];
    // Along the arm, the pole leans (pi - angle) from upright.
    const lean = FLAG_ARM.rest * (1 - w) + (Math.PI - angle) * w;
    return { angle, wrist, lean };
  }

  return { SPACING, AHEAD, CRAWL, GREEN_MS, FLAG_ARM, posts, incident, flags, chequered, flagPose };
}));
