// Browser check: the driver figure, dressed by the game's own code
// (docs/superpowers/specs/2026-10-01-driver-v2-design.md, and bareheaded,
// docs/superpowers/specs/2026-10-01-driver-faces-design.md). Loads the studio
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

  // Bareheaded (the default, as on the podium): each figure shows its own
  // face, read off the figure itself and checked against its look.
  const faces = await p.evaluate(() => window.preview.figures.map((f) => {
    const l = f.looks();
    const look = DRIVERS.find((d) => d.id === l.driverId).look;
    if (!look || !l.face || !window.Faces) return { id: l.driverId, missing: true, shown: [] };
    const want = window.Faces.morphWeights(look);
    const keysMatch = Object.keys(want).every((k) => Math.abs((l.face.keys[k] || 0) - want[k]) < 1e-6)
      && Object.keys(l.face.keys).every((k) => k in want);
    return {
      id: l.driverId,
      headwear: l.headwear,
      helmetShown: l.helmetShown,
      shown: l.face.shown,
      hair: l.face.hair,
      wantHair: look.hair.style,
      beard: l.face.beard,
      wantBeard: ["short_beard", "full_beard", "moustache"].includes(look.facialHair) ? look.facialHair : null,
      braids: look.hair.style === "braids",
      skin: l.face.skin,
      wantSkin: look.skin.toLowerCase(),
      keysMatch,
      browsMatch: JSON.stringify(l.face.brows) === JSON.stringify([look.brows.thickness, look.brows.arch, look.brows.tail, look.brows.gap]),
      volumeMatch: l.face.hairVolume === look.hair.volume,
    };
  }));
  results.bareByDefault = faces.every((f) => f.headwear === "none" && !f.helmetShown && f.shown.includes("head_skin")) || JSON.stringify(faces.map((f) => [f.id, f.headwear, f.helmetShown]));
  results.ownHairStyle = faces.every((f) => f.hair === f.wantHair) || JSON.stringify(faces.map((f) => [f.id, f.hair, f.wantHair]));
  results.ownFacialHair = faces.every((f) => f.beard === f.wantBeard && f.shown.includes("beard") === Boolean(f.wantBeard)) || JSON.stringify(faces.map((f) => [f.id, f.beard, f.wantBeard]));
  results.bunOnlyWithBraids = faces.every((f) => f.shown.includes("hair_bun") === f.braids) || JSON.stringify(faces.map((f) => [f.id, f.shown]));
  results.ownSkin = faces.every((f) => !f.missing && f.skin === f.wantSkin) || JSON.stringify(faces.map((f) => [f.id, f.skin, f.wantSkin]));
  results.ownBrowsAndHairVolume = faces.every((f) => f.browsMatch && f.volumeMatch) || JSON.stringify(faces.map((f) => [f.id, f.browsMatch, f.volumeMatch]));
  results.ownFaceShape = faces.every((f) => f.keysMatch) || JSON.stringify(faces.map((f) => [f.id, f.keysMatch]));
  // The hair, brows and beard really follow each face: drawn as stacked
  // layers, from positions of each figure's own, moved off the shared shell
  // by that driver's shape.
  results.hairFollowsEachFace = await p.evaluate(() => {
    const shells = window.preview.figures.map((f) => {
      let hair = null;
      f.model.traverse((n) => { if (n.isMesh && n.name === "hair") hair = n; });
      return hair;
    });
    if (shells.some((h) => !h || !h.visible)) return "a figure without its hair";
    if (!shells.every((h) => h.geometry.isInstancedBufferGeometry && h.geometry.instanceCount > 8)) return "the hair is not drawn in layers";
    const a = shells[0].geometry.attributes.position, b = shells[1].geometry.attributes.position;
    if (a === b) return "two figures share their hair's positions";
    let most = 0;
    for (let i = 0; i < a.count; i += 1) most = Math.max(most, Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i)));
    // Different faces, hair moved by millimetres to centimetres.
    return (most > 0.002 && most < 0.05) || most;
  });
  // Exactly so: each hair vertex sits where its head triangle's morphed
  // corners put it (the head's own morph targets and influences, blended by
  // the binding), and each eye where its keys move and scale it.
  results.hairOnTheMorphedHead = await p.evaluate(() => {
    let worst = 0;
    for (const f of window.preview.figures) {
      let head = null, hair = null;
      f.model.traverse((n) => { if (n.isMesh && n.name === "head_skin") head = n; if (n.isMesh && n.name === "hair") hair = n; });
      const vid = head.geometry.attributes._vid, morphs = head.geometry.morphAttributes.position;
      const row = new Map();
      for (let i = 0; i < vid.count; i += 1) row.set(Math.round(vid.getX(i)), i);
      const moved = (i, c) => head.morphTargetInfluences.reduce((n, w, k) => n + w * morphs[k].getComponent(i, c), 0);
      const src = hair.userData.sharedGeometry, pos = hair.geometry.attributes.position;
      for (let v = 0; v < src.attributes.position.count; v += 97) {
        for (let c = 0; c < 3; c += 1) {
          let want = src.attributes.position.getComponent(v, c);
          for (let k = 0; k < 3; k += 1) want += src.attributes._bary.getComponent(v, k) * moved(row.get(Math.round(src.attributes._bind.getComponent(v, k))), c);
          worst = Math.max(worst, Math.abs(want - pos.getComponent(v, c)));
        }
      }
    }
    return worst < 1e-5 || worst;
  });
  results.eyesFollowTheirKeys = await p.evaluate(() => {
    let worst = 0;
    for (const f of window.preview.figures) {
      const look = DRIVERS.find((d) => d.id === f.looks().driverId).look;
      const w = window.Faces.morphWeights(look);
      f.model.traverse((n) => {
        if (!n.isMesh || !n.parent || !n.parent.userData.eye_keys) return;
        const { eye_keys: keys, eye_centre: c } = n.parent.userData;
        const d = [0, 0, 0];
        let s = 1;
        Object.entries(keys).forEach(([k, v]) => { const x = w[k] || 0; d[0] += x * v[0]; d[1] += x * v[1]; d[2] += x * v[2]; s += x * v[3]; });
        const src = n.userData.sharedGeometry.attributes.position, pos = n.geometry.attributes.position;
        for (let i = 0; i < src.count; i += 13) {
          for (let k = 0; k < 3; k += 1) worst = Math.max(worst, Math.abs(c[k] + (src.getComponent(i, k) - c[k]) * s + d[k] - pos.getComponent(i, k)));
        }
      });
    }
    // And a bigger eye really is bigger: Leclerc's (eye_size up) against the
    // shared rest shape.
    let lec = null;
    window.preview.figures[0].model.traverse((n) => { if (n.isMesh && n.parent && n.parent.name === "eye_L" && n.material.name === "eye_sclera") lec = n; });
    lec.geometry.computeBoundingBox();
    const rest = lec.userData.sharedGeometry;
    rest.computeBoundingBox();
    const grew = (lec.geometry.boundingBox.max.z - lec.geometry.boundingBox.min.z) / (rest.boundingBox.max.z - rest.boundingBox.min.z);
    return (worst < 1e-6 && grew > 1.01) || JSON.stringify({ worst, grew });
  });

  // With the helmet on, as in the car: the helmet in the driver's own design,
  // and nothing of the face.
  const helmeted = await p.evaluate(async () => {
    const { buildDriver } = await import("../../r3d/driver.js");
    const car = await import("../../r3d/car.js");
    const d = DRIVERS.find((x) => x.id === "leclerc");
    const fig = buildDriver(d, getTeamForDriver(d), { headwear: "helmet" });
    const l = fig.looks();
    const out = { headwear: l.headwear, helmetShown: l.helmetShown, shown: l.face ? l.face.shown : null, ownHelmet: l.helmetTexture === car.helmetTexture(d).uuid };
    fig.dispose();
    return out;
  });
  results.helmetHidesTheFace = (helmeted.headwear === "helmet" && helmeted.helmetShown && helmeted.ownHelmet && Array.isArray(helmeted.shown) && helmeted.shown.length === 0) || JSON.stringify(helmeted);

  // Every driver's head, in the studio's grid: twenty figures, no errors.
  await p.goto(`http://localhost:8765/tools/preview/driver.html?grid=1&t=0.5&${Date.now()}`);
  await p.waitForFunction(() => window.preview && (window.preview.ready || window.preview.error), null, { timeout: 60000 });
  results.gridOfTwenty = await p.evaluate(() => (window.preview.ready && window.preview.figures.length === 20 && new Set(window.preview.looks().map((l) => l.face && l.face.hair)).size >= 6) || window.preview.error || window.preview.figures.length);

  await context.close();
  return { results, errors };
}
