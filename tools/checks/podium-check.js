// Browser check: the 3D podium ceremony (docs/superpowers/specs/2026-09-30-podium-design.md).
// A cup is run with every race's finishing order shuffled and scored by the
// game's own finalizeRace, then the podium is shown. Run with the Playwright
// MCP tool browser_run_code_unsafe, filename: tools/checks/podium-check.js,
// dev server on http://localhost:8765. Expected: every value in `results`
// true, errors []. Returns { results, errors } (the shared convention).
async (page) => {
  const errors = [];
  const results = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const browser = page.context().browser();
  const context = await browser.newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const sizeTo = async (width, height) => {
    await p.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } }).catch(() => {});
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(400);
  };
  await sizeTo(1600, 900);

  // A cup, its races finished in a shuffled order each time and scored by the
  // game; the podium is reached through the last results screen's Next.
  const runCup = () => p.evaluate(() => {
    let seed = 20261001;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    state.gridMode = "back";
    startCup();
    for (let race = 0; race < 4; race += 1) {
      const order = [...state.racers].map((r) => ({ r, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.r);
      order.forEach((r, i) => {
        r.finished = true;
        r.finishPosition = i + 1;
        r.finishTime = 300000 + i * 1700;
        r.bestLapTime = 61000 + i * 250;
      });
      state.phase = "race";
      state.resultsQueued = true;
      finalizeRace();
      nextRace();
    }
    const screen = document.getElementById("podium-screen");
    return {
      phase: state.phase,
      top: state.cupEntries.slice(0, 3).map((e) => e.driver.id),
      // Right away, before the ceremony can draw: the 2D steps.
      stepsWhileLoading: !screen.classList.contains("hidden") && !screen.classList.contains("is-3d")
        && document.querySelectorAll("#podium-scene .podium-step").length === 3,
    };
  });

  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && (Render3D.ready || Render3D.failed), null, { timeout: 60000 });
  const cup = await runCup();
  results.podiumReached = cup.phase === "podium";
  results.stepsWhileLoading = cup.stepsWhileLoading;
  const drawn = await p.waitForFunction(() => Render3D.podium && Render3D.podium.inspect().drawing, null, { timeout: 30000 }).then(() => true, () => false);
  results.ceremonyDraws = drawn || await p.evaluate(() => JSON.stringify({ phase: state.phase, view: Render3D.ready, podium: Render3D.podium && Render3D.podium.inspect() }).slice(0, 400));
  // The state of the first frame at or after t, read in the same call that
  // finds it (a second round trip could land past the next beat). Every state
  // read is also held to the timeline: each driver's pose, step forward and
  // props are what ceremony.js says for that frame's time.
  const timeline = [];
  const at = async (t) => {
    const s = await (await p.waitForFunction((tt) => {
      const st = Render3D.podium.inspect();
      if (!(st.t >= tt)) return false;
      st.p1ArmsAt = Ceremony.BEATS.arms[1];
      st.want = st.drivers.map((d) => ({
        pose: Ceremony.poseAt(d.place, st.t),
        z: Ceremony.stepFor(d.place).standZ + Ceremony.STEP_FORWARD * Ceremony.forwardAt(d.place, st.t),
        trophy: Ceremony.trophyShown(d.place, st.t),
        bottle: Ceremony.bottleShown(d.place, st.t),
      }));
      return st;
    }, t, { timeout: 40000, polling: "raf" })).jsonValue();
    timeline.push(s);
    return s;
  };
  if (drawn) {
    const first = await at(0.3);
    results.noShaderCompileOnFirstFrame = first.newProgramsOnFirstFrame === 0 || `new programs: ${first.newProgramsOnFirstFrame}`;
    const ids = first.drivers.map((d) => d.driverId);
    results.realTopThreeInOrder = JSON.stringify(ids) === JSON.stringify(cup.top) || `${ids} vs ${cup.top}`;
    const [d1, d2, d3] = first.drivers;
    results.p1MiddleAndHighest = d1.place === 1 && d2.x < d1.x && d1.x < d3.x && d1.y > d2.y && d2.y > d3.y;
    // Dressed: the team's suit colour (r3d/driver.js's own rule) and, with a
    // helmet on, the driver's own painted helmet; with a face, each their own.
    const dress = await p.evaluate(async (list) => {
      const { suitColours } = await import("/r3d/driver.js");
      return list.map((d) => {
        const driver = DRIVERS.find((x) => x.id === d.driverId);
        const helmet = Render3D.helmetInfo(d.driverId);
        return { want: suitColours(getTeamForDriver(driver)).suit.toLowerCase(), helmetId: helmet ? helmet.textureId : null };
      });
    }, first.drivers);
    results.suitsInTeamColours = first.drivers.every((d, i) => d.suit === dress[i].want) || JSON.stringify(first.drivers.map((d, i) => [d.suit, dress[i].want]));
    // Each driver wears one or the other, never neither: all three counted.
    const helmeted = first.drivers.filter((d) => (d.headwear || "helmet") === "helmet" && !d.face);
    const faces = first.drivers.filter((d) => d.face).map((d) => JSON.stringify(d.face));
    results.everyoneDressedAbove = helmeted.length + faces.length === 3 || `${helmeted.length} helmets, ${faces.length} faces`;
    results.ownHelmets = helmeted.every((d) => d.helmetTexture && d.helmetTexture === dress[first.drivers.indexOf(d)].helmetId);
    results.ownFaces = new Set(faces).size === faces.length;
    results.sweepStands = first.beat === "sweep" && first.drivers.every((d) => d.pose === "stand" && !d.props.trophy);
    results.noConfettiYet = !first.confetti.visible && first.confetti.airborne === 0 && first.spray.emitted === 0;

    const arms = await at(3.6);
    const pose = (s) => s.drivers.map((d) => d.pose).join(",");
    results.armsUpInTurn = (arms.t < arms.p1ArmsAt ? pose(arms) === "stand,arms_up,arms_up" : pose(arms) === "arms_up,arms_up,arms_up") || `${pose(arms)} at ${arms.t}`;
    results.p3SteppedForward = arms.drivers[2].z > first.drivers[2].z + 0.15;

    const trophy = await at(6.4);
    results.trophyBeat = pose(trophy) === "trophy,wave,wave" || pose(trophy);
    results.trophyOnlyWithP1 = trophy.drivers[0].props.trophy === true && !trophy.drivers[1].props.trophy && !trophy.drivers[2].props.trophy
      && [first, arms].every((s) => s.drivers.every((d) => !d.props.trophy));
    results.confettiBurst = trophy.confetti.visible && trophy.confetti.airborne > trophy.confetti.count * 0.5
      && trophy.confetti.count === { high: 600, medium: 300, low: 120 }[trophy.tier];
    const later = await at(7.6);
    results.confettiFalls = later.confetti.meanY < trophy.confetti.meanY - 0.4 && later.confetti.meanVy < -0.3 || `${trophy.confetti.meanY} -> ${later.confetti.meanY}`;
    results.noSprayBeforeNine = later.spray.emitted === 0;

    // Just into the spray: the poses crossfade, so the trophy is still up for
    // the first moment and the bottles come in as the hands meet.
    const swap = await at(9);
    results.propsSwapMidFade = (swap.drivers[0].props.trophy === swap.want[0].trophy && swap.drivers.every((d, i) => d.props.bottle === swap.want[i].bottle)) || JSON.stringify({ t: swap.t, props: swap.drivers.map((d) => d.props) });
    const spray = await at(10.6);
    results.allSpray = pose(spray) === "spray,spray,spray" && spray.drivers.every((d) => d.props.bottle && !d.props.trophy) || pose(spray);
    const sprayWanted = spray.tier !== "low";
    results.sprayFlies = sprayWanted ? spray.spray.live > 50 && spray.spray.maxY > 1 : spray.spray.pool === 0;
    // The camera keeps moving (the orbit) and the confetti keeps coming down.
    const shots = await p.evaluate(async () => {
      const cam = () => Render3D.podium.inspect();
      const a = cam();
      await new Promise((r) => setTimeout(r, 1500));
      return [a, cam()];
    });
    results.stillRunning = shots[1].t > shots[0].t + 1 && shots[1].confetti.airborne > 0;

    results.followsTimeline = timeline.every((st) => st.drivers.every((d, i) => d.pose === st.want[i].pose && Math.abs(d.z - st.want[i].z) < 1e-6
      && Boolean(d.props.trophy) === st.want[i].trophy && Boolean(d.props.bottle) === st.want[i].bottle))
      || JSON.stringify(timeline.map((st) => [st.t, st.drivers.map((d) => [d.pose, d.props])])).slice(0, 400);

    // The plates: one per driver, in the drivers' order on screen, on screen.
    const plates = () => p.evaluate(() => {
      const screen = document.getElementById("podium-screen");
      const box = (el) => el.getBoundingClientRect();
      const ps = [...document.querySelectorAll(".podium-plate")].map((el) => ({ place: Number(el.dataset.place), text: el.innerText, r: box(el).toJSON(), o: getComputedStyle(el).opacity }));
      const canvas = box(document.getElementById("game3d"));
      return { is3d: screen.classList.contains("is-3d"), plates: ps, w: innerWidth, h: innerHeight, canvas: [canvas.width, canvas.height] };
    });
    const onScreen = (s) => s.plates.length === 3 && s.plates.every((x) => x.r.left >= 0 && x.r.top >= 0 && x.r.right <= s.w && x.r.bottom <= s.h && x.o === "1");
    const noOverlap = (s) => s.plates.every((a, i) => s.plates.every((b, j) => i === j || a.r.right <= b.r.left || b.r.right <= a.r.left || a.r.bottom <= b.r.top || b.r.bottom <= a.r.top));
    const big = await plates();
    results.platesOver3d = big.is3d;
    results.platesOnScreen = onScreen(big) && noOverlap(big);
    const byX = [...big.plates].sort((a, b) => a.r.left - b.r.left).map((x) => x.place).join("");
    results.platesUnderDrivers = byX === "213" || byX;
    const names = await p.evaluate(() => state.cupEntries.slice(0, 3).map((e) => [e.driver.name, e.kart.name, String(e.points)]));
    results.platesSayWho = names.every((n, i) => { const pl = big.plates.find((x) => x.place === i + 1); return pl && n.every((bit) => pl.text.toLowerCase().includes(bit.toLowerCase())); });
    results.fillsWindow = big.canvas[0] === big.w && big.canvas[1] === big.h;
    // The page's title (kicker, title and career strip, as drawn) and the
    // wall's own title never touch: at every moment of the ceremony (the
    // camera is a function of time), at each window size; and the live frame
    // agrees with where it says the wall's title is.
    const titleClear = () => p.evaluate(() => {
      const boxes = ["podium-kicker", "podium-title", "podium-career"].map((id) => document.getElementById(id))
        .filter((el) => el && !el.classList.contains("hidden") && el.getClientRects().length)
        .map((el) => {
          if (el.id === "podium-career") return el.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect();
        });
      const touching = [];
      for (let t = 0; t < 40; t += 0.05) {
        const r = Render3D.podium.titleAt(t);
        if (boxes.some((b) => r.left < b.right + 8 && r.right > b.left - 8 && r.top < b.bottom + 8 && r.bottom > b.top - 8)) touching.push(Number(t.toFixed(2)));
      }
      const live = Render3D.podium.inspect();
      const said = Render3D.podium.titleAt(live.t);
      const agrees = live.title && ["left", "top", "right", "bottom"].every((k) => Math.abs(live.title[k] - said[k]) < 4);
      return (touching.length === 0 && agrees) || JSON.stringify({ touching: touching.length ? [touching[0], touching[touching.length - 1], touching.length] : [], agrees, live: live.title, said });
    });
    results.titlesApart1600x900 = await titleClear();
    for (const [w, h] of [[700, 900], [1000, 600], [380, 800], [1600, 640], [1280, 1024]]) {
      await sizeTo(w, h);
      await p.waitForTimeout(700);
      const s = await plates();
      results[`plates${w}x${h}`] = (onScreen(s) && noOverlap(s) && s.canvas[0] === s.w && s.canvas[1] === s.h) || JSON.stringify(s.plates.map((x) => x.r)).slice(0, 300);
      results[`titlesApart${w}x${h}`] = await titleClear();
    }
    await sizeTo(1600, 900);

    // The race's own effects are released while the ceremony has the screen.
    results.racePostfxReleased = (await p.evaluate(() => Render3D.podium.inspect().racePostfx)) === null;

    // Leaving stops it and frees it.
    const during = await p.evaluate(() => Render3D.podium.inspect().memory);
    await p.click("#podium-screen [data-action='pitlane']");
    await p.waitForTimeout(800);
    const after = await p.evaluate(() => ({ ...Render3D.podium.inspect(), phase: state.phase }));
    results.leavingStops = after.phase === "garage" && after.active === false && after.lastDisposed === true;
    results.leavingFrees = after.memory.geometries < during.geometries && after.memory.textures < during.textures || `${JSON.stringify(during)} -> ${JSON.stringify(after.memory)}`;
    // And frees all of it: a whole ceremony (built, drawn a while, ended) from
    // the pit lane leaves the GPU holding no more than before it.
    results.noLeakAfterCycle = await p.evaluate(async (ids) => {
      const frames = (n) => new Promise((r) => { const go = () => (n-- > 0 ? requestAnimationFrame(go) : r()); go(); });
      await frames(30);
      const mem = () => ({ ...Render3D.podium.inspect().memory });
      const before = mem();
      const top = ids.map((driverId, i) => ({ place: i + 1, driverId, points: 100 - i * 20 }));
      Render3D.podium.begin({ cup: { id: "trophyCup", name: "Trophy Cup" }, podium: top });
      const t0 = performance.now();
      while (performance.now() - t0 < 20000) {
        const f = Render3D.podium.frame(performance.now());
        if (f.drawing && f.t > 10.5) break;
        await frames(1);
      }
      const drew = Render3D.podium.inspect().t;
      Render3D.podium.end();
      await frames(30);
      const after = mem();
      return (drew > 10.5 && after.textures <= before.textures && after.geometries <= before.geometries) || JSON.stringify({ drew, before, after });
    }, cup.top);
    results.racePostfxBack = (await p.evaluate(() => Render3D.podium.inspect().racePostfx)) !== null || "still released";

    // Low: fewer pieces and no spray.
    const before = await p.evaluate(() => Render3D.graphics().choice);
    await p.evaluate(() => Render3D.setGraphics("low"));
    await runCup();
    const low = await at(10.4).catch(() => null);
    results.lowTier = Boolean(low) && low.tier === "low" && low.confetti.count === 120 && low.spray.pool === 0 && low.spray.live === 0;
    await p.evaluate((c) => { Render3D.setGraphics(c); resetToGarage(); }, before);

    // Reduced motion asked for: the camera holds its view, nobody steps
    // forward, the confetti lies where it fell, no spray, the plates stay up.
    await p.emulateMedia({ reducedMotion: "reduce" });
    await runCup();
    const calm = [await at(3), await at(7)];
    const platesUp = await p.evaluate(() => document.getElementById("podium-screen").classList.contains("plates-in"));
    calm.push(await at(10.4));
    results.reducedMotion = (calm.every((st) => JSON.stringify(st.camera) === JSON.stringify(calm[0].camera)
      && st.drivers.every((d, i) => Math.abs(d.z - calm[0].drivers[i].z) < 1e-6))
      && calm[1].confetti.airborne === 0 && calm[1].confetti.landed === calm[1].confetti.count
      && calm[2].spray.emitted === 0 && platesUp)
      || JSON.stringify({ platesUp, cams: calm.map((st) => st.camera), confetti: calm[1].confetti, spray: calm[2].spray });
    await p.emulateMedia({ reducedMotion: null });
    await p.evaluate(() => resetToGarage());
  }

  // Without 3D: the 2D steps, as before.
  const flat = await context.newPage();
  flat.on("pageerror", (e) => errors.push(String(e)));
  await flat.route("**/render3d.js*", (route) => route.abort());
  await flat.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await flat.waitForFunction(() => window.Render3D && Render3D.failed, null, { timeout: 30000 });
  const flatCup = await flat.evaluate(() => {
    state.gridMode = "back";
    startCup();
    for (let race = 0; race < 4; race += 1) {
      [...state.racers].forEach((r, i) => { r.finished = true; r.finishPosition = i + 1; r.finishTime = 300000 + i * 1000; });
      state.phase = "race";
      state.resultsQueued = true;
      finalizeRace();
      nextRace();
    }
    return state.cupEntries.slice(0, 3).map((e) => e.driver.name);
  });
  await flat.waitForTimeout(600);
  results.fallback2d = await flat.evaluate((top) => {
    const screen = document.getElementById("podium-screen");
    const steps = [...document.querySelectorAll("#podium-scene .podium-step")];
    return !screen.classList.contains("is-3d") && steps.length === 3 && steps.every((s) => s.getBoundingClientRect().height > 50)
      && [1, 0, 2].every((s, i) => steps[s].innerText.toLowerCase().includes(top[i].toLowerCase()));
  }, flatCup);
  await context.close();
  return { results, errors };
}
