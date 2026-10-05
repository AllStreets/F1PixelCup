// Browser check: choosing races (docs/superpowers/specs/2026-10-01-race-choices-design.md).
// Every choice end to end through the pit lane's own controls: a random cup
// shown before the start, rerolled, remembered, raced as shown to its podium
// with the career credited; a custom cup picked in the circuit picker with
// search and reordering, raced in that order to its podium; a single race,
// random and chosen, with the pit lane's difficulty, grid and weather; and
// two players in a custom cup, both careers credited. Run with the Playwright
// MCP tool browser_run_code_unsafe, filename: tools/checks/choices-check.js,
// dev server on http://localhost:8765. Expected: every value in `results`
// true, errors []. Returns { results, errors }.
async (page) => {
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const errors = [];
  const results = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const KEYS = ["f1pixelcup.race", "f1pixelcup.custom", "f1pixelcup.single", "f1pixelcup.draw", "f1pixelcup.cup"];
  const open = async (query = "") => {
    await p.goto(`http://localhost:8765/play.html?${query}${query ? "&" : ""}${Date.now()}`);
    await p.waitForFunction(() => window.Game && window.Screens && document.getElementById("pitlane"), null, { timeout: 30000 });
    // Every car on autopilot, to the flag; the results come up.
    await p.evaluate(() => {
      // slow: player 1's car at 60% of its pace, to finish out of the points.
      window.__runRace = (slow = false) => {
        state.racers.forEach((r) => { r.isPlayer = false; });
        if (slow) state.racers.filter((r) => r.id === state.playerId).forEach((r) => { r.physics.maxSpeed *= 0.6; });
        state.phase = "race";
        let now = 100000;
        state.raceStart = now; state.lastTick = now;
        state.racers.forEach((r) => { r.lapStartAt = now; });
        for (let t = 0; t < 900 && state.phase === "race"; t += 1 / 60) { now += 1000 / 60; updateRace(1 / 60, now); }
        return state.phase;
      };
    });
  };
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 200)}`; } };
  // A real click on a pit-lane control; false when it isn't there to click.
  const click = async (selector) => {
    try { await p.click(selector, { timeout: 3000 }); return true; } catch (e) { return false; }
  };
  const fill = async (selector, text) => {
    try { await p.fill(selector, text, { timeout: 3000 }); return true; } catch (e) { return false; }
  };
  const shownCircuits = () => step(() => [...document.querySelectorAll("#cup-circuits li")].map((li) => li.dataset.circuit || li.textContent.trim()));

  await open();
  await step((keys) => { keys.forEach((k) => localStorage.removeItem(k)); }, KEYS);
  await open();
  await step(() => {
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === "leclerc"));
    Game.selectDifficulty(1); Game.selectGridMode("back"); Game.selectWeatherMode("dry"); Game.selectPlayers(1);
  });

  // ---- The choices are offered, beside the cups and the season ----
  results.choicesOffered = await step(() => {
    const pills = [...document.querySelectorAll("#race-pills [data-race]")].map((b) => b.dataset.race);
    return JSON.stringify(pills) === JSON.stringify(["cup", "season", "random", "custom", "single"]) || JSON.stringify(pills);
  });

  // ---- Random cup: four shown before the start, no repeats; a reroll deals another four ----
  await click('#race-pills [data-race="random"]');
  const drawn = await shownCircuits();
  results.randomShown = await step((drawn) => {
    const ids = CIRCUITS.map((c) => c.id);
    const ok = Array.isArray(drawn) && drawn.length === 4 && new Set(drawn).size === 4 && drawn.every((id) => ids.includes(id))
      && /Start Random Cup/.test(document.getElementById("start-cup").textContent);
    return ok || JSON.stringify({ drawn, start: document.getElementById("start-cup").textContent });
  }, drawn);
  await click('[data-action="reroll"]');
  const rerolled = await shownCircuits();
  results.randomRerolls = (Array.isArray(rerolled) && rerolled.length === 4 && new Set(rerolled).size === 4
    && JSON.stringify(rerolled) !== JSON.stringify(drawn)) || JSON.stringify({ drawn, rerolled });
  // Seeded and remembered: a reload shows the same four.
  await open();
  const again = await shownCircuits();
  results.randomRemembered = JSON.stringify(again) === JSON.stringify(rerolled) || JSON.stringify({ rerolled, again });

  // Started: the four on screen are the four raced, in that order, to the podium.
  await click("#start-cup");
  results.randomRacedAsShown = await step((shown) => {
    const cup = getActiveCup();
    const ok = cup.id === "randomCup" && JSON.stringify(cup.tracks.map((t) => t.id)) === JSON.stringify(shown) && state.track.id === shown[0];
    window.__run = { id: state.cupRunId, driver: humanEntry(0).driver.id };
    return ok || JSON.stringify({ id: cup.id, tracks: cup.tracks.map((t) => t.id), shown });
  }, again);
  results.randomFourRaces = await step(() => {
    const seen = [];
    for (let i = 0; i < 4; i += 1) {
      seen.push(state.track.id);
      const phase = window.__runRace();
      if (phase !== "results") return `race ${i + 1} ended in ${phase}`;
      const kicker = document.getElementById("results-kicker").textContent;
      if (!kicker.includes(`Race ${i + 1} of 4 · Random Cup`)) return `kicker ${kicker}`;
      if (i < 3) Game.nextRace();
    }
    return /Show podium/.test(document.getElementById("results-next").textContent) || document.getElementById("results-next").textContent;
  });
  // (The ceremony is readied behind the results; a loaded machine can take
  // longer than the game's own wait, so the check waits for it first.)
  await p.waitForFunction(() => worldView() !== "3d" || state.podiumReady === "ready", null, { timeout: 60000 }).catch(() => {});
  await step(() => Game.nextRace());
  await p.waitForFunction(() => state.phase === "podium", null, { timeout: 30000 }).catch(() => {});
  results.randomPodium = await step(() => {
    const kicker = document.getElementById("podium-kicker").textContent;
    const threeD = worldView() !== "3d" || state.podium3d;
    return (state.phase === "podium" && kicker === "Random Cup complete" && threeD) || JSON.stringify({ phase: state.phase, kicker, threeD, view: worldView() });
  });
  results.randomCareer = await step(() => {
    const h = Career.getDriver(window.__run.driver).history.filter((e) => e.cupRunId === window.__run.id);
    const races = h.filter((e) => e.type === "race" && e.cupId === "randomCup").length;
    const cups = h.filter((e) => e.type === "cup" && e.cupId === "randomCup").length;
    const bests = h.filter((e) => e.type === "race").every((e) => Career.getDriver(window.__run.driver).bestLaps[e.trackId]);
    return (races === 4 && cups === 1 && bests) || JSON.stringify({ races, cups, bests });
  });
  // Back in the pit lane a fresh four wait for next time.
  await step(() => Game.backToPitLane());
  const next = await shownCircuits();
  results.randomFreshDraw = (Array.isArray(next) && next.length === 4 && JSON.stringify(next) !== JSON.stringify(again)) || JSON.stringify({ again, next });

  // ---- Custom cup: picked in the picker, with search and ordering ----
  await click('#race-pills [data-race="custom"]');
  results.customAsksForFour = await step(() => {
    const label = document.getElementById("start-cup").textContent;
    return /Choose 4 circuits/.test(label) || label;
  });
  // Start with none chosen opens the picker instead.
  await click("#start-cup");
  results.pickerOpens = await step(() => (state.phase === "garage" && !document.getElementById("circuits-screen").classList.contains("hidden")
    && document.activeElement && document.activeElement.id === "circuit-search") || JSON.stringify({ phase: state.phase, focus: document.activeElement && document.activeElement.id }));
  const pick = async (query, id) => {
    await fill("#circuit-search", query);
    const cards = await step(() => [...document.querySelectorAll("#circuit-cards [data-pick]")].filter((b) => b.getClientRects().length).map((b) => b.dataset.pick));
    await click(`#circuit-cards [data-pick="${id}"]`);
    return cards;
  };
  const monacoCards = await pick("monaco", "monaco");
  const japanCards = await pick("JAPAN", "suzuka");
  const accentCards = await pick("jose", "interlagos");
  await pick("", "monza");
  results.pickerSearches = (JSON.stringify(monacoCards) === JSON.stringify(["monaco"]) && JSON.stringify(japanCards) === JSON.stringify(["suzuka"])
    && JSON.stringify(accentCards) === JSON.stringify(["interlagos"])) || JSON.stringify({ monacoCards, japanCards, accentCards });
  // (The historic circuits are in the picker too: the Nürburgring is found.)
  await fill("#circuit-search", "nurburgring");
  results.pickerFindsHistoric = await step(() => JSON.stringify([...document.querySelectorAll("#circuit-cards [data-pick]")].map((el) => el.dataset.pick)) === JSON.stringify(["nurburgring"]) || document.getElementById("circuit-cards").textContent.slice(0, 120));
  await fill("#circuit-search", "brands hatch");
  results.pickerSaysNoMatch = await step(() => /No circuit matches/.test(document.getElementById("circuit-cards").textContent) || document.getElementById("circuit-cards").textContent.slice(0, 120));
  await fill("#circuit-search", "");
  // A fifth can't be added; the order is edited: Monza one place earlier.
  await click('#circuit-cards [data-pick="spa"]');
  const order = () => step(() => [...document.querySelectorAll("#circuit-order li[data-circuit]")].map((li) => li.dataset.circuit));
  const four = await order();
  await click('#circuit-order [data-move="3:-1"]');
  const moved = await order();
  await click('#circuit-order [data-unpick="suzuka"]');
  const removed = await order();
  await click('#circuit-cards [data-pick="spa"]');
  const refilled = await order();
  results.pickerOrders = (JSON.stringify(four) === JSON.stringify(["monaco", "suzuka", "interlagos", "monza"])
    && JSON.stringify(moved) === JSON.stringify(["monaco", "suzuka", "monza", "interlagos"])
    && JSON.stringify(removed) === JSON.stringify(["monaco", "monza", "interlagos"])
    && JSON.stringify(refilled) === JSON.stringify(["monaco", "monza", "interlagos", "spa"])) || JSON.stringify({ four, moved, removed, refilled });
  await click('[data-action="pickerDone"]');
  const customShown = await shownCircuits();
  results.customShown = await step((shown) => {
    const ok = JSON.stringify(shown) === JSON.stringify(["monaco", "monza", "interlagos", "spa"])
      && document.getElementById("circuits-screen").classList.contains("hidden")
      && /Start Custom Cup/.test(document.getElementById("start-cup").textContent);
    return ok || JSON.stringify({ shown, start: document.getElementById("start-cup").textContent });
  }, customShown);
  await open();
  results.customRemembered = JSON.stringify(await shownCircuits()) === JSON.stringify(["monaco", "monza", "interlagos", "spa"]) || JSON.stringify(await shownCircuits());
  await click("#start-cup");
  results.customRacedInOrder = await step(() => {
    window.__run = { id: state.cupRunId, driver: humanEntry(0).driver.id };
    const seen = [];
    for (let i = 0; i < 4; i += 1) {
      seen.push(state.track.id);
      const phase = window.__runRace();
      if (phase !== "results") return `race ${i + 1} ended in ${phase}`;
      if (i < 3) Game.nextRace();
    }
    return (getActiveCup().id === "customCup" && JSON.stringify(seen) === JSON.stringify(["monaco", "monza", "interlagos", "spa"])) || JSON.stringify(seen);
  });
  await step(() => Game.nextRace());
  await p.waitForFunction(() => state.phase === "podium", null, { timeout: 30000 }).catch(() => {});
  results.customPodiumAndCareer = await step(() => {
    const kicker = document.getElementById("podium-kicker").textContent;
    const h = Career.getDriver(window.__run.driver).history.filter((e) => e.cupRunId === window.__run.id);
    const races = h.filter((e) => e.type === "race" && e.cupId === "customCup").length;
    const cups = h.filter((e) => e.type === "cup" && e.cupId === "customCup").length;
    const strip = document.getElementById("podium-career").textContent;
    return (state.phase === "podium" && kicker === "Custom Cup complete" && races === 4 && cups === 1 && /Cup/.test(strip)) || JSON.stringify({ phase: state.phase, kicker, races, cups, strip });
  });
  await step(() => Game.backToPitLane());

  // ---- Single race, random: shown, rerolled, raced with the pit lane's settings ----
  await click('#race-pills [data-race="single"]');
  await click('[data-single="random"]');
  const single = await shownCircuits();
  await click('[data-action="reroll"]');
  const single2 = await shownCircuits();
  results.singleRandomRerolls = (Array.isArray(single) && single.length === 1 && single2.length === 1 && single[0] !== single2[0]) || JSON.stringify({ single, single2 });
  await step(() => { Game.selectDifficulty(2); Game.selectWeatherMode("wet"); });
  await click("#start-cup");
  results.singleRandomRaced = await step((shown) => {
    window.__run = { id: state.cupRunId, driver: humanEntry(0).driver.id };
    const ok = getActiveCup().id === "singleRace" && getActiveCup().tracks.length === 1 && state.track.id === shown[0]
      && getDifficulty().id === "legend" && state.weather === "wet";
    return ok || JSON.stringify({ id: getActiveCup().id, track: state.track.id, shown, diff: getDifficulty().id, weather: state.weather });
  }, single2);
  results.singleRaceToPodium = await step(() => {
    const phase = window.__runRace(true);
    const kicker = document.getElementById("results-kicker").textContent;
    const next = document.getElementById("results-next").textContent;
    return (phase === "results" && /Single race/.test(kicker) && /Show podium/.test(next)) || JSON.stringify({ phase, kicker, next });
  });
  await step(() => Game.nextRace());
  await p.waitForFunction(() => state.phase === "podium", null, { timeout: 30000 }).catch(() => {});
  results.singlePodiumNoCupBonus = await step(() => {
    const kicker = document.getElementById("podium-kicker").textContent;
    const h = Career.getDriver(window.__run.driver).history.filter((e) => e.cupRunId === window.__run.id);
    const races = h.filter((e) => e.type === "race" && e.cupId === "singleRace").length;
    const cups = h.filter((e) => e.type === "cup").length;
    // The title is the place the player finished the race in (out of the
    // points here, where everyone level on nothing must not be put in name order).
    const at = (h.find((e) => e.type === "race") || {}).position;
    const title = document.getElementById("podium-title").textContent;
    const want = at === 1 ? "Race winner" : `You finished ${formatOrdinal(at)}`;
    // The career strip: the race's own lines, no cup bonus.
    const strip = document.getElementById("podium-career").textContent;
    const ok = state.phase === "podium" && kicker === `Single race · ${getActiveCup().tracks[0].name}` && races === 1 && cups === 0
      && at > 10 && title === want && /career points/.test(strip) && !/bonus/i.test(strip);
    return ok || JSON.stringify({ phase: state.phase, kicker, races, cups, at, title, want, strip });
  });
  await step(() => { Game.backToPitLane(); Game.selectDifficulty(1); Game.selectWeatherMode("dry"); });

  // ---- Single race, chosen: the picker chooses one and closes ----
  await click('[data-single="chosen"]');
  const pickerForOne = await step(() => !document.getElementById("circuits-screen").classList.contains("hidden"));
  await fill("#circuit-search", "canada");
  await click('#circuit-cards [data-pick="montreal"]');
  results.singleChosen = await step((pickerForOne) => {
    const closed = document.getElementById("circuits-screen").classList.contains("hidden");
    const shown = [...document.querySelectorAll("#cup-circuits li")].map((li) => li.dataset.circuit);
    return (pickerForOne && closed && JSON.stringify(shown) === JSON.stringify(["montreal"])) || JSON.stringify({ pickerForOne, closed, shown });
  }, pickerForOne);
  await step(() => Game.selectGridMode("qualifying"));
  await click("#start-cup");
  results.singleChosenRaced = await step(() => {
    const ok = state.track.id === "montreal" && /qualifying/i.test(state.phase) && getActiveCup().id === "singleRace";
    const r = { track: state.track.id, phase: state.phase };
    Game.backToPitLane();
    Game.selectGridMode("back");
    return ok || JSON.stringify(r);
  });

  // ---- Two players in a custom cup: both drive it, both careers credited ----
  await click('#race-pills [data-race="custom"]');
  await click('#players-pills [data-players="2"]');
  await click("#start-cup");
  results.twoPlayersCustom = await step(() => {
    if (state.cupPlayers !== 2 || state.humanIds.length !== 2 || getActiveCup().id !== "customCup") return JSON.stringify({ players: state.cupPlayers, humans: state.humanIds.length, cup: getActiveCup().id });
    const runs = [[humanEntry(0).driver.id, state.cupRunId], [humanEntry(1).driver.id, state.secondCupRunId]];
    for (let i = 0; i < 4; i += 1) {
      const phase = window.__runRace();
      if (phase !== "results") return `race ${i + 1} ended in ${phase}`;
      if (i < 3) Game.nextRace();
    }
    const counts = runs.map(([driver, run]) => {
      const h = Career.getDriver(driver).history.filter((e) => e.cupRunId === run);
      return [h.filter((e) => e.type === "race" && e.cupId === "customCup").length, h.filter((e) => e.type === "cup" && e.cupId === "customCup").length];
    });
    return JSON.stringify(counts) === "[[4,1],[4,1]]" || JSON.stringify(counts);
  });
  await step(() => { Game.backToPitLane(); Game.selectPlayers(1); });

  // ---- The site's links pick the choice; the season is still one player's ----
  await open("race=random");
  results.linkPicksChoice = await step(() => (Game.getPitLaneState().race.mode === "random" && !/race=/.test(location.search)) || JSON.stringify({ mode: Game.getPitLaneState().race.mode, search: location.search }));
  results.seasonStillOnePlayer = await step(() => {
    Game.selectPlayers(2);
    Game.selectRaceMode("season");
    const two = document.querySelector('#players-pills [data-players="2"]');
    const ok = two.disabled && document.getElementById("second-driver").hidden;
    Game.selectRaceMode("cup");
    Game.selectPlayers(1);
    return ok || "two players offered in the season";
  });

  await step((keys) => { keys.forEach((k) => localStorage.removeItem(k)); }, KEYS);
  await context.close();
  return { results, errors };
}
