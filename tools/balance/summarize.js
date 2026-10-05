// Tables from tools/balance/measure.js's JSON files:
//   node tools/balance/summarize.js back*.json pole*.json
// One row per start and difficulty: finishing places, the share of the race
// stuck behind a car, blocked episodes that ended without a pass, and the
// places each power-up gained in the 8 s after it was used.
const fs = require("fs");

const NAMES = ["Rookie", "Pro", "Legend"];
const rows = process.argv.slice(2).flatMap((file) => JSON.parse(fs.readFileSync(file, "utf8")).out);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const pct = (xs, ok) => Math.round((100 * xs.filter(ok).length) / xs.length);

for (const start of ["back", "pole"]) {
  for (let diff = 0; diff < NAMES.length; diff += 1) {
    const rs = rows.filter((r) => r.start === start && r.diff === diff);
    if (!rs.length) continue;
    const f = rs.map((r) => r.finish);
    const episodes = rs.reduce((s, r) => s + r.episodes, 0);
    const failed = rs.reduce((s, r) => s + r.failed, 0);
    const gains = {};
    rs.forEach((r) => r.itemGains.forEach((u) => { (gains[u.item] = gains[u.item] || []).push(u.gain); }));
    const items = Object.entries(gains).sort((a, b) => mean(b[1]) - mean(a[1]))
      .map(([id, g]) => `${id} ${mean(g) >= 0 ? "+" : ""}${mean(g).toFixed(1)}`).join(", ");
    console.log([
      `${start.padEnd(4)} ${NAMES[diff].padEnd(6)} n=${rs.length}`,
      `mean ${mean(f).toFixed(1)}`,
      `win ${pct(f, (x) => x === 1)}%`,
      `top3 ${pct(f, (x) => x <= 3)}%`,
      `top5 ${pct(f, (x) => x <= 5)}%`,
      `top10 ${pct(f, (x) => x <= 10)}%`,
      `places/lap ${mean(rs.map((r) => (r.startPlace - r.finish) / r.laps)).toFixed(2)}`,
      `stuck ${Math.round(100 * mean(rs.map((r) => r.stuckFrac)))}%`,
      `blocked-not-passed ${episodes ? Math.round((100 * failed) / episodes) : 0}%`,
    ].join(" | "));
    if (start === "back") console.log(`     items (places in 8 s): ${items}`);
  }
}
