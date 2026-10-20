// The balance measurement (docs/design/specs/2026-10-05-balance-design.md):
// many races of tools/balance/comeback.js, written to a JSON file for
// tools/balance/summarize.js. Runs through the headless browser runner, with
// the dev server on <port>:
//   DIFFS=0,1,2 START=back SEEDS=1-10 OUT=back.json \
//     node <runner>/run.js <port> code tools/balance/measure.js
// DIFFS: difficulty indexes (0 Rookie, 1 Pro, 2 Legend). START: back or pole.
// SOLID=1: with the setting "Spinning cars block the road" on.
// TRACKS: circuit ids (default the eight in the spec). SEEDS: a range.
// Several runs (split by circuit or difficulty) can go side by side and be
// summarized together.
const fs = require("fs");

const TRACKS = "monaco,monza,spa,singapore,suzuka,bahrain,hungaroring,lasvegas";

module.exports = async (page, port) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/play.html?${Date.now()}`);
  await page.waitForTimeout(1500);
  await page.addScriptTag({ url: `http://localhost:${port}/tools/balance/comeback.js?${Date.now()}` });
  const diffs = (process.env.DIFFS || "0,1,2").split(",").map(Number);
  const tracks = (process.env.TRACKS || TRACKS).split(",");
  const [from, to] = (process.env.SEEDS || "1-10").split("-").map(Number);
  const start = process.env.START || "back";
  const out = [];
  for (const diff of diffs) {
    for (const trackId of tracks) {
      for (let seed = from; seed <= to; seed += 1) {
        const result = await page.evaluate((opts) => Comeback.race(opts), { diff, trackId, seed, start, solidSpins: process.env.SOLID === "1" });
        out.push(result);
        process.stderr.write(`${diff} ${trackId} ${seed} ${start}${result.solidSpins ? " solid" : ""}: P${result.finish}\n`);
      }
    }
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ out, errors }));
  return { races: out.length, errors };
};
