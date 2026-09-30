// Browser check: every driver's helmet is painted with their own design
// (docs/superpowers/specs/2026-09-29-helmets-design.md). Run with the
// Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/helmet-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
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
  await p.waitForFunction(() => window.Render3D && Render3D.ready, null, { timeout: 30000 });

  const info = await p.evaluate(() => DRIVERS.map((d) => ({ id: d.id, want: d.helmet, got: Render3D.helmetInfo(d.id) })));
  const close = (a, b) => {
    const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return n(a).every((v, i) => Math.abs(v - n(b)[i]) <= 6);
  };
  const bad = [];
  info.forEach(({ id, want, got }) => {
    if (!got || !got.painted) { bad.push(`${id}: not painted`); return; }
    if (!close(got.crown, want.crown)) bad.push(`${id}: crown ${got.crown} not ${want.crown}`);
    if (!close(got.base, want.base)) bad.push(`${id}: base ${got.base} not ${want.base}`);
    if (!close(got.visor, want.visor)) bad.push(`${id}: visor ${got.visor} not ${want.visor}`);
    if (!close(got.stripe, want.stripe)) bad.push(`${id}: stripe ${got.stripe} not ${want.stripe}`);
  });
  results.everyHelmetPainted = bad.length === 0 || JSON.stringify(bad.slice(0, 8));
  results.oneTexturePerDriver = new Set(info.map((x) => x.got && x.got.textureId)).size === info.length;
  const lec = info.find((x) => x.id === "leclerc").got;
  const ham = info.find((x) => x.id === "hamilton").got;
  // The whole design differs, not just one colour.
  results.leclercAndHamiltonDiffer = Boolean(lec && ham) && lec.hash !== ham.hash;
  results.everyDesignDistinct = new Set(info.map((x) => x.got && x.got.hash)).size === info.length;
  // In a race, the car on track wears it.
  results.carOnTrackWearsIt = await p.evaluate(async () => {
    Game.selectGridMode("back");
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === "hamilton"));
    Game.startCup();
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 3; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const worn = Render3D.inspect().helmets || {};
    const ok = worn.hamilton === Render3D.helmetInfo("hamilton").textureId && worn.leclerc === Render3D.helmetInfo("leclerc").textureId;
    Game.backToPitLane();
    return ok || JSON.stringify(worn).slice(0, 200);
  });
  // And on screen: Hamilton's helmet, rendered. From behind and above, its top
  // shows his crown colour; from the front, off to one side of the halo's
  // pillar, the visor slot is dark. Upside-down UVs or a lost material fail.
  const pixelAt = async (x, y) => {
    const png = await p.screenshot({ clip: { x: x - 1, y: y - 1, width: 3, height: 3 } });
    return p.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
      return [d[0], d[1], d[2]];
    }, png.toString("base64"));
  };
  const pose = (view) => p.evaluate(async (view) => {
    Game.backToPitLane();
    Game.selectGridMode("back");
    Game.selectDriver(DRIVERS.findIndex((d) => d.id === "hamilton"));
    Game.startCup();
    for (let i = 0; i < 300 && state.preparing; i += 1) await new Promise((r) => requestAnimationFrame(r));
    state.paused = true; state.pausedAt = performance.now();
    document.getElementById("screens").style.visibility = "hidden";
    document.getElementById("game").style.visibility = "hidden";
    const pl = getPlayer();
    const c = Math.cos(pl.heading ?? pl.angle);
    const s = Math.sin(pl.heading ?? pl.angle);
    const spot = (fwd, side, h) => ({ x: pl.x + c * fwd - s * side, y: pl.y + s * fwd + c * side, d: pl.trackDistance, h });
    // The helmet (car scale 6): centre 0.72 behind the car's middle, 4.44 up,
    // 0.81 round; its crown is at 5.25.
    if (view === "rear") Render3D.setPhotoCamera({ from: spot(-5, 0, 7.4), at: spot(-0.9, 0, 5.2), fov: 12 });
    else Render3D.setPhotoCamera({ from: spot(6, -2.2, 4.8), at: spot(0.12, -0.36, 4.55), fov: 10 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { w: innerWidth, h: innerHeight };
  }, view);
  const near = (px, hex, tol) => {
    const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return px.every((v, i) => Math.abs(v - want[i]) <= tol);
  };
  const hamHelmet = await p.evaluate(() => DRIVERS.find((d) => d.id === "hamilton").helmet);
  const rear = await pose("rear");
  // Either side of the car's centreline: car v2's blade roll hoop stands on
  // it, just behind the helmet, and hides the crown's very middle from behind.
  const topL = await pixelAt(Math.round(rear.w * 0.25), Math.round(rear.h / 2));
  const topR = await pixelAt(Math.round(rear.w * 0.75), Math.round(rear.h / 2));
  const front = await pose("front");
  const visor = await pixelAt(Math.round(front.w / 2), Math.round(front.h / 2));
  await p.evaluate(() => { Render3D.setPhotoCamera(null); state.paused = false; Game.backToPitLane(); });
  // Lit and shaded, so a generous tolerance: red is red, dark is dark.
  const red = (px) => px[0] > 120 && px[1] < 90 && px[2] < 90 && near(px, hamHelmet.crown, 110);
  results.renderedCrown = (red(topL) && red(topR)) || JSON.stringify({ topL, topR, want: hamHelmet.crown });
  results.renderedVisor = (Math.max(...visor) < 90) || JSON.stringify({ visor, want: hamHelmet.visor });
  // The 2D fallback car, seen from behind: its helmet shows over the rear
  // wing in the driver's crown and base colours.
  results.fallbackHelmet = await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 200; c.height = 200;
    const g = c.getContext("2d");
    const driver = DRIVERS.find((d) => d.id === "hamilton");
    const kart = TEAMS.find((t) => t.id === driver.teamId);
    drawKartRear(g, 100, 170, 4, kart, driver, 0);
    const px = (x, y) => [...g.getImageData(100 + x * 4, 170 + y * 4, 1, 1).data.slice(0, 3)];
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 8);
    const crown = px(0, -30.2);
    const base = px(0, -28);
    return (same(crown, hex(driver.helmet.crown)) && same(base, hex(driver.helmet.base))) || JSON.stringify({ crown, base });
  });
  await context.close();
  return { results, errors };
}
