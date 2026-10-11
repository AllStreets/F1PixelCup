const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const AnthemData = require("../anthem-data.js");
const PodiumSound = require("../podium-sound.js");
const { DRIVERS } = require("../game-data.js");
const { build, ANTHEMS: SOURCES } = require("../tools/anthems/build.js");

const root = path.join(__dirname, "..");

test("the committed note lists are exactly what the sources build to (nothing edited by hand, nothing from memory)", () => {
  assert.equal(fs.readFileSync(path.join(root, "anthem-data.js"), "utf8"), build());
  // Every anthem has a source file in the repository to check it against.
  Object.entries(SOURCES).forEach(([key, a]) => {
    const file = a.midi ? path.join(root, "tools", "anthems", "sources", a.midi.file) : path.join(root, "tools", "anthems", "transcribed", a.score);
    assert.ok(fs.existsSync(file), `${key}: ${file}`);
  });
});

test("every driver races under a country, and each maps to its anthem or to the fanfare", () => {
  assert.equal(DRIVERS.length, 20);
  const want = {
    verstappen: "nl", lawson: "nz", leclerc: "mc", hamilton: "gb", norris: "gb", piastri: "au", russell: "gb", antonelli: null,
    alonso: "es", stroll: "ca", gasly: "fr", doohan: "au", albon: null, sainz: "es", bearman: "gb", ocon: "fr", tsunoda: "jp",
    hadjar: "fr", hulkenberg: "de", bortoleto: null,
  };
  DRIVERS.forEach((d) => {
    assert.ok(typeof d.country === "string" && d.country.length > 2, d.id);
    assert.equal(PodiumSound.anthemFor(d), want[d.id], d.id);
  });
  // The three without an anthem here (no score free to use for Italy and
  // Brazil; Thailand's not clearly free everywhere), no others.
  assert.deepEqual(DRIVERS.filter((d) => !PodiumSound.anthemFor(d)).map((d) => d.country).sort(), ["Brazil", "Italy", "Thailand"]);
  assert.equal(Object.keys(AnthemData).length, 10);
  assert.equal(PodiumSound.anthemFor(null), null);
  assert.equal(PodiumSound.anthemFor({ country: "Atlantis" }), null);
  // Every anthem here is some driver's.
  Object.keys(AnthemData).forEach((key) => assert.ok(DRIVERS.some((d) => PodiumSound.anthemFor(d) === key), key));
});

test("each anthem: a sane excerpt (length, range, notes in order, the bass under the tune) and its source and licence recorded", () => {
  const free = ["Public domain", "CC0 1.0", "CC BY 4.0"];
  Object.entries(AnthemData).forEach(([key, a]) => {
    const secs = (a.beats * 60) / a.bpm;
    assert.ok(secs >= 14 && secs <= 40, `${key}: ${secs.toFixed(1)} s`);
    assert.ok(a.bpm >= 60 && a.bpm <= 200, `${key}: bpm ${a.bpm}`);
    assert.ok(a.melody.length >= 25 && a.melody.length <= 90, `${key}: ${a.melody.length} notes`);
    assert.ok(a.bass.length >= 8, `${key}: bass`);
    [a.melody, a.bass].forEach((line) => {
      let end = 0;
      line.forEach(([pitch, start, length]) => {
        assert.ok(Number.isInteger(pitch) && length >= 0.25 && start >= end - 1e-9, `${key}: ${[pitch, start, length]}`);
        assert.ok(start + length <= a.beats + 1e-9, `${key}: a note runs past the end`);
        end = start + length;
      });
    });
    const tune = a.melody.map((n) => n[0]);
    const low = a.bass.map((n) => n[0]);
    // A singable tune: within an octave and a sixth, in a brass band's reach.
    assert.ok(Math.max(...tune) - Math.min(...tune) <= 21, `${key}: range ${Math.max(...tune) - Math.min(...tune)}`);
    assert.ok(Math.min(...tune) >= 55 && Math.max(...tune) <= 98, `${key}: tune ${Math.min(...tune)}..${Math.max(...tune)}`);
    assert.ok(Math.max(...low) <= 62 && Math.min(...low) >= 28, `${key}: bass ${Math.min(...low)}..${Math.max(...low)}`);
    // It ends held (a cadence), not cut off mid-phrase: the last note at least a beat, to the end.
    const last = a.melody[a.melody.length - 1];
    assert.ok(last[2] >= 1 && last[1] + last[2] >= a.beats - 1.01, `${key}: ends on ${last}`);
    assert.ok(a.country && a.title && a.composer, key);
    // Whole bars where the anthem starts on a downbeat or was pieced together.
    if (["ca", "es", "mc", "nz", "jp", "au", "de"].includes(key)) assert.equal(a.beats % 4, 0, `${key}: ${a.beats} beats`);
    assert.match(a.source.url, /^https:\/\/(commons\.wikimedia\.org\/wiki\/File:|nationalanthems\.info\/)/, key);
    assert.ok(free.includes(a.source.licence), `${key}: ${a.source.licence}`);
    assert.ok(a.source.author.length > 3 && ["midi", "score"].includes(a.source.kind), key);
  });
});

test("the notices and the README credit every anthem's source and licence", () => {
  const notices = fs.readFileSync(path.join(root, "THIRD-PARTY-NOTICES"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  Object.entries(AnthemData).forEach(([key, a]) => {
    assert.ok(notices.includes(a.source.url), `notices: ${key} url`);
    const row = notices.split("\n").find((l) => l.includes(a.source.url));
    assert.ok(row.includes(a.title) && row.includes(a.source.licence), `notices: ${key} row`);
    assert.ok(readme.includes(a.title), `README: ${a.title}`);
  });
  assert.ok(!/—/.test(notices));
  // What is not there is said, and why.
  assert.match(notices, /Italy/);
  assert.match(notices, /Brazil/);
  assert.match(notices, /Thailand/);
});

test("well-known openings, as a guard against a slip in the build (intervals in semitones from the first note)", () => {
  const opening = (key, n) => AnthemData[key].melody.slice(0, n).map((x) => x[0] - AnthemData[key].melody[0][0]);
  // God Save the King: the same note twice, up a tone, down to the leading note, back up.
  assert.deepEqual(opening("gb", 6), [0, 0, 2, -1, 0, 2]);
  // La Marseillaise: three upbeat notes, then up a fourth.
  assert.deepEqual(opening("fr", 6), [0, 0, 0, 5, 5, 7]);
  // Haydn's hymn: up by step, back, up.
  assert.deepEqual(opening("de", 6), [0, 2, 4, 2, 5, 4]);
  // The melody and bass of each MIDI anthem really are different lines.
  ["fr", "gb", "de", "jp", "ca", "au"].forEach((k) => assert.ok(Math.min(...AnthemData[k].melody.map((n) => n[0])) > Math.min(...AnthemData[k].bass.map((n) => n[0])) + 7, k));
  // La Marseillaise's bass is the left hand's bass notes (two beats each),
  // not the chords between them. There, and under the two tunes whose bass
  // this game wrote, no bass note sits a major seventh or a minor ninth
  // below a tune note held with it (a source's own harmony is left as it is).
  assert.ok(AnthemData.fr.bass.every((n) => n[2] === 2));
  Object.entries(AnthemData).filter(([key]) => ["fr", "nl", "nz"].includes(key)).forEach(([key, a]) => a.bass.forEach(([low, at, length]) => a.melody.forEach(([high, start, held]) => {
    if (Math.min(start + held, at + length) - Math.max(start, at) >= 0.75) {
      assert.notEqual((high - low) % 12, 11, `${key}: a major seventh at beat ${Math.max(start, at)}`);
      assert.notEqual((high - low) % 12, 1, `${key}: a minor ninth at beat ${Math.max(start, at)}`);
    }
  })));
});

test("the MIDI reader and the builder refuse what they can't read rightly", () => {
  const { readMidi } = require("../tools/anthems/midi.js");
  const header = (tracks) => Buffer.concat([Buffer.from("MThd"), Buffer.from([0, 0, 0, 6, 0, 1, 0, tracks, 0, 96])]);
  const track = (bytes) => Buffer.concat([Buffer.from("MTrk"), Buffer.from([0, 0, 0, bytes.length]), Buffer.from(bytes)]);
  const end = [0, 0xff, 0x2f, 0];
  // A note on and off, with running status (the second message has no status byte).
  const ok = readMidi(Buffer.concat([header(1), track([0, 0x90, 60, 100, 96, 60, 0, ...end])]));
  assert.deepEqual(ok.tracks[0].notes, [{ pitch: 60, start: 0, end: 1 }]);
  assert.equal(ok.tempo, 120, "no tempo given: 120");
  // A data byte after a meta event has no status to run on.
  assert.throws(() => readMidi(Buffer.concat([header(1), track([0, 0xff, 0x03, 1, 65, 0, 60, 100, ...end])])), /no status/);
  // A note that never ends.
  assert.throws(() => readMidi(Buffer.concat([header(1), track([0, 0x90, 60, 100, ...end])])), /never end/);
  assert.throws(() => readMidi(Buffer.from("not a midi file at all")), /not a MIDI/);
});
