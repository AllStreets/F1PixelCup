// Runs tools/checks/perf-check.js in a headed, GPU-accelerated Chromium (real
// vsync, a real GPU), taking one of the shared agent-browser slots as
// /private/tmp/claude-501/pw/run.js does.
//   node tools/perf/check-headed.js <port>
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/private/tmp/claude-501/pw/node_modules/playwright");
const SLOT_DIR = process.env.PW_SLOTS || "/private/tmp/claude-501/pw/slots";
async function takeSlot() {
  fs.mkdirSync(SLOT_DIR, { recursive: true });
  for (;;) {
    for (let i = 0; i < 2; i += 1) {
      const d = path.join(SLOT_DIR, String(i));
      try { fs.mkdirSync(d); fs.writeFileSync(path.join(d, "pid"), String(process.pid)); return d; } catch (e) {
        try { process.kill(Number(fs.readFileSync(path.join(d, "pid"), "utf8")), 0); } catch (gone) { fs.rmSync(d, { recursive: true, force: true }); }
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
(async () => {
  const port = process.argv[2] || "8765";
  const held = await takeSlot();
  const release = () => { try { fs.rmSync(held, { recursive: true, force: true }); } catch (e) {} };
  process.on("exit", release);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { release(); process.exit(130); });
  const browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1500,940", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist",
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
  });
  const page = await (await browser.newContext({ viewport: null })).newPage();
  const src = fs.readFileSync(path.join(__dirname, "..", "checks", "perf-check.js"), "utf8").replaceAll("localhost:8765", `localhost:${port}`);
  globalThis.PERF_HEADED = true;
  let out;
  try { out = await eval(src)(page); } catch (e) { out = `CRASH: ${e.stack || e}`; }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
