// Landing page: builds the circuits, career and grid sections from the game's
// own data, and warns phones before sending them into a keyboard game.
(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const $ = (id) => document.getElementById(id);

  function lapTime(ms) {
    if (!ms || ms <= 0) return "—";
    const total = ms / 1000;
    const minutes = Math.floor(total / 60);
    return `${minutes}:${(total - minutes * 60).toFixed(2).padStart(5, "0")}`;
  }

  // A missing shot leaves a styled panel, never a broken-image icon.
  function guardImages() {
    document.querySelectorAll("img").forEach((img) => {
      const fail = () => {
        const holder = img.closest(".hero, .circuit-shot, .team-shot, .pu-shot");
        if (holder) holder.classList.add("no-shot");
        img.remove();
      };
      if (img.complete && img.naturalWidth === 0) fail();
      else img.addEventListener("error", fail, { once: true });
    });
  }

  function renderCircuits() {
    const cupName = (id) => (CUP_DEFS.find((cup) => cup.circuitIds.includes(id)) || { name: "" }).name;
    $("circuit-list").innerHTML = CIRCUITS.map((c) => {
      const map = TrackMap.path((TRACK_SHAPES[c.id] || {}).points || [], { width: 96, height: 72, padding: 6 });
      const start = map.start ? `<circle class="start" cx="${map.start.x}" cy="${map.start.y}" r="4"></circle>` : "";
      return `
        <article class="circuit-card">
          <div class="circuit-shot"><img src="./assets/shots/circuit-${esc(c.id)}.jpg" alt="Racing at ${esc(c.name)}" loading="lazy"></div>
          <div class="circuit-body">
            <div>
              <h3>${esc(c.name)}</h3>
              <div class="circuit-meta">${esc(c.country)} · ${(c.lengthM / 1000).toFixed(3)} km · ${num(c.laps)} laps<br>${esc(cupName(c.id))}</div>
            </div>
            <svg class="circuit-map" viewBox="${map.viewBox}" role="img" aria-label="Map of ${esc(c.name)}"><path class="track" d="${map.d}"></path>${start}</svg>
          </div>
        </article>`;
    }).join("");
  }

  function renderCareer() {
    let profile = null;
    try {
      profile = window.Career ? Career.getProfile() : null;
    } catch (error) {
      profile = null;
    }
    const totals = (profile && profile.totals) || {};
    const rating = profile ? num(profile.rating) : 1200;
    const tier = window.Career ? Career.tierFor(rating) : "F4";
    if (!profile || num(totals.races) === 0) {
      $("career-summary").innerHTML = `
        <div><span class="career-tier">${esc(tier)}</span></div>
        <p>Your career starts at <strong>1200 · F4</strong>. Every race earns career points (more on harder difficulties), moves your rating up or down, and records your best lap on every circuit — saved in this browser.</p>
        <p><a class="go-btn" href="./play.html"><span>Start your career ›</span></a></p>`;
      return;
    }
    const stats = [
      ["Rating", rating],
      ["Career points", num(profile.careerPoints).toLocaleString()],
      ["Races", num(totals.races)],
      ["Wins", num(totals.wins)],
      ["Podiums", num(totals.podiums)],
      ["Cups won", `${num(totals.cupsWon)} / ${num(totals.cupsCompleted)}`],
    ];
    $("career-summary").innerHTML = `
      <div><span class="career-tier">${esc(tier)}</span> <span class="muted">· rating ${rating}</span></div>
      <div class="summary-stats">${stats.map(([label, value]) => `<div class="summary-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("")}</div>
      <div class="summary-bests">${CIRCUITS.map((c) => {
        const best = profile.bestLaps ? profile.bestLaps[c.id] : null;
        return `<div class="summary-best"><span>${esc(c.name)}</span><strong>${esc(lapTime(best ? num(best.ms) : 0))}</strong></div>`;
      }).join("")}</div>
      <p><a class="ghost-btn" href="./play.html#career">Open career</a></p>`;
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
        <div class="pu-shot"><img src="assets/shots/items/${esc(id)}.jpg" alt="${esc(p.name)} in the game" loading="lazy"></div>
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
    $("pu-odds-note").textContent = `Chances for each item box. The column is set by your gap to the leader, not your place: close behind the leader you roll like a front-runner. No Steward Penalty, Formation Lap or Safety Car in the first ${L.strongItemsAfter} seconds, no Safety Car in the first ${L.safetyCarAfter} seconds or within ${L.safetyCarCooldown} seconds of the last one, and only one Steward Penalty on track at a time.`;
  }

  function guardPlayOnPhones() {
    if (!window.Device || !Device.isTouchOnly(window.matchMedia && window.matchMedia.bind(window))) return;
    const note = $("phone-play-note");
    document.querySelectorAll("a.play-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof note.showModal === "function") note.showModal();
        else window.location.href = link.href;
      });
    });
    note.querySelector("[data-close]").addEventListener("click", () => note.close());
  }

  renderCircuits();
  renderCareer();
  renderGrid();
  renderPowerUps();
  guardImages();
  guardPlayOnPhones();
}());
