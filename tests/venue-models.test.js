// Each venue's models (r3d/models.js FILES and VENUE_MODELS) and the venue
// settings that use them (r3d/landmarks.js VENUES), read from the modules'
// source: every listed model has its file, every 2025 venue has its landmark
// and its stand type, and the harbours have their yachts.
// docs/superpowers/specs/2026-10-01-landmarks-2025-design.md.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
// An object literal exported from a module, evaluated on its own.
function literal(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const start = src.indexOf(`export const ${name} = {`);
  assert.ok(start >= 0, `${file} has no ${name}`);
  const end = src.indexOf("\n};", start);
  return new Function(`return ${src.slice(src.indexOf("{", start), end + 2)};`)();
}

const FILES = literal("r3d/models.js", "FILES");
const VENUE_MODELS = literal("r3d/models.js", "VENUE_MODELS");
const VENUES = literal("r3d/landmarks.js", "VENUES");

const NEW = ["albertpark", "shanghai", "jeddah", "miami", "imola", "barcelona", "montreal", "redbullring", "hungaroring", "zandvoort", "baku", "cota", "mexico", "lasvegas", "losail", "yasmarina"];

test("every venue's model has its file", () => {
  Object.entries(VENUE_MODELS).forEach(([id, names]) => names.forEach((n) => {
    assert.ok(FILES[n], `${id}: ${n} has no file`);
    assert.ok(fs.existsSync(path.join(ROOT, FILES[n])), `${id}: ${FILES[n]} is missing`);
  }));
});

test("every 2025 venue has its landmarks, from models it loads", () => {
  NEW.forEach((id) => {
    const v = VENUES[id];
    assert.ok(v, `${id} has no venue`);
    assert.ok(Array.isArray(v.landmarks) && v.landmarks.length >= 1, `${id} lists no landmark`);
    v.landmarks.forEach((n) => assert.ok((VENUE_MODELS[id] || []).includes(n), `${id}'s ${n} is not among its models`));
    assert.ok(v.extras.includes("siteLandmarks"), `${id} doesn't build its landmarks`);
  });
});

test("every venue has its stand type", () => {
  Object.entries(VENUES).forEach(([id, v]) => assert.ok(["covered", "open"].includes(v.stand), `${id} has no stand type`));
});

test("the harbours: yachts where there is water for them, loaded with the venue", () => {
  ["yasmarina", "miami", "baku", "jeddah"].forEach((id) => {
    const v = VENUES[id];
    assert.ok(v.harbour && v.harbour.anchored > 0, `${id} has no harbour`);
    assert.ok(v.extras.includes("yachts"), `${id} doesn't place its yachts`);
    assert.ok(VENUE_MODELS[id].includes("yachts"), `${id} doesn't load the yachts`);
  });
  // The lake harbours sit on the infield's water, the sea ones off the coast.
  assert.equal(VENUES.yasmarina.harbour.anchorIn, "lake");
  assert.equal(VENUES.miami.harbour.anchorIn, "lake");
  assert.equal(VENUES.baku.harbour.anchorIn, "sea");
  assert.equal(VENUES.jeddah.harbour.anchorIn, "sea");
  // The water is made before the yachts look for it.
  ["yasmarina", "miami"].forEach((id) => assert.ok(VENUES[id].extras.indexOf("infieldLake") < VENUES[id].extras.indexOf("yachts"), `${id}: the lake after the yachts`));
  ["baku", "jeddah"].forEach((id) => assert.ok(VENUES[id].extras.indexOf("coast") < VENUES[id].extras.indexOf("yachts"), `${id}: the sea after the yachts`));
});

test("only the current venue's models load: no background load of every venue", () => {
  const src = fs.readFileSync(path.join(ROOT, "r3d/models.js"), "utf8");
  const body = src.slice(src.indexOf("export function loadTracksideModels"), src.indexOf("\n}\n", src.indexOf("export function loadTracksideModels")));
  assert.ok(!/loadAllVenueModels\s*\(/.test(body), "the core's load starts every venue's models");
});
