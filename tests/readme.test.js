const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const lineOf = (index) => readme.slice(0, index).split("\n").length;

test("the README has no emoji: its pictures are icon files", () => {
  // The copyright sign of OpenStreetMap's credit is text, not an emoji.
  const found = [...readme.matchAll(/\p{Extended_Pictographic}|\p{Regional_Indicator}|️|‍/gu)].filter((m) => m[0] !== "©");
  assert.deepEqual(found.map((m) => `line ${lineOf(m.index)}: U+${m[0].codePointAt(0).toString(16)}`), []);
});

test("the README has no em dash and no en dash", () => {
  const found = [...readme.matchAll(/[‒–—―]/g)];
  assert.deepEqual(found.map((m) => `line ${lineOf(m.index)}`), []);
});

test("every picture, icon and file the README points at is in the repo", () => {
  const local = (target) => !/^(https?:|mailto:|#)/.test(target);
  const targets = [
    ...[...readme.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
    ...[...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
  ].filter(local).map((t) => t.split("#")[0]);
  assert.ok(targets.some((t) => t.startsWith("docs/readme/icons/")), "the README uses its icons");
  const missing = [...new Set(targets)].filter((t) => !fs.existsSync(path.join(root, t)));
  assert.deepEqual(missing, []);
});

test("the README's anchors lead to its own headings", () => {
  // GitHub's slugs: lower case, punctuation dropped, spaces to hyphens (a
  // heading that opens with an icon keeps the space after it: no link may
  // count on such a heading).
  const slugs = [...readme.matchAll(/^#{1,4} (.+)$/gm)].map((m) => m[1].toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-"));
  const anchors = [...readme.matchAll(/(?:href="|\]\()#([^")]+)/g)].map((m) => m[1]);
  assert.ok(anchors.length > 5);
  assert.deepEqual(anchors.filter((a) => !slugs.includes(a)), []);
});

test("the icons are the ones tools/readme/build-icons.js draws, and every one is used", () => {
  const { icons } = require("../tools/readme/build-icons.js");
  const dir = path.join(root, "docs", "readme", "icons");
  const built = icons();
  assert.deepEqual(fs.readdirSync(dir).sort(), Object.keys(built).map((id) => `${id}.svg`).sort());
  Object.entries(built).forEach(([id, svg]) => {
    assert.equal(fs.readFileSync(path.join(dir, `${id}.svg`), "utf8"), svg, `${id}.svg is stale: run node tools/readme/build-icons.js`);
    // Colours inside the file (GitHub strips CSS), and no script.
    assert.doesNotMatch(svg, /<style|<script|class=/, id);
    assert.ok(readme.includes(`docs/readme/icons/${id}.svg`), `${id}.svg is not used in the README`);
  });
});

test("the hero picture is a link to the production site", () => {
  assert.match(readme, /<a href="https:\/\/f1-pixel-cup\.vercel\.app">\s*<img src="docs\/readme\/hero\.jpg"/);
});

test("every README picture is used, and none is oversized", () => {
  const dir = path.join(root, "docs", "readme");
  fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).forEach((f) => {
    assert.ok(readme.includes(`docs/readme/${f}`), `${f} is not used in the README`);
    assert.ok(fs.statSync(path.join(dir, f)).size < 450 * 1024, `${f} is over 450 KB`);
  });
});

test("the README's counts are the data's", () => {
  const { CIRCUITS, DRIVERS, TEAMS, CUP_DEFS, POWER_UPS } = require("../game-data.js");
  const checks = fs.readFileSync(path.join(root, "tools", "checks", "run-all.js"), "utf8").match(/globalThis\.CHECKS \|\| "([^"]+)"/)[1].split(",");
  assert.ok(readme.includes(`${checks.length} browser checks`), `run-all.js lists ${checks.length} checks`);
  // The badge and the text give the same counts (the Node count itself is
  // the run's: a test cannot count the run it is part of).
  const badge = readme.match(/badge\/tests-(\d+)_Node_%C2%B7_(\d+)_browser_checks-/);
  assert.ok(badge, "the tests badge");
  assert.equal(Number(badge[2]), checks.length);
  assert.ok(readme.includes(`runs ${badge[1]} Node tests`), "the text gives the badge's Node count");
  const anthems = Object.keys(require("../anthem-data.js")).length;
  assert.ok(readme.includes(`badge/podium_anthems-${anthems}-`), `${anthems} anthems`);
  assert.ok(readme.includes(`**${anthems} anthems for all ${DRIVERS.length} drivers:**`));
  assert.ok(readme.includes(`badge/circuits-${CIRCUITS.length}-`));
  assert.ok(readme.includes(`badge/drivers-${DRIVERS.length}-`));
  assert.ok(readme.includes(`badge/cups-${CUP_DEFS.length}_+_a_season-`));
  assert.ok(readme.includes(`badge/power--ups-${POWER_UPS.length}-`));
  assert.ok(readme.includes(`${DRIVERS.length} drivers, ${TEAMS.length} teams`));
  // Every circuit's lap length and rain odds, as the table gives them.
  CIRCUITS.forEach((c) => {
    const row = `| ${(c.lengthM / 1000).toFixed(3)} km | ${Math.round(c.rainChance * 100)}% |`;
    const line = readme.split("\n").find((l) => l.includes(row) && l.includes(c.short));
    assert.ok(line, `${c.id}: a row naming ${c.short} with ${row}`);
  });
  assert.equal((readme.match(/^\| .* km \| \d+% \|/gm) || []).length, CIRCUITS.length);
});

test("players are P1 and P2", () => {
  assert.doesNotMatch(readme, /\b[12]P\b/);
});

test("the paths the README names in code spans are in the repo", () => {
  const spans = [...readme.matchAll(/`((?:tools|tests|docs|assets|r3d)\/[\w./-]+|[\w-]+\.(?:js|py|html|mjs))`/g)].map((m) => m[1]);
  assert.ok(spans.length > 10);
  const known = (t) => fs.existsSync(path.join(root, t)) || fs.existsSync(path.join(root, "tools", "tracks", t)) || fs.existsSync(path.join(root, "docs", "readme", t));
  assert.deepEqual([...new Set(spans)].filter((t) => !known(t)), []);
});
