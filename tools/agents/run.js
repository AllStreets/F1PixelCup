// Headless browser runner for subagents (so they never fight over the shared
// Playwright MCP window). Usage:
//   node /private/tmp/claude-501/pw/run.js <port> checks <names|all> [--long]
//   node /private/tmp/claude-501/pw/run.js <port> code <file.js>
// `code` files export an async function (page, port) and their return value is printed.
// The window is a real 1600x900 window (no forced viewport).
// (Recreated 2026-10-10 after /tmp was cleaned; same behaviour as before.)
const { chromium } = require("playwright");
const path = require("path");
// At most SLOTS agent browsers at once across every agent (the user plays
// on this machine): a slot is a directory made atomically; a dead holder's
// slot is reclaimed.
const fs = require("fs");
const SLOTS = 2;
async function takeSlot() {
  const dir = path.join(__dirname, "slots");
  fs.mkdirSync(dir, { recursive: true });
  for (;;) {
    for (let i = 0; i < SLOTS; i += 1) {
      const d = path.join(dir, String(i));
      try { fs.mkdirSync(d); fs.writeFileSync(path.join(d, "pid"), String(process.pid)); return d; } catch (e) {
        try { process.kill(Number(fs.readFileSync(path.join(d, "pid"), "utf8")), 0); } catch (gone) { fs.rmSync(d, { recursive: true, force: true }); }
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
(async () => {
  const [port, mode, arg] = process.argv.slice(2);
  const long = process.argv.includes("--long");
  const held = await takeSlot();
  const release = () => { try { fs.rmSync(held, { recursive: true, force: true }); } catch (e) {} };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { release(); process.exit(130); });
  // No run holds a slot for ever: a hung check is cut off (RUN_MAX_MIN to change it).
  const maxMin = Number(process.env.RUN_MAX_MIN || 50);
  setTimeout(() => { console.log(JSON.stringify({ runner: { ok: false, crash: `cut off after ${maxMin} min (a hung check?); run fewer checks per call, or set CIRCUITS` } })); release(); process.exit(124); }, maxMin * 60000).unref();
  const browser = await chromium.launch({ args: ["--window-size=1600,900", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();
  const base = `http://localhost:${port}`;
  globalThis.HOST = `localhost:${port}`;
  let out;
  try {
    if (mode === "checks") {
      const src = await (await page.request.get(`${base}/tools/checks/run-all.js?${Date.now()}`)).text(); // run-all itself points each check at globalThis.HOST
      if (arg && arg !== "all") globalThis.CHECKS = arg;
      if (long) globalThis.LONG = true;
      out = await eval(src)(page);
    } else {
      const fn = require(path.resolve(arg));
      out = await fn(page, port);
    }
  } catch (e) {
    out = `CRASH: ${e.stack || e}`;
  }
  console.log(typeof out === "string" ? out : JSON.stringify(out, null, 1));
  await browser.close();
})();
