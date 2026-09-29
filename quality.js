// Graphics quality: which post-processing each machine gets
// (docs/superpowers/specs/2026-09-29-postfx-design.md). Pure rules; in the page
// this defines window.Quality, in Node it is require()-able for the tests.
//
// A first guess comes from the device. In the first seconds of racing the
// frame times are measured and the tier steps down once if they run slow; it
// never steps up on its own. The player's choice in Settings (auto, high,
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
    // GPUs and anything with the cores to spare: high.
    const integrated = /intel|uhd|iris|mali|adreno|powervr/.test(g);
    if (integrated) return "medium";
    if ((cores || 0) >= 6 || /apple m\d|nvidia|geforce|radeon|rtx|gtx/.test(g)) return "high";
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

  return { TIERS, CHOICES, SLOW_FRAME_MS, MIN_FRAMES, initialTier, adjustTier, parseChoice, effectiveTier, passesFor };
}));
