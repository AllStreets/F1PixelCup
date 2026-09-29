// Venue moments, heard (docs/superpowers/specs/2026-09-29-trackside-design.md,
// G2): where on the lap the engine rings in a tunnel or under a bridge, and
// where a grandstand's crowd swells. Pure; shared by the audio in game.js and
// the tests. In the page it defines window.Venue; in Node it is require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Venue = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // The reverb rises from nothing to full over this much of the way in (and
  // falls the same way out): the sound closing round the car.
  const RAMP = 40;
  // A crowd is heard from this far, loudest when passing right by it.
  const CROWD_REACH = 420;

  // Signed distance from a to b round a lap of `total`, in (-total/2, total/2].
  function delta(a, b, total) {
    let d = ((b - a) % total + total) % total;
    if (d > total / 2) d -= total;
    return d;
  }

  const smooth = (t) => t * t * (3 - 2 * t);

  // How much reverb at lap distance d: 0 outside every zone, 1 inside, easing
  // over RAMP at each end. zones: [{ from, to }], lap distances in racing
  // order (a zone may run across the line).
  function reverbAt(d, zones, total) {
    let level = 0;
    (zones || []).forEach(({ from, to }) => {
      const length = ((to - from) % total + total) % total;
      const into = ((d - from) % total + total) % total;
      if (into > length) return;
      const edge = Math.min(into, length - into);
      level = Math.max(level, smooth(Math.min(1, edge / RAMP)));
    });
    return level;
  }

  // How loud the crowd is at lap distance d: stands: [{ d }], each heard
  // within CROWD_REACH, loudest level with it.
  function crowdAt(d, stands, total) {
    let level = 0;
    (stands || []).forEach((s) => {
      const gap = Math.abs(delta(s.d, d, total));
      if (gap < CROWD_REACH) level = Math.max(level, smooth(1 - gap / CROWD_REACH));
    });
    return level;
  }

  // Under a bridge the engine rings off the deck above: over this much either
  // side of where the lower road passes beneath (the upper road's width and
  // its run-off).
  const UNDER_BRIDGE = 70;

  // The reverb zones of a circuit: its tunnel (track data, from
  // OpenStreetMap), and the stretch beneath each bridge ({ d } where the
  // lower road passes under).
  function reverbZones(tunnel, under, total) {
    const zones = [];
    if (tunnel) zones.push({ from: tunnel.from, to: tunnel.to, kind: "tunnel" });
    (under || []).forEach(({ d }) => {
      zones.push({ from: ((d - UNDER_BRIDGE) % total + total) % total, to: (d + UNDER_BRIDGE) % total, kind: "bridge" });
    });
    return zones;
  }

  // Circuits lit by floodlight towers all the way round (r3d/landmarks.js
  // VENUES, "floodlights"): the lights' mains hum is always faintly there.
  const FLOODLIT = ["singapore", "bahrain"];

  return { RAMP, CROWD_REACH, UNDER_BRIDGE, FLOODLIT, delta, reverbAt, crowdAt, reverbZones };
}));
