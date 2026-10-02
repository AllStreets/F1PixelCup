// Browser check for index.html (landing page). Run with the Playwright MCP
// tool browser_run_code_unsafe, filename: tools/checks/landing-check.js.
// Power-ups expected: puCards 8, puOrder true, puCopyMatches true, puOddsRows 8,
// puOddsCell true, tracksideShots true, navLink 1, puPhoneOneColumn true, puPhoneOddsAsList true, gridHowTo true,
// yourDrivers, latestByRace, v1Split, v1LeftAlone, shotsSpanTheGrid, cardsShowNewIcons and heroFromData true;
// driverCards 20, teamCards 10, and every other grid-page value true. threeLoaded false
// (the site never loads the 3D engine); every noSideScroll true; errors [].
// Returns { results, errors } (the shared convention of every check in tools/checks).
async (page) => {
  // Keep the test tool's own empty tab (about:blank) out of the way.
  try {
    const own = await page.context().newCDPSession(page);
    const { windowId: ownWindow } = await own.send("Browser.getWindowForTarget");
    await own.send("Browser.setWindowBounds", { windowId: ownWindow, bounds: { windowState: "minimized" } });
  } catch (e) { /* not fatal */ }
  const errors = [];
  const out = {};
  const context = await page.context().browser().newContext({ viewport: null });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(p);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const size = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await p.waitForTimeout(400);
  };
  const noSideScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

  await size(1440, 900);
  await p.goto(`http://localhost:8765/?${Date.now()}`);
  // Every saved profile, the v1 one and any backups included.
  const clearProfiles = () => p.evaluate(() => Object.keys(localStorage)
    .filter((k) => k.startsWith("f1pixelcup.profile")).forEach((k) => localStorage.removeItem(k)));
  await clearProfiles();
  await p.reload();
  await p.waitForTimeout(1200);
  out.threeLoaded = await p.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("three")));
  out.circuits = await p.locator("#circuits .circuit-card").count();
  out.maps = await p.locator("#circuits .circuit-card svg path.track").count();
  out.teams = await p.locator("#grid .team-card").count();
  // The trackside world: six screenshots, every one loaded, each with its alt
  // text and caption, linked from the top bar.
  out.tracksideShots = await p.evaluate(async () => {
    const imgs = [...document.querySelectorAll("#trackside .trackside-card img")];
    imgs.forEach((i) => { i.loading = "eager"; });
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    const ok = imgs.length === 6 && imgs.every((i) => i.naturalWidth > 0 && i.alt.length > 20 && i.closest("figure").querySelector("figcaption b"));
    return ok && document.querySelectorAll('nav a[href="#trackside"]').length === 1 || imgs.map((i) => `${i.src.split("/").pop()}:${i.naturalWidth}`).join(",");
  });
  out.newPlayer = (await p.locator("#career-summary").innerText()).toLowerCase().includes("starts");
  out.heroImage = await p.evaluate(() => { const i = document.querySelector("#hero img"); return Boolean(i) && i.complete && i.naturalWidth > 0; });
  out.playHref = await p.locator("#hero a.go-btn").getAttribute("href");
  out.noSideScroll1440 = await noSideScroll();
  out.puCards = await p.locator("#power-ups .pu-card").count();
  out.puOrder = (await p.locator("#power-ups .pu-card").evaluateAll((els) => els.map((e) => e.dataset.id)).then((ids) => ids.join(","))) === await p.evaluate(() => PowerUps.ITEM_ORDER.join(","));
  out.puCopyMatches = await p.evaluate(() => [...document.querySelectorAll("#power-ups .pu-card")].every((card) => {
    const d = POWER_UPS.find((x) => x.id === card.dataset.id);
    return card.querySelector(".pu-name").textContent === d.name
      && card.querySelector(".pu-counterpart").textContent.includes(d.counterpart)
      && card.querySelector(".pu-effect").textContent === d.effect
      && card.querySelector(".pu-controls").textContent === d.controls
      && card.querySelector(".pu-icon svg") !== null
      && card.querySelector(".pu-rarity").textContent === PowerUps.rarityFor(PowerUps.overallShares()[d.id]);
  }));
  out.puOddsRows = await p.locator("#power-ups table.pu-odds tbody tr").count();
  out.puOddsCell = await p.evaluate(() => document.querySelector('#power-ups table.pu-odds tr[data-id="safetyCar"] td[data-col="tail"]').textContent.trim() === "9%");
  out.navLink = await p.locator('nav a[href="#power-ups"]').count();
  // The promo shots show the whole grid: each alt text names its driver and
  // team (from SHOT_DRIVERS), Leclerc first and Hamilton second, and each set
  // spans six teams or more.
  out.shotsSpanTheGrid = await p.evaluate(() => {
    const teamsIn = (sel) => [...document.querySelectorAll(sel)].map((img) => {
      const driver = DRIVERS.find((d) => img.alt.startsWith(`${d.name}'s `));
      return driver ? driver.teamId : null;
    });
    const firstTwo = (sel) => [...document.querySelectorAll(sel)].slice(0, 2).map((img) => img.alt.split("'s")[0]);
    const sets = ["#circuits .circuit-shot img", "#power-ups .pu-shot img"];
    return sets.every((sel) => {
      const teams = teamsIn(sel);
      return teams.length === 8 && teams.every(Boolean) && new Set(teams).size >= 6
        && firstTwo(sel).join("|") === "Charles Leclerc|Lewis Hamilton";
    });
  });
  // The cards show the new icons (the broadcast style's own tile), and the
  // hero's caption names the driver the picture was taken with.
  out.cardsShowNewIcons = await p.evaluate(() => [...document.querySelectorAll("#power-ups .pu-card")].every((card) => {
    const svg = card.querySelector(".pu-icon svg");
    return svg && svg.querySelector(`linearGradient#tile-${card.dataset.id}`) && svg.getAttribute("width") === "64";
  }));
  out.heroFromData = await p.evaluate(() => document.querySelector("#hero img").alt.startsWith(`${DRIVERS.find((d) => d.id === SHOT_DRIVERS.hero).name}'s Ferrari`));
  out.gridHowTo = await p.evaluate(() => { const t = document.getElementById("grid-howto").textContent; return t.includes("From the back") && t.includes("Qualifying") && t.includes("pole 10"); });

  await clearProfiles();
  await p.evaluate(() => localStorage.setItem("f1pixelcup.profile", JSON.stringify({ version: 1, careerPoints: 276, rating: 1309, ratedRaces: 4,
    totals: { races: 4, wins: "<img src=x onerror=window.__xss=1>", podiums: 4, cupsCompleted: 1, cupsWon: 1, poles: 2 },
    bestLaps: { monza: { ms: 36280 } }, history: [] })));
  await p.reload();
  await p.waitForTimeout(1000);
  const summary = await p.locator("#career-summary").innerText();
  out.returning = summary.includes("1309") && summary.includes("0:36.280") && /Poles\s*2/i.test(summary);
  out.xss = await p.evaluate(() => window.__xss === undefined);
  // An old save with no drivers on record is Leclerc's; the link opens his career.
  out.careerLink = await p.locator("#career a[href='./play.html?driver=leclerc#career']").count();

  // One career per driver: the latest driver leads (here the lower-rated one),
  // the others follow.
  await clearProfiles();
  await p.evaluate(() => localStorage.setItem("f1pixelcup.profile.v2", JSON.stringify({ version: 2, profileId: "p", lastDriverId: "hamilton",
    drivers: {
      leclerc: { driverId: "leclerc", careerPoints: 184, rating: 1352, ratedRaces: 6, totals: { races: 6, wins: 2, podiums: 4, cupsCompleted: 1, cupsWon: 1, poles: 3 },
        bestLaps: { monaco: { ms: 18950.4 } }, history: [{ type: "race", at: "2026-09-28T10:00:00.000Z" }] },
      hamilton: { driverId: "hamilton", careerPoints: 40, rating: 1244, ratedRaces: 2, totals: { races: 2, wins: 0, podiums: 1, cupsCompleted: 0, cupsWon: 0, poles: 0 }, bestLaps: {}, history: [] },
    } })));
  await p.reload();
  await p.waitForTimeout(1000);
  const drivers = await p.locator("#career-summary").innerText();
  out.yourDrivers = /Latest · Lewis Hamilton/i.test(drivers) && drivers.includes("1244")
    && /Your other drivers[\s\S]*Charles Leclerc[\s\S]*1352/i.test(drivers)
    && await p.locator("#career a[href='./play.html?driver=hamilton#career']").count() === 1;

  // No driver on record as the last: the one with the latest race leads.
  await p.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("f1pixelcup.profile.v2"));
    saved.lastDriverId = null;
    saved.drivers.hamilton.history = [{ type: "race", at: "2026-09-29T10:00:00.000Z" }];
    localStorage.setItem("f1pixelcup.profile.v2", JSON.stringify(saved));
  });
  await p.reload();
  await p.waitForTimeout(800);
  out.latestByRace = /Latest · Lewis Hamilton/i.test(await p.locator("#career-summary").innerText());

  // A shared v1 career raced with two drivers is split on the landing page too,
  // and the v1 save is left exactly as it was.
  await clearProfiles();
  const v1 = JSON.stringify({ version: 1, profileId: "old", careerPoints: 72, rating: 1250, ratedRaces: 2,
    totals: { races: 2, wins: 1, podiums: 1 }, bestLaps: {}, history: [
      { id: "a", type: "race", at: "2026-09-20T10:00:00.000Z", trackId: "monza", difficulty: "pro", driverId: "leclerc", position: 1, fieldSize: 20, careerPointsEarned: 52 },
      { id: "b", type: "race", at: "2026-09-21T10:00:00.000Z", trackId: "spa", difficulty: "pro", driverId: "hamilton", position: 9, fieldSize: 20, careerPointsEarned: 20 },
    ] });
  await p.evaluate((raw) => localStorage.setItem("f1pixelcup.profile", raw), v1);
  await p.reload();
  await p.waitForTimeout(800);
  const split = await p.locator("#career-summary").innerText();
  out.v1Split = /Latest · Lewis Hamilton/i.test(split) && /Charles Leclerc[\s\S]*52 pts · 1 race\b/i.test(split);
  out.v1LeftAlone = await p.evaluate((raw) => localStorage.getItem("f1pixelcup.profile") === raw
    && JSON.parse(localStorage.getItem("f1pixelcup.profile.v2")).version === 2, v1);
  await clearProfiles();

  for (const [w, h] of [[1000, 700], [1900, 760], [560, 800]]) {
    await size(w, h);
    out[`noSideScroll${w}`] = await noSideScroll();
    if (w === 560) {
      out.puPhoneOneColumn = await p.evaluate(() => {
        const cards = [...document.querySelectorAll("#power-ups .pu-card")];
        return cards.length === 8 && new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size === 1;
      });
      out.puPhoneOddsAsList = await p.evaluate(() => getComputedStyle(document.querySelector("#power-ups table.pu-odds thead")).display === "none");
    }
  }

  // Shots missing: every card must fall back cleanly. The browser logs each
  // blocked image as an error; those are expected and counted separately.
  const errorsBeforeBlock = errors.length;
  await p.route("**/assets/shots/**", (route) => route.abort());
  await p.reload();
  await p.waitForTimeout(1200);
  out.brokenImagesVisible = await p.evaluate(() => [...document.querySelectorAll("img")].filter((i) => i.getClientRects().length && i.complete && i.naturalWidth === 0).length);
  await p.unroute("**/assets/shots/**");
  out.blockedImageErrors = errors.splice(errorsBeforeBlock).filter((e) => e.includes("ERR_FAILED")).length;
  await context.close();

  // Phone-sized, touch-only (smaller than the window, so nothing is cropped).
  const phone = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const q = await phone.newPage();
  q.on("pageerror", (e) => errors.push(String(e)));
  await q.goto(`http://localhost:8765/?${Date.now()}`);
  await q.waitForTimeout(1000);
  out.phoneNoSideScroll = await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await q.locator("#hero a.go-btn").click();
  await q.waitForTimeout(300);
  out.phoneNote = await q.evaluate(() => { const n = document.getElementById("phone-play-note"); return Boolean(n) && n.open === true; });
  out.phoneStayed = !q.url().includes("play.html");
  // The grid pages at phone width: no side scroll, one card per row, and a
  // visible way to the other page (the top nav is hidden on phones).
  for (const page of ["drivers", "teams"]) {
    await q.goto(`http://localhost:8765/${page}.html?${Date.now()}`);
    await q.waitForTimeout(900);
    out[`${page}PhoneNoSideScroll`] = await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    out[`${page}PhoneOneColumn`] = await q.evaluate(() => {
      const cards = [...document.querySelectorAll(".driver-card, #team-cards .team-card")];
      return cards.length > 0 && new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size === 1;
    });
    const other = page === "drivers" ? "teams" : "drivers";
    out[`${page}PhoneCrossLink`] = await q.evaluate((other) => {
      const a = document.querySelector(`.grid-links a[href="./${other}.html"]`);
      return Boolean(a) && a.getClientRects().length > 0;
    }, other);
  }
  await phone.close();

  // The grid pages: every card, every picture, the numbers from the data, the
  // footer's notice and credit on every site page, and the way between them.
  {
    const ctx = await page.context().browser().newContext({ viewport: null });
    const g = await ctx.newPage();
    g.on("pageerror", (e) => errors.push(String(e)));
    const gcdp = await ctx.newCDPSession(g);
    const { windowId: gw } = await gcdp.send("Browser.getWindowForTarget");
    await gcdp.send("Browser.setWindowBounds", { windowId: gw, bounds: { windowState: "normal" } });
    await gcdp.send("Browser.setWindowBounds", { windowId: gw, bounds: { width: 1440, height: 900 } });
    const footerOk = () => g.evaluate(() => {
      const f = document.querySelector("footer.footer");
      return Boolean(f) && /not affiliated with Formula 1, the FIA or the teams/i.test(f.textContent)
        && Boolean(f.querySelector('a[href="https://github.com/f1db/f1db"]'))
        && Boolean(f.querySelector('a[href="https://creativecommons.org/licenses/by/4.0/"]')) && /Marcel Overdijk/.test(f.textContent);
    });
    // Every picture loads: each scrolled into view (they're lazy), with a
    // time limit so a stuck image fails rather than hangs.
    const imagesOk = () => g.evaluate(async () => {
      const imgs = [...document.querySelectorAll("main img")];
      for (const i of imgs) {
        i.scrollIntoView({ block: "center" });
        if (!i.complete) await Promise.race([new Promise((r) => { i.onload = i.onerror = r; }), new Promise((r) => setTimeout(r, 4000))]);
      }
      window.scrollTo(0, 0);
      return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    });
    await g.goto(`http://localhost:8765/drivers.html?${Date.now()}`);
    await g.waitForTimeout(1200);
    out.driverCards = await g.locator(".driver-card").count();
    out.driverImages = await imagesOk();
    out.driverOrder = await g.evaluate(() => [...document.querySelectorAll(".driver-card h2")].slice(0, 2).map((h) => h.textContent).join("|") === "Charles Leclerc|Lewis Hamilton");
    // Known facts, stated literally: Norris, champion on 423; Tsunoda moved to
    // Red Bull; Antonelli's career to the end of 2025 has no wins.
    out.driverFacts = await g.evaluate(() => {
      const card = (id) => document.querySelector(`.driver-card[data-id="${id}"]`).textContent;
      return /423 pts/.test(card("norris")) && /2025 World Champion/.test(card("norris"))
        && /Red Bull in rounds 3–24/.test(card("tsunoda")) && /Career to the end of 2025: 24 starts · 0 wins/.test(card("antonelli"));
    });
    out.driversFooter = await footerOk();
    await g.goto(`http://localhost:8765/teams.html?${Date.now()}`);
    await g.waitForTimeout(1200);
    out.teamCards = await g.locator("#team-cards .team-card").count();
    out.teamImages = await imagesOk();
    out.teamsFooter = await footerOk();
    // The way between the pages works: the cross-link and the top nav.
    await g.locator('.grid-links a[href="./drivers.html"]').click();
    await g.waitForURL(/drivers\.html/);
    await g.waitForTimeout(600);
    const onDrivers = await g.locator(".driver-card").count();
    await g.locator('.topnav a[href="./teams.html"]').click();
    await g.waitForURL(/teams\.html/);
    await g.waitForTimeout(600);
    out.gridNav = (onDrivers === 20 && await g.locator("#team-cards .team-card").count() === 10
      && await g.evaluate(() => document.querySelector('.topnav a[aria-current="page"]').getAttribute("href") === "./teams.html")) || "nav failed";
    // Without its data, a page says so instead of sitting empty.
    await g.route("**/assets/data/grid-2025.js*", (route) => route.abort());
    await g.goto(`http://localhost:8765/drivers.html?${Date.now()}`);
    await g.waitForTimeout(600);
    out.gridDataMissingSaysSo = await g.evaluate(() => /didn.t load/.test(document.getElementById("driver-cards").textContent));
    await g.unrouteAll({ behavior: "ignoreErrors" });
    await g.goto(`http://localhost:8765/?${Date.now()}`);
    await g.waitForTimeout(800);
    out.indexFooter = await footerOk();
    out.indexLinksToPages = await g.evaluate(() => Boolean(document.querySelector('#grid a[href="./drivers.html"]')) && Boolean(document.querySelector('#grid a[href="./teams.html"]')));
    await ctx.close();
  }
  return { results: out, errors };
}
