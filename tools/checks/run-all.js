// The full browser regression: runs every check in tools/checks and reports
// each one's failures. Run with the Playwright MCP tool browser_run_code_unsafe,
// dev server on http://localhost:8765 (python3 tools/dev-server.py .):
//
//   async (page) => eval(await (await page.request.get("http://localhost:8765/tools/checks/run-all.js")).text())(page)
//
// Set globalThis.CHECKS = "rain,car" first to run only some, and
// globalThis.LONG = true for long failure messages. Entries that are not
// `true` but plain values (counts, strings) in play, landing, career and
// race-sim are informational, compared by eye; a real failure says so.
async (page) => {
  const names = (globalThis.CHECKS || "play,keys,landing,loading,minors,helmet,career,grid,powerups,race-clock,race-sim,postfx,trackside,people,rain,motion,car").split(",");
  const out = {};
  for (const n of names) {
    const file = n === "race-sim" ? "race-sim.js" : `${n}-check.js`;
    const t0 = Date.now();
    try {
      // (A headless runner on another port sets globalThis.HOST; every check is pointed at it.
      // The default host is spelt in two pieces: a runner that rewrites this
      // file's own source must not rewrite what each check's URLs are matched by.)
      const home = ["localhost", "8765"].join(":");
      const host = globalThis.HOST || home;
      const src = (await (await page.request.get(`http://${host}/tools/checks/${file}?${Date.now()}`)).text()).replaceAll(home, host);
      const r = await eval(src)(page);
      const bad = Object.entries(r.results || {}).filter(([, v]) => v !== true);
      // Informational values (counts, strings) are compared by eye; list them short.
      out[n] = { ok: bad.length === 0 && (r.errors || []).length === 0, total: Object.keys(r.results || {}).length, bad: bad.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v).slice(0, globalThis.LONG ? 1200 : 80)}`), errors: (r.errors || []).slice(0, 3), s: Math.round((Date.now() - t0) / 1000) };
    } catch (e) { out[n] = { ok: false, crash: String(e).slice(0, 300) }; }
  }
  return JSON.stringify(out);
}
