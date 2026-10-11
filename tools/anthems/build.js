// Builds anthem-data.js (the podium's anthems as note lists) from the sources
// kept beside this file: MIDI files from Wikimedia Commons (sources/), read
// mechanically, and melodies read by hand from public-domain scores
// (transcribed/, each naming its score). Nothing is written from memory.
// Run: node tools/anthems/build.js   (tests/anthems.test.js checks the
// committed anthem-data.js is exactly what this produces.)
const fs = require("fs");
const path = require("path");
const { readMidi } = require("./midi.js");

// Each anthem: the composition (public domain, with why), and where its notes
// were taken from. MIDI: which track is the tune and which the bass, and the
// stretches (in quarter notes) that make the excerpt.
const ANTHEMS = {
  fr: {
    country: "France", title: "La Marseillaise", composer: "Claude Joseph Rouget de Lisle (1792)",
    midi: { file: "fr.mid", melody: 1, bass: 4, parts: [[0.25, 31.5]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:Allons,_enfants_de_la_patrie.mid", author: "Rabanus Flavus (Peter Gerloff)", licence: "CC0 1.0" },
  },
  gb: {
    country: "United Kingdom", title: "God Save the King", composer: "Anonymous (18th century)",
    midi: { file: "gb.mid", melody: 1, bass: 4, parts: [[0.5, 42]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:British_Royal_Anthem.mid", author: "Rabanus Flavus (Peter Gerloff)", licence: "CC BY 4.0" },
  },
  de: {
    country: "Germany", title: "Das Lied der Deutschen", composer: "Joseph Haydn (1797)",
    // The first line once (the source repeats it), then the rest of the verse.
    midi: { file: "de.mid", melody: 1, bass: 4, parts: [[0.25, 16.25], [32.25, 63.75]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:Einigkeit_und_Recht.mid", author: "Rabanus Flavus (Peter Gerloff)", licence: "CC0 1.0" },
  },
  jp: {
    country: "Japan", title: "Kimigayo", composer: "Hayashi Hiromori and Oku Yoshiisa (1880)",
    midi: { file: "jp.mid", melody: 1, bass: 4, parts: [[0, 44]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:Kimigayo_MIDI.mid", author: "www.nationalanthems.info", licence: "CC BY 4.0" },
  },
  ca: {
    country: "Canada", title: "O Canada", composer: "Calixa Lavallée (1880)",
    // The opening two lines, then the closing line.
    midi: { file: "ca.mid", melody: 1, bass: 3, parts: [[0, 31], [96, 112]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:O_Canada.mid", author: "Denelson83", licence: "Public domain" },
  },
  au: {
    country: "Australia", title: "Advance Australia Fair", composer: "Peter Dodds McCormick (1878)",
    midi: { file: "au.mid", melody: 1, bass: 4, parts: [[3, 67]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:Advance_Australia_Fair.mid", author: "Brian Yap, from the 1907 first edition", licence: "Public domain" },
  },
  nl: {
    country: "Netherlands", title: "Wilhelmus", composer: "Anonymous (16th century; Valerius, 1626)",
    score: "nl.txt",
    source: { author: "Wilhelmus (Wikimedia Commons)", licence: "Public domain" },
  },
  es: {
    country: "Spain", title: "Marcha Real", composer: "Anonymous (Marcha Granadera, 1761)",
    score: "es.txt",
    source: { author: "Alberto Betancourt (piano transcription)", licence: "Public domain" },
  },
  mc: {
    country: "Monaco", title: "Hymne Monégasque", composer: "Théophile Bellando de Castro (1841), arranged by Charles Albrecht (1867)",
    score: "mc.txt",
    source: { author: "nationalanthems.info (score set by Jo Hyo-roe)", licence: "CC BY 4.0" },
  },
  nz: {
    country: "New Zealand", title: "God Defend New Zealand", composer: "John Joseph Woods (1876)",
    score: "nz.txt",
    source: { author: "nationalanthems.info (the New Zealand Gazette's setting)", licence: "CC BY 4.0" },
  },
  th: {
    country: "Thailand", title: "Phleng Chat Thai", composer: "Phra Chenduriyang (1932)",
    score: "th.txt",
    source: { author: "Royal Thai Government Gazette, 1939", licence: "Public domain" },
  },
};

const GRID = 0.25;
const snap = (x) => Math.round(x / GRID) * GRID;
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// One line of a MIDI track: at each onset the top (or bottom) note, held
// until its own end or the next onset, whichever comes first.
function line(notes, parts, pick) {
  const out = [];
  let offset = 0;
  parts.forEach(([from, to]) => {
    const byStart = new Map();
    notes.forEach((n) => {
      const start = snap(n.start);
      if (start < from || start >= to) return;
      const have = byStart.get(start);
      if (!have || pick(n.pitch, have.pitch)) byStart.set(start, { pitch: n.pitch, start, end: Math.max(start + GRID, Math.ceil((n.end - 0.06) / GRID) * GRID) });
    });
    const picked = [...byStart.values()].sort((a, b) => a.start - b.start);
    picked.forEach((n, i) => {
      const next = i + 1 < picked.length ? picked[i + 1].start : to;
      out.push([n.pitch, n.start - from + offset, Math.min(n.end, next) - n.start]);
    });
    offset += to - from;
  });
  return { notes: out, beats: offset };
}

// "C#5/1.5" tokens and "r/1" rests, in quarter notes, one after another.
function parseLine(text) {
  const notes = [];
  let at = 0;
  text.trim().split(/\s+/).forEach((token) => {
    const m = /^(r|([A-G])([#b]?)(\d))\/(\d+(?:\.\d+)?)$/.exec(token);
    if (!m) throw new Error(`bad note "${token}"`);
    const dur = Number(m[5]);
    if (m[1] !== "r") notes.push([NAMES[m[2]] + (m[3] === "#" ? 1 : m[3] === "b" ? -1 : 0) + (Number(m[4]) + 1) * 12, at, dur]);
    at += dur;
  });
  return { notes, beats: at };
}

function fromScore(file) {
  const text = fs.readFileSync(path.join(__dirname, "transcribed", file), "utf8");
  const field = (name) => text.split("\n").filter((l) => l.startsWith(`${name}:`)).map((l) => l.slice(name.length + 1).trim());
  const melody = parseLine(field("melody").join(" "));
  const bass = parseLine(field("bass").join(" "));
  if (Math.abs(melody.beats - bass.beats) > 1e-9) throw new Error(`${file}: the melody is ${melody.beats} beats, the bass ${bass.beats}`);
  return { bpm: Number(field("bpm")[0]), beats: melody.beats, melody: melody.notes, bass: bass.notes, url: field("source")[0] };
}

function fromMidi({ file, melody, bass, parts }) {
  const midi = readMidi(fs.readFileSync(path.join(__dirname, "sources", file)));
  const tune = line(midi.tracks[melody].notes, parts, (a, b) => a > b);
  const low = line(midi.tracks[bass].notes, parts, (a, b) => a < b);
  return { bpm: Math.round(midi.tempo * 10) / 10, beats: tune.beats, melody: tune.notes, bass: low.notes };
}

function build() {
  const out = {};
  Object.entries(ANTHEMS).forEach(([key, a]) => {
    const notes = a.midi ? fromMidi(a.midi) : fromScore(a.score);
    out[key] = {
      country: a.country, title: a.title, composer: a.composer,
      bpm: notes.bpm, beats: notes.beats,
      melody: notes.melody, bass: notes.bass,
      source: { kind: a.midi ? "midi" : "score", url: notes.url || a.source.url, author: a.source.author, licence: a.source.licence },
    };
  });
  const rows = Object.entries(out).map(([key, a]) => {
    const { melody, bass, ...rest } = a;
    return `    ${key}: ${JSON.stringify(rest).slice(0, -1)},\n      melody: ${JSON.stringify(melody)},\n      bass: ${JSON.stringify(bass)} },`;
  });
  return `// The podium's national anthems as note lists: [MIDI pitch, start, length] in
// quarter notes, a melody and a bass line each, with where they came from.
// GENERATED by tools/anthems/build.js from the sources in tools/anthems; edit
// those, not this. Every composition is in the public domain; see
// THIRD-PARTY-NOTICES.md for each source and its licence.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AnthemData = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => (
  {
${rows.join("\n")}
  }
)));
`;
}

module.exports = { build, ANTHEMS };
if (require.main === module) {
  const file = path.join(__dirname, "..", "..", "anthem-data.js");
  fs.writeFileSync(file, build());
  const data = require(file);
  Object.entries(data).forEach(([k, a]) => console.log(k, a.title, `${a.melody.length} notes, ${a.beats} beats at ${a.bpm} = ${((a.beats * 60) / a.bpm).toFixed(1)} s`));
}
