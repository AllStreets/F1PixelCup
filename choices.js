// Choosing races (docs/superpowers/specs/2026-10-01-race-choices-design.md):
// the random cup's seeded draw and its reroll, the custom cup's checks and
// edits, the circuit search, and the pit lane's remembered choices. Pure, and
// nothing here knows how many circuits there are: the pool is whatever the
// game passes in. In the page it defines window.Choices; in Node it is
// require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Choices = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MODES = ["cup", "season", "random", "custom", "single"];
  const CUP_SIZE = 4;
  // The cups these make, as the career and the podium know them.
  const KINDS = {
    random: { id: "randomCup", name: "Random Cup" },
    custom: { id: "customCup", name: "Custom Cup" },
    single: { id: "singleRace", name: "Single race" },
  };
  const SINGLE_PICKS = ["random", "chosen"];

  // Any value to a 32-bit unsigned seed (a string by its characters).
  function toSeed(seed) {
    if (typeof seed === "number" && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h >>> 0;
  }

  // mulberry32: small, fast, and the same in every browser and in Node.
  function random(seed) {
    let a = toSeed(seed);
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const nextSeed = (seed) => (Math.imul(toSeed(seed), 1664525) + 1013904223) >>> 0;

  // count circuits from the pool, no repeats, in drawn order: the first
  // count steps of a seeded Fisher-Yates on a copy.
  function draw(pool, count, seed) {
    const ids = Array.isArray(pool) ? [...pool] : [];
    const n = Math.max(0, Math.min(Math.trunc(count) || 0, ids.length));
    const next = random(seed);
    for (let i = 0; i < n; i += 1) {
      const j = i + Math.floor(next() * (ids.length - i));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, n);
  }

  const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

  // The next seed whose draw is not the one on screen. same: true when the
  // pool holds no other draw at all (one circuit for a race of one).
  function reroll(pool, count, seed, current) {
    let s = toSeed(seed);
    for (let tries = 0; tries < 256; tries += 1) {
      s = nextSeed(s);
      const ids = draw(pool, count, s);
      if (!sameList(ids, current)) return { seed: s, ids, same: false };
    }
    s = nextSeed(seed);
    return { seed: s, ids: draw(pool, count, s), same: true };
  }

  // A custom cup: exactly size circuits, all in the pool, none twice.
  function validateCustom(ids, pool, size = CUP_SIZE) {
    if (!Array.isArray(ids) || ids.length !== size) return { ok: false, reason: "count" };
    if (!ids.every((id) => Array.isArray(pool) && pool.includes(id))) return { ok: false, reason: "unknown" };
    if (new Set(ids).size !== ids.length) return { ok: false, reason: "repeat" };
    return { ok: true, reason: null };
  }

  const parseJson = (text) => {
    try {
      return typeof text === "string" ? JSON.parse(text) : null;
    } catch (err) {
      return null;
    }
  };

  // A stored custom cup: what can be kept of it (known, once each, at most size).
  function parseCustom(text, pool, size = CUP_SIZE) {
    const raw = parseJson(text);
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach((id) => {
      if (typeof id === "string" && pool.includes(id) && !out.includes(id) && out.length < size) out.push(id);
    });
    return out;
  }

  // In if it isn't (and there is room), out if it is.
  function toggle(ids, id, size = CUP_SIZE) {
    if (ids.includes(id)) return ids.filter((x) => x !== id);
    return ids.length < size ? [...ids, id] : [...ids];
  }

  // One place earlier (dir -1) or later (1); off either end it stays.
  function move(ids, index, dir) {
    const to = index + (dir < 0 ? -1 : 1);
    if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return [...ids];
    const out = [...ids];
    [out[index], out[to]] = [out[to], out[index]];
    return out;
  }

  // Lower case, accents off: "José" finds "jose" and the other way round.
  const fold = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Every word of the query somewhere in the circuit's name, short name,
  // country, theme or id. The best matches lead: the id itself, then a whole word of the
  // name or country, then the rest, each in the order given.
  function search(circuits, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [...circuits];
    const whole = words.join(" ");
    return circuits
      .map((c, i) => {
        const hay = fold(`${c.name} ${c.short || ""} ${c.country} ${c.theme || ""} ${c.id}`);
        if (!words.every((w) => hay.includes(w))) return null;
        const named = fold(`${c.name} ${c.short || ""} ${c.country}`).split(/[^a-z0-9]+/);
        const rank = fold(c.id) === whole ? 2 : words.some((w) => named.includes(w)) ? 1 : 0;
        return { c, i, rank };
      })
      .filter(Boolean)
      .sort((a, b) => b.rank - a.rank || a.i - b.i)
      .map((m) => m.c);
  }

  // The remembered choice: the one stored, else the season if that was the
  // cup last picked (before this choice was stored), else a cup.
  function resolveMode(stored, storedCup, seasonId) {
    if (MODES.includes(stored)) return stored;
    return storedCup === seasonId ? "season" : "cup";
  }

  function parseSingle(text, pool) {
    const raw = parseJson(text);
    const pick = raw && SINGLE_PICKS.includes(raw.pick) ? raw.pick : "random";
    const circuitId = raw && typeof raw.circuitId === "string" && pool.includes(raw.circuitId) ? raw.circuitId : null;
    return { pick, circuitId };
  }

  const isSeed = (v) => Number.isInteger(v) && v >= 0 && v < 2 ** 32;
  function parseDraw(text) {
    const raw = parseJson(text) || {};
    return { cup: isSeed(raw.cup) ? raw.cup : null, single: isSeed(raw.single) ? raw.single : null };
  }

  return {
    MODES, CUP_SIZE, KINDS, SINGLE_PICKS,
    draw, reroll, nextSeed, validateCustom, parseCustom, toggle, move, search, fold, resolveMode, parseSingle, parseDraw,
  };
}));
