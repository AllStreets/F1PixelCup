// Graphics quality: which post-processing each machine gets
// (docs/superpowers/specs/2026-09-29-postfx-design.md). Pure rules; in the page
// this defines window.Quality, in Node it is require()-able for the tests.
//
// A first guess comes from the device. While racing, dynamic resolution
// lowers the render pixel ratio when frames run slow; once it is at its floor
// and they still do, auto steps the tier down (never up on its own). The player's choice in Settings (auto, high,
// medium, low) overrides it and is kept.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Quality = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const TIERS = ["high", "medium", "low"];
  const CHOICES = ["auto", ...TIERS];
  // Slower than this (median frame, ms) and the tier steps down.
  const SLOW_FRAME_MS = 22;
  // Frames needed before judging.
  const MIN_FRAMES = 60;

  // cores (navigator.hardwareConcurrency), memoryGb (navigator.deviceMemory),
  // touchOnly (Device.isTouchOnly), gpu (the WebGL renderer string).
  function initialTier({ cores, memoryGb, touchOnly, gpu } = {}) {
    const g = String(gpu || "").toLowerCase();
    if (/swiftshader|llvmpipe|software|microsoft basic render/.test(g)) return "low";
    if ((cores && cores <= 2) || (memoryGb && memoryGb <= 2)) return "low";
    if (touchOnly) return "medium";
    if (!cores && !memoryGb && !g) return "medium";
    // Integrated graphics on a PC laptop: medium. Apple silicon, discrete
    // GPUs and anything with the cores to spare: high. Intel's Arc cards are
    // discrete; AMD's integrated graphics report a bare "Radeon Graphics".
    const integrated = (/intel|uhd|iris|mali|adreno|powervr/.test(g) && !/\barc\b|arc\(tm\)/.test(g))
      || /radeon(\(tm\))? graphics/.test(g);
    if (integrated) return "medium";
    if ((cores || 0) >= 6 || /apple m\d|nvidia|geforce|radeon|rtx|gtx|\barc\b|arc\(tm\)/.test(g)) return "high";
    return "medium";
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function adjustTier(tier, frameMs) {
    if (!Array.isArray(frameMs) || frameMs.length < MIN_FRAMES) return tier;
    if (median(frameMs) <= SLOW_FRAME_MS) return tier;
    const i = TIERS.indexOf(tier);
    return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : tier;
  }

  function parseChoice(value) {
    return CHOICES.includes(value) ? value : "auto";
  }

  function effectiveTier(choice, autoTier) {
    return TIERS.includes(choice) ? choice : autoTier;
  }

  function passesFor(tier) {
    const high = tier === "high";
    const on = tier === "high" || tier === "medium";
    return { composer: on, bloom: on, grade: on, flare: high, speedBlur: high, haze: high, bursts: on };
  }

  // The render pixel ratio (docs/superpowers/specs/2026-10-05-performance-
  // headroom-design.md): each tier's cap, never above the screen's own, and
  // the floor dynamic resolution may lower it to.
  const PIXEL_RATIO = { high: 2, medium: 1.5, low: 1 };
  const RATIO_FLOOR = { high: 1.25, medium: 1, low: 0.75 };
  const ratioCap = (tier, screen) => Math.min(screen || 1, PIXEL_RATIO[tier] ?? 1);
  const ratioFloor = (tier, screen) => Math.min(ratioCap(tier, screen), RATIO_FLOOR[tier] ?? 1);

  // Dynamic resolution, judged a window of frames at a time.
  const SCALE_WINDOW = 60;
  const SCALE_STEP = 0.125;
  // Steady windows before probing a step up when no headroom can be seen (a
  // 60 Hz screen); doubled each time a probe fails.
  const PROBE_WINDOWS = 5;
  // Longer than this is a pause or a load, not a frame.
  const GAP_MS = 250;
  // Missing 60 fps: the median frame, or the slowest tenth.
  const SLOW_MEDIAN_MS = 18.5;
  const SLOW_P90_MS = 26;
  // Clear headroom: the slowest tenth well inside a 60 fps frame.
  const HEADROOM_P90_MS = 12;

  function createScaler({ cap, floor }) {
    let frames = [];
    let steady = 0;
    let probeWait = PROBE_WINDOWS;
    let block = 0;
    let windowIndex = 0;
    let lastUp = -Infinity;
    const s = {
      ratio: cap,
      cap,
      floor: Math.min(floor, cap),
      slowAtFloor: false,
      get atFloor() { return s.ratio <= s.floor; },
      sample(ms) {
        if (!(ms > 0) || ms > GAP_MS) return s.ratio;
        frames.push(ms);
        if (frames.length >= SCALE_WINDOW) {
          judge(frames);
          frames = [];
        }
        return s.ratio;
      },
      reset(next) {
        s.cap = next.cap;
        s.floor = Math.min(next.floor, next.cap);
        s.ratio = s.cap;
        s.slowAtFloor = false;
        frames = [];
        steady = 0;
        block = 0;
        probeWait = PROBE_WINDOWS;
        lastUp = -Infinity;
      },
    };
    function judge(list) {
      windowIndex += 1;
      const sorted = [...list].sort((a, b) => a - b);
      const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      const med = at(0.5);
      const p90 = at(0.9);
      // The screen's own refresh, near enough: the quicker frames.
      const refresh = at(0.1);
      const slow = med > SLOW_MEDIAN_MS || p90 > SLOW_P90_MS;
      // A high-refresh screen's frames alternating between one refresh and
      // two: each makes 60 fps, but the motion judders.
      const late = sorted.filter((v) => v > refresh * 1.5).length / sorted.length;
      const judder = !slow && refresh < 12 && late > 0.2 && late < 0.8;
      if (slow || judder) {
        steady = 0;
        if (s.ratio <= s.floor) {
          s.slowAtFloor = slow;
          return;
        }
        // Down soon after a step up: that step failed, so wait longer next time.
        if (windowIndex - lastUp <= 2) {
          probeWait *= 2;
          block = probeWait;
        } else {
          block = 0;
        }
        s.ratio = Math.max(s.floor, s.ratio - SCALE_STEP);
        return;
      }
      s.slowAtFloor = false;
      if (s.ratio >= s.cap) {
        steady = 0;
        return;
      }
      steady += 1;
      if (block > 0) block -= 1;
      const headroom = p90 < HEADROOM_P90_MS;
      if ((headroom && block === 0) || steady >= probeWait) {
        s.ratio = Math.min(s.cap, s.ratio + SCALE_STEP);
        lastUp = windowIndex;
        steady = 0;
      }
    }
    return s;
  }

  // Auto's tier: one down when dynamic resolution has done all it can.
  function nextAutoTier(tier, scaler) {
    if (!scaler || !scaler.slowAtFloor) return tier;
    const i = TIERS.indexOf(tier);
    return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : tier;
  }

  return {
    nextAutoTier,
    TIERS, CHOICES, SLOW_FRAME_MS, MIN_FRAMES, initialTier, adjustTier, parseChoice, effectiveTier, passesFor,
    PIXEL_RATIO, RATIO_FLOOR, ratioCap, ratioFloor, SCALE_WINDOW, SCALE_STEP, PROBE_WINDOWS, createScaler,
  };
}));
