// The race's two signal sounds
// (docs/design/specs/2026-10-11-flag-and-safety-car-signals-design.md):
// the Safety Car coming out, and the Steward Penalty landing on a player.
// Pure: each a recipe of notes the game plays through its tone player
// (game.js playTone: an oscillator, a quick attack, an exponential fall), and
// the same recipe rendered to samples for listening (tools/
// render-signal-sounds.js). In the page it defines window.SignalSounds; in
// Node it is require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SignalSounds = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // The Safety Car: a two-tone warning, low-high four times.
  const SAFETY_CAR = Array.from({ length: 8 }, (_, i) => ({
    frequency: i % 2 ? 784 : 587, type: "triangle", duration: 0.16, volume: 0.3, delay: i * 0.17,
  }));
  // The Steward Penalty on you: a referee's double whistle (each falling a
  // little, with a quick trill a fifth of a tone above), over a low thud.
  const whistle = (delay, duration) => [
    { frequency: 2350, endFrequency: 2200, type: "sawtooth", duration, volume: 0.2, delay },
    { frequency: 2490, endFrequency: 2330, type: "square", duration, volume: 0.09, delay: delay + 0.012 },
  ];
  const STEWARD_HIT = [
    ...whistle(0, 0.14),
    ...whistle(0.2, 0.34),
    { frequency: 140, endFrequency: 55, type: "sine", duration: 0.4, volume: 0.34, delay: 0.02 },
  ];

  // How long a recipe lasts, in seconds.
  function length(recipe) {
    return Math.max(...recipe.map((n) => n.delay + n.duration));
  }

  const WAVES = {
    sine: (p) => Math.sin(p * 2 * Math.PI),
    square: (p) => (p % 1 < 0.5 ? 1 : -1),
    sawtooth: (p) => 2 * (p % 1) - 1,
    triangle: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
  };

  // A recipe as samples (mono, -1..1), as playTone plays it: each note's
  // pitch gliding to its end, its level up in 12 ms and falling away.
  function render(recipe, rate) {
    const out = new Float32Array(Math.ceil((length(recipe) + 0.05) * rate));
    recipe.forEach((n) => {
      const from = Math.round(n.delay * rate);
      const count = Math.round(n.duration * rate);
      const wave = WAVES[n.type] || WAVES.square;
      let phase = 0;
      for (let i = 0; i < count; i += 1) {
        const t = i / rate;
        const f = n.endFrequency ? n.frequency * Math.pow(n.endFrequency / n.frequency, t / n.duration) : n.frequency;
        phase += f / rate;
        const env = t < 0.012 ? t / 0.012 : Math.pow(0.0001 / n.volume, (t - 0.012) / (n.duration - 0.012));
        out[from + i] += wave(phase) * n.volume * env;
      }
    });
    return out;
  }

  return { SAFETY_CAR, STEWARD_HIT, length, render };
}));
