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
// stretches (in quarter notes) that make the excerpt: [from, to], or
// [from, to, rest] to add a rest after it (where the cut leaves a bar short).
// overlaps: where the tune's own track holds a note under the next (named,
// so that any other is caught). bassSingles: the bass track is a piano's
// left hand (a bass note, then chords); only its bass notes are taken.
const ANTHEMS = {
  fr: {
    country: "France", title: "La Marseillaise", composer: "Claude Joseph Rouget de Lisle (1792)",
    midi: { file: "fr.mid", melody: 1, bass: 4, parts: [[0.25, 31.5]], bassSingles: true },
    source: { url: "https://commons.wikimedia.org/wiki/File:Allons,_enfants_de_la_patrie.mid", author: "Rabanus Flavus (Peter Gerloff)", licence: "CC0 1.0" },
  },
  gb: {
    country: "United Kingdom", title: "God Save the King", composer: "Anonymous (18th century)",
    midi: { file: "gb.mid", melody: 1, bass: 4, parts: [[0.5, 42]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:British_Royal_Anthem.mid", author: "Rabanus Flavus (Peter Gerloff)", licence: "CC BY 4.0" },
  },
  de: {
    country: "Germany", title: "Das Lied der Deutschen", composer: "Joseph Haydn (1797)",
    // The first line once (the source repeats it), then the rest of the verse
    // (to the end of its last bar).
    midi: { file: "de.mid", melody: 1, bass: 4, parts: [[0.25, 16.25], [32.25, 64.25]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:Einigkeit_und_Recht.mid", author: "Rabanus Flavus (Peter Gerloff)", licence: "CC0 1.0" },
  },
  jp: {
    country: "Japan", title: "Kimigayo", composer: "Hayashi Hiromori and Oku Yoshiisa (1880)",
    midi: { file: "jp.mid", melody: 1, bass: 4, parts: [[0, 44]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:Kimigayo_MIDI.mid", author: "www.nationalanthems.info", licence: "CC BY 4.0" },
  },
  ca: {
    country: "Canada", title: "O Canada", composer: "Calixa Lavallée (1880)",
    // The opening two lines, then the closing line. The cut comes before the
    // upbeat to the third line (on the bar's last beat), so that beat is a
    // rest. Bar 1's rhythm (1.75 then 0.25 where the later bars have 1.5 and
    // 0.5) is the source's own, kept as it is.
    midi: { file: "ca.mid", melody: 1, bass: 3, parts: [[0, 31, 1], [96, 112]] },
    source: { url: "https://commons.wikimedia.org/wiki/File:O_Canada.mid", author: "Denelson83", licence: "Public domain" },
  },
  au: {
    country: "Australia", title: "Advance Australia Fair", composer: "Peter Dodds McCormick (1878)",
    // (At beat 22 the source holds "soil" under the next note.)
    midi: { file: "au.mid", melody: 1, bass: 4, parts: [[3, 67]], overlaps: [22] },
    source: { url: "https://commons.wikimedia.org/wiki/File:Advance_Australia_Fair.mid", author: "Brian Yap, from the 1907 first edition", licence: "Public domain" },
  },
  nl: {
    country: "Netherlands", title: "Wilhelmus", composer: "Anonymous (16th century; Valerius, 1626)",
    score: "nl.txt",
    source: { author: "Wilhelmus~commonswiki (Wikimedia Commons)", licence: "Public domain" },
  },
  es: {
    country: "Spain", title: "Marcha Real", composer: "Anonymous (Marcha Granadera, 1761)",
    score: "es.txt",
    source: { author: "Alberto Betancourt (piano transcription)", licence: "Public domain" },
  },
  it: {
    country: "Italy", title: "Il Canto degli Italiani", composer: "Michele Novaro (1847)",
    score: "it.txt",
    source: { author: "Maurizio Benedetti's critical edition (IMSLP)", licence: "Public domain" },
  },
  br: {
    country: "Brazil", title: "Hino Nacional Brasileiro", composer: "Francisco Manuel da Silva (1831)",
    score: "br.txt",
    source: { author: "nationalanthems.info (piano score)", licence: "CC BY 4.0" },
  },
  // Its composer died in 1968: in the public domain in Thailand, where the
  // score was also published as a state announcement (the Royal Gazette,
  // 1939), though not yet everywhere by the life-plus-70 rule. Included at
  // the user's decision (2026-10-12).
  th: {
    country: "Thailand", title: "Phleng Chat Thai", composer: "Phra Chenduriyang (1932)",
    score: "th.txt",
    source: { author: "Royal Thai Government Gazette, 1939", licence: "Public domain" },
  },
  mc: {
    country: "Monaco", title: "Hymne Monégasque", composer: "Théophile Bellando de Castro (1841), arranged by Charles Albrecht (1867)",
    score: "mc.txt",
    source: { author: "nationalanthems.info (score set by Jo Hyo-roe)", licence: "CC BY 4.0" },
  },
  nz: {
    country: "New Zealand", title: "God Defend New Zealand", composer: "John Joseph Woods (1876)",
    score: "nz.txt",
    // Only Woods's melody is taken (he died in 1934: public domain). The page
    // it was read from is the New Zealand Gazette's 1978 setting, as
    // nationalanthems.info hosts it; that page is linked, not kept here.
    source: { author: "John Joseph Woods's melody, as printed in the New Zealand Gazette (1978), hosted by nationalanthems.info", licence: "Public domain" },
  },
};
const GRID = 0.25;
const snap = (x) => Math.round(x / GRID) * GRID;
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// One line of a MIDI track: at each onset the top (or bottom) note, held
// until its own end or the next onset, whichever comes first. A tune's note
// still sounding at the next onset means a second voice in the track, or a
// slip in the file: it throws unless that beat is named in overlaps. So does
// a note that runs over the end of a part (a cut through a note).
function line(notes, parts, pick, { overlaps = null, singles = false } = {}) {
  const out = [];
  let offset = 0;
  parts.forEach(([from, to, rest = 0]) => {
    const byStart = new Map();
    notes.forEach((n) => {
      const start = snap(n.start);
      if (start < from || start >= to) return;
      const have = byStart.get(start);
      const end = Math.max(start + GRID, Math.ceil((n.end - 0.06) / GRID) * GRID);
      if (!have) byStart.set(start, { pitch: n.pitch, start, end, count: 1 });
      else {
        have.count += 1;
        if (pick(n.pitch, have.pitch)) Object.assign(have, { pitch: n.pitch, end });
      }
    });
    let picked = [...byStart.values()].sort((a, b) => a.start - b.start);
    if (singles) {
      // A piano's left hand: the bass notes are struck alone; a chord is
      // taken (its bottom note) only where two beats pass without one.
      let last = -Infinity;
      picked = picked.filter((n) => {
        const keep = n.count === 1 || n.start - last >= 2;
        if (keep) last = n.start;
        return keep;
      });
      picked.forEach((n, i) => { n.end = Math.min(i + 1 < picked.length ? picked[i + 1].start : to, n.start + 2); });
    }
    picked.forEach((n, i) => {
      const next = i + 1 < picked.length ? picked[i + 1].start : to;
      if (overlaps && n.end > next + 1e-9 && !overlaps.includes(n.start)) {
        throw new Error(`the tune's note at beat ${n.start} runs to ${n.end}, past ${i + 1 < picked.length ? "the next note" : "the cut"} at ${next}`);
      }
      out.push([n.pitch, n.start - from + offset, Math.min(n.end, next) - n.start]);
    });
    offset += to - from + rest;
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

function fromMidi({ file, melody, bass, parts, overlaps = [], bassSingles = false }) {
  const midi = readMidi(fs.readFileSync(path.join(__dirname, "sources", file)));
  // One tempo for the excerpt: a change inside it would need handling.
  midi.tempos.slice(1).forEach((t) => {
    if (parts.some(([from, to]) => t.at > from && t.at < to)) throw new Error(`${file}: the tempo changes at beat ${t.at}, inside the excerpt`);
  });
  const tune = line(midi.tracks[melody].notes, parts, (a, b) => a > b, { overlaps });
  const low = line(midi.tracks[bass].notes, parts, (a, b) => a < b, { singles: bassSingles });
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
// THIRD-PARTY-NOTICES for each source and its licence.
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
