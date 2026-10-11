// A small Standard MIDI File reader for the anthem sources (tools/anthems):
// each track's notes as { pitch, start, end } in quarter notes, the tempo
// (first set-tempo, in quarter notes a minute) and the time signature.
function readMidi(buf) {
  let p = 0;
  const u32 = () => { const v = buf.readUInt32BE(p); p += 4; return v; };
  const u16 = () => { const v = buf.readUInt16BE(p); p += 2; return v; };
  if (buf.toString("latin1", 0, 4) !== "MThd") throw new Error("not a MIDI file");
  p = 4;
  const headerLength = u32();
  const format = u16();
  const count = u16();
  const division = u16();
  if (division & 0x8000) throw new Error("SMPTE time division is not handled");
  p = 8 + headerLength;
  const out = { format, division, tempo: null, tempos: [], timeSignature: null, tracks: [] };
  for (let n = 0; n < count; n += 1) {
    if (buf.toString("latin1", p, p + 4) !== "MTrk") throw new Error("bad track header");
    p += 4;
    const length = u32();
    const end = p + length;
    let tick = 0;
    let status = 0;
    const open = new Map();
    const track = { name: "", channel: null, program: null, notes: [] };
    const vlq = () => { let v = 0; for (;;) { const b = buf[p]; p += 1; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) return v; } };
    while (p < end) {
      tick += vlq();
      let b = buf[p];
      if (b & 0x80) { status = b; p += 1; } else b = status;
      if (status === 0xff) {
        const type = buf[p]; p += 1;
        const len = vlq();
        if (type === 0x51) {
          const bpm = 60000000 / buf.readUIntBE(p, 3);
          out.tempos.push({ at: tick / division, bpm });
          if (out.tempo === null) out.tempo = bpm;
        } else if (type === 0x58 && !out.timeSignature) out.timeSignature = [buf[p], 2 ** buf[p + 1]];
        else if (type === 0x03) track.name = buf.toString("latin1", p, p + len);
        p += len;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else {
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const d1 = buf[p]; p += 1;
        let d2 = 0;
        if (kind !== 0xc0 && kind !== 0xd0) { d2 = buf[p]; p += 1; }
        if (kind === 0xc0) track.program = d1;
        const key = `${channel}:${d1}`;
        if (kind === 0x90 && d2 > 0) {
          track.channel = channel;
          if (!open.has(key)) open.set(key, tick);
        } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
          if (open.has(key)) {
            track.notes.push({ pitch: d1, start: open.get(key) / division, end: tick / division });
            open.delete(key);
          }
        }
      }
    }
    p = end;
    track.notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch);
    out.tracks.push(track);
  }
  return out;
}

module.exports = { readMidi };
