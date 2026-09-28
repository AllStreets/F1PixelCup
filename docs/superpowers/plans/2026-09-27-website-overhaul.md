# Website Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single scrolling page with a Broadcast-styled landing page (`index.html`) and a full-window game page (`play.html`) whose menus are real screens (Showroom pit lane, results, podium, career, settings) plus a live timing tower and feed ticker.

**Architecture:** Shared data moves to `game-data.js`; pure helpers `trackmap.js` and `device.js` are unit-tested in Node. `screens.js` owns every piece of game-page DOM and talks to `game.js` only through `window.Game` (actions + plain data); `game.js` keeps racing and the canvas HUD and calls `window.Screens`. The landing page is plain HTML/CSS + `landing.js`, loads no 3D, and uses real game shots captured by a Playwright script.

**Tech Stack:** Vanilla JS classic scripts (no build step), CSS, Three.js (unchanged), Node 22 `node --test`, Playwright MCP for browser checks and shot capture, macOS `sips` for resizing shots, Google Fonts "Titillium Web".

**Spec:** `docs/superpowers/specs/2026-09-27-website-overhaul-design.md`

## Global Constraints

- No build step and no npm dependencies. Every new script is a classic script; pure helpers also `module.exports` for Node.
- Broadcast style: dark `#07070c`, F1 red `#e10600`, italic heavy uppercase headings, skewed red primary buttons, timing-tower rows.
- Every page shows the full picture at any window size and resizes live: no letterboxing, black bars, cut-off HUD or horizontal scroll.
- Browser checks use a context with `viewport: null` and size the real window with CDP `Browser.setWindowBounds`. The only fixed viewport allowed is the phone check (390×844, smaller than the window). Close every page a check opens.
- No change to race physics, AI, lap logic, circuits, liveries or `career.js` rules.
- Out of scope: accounts, leaderboards, scoring explainer, touch controls.
- Phones: `(pointer: coarse) and (hover: none)` counts as touch-only; Play shows "Best played on a computer with a keyboard" with a "Play anyway" way through.
- After the work is verified, commit and `git push origin main` (standing user instruction).

## Review Focus

- **Window resized while a screen is open** (pit lane, results, career) — the screen reflows and the canvases still fill the window. Test: Task 3 check resizes to 1000×700 with the pit lane open and again with results open.
- **Keys pressed on menu screens** — arrow keys and Enter on the pit lane must not also drive or double-start; Esc closes the top overlay before anything else. Test: Task 3 check presses ArrowRight/Enter/Escape and asserts one driver step, one cup start, overlay closed.
- **Narrow desktop window (~520px wide)** — pit lane stacks without overlap and nothing scrolls sideways. Test: Task 3 check at 520×800 asserts `scrollWidth <= innerWidth` and the Start button is inside the window.
- **Missing shot image** (first run before capture, or a failed file) — cards show a styled fallback, never a broken image. Test: Task 5 check requests a page with shots blocked via `page.route` and asserts no `img` with `naturalWidth === 0` remains visible.
- **Stored profile values shown on the landing page and career screen** — values from storage are escaped, never injected as HTML. Test: Task 5 check seeds `totals.wins = "<img src=x onerror=window.__xss=1>"` and asserts `window.__xss` is undefined and the text shows 0 (career.js repairs it) — and Task 3's career-screen check does the same.

---

## File Structure

| File | Responsibility |
|---|---|
| `game-data.js` (create) | Teams, drivers (with 3-letter codes), difficulties, circuits (name, country, real length, colours), cup definitions, power-ups, `getTeamForDriver`. |
| `trackmap.js` (create) | `TrackMap.path(points, box)` → SVG path + start marker. |
| `device.js` (create) | `Device.isTouchOnly(matchMedia)`. |
| `site.css` (create) | Shared Broadcast tokens and components. |
| `play.html`, `play.css` (create) | Full-window game page and its layout. |
| `screens.js` (create) | All game-page DOM screens; `window.Screens`. |
| `game.js` (modify) | Remove DOM code; build tracks/cups from `game-data.js`; expose `window.Game`; call `Screens`. |
| `index.html`, `landing.css`, `landing.js` (rewrite/create) | Landing page. |
| `tools/capture-shots.js` (create) | Captures `assets/shots/*.jpg` from the real game. |
| `tools/checks/*.js` (create) | Committed browser checks (race sim, career, play page, landing). |
| `tests/*.test.js` (create) | Unit tests for game data, track map and device detection. |
| `styles.css` (delete) | Replaced by `site.css` + page CSS. |
| `README.md` (modify) | Pages, running, checks. |

---

### Task 1: Shared game data

**Files:**
- Create: `game-data.js`
- Create: `tests/game-data.test.js`
- Create: `tools/checks/race-sim.js`, `tools/checks/career-check.js` (moved from the git-ignored `.playwright-mcp/`)
- Modify: `game.js` (remove data now in `game-data.js`; build `TRACKS`/`CUPS`; use `POWER_UPS` in `labelizeItem`)
- Modify: `index.html` (load `game-data.js` before `game.js`)

**Interfaces:**
- Consumes: `TRACK_SHAPES` (from `tracks-data.js`), `trackDefinition(definition)` in `game.js`.
- Produces (globals in the browser, `module.exports` in Node): `TEAMS`, `DRIVERS` (each with `code`), `getTeamForDriver(driver)`, `DIFFICULTIES`, `CIRCUITS` (each `{ id, name, country, theme, lengthM, laps, roadWidth, bg }`), `CUP_DEFS` (each `{ id, name, icon, circuitIds }`), `POWER_UPS` (each `{ id, name, effect }`). In `game.js`: `TRACKS` and `CUPS` keep their current shapes.

- [ ] **Step 1: Write the failing test**

Create `tests/game-data.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Data = require("../game-data.js");

function trackShapes() {
  const src = fs.readFileSync(path.join(__dirname, "..", "tracks-data.js"), "utf8");
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${src}\nthis.TRACK_SHAPES = TRACK_SHAPES;`, context);
  return context.TRACK_SHAPES;
}

test("20 drivers, two per team, unique numbers and codes", () => {
  assert.equal(Data.DRIVERS.length, 20);
  const codes = Data.DRIVERS.map((d) => d.code);
  codes.forEach((code) => assert.match(code, /^[A-Z]{3}$/));
  assert.equal(new Set(codes).size, 20);
  assert.equal(new Set(Data.DRIVERS.map((d) => d.number)).size, 20);
  Data.TEAMS.forEach((team) => {
    assert.equal(Data.DRIVERS.filter((d) => d.teamId === team.id).length, 2, team.id);
  });
});

test("getTeamForDriver finds the driver's team", () => {
  const norris = Data.DRIVERS.find((d) => d.id === "norris");
  assert.equal(Data.getTeamForDriver(norris).id, "mclaren");
});

test("every circuit has a real outline, a country and a real length", () => {
  const shapes = trackShapes();
  assert.equal(Data.CIRCUITS.length, 8);
  Data.CIRCUITS.forEach((c) => {
    assert.ok(shapes[c.id], `${c.id} missing from tracks-data.js`);
    assert.ok(c.country.length > 0);
    assert.ok(c.lengthM > 3000 && c.lengthM < 8000);
    assert.equal(c.laps, 5);
  });
  assert.equal(Data.CIRCUITS.find((c) => c.id === "spa").lengthM, 7004);
});

test("the two cups use every circuit exactly once", () => {
  const used = Data.CUP_DEFS.flatMap((cup) => cup.circuitIds);
  assert.deepEqual([...used].sort(), Data.CIRCUITS.map((c) => c.id).sort());
  assert.deepEqual(Data.CUP_DEFS.map((cup) => cup.id), ["trophyCup", "constructorCup"]);
});

test("every power-up the game hands out has a name and an effect", () => {
  const handedOut = ["oilSlick", "debris", "drsSignPost", "undercut", "overtake", "graining",
    "engineBlast", "safetyCar", "formationLap", "powerDeploy", "stewardPenalty"];
  handedOut.forEach((id) => {
    const p = Data.POWER_UPS.find((entry) => entry.id === id);
    assert.ok(p, id);
    assert.ok(p.name && p.effect);
  });
});

test("difficulties match the career multipliers", () => {
  assert.deepEqual(Data.DIFFICULTIES.map((d) => d.id), ["rookie", "pro", "legend"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../game-data.js'` (the 29 existing tests still pass).

- [ ] **Step 3: Create `game-data.js`**

Move the `TEAMS`, `getTeamForDriver`, `DRIVERS` and `DIFFICULTIES` definitions out of `game.js` into `game-data.js` **verbatim**, adding a `code` to each driver, then add `CIRCUITS`, `CUP_DEFS` and `POWER_UPS`. The file:

```js
// Game data shared by the landing page and the game: teams, drivers,
// difficulties, circuits, cups and power-ups. Plain data and one lookup.
// A classic script (these become page globals); require()-able in Node for
// the tests.

/* TEAMS: paste the existing `const TEAMS = [ ... ];` from game.js unchanged. */

/* getTeamForDriver: paste the existing function from game.js unchanged. */

/* DRIVERS: paste the existing `const DRIVERS = [ ... ];` from game.js and add
   `code` to each entry, immediately after `name`, with these values:
   verstappen VER, lawson LAW, leclerc LEC, hamilton HAM, norris NOR,
   piastri PIA, russell RUS, antonelli ANT, alonso ALO, stroll STR,
   gasly GAS, doohan DOO, albon ALB, sainz SAI, bearman BEA, ocon OCO,
   tsunoda TSU, hadjar HAD, hulkenberg HUL, bortoleto BOR. */

/* DIFFICULTIES: paste the existing `const DIFFICULTIES = [ ... ];` from
   game.js unchanged (with its comments). */

// Circuits in cup order. lengthM is the real lap length in metres, from the
// bacinger/f1-circuits data the outlines come from.
const CIRCUITS = [
  { id: "monza", name: "Autodromo di Monza", country: "Italy", theme: "Italian speed temple", lengthM: 5793, laps: 5, roadWidth: 33, bg: { sky: "#87ceeb", grass: "#4a8c3f", accent: "#ffe08a", road: "#484850", shoulder: "#c8c0b0", horizonA: "#2a5a30", horizonB: "#5a9a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe08a" } },
  { id: "spa", name: "Circuit de Spa-Francorchamps", country: "Belgium", theme: "Belgian forest circuit", lengthM: 7004, laps: 5, roadWidth: 33, bg: { sky: "#6a8faf", grass: "#2d5a27", accent: "#c8d8e8", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1a3a1a", horizonB: "#3a6a35", curbA: "#dc0000", curbB: "#ffffff", sun: "#ddeeff" } },
  { id: "silverstone", name: "Silverstone Circuit", country: "Great Britain", theme: "British airfield classic", lengthM: 5891, laps: 5, roadWidth: 33, bg: { sky: "#aac8e0", grass: "#4c8840", accent: "#e8f0e0", road: "#505058", shoulder: "#c0b8a8", horizonA: "#304828", horizonB: "#5a7848", curbA: "#dc0000", curbB: "#ffffff", sun: "#d8e8f0" } },
  { id: "suzuka", name: "Suzuka International Racing Course", country: "Japan", theme: "Japanese technical masterpiece", lengthM: 5807, laps: 5, roadWidth: 33, bg: { sky: "#9fd0e8", grass: "#3a7a38", accent: "#ffeedd", road: "#484850", shoulder: "#b8b0a0", horizonA: "#1e4a1e", horizonB: "#408040", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" } },
  { id: "monaco", name: "Circuit de Monaco", country: "Monaco", theme: "Street circuit showpiece", lengthM: 3337, laps: 5, roadWidth: 33, bg: { sky: "#4db8e8", grass: "#3a6a88", accent: "#ffeedd", road: "#505060", shoulder: "#c8c0b8", horizonA: "#184858", horizonB: "#3878a8", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffe8aa" } },
  { id: "singapore", name: "Marina Bay Street Circuit", country: "Singapore", theme: "Night city circuit", lengthM: 4928, laps: 5, roadWidth: 33, bg: { sky: "#0a0a1e", grass: "#1a1a3a", accent: "#ffa500", road: "#3a3848", shoulder: "#545060", horizonA: "#0a0a28", horizonB: "#1a1a50", curbA: "#dc0000", curbB: "#ffffff", sun: "#ff8800" } },
  { id: "bahrain", name: "Bahrain International Circuit", country: "Bahrain", theme: "Desert twilight circuit", lengthM: 5412, laps: 5, roadWidth: 33, bg: { sky: "#cc8833", grass: "#8a6a3a", accent: "#ffe8aa", road: "#585050", shoulder: "#c8b888", horizonA: "#6a4820", horizonB: "#aa7838", curbA: "#dc0000", curbB: "#ffffff", sun: "#ffcc44" } },
  { id: "interlagos", name: "Autódromo José Carlos Pace", country: "Brazil", theme: "Brazilian passion circuit", lengthM: 4309, laps: 5, roadWidth: 33, bg: { sky: "#5598cc", grass: "#3c7838", accent: "#ffe8aa", road: "#484850", shoulder: "#b0a898", horizonA: "#1e4820", horizonB: "#3a7838", curbA: "#009c3b", curbB: "#ffdf00", sun: "#ffdd44" } },
];

const CUP_DEFS = [
  { id: "trophyCup", name: "Trophy Cup", icon: "Trophy Cup", circuitIds: ["monza", "spa", "silverstone", "suzuka"] },
  { id: "constructorCup", name: "Constructor Cup", icon: "Constructor Cup", circuitIds: ["monaco", "singapore", "bahrain", "interlagos"] },
];

// What each power-up does, in the words the How to play section uses.
const POWER_UPS = [
  { id: "overtake", name: "Overtake", effect: "A short burst of extra speed." },
  { id: "powerDeploy", name: "Power Deploy", effect: "Five seconds quicker and untouchable, with a boost: anyone you hit spins." },
  { id: "formationLap", name: "Formation Lap", effect: "Four seconds on autopilot at huge speed, spinning anyone in the way." },
  { id: "safetyCar", name: "Safety Car", effect: "Every rival wobbles, shrinks and slows for a few seconds." },
  { id: "graining", name: "Graining", effect: "Smears every rival's view for six seconds." },
  { id: "undercut", name: "Undercut", effect: "A homing shot at the car ahead." },
  { id: "stewardPenalty", name: "Steward Penalty", effect: "A homing shot at the race leader." },
  { id: "engineBlast", name: "Engine Blast", effect: "A slow shot that spins whoever it hits." },
  { id: "debris", name: "Debris", effect: "Fired straight ahead." },
  { id: "oilSlick", name: "Oil Slick", effect: "Dropped behind you; spins whoever drives through it." },
  { id: "drsSignPost", name: "DRS Sign", effect: "Dropped behind you; a long spin for whoever hits it." },
];

if (typeof module === "object" && module.exports) {
  module.exports = { TEAMS, DRIVERS, DIFFICULTIES, CIRCUITS, CUP_DEFS, POWER_UPS, getTeamForDriver };
}
```

The `/* paste ... */` markers above are instructions for this step, not text to keep: the finished file contains the four existing definitions in their place, exactly as they are in `game.js` today (plus the `code` fields).

- [ ] **Step 4: Remove the moved data from `game.js` and build tracks and cups from it**

In `game.js`:

1. Delete the `const DIFFICULTIES = [ ... ];` block (with the comment above it), the `const TEAMS = [ ... ];` block, the `function getTeamForDriver(driver) { ... }` function and the `const DRIVERS = [ ... ];` block. Keep `getDifficulty()`, `POINTS_TABLE`, `ITEM_ICONS` and everything else.
2. Replace the whole `const TRACKS = [ ... ];` array (and its two-line comment) with:

```js
// Circuit outlines, scenery placement and item boxes come from TRACK_SHAPES
// (tracks-data.js); names, colours and lengths from CIRCUITS (game-data.js).
const TRACKS = CIRCUITS.map((circuit) => trackDefinition({ ...circuit }));
```

3. Replace the `const CUPS = [ ... ];` array with:

```js
const CUPS = CUP_DEFS.map((cup) => ({
  id: cup.id,
  name: cup.name,
  icon: cup.icon,
  tracks: cup.circuitIds.map((id) => TRACKS.find((track) => track.id === id)),
}));
```

4. Replace the body of `labelizeItem(item)` with:

```js
function labelizeItem(item) {
  const powerUp = POWER_UPS.find((entry) => entry.id === item);
  return powerUp ? powerUp.name : item;
}
```

In `index.html`, load the data before the game:

```html
  <script src="./tracks-data.js"></script>
  <script src="./game-data.js"></script>
  <script src="./career.js"></script>
  <script src="./game.js"></script>
```

- [ ] **Step 5: Run the unit tests**

Run: `npm test`
Expected: PASS — 35 tests (29 existing + 6 new), 0 failures. Also `node --check game.js` prints nothing.

- [ ] **Step 6: Commit the browser checks into the repo**

Create `tools/checks/race-sim.js` (the five-lap race on every circuit, all cars on autopilot):

```js
// Browser check: run a full five-lap race on every circuit with every car on
// autopilot, and report laps and lap times. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/race-sim.js, with the dev
// server on http://localhost:8765. Expected: every circuit finished: 20,
// laps [5,5], no errors.
async (page) => {
  const errors = [];
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  // play.html arrives in Task 3; before that the game is index.html.
  const response = await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  if (!response || !response.ok()) await p.goto(`http://localhost:8765/?${Date.now()}`);
  await p.waitForTimeout(800);
  const results = await p.evaluate(() => {
    const out = [];
    const all = CUPS.flatMap((cup, ci) => cup.tracks.map((t, ti) => [ci, ti]));
    for (const [ci, ti] of all) {
      state.selectedCup = ci;
      state.activeCupIndex = ci;
      buildCupEntries();
      startRace(ti);
      state.racers.forEach((r) => { r.isPlayer = false; });
      state.phase = "race";
      let now = 100000;
      state.raceStart = now;
      state.racers.forEach((r) => { r.lapStartAt = now; });
      const dt = 1 / 60;
      let t = 0;
      while (t < 900 && !state.racers.every((r) => r.finished)) {
        now += dt * 1000; t += dt;
        updateRace(dt, now);
      }
      const laps = state.racers.map((r) => r.lap);
      const best = state.racers.map((r) => r.bestLapTime).filter(Boolean).sort((a, b) => a - b);
      out.push({
        track: state.track.id,
        finished: state.racers.filter((r) => r.finished).length,
        laps: [Math.min(...laps), Math.max(...laps)],
        fastestLap: best.length ? (best[0] / 1000).toFixed(1) : null,
      });
    }
    return out;
  });
  await context.close();
  return { results, errors };
}
```

Create `tools/checks/career-check.js`: the contents of `.playwright-mcp/career-check.js` wrapped the same way as `race-sim.js` (own `newContext({ viewport: null })`, closed at the end, and the same `play.html`-then-`/` `goto` with the `response.ok()` fallback), unchanged otherwise. Its `panel` field reads `document.getElementById("career-tier")` for now; Task 3 changes that line.

- [ ] **Step 7: Run the browser checks**

With the dev server running (`python3 /path/to/no-store-server.py` or `python3 -m http.server 8765`), run `tools/checks/race-sim.js` and `tools/checks/career-check.js` through the Playwright MCP tool `browser_run_code_unsafe`.
Expected: race-sim — every circuit `finished: 20`, `laps: [5,5]`, `errors: []`. career-check — `races: 4`, `cupsCompleted: 1`, `careerAfterSecondPodium === careerAfterCup`, `quitRecorded: 0`, `errors: []`.

- [ ] **Step 8: Commit**

```bash
git add game-data.js game.js index.html tests/game-data.test.js tools/checks/race-sim.js tools/checks/career-check.js
git commit -m "Move shared game data into game-data.js"
```

---

### Task 2: Track maps and touch detection

**Files:**
- Create: `trackmap.js`, `device.js`
- Test: `tests/trackmap.test.js`, `tests/device.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TrackMap.path(points, { width, height, padding = 10 })` → `{ d, start: { x, y }, heading, viewBox }` where `d` is an SVG path (`M… L… Z`), `start` the mapped first point, `heading` the angle in degrees from the first to the second point, `viewBox` `"0 0 width height"`. For fewer than two points: `{ d: "", start: null, heading: 0, viewBox }`.
  - `Device.isTouchOnly(matchMedia)` → `true` only when `(pointer: coarse)` and `(hover: none)` both match; `false` when `matchMedia` is missing or throws.
  - Browser globals `TrackMap`, `Device`.

- [ ] **Step 1: Write the failing tests**

Create `tests/trackmap.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const TrackMap = require("../trackmap.js");

const square = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }];

function coords(d) {
  return [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

test("the path fits inside the box with the padding", () => {
  const { d } = TrackMap.path(square, { width: 220, height: 160, padding: 10 });
  coords(d).forEach(([x, y]) => {
    assert.ok(x >= 10 - 1e-9 && x <= 210 + 1e-9, `x ${x}`);
    assert.ok(y >= 10 - 1e-9 && y <= 150 + 1e-9, `y ${y}`);
  });
  assert.match(d, /^M.*Z$/);
});

test("the shape keeps its proportions and is centred", () => {
  const { d } = TrackMap.path(square, { width: 220, height: 160, padding: 10 });
  const pts = coords(d);
  const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  assert.ok(Math.abs(w / h - 2) < 1e-6);
  assert.ok(Math.abs(Math.min(...pts.map((p) => p[0])) - (220 - w) / 2) < 1e-6);
});

test("start is the first point and heading follows the first leg", () => {
  const map = TrackMap.path(square, { width: 220, height: 160, padding: 10 });
  const first = coords(map.d)[0];
  assert.deepEqual([map.start.x, map.start.y], first);
  assert.equal(map.heading, 0);
  assert.equal(map.viewBox, "0 0 220 160");
});

test("fewer than two points gives an empty path, not an error", () => {
  assert.deepEqual(TrackMap.path([], { width: 10, height: 10 }), { d: "", start: null, heading: 0, viewBox: "0 0 10 10" });
  assert.equal(TrackMap.path([{ x: 1, y: 1 }], { width: 10, height: 10 }).d, "");
});
```

Create `tests/device.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const Device = require("../device.js");

const media = (answers) => (query) => ({ matches: Boolean(answers[query]) });

test("touch-only needs a coarse pointer and no hover", () => {
  assert.equal(Device.isTouchOnly(media({ "(pointer: coarse)": true, "(hover: none)": true })), true);
  assert.equal(Device.isTouchOnly(media({ "(pointer: coarse)": true, "(hover: none)": false })), false);
  assert.equal(Device.isTouchOnly(media({ "(pointer: coarse)": false, "(hover: none)": true })), false);
});

test("no matchMedia, or one that throws, is not touch-only", () => {
  assert.equal(Device.isTouchOnly(undefined), false);
  assert.equal(Device.isTouchOnly(() => { throw new Error("nope"); }), false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../trackmap.js'` and `'../device.js'`.

- [ ] **Step 3: Implement**

Create `trackmap.js`:

```js
// Draw a circuit outline as an SVG path, fitted to a box with its
// proportions kept, for the landing page's circuit cards.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrackMap = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const round = (value) => Math.round(value * 100) / 100;

  function path(points, { width, height, padding = 10 }) {
    const viewBox = `0 0 ${width} ${height}`;
    if (!Array.isArray(points) || points.length < 2) return { d: "", start: null, heading: 0, viewBox };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX || 1;
    const spanY = Math.max(...ys) - minY || 1;
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const mapped = points.map((p) => ({
      x: round(offsetX + (p.x - minX) * scale),
      y: round(offsetY + (p.y - minY) * scale),
    }));
    const d = `M${mapped.map((p) => `${p.x},${p.y}`).join(" L")} Z`;
    const heading = round((Math.atan2(mapped[1].y - mapped[0].y, mapped[1].x - mapped[0].x) * 180) / Math.PI);
    return { d, start: mapped[0], heading, viewBox };
  }

  return { path };
}));
```

Create `device.js`:

```js
// Is this a touch-only device (a phone or tablet without a keyboard and
// mouse)? The game is keyboard-driven, so these get a note before playing.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Device = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function isTouchOnly(matchMedia) {
    if (typeof matchMedia !== "function") return false;
    try {
      return Boolean(matchMedia("(pointer: coarse)").matches && matchMedia("(hover: none)").matches);
    } catch (error) {
      return false;
    }
  }
  return { isTouchOnly };
}));
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — 41 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add trackmap.js device.js tests/trackmap.test.js tests/device.test.js
git commit -m "Add track-map drawing and touch-only detection helpers"
```

---

### Task 3: The game page and its screens

**Files:**
- Create: `site.css`, `play.css`, `play.html`, `screens.js`, `tools/checks/play-check.js`
- Modify: `game.js` (DOM out, `window.Game` in, Screens calls), `tools/checks/career-check.js` (panel selector)
- Modify: `index.html` (temporary: straight to `play.html`; Task 5 replaces it)
- Delete: `styles.css`

**Interfaces:**
- Consumes: `TEAMS`, `DRIVERS`, `CIRCUITS`, `POWER_UPS` (Task 1), `Device.isTouchOnly` (Task 2), `Career.getProfile`, `Career.tierFor`, `Career.DIFFICULTY_NAMES` (career.js).
- Produces:
  - `window.Game` (game.js): `getPitLaneState()` → `{ drivers:[{index,code,number,name,teamColor}], selectedDriver, driver:{name,number,title}, team:{name,car,body,trim}, stats:{speed,handling,acceleration,traction}, cups:[{index,name,circuits:[string]}], selectedCup, difficulties:[{index,name}], selectedDifficulty }`; `selectDriver(i)`, `selectCup(i)`, `selectDifficulty(i)`, `startCup()`, `nextRace()`, `backToPitLane()`, `setSound(on)`, `isSoundOn()`, `toggleFullscreen()`, `isFullscreen()`.
  - `window.Screens` (screens.js): `init()`, `showPitLane()`, `refreshPitLane()`, `showRace()`, `updateTower(rows)`, `pushFeed(message)`, `showResults(summary)`, `showPodium(summary)`, `showCareer()`, `showSettings()`, `showPhoneNote()`, `refreshSettings()`, `closeOverlay()` → boolean, `isOverlayOpen()` → boolean.
  - Tower rows: `[{ position, code, teamColor, gap, isPlayer }]`. Results summary: `{ kicker, title, nextLabel, rows:[{place,name,code,teamColor,bestLap,fastest,racePoints,cupPoints,isPlayer}], career:{lines:[html], saved} }`. Podium summary: `{ kicker, title, podium:[{place,name,team,teamColor,points,isPlayer}], career:{lines, saved} }`.
  - DOM ids kept for the checks: `#results-career`, `#podium-career`, `#career-chip`, `#pitlane`, `#tower`, `#ticker`, `#results-screen`, `#podium-screen`, `#career-screen`, `#settings-screen`, `#phone-note`, `#start-cup`, `#driver-name`.
  - CSS custom property `--hud-scale` on `:root` (CSS px per HUD unit), set by `fitViewToElement`.

- [ ] **Step 1: Write the failing browser check**

Create `tools/checks/play-check.js`:

```js
// Browser check for play.html. Run with the Playwright MCP tool
// browser_run_code_unsafe, filename: tools/checks/play-check.js, dev server on
// http://localhost:8765. Uses the real window size (viewport: null).
async (page) => {
  const errors = [];
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const size = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(500);
  };
  const visible = (id) => p.evaluate((el) => { const n = document.getElementById(el); return Boolean(n) && !n.classList.contains("hidden") && n.getClientRects().length > 0; }, id);
  const fills = () => p.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const a = r("game"); const b = r("game3d");
    return a.width === innerWidth && a.height === innerHeight && b.width === innerWidth && b.height === innerHeight;
  });
  const noSideScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const out = {};

  await size(1440, 900);
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.evaluate(() => localStorage.setItem("f1pixelcup.profile", JSON.stringify({ version: 1, careerPoints: 12, rating: 1210, totals: { races: 1, wins: "<img src=x onerror=window.__xss=1>" }, history: [] })));
  await p.reload();
  await p.waitForTimeout(1800);
  out.pitlane = await visible("pitlane");
  out.tiles = await p.locator(".driver-tile").count();
  out.fills1440 = await fills();
  out.chip = await p.locator("#career-chip").innerText();

  await p.locator('.driver-tile[data-driver="4"]').click();
  out.pickedNorris = (await p.locator("#driver-name").textContent()).includes("Norris");
  await p.keyboard.press("ArrowRight");
  out.arrowNext = (await p.locator("#driver-name").textContent()).includes("Piastri");
  await p.locator('[data-difficulty="2"]').click();
  out.legendOn = await p.locator('[data-difficulty="2"]').evaluate((n) => n.classList.contains("is-on"));
  await p.locator('[data-difficulty="1"]').click();

  await p.locator("#career-chip").click();
  out.careerOpen = await visible("career-screen");
  out.xss = await p.evaluate(() => window.__xss === undefined);
  await p.keyboard.press("Escape");
  out.careerClosedByEsc = !(await visible("career-screen"));
  await p.locator('[data-action="settings"]').click();
  out.settingsOpen = await visible("settings-screen");
  await p.keyboard.press("Escape");
  out.settingsClosedByEsc = !(await visible("settings-screen"));

  await size(1000, 700);
  out.fills1000 = await fills();
  out.noSideScroll1000 = await noSideScroll();
  await size(520, 800);
  out.noSideScroll520 = await noSideScroll();
  out.startInside520 = await p.evaluate(() => { const r = document.getElementById("start-cup").getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0; });
  await size(1440, 900);

  await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
  out.startedOnce = await p.evaluate(() => state.phase === "countdown" && state.raceIndex === 0);
  out.pitlaneHiddenInRace = !(await visible("pitlane"));
  await p.waitForTimeout(5200);
  out.tower = await visible("tower");
  out.towerRows = await p.locator("#tower .tower-row").count();
  out.ticker = await p.locator("#ticker").innerText();
  await p.evaluate(() => document.fullscreenElement && document.exitFullscreen());

  await p.evaluate(() => {
    const player = getPlayer();
    player.isPlayer = false;
    let now = performance.now();
    for (let t = 0; t < 900 && !state.resultsQueued; t += 1 / 60) {
      now += 1000 / 60;
      if (player.finished) player.isPlayer = true;
      updateRace(1 / 60, now);
    }
  });
  await p.waitForTimeout(400);
  out.results = await visible("results-screen");
  out.resultRows = await p.locator("#results-table .result-row").count();
  out.resultsCareer = await visible("results-career");
  await size(1000, 700);
  out.fillsWithResults = await fills();
  await size(1440, 900);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  out.backToPitlane = await visible("pitlane");

  await p.goto(`http://localhost:8765/play.html?${Date.now()}#career`);
  await p.waitForTimeout(1500);
  out.deepLinkCareer = await visible("career-screen");

  await context.close();
  return { ...out, errors };
}
```

- [ ] **Step 2: Run it to verify it fails**

Run `tools/checks/play-check.js` with `browser_run_code_unsafe`.
Expected: fails at the first `goto` (`play.html` does not exist: 404 page) with `pitlane: false`, `tiles: 0` and a `locator` timeout — the check aborts. That is the red state.

- [ ] **Step 3: Add the shared Broadcast styles**

Create `site.css`:

```css
/* Broadcast look shared by the landing page and the game: dark, F1 red,
   heavy italic caps, skewed buttons, timing-tower rows. */
:root {
  --bg: #07070c;
  --panel: #0e0e16;
  --panel-2: #15151f;
  --line: rgba(255, 255, 255, 0.08);
  --ink: #f4f4f6;
  --muted: #a4a4b0;
  --red: #e10600;
  --red-dark: #a30400;
  --font: "Titillium Web", "Helvetica Neue", Arial, sans-serif;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font);
}

a { color: inherit; }

.hidden { display: none !important; }

.kicker {
  margin: 0;
  color: var(--red);
  font: 700 0.72rem/1 var(--font);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.it-title {
  margin: 0;
  font-weight: 900;
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  line-height: 0.95;
}

.muted { color: var(--muted); }

/* Primary action: a skewed red block, text kept upright. */
.go-btn {
  display: inline-block;
  border: 0;
  background: var(--red);
  color: #fff;
  padding: 0.8em 1.8em;
  transform: skew(-12deg);
  font: italic 900 1rem/1 var(--font);
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s;
}
.go-btn > span { display: inline-block; transform: skew(12deg); }
.go-btn:hover, .go-btn:focus-visible { background: #ff1a10; }

.ghost-btn {
  display: inline-block;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(7, 7, 12, 0.6);
  color: var(--ink);
  padding: 0.6em 1.1em;
  font: 700 0.8rem/1 var(--font);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}
.ghost-btn:hover, .ghost-btn:focus-visible { border-color: #fff; }

.pill {
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(7, 7, 12, 0.55);
  color: var(--ink);
  padding: 0.45em 0.9em;
  font: 700 0.78rem/1 var(--font);
  cursor: pointer;
}
.pill.is-on { background: var(--red); border-color: var(--red); }

.chip {
  display: inline-block;
  border: 0;
  border-left: 3px solid var(--red);
  background: rgba(8, 8, 14, 0.82);
  color: var(--ink);
  padding: 0.55em 0.8em;
  font: 700 0.78rem/1.2 var(--font);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
}

/* Timing-tower row: position, team colour, code, gap. */
.tower-row {
  display: grid;
  grid-template-columns: 1.6em 4px 1fr auto;
  align-items: center;
  gap: 0.5em;
  padding: 0.28em 0.6em;
  background: rgba(8, 8, 14, 0.84);
  border-bottom: 1px solid var(--line);
  font: 700 0.8rem/1 var(--font);
}
.tower-row b { color: var(--red); text-align: right; }
.tower-row i { display: block; width: 4px; height: 1em; }
.tower-row em { font-style: normal; color: var(--muted); font-weight: 600; }
.tower-row.is-player { background: rgba(225, 6, 0, 0.28); }
.tower-row.is-player b, .tower-row.is-player em { color: #fff; }

.career-strip {
  padding: 0.8em 1em;
  border-left: 3px solid var(--red);
  background: rgba(225, 6, 0, 0.1);
  line-height: 1.55;
}
.career-strip p { margin: 0; }
.career-strip strong { color: #fff; }
.career-strip-warning { margin-top: 0.4em !important; color: #ffb4a8; font-size: 0.85rem; }
```

- [ ] **Step 4: Add the game page**

Create `play.html` (the favicon `href` is the same data URI as the current `index.html`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>F1 Pixel Cup — Play</title>
  <link rel="icon" href="COPY THE data:image/svg+xml,... VALUE FROM THE CURRENT index.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,400;0,600;0,700;0,900;1,700;1,900&display=swap">
  <link rel="stylesheet" href="./site.css">
  <link rel="stylesheet" href="./play.css">
</head>
<body class="play-page">
  <div id="canvas-shell" class="canvas-shell">
    <canvas id="game" aria-label="F1 Pixel Cup race"></canvas>
    <div id="countdown-banner" class="countdown-banner hidden">3</div>
  </div>
  <div id="screens" class="screens"></div>

  <script src="./tracks-data.js"></script>
  <script src="./game-data.js"></script>
  <script src="./device.js"></script>
  <script src="./career.js"></script>
  <script src="./screens.js"></script>
  <script src="./game.js"></script>
  <script type="importmap">
    { "imports": {
      "three": "./vendor/three/three.module.min.js",
      "three/addons/": "./vendor/three/addons/"
    } }
  </script>
  <script type="module" src="./render3d.js"></script>
</body>
</html>
```

(The `href` placeholder above is an instruction: paste the exact `data:image/svg+xml,...` string from the `<link rel="icon">` in today's `index.html`.)

Create `play.css`:

```css
/* The game page: the canvases fill the window, and every screen is a layer
   over them. Sizes that must line up with the canvas HUD use --hud-scale
   (CSS px per HUD unit, set by game.js). */
html, body { height: 100%; overflow: hidden; }

.canvas-shell { position: fixed; inset: 0; line-height: 0; background: #080812; }
.canvas-shell > canvas#game,
.canvas-shell > canvas#game3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

.countdown-banner {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -60%);
  font: italic 900 5rem/1 var(--font); color: #fff; pointer-events: none;
}

.screens { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
.screen { position: absolute; inset: 0; pointer-events: auto; }

/* ---- Pit lane (Showroom) ---- */
.pitlane {
  background: linear-gradient(90deg, rgba(7, 7, 12, 0.94) 0%, rgba(7, 7, 12, 0.6) 34%, rgba(7, 7, 12, 0) 58%);
  display: grid;
  grid-template-columns: minmax(280px, 38%) 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "top choices"
    "driver ."
    "strip start";
  gap: 16px 24px;
  padding: clamp(14px, 2.4vw, 28px);
}
.pitlane-top { grid-area: top; display: flex; align-items: center; gap: 14px; }
.wordmark { font: italic 900 1.1rem/1 var(--font); text-decoration: none; letter-spacing: 0.02em; }
.crumb { color: var(--muted); font: italic 700 0.8rem/1 var(--font); letter-spacing: 0.12em; }
.pitlane-choices { grid-area: choices; justify-self: end; text-align: right; display: grid; gap: 8px; align-content: start; }
.choice-row { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.choice-label { color: var(--muted); font: 700 0.7rem/1 var(--font); letter-spacing: 0.16em; text-transform: uppercase; margin-right: 4px; }
.cup-circuits { margin: 2px 0 0; padding: 0; list-style: none; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font: 600 0.8rem/1.3 var(--font); }
.cup-circuits li + li::before { content: "›"; margin-right: 12px; color: var(--red); }
.pitlane-driver { grid-area: driver; align-self: center; max-width: 440px; }
.driver-name { margin: 8px 0 4px; font-size: clamp(2.2rem, 5vw, 4.2rem); }
.driver-title { margin: 0 0 18px; color: var(--muted); font-weight: 600; }
.stat-bars { display: grid; gap: 8px; margin-bottom: 18px; }
.stat span { display: block; color: var(--muted); font: 700 0.68rem/1 var(--font); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 4px; }
.stat-bar { height: 6px; background: rgba(255, 255, 255, 0.12); }
.stat-bar i { display: block; height: 100%; background: var(--red); }
.driver-strip { grid-area: strip; display: flex; gap: 6px; overflow-x: auto; padding: 4px 2px 6px; align-self: end; scrollbar-width: thin; }
.driver-tile {
  flex: 0 0 auto; width: 52px; height: 44px; border: 1px solid rgba(255, 255, 255, 0.18);
  background: linear-gradient(160deg, var(--team), rgba(0, 0, 0, 0.55)); color: #fff; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  font: 800 0.72rem/1 var(--font);
}
.driver-tile b { font-size: 0.95rem; }
.driver-tile span { opacity: 0.85; font-size: 0.62rem; letter-spacing: 0.08em; }
.driver-tile.is-on { outline: 2px solid #fff; outline-offset: 2px; }
#start-cup { grid-area: start; justify-self: end; align-self: end; font-size: clamp(1rem, 1.6vw, 1.35rem); }

@media (max-width: 760px) {
  .pitlane {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr auto auto;
    grid-template-areas: "top" "choices" "driver" "strip" "start";
    background: rgba(7, 7, 12, 0.72);
    overflow-y: auto;
  }
  .pitlane-choices { justify-self: start; text-align: left; }
  .choice-row, .cup-circuits { justify-content: flex-start; }
  #start-cup { justify-self: stretch; text-align: center; }
}

/* ---- Race: timing tower and feed ticker, lined up with the HUD ---- */
.tower {
  position: absolute;
  left: calc(20px * var(--hud-scale, 1));
  top: calc(146px * var(--hud-scale, 1));
  width: 190px;
  transform: scale(var(--hud-scale, 1));
  transform-origin: top left;
  pointer-events: none;
  border-left: 3px solid var(--red);
}
.tower-gap { height: 6px; background: rgba(8, 8, 14, 0.6); }
.ticker {
  position: absolute;
  left: 50%;
  bottom: calc(116px * var(--hud-scale, 1));
  transform: translateX(-50%);
  max-width: 80vw;
  padding: 0.45em 1em;
  background: rgba(8, 8, 14, 0.82);
  border-left: 3px solid var(--red);
  font: 700 0.9rem/1.2 var(--font);
  pointer-events: none;
  transition: opacity 0.4s;
}
.ticker.is-fading { opacity: 0; }

/* ---- Overlays: results, podium, career, settings, phone note ---- */
.overlay {
  display: flex; align-items: center; justify-content: center;
  padding: clamp(12px, 3vw, 36px);
  background: rgba(5, 5, 10, 0.78);
  backdrop-filter: blur(6px);
}
.overlay-card {
  width: min(640px, 100%);
  max-height: 100%;
  overflow-y: auto;
  background: linear-gradient(160deg, var(--panel), var(--panel-2));
  border-top: 3px solid var(--red);
  padding: clamp(18px, 3vw, 32px);
}
.overlay-card.wide { width: min(880px, 100%); }
.overlay-card.narrow { width: min(460px, 100%); }
.overlay-title { margin: 8px 0 16px; font-size: clamp(1.8rem, 4vw, 2.8rem); }
.overlay-actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; margin-top: 22px; }

.results-table { display: grid; margin-top: 14px; }
.result-row, .result-head {
  display: grid; grid-template-columns: 3em 4px 1fr 6em 4.5em 4.5em; gap: 10px; align-items: center;
  padding: 0.42em 0.6em; border-bottom: 1px solid var(--line); font-weight: 600;
}
.result-head { color: var(--muted); font: 700 0.68rem/1 var(--font); letter-spacing: 0.14em; text-transform: uppercase; }
.result-row b { color: var(--red); }
.result-row i { display: block; width: 4px; height: 1.1em; }
.result-row.is-player { background: rgba(225, 6, 0, 0.18); }
.result-row .is-fastest { color: #c77dff; }
#results-career { margin-top: 6px; }

.podium { display: grid; grid-template-columns: repeat(3, 1fr); align-items: end; gap: 10px; margin: 18px 0; }
.podium-step { text-align: center; }
.podium-step .block { margin-top: 8px; background: var(--panel-2); border-top: 4px solid var(--team); display: flex; align-items: flex-start; justify-content: center; padding-top: 10px; font: italic 900 2rem/1 var(--font); color: var(--red); }
.podium-step.p1 .block { height: 150px; }
.podium-step.p2 .block { height: 110px; }
.podium-step.p3 .block { height: 80px; }
.podium-step strong { display: block; font: italic 900 1.1rem/1.1 var(--font); text-transform: uppercase; }
.podium-step span { color: var(--muted); font-size: 0.85rem; }
.podium-step.is-player strong { color: var(--red); }

.career-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 16px; }
.career-tier { font: italic 900 2.4rem/1 var(--font); text-transform: uppercase; }
.career-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 16px 0; }
.career-stat { background: rgba(8, 8, 14, 0.6); border-left: 3px solid var(--red); padding: 0.6em 0.8em; }
.career-stat span { display: block; color: var(--muted); font: 700 0.66rem/1 var(--font); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }
.career-stat strong { font-size: 1.3rem; }
.career-bests { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 6px; }
.career-best { display: flex; justify-content: space-between; gap: 10px; padding: 0.5em 0.7em; background: rgba(8, 8, 14, 0.5); font-weight: 600; }
.career-best span { color: var(--muted); }
.career-history { width: 100%; border-collapse: collapse; margin-top: 8px; font-weight: 600; }
.career-history th { text-align: left; color: var(--muted); font: 700 0.66rem/1 var(--font); letter-spacing: 0.14em; text-transform: uppercase; padding: 6px; }
.career-history td { padding: 6px; border-top: 1px solid var(--line); }
.career-history .up { color: #39d98a; }
.career-history .down { color: #ff6b6b; }
.career-section { margin: 22px 0 8px; }

.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); font-weight: 700; }
```

- [ ] **Step 5: Add `screens.js`**

Create `screens.js`:

```js
// The game page's screens: the Showroom pit lane, the race's timing tower and
// feed ticker, results, podium, career, settings and the phone note.
// DOM only. It acts through window.Game and reads the saved career through
// window.Career; it never reads the game's internal state.

(function () {
  const STAT_LABELS = { speed: "Speed", handling: "Handling", acceleration: "Acceleration", traction: "Traction" };
  const OVERLAYS = ["career-screen", "settings-screen", "phone-note"];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const $ = (id) => document.getElementById(id);
  let openOverlay = null;
  let tickerTimer = 0;

  function lapTime(ms) {
    if (!ms || ms <= 0) return "--:--.--";
    const total = ms / 1000;
    const minutes = Math.floor(total / 60);
    return `${minutes}:${(total - minutes * 60).toFixed(2).padStart(5, "0")}`;
  }

  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
  }

  function build() {
    $("screens").innerHTML = `
      <section id="pitlane" class="screen pitlane hidden" aria-label="Pit lane">
        <header class="pitlane-top">
          <a class="wordmark" href="./index.html">F1 PIXEL CUP</a>
          <span class="crumb">PIT LANE</span>
          <button class="ghost-btn" data-action="settings" type="button">Settings</button>
        </header>
        <div class="pitlane-choices">
          <div class="choice-row"><span class="choice-label">Cup</span><span id="cup-pills"></span></div>
          <div class="choice-row"><span class="choice-label">Difficulty</span><span id="difficulty-pills"></span></div>
          <ol id="cup-circuits" class="cup-circuits"></ol>
        </div>
        <div class="pitlane-driver">
          <p id="driver-kicker" class="kicker"></p>
          <h1 id="driver-name" class="it-title driver-name"></h1>
          <p id="driver-title" class="driver-title"></p>
          <div id="driver-stats" class="stat-bars"></div>
          <button id="career-chip" class="chip" data-action="career" type="button"></button>
        </div>
        <div id="driver-strip" class="driver-strip" role="listbox" aria-label="Drivers"></div>
        <button id="start-cup" class="go-btn" data-action="start" type="button"><span>Start cup ›</span></button>
      </section>

      <aside id="tower" class="tower hidden" aria-label="Live timing"></aside>
      <div id="ticker" class="ticker hidden" aria-live="polite"></div>

      <section id="results-screen" class="screen overlay hidden" aria-live="polite">
        <div class="overlay-card wide">
          <p id="results-kicker" class="kicker"></p>
          <h2 id="results-title" class="it-title overlay-title"></h2>
          <div id="results-career" class="career-strip hidden"></div>
          <div id="results-table" class="results-table"></div>
          <div class="overlay-actions">
            <button class="ghost-btn" data-action="pitlane" type="button">Back to pit lane (Esc)</button>
            <button id="results-next" class="go-btn" data-action="next" type="button"><span>Next race ›</span></button>
          </div>
        </div>
      </section>

      <section id="podium-screen" class="screen overlay hidden" aria-live="polite">
        <div class="overlay-card">
          <p id="podium-kicker" class="kicker"></p>
          <h2 id="podium-title" class="it-title overlay-title"></h2>
          <div id="podium-scene" class="podium"></div>
          <div id="podium-career" class="career-strip hidden"></div>
          <div class="overlay-actions">
            <button class="go-btn" data-action="pitlane" type="button"><span>Back to pit lane ›</span></button>
          </div>
        </div>
      </section>

      <section id="career-screen" class="screen overlay hidden" aria-label="Career">
        <div id="career-card" class="overlay-card wide"></div>
      </section>

      <section id="settings-screen" class="screen overlay hidden" aria-label="Settings">
        <div class="overlay-card narrow">
          <p class="kicker">Pit lane</p>
          <h2 class="it-title overlay-title">Settings</h2>
          <div class="setting-row"><span>Sound</span><button id="sound-toggle" class="pill" data-action="sound" type="button"></button></div>
          <div class="setting-row"><span>Full screen</span><button id="fullscreen-toggle" class="pill" data-action="fullscreen" type="button"></button></div>
          <div class="overlay-actions"><button class="ghost-btn" data-action="close" type="button">Close (Esc)</button></div>
        </div>
      </section>

      <section id="phone-note" class="screen overlay hidden" aria-label="Best on a computer">
        <div class="overlay-card narrow">
          <p class="kicker">Heads up</p>
          <h2 class="it-title overlay-title">Best played on a computer with a keyboard</h2>
          <p class="muted">F1 Pixel Cup is driven with the keyboard. Touch controls are on the way.</p>
          <div class="overlay-actions">
            <a class="ghost-btn" href="./index.html">Back to home</a>
            <button class="go-btn" data-action="close" type="button"><span>Play anyway ›</span></button>
          </div>
        </div>
      </section>`;
    $("screens").addEventListener("click", onClick);
  }

  function onClick(event) {
    const target = event.target.closest("[data-action], [data-driver], [data-cup], [data-difficulty]");
    if (!target || !window.Game) return;
    if (target.dataset.driver !== undefined) Game.selectDriver(Number(target.dataset.driver));
    else if (target.dataset.cup !== undefined) Game.selectCup(Number(target.dataset.cup));
    else if (target.dataset.difficulty !== undefined) Game.selectDifficulty(Number(target.dataset.difficulty));
    else {
      const action = target.dataset.action;
      if (action === "start") Game.startCup();
      else if (action === "next") Game.nextRace();
      else if (action === "pitlane") Game.backToPitLane();
      else if (action === "career") showCareer();
      else if (action === "settings") showSettings();
      else if (action === "close") closeOverlay();
      else if (action === "sound") { Game.setSound(!Game.isSoundOn()); refreshSettings(); }
      else if (action === "fullscreen") { Game.toggleFullscreen(); setTimeout(refreshSettings, 200); }
    }
  }

  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }
  function hideMain() { ["pitlane", "tower", "ticker", "results-screen", "podium-screen"].forEach(hide); }

  // ---- Pit lane ----
  function showPitLane() {
    hideMain();
    show("pitlane");
    refreshPitLane();
  }

  function refreshPitLane() {
    if (!window.Game || !$("pitlane")) return;
    const s = Game.getPitLaneState();
    $("pitlane").style.setProperty("--team", s.team.body);
    $("driver-kicker").textContent = `#${s.driver.number} · ${s.team.name} ${s.team.car}`;
    $("driver-name").innerHTML = esc(s.driver.name).replace(" ", "<br>");
    $("driver-title").textContent = s.driver.title;
    $("driver-stats").innerHTML = Object.keys(STAT_LABELS).map((key) => `
      <div class="stat"><span>${STAT_LABELS[key]}</span><div class="stat-bar"><i style="width:${Math.round(num(s.stats[key]) * 100)}%"></i></div></div>
    `).join("");
    $("cup-pills").innerHTML = s.cups.map((cup) => `
      <button class="pill ${cup.index === s.selectedCup ? "is-on" : ""}" data-cup="${cup.index}" type="button">${esc(cup.name)}</button>`).join("");
    $("difficulty-pills").innerHTML = s.difficulties.map((d) => `
      <button class="pill ${d.index === s.selectedDifficulty ? "is-on" : ""}" data-difficulty="${d.index}" type="button">${esc(d.name)}</button>`).join("");
    $("cup-circuits").innerHTML = s.cups[s.selectedCup].circuits.map((name) => `<li>${esc(name)}</li>`).join("");
    $("driver-strip").innerHTML = s.drivers.map((d) => `
      <button class="driver-tile ${d.index === s.selectedDriver ? "is-on" : ""}" data-driver="${d.index}" style="--team:${esc(d.teamColor)}"
        type="button" role="option" aria-selected="${d.index === s.selectedDriver}" title="${esc(d.name)}"><b>${num(d.number)}</b><span>${esc(d.code)}</span></button>`).join("");
    $("start-cup").innerHTML = `<span>Start ${esc(s.cups[s.selectedCup].name)} ›</span>`;
    refreshCareerChip();
  }

  function careerProfile() {
    try {
      return window.Career ? Career.getProfile() : null;
    } catch (error) {
      return null;
    }
  }

  function refreshCareerChip() {
    const profile = careerProfile();
    const rating = profile ? num(profile.rating) : 1200;
    const tier = window.Career ? Career.tierFor(rating) : "F4";
    $("career-chip").textContent = `Career · ${tier} ${rating} · ${num(profile && profile.careerPoints).toLocaleString()} pts`;
  }

  // ---- Race ----
  function showRace() {
    hideMain();
    closeOverlay();
    show("tower");
  }

  function updateTower(rows) {
    if (!rows || !rows.length) return;
    const top = rows.slice(0, 10);
    const player = rows.find((row) => row.isPlayer);
    const extra = player && player.position > 10 ? [player] : [];
    const row = (r) => `<div class="tower-row ${r.isPlayer ? "is-player" : ""}"><b>${num(r.position)}</b><i style="background:${esc(r.teamColor)}"></i><span>${esc(r.code)}</span><em>${esc(r.gap)}</em></div>`;
    $("tower").innerHTML = top.map(row).join("") + (extra.length ? `<div class="tower-gap"></div>${extra.map(row).join("")}` : "");
  }

  function pushFeed(message) {
    const ticker = $("ticker");
    if (!ticker) return;
    ticker.textContent = message;
    ticker.classList.remove("hidden", "is-fading");
    clearTimeout(tickerTimer);
    tickerTimer = setTimeout(() => {
      ticker.classList.add("is-fading");
      tickerTimer = setTimeout(() => ticker.classList.add("hidden"), 450);
    }, 3200);
  }

  // ---- Results and podium ----
  function renderStrip(node, career) {
    const lines = (career && career.lines) || [];
    const saved = career ? career.saved : true;
    if (!lines.length && saved !== false) {
      node.innerHTML = "";
      node.classList.add("hidden");
      return;
    }
    const warning = saved === false ? `<p class="career-strip-warning">Progress couldn't be saved in this browser.</p>` : "";
    node.innerHTML = lines.map((line) => `<p>${line}</p>`).join("") + warning;
    node.classList.remove("hidden");
  }

  function showResults(summary) {
    hideMain();
    $("results-kicker").textContent = summary.kicker;
    $("results-title").textContent = summary.title;
    $("results-next").innerHTML = `<span>${esc(summary.nextLabel)} ›</span>`;
    $("results-table").innerHTML = `
      <div class="result-head"><span>Pos</span><span></span><span>Driver</span><span>Best lap</span><span>Race</span><span>Cup</span></div>
      ${summary.rows.map((r) => `
        <div class="result-row ${r.isPlayer ? "is-player" : ""}">
          <b>${esc(ordinal(num(r.place)))}</b><i style="background:${esc(r.teamColor)}"></i>
          <span>${esc(r.name)}</span>
          <span class="${r.fastest ? "is-fastest" : ""}">${esc(r.bestLap)}</span>
          <span>${num(r.racePoints)}</span><span>${num(r.cupPoints)}</span>
        </div>`).join("")}`;
    renderStrip($("results-career"), summary.career);
    show("results-screen");
  }

  function showPodium(summary) {
    hideMain();
    $("podium-kicker").textContent = summary.kicker;
    $("podium-title").textContent = summary.title;
    const order = [summary.podium[1], summary.podium[0], summary.podium[2]].filter(Boolean);
    $("podium-scene").innerHTML = order.map((p) => `
      <div class="podium-step p${num(p.place)} ${p.isPlayer ? "is-player" : ""}" style="--team:${esc(p.teamColor)}">
        <strong>${esc(p.name)}</strong><span>${esc(p.team)} · ${num(p.points)} pts</span>
        <div class="block">${num(p.place)}</div>
      </div>`).join("");
    renderStrip($("podium-career"), summary.career);
    show("podium-screen");
  }

  // ---- Career ----
  function showCareer() {
    renderCareer();
    openOverlayId("career-screen");
  }

  function renderCareer() {
    const profile = careerProfile();
    const totals = (profile && profile.totals) || {};
    const rating = profile ? num(profile.rating) : 1200;
    const tier = window.Career ? Career.tierFor(rating) : "F4";
    const circuitName = (id) => (CIRCUITS.find((c) => c.id === id) || { name: id }).name;
    const difficultyName = (id) => (window.Career && Career.DIFFICULTY_NAMES[id]) || id;
    const races = ((profile && profile.history) || []).filter((h) => h && h.type === "race").slice(-20).reverse();
    const stats = [
      ["Career points", num(profile && profile.careerPoints).toLocaleString()],
      ["Rating", rating],
      ["Races", num(totals.races)],
      ["Wins", num(totals.wins)],
      ["Podiums", num(totals.podiums)],
      ["Cups won", `${num(totals.cupsWon)} / ${num(totals.cupsCompleted)}`],
    ];
    $("career-card").innerHTML = `
      <p class="kicker">Your career</p>
      <div class="career-head"><span class="career-tier">${esc(tier)}</span><span class="muted">Rating ${rating} · ${num(profile && profile.careerPoints).toLocaleString()} career points</span></div>
      ${num(totals.races) === 0 ? `<p class="muted">Your career starts here. Finish a race to start earning points and rating.</p>` : ""}
      <div class="career-grid">${stats.map(([label, value]) => `<div class="career-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("")}</div>
      <p class="kicker career-section">Best laps</p>
      <div class="career-bests">${CIRCUITS.map((c) => {
        const best = profile && profile.bestLaps ? profile.bestLaps[c.id] : null;
        return `<div class="career-best"><span>${esc(c.name)}</span><strong>${best ? esc(lapTime(num(best.ms))) : "—"}</strong></div>`;
      }).join("")}</div>
      <p class="kicker career-section">Recent races</p>
      ${races.length ? `<table class="career-history"><thead><tr><th>Circuit</th><th>Difficulty</th><th>Pos</th><th>Points</th><th>Rating</th></tr></thead><tbody>
        ${races.map((r) => {
          const delta = num(r.ratingAfter) - num(r.ratingBefore);
          return `<tr><td>${esc(circuitName(r.trackId))}</td><td>${esc(difficultyName(r.difficulty))}</td><td>${esc(ordinal(num(r.position)))}</td><td>+${num(r.careerPointsEarned)}</td>
            <td class="${delta > 0 ? "up" : delta < 0 ? "down" : ""}">${delta > 0 ? "+" : ""}${delta}</td></tr>`;
        }).join("")}</tbody></table>` : `<p class="muted">No races yet.</p>`}
      <div class="overlay-actions"><button class="ghost-btn" data-action="close" type="button">Back (Esc)</button></div>`;
  }

  // ---- Settings, phone note, overlays ----
  function showSettings() {
    refreshSettings();
    openOverlayId("settings-screen");
  }

  function refreshSettings() {
    if (!window.Game || !$("sound-toggle")) return;
    const sound = Game.isSoundOn();
    const full = Game.isFullscreen();
    $("sound-toggle").textContent = sound ? "On" : "Off";
    $("sound-toggle").classList.toggle("is-on", sound);
    $("fullscreen-toggle").textContent = full ? "On" : "Off";
    $("fullscreen-toggle").classList.toggle("is-on", full);
  }

  function showPhoneNote() {
    openOverlayId("phone-note");
  }

  function openOverlayId(id) {
    OVERLAYS.forEach(hide);
    show(id);
    openOverlay = id;
  }

  function closeOverlay() {
    if (!openOverlay) return false;
    hide(openOverlay);
    openOverlay = null;
    return true;
  }

  function init() {
    build();
    if (window.Device && Device.isTouchOnly(window.matchMedia && window.matchMedia.bind(window))) showPhoneNote();
    if (window.location.hash === "#career") showCareer();
  }

  window.Screens = {
    init, showPitLane, refreshPitLane, showRace, updateTower, pushFeed,
    showResults, showPodium, showCareer, showSettings, showPhoneNote, refreshSettings,
    closeOverlay, isOverlayOpen: () => Boolean(openOverlay),
  };
}());
```

- [ ] **Step 6: Connect `game.js` to the screens**

Make these edits in `game.js`:

**(a)** Replace the whole `const ui = { ... };` object with:

```js
// The game page's DOM belongs to screens.js; the game only needs these two.
const ui = {
  canvasShell: document.getElementById("canvas-shell"),
  countdownBanner: document.getElementById("countdown-banner"),
};
```

**(b)** In `fitViewToElement()`, after `view.scale = fit * dpr;` add:

```js
  // Lets the timing tower and ticker line up with the HUD at any size.
  if (fitViewToElement.lastFit !== fit) {
    fitViewToElement.lastFit = fit;
    document.documentElement.style.setProperty("--hud-scale", fit.toFixed(4));
  }
```

**(c)** Replace `addFeed` and delete `renderFeed`:

```js
function addFeed(message) {
  state.feed.unshift({ id: state.nextFeedId += 1, message });
  state.feed = state.feed.slice(0, 8);
  if (window.Screens && (state.phase === "race" || state.phase === "countdown")) window.Screens.pushFeed(message);
}
```

**(d)** Delete these functions entirely: `renderFeed`, `renderDriverButtons`, `renderKartButtons`, `labelizeStat`, `drawDriverPortrait`, `drawKartPreview`, `renderDifficultyButtons`, `renderCupButtons`, `syncOverlayState`, `updateViewControls`, `toggleViewMode`, `renderCareerStrip`, `renderRaceCareer`, `renderCareerPanel`, `drawCareerPanel`. Delete every call to `syncOverlayState()`, `updateViewControls()` and `renderCareerPanel()`.

**(e)** Replace `renderGarage` with:

```js
// The pit lane is drawn by screens.js; this keeps the game's side in step.
function renderGarage() {
  if (state.phase === "garage") state.track = getSelectedCup().tracks[0];
  if (window.Screens) window.Screens.refreshPitLane();
}

function getPitLaneState() {
  const driver = DRIVERS[state.selectedDriver];
  const team = getTeamForDriver(driver);
  const stats = combineStats(driver, team);
  return {
    drivers: DRIVERS.map((d, index) => ({ index, code: d.code, number: d.number, name: d.name, teamColor: getTeamForDriver(d).body })),
    selectedDriver: state.selectedDriver,
    driver: { name: driver.name, number: driver.number, title: driver.title },
    team: { name: team.name, car: team.car, body: team.body, trim: team.trim },
    stats: { speed: stats.speed, handling: stats.handling, acceleration: stats.acceleration, traction: stats.traction },
    cups: CUPS.map((cup, index) => ({ index, name: cup.name, circuits: cup.tracks.map((track) => track.name) })),
    selectedCup: state.selectedCup,
    difficulties: DIFFICULTIES.map((d, index) => ({ index, name: d.name })),
    selectedDifficulty: state.difficulty,
  };
}

function selectDriver(index) {
  if (state.phase !== "garage") return;
  state.selectedDriver = ((index % DRIVERS.length) + DRIVERS.length) % DRIVERS.length;
  state.selectedKart = TEAMS.findIndex((t) => t.id === DRIVERS[state.selectedDriver].teamId);
  renderGarage();
}

function selectCup(index) {
  if (state.phase !== "garage") return;
  state.selectedCup = clamp(index, 0, CUPS.length - 1);
  renderGarage();
}

function selectDifficulty(index) {
  if (state.phase !== "garage") return;
  state.difficulty = clamp(index, 0, DIFFICULTIES.length - 1);
  try {
    window.localStorage.setItem("f1pixelcup.difficulty", String(state.difficulty));
  } catch (err) {
    // Preference just will not persist.
  }
  renderGarage();
}
```

**(e2)** A cup can only start from the pit lane. At the top of `startCup()` add:

```js
  // Enter on a focused Start button fires both the key and the click.
  if (state.phase !== "garage") return;
```

**(f)** Fullscreen covers the whole page (so the screens stay visible). Replace `enterFullscreenMode` and `toggleFullscreen`:

```js
function enterFullscreenMode() {
  if (isFullscreenActive()) return;
  const page = document.documentElement;
  const request = page.requestFullscreen ? page.requestFullscreen() : page.webkitRequestFullscreen ? page.webkitRequestFullscreen() : null;
  if (request && typeof request.catch === "function") request.catch(() => {});
}

function toggleFullscreen() {
  if (isFullscreenActive()) exitFullscreenMode();
  else enterFullscreenMode();
}
```

**(g)** In `startRace(index)`, delete the lines that touch `ui.resultsModal`, `ui.podiumModal`, `ui.trackTheme`, `ui.trackName`, `ui.raceIndicator`, `ui.raceStatus` and the `syncOverlayState()` call, and add after `state.phase = "countdown";`:

```js
  if (window.Screens) window.Screens.showRace();
```

**(h)** Replace `updatePlayerUI` (the HUD canvas shows place, lap and power-up):

```js
function updatePlayerUI() {
  const player = getPlayer();
  if (!player) return;
  player.lastKnownPlace = getSortedRacers().findIndex((racer) => racer.id === player.id) + 1;
}
```

**(i)** Replace `updateStandingsUI` and add the standings helper:

```js
// Typical race speed, for turning a distance lead into seconds on the tower.
const TOWER_REFERENCE_SPEED = 180;

function getRaceStandings() {
  const sorted = getSortedRacers();
  const leader = sorted[0];
  return sorted.map((racer, index) => {
    let gap;
    if (racer.finished) gap = "FIN";
    else if (index === 0) gap = "LEADER";
    else if (leader.finished) gap = "RUNNING";
    else gap = `+${formatGap((getRaceProgress(leader) - getRaceProgress(racer)) / TOWER_REFERENCE_SPEED)}`;
    return { position: index + 1, code: racer.driver.code, teamColor: racer.kart.body, isPlayer: racer.id === state.playerId, gap };
  });
}

function updateStandingsUI() {
  if (!window.Screens) return;
  const now = performance.now();
  if (now - (state.towerUpdatedAt || 0) < 250) return;
  state.towerUpdatedAt = now;
  window.Screens.updateTower(getRaceStandings());
}
```

Add `towerUpdatedAt: 0,` to the `state` object.

**(j)** Replace the old `renderRaceCareer` with these two summary builders (plain data for the screens):

```js
function careerForRace(summary) {
  if (!summary) return { lines: [], saved: true };
  const difficulty = careerDifficultyName(getDifficulty().id);
  const { before, after, delta } = summary.rating;
  const trend = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "=";
  const lines = [
    `<strong>+${summary.careerPoints} career points</strong> (${summary.racePoints} × ${difficulty} ×${summary.multiplier})`,
    `Rating ${before} → <strong>${after}</strong> ${trend} · ${summary.tier}`,
  ];
  if (summary.newBestLap) lines.push(`New best at ${state.track.name}: <strong>${formatLapTime(summary.newBestLap.ms)}</strong>`);
  return { lines, saved: summary.saved };
}

function careerForCup(cup, playerPlace) {
  if (!cup) return { lines: [], saved: true };
  const lines = cup.bonus > 0
    ? [`<strong>Cup ${formatOrdinal(playerPlace)} bonus +${cup.careerPoints}</strong> (${cup.bonus} × ${careerDifficultyName(getDifficulty().id)} ×${cup.multiplier}) · Career total ${cup.careerTotal.toLocaleString()}`]
    : [];
  return { lines, saved: cup.saved };
}
```

**(k)** Replace `showResults` and `showPodium`:

```js
function showResults(finishers) {
  const activeCup = getActiveCup();
  const fastest = finishers.reduce((best, racer) => (
    racer.bestLapTime && (!best || racer.bestLapTime < best.bestLapTime) ? racer : best
  ), null);
  state.phase = "results";
  if (!window.Screens) return;
  window.Screens.showResults({
    kicker: `Race ${state.raceIndex + 1} of ${activeCup.tracks.length} · ${activeCup.name}`,
    title: state.track.name,
    nextLabel: state.raceIndex === activeCup.tracks.length - 1 ? "Show podium" : "Next race",
    rows: finishers.map((racer, index) => {
      const cupEntry = state.cupEntries.find((entry) => entry.driver.id === racer.driver.id);
      const racePoints = POINTS_TABLE[index] || 0;
      return {
        place: index + 1,
        name: racer.driver.name,
        code: racer.driver.code,
        teamColor: racer.kart.body,
        bestLap: formatLapTime(racer.bestLapTime),
        fastest: Boolean(fastest && racer.id === fastest.id),
        racePoints,
        cupPoints: cupEntry ? cupEntry.points : racePoints,
        isPlayer: racer.id === state.playerId,
      };
    }),
    career: careerForRace(state.lastRaceCareer),
  });
}

function showPodium() {
  const activeCup = getActiveCup();
  recordPlayerCup();
  state.phase = "podium";
  if (!window.Screens) return;
  const playerPlace = state.cupEntries.findIndex((entry) => entry.isPlayer) + 1;
  window.Screens.showPodium({
    kicker: `${activeCup.name} complete`,
    title: playerPlace === 1 ? "Cup winner" : `You finished ${formatOrdinal(playerPlace)}`,
    podium: state.cupEntries.slice(0, 3).map((entry, index) => ({
      place: index + 1,
      name: entry.driver.name,
      team: entry.kart.name,
      teamColor: entry.kart.body,
      points: entry.points,
      isPlayer: entry.isPlayer,
    })),
    career: careerForCup(state.lastCupCareer, playerPlace),
  });
}
```

**(l)** In `nextRace`, delete the `ui.resultsModal...` and `syncOverlayState()` lines. In `resetToGarage`, delete `exitFullscreenMode();`, the two `ui.*Modal` lines, `syncOverlayState()` and `renderCareerPanel()`, and add at the end:

```js
  if (window.Screens) window.Screens.showPitLane();
```

**(m)** Replace `updateSoundButton`:

```js
function updateSoundButton() {
  if (window.Screens) window.Screens.refreshSettings();
}
```

**(n)** Replace `drawGarageScene` (the pit lane text is DOM now):

```js
function drawGarageScene() {
  ctx.clearRect(0, 0, view.width, view.height);
  const driver = DRIVERS[state.selectedDriver];
  const team = getTeamForDriver(driver);
  // In 3D the car turns on the showroom floor behind this canvas.
  if (window.Render3D && window.Render3D.ready && window.Render3D.renderGarage(team, driver, performance.now())) return;
  // Without WebGL: the 2D car on the right, where the showroom car would be.
  drawKart(ctx, view.width * 0.68, view.height * 0.58, 0, team, driver, 5.5);
}
```

**(o)** Replace `handleEscapeKey`:

```js
function handleEscapeKey() {
  // An open overlay (career, settings, phone note) closes first.
  if (window.Screens && window.Screens.closeOverlay()) return;
  // After a race or a cup there is nothing to pause, so Esc is the way home.
  if (state.phase === "results" || state.phase === "podium") {
    resetToGarage();
    return;
  }
  if (state.phase === "race" || state.phase === "countdown") togglePause();
}
```

**(p)** Replace `bindEvents` with:

```js
function bindEvents() {
  ui.canvasShell.addEventListener("dblclick", toggleFullscreen);
  const refreshSettings = () => window.Screens && window.Screens.refreshSettings();
  document.addEventListener("fullscreenchange", refreshSettings);
  document.addEventListener("webkitfullscreenchange", refreshSettings);

  window.addEventListener("keydown", (event) => {
    if (!audio.ready) initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    if (event.key === "Escape") {
      event.preventDefault();
      handleEscapeKey();
      return;
    }
    // Pit lane keys: arrows pick a driver, Enter starts the cup. Nothing else
    // happens on these keys while in the garage.
    if (state.phase === "garage") {
      if (window.Screens && window.Screens.isOverlayOpen()) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        selectDriver(state.selectedDriver + (event.key === "ArrowRight" ? 1 : -1));
      } else if (event.key === "Enter" && !event.repeat) {
        event.preventDefault();
        startCup();
      }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") input.throttle = true;
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") input.brake = true;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = true;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = true;
    if (event.key === "Shift") input.drift = true;
    if (event.key.toLowerCase() === "p" && (state.phase === "race" || state.phase === "countdown")) {
      event.preventDefault();
      togglePause();
    }
    // A way out mid-race without having to finish it.
    if (event.key.toLowerCase() === "q" && state.paused) {
      event.preventDefault();
      resetToGarage();
    }
    if (event.code === "Space") {
      event.preventDefault();
      const player = getPlayer();
      if (player && state.phase === "race" && player.currentItem !== "none") {
        useItem(player, player.currentItem, performance.now());
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(event.key) || event.code === "Space") {
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") input.throttle = false;
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") input.brake = false;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = false;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = false;
    if (event.key === "Shift") input.drift = false;
  });
}
```

**(q)** Replace the start-up lines at the bottom of `game.js` with:

```js
// The actions the screens may take, and the plain data they may read.
window.Game = {
  getPitLaneState,
  selectDriver,
  selectCup,
  selectDifficulty,
  startCup,
  nextRace,
  backToPitLane: resetToGarage,
  setSound(on) {
    initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    setAudioEnabled(on);
  },
  isSoundOn: () => audio.enabled,
  toggleFullscreen,
  isFullscreen: isFullscreenActive,
};

loadAudioPreference();
loadDifficultyPreference();
if (window.Screens) {
  window.Screens.init();
  window.Screens.showPitLane();
}
bindEvents();
requestAnimationFrame(update);
```

**(r)** Check nothing else touches removed DOM:

Run: `grep -n "ui\.\(driver\|kart\|stat\|track\|startCup\|cup\|difficulty\|lap\|place\|race\|toggle\|fullscreen\|sound\|item\|mini\|status\|results\|podium\|restart\|career\)" game.js`
Expected: no output. And `node --check game.js` prints nothing.

- [ ] **Step 7: Retire the old page and stylesheet**

Replace `index.html` for now (Task 5 rewrites it as the landing page):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=./play.html">
  <title>F1 Pixel Cup</title>
</head>
<body><a href="./play.html">Play F1 Pixel Cup</a></body>
</html>
```

Delete `styles.css`: `git rm styles.css`.

In `tools/checks/career-check.js`, change the `panel` line to read the career chip:

```js
      panel: document.getElementById("career-chip").innerText,
```

- [ ] **Step 8: Run the checks**

Run `tools/checks/play-check.js` with `browser_run_code_unsafe`.
Expected:
- `pitlane: true`, `tiles: 20`, `fills1440: true`, `chip` contains `F4 1210`
- `pickedNorris: true`, `arrowNext: true`, `legendOn: true`
- `careerOpen: true`, `xss: true`, `careerClosedByEsc: true`, `settingsOpen: true`, `settingsClosedByEsc: true`
- `fills1000: true`, `noSideScroll1000: true`, `noSideScroll520: true`, `startInside520: true`
- `startedOnce: true`, `pitlaneHiddenInRace: true`, `tower: true`, `towerRows` 10 (or 11 when the player is outside the top ten, whose own row is added below a spacer), `ticker` non-empty
- `results: true`, `resultRows: 20`, `resultsCareer: true`, `fillsWithResults: true`, `backToPitlane: true`
- `deepLinkCareer: true`
- `errors: []`

Then run `tools/checks/career-check.js` and `tools/checks/race-sim.js`.
Expected: as in Task 1 Step 7, with `panel` now the chip text (e.g. `CAREER · F3 1349 · 276 PTS`, matching the last strip's rating).

Run: `npm test` → 41 pass.

- [ ] **Step 9: Look at it**

Take screenshots (real window size) of: the pit lane at 1440×900 and 520×800, a race with the tower, the results screen, the podium, and the career screen. Confirm by eye: nothing overlaps, the tower sits under the lap panel and clear of the mini map, the ticker sits above the power-up badge, text is legible.

- [ ] **Step 10: Commit and push**

```bash
git add site.css play.css play.html screens.js game.js index.html tools/checks/play-check.js tools/checks/career-check.js
git commit -m "Move the game to play.html with full-window screens"
git push origin main
```

---

### Task 4: Real game shots for the landing page

**Files:**
- Create: `tools/capture-shots.js`
- Create: `assets/shots/hero.jpg`, `assets/shots/circuit-<id>.jpg` (8), `assets/shots/team-<id>.jpg` (10)

**Interfaces:**
- Consumes: `play.html`, `window.Game`, game globals `startRace`, `resetToGarage`, `getPlayer`, `state`, `CUPS`, `TEAMS`, `DRIVERS`.
- Produces: the 19 image files above, named exactly `hero.jpg`, `circuit-monza.jpg` … `circuit-interlagos.jpg`, `team-redBull.jpg` … `team-sauber.jpg`.

- [ ] **Step 1: Write the capture script**

Create `tools/capture-shots.js`:

```js
// Capture the landing page's images from the real game, HUD hidden.
// Run with the Playwright MCP tool browser_run_code_unsafe,
// filename: tools/capture-shots.js, dev server on http://localhost:8765.
// Then resize with sips (see README). Writes to assets/shots/.
async (page) => {
  const OUT = `${process.cwd()}/assets/shots/`;
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1600, height: 1000 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForTimeout(2000);
  const hideOverlays = () => p.evaluate(() => {
    document.getElementById("game").style.visibility = "hidden";
    document.getElementById("screens").style.visibility = "hidden";
  });
  // Page screenshots (the canvas shell fills the window); clip crops in page
  // coordinates.
  const shot = (name, clip) => p.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 88, scale: "css", ...(clip ? { clip } : {}) });
  const written = [];

  // One shot per circuit, the player on autopilot a few seconds in.
  const circuits = await p.evaluate(() => CUPS.flatMap((cup, ci) => cup.tracks.map((t, ti) => ({ ci, ti, id: t.id }))));
  for (const c of circuits) {
    await p.evaluate(({ ci, ti }) => {
      state.selectedCup = ci; state.activeCupIndex = ci; buildCupEntries(); startRace(ti);
    }, c);
    await p.waitForTimeout(5600);
    await p.evaluate(() => { getPlayer().isPlayer = false; });
    await p.waitForTimeout(6500);
    await hideOverlays();
    await p.waitForTimeout(150);
    await shot(`circuit-${c.id}`);
    written.push(`circuit-${c.id}`);
    if (c.id === "spa") {
      await shot("hero");
      written.push("hero");
    }
  }

  // One showroom shot per team, the car framed in the right part of the window.
  await p.evaluate(() => resetToGarage());
  const teams = await p.evaluate(() => TEAMS.map((t) => ({ id: t.id, driver: DRIVERS.findIndex((d) => d.teamId === t.id) })));
  const box = await p.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  for (const t of teams) {
    await p.evaluate((index) => Game.selectDriver(index), t.driver);
    await hideOverlays();
    await p.waitForTimeout(1300);
    await shot(`team-${t.id}`, { x: box.width * 0.36, y: box.height * 0.12, width: box.width * 0.64, height: box.height * 0.8 });
    written.push(`team-${t.id}`);
  }
  await context.close();
  return written;
}
```

- [ ] **Step 2: Run it and resize the images**

Run: `mkdir -p assets/shots`, then run `tools/capture-shots.js` with `browser_run_code_unsafe`.
Expected: a list of 19 names (8 circuits, `hero`, 10 teams), and 19 files in `assets/shots/`. If the list is right but the folder is empty, the Playwright server's working directory is not the repo: set `OUT` in the script to the repo's absolute `assets/shots/` path and run it again.

Run:
```bash
sips -Z 1920 -s formatOptions 78 assets/shots/hero.jpg >/dev/null
for f in assets/shots/circuit-*.jpg assets/shots/team-*.jpg; do sips -Z 900 -s formatOptions 76 "$f" >/dev/null; done
ls assets/shots | wc -l; du -sh assets/shots
```
Expected: `19`, total under 4 MB.

- [ ] **Step 3: Check them by eye**

Open a tiled contact sheet (e.g. with PIL) of all 19 and confirm: no HUD or menus in any shot, every circuit shows road and cars, every team shot shows its own livery with the car fully in frame.

- [ ] **Step 4: Commit**

```bash
git add tools/capture-shots.js assets/shots
git commit -m "Capture real game shots for the landing page"
```

---

### Task 5: The landing page

**Files:**
- Rewrite: `index.html`
- Create: `landing.css`, `landing.js`, `tools/checks/landing-check.js`

**Interfaces:**
- Consumes: `TRACK_SHAPES`, `CIRCUITS`, `CUP_DEFS`, `TEAMS`, `DRIVERS`, `POWER_UPS` (Task 1), `TrackMap.path`, `Device.isTouchOnly` (Task 2), `Career.getProfile`, `Career.tierFor` (career.js), images from Task 4.
- Produces: `index.html` with sections `#hero`, `#circuits` (8 `.circuit-card`, each with an `svg path`), `#career` (`#career-summary`), `#grid` (10 `.team-card`), `#how-to-play`; Play links to `./play.html`; `#phone-play-note` dialog.

- [ ] **Step 1: Write the failing check**

Create `tools/checks/landing-check.js`:

```js
// Browser check for index.html (landing page). Run with the Playwright MCP
// tool browser_run_code_unsafe, filename: tools/checks/landing-check.js.
async (page) => {
  const errors = [];
  const out = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const size = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(400);
  };
  const noSideScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

  await size(1440, 900);
  await p.goto(`http://localhost:8765/?${Date.now()}`);
  await p.evaluate(() => localStorage.removeItem("f1pixelcup.profile"));
  await p.reload();
  await p.waitForTimeout(1200);
  out.threeLoaded = await p.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("three")));
  out.circuits = await p.locator("#circuits .circuit-card").count();
  out.maps = await p.locator("#circuits .circuit-card svg path.track").count();
  out.teams = await p.locator("#grid .team-card").count();
  out.newPlayer = (await p.locator("#career-summary").innerText()).toLowerCase().includes("starts");
  out.heroImage = await p.evaluate(() => { const i = document.querySelector("#hero img"); return Boolean(i) && i.complete && i.naturalWidth > 0; });
  out.playHref = await p.locator("#hero a.go-btn").getAttribute("href");
  out.noSideScroll1440 = await noSideScroll();

  await p.evaluate(() => localStorage.setItem("f1pixelcup.profile", JSON.stringify({ version: 1, careerPoints: 276, rating: 1309, ratedRaces: 4,
    totals: { races: 4, wins: "<img src=x onerror=window.__xss=1>", podiums: 4, cupsCompleted: 1, cupsWon: 1 },
    bestLaps: { monza: { ms: 36280 } }, history: [] })));
  await p.reload();
  await p.waitForTimeout(1000);
  const summary = await p.locator("#career-summary").innerText();
  out.returning = summary.includes("1309") && summary.includes("0:36.28");
  out.xss = await p.evaluate(() => window.__xss === undefined);
  out.careerLink = await p.locator("#career a[href*='play.html#career']").count();

  for (const [w, h] of [[1000, 700], [1900, 760], [560, 800]]) {
    await size(w, h);
    out[`noSideScroll${w}`] = await noSideScroll();
  }

  // Shots missing: every card must fall back cleanly.
  await p.route("**/assets/shots/**", (route) => route.abort());
  await p.reload();
  await p.waitForTimeout(1200);
  out.brokenImagesVisible = await p.evaluate(() => [...document.querySelectorAll("img")].filter((i) => i.getClientRects().length && i.complete && i.naturalWidth === 0).length);
  await p.unroute("**/assets/shots/**");
  await context.close();

  // Phone-sized, touch-only (smaller than the window, so nothing is cropped).
  const phone = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const q = await phone.newPage();
  q.on("pageerror", (e) => errors.push(String(e)));
  await q.goto(`http://localhost:8765/?${Date.now()}`);
  await q.waitForTimeout(1000);
  out.phoneNoSideScroll = await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await q.locator("#hero a.go-btn").click();
  await q.waitForTimeout(300);
  out.phoneNote = await q.evaluate(() => { const n = document.getElementById("phone-play-note"); return Boolean(n) && n.open === true; });
  out.phoneStayed = !q.url().includes("play.html");
  await phone.close();
  return { ...out, errors };
}
```

- [ ] **Step 2: Run it to verify it fails**

Run `tools/checks/landing-check.js`.
Expected: `circuits: 0`, `teams: 0`, `heroImage: false` (index.html is still the redirect), and a timeout on `#career-summary` — red.

- [ ] **Step 3: Write the page**

Rewrite `index.html` (favicon: same data URI as `play.html`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>F1 Pixel Cup — Race the real circuits in your browser</title>
  <meta name="description" content="All 20 drivers of the 2025 season on eight real circuits, in 3D, in your browser.">
  <link rel="icon" href="COPY THE SAME data:image/svg+xml,... VALUE AS play.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,400;0,600;0,700;0,900;1,700;1,900&display=swap">
  <link rel="stylesheet" href="./site.css">
  <link rel="stylesheet" href="./landing.css">
</head>
<body class="landing">
  <header class="topbar">
    <a class="wordmark" href="#hero">F1 PIXEL CUP</a>
    <nav class="topnav" aria-label="Sections">
      <a href="#circuits">Circuits</a>
      <a href="#career">Your career</a>
      <a href="#grid">The grid</a>
      <a href="#how-to-play">How to play</a>
    </nav>
    <a class="go-btn play-link" href="./play.html"><span>Play</span></a>
  </header>

  <main>
    <section id="hero" class="hero">
      <img src="./assets/shots/hero.jpg" alt="The field racing through the forest at Spa-Francorchamps" data-fallback="hero">
      <div class="hero-shade"></div>
      <div class="hero-tower" aria-hidden="true">
        <div class="tower-row"><b>1</b><i style="background:#1e41b2"></i><span>VER</span><em>LEADER</em></div>
        <div class="tower-row"><b>2</b><i style="background:#ff8000"></i><span>NOR</span><em>+0.4</em></div>
        <div class="tower-row"><b>3</b><i style="background:#dc0000"></i><span>LEC</span><em>+1.1</em></div>
        <div class="tower-row is-player"><b>4</b><i style="background:#e10600"></i><span>YOU</span><em>+1.6</em></div>
      </div>
      <div class="hero-copy">
        <p class="kicker">2025 season · 8 real circuits</p>
        <h1 class="it-title hero-title">Lights out.<br>Your race.</h1>
        <p class="hero-lead">All 20 drivers, eight real circuits and a career that remembers every lap. In 3D, in your browser.</p>
        <a class="go-btn play-link" href="./play.html"><span>Play now ›</span></a>
      </div>
    </section>

    <section id="circuits" class="section">
      <p class="kicker">The calendar</p>
      <h2 class="it-title section-title">Eight real circuits</h2>
      <p class="section-lead muted">Every track is traced from the real layout, from Monza's straights to Suzuka's figure of eight.</p>
      <div id="circuit-list" class="circuit-list"></div>
    </section>

    <section id="career" class="section">
      <p class="kicker">Your career</p>
      <h2 class="it-title section-title">Every lap counts</h2>
      <div id="career-summary" class="career-summary"></div>
    </section>

    <section id="grid" class="section">
      <p class="kicker">The grid</p>
      <h2 class="it-title section-title">Ten teams, twenty drivers</h2>
      <div id="team-list" class="team-list"></div>
    </section>

    <section id="how-to-play" class="section">
      <p class="kicker">How to play</p>
      <h2 class="it-title section-title">Keyboard, and nerve</h2>
      <div class="howto">
        <div class="howto-block">
          <h3>Controls</h3>
          <dl class="keys">
            <dt>W / ↑</dt><dd>Throttle</dd>
            <dt>S / ↓</dt><dd>Brake, then reverse</dd>
            <dt>A D / ← →</dt><dd>Steer</dd>
            <dt>Shift</dt><dd>Hold through a corner to drift</dd>
            <dt>Space</dt><dd>Use your power-up</dd>
            <dt>Esc / P</dt><dd>Pause (Q from pause to quit)</dd>
          </dl>
        </div>
        <div class="howto-block">
          <h3>Drift boost</h3>
          <p class="muted">Hold Shift through a corner. The tyre smoke turns white, then blue, then orange as the boost charges — let go on orange for the biggest kick.</p>
          <h3>Power-ups</h3>
          <p class="muted">Drive through the red boxes. The further back you are, the stronger what you get.</p>
          <ul id="power-up-list" class="power-ups"></ul>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <p>Circuit outlines: <a href="https://github.com/bacinger/f1-circuits">bacinger/f1-circuits</a> (MIT) · Textures: <a href="https://polyhaven.com">Poly Haven</a> (CC0) · 3D: <a href="https://threejs.org">Three.js</a> (MIT)</p>
    <p class="muted">F1 Pixel Cup is a fan project, not affiliated with Formula 1.</p>
  </footer>

  <dialog id="phone-play-note" class="phone-note">
    <p class="kicker">Heads up</p>
    <h2 class="it-title">Best played on a computer with a keyboard</h2>
    <p class="muted">F1 Pixel Cup is driven with the keyboard. Touch controls are on the way.</p>
    <div class="note-actions">
      <button class="ghost-btn" type="button" data-close>Stay here</button>
      <a class="go-btn" href="./play.html"><span>Play anyway ›</span></a>
    </div>
  </dialog>

  <script src="./tracks-data.js"></script>
  <script src="./game-data.js"></script>
  <script src="./trackmap.js"></script>
  <script src="./device.js"></script>
  <script src="./career.js"></script>
  <script src="./landing.js"></script>
</body>
</html>
```

(The icon `href` line is an instruction: paste the same data URI string used in `play.html`.)

Create `landing.css`:

```css
/* Landing page layout (shared look lives in site.css). */
html { scroll-behavior: smooth; scroll-padding-top: 64px; }
body.landing { overflow-x: hidden; }

.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 24px;
  padding: 12px clamp(16px, 4vw, 48px);
  background: rgba(7, 7, 12, 0.88);
  backdrop-filter: blur(8px);
  border-bottom: 2px solid var(--red);
}
.wordmark { font: italic 900 1.15rem/1 var(--font); text-decoration: none; letter-spacing: 0.02em; }
.topnav { display: flex; gap: 22px; margin-left: auto; }
.topnav a { text-decoration: none; font: 700 0.8rem/1 var(--font); letter-spacing: 0.12em; text-transform: uppercase; color: #ddd; }
.topnav a:hover { color: #fff; }
.topbar .go-btn { font-size: 0.85rem; padding: 0.65em 1.4em; }

.hero { position: relative; min-height: min(78vh, 760px); display: flex; align-items: flex-end; overflow: hidden; }
.hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 60%; }
.hero.no-shot { background: radial-gradient(circle at 70% 40%, #2a0605, var(--bg) 70%); }
.hero-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7, 7, 12, 0.94) 0%, rgba(7, 7, 12, 0.55) 45%, rgba(7, 7, 12, 0.05) 75%), linear-gradient(0deg, var(--bg) 0%, rgba(7, 7, 12, 0) 30%); }
.hero-copy { position: relative; padding: clamp(24px, 6vw, 72px) clamp(16px, 5vw, 64px); max-width: 640px; }
.hero-title { font-size: clamp(2.8rem, 8vw, 6rem); margin: 12px 0 16px; }
.hero-lead { font-size: clamp(1rem, 1.6vw, 1.2rem); color: #d6d6de; margin: 0 0 26px; max-width: 30em; }
.hero-copy .go-btn { font-size: 1.15rem; }
.hero-tower { position: absolute; right: clamp(16px, 4vw, 48px); top: 36px; width: 200px; border-left: 3px solid var(--red); }

.section { padding: clamp(48px, 8vw, 96px) clamp(16px, 5vw, 64px) 0; max-width: 1400px; margin: 0 auto; }
.section-title { font-size: clamp(2rem, 5vw, 3.4rem); margin: 10px 0 12px; }
.section-lead { max-width: 40em; margin: 0 0 28px; }

.circuit-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.circuit-card { background: var(--panel); border-top: 3px solid var(--red); overflow: hidden; display: flex; flex-direction: column; }
.circuit-shot { aspect-ratio: 16 / 9; background: linear-gradient(135deg, var(--panel-2), #1d0706); position: relative; }
.circuit-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.circuit-body { display: grid; grid-template-columns: 1fr 96px; gap: 10px; padding: 14px 16px 16px; align-items: center; }
.circuit-body h3 { margin: 0 0 4px; font: italic 900 1.05rem/1.1 var(--font); text-transform: uppercase; }
.circuit-meta { color: var(--muted); font-size: 0.85rem; line-height: 1.4; }
.circuit-map { width: 96px; height: 72px; }
.circuit-map .track { fill: none; stroke: #fff; stroke-width: 3; stroke-linejoin: round; }
.circuit-map .start { fill: var(--red); }

.career-summary { background: var(--panel); border-left: 3px solid var(--red); padding: clamp(18px, 3vw, 32px); display: grid; gap: 18px; }
.career-summary .career-tier { font: italic 900 clamp(2rem, 5vw, 3rem)/1 var(--font); text-transform: uppercase; }
.summary-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.summary-stat { background: rgba(255, 255, 255, 0.03); padding: 10px 12px; }
.summary-stat span { display: block; color: var(--muted); font: 700 0.66rem/1 var(--font); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }
.summary-stat strong { font-size: 1.35rem; }
.summary-bests { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 6px; }
.summary-best { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; background: rgba(255, 255, 255, 0.03); font-weight: 600; }
.summary-best span { color: var(--muted); }

.team-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
.team-card { background: var(--panel); border-top: 4px solid var(--team); overflow: hidden; }
.team-shot { aspect-ratio: 16 / 10; background: linear-gradient(135deg, var(--team), #07070c 80%); }
.team-shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
.team-body { padding: 12px 16px 16px; }
.team-body h3 { margin: 0; font: italic 900 1.05rem/1.1 var(--font); text-transform: uppercase; }
.team-car { color: var(--muted); font-size: 0.85rem; margin: 2px 0 10px; }
.team-drivers { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-weight: 600; }
.team-drivers b { display: inline-block; min-width: 2.2em; color: var(--red); }

.howto { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
.howto-block { background: var(--panel); padding: 20px 24px; }
.howto-block h3 { margin: 0 0 10px; font: italic 900 1.05rem/1.1 var(--font); text-transform: uppercase; }
.howto-block h3 + p { margin-top: 0; }
.keys { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }
.keys dt { font-weight: 700; background: var(--panel-2); padding: 2px 8px; border-bottom: 2px solid #000; }
.keys dd { margin: 0; color: var(--muted); align-self: center; }
.power-ups { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.power-ups li strong { color: #fff; }
.power-ups li { color: var(--muted); }

.footer { margin-top: clamp(56px, 8vw, 96px); padding: 24px clamp(16px, 5vw, 64px); border-top: 1px solid var(--line); font-size: 0.85rem; }
.footer p { margin: 4px 0; }

.phone-note { max-width: 420px; background: var(--panel); color: var(--ink); border: 0; border-top: 3px solid var(--red); padding: 24px; }
.phone-note::backdrop { background: rgba(5, 5, 10, 0.8); }
.phone-note h2 { font-size: 1.8rem; margin: 10px 0; }
.note-actions { display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; margin-top: 18px; }

@media (max-width: 860px) {
  .topnav { display: none; }
  .topbar { justify-content: space-between; }
  .hero-tower { display: none; }
  .hero { min-height: 70vh; }
}
```

Create `landing.js`:

```js
// Landing page: builds the circuits, career and grid sections from the game's
// own data, and warns phones before sending them into a keyboard game.
(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const $ = (id) => document.getElementById(id);

  function lapTime(ms) {
    if (!ms || ms <= 0) return "—";
    const total = ms / 1000;
    const minutes = Math.floor(total / 60);
    return `${minutes}:${(total - minutes * 60).toFixed(2).padStart(5, "0")}`;
  }

  // A missing shot leaves a styled panel, never a broken-image icon.
  function guardImages() {
    document.querySelectorAll("img").forEach((img) => {
      const fail = () => {
        const holder = img.closest(".hero, .circuit-shot, .team-shot");
        if (holder) holder.classList.add("no-shot");
        img.remove();
      };
      if (img.complete && img.naturalWidth === 0) fail();
      else img.addEventListener("error", fail, { once: true });
    });
  }

  function renderCircuits() {
    const cupName = (id) => (CUP_DEFS.find((cup) => cup.circuitIds.includes(id)) || { name: "" }).name;
    $("circuit-list").innerHTML = CIRCUITS.map((c) => {
      const map = TrackMap.path((TRACK_SHAPES[c.id] || {}).points || [], { width: 96, height: 72, padding: 6 });
      const start = map.start ? `<circle class="start" cx="${map.start.x}" cy="${map.start.y}" r="4"></circle>` : "";
      return `
        <article class="circuit-card">
          <div class="circuit-shot"><img src="./assets/shots/circuit-${esc(c.id)}.jpg" alt="Racing at ${esc(c.name)}" loading="lazy"></div>
          <div class="circuit-body">
            <div>
              <h3>${esc(c.name)}</h3>
              <div class="circuit-meta">${esc(c.country)} · ${(c.lengthM / 1000).toFixed(3)} km · ${num(c.laps)} laps<br>${esc(cupName(c.id))}</div>
            </div>
            <svg class="circuit-map" viewBox="${map.viewBox}" role="img" aria-label="Map of ${esc(c.name)}"><path class="track" d="${map.d}"></path>${start}</svg>
          </div>
        </article>`;
    }).join("");
  }

  function renderCareer() {
    let profile = null;
    try {
      profile = window.Career ? Career.getProfile() : null;
    } catch (error) {
      profile = null;
    }
    const totals = (profile && profile.totals) || {};
    const rating = profile ? num(profile.rating) : 1200;
    const tier = window.Career ? Career.tierFor(rating) : "F4";
    if (!profile || num(totals.races) === 0) {
      $("career-summary").innerHTML = `
        <div><span class="career-tier">${esc(tier)}</span></div>
        <p>Your career starts at <strong>1200 · F4</strong>. Every race earns career points (more on harder difficulties), moves your rating up or down, and records your best lap on every circuit — saved in this browser.</p>
        <p><a class="go-btn" href="./play.html"><span>Start your career ›</span></a></p>`;
      return;
    }
    const stats = [
      ["Rating", rating],
      ["Career points", num(profile.careerPoints).toLocaleString()],
      ["Races", num(totals.races)],
      ["Wins", num(totals.wins)],
      ["Podiums", num(totals.podiums)],
      ["Cups won", `${num(totals.cupsWon)} / ${num(totals.cupsCompleted)}`],
    ];
    $("career-summary").innerHTML = `
      <div><span class="career-tier">${esc(tier)}</span> <span class="muted">· rating ${rating}</span></div>
      <div class="summary-stats">${stats.map(([label, value]) => `<div class="summary-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("")}</div>
      <div class="summary-bests">${CIRCUITS.map((c) => {
        const best = profile.bestLaps ? profile.bestLaps[c.id] : null;
        return `<div class="summary-best"><span>${esc(c.name)}</span><strong>${esc(lapTime(best ? num(best.ms) : 0))}</strong></div>`;
      }).join("")}</div>
      <p><a class="ghost-btn" href="./play.html#career">Open career</a></p>`;
  }

  function renderGrid() {
    $("team-list").innerHTML = TEAMS.map((team) => {
      const drivers = DRIVERS.filter((d) => d.teamId === team.id);
      return `
        <article class="team-card" style="--team:${esc(team.body)}">
          <div class="team-shot"><img src="./assets/shots/team-${esc(team.id)}.jpg" alt="The ${esc(team.name)} ${esc(team.car)}" loading="lazy"></div>
          <div class="team-body">
            <h3>${esc(team.name)}</h3>
            <p class="team-car">${esc(team.car)}</p>
            <ul class="team-drivers">${drivers.map((d) => `<li><b>${num(d.number)}</b>${esc(d.name)}</li>`).join("")}</ul>
          </div>
        </article>`;
    }).join("");
  }

  function renderPowerUps() {
    $("power-up-list").innerHTML = POWER_UPS.map((p) => `<li><strong>${esc(p.name)}</strong> — ${esc(p.effect)}</li>`).join("");
  }

  function guardPlayOnPhones() {
    if (!window.Device || !Device.isTouchOnly(window.matchMedia && window.matchMedia.bind(window))) return;
    const note = $("phone-play-note");
    document.querySelectorAll("a.play-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof note.showModal === "function") note.showModal();
        else window.location.href = link.href;
      });
    });
    note.querySelector("[data-close]").addEventListener("click", () => note.close());
  }

  renderCircuits();
  renderCareer();
  renderGrid();
  renderPowerUps();
  guardImages();
  guardPlayOnPhones();
}());
```

- [ ] **Step 4: Run the check**

Run `tools/checks/landing-check.js`.
Expected: `threeLoaded: false`, `circuits: 8`, `maps: 8`, `teams: 10`, `newPlayer: true`, `heroImage: true`, `playHref: "./play.html"`, `noSideScroll1440: true`, `returning: true`, `xss: true`, `careerLink: 1`, `noSideScroll1000/1900/560: true`, `brokenImagesVisible: 0`, `phoneNoSideScroll: true`, `phoneNote: true`, `phoneStayed: true`, `errors: []`.

Note: the `circuits` loop images use `loading="lazy"`; the broken-image check only counts images that are laid out, completed and empty, which is what a visitor would see.

- [ ] **Step 5: Look at it**

Screenshots at real window sizes 1440×900 (full page) and 560×800, and the phone context (full page). Confirm by eye: the hero reads like the chosen Broadcast mockup, cards align, maps are recognisable, nothing overflows.

- [ ] **Step 6: Commit and push**

```bash
git add index.html landing.css landing.js tools/checks/landing-check.js
git commit -m "Add the landing page"
git push origin main
```

---

### Task 6: Documentation and a full pass

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: README describing the two pages, the checks and the shot capture; pushed `main`.

- [ ] **Step 1: Update the README**

In `README.md`:

1. Replace the `## Project Structure` tree with:

```
F1_Pixel_Cup/
├── index.html        # Landing page (no 3D; loads fast)
├── landing.css/.js   # Landing page layout and sections
├── play.html         # The game, full window
├── play.css          # Game page layout
├── screens.js        # Game screens: pit lane, results, podium, career, settings, timing tower
├── site.css          # Shared Broadcast look
├── game.js           # Racing, AI, items, audio, camera and the canvas HUD
├── game-data.js      # Teams, drivers, difficulties, circuits, cups, power-ups
├── career.js         # Career points, rating, best laps and the saved profile
├── trackmap.js       # Circuit outline -> SVG map
├── device.js         # Touch-only detection
├── tracks-data.js    # Real circuit outlines, generated by tools/tracks
├── render3d.js, r3d/ # Three.js renderer
├── assets/           # f1_car.glb, textures/, shots/ (captured from the game)
├── vendor/three/     # Three.js, vendored
├── tests/            # Unit tests (npm test)
└── tools/            # blender/, tracks/, capture-shots.js, checks/
```

2. Under `## Deployment` → `### Local`, add after the server commands:

```markdown
Open `http://localhost:8080` for the landing page, or `http://localhost:8080/play.html` to go straight to the game.
```

3. Add a section before `## Credits`:

```markdown
## Checks

- `npm test` — unit tests (career scoring, game data, track maps, touch detection).
- Browser checks in `tools/checks/` run through the Playwright MCP tool
  (`browser_run_code_unsafe` with the file) against a local server on port
  8765: `play-check.js`, `landing-check.js`, `career-check.js`, `race-sim.js`.
- `tools/capture-shots.js` recaptures the landing page's images from the real
  game; resize them afterwards with
  `sips -Z 1920 -s formatOptions 78 assets/shots/hero.jpg` and
  `sips -Z 900 -s formatOptions 76 assets/shots/{circuit,team}-*.jpg`.
```

4. In `## Heads-up display`, add a bullet: `- **Timing tower** — live order and gaps down the left, with a feed ticker for race news`.

- [ ] **Step 2: Run everything**

Run: `npm test` → 41 pass.
Run each browser check: `play-check.js`, `landing-check.js`, `career-check.js`, `race-sim.js` → all as expected in their tasks, `errors: []` everywhere.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "Document the two pages, the checks and the shot capture"
git push origin main
```
