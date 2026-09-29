// The game page's screens: the Showroom pit lane, the race's timing tower and
// feed ticker, results, podium, career, settings and the phone note.
// DOM only. It acts through window.Game and reads the saved career through
// window.Career; it never reads the game's internal state.

(function () {
  const STAT_LABELS = { speed: "Speed", handling: "Handling", acceleration: "Acceleration", traction: "Traction" };
  const OVERLAYS = ["career-screen", "settings-screen", "phone-note"];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const $ = (id) => document.getElementById(id);
  let openOverlay = null;
  let tickerTimer = 0;

  function lapTime(ms) {
    if (!ms || ms <= 0) return "-:--.---";
    const total = Math.round(ms) / 1000;
    const minutes = Math.floor(total / 60);
    return `${minutes}:${(total - minutes * 60).toFixed(3).padStart(6, "0")}`;
  }

  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
  }

  function build() {
    $("screens").innerHTML = `
      <section id="pitlane" class="screen pitlane hidden" aria-label="Pit lane">
        <header class="pitlane-top">
          <a class="wordmark" href="./index.html">F1 PIXEL CUP</a>
          <span class="crumb">PIT LANE</span>
          <button class="ghost-btn" data-action="settings" type="button">Settings</button>
        </header>
        <div class="pitlane-choices">
          <div class="choice-row"><span class="choice-label" id="cup-label">Cup</span><span id="cup-pills" role="group" aria-labelledby="cup-label"></span></div>
          <div class="choice-row"><span class="choice-label" id="difficulty-label">Difficulty</span><span id="difficulty-pills" role="group" aria-labelledby="difficulty-label"></span></div>
          <div class="choice-row"><span class="choice-label" id="grid-label">Grid</span><span id="grid-pills" role="group" aria-labelledby="grid-label" aria-describedby="grid-hint"></span></div>
          <p id="grid-hint" class="choice-hint"></p>
          <ol id="cup-circuits" class="cup-circuits"></ol>
        </div>
        <div class="pitlane-driver">
          <p id="driver-kicker" class="kicker"></p>
          <h1 id="driver-name" class="it-title driver-name"></h1>
          <p id="driver-title" class="driver-title"></p>
          <div id="driver-stats" class="stat-bars"></div>
          <button id="career-chip" class="chip" data-action="career" type="button"></button>
        </div>
        <div id="driver-strip" class="driver-strip" role="listbox" aria-label="Drivers"></div>
        <button id="start-cup" class="go-btn" data-action="start" type="button"><span>Start cup ›</span></button>
      </section>

      <aside id="tower" class="tower hidden" aria-label="Live timing"></aside>
      <div id="ticker" class="ticker hidden" aria-live="polite"></div>

      <section id="results-screen" class="screen overlay hidden" aria-live="polite">
        <div class="overlay-card wide">
          <p id="results-kicker" class="kicker"></p>
          <h2 id="results-title" class="it-title overlay-title"></h2>
          <div id="results-career" class="career-strip hidden"></div>
          <div id="results-table" class="results-table"></div>
          <div class="overlay-actions">
            <button class="ghost-btn" data-action="pitlane" type="button">Back to pit lane (Esc)</button>
            <button id="results-next" class="go-btn" data-action="next" type="button"><span>Next race ›</span></button>
          </div>
        </div>
      </section>

      <section id="qualifying-screen" class="screen overlay hidden" aria-live="polite">
        <div class="overlay-card wide">
          <p id="qualifying-kicker" class="kicker"></p>
          <h2 id="qualifying-title" class="it-title overlay-title"></h2>
          <p class="muted quali-lede">Qualifying classification — this is the starting grid. Qualifying points count when you finish the race.</p>
          <p id="qualifying-note" class="quali-note"></p>
          <div id="qualifying-table" class="results-table quali-table"></div>
          <div class="overlay-actions">
            <button class="ghost-btn" data-action="pitlane" type="button">Back to pit lane (Esc)</button>
            <button class="go-btn" data-action="race" type="button"><span>Start the race ›</span></button>
          </div>
        </div>
      </section>

      <section id="podium-screen" class="screen overlay hidden" aria-live="polite">
        <div class="overlay-card">
          <p id="podium-kicker" class="kicker"></p>
          <h2 id="podium-title" class="it-title overlay-title"></h2>
          <div id="podium-scene" class="podium"></div>
          <div id="podium-career" class="career-strip hidden"></div>
          <div class="overlay-actions">
            <button class="go-btn" data-action="pitlane" type="button"><span>Back to pit lane ›</span></button>
          </div>
        </div>
      </section>

      <section id="career-screen" class="screen overlay hidden" aria-label="Career">
        <div id="career-card" class="overlay-card wide"></div>
      </section>

      <section id="settings-screen" class="screen overlay hidden" aria-label="Settings">
        <div class="overlay-card narrow">
          <p class="kicker">Pit lane</p>
          <h2 class="it-title overlay-title">Settings</h2>
          <div class="setting-row"><span>Sound</span><button id="sound-toggle" class="pill" data-action="sound" type="button"></button></div>
          <div class="setting-row"><span>Full screen</span><button id="fullscreen-toggle" class="pill" data-action="fullscreen" type="button"></button></div>
          <div class="overlay-actions"><button class="ghost-btn" data-action="close" type="button">Close (Esc)</button></div>
        </div>
      </section>

      <section id="phone-note" class="screen overlay hidden" aria-label="Best on a computer">
        <div class="overlay-card narrow">
          <p class="kicker">Heads up</p>
          <h2 class="it-title overlay-title">Best played on a computer with a keyboard</h2>
          <p class="muted">F1 Pixel Cup is driven with the keyboard. Touch controls are on the way.</p>
          <div class="overlay-actions">
            <a class="ghost-btn" href="./index.html">Back to home</a>
            <button class="go-btn" data-action="close" type="button"><span>Play anyway ›</span></button>
          </div>
        </div>
      </section>`;
    $("screens").addEventListener("click", onClick);
  }

  function onClick(event) {
    const target = event.target.closest("[data-action], [data-driver], [data-cup], [data-difficulty], [data-grid]");
    if (!target || !window.Game) return;
    if (target.dataset.driver !== undefined) {
      Game.selectDriver(Number(target.dataset.driver));
      if (target.dataset.actionClose) {
        closeOverlay();
        // The button that had focus is gone with the overlay: land on the chip
        // that now shows the chosen driver's career.
        $("career-chip").focus();
      }
    }
    else if (target.dataset.cup !== undefined) Game.selectCup(Number(target.dataset.cup));
    else if (target.dataset.difficulty !== undefined) Game.selectDifficulty(Number(target.dataset.difficulty));
    else if (target.dataset.grid !== undefined) Game.selectGridMode(target.dataset.grid);
    else {
      const action = target.dataset.action;
      if (action === "start") Game.startCup();
      else if (action === "next") Game.nextRace();
      else if (action === "race") Game.startRaceFromQualifying();
      else if (action === "pitlane") Game.backToPitLane();
      else if (action === "career") showCareer();
      else if (action === "settings") showSettings();
      else if (action === "close") closeOverlay();
      else if (action === "sound") { Game.setSound(!Game.isSoundOn()); refreshSettings(); }
      else if (action === "fullscreen") { Game.toggleFullscreen(); setTimeout(refreshSettings, 200); }
    }
  }

  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }
  function hideMain() { ["pitlane", "tower", "ticker", "results-screen", "qualifying-screen", "podium-screen"].forEach(hide); }

  // ---- Pit lane ----
  function showPitLane() {
    hideMain();
    show("pitlane");
    refreshPitLane();
  }

  function refreshPitLane() {
    if (!window.Game || !$("pitlane")) return;
    const s = Game.getPitLaneState();
    $("pitlane").style.setProperty("--team", s.team.body);
    $("driver-kicker").textContent = `#${s.driver.number} · ${s.team.name} ${s.team.car}`;
    $("driver-name").innerHTML = esc(s.driver.name).replace(" ", "<br>");
    $("driver-title").textContent = s.driver.title;
    $("driver-stats").innerHTML = Object.keys(STAT_LABELS).map((key) => `
      <div class="stat"><span>${STAT_LABELS[key]}</span><div class="stat-bar"><i style="width:${Math.round(num(s.stats[key]) * 100)}%"></i></div></div>
    `).join("");
    $("cup-pills").innerHTML = s.cups.map((cup) => `
      <button class="pill ${cup.index === s.selectedCup ? "is-on" : ""}" data-cup="${cup.index}" type="button" aria-pressed="${cup.index === s.selectedCup}">${esc(cup.name)}</button>`).join("");
    $("difficulty-pills").innerHTML = s.difficulties.map((d) => `
      <button class="pill ${d.index === s.selectedDifficulty ? "is-on" : ""}" data-difficulty="${d.index}" type="button" aria-pressed="${d.index === s.selectedDifficulty}">${esc(d.name)}</button>`).join("");
    $("grid-pills").innerHTML = s.gridModes.map((m) => `
      <button class="pill ${m.id === s.gridMode ? "is-on" : ""}" data-grid="${esc(m.id)}" type="button" aria-pressed="${m.id === s.gridMode}">${esc(m.name)}</button>`).join("");
    $("grid-hint").textContent = s.gridMode === "qualifying"
      ? "Before every race: one flying lap sets your grid, and pays career points."
      : "You start every race last and fight through the field.";
    $("cup-circuits").innerHTML = s.cups[s.selectedCup].circuits.map((name) => `<li>${esc(name)}</li>`).join("");
    $("driver-strip").innerHTML = s.drivers.map((d) => `
      <button class="driver-tile ${d.index === s.selectedDriver ? "is-on" : ""}" data-driver="${d.index}" style="--team:${esc(d.teamColor)}"
        type="button" role="option" aria-selected="${d.index === s.selectedDriver}" title="${esc(d.name)}"><b>${num(d.number)}</b><span>${esc(d.code)}</span></button>`).join("");
    $("start-cup").innerHTML = `<span>Start ${esc(s.cups[s.selectedCup].name)} ›</span>`;
    refreshCareerChip();
  }

  // Every driver has their own career; the pit lane shows the selected one's.
  function selectedDriverId() {
    return window.Game ? Game.getPitLaneState().driver.id : null;
  }

  function careerProfile(driverId = selectedDriverId()) {
    try {
      return window.Career && driverId ? Career.getDriver(driverId) : null;
    } catch (error) {
      return null;
    }
  }

  function surname(name) {
    const parts = String(name || "").trim().split(/\s+/);
    return parts[parts.length - 1] || "";
  }

  function refreshCareerChip() {
    const profile = careerProfile();
    const rating = profile ? num(profile.rating) : 1200;
    const tier = window.Career ? Career.tierFor(rating) : "F4";
    const name = window.Game ? Game.getPitLaneState().driver.name : "";
    // Started: anything on record, even a rating or best lap carried over from an old save.
    const started = profile && (num(profile.totals && profile.totals.races) > 0 || num(profile.careerPoints) > 0
      || rating !== 1200 || Object.keys(profile.bestLaps || {}).length > 0);
    const text = started
      ? `${surname(name)} · ${tier} ${rating} · ${num(profile.careerPoints).toLocaleString()} pts`
      : `${surname(name)} · New career · ${tier} ${rating}`;
    $("career-chip").textContent = text;
    $("career-chip").setAttribute("aria-label", `Career: ${text}`);
  }

  // ---- Race ----
  function showRace() {
    hideMain();
    closeOverlay();
    show("tower");
  }

  function updateTower(rows) {
    if (!rows || !rows.length) return;
    const top = rows.slice(0, 10);
    const player = rows.find((row) => row.isPlayer);
    const extra = player && !top.includes(player) ? [player] : [];
    // A position can be a number, or a dash for a car still on its qualifying lap.
    const place = (p) => (typeof p === "number" ? num(p) : esc(p));
    const row = (r) => `<div class="tower-row ${r.isPlayer ? "is-player" : ""}"><b>${place(r.position)}</b><i style="background:${esc(r.teamColor)}"></i><span>${esc(r.code)}</span><em>${esc(r.gap)}</em></div>`;
    $("tower").innerHTML = top.map(row).join("") + (extra.length ? `<div class="tower-gap"></div>${extra.map(row).join("")}` : "");
  }

  function pushFeed(message) {
    const ticker = $("ticker");
    if (!ticker) return;
    ticker.textContent = message;
    ticker.classList.remove("hidden", "is-fading");
    clearTimeout(tickerTimer);
    tickerTimer = setTimeout(() => {
      ticker.classList.add("is-fading");
      tickerTimer = setTimeout(() => ticker.classList.add("hidden"), 450);
    }, 3200);
  }

  // ---- Results and podium ----
  function renderStrip(node, career) {
    const lines = (career && career.lines) || [];
    const saved = career ? career.saved : true;
    if (!lines.length && saved !== false) {
      node.innerHTML = "";
      node.classList.add("hidden");
      return;
    }
    const warning = saved === false ? `<p class="career-strip-warning">Progress couldn't be saved in this browser.</p>` : "";
    node.innerHTML = lines.map((line) => `<p>${line}</p>`).join("") + warning;
    node.classList.remove("hidden");
  }

  function showResults(summary) {
    hideMain();
    $("results-kicker").textContent = summary.kicker;
    $("results-title").textContent = summary.title;
    $("results-next").innerHTML = `<span>${esc(summary.nextLabel)} ›</span>`;
    $("results-table").innerHTML = `
      <div class="result-head"><span>Pos</span><span></span><span>Driver</span><span>Time</span><span>Gap</span><span>Best lap</span><span>Race</span><span>Cup</span></div>
      ${summary.rows.map((r) => `
        <div class="result-row ${r.isPlayer ? "is-player" : ""}">
          <b>${esc(ordinal(num(r.place)))}</b><i style="background:${esc(r.teamColor)}"></i>
          <span>${esc(r.name)}</span>
          <span class="r-time">${esc(r.time)}</span><span class="r-gap">${esc(r.gap)}</span>
          <span class="${r.fastest ? "is-fastest" : ""}">${esc(r.bestLap)}</span>
          <span>${num(r.racePoints)}</span><span>${num(r.cupPoints)}</span>
        </div>`).join("")}`;
    renderStrip($("results-career"), summary.career);
    show("results-screen");
    $("results-next").focus();
  }

  function showQualifying(summary) {
    hideMain();
    $("qualifying-kicker").textContent = summary.kicker;
    $("qualifying-title").textContent = summary.title;
    $("qualifying-table").innerHTML = `
      <div class="result-head quali-head"><span>Pos</span><span></span><span>Driver</span><span>Time</span><span>Gap</span></div>
      ${summary.rows.map((r) => `
        <div class="result-row quali-row ${r.isPlayer ? "is-player" : ""} ${r.position === 1 ? "is-pole" : ""}" data-id="${esc(r.id)}">
          <b>${esc(ordinal(num(r.position)))}</b><i style="background:${esc(r.teamColor)}"></i>
          <span>${esc(r.name)}</span>
          <span class="r-time">${esc(r.time)}</span><span class="r-gap">${esc(r.gap)}</span>
        </div>`).join("")}`;
    $("qualifying-note").textContent = summary.note || "";
    show("qualifying-screen");
    // Keyboard: the race is one Enter away, and Back to pit lane isn't the first stop.
    $("qualifying-screen").querySelector('[data-action="race"]').focus();
  }

  function showPodium(summary) {
    hideMain();
    $("podium-kicker").textContent = summary.kicker;
    $("podium-title").textContent = summary.title;
    const order = [summary.podium[1], summary.podium[0], summary.podium[2]].filter(Boolean);
    $("podium-scene").innerHTML = order.map((p) => `
      <div class="podium-step p${num(p.place)} ${p.isPlayer ? "is-player" : ""}" style="--team:${esc(p.teamColor)}">
        <strong>${esc(p.name)}</strong><span>${esc(p.team)} · ${num(p.points)} pts</span>
        <div class="block">${num(p.place)}</div>
      </div>`).join("");
    renderStrip($("podium-career"), summary.career);
    show("podium-screen");
  }

  // ---- Career ----
  function showCareer() {
    renderCareer();
    openOverlayId("career-screen");
  }

  function renderCareer() {
    const profile = careerProfile();
    const totals = (profile && profile.totals) || {};
    const rating = profile ? num(profile.rating) : 1200;
    const tier = window.Career ? Career.tierFor(rating) : "F4";
    const circuitName = (id) => (CIRCUITS.find((c) => c.id === id) || { name: id }).name;
    const difficultyName = (id) => (window.Career && Career.DIFFICULTY_NAMES[id]) || id;
    const races = ((profile && profile.history) || []).filter((h) => h && h.type === "race").slice(-20).reverse();
    const stats = [
      ["Career points", num(profile && profile.careerPoints).toLocaleString()],
      ["Rating", rating],
      ["Races", num(totals.races)],
      ["Wins", num(totals.wins)],
      ["Podiums", num(totals.podiums)],
      ["Poles", num(totals.poles)],
      ["Cups won", `${num(totals.cupsWon)} / ${num(totals.cupsCompleted)}`],
    ];
    const name = window.Game ? Game.getPitLaneState().driver.name : "";
    let drivers = [];
    try {
      drivers = window.Career ? Career.listDrivers() : [];
    } catch (error) {
      drivers = [];
    }
    const driverName = (id) => ((typeof DRIVERS !== "undefined" ? DRIVERS : []).find((d) => d.id === id) || { name: id }).name;
    // Between cups, a row picks that driver (opened from the site's link too,
    // before the pit lane has been drawn).
    const choosable = Boolean(window.Game && Game.getPitLaneState().canChooseDriver);
    $("career-card").innerHTML = `
      <p class="kicker">${esc(name)} · career</p>
      <div class="career-head"><span class="career-tier">${esc(tier)}</span><span class="muted">Rating ${rating} · ${num(profile && profile.careerPoints).toLocaleString()} career points</span></div>
      ${num(totals.races) === 0 ? `<p class="muted">${esc(name)}'s career starts here, at 1200 · F4. Every driver has their own career: finish a race to start earning points and rating.</p>` : ""}
      <div class="career-grid">${stats.map(([label, value]) => `<div class="career-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("")}</div>
      <p class="kicker career-section">Best laps</p>
      <div class="career-bests">${CIRCUITS.map((c) => {
        const best = profile && profile.bestLaps ? profile.bestLaps[c.id] : null;
        return `<div class="career-best"><span>${esc(c.name)}</span><strong>${best ? esc(lapTime(num(best.ms))) : "—"}</strong></div>`;
      }).join("")}</div>
      <p class="kicker career-section">Recent races</p>
      ${races.length ? `<table class="career-history"><thead><tr><th>Circuit</th><th>Difficulty</th><th>Grid</th><th>Pos</th><th>Points</th><th>Rating</th></tr></thead><tbody>
        ${races.map((r) => {
          const delta = num(r.ratingAfter) - num(r.ratingBefore);
          const q = r.qualifying && typeof r.qualifying === "object" ? r.qualifying : null;
          // Race points plus qualifying points: what the race added to the career total.
          const earned = num(r.careerPointsEarned) + (q ? num(q.careerPoints) : 0);
          return `<tr><td>${esc(circuitName(r.trackId))}</td><td>${esc(difficultyName(r.difficulty))}</td><td>${q ? `P${num(q.position)}` : "Back"}</td><td>${esc(ordinal(num(r.position)))}</td><td>+${earned}</td>
            <td class="${delta > 0 ? "up" : delta < 0 ? "down" : ""}">${delta > 0 ? "+" : ""}${delta}</td></tr>`;
        }).join("")}</tbody></table>` : `<p class="muted">No races yet.</p>`}
      <p class="kicker career-section">Your drivers</p>
      ${drivers.length ? `<table class="career-history career-drivers"><thead><tr><th>Driver</th><th>Tier</th><th>Rating</th><th>Points</th><th>Races</th><th>Wins</th></tr></thead><tbody>
        ${drivers.map((d) => {
          const index = (typeof DRIVERS !== "undefined" ? DRIVERS : []).findIndex((x) => x.id === d.driverId);
          const current = d.driverId === selectedDriverId();
          const label = choosable && index >= 0
            ? `<button class="link-btn" data-driver="${index}" data-action-close="1" type="button" aria-label="Race as ${esc(driverName(d.driverId))}">${esc(driverName(d.driverId))}</button>`
            : esc(driverName(d.driverId));
          return `<tr class="${current ? "is-current" : ""}"${current ? ' aria-current="true"' : ""}><td>${label}</td><td>${esc(d.tier)}</td><td>${num(d.rating)}</td>
            <td>${num(d.careerPoints).toLocaleString()}</td><td>${num(d.races)}</td><td>${num(d.wins)}</td></tr>`;
        }).join("")}</tbody></table>` : `<p class="muted">No careers yet — pick any driver and race to start theirs.</p>`}
      <div class="overlay-actions"><button class="ghost-btn" data-action="close" type="button">Back (Esc)</button></div>`;
  }

  // ---- Settings, phone note, overlays ----
  function showSettings() {
    refreshSettings();
    openOverlayId("settings-screen");
  }

  function refreshSettings() {
    if (!window.Game || !$("sound-toggle")) return;
    const sound = Game.isSoundOn();
    const full = Game.isFullscreen();
    $("sound-toggle").textContent = sound ? "On" : "Off";
    $("sound-toggle").classList.toggle("is-on", sound);
    $("fullscreen-toggle").textContent = full ? "On" : "Off";
    $("fullscreen-toggle").classList.toggle("is-on", full);
  }

  function showPhoneNote() {
    openOverlayId("phone-note");
  }

  function openOverlayId(id) {
    OVERLAYS.forEach(hide);
    show(id);
    openOverlay = id;
  }

  function closeOverlay() {
    if (!openOverlay) return false;
    hide(openOverlay);
    openOverlay = null;
    return true;
  }

  function init() {
    build();
    if (window.Device && Device.isTouchOnly(window.matchMedia && window.matchMedia.bind(window))) showPhoneNote();
    if (window.location.hash === "#career") showCareer();
  }

  window.Screens = {
    init, showPitLane, refreshPitLane, showRace, updateTower, pushFeed,
    showResults, showQualifying, showPodium, showCareer, showSettings, showPhoneNote, refreshSettings,
    closeOverlay, isOverlayOpen: () => Boolean(openOverlay),
  };
}());
