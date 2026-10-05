const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("the repo carries the MIT license text", () => {
  const text = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
  assert.match(text, /^MIT License/);
  assert.match(text, /Copyright \(c\) 2026 AllStreets/);
  assert.match(text, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);
});

test("the README and the site footer point at the license", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /\[MIT License\]\(LICENSE\)/);
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, /<footer[\s\S]*href="https:\/\/github\.com\/AllStreets\/F1PixelCup\/blob\/main\/LICENSE"[\s\S]*<\/footer>/);
});

test("third-party notices carry each upstream licence and are linked from the README", () => {
  const text = fs.readFileSync(path.join(root, "THIRD-PARTY-NOTICES"), "utf8");
  assert.match(text, /Copyright \(c\) 2019-2025 Tomislav Bacinger/);
  assert.match(text, /Copyright © 2010-2026 three\.js authors/);
  assert.match(text, /Copyright \(C\) 2016-2026, by Arseny Kapoulkine/);
  // Each MIT licence in full: the circuits, three.js, meshoptimizer's decoder.
  assert.equal((text.match(/Permission is hereby granted, free of charge/g) || []).length, 3);
  assert.match(text, /Poly Haven[\s\S]*CC0/);
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /\[THIRD-PARTY-NOTICES\]\(THIRD-PARTY-NOTICES\)/);
});
