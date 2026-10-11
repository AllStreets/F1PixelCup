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
  // game (one player or two); the podium is reached through the last results
  // screen's Show podium, pressed as a player would: at once ("instant": a
  // click in the same moment the results appear, so the ceremony can't be
  // ready yet), or clicked or Enter after `hold` ms on the results. From the
  // press on (a listener notes it), every frame as painted is sampled: the 2D
  // steps never show and nothing is blank. Each frame is either the results
  // with the race still drawn behind them, or the podium screen over the
  // ceremony drawing that frame.
  // winner: that driver wins every race of the cup (so the cup).
  const runCup = async ({ via = "click", hold = 0, players = 1, escape = false, winner = null } = {}) => {
    const before = await p.evaluate(({ instant, players, winner }) => {
      window.__podiumFrames = [];
      window.__pressed = false;
      const press = (e) => {
        if (e.type === "keydown" && e.key !== "Enter") return;
        if (e.target && e.target.closest && e.target.closest("#results-next")) window.__pressed = true;
      };
      document.addEventListener("click", press, true);
      document.addEventListener("keydown", press, true);
      const visible = (id) => { const el = document.getElementById(id); return Boolean(el) && !el.classList.contains("hidden") && el.getClientRects().length > 0; };
      const seen = () => {
        const screen = document.getElementById("podium-screen");
        // (In 3D they stay in the page for screen readers, clipped to nothing.)
        const box = document.getElementById("podium-scene").getBoundingClientRect();
        const steps = box.width > 2 && box.height > 2 && document.querySelectorAll("#podium-scene .podium-step").length > 0;
        const st = Render3D.podium.inspect();
        return {
          results: visible("results-screen"),
          raceWorld: st.raceWorld,
          podium: visible("podium-screen"),
          is3d: screen.classList.contains("is-3d"),
          steps: visible("podium-screen") && steps,
          drawing: Boolean(st.drawing && st.started),
          blank: st.blank || 0,
          t: st.t,
          busy: document.getElementById("results-next").getAttribute("aria-busy") === "true",
        };
      };
      const t0 = performance.now();
      let firstDraw = 0;
      const tick = () => {
        // After every animation-frame callback of this frame (the game's
        // update included): what this frame paints.
        setTimeout(() => {
          if (window.__pressed) {
            const f = seen();
            window.__podiumFrames.push(f);
            if (f.drawing && !firstDraw) firstDraw = performance.now();
          }
          if (performance.now() - t0 < 40000 && (!firstDraw || performance.now() - firstDraw < 1000)) requestAnimationFrame(tick);
          else {
            document.removeEventListener("click", press, true);
            document.removeEventListener("keydown", press, true);
          }
        }, 0);
      };
      requestAnimationFrame(tick);

      let seed = 20261001;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      Game.selectPlayers(players);
      state.gridMode = "back";
      startCup();
      for (let race = 0; race < 4; race += 1) {
        const order = [...state.racers].map((r) => ({ r, k: r.driver.id === winner ? -1 : rnd() })).sort((a, b) => a.k - b.k).map((x) => x.r);
        order.forEach((r, i) => {
          r.finished = true;
          r.finishPosition = i + 1;
          r.finishTime = 300000 + i * 1700;
          r.bestLapTime = 61000 + i * 250;
        });
        state.phase = "race";
        state.resultsQueued = true;
        finalizeRace();
        if (race < 3) nextRace();
      }
      if (instant) document.getElementById("results-next").click();
      return { top: state.cupEntries.slice(0, 3).map((e) => e.driver.id), humans: state.humanIds.length };
    }, { instant: via === "instant", players, winner });
    if (escape) {
      // Esc while it readies: home to the pit lane, the ceremony let go, the
      // button itself again.
      const waiting = await p.evaluate(() => state.podiumWaiting);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      return p.evaluate((w) => {
        const b = document.getElementById("results-next");
        const pod = Render3D.podium.inspect();
        return (w && state.phase === "garage" && !state.podiumWaiting && pod.active === false
          && !b.hasAttribute("aria-disabled") && !b.hasAttribute("aria-busy") && !/Readying/.test(b.textContent)
          && !document.getElementById("results-replay").disabled
          && document.getElementById("podium-screen").classList.contains("hidden"))
          || JSON.stringify({ waiting: w, phase: state.phase, active: pod.active, button: b.outerHTML });
      }, waiting);
    }
    if (via === "hold") return before;
    if (via !== "instant") {
      await p.waitForTimeout(hold);
      if (via === "click") await p.click("#results-next");
      else {
        await p.focus("#results-next");
        await p.keyboard.press("Enter");
      }
    }
    await p.waitForFunction(() => state.phase === "podium", null, { timeout: 30000 });
    await p.waitForFunction(() => {
      const f = window.__podiumFrames;
      return f.length && f[f.length - 1].drawing && f.filter((x) => x.drawing).length > 30;
    }, null, { timeout: 30000 }).catch(() => {});
    const frames = await p.evaluate(() => window.__podiumFrames);
    // (A cup run here without a frame drawn has no race world until the game
    // builds one; once it is there behind the results it must stay.)
    let hadWorld = false;
    const bad = frames.map((f, i) => [i, f]).filter(([, f]) => {
      const lostWorld = !f.podium && f.results && hadWorld && !f.raceWorld;
      if (!f.podium && f.raceWorld) hadWorld = true;
      return f.steps
        || (f.podium && !(f.is3d && f.drawing && f.blank === 0))
        || (!f.podium && !f.results)
        || lostWorld
        || (f.podium && f.raceWorld);
    });
    const first = frames.find((f) => f.drawing);
    return {
      ...before,
      phase: await p.evaluate(() => state.phase),
      straightIn: (frames.length > 20 && bad.length === 0 && Boolean(first) && first.t < 0.25)
        || `${frames.length} frames, first drawn at t ${first ? first.t.toFixed(2) : "never"}; bad: ${bad.slice(0, 4).map(([i, f]) => `#${i} ${["results", "raceWorld", "podium", "is3d", "steps", "drawing"].filter((k) => f[k]).join("+")} blank ${f.blank}`).join("; ")}`,
      waited: frames.filter((f) => f.results).length,
      busyShown: frames.some((f) => f.busy),
    };
  };

  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.waitForFunction(() => window.Render3D && (Render3D.ready || Render3D.failed), null, { timeout: 60000 });
  // The sound off for the first part (what is seen): with nothing to stand
  // for, the ceremony keeps its short pause where the anthem goes. The sound
  // has its own part below.
  await p.evaluate(() => Game.setSound(false));
  // Pressed at once: the ceremony can't be ready yet, so the results wait
  // (the button saying so, the race still behind them) and then it opens
  // straight onto the scene's first frame.
  const cup = await runCup({ via: "instant" });
  results.podiumReached = cup.phase === "podium";
  // With the sound off: nothing planned, nothing played.
  results.soundOffIsSilent = await p.evaluate(() => {
    const s = Game.podiumSound();
    return (s && s.on === false && s.cues.length === 0 && s.log.length === 0 && s.started === false) || JSON.stringify(s).slice(0, 300);
  });
  results.pressStraightIntoCeremony = cup.straightIn;
  results.waitShownOnButton = (cup.waited > 0 && cup.busyShown) || `${cup.waited} frames waiting, busy ${cup.busyShown}`;
  results.buttonBackAfter = await p.evaluate(() => {
    const b = document.getElementById("results-next");
    return (!b.hasAttribute("aria-disabled") && !b.hasAttribute("aria-busy") && !document.getElementById("results-replay").disabled && !/Readying/.test(b.textContent)) || b.outerHTML;
  });
  const drawn = await p.waitForFunction(() => Render3D.podium && Render3D.podium.inspect().drawing, null, { timeout: 30000 }).then(() => true, () => false);
  results.ceremonyDraws = drawn || await p.evaluate(() => JSON.stringify({ phase: state.phase, view: Render3D.ready, podium: Render3D.podium && Render3D.podium.inspect() }).slice(0, 400));
  // The state of the first frame at or after t, read in the same call that
  // finds it (a second round trip could land past the next beat). Every state
  // read is also held to the timeline: each driver's pose, step forward and
  // props are what ceremony.js says for that frame's time.
  const timeline = [];
  // when: seconds in, or [beat, seconds after it] (the beats move with the
  // anthem's length: ceremony.js, withAnthem).
  const at = async (when) => {
    const s = await (await p.waitForFunction((w) => {
      const st = Render3D.podium.inspect();
      if (!(st.t >= 0)) return false;
      const C = Ceremony.withAnthem(st.anthemSeconds);
      const tt = Array.isArray(w) ? (w[0] === "cork" ? C.corkAt(w[2]) : C.BEATS[w[0]]) + w[1] : w;
      if (!(st.t >= tt)) return false;
      st.beats = C.BEATS;
      st.corks = [1, 2, 3].map((place) => C.corkAt(place));
      st.p1ArmsAt = C.BEATS.arms[1];
      st.want = st.drivers.map((d) => ({
        pose: C.poseAt(d.place, st.t),
        z: C.stepFor(d.place).standZ + C.STEP_FORWARD * C.forwardAt(d.place, st.t),
        trophy: C.trophyShown(d.place, st.t),
        bottle: C.bottleShown(d.place, st.t),
      }));
      return st;
    }, when, { timeout: 90000, polling: "raf" })).jsonValue();
    timeline.push(s);
    return s;
  };
  if (drawn) {
    const first = await at(0.3);
    results.noShaderCompileOnFirstFrame = first.newProgramsOnFirstFrame === 0 || `new programs: ${first.newProgramsOnFirstFrame}`;
    // The suits' sheets of marks were uploaded behind the results screen too.
    results.suitSheetsUploadedAhead = first.suitSheetsUploadedAhead === true || String(first.suitSheetsUploadedAhead);
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

    // The anthem's place in the order: all three stand, no trophy, no confetti
    // (here the short pause the ceremony keeps with the sound off).
    const stand = await at(["anthem", 1.2]);
    results.standForTheAnthem = (stand.beat === "anthem" && pose(stand) === "stand,stand,stand" && Math.abs(stand.anthemSeconds - 3) < 1e-9
      && !stand.confetti.visible && stand.drivers.every((d) => !d.props.trophy && !d.props.bottle)
      && stand.beats.armsDown < stand.beats.anthem && stand.beats.anthemEnd <= stand.beats.present && stand.beats.present < stand.beats.trophy && stand.beats.trophy < stand.beats.spray)
      || `${stand.beat} ${pose(stand)} ${stand.anthemSeconds}`;

    // ---- The trophy presentation (docs/superpowers/specs/2026-10-12-trophy-presentation-design.md) ----
    // Before it: three trophies standing on the table (read off the scene:
    // each one's foot on its top, within its edges, clear of the others) in
    // three metals and three sizes, third's the smallest; the presenter
    // standing by, in the picture, touching neither table nor trophy.
    const T = stand.table;
    const secondStep = await p.evaluate(() => Ceremony.stepFor(2));
    const onTable = (tr) => Math.abs(tr.foot - T.height) < 1e-6 && Math.abs(tr.x - T.x) < T.width / 2 - 0.05 && Math.abs(tr.z - T.z) < T.length / 2 - 0.05;
    const byPlace = Object.fromEntries(stand.trophies.map((tr) => [tr.place, tr]));
    const who = stand.presenter;
    results.threeTrophiesOnTheTable = (stand.trophies.length === 3 && stand.trophies.every((tr) => onTable(tr) && tr.apart > 0.03 && tr.upright > 0.999)
      && [byPlace[3].metal, byPlace[2].metal, byPlace[1].metal].join() === "bronze,silver,gold"
      && byPlace[2].height > byPlace[3].height * 1.3 && byPlace[1].height > byPlace[2].height * 1.3
      && new Set(stand.trophies.map((tr) => tr.color)).size === 3
      // (Off the podium's end: beyond the second step's outer edge.)
      && T.x + T.width / 2 < secondStep.x - secondStep.width / 2 - 0.3
      && who.shown && who.body > 0.03 && who.arms > 0.01 && who.x - T.x > T.width / 2 + 0.1 && who.x - T.x < T.width / 2 + 0.5 && Boolean(stand.onScreen.presenter))
      || JSON.stringify({ trophies: stand.trophies.map((tr) => [tr.place, tr.metal, tr.height, tr.foot, tr.x, tr.z, tr.apart]), table: T, who: [who.shown, who.x, who.body, who.arms], onScreen: stand.onScreen });
    // The presenter is nobody on the grid, in formal wear (no helmet, and
    // none painted for them), with a face of their own.
    const grid = await p.evaluate(() => ({ ids: DRIVERS.map((d) => d.id), suits: TEAMS.map((t) => t.body.toLowerCase()) }));
    results.presenterIsNoDriver = (["man", "woman"].includes(who.kind) && !grid.ids.includes(who.looks.driverId) && /^presenter-/.test(who.looks.driverId)
      && who.looks.headwear === "none" && who.looks.helmetTexture === null && who.looks.marks && /suit/.test(who.looks.marks.formal || "") && !grid.suits.includes(who.looks.suit)
      && who.looks.face.shown.includes("hair") && Object.keys(who.looks.face.keys).length > 5)
      || JSON.stringify({ kind: who.kind, id: who.looks.driverId, marks: who.looks.marks, suit: who.looks.suit, helmet: who.looks.helmetTexture });
    // Every frame of it, measured in the scene (not read back from the
    // timeline): the worst of each thing over the whole presentation.
    const scene = await p.evaluate(() => new Promise((done) => {
      const C = Ceremony.withAnthem(Render3D.podium.inspect().anthemSeconds);
      const H = Object.fromEntries(C.HANDOVERS.map((h) => [h.place, h]));
      const worst = {};
      const note = (k, v, t) => { if (Number.isFinite(v) && (!(k in worst) || v < worst[k][0])) worst[k] = [v, +t.toFixed(2)]; };
      const bad = [];
      const first = {};
      let prev = null;
      let from = null;
      let gap = 0;
      let moved = null;
      const tick = () => {
        const st = Render3D.podium.inspect();
        const t = st.t;
        const T = st.table;
        // (How much of it was seen: its span, and the longest stretch unseen.)
        if (from === null) from = t;
        if (prev) gap = Math.max(gap, t - prev.t);
        // The presenter: clear of every trophy, body and forearms; both
        // hands on the one they carry (once they have hold of it).
        note("presenterBody", st.presenter.body, t);
        note("presenterArms", st.presenter.arms, t);
        if (st.presenter.hands && st.presenter.hands.weight > 0.99) note("presenterHands", -st.presenter.hands.gap, t);
        if (prev && moved === null && Math.hypot(st.presenter.x - prev.presenter.x, st.presenter.z - prev.presenter.z) > 1e-4) moved = t;
        if (prev && t > prev.t) note("presenterPace", -Math.hypot(st.presenter.x - prev.presenter.x, st.presenter.z - prev.presenter.z) / (t - prev.t), t);
        st.trophies.forEach((tr) => {
          const h = H[tr.place];
          const over = Math.abs(tr.x - T.x) < T.width / 2 + tr.radius && Math.abs(tr.z - T.z) < T.length / 2 + tr.radius;
          const stands = over && Math.abs(tr.foot - T.height) < 1e-6;
          // Never through the table's top, and never through another trophy.
          if (over && tr.foot < T.height - 1e-6) bad.push(`trophy ${tr.place} through the table at ${t.toFixed(2)}`);
          note("trophiesApart", tr.apart, t);
          // Never in mid-air: standing on the table, or in the presenter's
          // two hands, or a driver's hand round its stem.
          const inHands = st.presenter.hands && st.presenter.hands.place === tr.place && st.presenter.hands.gap < 0.03;
          const held = Math.min(tr.grip.R, tr.grip.L) < 0.1;
          if (!stands && !inHands && !held) bad.push(`trophy ${tr.place} in nobody's hands at ${t.toFixed(2)}`);
          if (held && !(tr.place in first)) first[tr.place] = t;
          if (!stands) {
            // In hand: clear of its driver's body and forearms; and while
            // two people have hold of it, their hands clear of each other.
            note(`body${tr.place}`, tr.body, t);
            note(`forearms${tr.place}`, Math.min(tr.arms.R, tr.arms.L), t);
            if (tr.handsApart !== null && t >= h.contact) note(`handsApart${tr.place}`, tr.handsApart, t);
          }
          // The hands, where they are put on a stem another holds: the
          // driver's right as it is given, the left as it joins the right,
          // the left once it has it.
          if (t >= h.contact && t <= h.release) note(`take${tr.place}`, -st.hands.take[tr.place], t);
          const pass = C.trophyAt(tr.place, t).pass;
          if (pass >= C.PASS.joined && pass < C.PASS.given) note(`join${tr.place}`, -st.hands.join[tr.place], t);
          if (pass >= C.PASS.given) note(`hold${tr.place}`, -st.hands.hold[tr.place], t);
        });
        if (st.drivers.some((d) => d.props.trophy)) bad.push(`a model trophy shown at ${t.toFixed(2)}`);
        prev = st;
        if (t < C.BEATS.trophy + 0.6) requestAnimationFrame(tick);
        else done({ from, to: t, gap, bad: bad.slice(0, 5), worst, first, moved, present: C.BEATS.present, trophy: C.BEATS.trophy, pace: C.WALK_SPEED });
      };
      requestAnimationFrame(tick);
    }));
    const w = (k) => (scene.worst[k] ? scene.worst[k][0] : NaN);
    const order = Object.entries(scene.first).sort((x, y) => x[1] - y[1]).map(([place]) => place).join();
    // Third, second, the winner: each on the table, in the presenter's hands
    // or a driver's, all the way; never through the table or each other.
    // (All of it seen: from before it starts to the winner's lift, never a tenth of a second unseen.)
    const seen = scene.from < scene.present && scene.to > scene.trophy && scene.gap < 0.1;
    results.presentationInOrderNeverInMidAir = (seen && scene.bad.length === 0 && order === "3,2,1" && w("trophiesApart") > 0)
      || JSON.stringify({ from: scene.from, to: scene.to, gap: scene.gap, bad: scene.bad, order, apart: scene.worst.trophiesApart });
    // At a walking pace (measured from the presenter's own position, frame
    // to frame), and the winner has theirs 17 to 22 s after the presenter's
    // first step.
    const took = scene.first[1] - scene.moved;
    results.presentationAtAWalkingPace = (-w("presenterPace") <= scene.pace * 1.1 && -w("presenterPace") > 1.2 && took >= 17 && took <= 22 && scene.moved > scene.present)
      || `pace ${-w("presenterPace")}, took ${took}, moved ${scene.moved}, present ${scene.present}`;
    // Hands on the trophies: the presenter's two within 3 cm of its foot all
    // the while it is carried and held up; each driver's right within 3 cm
    // of the stem as it is given, the left as it joins and then holds it.
    // (The winner's own pass to the left hand comes with the lift: below.)
    const short = (keys, from) => keys.filter((k) => from[k]).map((k) => `${k} ${from[k][0].toFixed(3)}@${from[k][1]}`).join(" ");
    const hands = ["presenterHands", "take1", ...[3, 2].flatMap((place) => [`take${place}`, `join${place}`, `hold${place}`])];
    results.handsMeetTheTrophies = hands.every((k) => -w(k) < 0.03) || short(hands, scene.worst);
    // And nothing passes through a trophy: no forearm through a cup, no
    // trophy into a chest, a waist or a head, the presenter's or a driver's;
    // and where two people hold one, their hands do not meet.
    const clear = ["presenterBody", "presenterArms", ...[3, 2, 1].flatMap((place) => [`body${place}`, `forearms${place}`, `handsApart${place}`])];
    results.nothingThroughATrophy = clear.every((k) => w(k) > 0) || short(clear, scene.worst);

    const trophy = await at(["trophy", 1.4]);
    results.trophyBeat = pose(trophy) === "trophy,wave,wave" || pose(trophy);
    // The winner's lift: the gold one in the right hand, up over the head; the
    // other two hold theirs in the left; the presenter is leaving.
    const gold = trophy.trophies.find((tr) => tr.place === 1);
    results.winnerLiftsTheGold = (gold.metal === "gold" && gold.grip.R < 0.06 && gold.grip.L > 0.3 && gold.y > trophy.drivers[0].y + 1.75 && gold.upright > 0.6 && gold.arms.R > 0 && gold.body > 0
      && trophy.trophies.filter((tr) => tr.place !== 1).every((tr) => tr.grip.L < 0.1 && tr.grip.R > 0.15 && tr.body > 0 && tr.upright > 0.99))
      || JSON.stringify(trophy.trophies.map((tr) => [tr.place, tr.y, tr.grip, tr.body, tr.upright, tr.arms]));
    results.confettiBurst = trophy.confetti.visible && trophy.confetti.airborne > trophy.confetti.count * 0.5
      && trophy.confetti.count === { high: 600, medium: 300, low: 120 }[trophy.tier];
    const later = await at(["trophy", 2.6]);
    results.confettiFalls = later.confetti.meanY < trophy.confetti.meanY - 0.4 && later.confetti.meanVy < -0.3 || `${trophy.confetti.meanY} -> ${later.confetti.meanY}`;
    results.noSprayBeforeTheCorks = later.spray.emitted === 0;
    // The end of the winner's lift: the gold comes down to the left hand,
    // the left on its stem before the right lets go (each within 3 cm),
    // never in mid-air, clear of the winner's body and forearms.
    const down = await p.evaluate(() => new Promise((done) => {
      const C = Ceremony.withAnthem(Render3D.podium.inspect().anthemSeconds);
      const worst = {};
      const note = (k, v, t) => { if (Number.isFinite(v) && (!(k in worst) || v < worst[k][0])) worst[k] = [v, +t.toFixed(2)]; };
      const tick = () => {
        const st = Render3D.podium.inspect();
        const tr = st.trophies.find((x) => x.place === 1);
        const pass = C.trophyAt(1, st.t).pass;
        note("held", -Math.min(tr.grip.R, tr.grip.L), st.t);
        note("body", tr.body, st.t);
        note("forearms", Math.min(tr.arms.R, tr.arms.L), st.t);
        if (pass >= C.PASS.joined && pass < C.PASS.given) note("join", -st.hands.join[1], st.t);
        if (pass >= C.PASS.given) note("hold", -st.hands.hold[1], st.t);
        if (st.t < C.BEATS.spray - 0.07) requestAnimationFrame(tick);
        else done(worst);
      };
      requestAnimationFrame(tick);
    }));
    results.winnerBringsTheGoldDown = (-down.held[0] < 0.1 && down.join && -down.join[0] < 0.03 && down.hold && -down.hold[0] < 0.03 && down.body[0] > 0 && down.forearms[0] > 0)
      || short(["held", "join", "hold", "body", "forearms"], down);

    // Just into the spray: the poses crossfade, so the trophy is still up for
    // the first moment and the bottles come in as the hands meet.
    const swap = await at(["spray", 0]);
    results.propsSwapMidFade = (swap.drivers.every((d, i) => d.props.bottle === swap.want[i].bottle && !d.props.trophy)) || JSON.stringify({ t: swap.t, props: swap.drivers.map((d) => d.props) });
    // The presenter has left the picture before the champagne (projected
    // with the scene's own camera), and is out of the scene soon after.
    // A cork for each bottle: no drop leaves a bottle before its own cork
    // goes, and each is spraying a moment after (Low has no spray).
    const pops = await p.evaluate(() => new Promise((done) => {
      const frames = [];
      const C = Ceremony.withAnthem(Render3D.podium.inspect().anthemSeconds);
      const tick = () => {
        const st = Render3D.podium.inspect();
        frames.push([st.t, st.spray.byPlace]);
        if (st.t < C.corkAt(3) + 0.6) requestAnimationFrame(tick);
        else done({ frames, corks: [1, 2, 3].map((place) => C.corkAt(place)), tier: st.tier });
      };
      requestAnimationFrame(tick);
    }));
    results.sprayFromEachCork = [1, 2, 3].every((place) => {
      const cork = pops.corks[place - 1];
      const before = pops.frames.filter(([t]) => t < cork);
      const after = pops.frames.filter(([t]) => t > cork + 0.3);
      return before.length > 0 && after.length > 0 && before.every(([, n]) => n[place] === 0)
        && (pops.tier === "low" ? after.every(([, n]) => n[place] === 0) : after.every(([, n]) => n[place] > 0));
    }) || JSON.stringify({ corks: pops.corks, frames: pops.frames.filter((f, i) => i % 6 === 0) }).slice(0, 700);
    const spray = await at(["spray", 1.8]);
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

    // With the bottles out: every trophy is in a left hand (within 3 cm of
    // it), clear of the body, and no right hand is on one: never a trophy
    // and a bottle in the same hand.
    const both = await at(["spray", 2.6]);
    results.noTrophyInTheBottleHand = (both.drivers.every((d) => d.props.bottle) && both.trophies.every((tr) => tr.grip.L < 0.1 && tr.grip.R > 0.15 && tr.body > 0 && tr.arms.L > 0 && tr.upright > 0.99)
      && [1, 2, 3].every((place) => both.hands.hold[place] < 0.03))
      || JSON.stringify({ trophies: both.trophies.map((tr) => [tr.place, tr.grip, tr.body, tr.arms]), hold: both.hands.hold });
    results.presenterGoneBeforeTheChampagne = (swap.onScreen.presenter === null && both.presenter.shown === false) || JSON.stringify({ at: swap.t, box: swap.onScreen.presenter, shown: both.presenter.shown });
    // The table is beside the podium, never under a name plate (their own
    // boxes on the page against the table's in the picture), and confetti
    // lies on its top, none fallen through it.
    // (The picture fills the window: fillsWindow, below.)
    const plateBoxes = () => p.evaluate(() => [...document.querySelectorAll("#podium-screen .podium-plate")].map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, shown: r.width > 0 }; }));
    const covers = (plate, box) => Boolean(box) && plate.left < box.right && plate.right > box.left && plate.top < box.bottom && plate.bottom > box.top;
    const sprayPlates = await plateBoxes();
    results.tableClearOfThePlates = (sprayPlates.length === 3 && sprayPlates.every((pl) => pl.shown && !covers(pl, both.onScreen.table)) && both.confetti.throughTable === 0)
      || JSON.stringify({ sprayPlates, table: both.onScreen.table, through: both.confetti.throughTable });

    results.followsTimeline = timeline.every((st) => st.drivers.every((d, i) => d.pose === st.want[i].pose && Math.abs(d.z - st.want[i].z) < 1e-6
      && !d.props.trophy && Boolean(d.props.bottle) === st.want[i].bottle))
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
    // Each name is whole: the box (it clips what overflows) leaves room after
    // the text for the italic's last letter, which leans past its advance.
    results.plateNamesWhole = await p.evaluate(() => [...document.querySelectorAll(".podium-plate strong")].every((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const room = el.getBoundingClientRect().right - range.getBoundingClientRect().right;
      return el.scrollWidth <= el.clientWidth && room >= parseFloat(getComputedStyle(el).fontSize) * 0.1;
    })) || "an italic name is clipped at its last letter";
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
      // Sampled over the orbit (the plates follow the camera), not once.
      let worst = null;
      for (let k = 0; k < 16 && !worst; k += 1) {
        const s = await plates();
        if (!(onScreen(s) && noOverlap(s) && s.canvas[0] === s.w && s.canvas[1] === s.h)) worst = s;
        await p.waitForTimeout(250);
      }
      results[`plates${w}x${h}`] = !worst || JSON.stringify({ win: [worst.w, worst.h], canvas: worst.canvas, plates: worst.plates.map((x) => [x.r.left, x.r.top, x.r.right, x.r.bottom, x.o]) }).slice(0, 900);
      results[`titlesApart${w}x${h}`] = await titleClear();
    }
    // The placing itself, at the narrowest: wherever the camera puts the
    // drivers (anchors set here, one placement read back before the next
    // frame), the plates never touch and stay on screen.
    await sizeTo(380, 800);
    await p.waitForTimeout(500);
    results.narrowPlatesAnyAnchors = await p.evaluate(() => {
      const W = innerWidth;
      const H = innerHeight;
      const fails = [];
      for (const [a2, a1, a3] of [[150, 190, 230], [60, 190, 330], [180, 190, 200], [10, 190, 370], [200, 100, 120], [190, 190, 190]]) {
        Screens.placePodium([{ place: 1, x: a1, y: 560 }, { place: 2, x: a2, y: 540 }, { place: 3, x: a3, y: 580 }], true);
        const r = [...document.querySelectorAll(".podium-plate")].map((el) => el.getBoundingClientRect());
        const on = r.every((b) => b.left >= 0 && b.top >= 0 && b.right <= W && b.bottom <= H);
        const apart = r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
        if (!on || !apart) fails.push([a2, a1, a3, r.map((b) => [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)])]);
      }
      return fails.length === 0 || JSON.stringify(fails).slice(0, 600);
    });
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
      const top = ids.map((driverId, i) => ({ place: i + 1, driverId, points: 100 - i * 20 }));
      // (Run through the presentation's middle and into the spray; the
      // waits between are skipped.)
      const cycle = async () => {
        Render3D.podium.begin({ cup: { id: "trophyCup", name: "Trophy Cup" }, podium: top });
        const t0 = performance.now();
        let who = null;
        let skipped = 0;
        while (performance.now() - t0 < 30000) {
          const f = Render3D.podium.frame(performance.now());
          if (f.drawing) {
            const st = Render3D.podium.inspect();
            who = st.presenter.kind;
            const C = Ceremony.withAnthem(st.anthemSeconds);
            if (skipped === 0 && f.t > 1) { Render3D.podium.seek(C.HANDOVERS[0].pick - 0.2); skipped = 1; }
            if (skipped === 1 && f.t > C.HANDOVERS[0].release + 1) { Render3D.podium.seek(C.BEATS.spray - 0.3); skipped = 2; }
            if (st.spray.emitted > 200) break;
          }
          await frames(1);
        }
        const drew = Render3D.podium.inspect().spray.emitted;
        Render3D.podium.end();
        await frames(30);
        return { drew, who };
      };
      // Once to fill what is kept between ceremonies (a look's strands are
      // drawn once); then the same again must leave nothing more behind.
      const first = await cycle();
      const before = mem();
      const second = await cycle();
      const after = mem();
      return (second.drew > 200 && after.textures <= before.textures && after.geometries <= before.geometries && after.programs <= before.programs
        // And the same podium has the same presenter.
        && first.who === second.who && Boolean(first.who))
        || JSON.stringify({ first, second, before, after });
    }, cup.top);
    results.racePostfxBack = (await p.evaluate(() => Render3D.podium.inspect().racePostfx)) !== null || "still released";

    // Low: fewer pieces and no spray.
    const before = await p.evaluate(() => Render3D.graphics().choice);
    await p.evaluate(() => Render3D.setGraphics("low"));
    // Enter this time, after a while on the results: ready by then, it
    // opens on the press.
    const enter = await runCup({ via: "enter", hold: 5000 });
    results.enterStraightIntoCeremony = (enter.straightIn === true && enter.waited <= 1) || `${enter.straightIn}, waited ${enter.waited} frames`;
    const low = await at(["spray", 1.6]).catch(() => null);
    results.lowTier = Boolean(low) && low.tier === "low" && low.confetti.count === 120 && low.spray.pool === 0 && low.spray.live === 0;
    await p.evaluate((c) => { Render3D.setGraphics(c); resetToGarage(); }, before);

    // Reduced motion asked for: the camera holds its view, nobody steps
    // (each stands forward from the start), the confetti lies where it fell,
    // no spray, the plates stay up.
    await p.emulateMedia({ reducedMotion: "reduce" });
    await runCup();
    const calm = [await at(3)];
    // (Each driver standing forward from the start, each still gets a hand
    // to their trophy; and the table is clear of the plates, which stay up.)
    const calmHands = [];
    for (const place of [3, 2, 1]) {
      const give = await p.evaluate((pl) => new Promise((done) => {
        const C = Ceremony.withAnthem(Render3D.podium.inspect().anthemSeconds);
        const h = C.HANDOVERS.find((x) => x.place === pl);
        const tick = () => {
          const st = Render3D.podium.inspect();
          if (st.t < (h.contact + h.release) / 2) { requestAnimationFrame(tick); return; }
          const tr = st.trophies.find((x) => x.place === pl);
          done({ take: st.hands.take[pl], presenter: st.presenter.hands && st.presenter.hands.gap, forearm: tr.arms.R, body: tr.body, table: st.onScreen.table });
        };
        requestAnimationFrame(tick);
      }), place);
      calmHands.push(give);
    }
    const calmPlates = await plateBoxes();
    results.reducedMotionHandsStillMeet = (calmHands.every((g) => g.take !== null && g.take < 0.03 && g.presenter !== null && g.presenter < 0.03 && g.forearm > 0 && g.body > 0)
      && calmPlates.length === 3 && calmPlates.every((pl) => !covers(pl, calmHands[0].table)))
      || calmHands.map((g) => [g.take, g.presenter, g.forearm, g.body].map((v) => v.toFixed(3)).join("/")).join(" ");
    calm.push(await at(["trophy", 2]));
    const platesUp = await p.evaluate(() => document.getElementById("podium-screen").classList.contains("plates-in"));
    calm.push(await at(["spray", 1.6]));
    results.reducedMotion = (calm.every((st) => JSON.stringify(st.camera) === JSON.stringify(calm[0].camera)
      && st.drivers.every((d, i) => Math.abs(d.z - calm[0].drivers[i].z) < 1e-6))
      && calm[1].confetti.airborne === 0 && calm[1].confetti.landed === calm[1].confetti.count
      && calm[2].spray.emitted === 0 && platesUp)
      || JSON.stringify({ platesUp, cams: calm.map((st) => st.camera), confetti: calm[1].confetti, spray: calm[2].spray });
    await p.emulateMedia({ reducedMotion: null });
    await p.evaluate(() => resetToGarage());

    // Esc while the ceremony readies; then a two-player cup, pressed at once.
    results.escapeWhileReadying = await runCup({ via: "instant", escape: true });
    const two = await runCup({ via: "instant", players: 2 });
    results.twoPlayersStraightIntoCeremony = (two.humans === 2 && two.straightIn === true) || `${two.humans} players: ${two.straightIn}`;
    await p.evaluate(() => { resetToGarage(); Game.selectPlayers(1); });

    // ---- The sound (podium-sound.js): the winner's anthem and the celebration ----
    await p.evaluate(() => { Game.setSound(true); initAudio(); });
    // The grandstands' crowd in a race is the crowd of voices too
    // (crowd-sound.js), rendered in the background once the sound starts.
    results.grandstandCrowdIsVoices = await p.waitForFunction(() => audio.crowdVoices === true, null, { timeout: 20000 }).then(() => true, () => "the crowd's voices never arrived");
    // What the game says it is playing, set against the ceremony's own beats
    // and the notes of the anthem it should be (all worked out in the page).
    const sound = () => p.evaluate(() => {
      const s = Game.podiumSound();
      const st = Render3D.podium.inspect();
      if (!s) return null;
      const C = Ceremony.withAnthem(s.anthemSeconds);
      const want = PodiumSound.cues(C, { tier: st.tier, winner: s.anthem });
      const first = s.log.find((l) => l.id === "welcome");
      return {
        ...s, tier: st.tier, t: st.t, pictureStartedAt: st.startedAt, sceneAnthemSeconds: st.anthemSeconds, beats: C.BEATS, corks: [1, 2, 3].map((place) => C.corkAt(place)),
        wantSeconds: PodiumSound.anthemSeconds(s.anthem), wantCues: want.map((c) => [c.id, c.at]),
        // Each started sound's place on the audio clock, from the ceremony's start.
        played: s.log.map((l) => [l.id, l.startAt - s.zero]),
        skipped: s.log.filter((l) => l.skip > 0 && !l.loop).map((l) => l.id),
        sounds: new Set(want.map((c) => c.sound)).size, audio: audio.ctx ? audio.ctx.state : "none",
      };
    });
    // (The crowd's first sound, due at 0, starts whole as the first frame
    // ends: late by that frame's own time, never early. Every other at its moment exactly.)
    const same = (a, b) => a.length === b.length && a.every(([id, at], i) => id === b[i][0] && (b[i][1] === 0 ? at >= 0 && at < 0.5 : Math.abs(at - b[i][1]) < 1e-6));

    // Gasly wins: La Marseillaise. Every sound is rendered while the results
    // are up, and starts at its beat; the audio clock runs with the picture.
    const france = await runCup({ via: "click", hold: 7000, winner: "gasly" });
    const fr = await sound();
    results.anthemIsTheWinners = (fr && france.top[0] === "gasly" && fr.winner === "gasly" && fr.anthem === "fr" && fr.on === true
      && Math.abs(fr.anthemSeconds - fr.wantSeconds) < 1e-9 && Math.abs(fr.sceneAnthemSeconds - fr.wantSeconds) < 1e-9) || JSON.stringify(fr).slice(0, 300);
    // (Counted at the moment the ceremony started, before anything could be
    // rendered late.)
    results.soundsRenderedAhead = (fr && fr.readyAtStart === fr.sounds && fr.sounds >= 19 && fr.waiting === 0) || `${fr && fr.readyAtStart} of ${fr && fr.sounds} at the start`;
    results.audioRunning = (fr && fr.audio === "running" && fr.started === true) || `${fr && fr.audio}, started ${fr && fr.started}`;
    // Where each sound was really put on the audio clock (the time handed to
    // its source), from the ceremony's start, and none begun part-way through.
    results.everySoundAtItsBeat = (fr && fr.played.length === fr.wantCues.length && fr.skipped.length === 0
      && same([...fr.played].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])), fr.wantCues)
      && ["welcome", "anthem", "ovation", "procession", "ring3", "ring2", "ring1", "roar", "sting", "cannon1", "cannon2", "cork1", "cork2", "cork3", "fizz1", "cheer", "murmur"].every((id) => fr.tier === "low" && id === "fizz1" ? true : fr.played.some((c) => c[0] === id)))
      || JSON.stringify({ played: fr && fr.played, want: fr && fr.wantCues }).slice(0, 600);
    const cueAt = (id) => fr.wantCues.find((c) => c[0] === id)[1];
    results.cuesOnTheTimeline = (cueAt("anthem") === fr.beats.anthem && [1, 2, 3].every((place) => cueAt(`cork${place}`) === fr.corks[place - 1])
      && Math.abs(cueAt("sting") - fr.beats.trophy) < 0.3 && cueAt("cannon1") >= fr.beats.trophy && cueAt("cannon1") < fr.beats.trophy + 0.1)
      || JSON.stringify(fr.wantCues);
    // One start for both clocks, whatever the frames did: the sound's zero is
    // the picture's own start (the very number, in the page's clock), and
    // that same instant on the audio clock, by the browser's own pairing of
    // the two clocks (read together, so not a matter of when this looked).
    const zeroInPage = fr.clock ? fr.clock.performanceTime + (fr.zero - fr.clock.contextTime) * 1000 : null;
    // (Within 100 ms and the device's own output latency: the picture's
    // zero is a performance.now() of a frame, the sound's a point on the
    // audio clock read back through getOutputTimestamp, which the browser
    // only refreshes every few audio callbacks: tens of ms apart on a busy
    // machine. A start a whole beat out, as it once was, is seconds.)
    results.soundClockWithPicture = (fr.startedPerf === fr.pictureStartedAt && zeroInPage !== null && Math.abs(zeroInPage - fr.pictureStartedAt) < 100 + fr.baseLatency * 1000)
      || `picture started at ${fr.pictureStartedAt}, the sound's zero ${fr.startedPerf} (on the audio clock: ${zeroInPage})`;
    // Heard, not only scheduled: through the anthem the level is up, and at
    // one of its long notes the sound really is that note (stronger at its
    // pitch than a tone either side), on the trumpets' octave or the horns'.
    const heard = await p.evaluate(() => new Promise((done) => {
      const s = Game.podiumSound();
      const a = PodiumSound.ANTHEMS[s.anthem];
      const C = Ceremony.withAnthem(s.anthemSeconds);
      const spb = 60 / a.bpm;
      const long = a.melody.find((n) => n[2] * spb >= 0.9 && n[1] * spb > 3);
      const mid = C.BEATS.anthem + (long[1] + long[2] * 0.55) * spb;
      const hz = (m) => 440 * 2 ** ((m - 69) / 12);
      const levels = [];
      let note = null;
      const tick = () => {
        const now = Game.podiumSound();
        if (!now) { done({ gone: true }); return; }
        levels.push([now.now, now.level]);
        if (!note && now.now >= mid) note = { at: now.now, power: Game.podiumSoundPower([-2, -1, 0, 1, 2].map((d) => hz(long[0] + d))) };
        if (now.now < C.BEATS.anthemEnd - 0.5) requestAnimationFrame(tick);
        else done({ levels, note, long, anthem: [C.BEATS.anthem, C.BEATS.anthemEnd] });
      };
      requestAnimationFrame(tick);
    }));
    const anthemLevels = heard.levels ? heard.levels.filter(([t]) => t > heard.anthem[0] + 1 && t < heard.anthem[1] - 1.5).map((x) => x[1]) : [];
    results.anthemIsHeard = (anthemLevels.length > 100 && anthemLevels.reduce((a, b) => a + b, 0) / anthemLevels.length > 0.02 && anthemLevels.filter((v) => v > 0.004).length > anthemLevels.length * 0.9)
      || `${anthemLevels.length} frames, mean ${anthemLevels.length ? anthemLevels.reduce((a, b) => a + b, 0) / anthemLevels.length : 0}`;
    results.anthemNoteIsRight = (heard.note && [0, 1, 3, 4].every((i) => heard.note.power[2] > heard.note.power[i] + 6)) || JSON.stringify(heard.note);
    // Leaving stops it.
    await p.click("#podium-screen [data-action='pitlane']");
    // (Its fade-out has a second to finish: the louder champagne's tail was a
    // hair over the limit at 0.7 s, some 79 dB down.)
    await p.waitForTimeout(1000);
    results.leavingStopsTheSound = await p.evaluate(() => {
      const last = Game.podiumSound({ last: true });
      return (Game.podiumSound() === null && state.phase === "garage" && last && last.level < 1e-4) || JSON.stringify({ now: Game.podiumSound(), level: last && last.level });
    });

    // Pressed the moment the results appear, nothing rendered yet: the
    // ceremony still opens at once, each sound joins as it is ready, and the
    // anthem (5.8 s in) starts on its beat from its first note.
    await runCup({ via: "instant", winner: "lawson" });
    const early = await sound();
    await p.waitForFunction(() => { const s = Game.podiumSound(); return s && s.waiting === 0 && s.now > 6.5; }, null, { timeout: 30000 });
    const caught = await sound();
    const anthemLog = caught.log.find((l) => l.id === "anthem");
    results.soundCatchesUpAfterAnEarlyPress = (early.anthem === "nz" && early.started === true && early.readyAtStart < early.sounds
      && caught.waiting === 0 && anthemLog && anthemLog.skip === 0 && Math.abs(anthemLog.startAt - caught.zero - caught.beats.anthem) < 1e-6)
      || JSON.stringify({ readyAtStart: early.readyAtStart, sounds: early.sounds, waiting: caught.waiting, anthemLog });
    await p.evaluate(() => resetToGarage());

    // The sound switched off while the last results are up: the ceremony is
    // laid out again without the anthem's wait, and plays nothing; on again, it is back.
    await runCup({ via: "hold", winner: "gasly" });
    const toggled = await p.evaluate(async () => {
      const frames = (n) => new Promise((r) => { const go = () => (n-- > 0 ? requestAnimationFrame(go) : r()); go(); });
      const read = () => ({ on: Game.podiumSound().on, seconds: Game.podiumSound().anthemSeconds, cues: Game.podiumSound().cues.length });
      const a = read();
      Game.setSound(false);
      await frames(3);
      const b = read();
      Game.setSound(true);
      await frames(3);
      return [a, b, read()];
    });
    results.soundSettingRelaysTheCeremony = (toggled[0].on && toggled[0].seconds > 10 && !toggled[1].on && toggled[1].seconds === 3 && toggled[1].cues === 0
      && toggled[2].on && toggled[2].seconds === toggled[0].seconds && toggled[2].cues === toggled[0].cues) || JSON.stringify(toggled);
    await p.evaluate(() => resetToGarage());

    // Leclerc wins: Monaco's. Antonelli wins: Italy's.
    for (const [winner, key] of [["leclerc", "mc"], ["antonelli", "it"]]) {
      const run = await runCup({ via: "click", hold: 2500, winner });
      const s = await sound();
      results[`anthemFor_${winner}`] = (s && run.top[0] === winner && s.anthem === key && Math.abs(s.anthemSeconds - s.wantSeconds) < 1e-9
        && Math.abs(s.sceneAnthemSeconds - s.wantSeconds) < 1e-9 && s.played.some((c) => c[0] === "anthem")) || JSON.stringify(s).slice(0, 300);
      await p.evaluate(() => resetToGarage());
    }
    await p.evaluate(() => Game.setSound(false));
  }

  // Without 3D: the 2D steps, as before.
  const flat = await context.newPage();
  flat.on("pageerror", (e) => errors.push(String(e)));
  await flat.route("**/render3d.js*", (route) => route.abort());
  await flat.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await flat.waitForFunction(() => window.Render3D && Render3D.failed, null, { timeout: 30000 });
  const flatCup = await flat.evaluate(() => {
    Game.setSound(true);
    initAudio();
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
  // Without the 3D ceremony the celebration is still heard, from the moment
  // the podium opens: every sound started on the audio clock, the first at once.
  await flat.waitForFunction(() => { const s = Game.podiumSound(); return s && s.waiting === 0 && s.log.length > 0; }, null, { timeout: 30000 }).catch(() => {});
  results.fallback2dHasTheSound = await flat.evaluate(() => {
    const s = Game.podiumSound();
    if (!s) return "no sound planned";
    const welcome = s.log.find((l) => l.id === "welcome");
    const anthem = s.log.find((l) => l.id === "anthem");
    return (s.on && s.started && s.log.length === s.cues.length && welcome && Math.abs(welcome.startAt - s.zero) < 0.5
      && anthem && Math.abs(anthem.startAt - s.zero - Ceremony.withAnthem(s.anthemSeconds).BEATS.anthem) < 1e-6)
      || JSON.stringify({ on: s.on, started: s.started, log: s.log.length, cues: s.cues.length });
  });
  await context.close();
  return { results, errors };
}
