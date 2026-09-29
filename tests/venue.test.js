const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Venue = require("../venue.js");

const sandbox = {};
vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, "..", "tracks-data.js"), "utf8")}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, sandbox);
const SHAPES = JSON.parse(JSON.stringify(sandbox.TRACK_SHAPES));

test("reverb: none outside, full inside, easing in and out at the portals", () => {
  const zones = [{ from: 1000, to: 1500 }];
  assert.equal(Venue.reverbAt(900, zones, 5000), 0);
  assert.equal(Venue.reverbAt(1600, zones, 5000), 0);
  assert.equal(Venue.reverbAt(1250, zones, 5000), 1);
  assert.equal(Venue.reverbAt(1000, zones, 5000), 0);
  assert.equal(Venue.reverbAt(1000 + Venue.RAMP, zones, 5000), 1);
  const half = Venue.reverbAt(1000 + Venue.RAMP / 2, zones, 5000);
  assert.ok(half > 0.3 && half < 0.7);
  // Symmetric at the way out.
  assert.equal(Venue.reverbAt(1500 - Venue.RAMP / 2, zones, 5000), half);
  // A zone across the line.
  const across = [{ from: 4900, to: 200 }];
  assert.equal(Venue.reverbAt(50, across, 5000), 1);
  assert.equal(Venue.reverbAt(2500, across, 5000), 0);
});

test("the crowd: loudest level with a grandstand, fading to nothing by CROWD_REACH", () => {
  const stands = [{ d: 2000 }];
  assert.equal(Venue.crowdAt(2000, stands, 6000), 1);
  assert.equal(Venue.crowdAt(2000 + Venue.CROWD_REACH, stands, 6000), 0);
  assert.equal(Venue.crowdAt(2000 - Venue.CROWD_REACH / 2, stands, 6000), Venue.crowdAt(2000 + Venue.CROWD_REACH / 2, stands, 6000));
  assert.ok(Venue.crowdAt(2100, stands, 6000) > Venue.crowdAt(2200, stands, 6000));
  // Round the line.
  assert.equal(Venue.crowdAt(5990, [{ d: 10 }], 6000), Venue.crowdAt(30, [{ d: 10 }], 6000));
});

test("sound zones from the track: Monaco's tunnel, Suzuka's under-bridge, nowhere else", () => {
  const monaco = Venue.reverbZones(SHAPES.monaco.tunnel, [], null);
  assert.deepEqual(monaco, [{ from: SHAPES.monaco.tunnel.from, to: SHAPES.monaco.tunnel.to, kind: "tunnel" }]);
  // Suzuka: under the crossover bridge, the lower road's stretch beneath it.
  const under = [{ d: 3000 }];
  const suzuka = Venue.reverbZones(null, under, 7000);
  assert.equal(suzuka.length, 1);
  assert.equal(suzuka[0].kind, "bridge");
  assert.ok(suzuka[0].from < 3000 && suzuka[0].to > 3000 && suzuka[0].to - suzuka[0].from === 2 * Venue.UNDER_BRIDGE);
  assert.deepEqual(Venue.reverbZones(null, [], 5000), []);
});

test("the floodlit circuits hum: the same ones r3d/landmarks.js lights", () => {
  const landmarks = fs.readFileSync(path.join(__dirname, "..", "r3d", "landmarks.js"), "utf8");
  const venues = landmarks.slice(landmarks.indexOf("export const VENUES"), landmarks.indexOf("\n};", landmarks.indexOf("export const VENUES")));
  const lit = [...venues.matchAll(/^  (\w+): \{[\s\S]*?\n  \},/gm)].filter((m) => /"floodlights"/.test(m[0])).map((m) => m[1]).sort();
  assert.deepEqual([...Venue.FLOODLIT].sort(), lit);
  assert.ok(lit.includes("singapore"));
});
