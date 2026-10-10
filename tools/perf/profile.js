// Draw-call breakdown for one race frame: by pass (shadow / main / effects)
// and by which part of the world (the world group's children, cars, etc.).
// node profile.js --port 8784 --circuit monaco [--tier high]
const fs = require("fs");
const { chromium } = require(require("os").homedir() + "/.f1pixelcup/pw/node_modules/playwright");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => { if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]); return acc; }, []));
const src = fs.readFileSync(__dirname + "/harness.js", "utf8");
const INIT = eval(src.match(/const INIT = (`[\s\S]*?`);/)[1]);
eval(src.match(/const SLOT_DIR[\s\S]*?\n}\n/)[0].replace("const SLOT_DIR", "var SLOT_DIR"));
(async () => {
  const held = await takeSlot();
  process.on("exit", () => { try { fs.rmSync(held, { recursive: true, force: true }); } catch (e) {} });
  const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,940", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });
  const ctx = await browser.newContext({ viewport: null });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1728, height: 1117, deviceScaleFactor: 2, mobile: false });
  await page.goto(`http://localhost:${args.port || 8784}/play.html`);
  await page.waitForFunction(() => window.Render3D && Render3D.ready && window.Game, null, { timeout: 60000 });
  const out = await page.evaluate(async ({ circuit, tier, players }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    Render3D.setGraphics(tier);
    Game.selectPlayers(Number(players || 1));
    Game.selectGridMode("back"); Game.selectWeatherMode("dry"); Game.selectRaceMode("single"); Game.chooseSingleCircuit(circuit); Game.startCup();
    for (let i = 0; i < 1200 && !(state.phase === "race" && !state.preparing); i += 1) await wait(100);
    state.racers.forEach((r) => { if (r.isPlayer) r.isPlayer = false; });
    await wait(6000);
    const r = __perf.renderers.find((x) => x.domElement.id === "game3d");
    const scene = __perf.scenes.find((s) => s.children.some((c) => c.isDirectionalLight)) || __perf.scenes[0];
    // Which part of the world each object is in.
    const world = scene.children.find((c) => c.isGroup && c.children.length > 5);
    const partOf = (o) => { let p = o; let last = o; while (p && p !== scene) { if (p.parent === world) return p.name || p.type; last = p; p = p.parent; } return `scene:${last.name || last.type}`; };
    const byPass = {}; const byPart = {}; const tris = {};
    const orig = r.renderBufferDirect;
    let total = 0;
    r.renderBufferDirect = function (camera, sceneArg, geometry, material, object, group) {
      const rt = r.getRenderTarget();
      const pass = !sceneArg ? "fx" : camera.isOrthographicCamera && rt ? "shadow" : rt ? "rt" : "main";
      byPass[pass] = (byPass[pass] || 0) + 1;
      const key = `${pass}|${partOf(object)}`;
      byPart[key] = (byPart[key] || 0) + 1;
      total += 1;
      return orig.apply(this, arguments);
    };
    await new Promise((res) => __rawRAF(() => { total = 0; Object.keys(byPass).forEach((k) => delete byPass[k]); Object.keys(byPart).forEach((k) => delete byPart[k]); __rawRAF(() => res()); }));
    r.renderBufferDirect = orig;
    let objects = 0; let meshes = 0; let auto = 0; let inst = 0; const mats = new Set(); const geos = new Set();
    scene.traverse((o) => { objects += 1; if (o.matrixAutoUpdate) auto += 1; if (o.isMesh) { meshes += 1; [].concat(o.material).forEach((m) => mats.add(m)); geos.add(o.geometry); } if (o.isInstancedMesh) inst += 1; });
    const t0 = performance.now(); for (let i = 0; i < 20; i += 1) scene.updateMatrixWorld(); const umw = (performance.now() - t0) / 20;
    return { total, byPass, byPart: Object.entries(byPart).sort((a, b) => b[1] - a[1]), objects, meshes, matrixAuto: auto, instanced: inst, materials: mats.size, geometries: geos.size, programs: r.info.programs.length, updateMatrixWorldMs: +umw.toFixed(2), textures: r.info.memory.textures, shadowMap: r.shadowMap.autoUpdate };
  }, { circuit: args.circuit || "monaco", tier: args.tier || "high", players: args.players || 1 });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
