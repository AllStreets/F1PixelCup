// Marshal posts and their flags (docs/superpowers/specs/2026-09-29-trackside-design.md,
// G3). Pure: where the posts stand round the lap, and which flag each shows
// for the race as it is. In the page it defines window.Marshals; in Node it is
// require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Marshals = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // A post every SPACING round the lap, each watching the stretch AHEAD of it.
  const SPACING = 600;
  const AHEAD = 300;
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
      return last !== undefined && now - last < GREEN_MS ? "green" : "none";
    });
  }

  return { SPACING, AHEAD, CRAWL, GREEN_MS, posts, incident, flags };
}));
