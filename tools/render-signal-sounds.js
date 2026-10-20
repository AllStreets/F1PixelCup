// Renders the race's two signal sounds to WAV for listening
// (docs/design/specs/2026-10-11-flag-and-safety-car-signals-design.md),
// from the same recipes the game plays (signal-sounds.js).
// Run: node tools/render-signal-sounds.js [out directory]
const fs = require("fs");
const path = require("path");
const SignalSounds = require("../signal-sounds.js");

const RATE = 44100;
const dir = process.argv[2] || path.join(__dirname, "..", "docs", "review", "2026-10-11");

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

fs.mkdirSync(dir, { recursive: true });
[["safety-car-out", SignalSounds.SAFETY_CAR], ["steward-penalty-hit", SignalSounds.STEWARD_HIT]].forEach(([name, recipe]) => {
  const pcm = SignalSounds.render(recipe, RATE);
  const peak = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (!(peak > 0.1)) throw new Error(`${name} rendered silent (peak ${peak})`);
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, wav(pcm));
  console.log(`${file}: ${(pcm.length / RATE).toFixed(2)} s, peak ${peak.toFixed(2)}`);
});
