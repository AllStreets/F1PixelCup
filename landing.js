// Landing page: builds the circuits, career and grid sections from the game's
// own data, and warns phones before sending them into a keyboard game.
(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const $ = (id) => document.getElementById(id);

  function lapTime(ms) {
    if (!ms || ms <= 0) return "—";
    const total = Math.round(ms) / 1000;
    const minutes = Math.floor(total / 60);
    return `${minutes}:${(total - minutes * 60).toFixed(3).padStart(6, "0")}`;
  }

  // A missing shot leaves a styled panel, never a broken-image icon.
  function guardImages() {
    document.querySelectorAll("img").forEach((img) => {
      const fail = () => {
        const holder = img.closest(".hero, .circuit-shot, .season-shot, .team-shot, .pu-shot");
        if (holder) holder.classList.add("no-shot");
        img.remove();
      };
      if (img.complete && img.naturalWidth === 0) fail();
      else img.addEventListener("error", fail, { once: true });
    });
  }

  // The calendar as the game races it: the six cups in order, four rounds
  // each, then the season that runs all 24.
  function renderCircuits() {
    const round = (id) => CIRCUITS.findIndex((c) => c.id === id) + 1;
    const card = (c) => {
      const map = TrackMap.path((TRACK_SHAPES[c.id] || {}).points || [], { width: 96, height: 72, padding: 6 });
      const start = map.start ? `<circle class="start" cx="${map.start.x}" cy="${map.start.y}" r="4"></circle>` : "";
      return `
        <article class="circuit-card" data-circuit="${esc(c.id)}">
          <div class="circuit-shot"><img src="./assets/shots/circuit-${esc(c.id)}.jpg" alt="${esc(shotCar(SHOT_DRIVERS.circuits[c.id]))} at ${esc(c.name)}" loading="lazy"><span class="circuit-round">R${num(round(c.id))}</span></div>
          <div class="circuit-body">
            <div>
              <h3>${esc(c.name)}</h3>
              <div class="circuit-meta">${esc(c.country)} · ${(c.lengthM / 1000).toFixed(3)} km · ${num(c.laps)} laps</div>
            </div>
            <svg class="circuit-map" viewBox="${map.viewBox}" role="img" aria-label="Map of ${esc(c.name)}"><path class="track" d="${map.d}"></path>${start}</svg>
          </div>
        </article>`;
    };
    const cups = CUP_DEFS.map((cup, i) => {
      const circuits = cup.circuitIds.map((id) => CIRCUITS.find((c) => c.id === id)).filter(Boolean);
      const first = round(cup.circuitIds[0]);
      return `
        <section class="cup-group" aria-label="${esc(cup.name)}">
          <header class="cup-head">
            <span class="cup-number">${num(i + 1)}</span>
            <h3 class="cup-name it-title">${esc(cup.name)}</h3>
            <span class="cup-rounds">Rounds ${num(first)} to ${num(first + circuits.length - 1)} · ${esc(circuits.map((c) => c.country).join(", "))}</span>
          </header>
          <div class="circuit-list">${circuits.map(card).join("")}</div>
        </section>`;
    }).join("");
    // The circuits the game lights with floodlights all the way round (venue.js).
    const lit = window.Venue ? Venue.FLOODLIT.filter((id) => CIRCUITS.some((c) => c.id === id)).length : 0;
    $("circuit-list").innerHTML = `${cups}
      <aside class="season-card">
        <div class="season-shot"><img src="./assets/shots/season.jpg" alt="The pit lane with a 2025 Season saved: resume at race 2 of 24" loading="lazy"></div>
        <div class="season-copy">
        <p class="kicker">Or race them all</p>
        <h3 class="it-title">${esc(SEASON.name)}</h3>
        <p>All ${num(SEASON.circuitIds.length)} rounds in calendar order, for the drivers' and the constructors' titles. Points as the cups score them, ties split on countback, and the season is saved after every race: quit at round 9 and it is waiting at round 9.</p>
        <ul class="season-facts">
          <li><b>${num(SEASON.circuitIds.length)}</b><span>rounds</span></li>
          <li><b>${num(CUP_DEFS.length)}</b><span>cups of four</span></li>
          ${lit ? `<li><b>${num(lit)}</b><span>under floodlights</span></li>` : ""}
        </ul>
        <a class="go-btn" href="./play.html"><span>Start the season ›</span></a>
        </div>
      </aside>`;
  }

  // "Lando Norris's McLaren": who is in a promo shot (SHOT_DRIVERS, game-data.js).
  function shotCar(driverId) {
    const driver = DRIVERS.find((d) => d.id === driverId);
    if (!driver) return "A car";
    const team = TEAMS.find((t) => t.id === driver.teamId);
    return `${driver.name}'s ${team ? team.short : "car"}`;
  }

  // Your drivers: every driver has their own career. The one raced most
  // recently leads (Leclerc before any racing); the others follow in a row each.
  function renderCareer() {
    let list = [];
    let lastId = null;
    try {
      list = window.Career ? Career.listDrivers() : [];
      lastId = window.Career ? Career.lastDriverId() : null;
    } catch (error) {
      list = [];
    }
    const nameOf = (id) => (DRIVERS.find((d) => d.id === id) || { name: id }).name;
    if (list.length === 0) {
      $("career-summary").innerHTML = `
        <div><span class="career-tier">F4</span></div>
        <p>Every driver has their own career, and each one starts at <strong>1200 · F4</strong>. Race as Leclerc and it's Leclerc's career that climbs — his points, rating, poles and best lap on every circuit — while Hamilton's waits for you. Saved in this browser.</p>
        <p><a class="go-btn" href="./play.html"><span>Start your first career ›</span></a></p>`;
      return;
    }
    // The driver raced most recently: as recorded, or else by their latest race.
    const byLatestRace = [...list].sort((a, b) => String(b.lastRaceAt || "").localeCompare(String(a.lastRaceAt || "")))[0];
    const leadId = list.some((d) => d.driverId === lastId) ? lastId : byLatestRace.driverId;
    const lead = Career.getDriver(leadId);
    const totals = lead.totals || {};
    const rating = num(lead.rating);
    const stats = [
      ["Rating", rating],
      ["Career points", num(lead.careerPoints).toLocaleString()],
      ["Races", num(totals.races)],
      ["Wins", num(totals.wins)],
      ["Podiums", num(totals.podiums)],
      ["Poles", num(totals.poles)],
      ["Cups won", `${num(totals.cupsWon)} / ${num(totals.cupsCompleted)}`],
    ];
    const others = list.filter((d) => d.driverId !== leadId);
    $("career-summary").innerHTML = `
      <p class="kicker">Latest · ${esc(nameOf(leadId))}</p>
      <div><span class="career-tier">${esc(Career.tierFor(rating))}</span> <span class="muted">· rating ${rating}</span></div>
      <div class="summary-stats">${stats.map(([label, value]) => `<div class="summary-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("")}</div>
      <div class="summary-bests">${CIRCUITS.map((c) => {
        const best = lead.bestLaps ? lead.bestLaps[c.id] : null;
        return `<div class="summary-best"><span>${esc(c.name)}</span><strong>${esc(lapTime(best ? num(best.ms) : 0))}</strong></div>`;
      }).join("")}</div>
      ${others.length ? `<p class="kicker">Your other drivers</p>
      <ul class="summary-drivers">${others.map((d) => `<li><strong>${esc(nameOf(d.driverId))}</strong><span>${esc(d.tier)} · ${num(d.rating)}</span><span>${num(d.careerPoints).toLocaleString()} pts · ${num(d.races)} ${num(d.races) === 1 ? "race" : "races"}</span></li>`).join("")}</ul>` : ""}
      <p><a class="ghost-btn" href="./play.html?driver=${encodeURIComponent(leadId)}#career">Open ${esc(nameOf(leadId).split(" ").pop())}'s career</a></p>`;
  }


  function renderGrid() {
    $("team-list").innerHTML = TEAMS.map((team) => {
      const drivers = DRIVERS.filter((d) => d.teamId === team.id);
      return `
        <article class="team-card" style="--team:${esc(team.body)}">
          <div class="team-shot"><img src="./assets/shots/team-${esc(team.id)}.jpg" alt="The ${esc(team.name)} ${esc(team.car)}" loading="lazy"></div>
          <div class="team-body">
            <h3>${esc(team.name)}</h3>
            <p class="team-car">${esc(team.car)}</p>
            <ul class="team-drivers">${drivers.map((d) => `<li><b>${num(d.number)}</b>${esc(d.name)}</li>`).join("")}</ul>
          </div>
        </article>`;
    }).join("");
  }

  const COLUMN_LABELS = { lead: "Leading", front: "Close behind", mid: "Midfield", back: "Chasing", tail: "Back of the field" };

  function renderPowerUps() {
    const shares = PowerUps.overallShares();
    const byId = Object.fromEntries(POWER_UPS.map((p) => [p.id, p]));
    $("pu-cards").innerHTML = PowerUps.ITEM_ORDER.map((id) => {
      const p = byId[id];
      const rarity = PowerUps.rarityFor(shares[id]);
      return `<article class="pu-card" data-id="${esc(id)}">
        <div class="pu-shot"><img src="assets/shots/items/${esc(id)}.jpg" alt="${esc(shotCar(SHOT_DRIVERS.items[id]))} with ${esc(p.name)}, in the game" loading="lazy"></div>
        <div class="pu-body">
          <div class="pu-head"><span class="pu-icon" aria-hidden="true">${ITEM_ICONS[id]}</span>
            <div><h3 class="pu-name">${esc(p.name)}</h3><p class="pu-counterpart">Mario Kart: ${esc(p.counterpart)}</p></div>
            <span class="pu-rarity pu-rarity-${esc(rarity.toLowerCase().replace(" ", "-"))}">${esc(rarity)}</span></div>
          <p class="pu-effect">${esc(p.effect)}</p>
          <p class="pu-controls">${esc(p.controls)}</p>
        </div>
      </article>`;
    }).join("");
    const cols = PowerUps.COLUMNS;
    $("pu-odds").innerHTML = `<thead><tr><th scope="col">Item</th>${cols.map((c) => `<th scope="col">${esc(COLUMN_LABELS[c])}</th>`).join("")}</tr></thead>
      <tbody>${PowerUps.ITEM_ORDER.map((id) => `<tr data-id="${esc(id)}"><th scope="row">${esc(byId[id].name)}</th>${cols.map((c) =>
        `<td data-col="${esc(c)}" data-label="${esc(COLUMN_LABELS[c])}">${PowerUps.ODDS[c][id] ? `${PowerUps.ODDS[c][id]}%` : "–"}</td>`).join("")}</tr>`).join("")}</tbody>`;
    const L = PowerUps.LIMITS;
    $("pu-odds-note").textContent = `Chances for each item box. The column is set by your gap to the leader, not your place: close behind the leader you roll like a front-runner. No Steward Penalty, Formation Lap or Safety Car in the first ${L.strongItemsAfter} seconds, no Safety Car in the first ${L.safetyCarAfter} seconds or within ${L.safetyCarCooldown} seconds of the last one, and no new Steward Penalty comes out of a box while one is on track.`;
  }

  function guardPlayOnPhones() {
    if (window.Device) Device.guardPlayLinks(document, window);
  }


  // Another tab raced: the career section follows (only for the profile
  // itself -- a backup key changes nothing here), keeping focus where it was.
  window.addEventListener("storage", (event) => {
    if (!window.Career || ![null, Career.STORAGE_KEY, Career.LEGACY_KEY].includes(event.key)) return;
    const f = document.activeElement;
    const href = f && $("career-summary").contains(f) ? f.getAttribute("href") : null;
    renderCareer();
    // The same link, or (if the lead driver changed) the section's first link.
    const again = href && ([...$("career-summary").querySelectorAll("a")].find((a) => a.getAttribute("href") === href)
      || $("career-summary").querySelector("a"));
    if (again) again.focus({ preventScroll: true });
  });

  // The hero's caption names the driver the picture was taken with.
  const heroImg = document.querySelector("#hero img");
  if (heroImg) heroImg.alt = `${shotCar(SHOT_DRIVERS.hero)} leading the field through the forest at Spa-Francorchamps`;
  renderCircuits();
  renderCareer();
  renderGrid();
  renderPowerUps();
  guardImages();
  guardPlayOnPhones();
}());
