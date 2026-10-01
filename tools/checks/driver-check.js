// Browser check: the driver figure, dressed by the game's own code
// (docs/superpowers/specs/2026-10-01-driver-v2-design.md). Loads the studio
// (tools/preview/driver.html) with Leclerc, Hamilton and Russell. Run with the
// Playwright MCP tool browser_run_code_unsafe, filename:
// tools/checks/driver-check.js, dev server on http://localhost:8765.
// Expected: every value in `results` true, errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  const errors = [];
  const results = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`http://localhost:8765/tools/preview/driver.html?drivers=leclerc,hamilton,russell&${Date.now()}`);
  await p.waitForFunction(() => window.preview && (window.preview.ready || window.preview.error), null, { timeout: 30000 });
  results.loads = await p.evaluate(() => window.preview.ready || window.preview.error);

  const looks = await p.evaluate(() => window.preview.looks());
  const by = Object.fromEntries(looks.map((l) => [l.driverId, l]));
  // Ferrari race in the car's red with its yellow trim; Mercedes in black with teal.
  results.ferrariSuit = by.leclerc.suit === "#d40000" && by.hamilton.suit === "#d40000" && by.leclerc.trim === "#ffe000" || JSON.stringify([by.leclerc.suit, by.leclerc.trim]);
  results.mercedesSuit = by.russell.suit === "#17191c" && by.russell.trim === "#00d2be" || JSON.stringify([by.russell.suit, by.russell.trim]);
  results.ownHelmets = new Set(looks.map((l) => l.helmetTexture)).size === 3 && looks.every((l) => l.helmetTexture);
  // The same texture the car's helmet wears (one per driver, shared).
  results.helmetIsTheCarsTexture = await p.evaluate(async () => {
    const car = await import("../../r3d/car.js");
    return window.preview.figures.every((f) => {
      const id = f.looks().driverId;
      return car.helmetTexture(DRIVERS.find((d) => d.id === id)).uuid === f.looks().helmetTexture;
    });
  });

  // Every pose plays: the right hand ends up somewhere different in each, and
  // only the pose's own prop shows.
  const poses = await p.evaluate(() => {
    const out = {};
    const fig = window.preview.figures[0];
    const world = (name) => {
      const v = fig.model.getObjectByName(name).getWorldPosition(new fig.model.position.constructor());
      return [v.x, v.y, v.z].map((n) => Math.round(n * 100) / 100);
    };
    ["stand", "wave", "arms_up", "trophy", "spray"].forEach((pose) => {
      fig.play(pose, 0);
      fig.update(0.5);
      fig.model.updateMatrixWorld(true);
      out[pose] = { hand: world("hand_R"), props: fig.looks().props, pose: fig.pose() };
    });
    return out;
  });
  const hands = Object.values(poses).map((x) => x.hand.join(","));
  results.everyPoseMovesTheHand = new Set(hands).size === 5 || JSON.stringify(poses);
  results.armsUpRaisesTheHand = poses.arms_up.hand[1] > 1.9 && poses.stand.hand[1] < 1.0 || JSON.stringify([poses.arms_up.hand, poses.stand.hand]);
  results.trophyOnlyInTrophy = Object.entries(poses).every(([k, v]) => v.props.trophy === (k === "trophy"));
  results.bottleOnlyInSpray = Object.entries(poses).every(([k, v]) => v.props.bottle === (k === "spray"));
  // Every skinned vertex stays attached: the body's bounds in arms_up reach over the head.
  results.bodyFollowsTheRig = await p.evaluate(() => {
    const fig = window.preview.figures[0];
    // One skinned mesh per material of the body (suit, trim, gloves, balaclava).
    const parts = [];
    fig.model.traverse((n) => { if (n.isSkinnedMesh) parts.push(n); });
    if (!parts.length) return "no skinned body";
    fig.play("arms_up", 0);
    fig.update(0.5);
    fig.model.updateMatrixWorld(true);
    // (The bone matrices are refreshed at render time; refresh them here.)
    let top = -Infinity;
    parts.forEach((m) => {
      m.skeleton.update();
      m.computeBoundingBox();
      top = Math.max(top, m.boundingBox.max.y);
    });
    // At rest (an A-pose) the body tops out at the neck, about 1.65 m.
    return top > 1.85 || top;
  });

  await context.close();
  return { results, errors };
}
