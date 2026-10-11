// Renders the podium's sound to WAVs for listening
// (docs/superpowers/specs/2026-10-11-podium-sound-design.md), from the same
// code the game plays (podium-sound.js, ceremony.js): the whole celebration
// with one winner's anthem (podium-celebration.wav: Monaco's), and each
// anthem on its own (anthem-<country>.wav) with the fanfare that stands in
// where there is none. Run: node tools/render-podium-sound.js [out-dir]
const fs = require("fs");
const path = require("path");
const Ceremony = require("../ceremony.js");
const PodiumSound = require("../podium-sound.js");

const RATE = PodiumSound.RATE;
const dir = process.argv[2] || path.join(__dirname, "..", "docs", "review", "2026-10-12");

// 16-bit mono WAV, exactly as rendered (the game plays these samples at these
// levels): a sound that would clip is an error, not something to scale away.
function write(name, samples, rate = RATE) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  if (!(peak > 0.1)) throw new Error(`${name} rendered silent (peak ${peak})`);
  if (peak > 1) throw new Error(`${name} clips (peak ${peak})`);
  const scale = 1;
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(Math.round(samples[i] * scale * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), Buffer.concat([header, data]));
  console.log(`${name}: ${(samples.length / rate).toFixed(1)} s`);
}

const slug = (country) => country.toLowerCase().replace(/[^a-z]+/g, "-");
const winner = "mc";
write("podium-celebration.wav", PodiumSound.mix(Ceremony.withAnthem(PodiumSound.anthemSeconds(winner)), winner));
// (The anthems alone at 16 kHz, to keep the files small; the game plays them at 24.)
const SMALL = 16000;
Object.entries(PodiumSound.ANTHEMS).forEach(([key, a]) => write(`anthem-${slug(a.country)}.wav`, PodiumSound.renderPiece(key, SMALL), SMALL));
write("anthem-fallback-fanfare.wav", PodiumSound.renderPiece(null, SMALL), SMALL);
