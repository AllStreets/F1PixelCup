// Renders the engine start-up sounds to a WAV for listening
// (docs/superpowers/specs/2026-10-05-sound-design.md, "Starting up"), from
// the same code the game plays (engine-sound.js: renderStartup, startPlan):
// first a qualifying start (the player's own car), then, after a pause, a
// race start from the back of the grid (the player's and six of the
// field's). Run: node tools/render-engine-start.js [out.wav]
const fs = require("fs");
const path = require("path");
const EngineSound = require("../engine-sound.js");

const RATE = 24000;
const out = process.argv[2] || path.join(__dirname, "..", "docs", "review", "2026-10-10", "engine-start.wav");

// A plan mixed as the game mixes it: each start-up at its delay, level and
// rate (the rate by linear resampling, as a buffer source plays it).
function mix(plan) {
  const parts = plan.map((p) => ({ ...p, audio: EngineSound.renderStartup(p.seed, RATE) }));
  const seconds = Math.max(...parts.map((p) => p.delay + p.audio.length / RATE / p.rate));
  const sum = new Float32Array(Math.ceil(seconds * RATE));
  parts.forEach((p) => {
    const at = Math.round(p.delay * RATE);
    const length = Math.floor(p.audio.length / p.rate);
    for (let i = 0; i < length; i += 1) {
      const x = i * p.rate;
      const k = Math.floor(x);
      const v = p.audio[k] + ((p.audio[k + 1] || 0) - p.audio[k]) * (x - k);
      sum[at + i] += v * p.gain;
    }
  });
  return sum;
}

const quali = mix(EngineSound.startPlan("qualifying", 3, []));
const race = mix(EngineSound.startPlan("race", 3, [5, 1, 7, 2, 8, 4]));
const gap = new Float32Array(RATE * 0.8);
const all = new Float32Array(quali.length + gap.length + race.length);
all.set(quali, 0);
all.set(race, quali.length + gap.length);
const peak = all.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
if (!(peak > 0.1)) throw new Error(`the start-up rendered silent (peak ${peak})`);

// 16-bit mono WAV.
const data = Buffer.alloc(all.length * 2);
for (let i = 0; i < all.length; i += 1) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, (all[i] / peak) * 0.89)) * 32767), i * 2);
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`${out}: ${(all.length / RATE).toFixed(1)} s (qualifying ${(quali.length / RATE).toFixed(1)} s, then the grid ${(race.length / RATE).toFixed(1)} s)`);
