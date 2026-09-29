// Browser check: graphics tiers and the post-processing
// (docs/superpowers/specs/2026-09-29-postfx-design.md). Run with the Playwright
// MCP tool browser_run_code_unsafe, filename: tools/checks/postfx-check.js,
// dev server on http://localhost:8765.
// Expected: every value in `results` true, errors []. `measured` reports the
// median frame per tier.
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  const measured = {};
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
  await p.goto(`http://localhost:8765/play.html?${Date.now()}`);
  await p.evaluate(() => localStorage.removeItem("f1pixelcup.graphics"));
  await p.reload();
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  const step = async (fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return `error: ${String(e).split("\n")[0].slice(0, 160)}`; } };
  const frames = (n) => p.evaluate((n) => new Promise((resolve) => {
    let left = n;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);

  // Auto judges the machine on real racing frames only: not the qualifying
  // simulation behind the loading panel, not the loading itself, not a pause.
  results.autoSamplesRacingOnly = await step(async () => {
    const wait = (n) => new Promise((resolve) => { let left = n; const t = () => (--left <= 0 ? resolve() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    Game.selectGridMode("qualifying");
    Game.startCup();
    const seen = [];
    for (let i = 0; i < 90 && state.phase !== "race"; i += 1) {
      await wait(1);
      seen.push(state.phase);
    }
    const afterQualifying = Render3D.graphics().sampled;
    Game.backToPitLane();
    Game.selectGridMode("back");
    Game.startCup();
    for (let i = 0; i < 300 && state.preparing; i += 1) await wait(1);
    const afterLoading = Render3D.graphics().sampled;
    for (let i = 0; i < 600 && state.phase !== "race"; i += 1) await wait(1);
    state.paused = true; state.pausedAt = performance.now();
    const before = Render3D.graphics().sampled;
    await wait(20);
    const whilePaused = Render3D.graphics().sampled;
    state.paused = false;
    await wait(20);
    const racing = Render3D.graphics().sampled;
    const ok = seen.includes("qualifyingSim") && afterQualifying === 0 && afterLoading === 0 && whilePaused === before && racing > whilePaused;
    return ok || JSON.stringify({ phases: [...new Set(seen)], afterQualifying, afterLoading, before, whilePaused, racing });
  });

  // Each tier switches the real passes on and off.
  results.tiersSwitchPasses = await step(async () => {
    const bad = [];
    for (const tier of ["high", "medium", "low"]) {
      Render3D.setGraphics(tier);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const fx = Render3D.inspect().postfx;
      const want = Quality.passesFor(tier);
      if (fx.tier !== tier) bad.push(`${tier}: tier ${fx.tier}`);
      Object.keys(want).forEach((k) => { if (fx.passes[k] !== want[k]) bad.push(`${tier}.${k}`); });
    }
    return bad.length === 0 || JSON.stringify(bad);
  });

  // The player's own Overtake Mode sets off a gold burst that fades; another
  // car's does nothing.
  await step(() => { Render3D.setGraphics("high"); state.phase = "race"; state.paused = false; });
  await frames(3);
  results.burstOnPlayerOnly = await step(async () => {
    const other = state.racers.find((r) => !r.isPlayer);
    window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type: "overtakeMode", racerId: other.id } }));
    const afterOther = Render3D.inspect().postfx.burst.gold;
    window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type: "overtakeMode", racerId: state.playerId } }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const fresh = Render3D.inspect().postfx.burst.gold;
    await new Promise((r) => setTimeout(r, 1500));
    const later = Render3D.inspect().postfx.burst.gold;
    return (afterOther === 0 && fresh > 0.6 && later < 0.1) || JSON.stringify({ afterOther, fresh, later });
  });
  // A hit (red) and DRS (blur) too.
  results.hitAndDrsBursts = await step(async () => {
    window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type: "hitTaken", racerId: state.playerId } }));
    window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type: "itemUsed", item: "drs", racerId: state.playerId } }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const b = Render3D.inspect().postfx.burst;
    return (b.red > 0.5 && b.blur > 0.5) || JSON.stringify(b);
  });
  // No bursts on Low.
  results.noBurstsOnLow = await step(async () => {
    Render3D.setGraphics("low");
    window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type: "hitTaken", racerId: state.playerId } }));
    await new Promise((r) => requestAnimationFrame(r));
    const b = Render3D.inspect().postfx.burst;
    Render3D.setGraphics("high");
    return b.red === 0 || JSON.stringify(b);
  });

  // The sun flare shows when the camera looks at the sun (at Monza, a day
  // circuit), and not when it looks away.
  results.flareOnlyWhenSeen = await step(async () => {
    state.paused = true; state.pausedAt = performance.now();
    const pl = getPlayer();
    const sun = { x: 0.5, y: -0.6 }; // SUN_DIR's x and z in render3d.js
    const at = (k, h) => ({ x: pl.x + sun.x * k, y: pl.y + sun.y * k, d: pl.trackDistance, h });
    // The flare eases in and out over real time: give it a full second.
    const settle = () => new Promise((r) => { const end = performance.now() + 1000; const t = () => (performance.now() >= end ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    // Straight at the sun: SUN_DIR scaled, (0.5, 0.42, -0.6) x 400.
    Render3D.setPhotoCamera({ from: at(0, 60), at: at(400, 60 + 0.42 * 400), fov: 70 });
    await settle();
    const toward = Render3D.inspect().postfx.sunVisible;
    Render3D.setPhotoCamera({ from: at(0, 60), at: at(-400, 40), fov: 70 });
    await settle();
    const away = Render3D.inspect().postfx.sunVisible;
    Render3D.setPhotoCamera(null);
    state.paused = false;
    return (toward > 0.3 && away < 0.05) || JSON.stringify({ toward, away });
  });

  // The circuit's own structures hide the sun too: with the start gantry's
  // beam right between the camera and the sun, there is no flare.
  results.flareHiddenByGantry = await step(async () => {
    state.paused = true; state.pausedAt = performance.now();
    const s = state.track.points[0];
    const len = Math.hypot(0.5, 0.42, 0.6);
    const sun = { x: 0.5 / len, up: 0.42 / len, y: -0.6 / len }; // SUN_DIR, game axes
    const back = 30;
    const from = { x: s.x - sun.x * back, y: s.y - sun.y * back, d: 0, h: 44 - sun.up * back };
    const at = { x: from.x + sun.x * 400, y: from.y + sun.y * 400, d: 0, h: from.h + sun.up * 400 };
    Render3D.setPhotoCamera({ from, at, fov: 70 });
    await new Promise((r) => { const end = performance.now() + 1000; const t = () => (performance.now() >= end ? r() : requestAnimationFrame(t)); requestAnimationFrame(t); });
    const fx = Render3D.inspect().postfx;
    Render3D.setPhotoCamera(null);
    state.paused = false;
    return (fx.sun.onScreen && fx.sun.blocked && fx.sunVisible < 0.05) || JSON.stringify({ sun: fx.sun, visible: fx.sunVisible });
  });

  // Every tier draws the scene the same way: High is Low with the effects on
  // top, never a different exposure. The sky away from the sun, in the top
  // middle of the frame (clear of the vignette), stays within a grade's reach.
  const skyOf = async (tier) => {
    await step((t) => Render3D.setGraphics(t), tier);
    await frames(3);
    const box = await step(() => ({ w: innerWidth, h: innerHeight }));
    const png = await p.screenshot({ clip: { x: Math.round(box.w * 0.35), y: Math.round(box.h * 0.04), width: Math.round(box.w * 0.3), height: Math.round(box.h * 0.12) } });
    return step(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
      return sum.map((v) => Math.round(v / (d.length / 4)));
    }, png.toString("base64"));
  };
  await step(() => {
    state.paused = true; state.pausedAt = performance.now();
    document.getElementById("screens").style.visibility = "hidden";
    document.getElementById("game").style.visibility = "hidden";
    const pl = getPlayer();
    const at = (k, h) => ({ x: pl.x - 0.5 * k, y: pl.y + 0.6 * k, d: pl.trackDistance, h });
    Render3D.setPhotoCamera({ from: at(0, 40), at: at(400, 140), fov: 60 });
  });
  const lowSky = await skyOf("low");
  const highSky = await skyOf("high");
  await step(() => {
    Render3D.setPhotoCamera(null);
    document.getElementById("screens").style.visibility = "";
    document.getElementById("game").style.visibility = "";
    state.paused = false;
  });
  results.highKeepsLowExposure = (Array.isArray(lowSky) && Array.isArray(highSky)
    && lowSky.every((v, i) => Math.abs(v - highSky[i]) <= 24) && lowSky.some((v) => v > 0)) || JSON.stringify({ lowSky, highSky });

  // The advert barriers read forward from both sides on every circuit, all
  // the way round; none stands on a road, and none loops over itself on the
  // inside of a tight bend.
  results.advertsReadForward = await step(() => {
    const bad = [];
    CIRCUITS.forEach((c) => {
      const ads = Render3D.auditAdverts(TRACKS.find((t) => t.id === c.id));
      const wrong = (x) => !x.readsBothWays || x.backwards.length || x.onRoad.length || x.loops || x.quads < 100;
      if (ads.length !== 2 || ads.some(wrong)) bad.push({ id: c.id, ads });
    });
    return bad.length === 0 || JSON.stringify(bad).slice(0, 400);
  });

  // The DRS blur surge is a burst, so Medium has it as well as High.
  results.drsBurstOnMedium = await step(async () => {
    Render3D.setGraphics("medium");
    // The circuit drawing again (the audits above rebuilt it) and Medium's
    // effects compiled.
    const until = performance.now() + 15000;
    while (!(Render3D.inspect().drawing && Render3D.inspect().postfx.drawing) && performance.now() < until) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type: "itemUsed", item: "drs", racerId: state.playerId } }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const blur = Render3D.inspect().postfx.blur;
    Render3D.setGraphics("high");
    return blur > 0.4 || JSON.stringify({ blur });
  });

  // Bursts fade on race time: a paused race holds them.
  results.burstsFreezeWhilePaused = await step(async () => {
    state.paused = true; state.pausedAt = performance.now();
    window.dispatchEvent(new CustomEvent("f1:fx", { detail: { type: "overtakeMode", racerId: state.playerId } }));
    await new Promise((r) => setTimeout(r, 700));
    const held = Render3D.inspect().postfx.burst.gold;
    state.paused = false;
    await new Promise((r) => setTimeout(r, 1500));
    const later = Render3D.inspect().postfx.burst.gold;
    return (held > 0.9 && later < 0.1) || JSON.stringify({ held, later });
  });

  // Low holds nothing on the GPU for the effects; High's frame copy is the
  // drawing buffer's size, and follows the window when it is resized.
  results.lowFreesTheEffects = await step(async () => {
    Render3D.setGraphics("low");
    await new Promise((r) => requestAnimationFrame(r));
    const low = Render3D.inspect().postfx.frame;
    Render3D.setGraphics("high");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const high = Render3D.inspect().postfx.frame;
    const c = document.getElementById("game3d");
    return (low === null && high && high.width === c.width && high.height === c.height) || JSON.stringify({ low, high, canvas: [c.width, c.height] });
  });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1180, height: 760 } });
  await p.waitForTimeout(600);
  results.frameFollowsResize = await step(() => {
    const f = Render3D.inspect().postfx.frame;
    const c = document.getElementById("game3d");
    return (f && f.width === c.width && f.height === c.height && c.width === Math.floor(c.clientWidth * Math.min(devicePixelRatio, 2))) || JSON.stringify({ f, canvas: [c.width, c.height, c.clientWidth] });
  });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 900 } });
  await p.waitForTimeout(400);

  // Frame time per tier, the race running: Low is never slower than High.
  // Measured there and back (high, medium, low, low, medium, high) and each
  // tier's two medians averaged, so the machine warming or loading up over
  // the run doesn't count against whichever tier came last.
  const samples = { high: [], medium: [], low: [] };
  for (const tier of ["high", "medium", "low", "low", "medium", "high"]) {
    await step((t) => Render3D.setGraphics(t), tier);
    samples[tier].push(await step(() => new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      const tick = () => {
        const t = performance.now();
        times.push(t - last);
        last = t;
        if (times.length < 90) requestAnimationFrame(tick);
        else resolve(times.slice(10).sort((a, b) => a - b)[40]);
      };
      requestAnimationFrame(tick);
    })));
  }
  Object.keys(samples).forEach((tier) => { measured[tier] = (samples[tier][0] + samples[tier][1]) / 2; });
  results.lowNotSlowerThanHigh = measured.low <= measured.high + 2 || JSON.stringify(measured);

  // Settings: the Graphics row cycles Auto, High, Medium, Low; the choice is
  // kept across a reload; Auto shows what it picked.
  await step(() => { Render3D.setGraphics("auto"); Game.backToPitLane(); Screens.showSettings(); });
  results.settingsShowsAuto = await step(() => /^Auto \((High|Medium|Low)\)$/.test(document.getElementById("graphics-toggle").textContent));
  // Each setting's button is named for its setting, not just "On" or "High".
  results.settingsNamed = (await p.getByRole("button", { name: /^Graphics Auto \(/ }).count()) === 1
    && (await p.getByRole("button", { name: /^Sound (On|Off)$/ }).count()) === 1
    && (await p.getByRole("button", { name: /^Full screen (On|Off)$/ }).count()) === 1;
  // Without the 3D renderer there is no Graphics choice: the row and its note
  // are gone, not an empty button.
  results.noGraphicsWithout3D = await step(() => {
    const saved = window.Render3D;
    window.Render3D = undefined;
    Screens.showSettings();
    const box = document.getElementById("graphics-setting");
    const gone = box.hidden && getComputedStyle(box).display === "none" && !document.getElementById("graphics-note").getClientRects().length;
    window.Render3D = saved;
    Screens.showSettings();
    return gone || JSON.stringify({ hidden: box.hidden, display: getComputedStyle(box).display });
  });
  await p.locator("#graphics-toggle").click();
  results.settingsCyclesAndKeeps = await step(() => document.getElementById("graphics-toggle").textContent === "High"
    && localStorage.getItem("f1pixelcup.graphics") === "high");
  await p.reload();
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });
  results.choiceSurvivesReload = await step(() => Render3D.graphics().choice === "high" && Render3D.inspect().postfx.tier === "high");
  await step(() => { Render3D.setGraphics("auto"); localStorage.removeItem("f1pixelcup.graphics"); });
  await context.close();
  return { results, measured, errors };
}
