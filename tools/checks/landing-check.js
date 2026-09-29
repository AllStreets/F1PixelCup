// Browser check for index.html (landing page). Run with the Playwright MCP
// tool browser_run_code_unsafe, filename: tools/checks/landing-check.js.
// Power-ups expected: puCards 8, puOrder true, puCopyMatches true, puOddsRows 8,
// puOddsCell true, navLink 1, puPhoneOneColumn true, puPhoneOddsAsList true.
async (page) => {
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
  await p.evaluate(() => localStorage.removeItem("f1pixelcup.profile"));
  await p.reload();
  await p.waitForTimeout(1200);
  out.threeLoaded = await p.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("three")));
  out.circuits = await p.locator("#circuits .circuit-card").count();
  out.maps = await p.locator("#circuits .circuit-card svg path.track").count();
  out.teams = await p.locator("#grid .team-card").count();
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

  await p.evaluate(() => localStorage.setItem("f1pixelcup.profile", JSON.stringify({ version: 1, careerPoints: 276, rating: 1309, ratedRaces: 4,
    totals: { races: 4, wins: "<img src=x onerror=window.__xss=1>", podiums: 4, cupsCompleted: 1, cupsWon: 1 },
    bestLaps: { monza: { ms: 36280 } }, history: [] })));
  await p.reload();
  await p.waitForTimeout(1000);
  const summary = await p.locator("#career-summary").innerText();
  out.returning = summary.includes("1309") && summary.includes("0:36.28");
  out.xss = await p.evaluate(() => window.__xss === undefined);
  out.careerLink = await p.locator("#career a[href*='play.html#career']").count();

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
  await phone.close();
  return { ...out, errors };
}
