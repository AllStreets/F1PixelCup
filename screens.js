// The game page's screens: the Showroom pit lane, the race's timing tower and
// feed ticker, results, podium, career, settings and the phone note.
// DOM only. It acts through window.Game and reads the saved career through
// window.Career; it never reads the game's internal state.

(function () {
  const STAT_LABELS = { speed: "Speed", handling: "Handling", acceleration: "Acceleration", traction: "Traction" };
  const OVERLAYS = ["career-screen", "settings-screen", "phone-note", "circuits-screen"];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const $ = (id) => document.getElementById(id);
  let openOverlay = null;
  let tickerTimer = 0;
  // Where focus was before an overlay opened: it goes back there on close.
  let focusBeforeOverlay = null;
  // Asked for by the address (#career) while the phone note was up first.
  let careerAfterNote = false;
  // The phone note is shown once per visit (the site's own note counts).
  const PHONE_NOTE_KEY = "f1pixelcup.phoneNote";

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
          <div class="choice-row"><span class="choice-label" id="race-label">Race</span><span id="race-pills" role="group" aria-labelledby="race-label"></span></div>
          <div id="cup-row" class="choice-row"><span class="choice-label" id="cup-label">Cup</span><span id="cup-pills" role="group" aria-labelledby="cup-label"></span></div>
          <div id="pick-row" class="choice-row" hidden><span class="choice-label" id="pick-label"></span><span id="pick-controls" class="pick-controls" role="group" aria-labelledby="pick-label"></span></div>
          <ol id="cup-circuits" class="cup-circuits" aria-label="Circuits, in race order"></ol>
          <p id="race-hint" class="choice-hint hidden"></p>
          <p id="season-hint" class="choice-hint hidden"></p>
          <button id="new-season" class="ghost-btn new-season hidden" data-action="newSeason" type="button">New season</button>
          <div class="choice-row"><span class="choice-label" id="difficulty-label">Difficulty</span><span id="difficulty-pills" role="group" aria-labelledby="difficulty-label"></span></div>
          <div class="choice-row"><span class="choice-label" id="grid-label">Grid</span><span id="grid-pills" role="group" aria-labelledby="grid-label" aria-describedby="grid-hint"></span></div>
          <p id="grid-hint" class="choice-hint"></p>
          <div class="choice-row"><span class="choice-label" id="weather-label">Weather</span><span id="weather-pills" role="group" aria-labelledby="weather-label" aria-describedby="weather-hint"></span></div>
          <p id="weather-hint" class="choice-hint"></p>
          <div class="choice-row"><span class="choice-label" id="players-label">Players</span><span id="players-pills" role="group" aria-labelledby="players-label" aria-describedby="players-hint"></span></div>
          <div id="second-driver" class="choice-row second-driver" hidden>
            <span class="choice-label" id="second-label">P2 driver</span>
            <span class="second-pick" role="group" aria-labelledby="second-label">
              <button class="pill" data-second="-1" type="button" aria-label="Previous driver for player 2">‹</button>
              <span id="second-name" class="second-name" aria-live="polite"></span>
              <button class="pill" data-second="1" type="button" aria-label="Next driver for player 2">›</button>
            </span>
          </div>
          <p id="players-hint" class="choice-hint"></p>
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
          <div id="results-standings" class="results-table constructors hidden"></div>
          <div class="overlay-actions">
            <button class="ghost-btn" data-action="pitlane" type="button">Back to pit lane (Esc)</button>
            <button id="results-replay" class="ghost-btn replay-btn" data-action="replay" type="button">Watch the replay</button>
            <button id="results-next" class="go-btn" data-action="next" type="button"><span>Next race ›</span></button>
          </div>
        </div>
      </section>

      <section id="replay-screen" class="screen replay hidden" aria-label="Replay">
        <div class="bc-tag" aria-hidden="true"><b>REPLAY</b><em id="bc-speed"></em></div>
        <aside class="bc-tower" aria-label="Timing">
          <header class="bc-tower-head"><span id="bc-track"></span><strong id="bc-lap"></strong></header>
          <div id="bc-rows"></div>
        </aside>
        <div id="bc-third" class="bc-third"></div>
        <p id="bc-announce" class="visually-hidden" aria-live="polite"></p>
        <div id="bc-trace" class="bc-trace hidden" aria-hidden="true">
          <div class="bc-trace-head"><span id="bc-trace-label"></span><b id="bc-kph"></b></div>
          <div class="bc-trace-body">
            <div class="bc-bar is-throttle"><i id="bc-thr"></i></div>
            <div class="bc-bar is-brake"><i id="bc-brk"></i></div>
            <canvas id="bc-graph" width="300" height="90"></canvas>
          </div>
          <div class="bc-steer"><i id="bc-steer"></i></div>
        </div>
        <div class="bc-controls" role="toolbar" aria-label="Replay controls">
          <button id="bc-play" class="bc-btn bc-play" data-replay="play" type="button" aria-label="Pause"></button>
          <div class="bc-group" role="group" aria-label="Speed">
            ${[0.25, 0.5, 1, 2, 4].map((v) => `<button class="bc-btn" data-replay="speed" data-value="${v}" type="button" aria-pressed="false">${v}x</button>`).join("")}
          </div>
          <label class="bc-seek"><span class="visually-hidden">Seek</span><input id="bc-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek"><span id="bc-time" class="bc-time"></span></label>
          <div class="bc-group" role="group" aria-label="Camera">
            ${[["director", "Director"], ["trackside", "Trackside"], ["onboard", "Onboard"], ["helicopter", "Helicopter"]].map(([id, label]) => `<button class="bc-btn" data-replay="camera" data-value="${id}" type="button" aria-pressed="false">${label}</button>`).join("")}
          </div>
          <div class="bc-group bc-focus" role="group" aria-label="Car">
            <button class="bc-btn" data-replay="prev" type="button" aria-label="Previous car">‹</button>
            <span id="bc-focus"></span>
            <button class="bc-btn" data-replay="next" type="button" aria-label="Next car">›</button>
          </div>
          <button class="bc-btn bc-exit" data-replay="exit" type="button">Exit</button>
        </div>
      </section>

      <section id="qualifying-screen" class="screen overlay hidden" aria-live="polite">
        <div class="overlay-card wide">
          <p id="qualifying-kicker" class="kicker"></p>
          <h2 id="qualifying-title" class="it-title overlay-title"></h2>
          <p class="muted quali-lede">Qualifying classification: this is the starting grid. Qualifying points count when you finish the race.</p>
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
          <div class="podium-head">
            <p id="podium-kicker" class="kicker"></p>
            <h2 id="podium-title" class="it-title overlay-title"></h2>
            <div id="podium-career" class="career-strip hidden"></div>
          </div>
          <div id="podium-scene" class="podium"></div>
          <div id="podium-plates" class="podium-plates" aria-hidden="true"></div>
          <div class="podium-foot">
            <div class="overlay-actions">
              <button class="go-btn" data-action="pitlane" type="button"><span>Back to pit lane ›</span></button>
            </div>
          </div>
        </div>
      </section>

      <section id="career-screen" class="screen overlay hidden" role="dialog" aria-modal="true" aria-label="Career">
        <div id="career-card" class="overlay-card wide"></div>
      </section>

      <section id="settings-screen" class="screen overlay hidden" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="overlay-card narrow">
          <p class="kicker">Pit lane</p>
          <h2 class="it-title overlay-title">Settings</h2>
          <div class="setting-row"><span id="sound-label">Sound</span><button id="sound-toggle" class="pill" data-action="sound" type="button" aria-labelledby="sound-label sound-toggle"></button></div>
          <div class="setting-row"><span id="fullscreen-label">Full screen</span><button id="fullscreen-toggle" class="pill" data-action="fullscreen" type="button" aria-labelledby="fullscreen-label fullscreen-toggle"></button></div>
          <div id="graphics-setting">
            <div class="setting-row"><span id="graphics-label">Graphics</span><button id="graphics-toggle" class="pill" data-action="graphics" type="button" aria-labelledby="graphics-label graphics-toggle" aria-describedby="graphics-note"></button></div>
            <p id="graphics-note" class="choice-hint"></p>
          </div>
          <p class="choice-hint settings-credits">Circuits: <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noopener">bacinger/f1-circuits</a> (MIT). Pit lanes, start lines, the Monaco tunnel and the signature corners: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> (ODbL).</p>
          <div class="overlay-actions"><button class="ghost-btn" data-action="close" type="button">Close (Esc)</button></div>
        </div>
      </section>

      <section id="circuits-screen" class="screen overlay hidden" role="dialog" aria-modal="true" aria-labelledby="circuits-title">
        <div class="overlay-card wide picker-card">
          <p id="circuits-kicker" class="kicker"></p>
          <h2 id="circuits-title" class="it-title overlay-title"></h2>
          <label class="picker-search"><span class="visually-hidden">Search circuits</span>
            <input id="circuit-search" type="search" placeholder="Search circuits or countries" autocomplete="off" spellcheck="false" data-autofocus aria-controls="circuit-cards">
          </label>
          <ol id="circuit-order" class="circuit-order" aria-label="Running order"></ol>
          <p id="circuit-count" class="choice-hint picker-count" aria-live="polite"></p>
          <div id="circuit-cards" class="circuit-cards" role="group" aria-label="Circuits"></div>
          <div class="overlay-actions">
            <button id="picker-clear" class="ghost-btn" data-action="pickerClear" type="button">Clear</button>
            <button class="go-btn" data-action="pickerDone" type="button"><span>Done ›</span></button>
          </div>
        </div>
      </section>

      <section id="phone-note" class="screen overlay hidden" role="dialog" aria-modal="true" aria-label="Best on a computer">
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
    $("circuit-search").addEventListener("input", () => renderPickerCards());
    // Enter in the search box goes to the first circuit it found.
    $("circuit-search").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const first = $("circuit-cards").querySelector("[data-pick]");
      if (first) first.focus();
    });
    const seek = $("bc-seek");
    seek.addEventListener("pointerdown", () => { seeking = true; });
    // (A cancelled touch, or a lost capture, ends the drag too.)
    ["pointerup", "pointercancel"].forEach((type) => window.addEventListener(type, () => { seeking = false; }));
    seek.addEventListener("lostpointercapture", () => { seeking = false; });
    seek.addEventListener("input", () => {
      if (window.Game && Game.replay && replayDuration) Game.replay.seek((Number(seek.value) / 1000) * replayDuration);
    });
  }

  function onClick(event) {
    const target = event.target.closest("[data-action], [data-driver], [data-cup], [data-race], [data-single], [data-pick], [data-move], [data-unpick], [data-difficulty], [data-grid], [data-weather], [data-players], [data-second], [data-replay]");
    if (!target || !window.Game) return;
    if (target.dataset.replay !== undefined) {
      onReplayControl(target.dataset.replay, target.dataset.value);
      // Clicked with the mouse, the button lets focus go, so Space stays
      // play/pause (a keyboard press keeps it, for Tab and Enter).
      if (event.detail > 0 && target.blur) target.blur();
    } else if (target.dataset.driver !== undefined) {
      Game.selectDriver(Number(target.dataset.driver));
      if (target.dataset.actionClose) {
        closeOverlay();
        // The button that had focus is gone with the overlay: land on the chip
        // that now shows the chosen driver's career.
        $("career-chip").focus();
      }
    }
    else if (target.dataset.cup !== undefined) Game.selectCup(Number(target.dataset.cup));
    else if (target.dataset.race !== undefined) Game.selectRaceMode(target.dataset.race);
    else if (target.dataset.single !== undefined) {
      Game.selectSinglePick(target.dataset.single);
      // Chosen, with nothing chosen yet: the picker, to choose it.
      const race = Game.getPitLaneState().race;
      if (race.single.pick === "chosen" && !race.single.circuitId) showCircuitPicker();
    }
    else if (target.dataset.pick !== undefined) {
      if (pickerSingle()) {
        Game.chooseSingleCircuit(target.dataset.pick);
        closeOverlay();
      } else {
        Game.toggleCustomCircuit(target.dataset.pick);
      }
    }
    else if (target.dataset.move !== undefined) {
      const [index, dir] = target.dataset.move.split(":").map(Number);
      Game.moveCustomCircuit(index, dir);
    }
    else if (target.dataset.unpick !== undefined) Game.toggleCustomCircuit(target.dataset.unpick);
    else if (target.dataset.difficulty !== undefined) Game.selectDifficulty(Number(target.dataset.difficulty));
    else if (target.dataset.grid !== undefined) Game.selectGridMode(target.dataset.grid);
    else if (target.dataset.weather !== undefined) Game.selectWeatherMode(target.dataset.weather);
    else if (target.dataset.players !== undefined) Game.selectPlayers(Number(target.dataset.players));
    else if (target.dataset.second !== undefined) Game.stepSecondDriver(Number(target.dataset.second));
    else {
      const action = target.dataset.action;
      if (action === "start") Game.startCup();
      else if (action === "next") Game.nextRace();
      else if (action === "newSeason") Game.newSeason();
      else if (action === "reroll") Game.rerollDraw();
      else if (action === "pickCircuits") showCircuitPicker();
      else if (action === "pickerDone") closeOverlay();
      else if (action === "pickerClear") Game.clearCustomCircuits();
      else if (action === "replay") Game.replay.open();
      else if (action === "race") Game.startRaceFromQualifying();
      else if (action === "pitlane") Game.backToPitLane();
      else if (action === "career") showCareer();
      else if (action === "settings") showSettings();
      else if (action === "close") closeOverlay();
      else if (action === "sound") { Game.setSound(!Game.isSoundOn()); refreshSettings(); }
      else if (action === "fullscreen") { Game.toggleFullscreen(); setTimeout(refreshSettings, 200); }
      else if (action === "graphics") { cycleGraphics(); refreshSettings(); }
    }
  }

  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }
  function hideMain() { ["pitlane", "tower", "ticker", "results-screen", "qualifying-screen", "podium-screen", "replay-screen"].forEach(hide); }

  // ---- Pit lane ----
  // Keyboard users always have somewhere to be: when focus is stranded on a
  // screen that has just been hidden (or, with force, is nowhere at all), the
  // pit lane's Start button takes it. A fresh page load is left alone.
  function focusPitLane(force = false) {
    const f = document.activeElement;
    const stranded = f && f !== document.body && (!f.isConnected || f.getClientRects().length === 0);
    const nowhere = !f || f === document.body;
    if ((stranded || (force && nowhere)) && !$("pitlane").classList.contains("hidden") && !openOverlay) {
      $("start-cup").focus({ preventScroll: true });
    }
  }

  function showPitLane() {
    hideMain();
    show("pitlane");
    showroomStale = true;
    refreshPitLane();
    focusPitLane();
  }

  // The pit lane is redrawn on every pick; keep focus on the control that was
  // picked (its replacement) instead of dropping it on the page.
  const FOCUS_KEYS = ["driver", "cup", "race", "single", "difficulty", "grid", "weather", "players", "second", "action"];
  function focusedControl() {
    const el = document.activeElement;
    if (!el || !$("pitlane").contains(el)) return null;
    const key = FOCUS_KEYS.find((k) => el.dataset && el.dataset[k] !== undefined);
    return key ? { key, value: el.dataset[key], id: el.id } : (el.id ? { id: el.id } : null);
  }

  function restoreFocus(was) {
    if (!was || $("pitlane").contains(document.activeElement)) return;
    // Driver tiles use roving focus: it follows the selection, so the arrow
    // keys move it and Enter starts the cup with the driver on screen.
    const el = was.key === "driver"
      ? document.querySelector("#driver-strip .driver-tile.is-on")
      : was.key
        ? [...$("pitlane").querySelectorAll(`[data-${was.key}]`)].find((n) => n.dataset[was.key] === was.value)
        : (was.id && $(was.id));
    if (el) el.focus({ preventScroll: true });
  }

  function refreshPitLane() {
    if (!window.Game || !$("pitlane")) return;
    const was = focusedControl();
    const s = Game.getPitLaneState();
    $("pitlane").style.setProperty("--team", s.team.body);
    $("driver-kicker").textContent = `#${s.driver.number} · ${s.team.name} ${s.team.car}`;
    $("driver-name").innerHTML = esc(s.driver.name).replace(" ", "<br>");
    $("driver-title").textContent = s.driver.title;
    $("driver-stats").innerHTML = Object.keys(STAT_LABELS).map((key) => `
      <div class="stat"><span>${STAT_LABELS[key]}</span><div class="stat-bar"><i style="width:${Math.round(num(s.stats[key]) * 100)}%"></i></div></div>
    `).join("");
    const race = s.race;
    const cur = race.current;
    $("race-pills").innerHTML = race.modes.map((m) => `
      <button class="pill ${m.id === race.mode ? "is-on" : ""}" data-race="${esc(m.id)}" type="button" aria-pressed="${m.id === race.mode}">${esc(m.name)}</button>`).join("");
    // The Cup row: the calendar cups (the season has its own pill above).
    $("cup-row").hidden = race.mode !== "cup";
    $("cup-pills").innerHTML = s.cups.filter((cup) => !cup.season).map((cup) => `
      <button class="pill ${cup.index === s.selectedCup ? "is-on" : ""}" data-cup="${cup.index}" type="button" aria-pressed="${cup.index === s.selectedCup}">${esc(cup.name)}</button>`).join("");
    renderPickRow(race);
    $("difficulty-pills").innerHTML = s.difficulties.map((d) => `
      <button class="pill ${d.index === s.selectedDifficulty ? "is-on" : ""}" data-difficulty="${d.index}" type="button" aria-pressed="${d.index === s.selectedDifficulty}">${esc(d.name)}</button>`).join("");
    $("grid-pills").innerHTML = s.gridModes.map((m) => `
      <button class="pill ${m.id === s.gridMode ? "is-on" : ""}" data-grid="${esc(m.id)}" type="button" aria-pressed="${m.id === s.gridMode}">${esc(m.name)}</button>`).join("");
    // (A single race has one race to say it of.)
    const each = cur.single ? "the race" : "every race";
    const Each = cur.single ? "Before the race" : "Before every race";
    $("grid-hint").textContent = s.players === 2 && !cur.season
      ? (s.gridMode === "qualifying"
        ? `${Each}: one flying lap each, both at once, sets your grid and pays career points.`
        : `P1 and P2 start ${each} side by side on the last row and fight through the field.`)
      : s.gridMode === "qualifying"
        ? `${Each}: one flying lap sets your grid, and pays career points.`
        : `You start ${each} last and fight through the field.`;
    $("weather-pills").innerHTML = s.weatherModes.map((m) => `
      <button class="pill ${m.id === s.weatherMode ? "is-on" : ""}" data-weather="${esc(m.id)}" type="button" aria-pressed="${m.id === s.weatherMode}">${esc(m.name)}</button>`).join("");
    $("weather-hint").textContent = s.weatherMode === "wet"
      ? (cur.single ? "In the rain: less grip in the corners, longer braking." : "Every race in the rain: less grip in the corners, longer braking.")
      : s.weatherMode === "changeable"
        ? (cur.single ? "It rains as often as it really does there: Spa one race in two, the desert almost never." : "Each race rains as often as it really does there: Spa one in two, the desert almost never.")
        : cur.season ? "Dry races all season." : cur.single ? "A dry race." : "Dry races all cup.";
    // A cup's four circuits; the season's 24 in one line, first to last; a
    // custom cup still being chosen says how many are to come.
    const circuits = cur.circuits;
    const todo = race.mode === "custom" && circuits.length < race.cupSize
      ? `<li class="is-todo">${circuits.length ? `${num(race.cupSize - circuits.length)} more to choose` : `No circuits chosen yet`}</li>`
      : race.mode === "single" && !circuits.length ? `<li class="is-todo">No circuit chosen yet</li>` : "";
    $("cup-circuits").innerHTML = cur.season
      ? `<li>${num(circuits.length)} rounds: ${esc(circuits[0].name)} to ${esc(circuits[circuits.length - 1].name)}</li>`
      : circuits.map((c) => `<li data-circuit="${esc(c.id)}">${esc(c.name)}</li>`).join("") + todo;
    $("cup-circuits").classList.toggle("is-numbered", race.mode === "random" || race.mode === "custom");
    // One player or two (split screen); player 2's driver and both key sets.
    // The season is one player's championship: no second player there.
    const seasonPicked = cur.season;
    const players = seasonPicked ? 1 : s.players;
    $("players-pills").innerHTML = [[1, "1 player"], [2, "2 players"]].map(([n, label]) => `
      <button class="pill ${n === players ? "is-on" : ""}" data-players="${n}" type="button" aria-pressed="${n === players}"${seasonPicked && n === 2 ? " disabled" : ""}>${label}</button>`).join("");
    $("second-driver").hidden = players !== 2;
    $("second-driver").style.setProperty("--team", s.secondDriver.teamColor);
    $("second-name").innerHTML = `<i></i><b>${num(s.secondDriver.number)}</b> ${esc(s.secondDriver.name)} <small>${esc(s.secondDriver.team)}</small>`;
    $("players-hint").classList.toggle("is-plain", players !== 2);
    $("players-hint").textContent = seasonPicked
      ? "The season is one player's championship."
      : s.players === 2
      ? `Split screen. P1: ${s.keys.p1}, Left Shift to drift, Space for power-ups. P2: the arrows, Right Shift to drift, and ${s.keys.p2Item} (left of Right Shift) for power-ups. Gamepads work too: the first is P1's, the second P2's.`
      : "One player, the whole screen.";
    $("driver-strip").innerHTML = s.drivers.map((d) => `
      <button class="driver-tile ${d.index === s.selectedDriver ? "is-on" : ""}" data-driver="${d.index}" style="--team:${esc(d.teamColor)}"
        type="button" role="option" aria-selected="${d.index === s.selectedDriver}" title="${esc(d.name)}"><b>${num(d.number)}</b><span>${esc(d.code)}</span></button>`).join("");
    // The season: resume the saved one (its own driver and settings), or start over.
    const saved = s.savedSeason;
    $("start-cup").innerHTML = saved
      ? `<span>Resume season · Race ${num(saved.nextRace)} of ${num(saved.races)} ›</span>`
      : !race.ready
        ? (race.mode === "custom" ? `<span>Choose ${num(race.cupSize)} circuits ›</span>` : "<span>Choose a circuit ›</span>")
        : cur.single ? "<span>Start single race ›</span>" : `<span>Start ${esc(cur.name)} ›</span>`;
    $("season-hint").textContent = saved
      ? `Saved: ${saved.driver} on ${saved.difficulty}, ${saved.grid.toLowerCase()}, ${saved.weather.toLowerCase()} weather. Resuming keeps its driver and these settings.`
      : cur.season ? `All ${num(cur.circuits.length)} races in calendar order, for the drivers' and constructors' titles. Saved after every race.` : "";
    $("season-hint").classList.toggle("hidden", !cur.season);
    $("new-season").classList.toggle("hidden", !saved);
    $("new-season").textContent = saved && saved.confirming ? "Throw away the saved season? Click again" : "New season";
    refreshCareerChip();
    restoreFocus(was);
    showroomStale = true;
  }

  // The row under Race for a random cup (the reroll), a custom cup (the
  // picker) or a single race (random or chosen), with its hint.
  function renderPickRow(race) {
    const mode = race.mode;
    const row = $("pick-row");
    row.hidden = !["random", "custom", "single"].includes(mode);
    const reroll = '<button class="pill pick-btn" data-action="reroll" type="button"><i aria-hidden="true">↻</i> Reroll</button>';
    const choose = (label) => `<button class="pill pick-btn" data-action="pickCircuits" type="button" aria-haspopup="dialog">${esc(label)}</button>`;
    let label = "";
    let controls = "";
    let hint = "";
    if (mode === "random") {
      label = "Draw";
      controls = reroll;
      hint = `Four circuits drawn from all ${num(race.poolSize)}, no repeats. Reroll for another four.`;
    } else if (mode === "custom") {
      label = "Circuits";
      controls = choose(race.custom.length ? "Change circuits" : "Choose circuits");
      hint = "Any four circuits, in the order you choose.";
    } else if (mode === "single") {
      label = "Circuit";
      controls = [["random", "Random"], ["chosen", "Chosen"]].map(([id, name]) => `
        <button class="pill ${race.single.pick === id ? "is-on" : ""}" data-single="${id}" type="button" aria-pressed="${race.single.pick === id}">${name}</button>`).join("")
        + (race.single.pick === "random" ? reroll : choose(race.single.circuitId ? "Change circuit" : "Choose circuit"));
      hint = race.single.pick === "random"
        ? `One race at a circuit drawn from all ${num(race.poolSize)}. Reroll for another.`
        : "One race at the circuit you choose.";
    }
    $("pick-label").textContent = label;
    $("pick-controls").innerHTML = controls;
    $("race-hint").textContent = hint;
    $("race-hint").classList.toggle("hidden", !hint);
  }

  // ---- The circuit picker (a custom cup's four, or a single race's one) ----
  const outlines = {};
  function outline(id) {
    if (outlines[id] !== undefined) return outlines[id];
    const shape = typeof TRACK_SHAPES !== "undefined" ? TRACK_SHAPES[id] : null;
    const map = window.TrackMap && shape ? TrackMap.path(shape.points, { width: 120, height: 76, padding: 7 }) : null;
    outlines[id] = map && map.d
      ? `<svg class="cc-map" viewBox="${map.viewBox}" aria-hidden="true"><path d="${map.d}"/>${map.start ? `<circle cx="${map.start.x}" cy="${map.start.y}" r="3.4"/>` : ""}</svg>`
      : '<svg class="cc-map" viewBox="0 0 120 76" aria-hidden="true"></svg>';
    return outlines[id];
  }

  const pickerSingle = () => Boolean(window.Game && Game.getPitLaneState().race.mode === "single");

  function showCircuitPicker() {
    if (!window.Game || !$("circuits-screen")) return;
    $("circuit-search").value = "";
    renderPicker();
    openOverlayId("circuits-screen");
  }

  function refreshCircuitPicker() {
    if (openOverlay === "circuits-screen") renderPicker();
  }

  // The focused control of the picker, to find again after a redraw.
  function pickerFocus() {
    const el = document.activeElement;
    if (!el || !$("circuits-screen").contains(el)) return null;
    for (const key of ["pick", "move", "unpick", "action"]) if (el.dataset && el.dataset[key] !== undefined) return { key, value: el.dataset[key] };
    return el.id ? { id: el.id } : null;
  }

  function restorePickerFocus(was) {
    if (!was || openOverlay !== "circuits-screen" || $("circuits-screen").contains(document.activeElement)) return;
    let el = was.id ? $(was.id) : [...$("circuits-screen").querySelectorAll(`[data-${was.key}]`)].find((n) => n.dataset[was.key] === was.value);
    // A move button at the end of the order, now disabled, or a removed slot:
    // the search box.
    if (!el || el.disabled) el = $("circuit-search");
    el.focus({ preventScroll: true });
  }

  function renderPicker() {
    const was = pickerFocus();
    const race = Game.getPitLaneState().race;
    const single = race.mode === "single";
    const size = race.cupSize;
    $("circuits-kicker").textContent = single ? "Single race" : "Custom cup";
    $("circuits-title").textContent = single ? "Choose a circuit" : `Choose ${size} circuits`;
    $("circuit-order").hidden = single;
    $("picker-clear").hidden = single || !race.custom.length;
    const circuit = (id) => race.pool.find((c) => c.id === id) || { name: id, short: id };
    const named = (id) => circuit(id).name;
    $("circuit-order").innerHTML = single ? "" : Array.from({ length: size }, (_, i) => {
      const id = race.custom[i];
      if (!id) return `<li class="is-empty"><b>${i + 1}</b><span>Pick a circuit</span></li>`;
      const name = named(id);
      return `<li data-circuit="${esc(id)}" title="${esc(name)}"><b>${i + 1}</b><span>${esc(circuit(id).short)}</span>
        <button class="cc-btn" data-move="${i}:-1" type="button" aria-label="Move ${esc(name)} earlier"${i === 0 ? " disabled" : ""}>‹</button>
        <button class="cc-btn" data-move="${i}:1" type="button" aria-label="Move ${esc(name)} later"${i === race.custom.length - 1 ? " disabled" : ""}>›</button>
        <button class="cc-btn" data-unpick="${esc(id)}" type="button" aria-label="Take ${esc(name)} out">×</button></li>`;
    }).join("");
    const n = race.custom.length;
    $("circuit-count").textContent = single
      ? (race.single.circuitId ? `Chosen: ${named(race.single.circuitId)}.` : "Click a circuit to race it.")
      : n >= size ? `All ${size} chosen. Take one out to swap it for another.` : `${n} of ${size} chosen. Pick them in the order you want to race them.`;
    renderPickerCards(race);
    restorePickerFocus(was);
  }

  function renderPickerCards(race = Game.getPitLaneState().race) {
    const was = pickerFocus();
    const single = race.mode === "single";
    const query = $("circuit-search").value;
    const found = window.Choices ? Choices.search(race.pool, query) : race.pool;
    const full = !single && race.custom.length >= race.cupSize;
    $("circuit-cards").innerHTML = found.length ? found.map((c) => {
      const slot = single ? (race.single.circuitId === c.id ? 1 : 0) : race.custom.indexOf(c.id) + 1;
      return `<button class="circuit-card ${slot ? "is-on" : ""} ${full && !slot ? "is-full" : ""}" data-pick="${esc(c.id)}" type="button" aria-pressed="${Boolean(slot)}"
        title="${esc(c.name)}">${outline(c.id)}${slot && !single ? `<b class="cc-slot" aria-label="Race ${slot}">${slot}</b>` : ""}
        <strong>${esc(c.name)}</strong><span>${esc(c.country)}${c.cup ? ` · ${esc(c.cup)}` : ""}</span></button>`;
    }).join("") : `<p class="muted picker-empty">No circuit matches ‘${esc(query.trim())}’.</p>`;
    restorePickerFocus(was);
  }

  // After the arrow keys change driver: bring the chosen tile into view.
  function revealSelectedDriver() {
    const tile = document.querySelector("#driver-strip .driver-tile.is-on");
    if (tile) tile.scrollIntoView({ block: "nearest", inline: "nearest" });
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
    // The players are always on the tower (two, in a two-player race).
    const extra = rows.filter((row) => row.isPlayer && !top.includes(row));
    // A position can be a number, or a dash for a car still on its qualifying lap.
    const place = (p) => (typeof p === "number" ? num(p) : esc(p));
    const row = (r) => `<div class="tower-row ${r.isPlayer ? "is-player" : ""}${tagClass(r)}"><b>${place(r.position)}</b><i style="background:${esc(r.teamColor)}"></i><span>${esc(r.code)}${tagHtml(r)}</span><em>${esc(r.gap)}</em></div>`;
    $("tower").innerHTML = top.map(row).join("") + (extra.length ? `<div class="tower-gap"></div>${extra.map(row).join("")}` : "");
  }

  // A two-player race's P1 and P2 tags, in each player's colour.
  function tagHtml(r) {
    return r.tag === "P1" || r.tag === "P2" ? ` <small class="ptag">${r.tag}</small>` : "";
  }
  function tagClass(r) {
    return r.tag === "P2" ? " is-p2" : r.tag === "P1" ? " is-p1" : "";
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
    lastResults = summary;
    hideMain();
    $("results-kicker").textContent = summary.kicker;
    $("results-title").textContent = summary.title;
    podiumLoading(false);
    $("results-next").innerHTML = `<span>${esc(summary.nextLabel)} ›</span>`;
    $("results-table").innerHTML = `
      <div class="result-head"><span>Pos</span><span></span><span>Driver</span><span>Time</span><span>Gap</span><span>Best lap</span><span>Race</span><span>${esc(summary.pointsLabel || "Cup")}</span></div>
      ${summary.rows.map((r) => `
        <div class="result-row ${r.isPlayer ? "is-player" : ""}${tagClass(r)}">
          <b>${esc(ordinal(num(r.place)))}</b><i style="background:${esc(r.teamColor)}"></i>
          <span>${esc(r.name)}${tagHtml(r)}</span>
          <span class="r-time">${esc(r.time)}</span><span class="r-gap">${esc(r.gap)}</span>
          <span class="${r.fastest ? "is-fastest" : ""}">${esc(r.bestLap)}</span>
          <span>${num(r.racePoints)}</span><span>${num(r.cupPoints)}</span>
        </div>`).join("")}`;
    // The season's tables, beneath: the drivers', then the constructors'.
    const standings = summary.drivers || [];
    const teams = summary.constructors || [];
    $("results-standings").innerHTML = (standings.length ? `
      <div class="result-head"><span>Pos</span><span></span><span>Drivers</span><span>Points</span></div>
      ${standings.map((d) => `
        <div class="result-row ${d.isPlayer ? "is-player" : ""}">
          <b>${esc(ordinal(num(d.position)))}</b><i style="background:${esc(d.teamColor)}"></i>
          <span>${esc(d.name)}</span><span>${num(d.points)}</span>
        </div>`).join("")}` : "") + (teams.length ? `
      <div class="result-head"><span>Pos</span><span></span><span>Constructors</span><span>Points</span></div>
      ${teams.map((t) => `
        <div class="result-row ${t.isPlayer ? "is-player" : ""}">
          <b>${esc(ordinal(num(t.position)))}</b><i style="background:${esc(t.teamColor)}"></i>
          <span>${esc(t.name)}</span><span>${num(t.points)}</span>
        </div>`).join("")}` : "");
    $("results-standings").classList.toggle("hidden", !teams.length);
    renderStrip($("results-career"), summary.career);
    $("results-replay").hidden = !(window.Game && Game.replay && Game.replay.available());
    show("results-screen");
    $("results-next").focus();
  }

  // Back from the replay: the same results, focus on the replay button.
  function showResultsAgain() {
    if (!lastResults) return;
    showResults(lastResults);
    $("results-replay").focus();
  }

  // ---- Replay: the broadcast graphics and the controls ----
  let lastResults = null;
  let seeking = false;
  let replayDuration = 0;
  let replayButtons = null;
  let towerOrder = "";
  let towerAt = 0;
  const replayShown = {};

  function onReplayControl(what, value) {
    const R = Game.replay;
    if (what === "play") R.togglePlay();
    else if (what === "speed") R.setSpeed(Number(value));
    else if (what === "camera") R.setCamera(value);
    else if (what === "prev") R.focusStep(-1);
    else if (what === "next") R.focusStep(1);
    else if (what === "exit") R.exit();
  }

  function showReplay() {
    hideMain();
    closeOverlay();
    Object.keys(replayShown).forEach((k) => { delete replayShown[k]; });
    towerOrder = "";
    show("replay-screen");
    $("bc-play").focus({ preventScroll: true });
  }

  // Writes only what changed (this runs every frame).
  function put(key, node, html) {
    if (replayShown[key] === html) return false;
    replayShown[key] = html;
    node.innerHTML = html;
    return true;
  }

  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function updateReplay(info) {
    replayDuration = info.duration;
    put("speed", $("bc-speed"), info.playing ? (info.speed === 1 ? "" : esc(`${info.speed}x`)) : "PAUSED");
    put("track", $("bc-track"), esc(info.track));
    put("lap", $("bc-lap"), esc(info.lap));
    // The tower refreshes four times a second, as the race's own does (its
    // gaps move every frame between samples), and at once on a change of
    // order or of the car in view.
    const top = info.tower.slice(0, 10);
    const focus = info.tower.find((r) => r.isFocus);
    const extra = focus && !top.includes(focus) ? [focus] : [];
    const order = top.concat(extra).map((r) => `${r.code}${r.isFocus ? "*" : ""}`).join();
    const wall = performance.now();
    const towerDue = order !== towerOrder || wall - towerAt >= 250;
    if (towerDue) { towerOrder = order; towerAt = wall; }
    const row = (r) => `<div class="bc-row ${r.isFocus ? "is-focus" : ""} ${r.isPlayer ? "is-player" : ""}${tagClass(r)}"><b>${num(r.position)}</b><i style="background:${esc(r.teamColor)}"></i><span>${esc(r.code)}${tagHtml(r)}</span><em>${esc(r.gap)}</em></div>`;
    if (towerDue) put("rows", $("bc-rows"), top.map(row).join("") + (extra.length ? `<div class="bc-row-gap"></div>${extra.map(row).join("")}` : ""));
    const f = info.focus;
    const parts = String(f.name).trim().split(/\s+/);
    const last = parts.pop() || "";
    // The card slides in when the camera changes car; its position and
    // interval update in place.
    const newCard = put("third", $("bc-third"), `
      <div class="bc-third-card" style="--team:${esc(f.color)}" data-car="${esc(f.id)}">
        <b class="bc-third-pos" id="bc-pos"></b>
        <span class="bc-third-num">${num(f.number)}</span>
        <div class="bc-third-name"><strong>${esc(parts.join(" "))} <em>${esc(last.toUpperCase())}</em></strong><small>${esc(f.team)}${f.tag ? ` · ${esc(f.tag)}` : f.isPlayer ? " · You" : ""}</small></div>
        <span class="bc-third-int" id="bc-int"></span>
      </div>`);
    if (newCard) {
      delete replayShown.pos; delete replayShown.int;
      // Said once when the camera changes car (the card itself changes every frame).
      $("bc-announce").textContent = `On camera: ${f.name}, ${f.team}`;
    }
    put("pos", $("bc-pos"), f.finished ? "FIN" : `P${num(f.place)}`);
    put("int", $("bc-int"), esc(f.interval));
    const onboard = (info.shown || info.mode) === "onboard";
    $("bc-trace").classList.toggle("hidden", !onboard);
    if (onboard) drawTrace(info.trace, f);
    put("play", $("bc-play"), info.playing ? "<span class=\"bc-icon-pause\"></span>" : "<span class=\"bc-icon-play\"></span>");
    $("bc-play").setAttribute("aria-label", info.playing ? "Pause" : "Play");
    const buttons = replayButtons || (replayButtons = {
      speed: [...document.querySelectorAll("#replay-screen [data-replay=speed]")],
      camera: [...document.querySelectorAll("#replay-screen [data-replay=camera]")],
    });
    buttons.speed.forEach((b) => {
      const on = Number(b.dataset.value) === info.speed;
      if (b.getAttribute("aria-pressed") !== String(on)) b.setAttribute("aria-pressed", String(on));
    });
    buttons.camera.forEach((b) => {
      const on = b.dataset.value === info.camera;
      if (b.getAttribute("aria-pressed") !== String(on)) b.setAttribute("aria-pressed", String(on));
      // Under the director, the camera it has cut to is marked live.
      b.classList.toggle("is-live", info.director && b.dataset.value === info.mode);
    });
    put("focus", $("bc-focus"), esc(f.code));
    if (!seeking) $("bc-seek").value = String(info.duration ? Math.round((info.time / info.duration) * 1000) : 0);
    if (put("time", $("bc-time"), `${clock(info.time)} / ${clock(info.duration)}`)) {
      $("bc-seek").setAttribute("aria-valuetext", `${clock(info.time)} of ${clock(info.duration)}`);
    }
  }

  // The onboard input trace: throttle and brake now, four seconds of both,
  // and the steering.
  function drawTrace(trace, focus) {
    put("traceLabel", $("bc-trace-label"), focus.tag ? esc(`${focus.tag} inputs`) : focus.isPlayer ? "Your inputs" : esc(`${focus.code} controls`));
    put("kph", $("bc-kph"), `${num(focus.kph)}<small> KM/H</small>`);
    $("bc-thr").style.height = `${Math.round(trace.throttle * 100)}%`;
    $("bc-brk").style.height = `${Math.round(trace.brake * 100)}%`;
    // Full lock puts the marker at the bar's end (the percentage is of the bar).
    $("bc-steer").style.left = `calc(${(50 + Math.max(-1, Math.min(1, trace.steer)) * 50).toFixed(1)}% - 0.5em)`;
    const canvas = $("bc-graph");
    const g = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(255, 255, 255, 0.12)";
    g.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((y) => { g.beginPath(); g.moveTo(0, h * y); g.lineTo(w, h * y); g.stroke(); });
    const list = trace.history;
    const line = (key, color) => {
      if (list.length < 2) return;
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.lineJoin = "round";
      g.beginPath();
      list.forEach((p, i) => {
        const x = (i / (list.length - 1)) * (w - 2) + 1;
        const y = h - 4 - p[key] * (h - 8);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    };
    line("throttle", "#39d98a");
    line("brake", "#ff3b30");
  }

  function showQualifying(summary) {
    hideMain();
    $("qualifying-kicker").textContent = summary.kicker;
    $("qualifying-title").textContent = summary.title;
    $("qualifying-table").innerHTML = `
      <div class="result-head quali-head"><span>Pos</span><span></span><span>Driver</span><span>Time</span><span>Gap</span></div>
      ${summary.rows.map((r) => `
        <div class="result-row quali-row ${r.isPlayer ? "is-player" : ""}${tagClass(r)} ${r.position === 1 ? "is-pole" : ""}" data-id="${esc(r.id)}">
          <b>${esc(ordinal(num(r.position)))}</b><i style="background:${esc(r.teamColor)}"></i>
          <span>${esc(r.name)}${tagHtml(r)}</span>
          <span class="r-time">${esc(r.time)}</span><span class="r-gap">${esc(r.gap)}</span>
        </div>`).join("")}`;
    $("qualifying-note").textContent = summary.note || "";
    show("qualifying-screen");
    // Keyboard: the race is one Enter away, and Back to pit lane isn't the first stop.
    $("qualifying-screen").querySelector('[data-action="race"]').focus();
  }

  // options.threeD: the ceremony is ready and draws this frame; the screen
  // opens over it at once (never the 2D steps first).
  function showPodium(summary, { threeD = false } = {}) {
    hideMain();
    $("podium-kicker").textContent = summary.kicker;
    $("podium-title").textContent = summary.title;
    const order = [summary.podium[1], summary.podium[0], summary.podium[2]].filter(Boolean);
    $("podium-scene").innerHTML = order.map((p) => `
      <div class="podium-step p${num(p.place)} ${p.isPlayer ? "is-player" : ""}" style="--team:${esc(p.teamColor)}">
        <strong>${esc(p.name)}</strong><span>${esc(p.team)} · ${num(p.points)} pts</span>
        <div class="block">${num(p.place)}</div>
      </div>`).join("");
    // The same three as name plates, for when the ceremony draws in 3D
    // (placePodium puts each under its driver).
    $("podium-plates").innerHTML = summary.podium.map((p) => `
      <div class="podium-plate p${num(p.place)} ${p.isPlayer ? "is-player" : ""}" data-place="${num(p.place)}" style="--team:${esc(p.teamColor)}">
        <b>${esc(ordinal(num(p.place)))}</b><strong>${esc(p.name)}</strong><span>${esc(p.team)}</span><em>${num(p.points)} pts</em>
      </div>`).join("");
    renderStrip($("podium-career"), summary.career);
    podiumLayout = null;
    podiumHead = null;
    // Measured again whenever a plate or the title changes size (a font
    // arriving, a window settling), not only when the window's size does.
    if (typeof ResizeObserver === "function") {
      if (!podiumSizes) podiumSizes = new ResizeObserver(() => { podiumLayout = null; podiumHead = null; });
      podiumSizes.disconnect();
      [...document.querySelectorAll("#podium-plates .podium-plate"), $("podium-kicker"), $("podium-title"), $("podium-career")].forEach((el) => podiumSizes.observe(el));
    }
    const screen = $("podium-screen");
    screen.classList.toggle("is-3d", threeD);
    screen.classList.remove("plates-in");
    show("podium-screen");
  }

  // Show podium pressed while the ceremony is still being readied: the
  // button says so (and can't be pressed again) until it opens.
  // (aria-disabled, not disabled: the button keeps the keyboard's focus; the
  // game ignores presses while it waits. The replay can't be opened meanwhile.)
  function podiumLoading(on) {
    const next = $("results-next");
    if (!next) return;
    if (on && !next.dataset.label) {
      next.dataset.label = next.innerHTML;
      next.innerHTML = "<span>Readying the podium…</span>";
    } else if (!on && next.dataset.label) {
      next.innerHTML = next.dataset.label;
      delete next.dataset.label;
    }
    if (on) {
      next.setAttribute("aria-disabled", "true");
      next.setAttribute("aria-busy", "true");
    } else {
      next.removeAttribute("aria-disabled");
      next.removeAttribute("aria-busy");
    }
    $("results-replay").disabled = on;
  }

  // anchors: [{ place, x, y }] in the window's pixels, from the 3D scene; null
  // goes back to the 2D steps. platesIn: whether the plates are showing yet. Each plate is centred on its point and kept on
  // screen, clear of the title above and the buttons below.
  // What placePodium measures (the title's foot, the buttons, each plate's
  // size), read once per window size and content rather than every frame.
  let podiumLayout = null;
  let podiumSizes = null;
  function measurePodium(screen) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const key = `${W}x${H}`;
    if (podiumLayout && podiumLayout.key === key) return podiumLayout;
    const plates = {};
    screen.querySelectorAll(".podium-plate").forEach((plate) => {
      const { width: w, height: h } = plate.getBoundingClientRect();
      plates[plate.dataset.place] = { plate, w, h };
    });
    podiumLayout = {
      key, W, H, plates,
      head: $("podium-title").getBoundingClientRect().bottom,
      actions: screen.querySelector(".podium-foot .overlay-actions").getBoundingClientRect(),
    };
    return podiumLayout;
  }

  // The showroom: the largest open stretch of the pit lane, clear of all its
  // controls, where the car turns (Render3D.renderGarage fits the car into
  // it). Null where there is no room for a car worth seeing: it is not drawn
  // rather than drawn under the controls. Measured only when the pit lane
  // may have moved (refreshed, resized, scrolled, fonts in); behind an open
  // overlay the car keeps its place.
  const SHOWROOM_PARTS = "#pitlane .pitlane-top, #pitlane .choice-row, #pitlane .choice-hint, #pitlane .cup-circuits, #pitlane .new-season, #pitlane .pitlane-driver, #pitlane #driver-strip, #pitlane #start-cup";
  const SHOWROOM_GAP = 14;
  // A cell of about 12px, coarser on very large windows (the search grows
  // with the square of the rows).
  const showroomCell = (W) => Math.max(12, Math.ceil(W / 160));
  let showroomStale = true;
  let showroomOverride = null;
  // For the site's photographs: a fixed place for the car (or null to stop).
  function setShowroomArea(area) {
    showroomOverride = area;
  }
  // A car seen from the showroom camera is about this much wider than tall.
  const SHOWROOM_ASPECT = 2.3;
  let showroom = null;
  function showroomArea() {
    if (showroomOverride) return showroomOverride;
    const pit = $("pitlane");
    if (!pit || pit.classList.contains("hidden")) return null;
    if (openOverlay) return showroom ? showroom.area : null;
    if (!showroomStale && showroom) return showroom.area;
    showroomStale = false;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const SHOWROOM_CELL = showroomCell(W);
    const boxes = [...document.querySelectorAll(SHOWROOM_PARTS)]
      .filter((el) => !el.hidden && !el.classList.contains("hidden") && el.getClientRects().length)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const key = `${W}x${H}|${boxes.map((r) => `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`).join(";")}`;
    if (showroom && showroom.key === key) return showroom.area;
    // Free cells on a grid over the window, then the largest rectangle of
    // them that holds the biggest car.
    const cols = Math.floor((W - 2 * SHOWROOM_GAP) / SHOWROOM_CELL);
    const rows = Math.floor((H - 2 * SHOWROOM_GAP) / SHOWROOM_CELL);
    const free = [];
    for (let y = 0; y < rows; y += 1) {
      const top = SHOWROOM_GAP + y * SHOWROOM_CELL;
      const row = [];
      for (let x = 0; x < cols; x += 1) {
        const left = SHOWROOM_GAP + x * SHOWROOM_CELL;
        row.push(!boxes.some((r) => left < r.right + SHOWROOM_GAP && left + SHOWROOM_CELL > r.left - SHOWROOM_GAP
          && top < r.bottom + SHOWROOM_GAP && top + SHOWROOM_CELL > r.top - SHOWROOM_GAP));
      }
      free.push(row);
    }
    let best = null;
    const run = new Array(cols).fill(true);
    for (let y0 = 0; y0 < rows; y0 += 1) {
      run.fill(true);
      for (let y1 = y0; y1 < rows; y1 += 1) {
        for (let x = 0; x < cols; x += 1) run[x] = run[x] && free[y1][x];
        const h = (y1 - y0 + 1) * SHOWROOM_CELL;
        let start = -1;
        for (let x = 0; x <= cols; x += 1) {
          if (x < cols && run[x]) { if (start < 0) start = x; continue; }
          if (start >= 0) {
            const w = (x - start) * SHOWROOM_CELL;
            const size = Math.min(w / SHOWROOM_ASPECT, h);
            if (!best || size > best.size) best = { size, left: SHOWROOM_GAP + start * SHOWROOM_CELL, top: SHOWROOM_GAP + y0 * SHOWROOM_CELL, width: w, height: h };
            start = -1;
          }
        }
      }
    }
    const area = best && best.width >= 160 && best.height >= 70
      ? { left: best.left, top: best.top, right: best.left + best.width, bottom: best.top + best.height }
      : null;
    showroom = { key, area };
    return area;
  }

  // The title's box as drawn over the 3D scene (kicker and title as far as
  // their text runs, the career strip as a panel), for the ceremony to keep
  // the wall's title clear of. Measured in the 3D layout, once per size.
  let podiumHead = null;
  function podiumReserve() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    // (Measured again once the web fonts are in: the text's width changes.)
    const key = `${W}x${H}:${document.fonts ? document.fonts.status : ""}`;
    if (podiumHead && podiumHead.key === key) return podiumHead.box;
    const screen = $("podium-screen");
    const was = screen.classList.contains("is-3d");
    screen.classList.add("is-3d");
    const boxes = ["podium-kicker", "podium-title", "podium-career"].map((id) => $(id))
      .filter((el) => el && !el.classList.contains("hidden") && el.getClientRects().length)
      .map((el) => {
        if (el.id === "podium-career") return el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect();
      });
    if (!was) screen.classList.remove("is-3d");
    const box = boxes.length ? {
      left: Math.min(...boxes.map((b) => b.left)),
      top: Math.min(...boxes.map((b) => b.top)),
      right: Math.max(...boxes.map((b) => b.right)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    } : null;
    podiumHead = { key, box };
    return box;
  }

  function placePodium(anchors, platesIn = true) {
    const screen = $("podium-screen");
    const on = Boolean(anchors && anchors.length);
    if (on !== screen.classList.contains("is-3d")) podiumLayout = null;
    screen.classList.toggle("is-3d", on);
    screen.classList.toggle("plates-in", on && platesIn);
    if (!on) return;
    const { W, H, head, actions, plates } = measurePodium(screen);
    const margin = 12;
    const placed = anchors.map((a) => {
      const m = plates[a.place];
      if (!m) return null;
      return { plate: m.plate, place: a.place, w: m.w, h: m.h, x: a.x, y: a.y };
    }).filter(Boolean).sort((a, b) => a.x - b.x);
    // Side by side with a gap: pushed apart where they would touch, and kept
    // inside the window. If the window is too narrow for all three in a row,
    // the winner's drops below the other two.
    const gap = 8;
    // A row of plates (sorted by x), pushed apart where they would touch and
    // kept inside the window.
    const spread = (row) => {
      for (let i = 1; i < row.length; i += 1) {
        const l = row[i - 1];
        const r = row[i];
        r.x = Math.max(r.x, l.x + l.w / 2 + gap + r.w / 2);
      }
      const last = row[row.length - 1];
      last.x = Math.min(last.x, W - margin - last.w / 2);
      for (let i = row.length - 2; i >= 0; i -= 1) {
        const l = row[i];
        const r = row[i + 1];
        l.x = Math.min(l.x, r.x - r.w / 2 - gap - l.w / 2);
      }
      row[0].x = Math.max(row[0].x, margin + row[0].w / 2);
    };
    const room = placed.reduce((sum, p) => sum + p.w, 0) + gap * (placed.length - 1) <= W - margin * 2;
    if (room) {
      spread(placed);
    } else {
      // The other two side by side (apart, as above), the winner's below them.
      const winner = placed.find((p) => p.place === 1);
      const others = placed.filter((p) => p !== winner);
      if (winner) winner.x = Math.max(margin + winner.w / 2, Math.min(W - margin - winner.w / 2, winner.x));
      if (others.length) {
        spread(others);
        const top = Math.max(...others.map((p) => p.y));
        others.forEach((p) => { p.y = top; });
        if (winner) winner.y = top + Math.max(...others.map((p) => p.h)) + gap;
      }
    }
    placed.forEach((p) => {
      // Clear of the buttons when it would sit over them.
      const overButtons = p.x + p.w / 2 > actions.left - 8 && p.x - p.w / 2 < actions.right + 8;
      const floor = (overButtons ? actions.top : H) - 8;
      const y = Math.max(head + 8, Math.min(floor - p.h, p.y));
      p.plate.style.transform = `translate(${Math.round(p.x - p.w / 2)}px, ${Math.round(y)}px)`;
    });
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
        }).join("")}</tbody></table>` : `<p class="muted">No careers yet. Pick any driver and race to start theirs.</p>`}
      <div class="overlay-actions"><button class="ghost-btn" data-action="close" data-autofocus type="button">Back (Esc)</button></div>`;
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
    // Graphics: the player's choice, and with Auto, what it picked.
    const r3d = window.Render3D;
    const g = r3d && r3d.graphics ? r3d.graphics() : null;
    // Without the 3D renderer there is nothing to choose: the row and its
    // note go together.
    $("graphics-setting").hidden = !g;
    if (g) {
      const name = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      $("graphics-toggle").textContent = g.choice === "auto" ? `Auto (${name(g.tier)})` : name(g.choice);
      $("graphics-note").textContent = {
        high: "The full broadcast look: grade, bloom, vignette, speed blur, a sun flare by day, heat haze at Bahrain, and bursts on your big moments.",
        medium: "Grade, bloom, vignette and bursts on your big moments.",
        low: "No post-processing: the lightest on your machine.",
      }[g.tier];
    }
  }

  // Auto, High, Medium, Low, then round again.
  function cycleGraphics() {
    const r3d = window.Render3D;
    if (!r3d || !r3d.setGraphics) return;
    const order = ["auto", "high", "medium", "low"];
    const now = r3d.graphics().choice;
    r3d.setGraphics(order[(order.indexOf(now) + 1) % order.length]);
  }

  function showPhoneNote() {
    openOverlayId("phone-note");
  }

  function phoneNoteSeen() {
    try {
      return window.sessionStorage.getItem(PHONE_NOTE_KEY) === "seen";
    } catch (error) {
      return false;
    }
  }

  const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";
  function focusables(id) {
    return [...$(id).querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  }

  function openOverlayId(id) {
    if (!openOverlay) focusBeforeOverlay = document.activeElement;
    OVERLAYS.forEach(hide);
    show(id);
    openOverlay = id;
    // Behind it, the pit lane is out of reach: no focus, no clicks, no reading.
    $("pitlane").inert = true;
    // Focus moves into the overlay: the control it names (the career screen's
    // Back, never a row that would switch driver), else its main action, else
    // its first control.
    const inside = focusables(id);
    const main = inside.find((el) => el.hasAttribute("data-autofocus"))
      || inside.find((el) => el.classList.contains("go-btn")) || inside[0];
    if (main) main.focus({ preventScroll: true });
  }

  function closeOverlay() {
    if (!openOverlay) return false;
    const closing = openOverlay;
    hide(openOverlay);
    openOverlay = null;
    $("pitlane").inert = false;
    if (closing === "phone-note") {
      try {
        window.sessionStorage.setItem(PHONE_NOTE_KEY, "seen");
      } catch (error) {
        // Shown again next time, that's all.
      }
      if (careerAfterNote) {
        careerAfterNote = false;
        showCareer();
        return true;
      }
    }
    const back = focusBeforeOverlay;
    focusBeforeOverlay = null;
    // The picker's own button is drawn again while it is open: back to its
    // new self.
    const again = closing === "circuits-screen" && (!back || !back.isConnected) ? $("pitlane").querySelector('[data-action="pickCircuits"]') : null;
    if (back && back !== document.body && back.isConnected && back.getClientRects().length && typeof back.focus === "function") back.focus({ preventScroll: true });
    else if (again) again.focus({ preventScroll: true });
    else focusPitLane(true);
    return true;
  }

  // Tab and Shift+Tab stay inside an open overlay.
  function trapFocus(event) {
    if (event.key !== "Tab" || !openOverlay) return;
    const inside = focusables(openOverlay);
    if (!inside.length) return;
    const first = inside[0];
    const last = inside[inside.length - 1];
    const within = $(openOverlay).contains(document.activeElement);
    if (event.shiftKey && (!within || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!within || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  // Another tab raced: show its progress here too.
  function onStorage(event) {
    if (event.key !== null && !String(event.key).startsWith("f1pixelcup.profile")) return;
    if (!$("pitlane")) return;
    refreshCareerChip();
    if (openOverlay === "career-screen") {
      // Redraw, keeping focus on the same control.
      const f = document.activeElement;
      const same = f && $("career-card").contains(f)
        ? (f.dataset.driver !== undefined ? `[data-driver="${f.dataset.driver}"]` : f.dataset.action ? `[data-action="${f.dataset.action}"]` : null)
        : null;
      renderCareer();
      const again = same && $("career-card").querySelector(same);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function init() {
    build();
    // The showroom is measured again whenever the pit lane may have moved.
    const stale = () => { showroomStale = true; };
    window.addEventListener("resize", stale);
    $("pitlane").addEventListener("scroll", stale, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(stale).observe($("pitlane"));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(stale);
    document.addEventListener("keydown", trapFocus, true);
    window.addEventListener("storage", onStorage);
    const wantsCareer = window.location.hash === "#career";
    if (window.Device && Device.isTouchOnly(window.matchMedia && window.matchMedia.bind(window)) && !phoneNoteSeen()) {
      // The note comes first; the career opens when it is closed.
      showPhoneNote();
      careerAfterNote = wantsCareer;
    } else if (wantsCareer) {
      showCareer();
    }
  }

  window.Screens = {
    init, showPitLane, refreshPitLane, showRace, updateTower, pushFeed,
    showResults, showResultsAgain, showReplay, updateReplay,
    showQualifying, showPodium, podiumLoading, placePodium, podiumReserve, showroomArea, setShowroomArea, showCareer, showSettings, showPhoneNote, refreshSettings, revealSelectedDriver,
    showCircuitPicker, refreshCircuitPicker,
    closeOverlay, isOverlayOpen: () => Boolean(openOverlay),
  };
}());
