// Landing page: builds the circuits, career and grid sections from the game's
// own data, and warns phones before sending them into a keyboard game.
(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const $ = (id) => document.getElementById(id);

  function lapTime(ms) {
    if (!ms || ms <= 0) return "-:--.---";
    const total = Math.round(ms) / 1000;
    const minutes = Math.floor(total / 60);
    return `${minutes}:${(total - minutes * 60).toFixed(3).padStart(6, "0")}`;
  }

  // A missing shot leaves a styled panel, never a broken-image icon.
  function guardImages() {
    document.querySelectorAll("img").forEach((img) => {
      const fail = () => {
        const holder = img.closest(".hero, .circuit-shot, .season-shot, .team-shot, .pu-shot, .feature-main, .thumb");
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
              <h4>${esc(c.name)}</h4>
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
            <span class="cup-rounds">Rounds ${num(first)} to ${num(round(cup.circuitIds[cup.circuitIds.length - 1]))} · ${esc(circuits.map((c) => c.country).join(", "))}</span>
          </header>
          <div class="cup-circuits-grid">${circuits.map(card).join("")}</div>
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
          <a class="go-btn" href="./play.html?cup=season"><span>Start the season ›</span></a>
        </div>
      </aside>
      ${choicesCard()}`;
  }

  // Your way (docs/superpowers/specs/2026-10-01-race-choices-design.md): a
  // random cup, a custom cup or a single race, each a link into the pit lane
  // with that choice picked.
  function choicesCard() {
    const n = num(CIRCUITS.length);
    const ways = [
      { id: "random", name: "Random cup", link: "Draw a random cup",
        copy: `Four circuits drawn at random from all ${n}, never one twice in a cup. You see the four before the start, and Reroll deals another four. It ends on the podium, with the cup bonus.` },
      { id: "custom", name: "Custom cup", link: "Build a custom cup",
        copy: "Any four circuits, in any order. Search by name or country, pick them by their maps, and move them up and down the running order. It ends on the podium, with the cup bonus." },
      { id: "single", name: "Single race", link: "Start a single race",
        copy: `One circuit, drawn at random from all ${n} or chosen. Its race points and best lap count, and the top three take a podium. One race is not a cup, so there is no cup bonus.` },
    ];
    return `
      <section id="race-choices" class="choices-card" aria-labelledby="race-choices-title">
        <header class="choices-head">
          <p class="kicker">Or race your way</p>
          <h3 id="race-choices-title" class="it-title">Random, custom or one race</h3>
          <p>Pick <b>Race</b> in the pit lane: a cup, the season, a random cup, a custom cup or a single race. Difficulty, the grid, the weather and two players work in the random cup, the custom cup and the single race as in any cup, and every race counts in your driver's career and best laps.</p>
        </header>
        <div class="choices-shots">
          <figure><img src="./assets/shots/choices-pitlane.jpg" alt="The pit lane with a random cup drawn: four circuits shown before the start, and Reroll" loading="lazy"><figcaption>A random cup, drawn before the start</figcaption></figure>
          <figure><img src="./assets/shots/choices-picker.jpg" alt="The circuit picker: a search box, the running order of a custom cup and every circuit by its map" loading="lazy"><figcaption>The circuit picker for a custom cup</figcaption></figure>
        </div>
        <ul class="choices-ways">${ways.map((w) => `
          <li data-way="${w.id}">
            <h4 class="it-title">${esc(w.name)}</h4>
            <p>${esc(w.copy)}</p>
            <a class="ghost-btn" href="./play.html?race=${w.id}">${esc(w.link)} ›</a>
          </li>`).join("")}
        </ul>
      </section>`;
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
        <p>Every driver has their own career, and each one starts at <strong>1200 · F4</strong>. Race as Leclerc and it's Leclerc's career that climbs (his points, rating, poles and best lap on every circuit) while Hamilton's waits for you. Saved in this browser.</p>
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

  // Race day: a gallery per feature, every picture the game's own
  // (tools/capture-shots.js, parts replay, podium and split). The strip's
  // buttons show each picture large; the first is the one shown at load.
  // Who is in the pictures is SHOT_DRIVERS.raceDay, so the alt text names them.
  function raceDayShots() {
    const day = SHOT_DRIVERS.raceDay;
    const name = (id) => (DRIVERS.find((d) => d.id === id) || { name: "A driver" }).name;
    const [first, second, third] = day.podium;
    const [p1, p2] = day.players;
    return {
      replays: [
        { file: "replay-trackside", label: "Trackside", caption: `${shotCar(day.replay)} in the pack at Monaco`,
          alt: `Replay from a trackside camera: ${shotCar(day.replay)} in the pack at Monaco, with the timing tower, the lower third and the replay controls` },
        { file: "replay-onboard", label: "Onboard", caption: `Onboard with ${name(day.onboard)}: the throttle and brake trace and the steering`,
          alt: `Replay onboard ${shotCar(day.onboard)} at Monaco, with ${name(day.onboard)}'s throttle and brake trace and steering bar` },
        { file: "replay-helicopter", label: "Helicopter", caption: `The helicopter over the field, following ${name(day.replay)}`,
          alt: `Replay from the helicopter: the field at Monaco from above, following ${shotCar(day.replay)}` },
        { file: "replay-director", label: "Director", caption: "The director cuts to a battle in the pack",
          alt: "Replay, the director's cut: a battle for position through a Monaco corner, with the broadcast graphics" },
      ],
      podium: [
        { file: "podium-spray", label: "Champagne", caption: `${name(first)}, ${name(second)} and ${name(third)} spray the champagne`,
          alt: `The podium: ${name(first)} on the top step, ${name(second)} second and ${name(third)} third, bareheaded in their team suits, spraying champagne` },
        { file: "podium-arms", label: "Arms up", caption: "Arms up, each one stepping forward",
          alt: `The podium: ${name(first)}, ${name(second)} and ${name(third)} with their arms raised, name plates below` },
        { file: "podium-trophy", label: "Trophy", caption: `${name(first)} lifts the trophy under the confetti`,
          alt: `${name(first)} lifts the trophy between ${name(second)} and ${name(third)} as confetti falls` },
        { file: "podium-orbit", label: "Orbit", caption: "The camera orbits as the confetti settles",
          alt: `The camera orbiting the podium, ${name(first)} on the top step, confetti on the steps` },
      ],
      "two-player": [
        { file: "split-spa", label: "Split screen", caption: `${name(p1)} as P1 (top) and ${name(p2)} as P2 at Eau Rouge`,
          alt: `Split screen at Spa: ${name(p1)} as P1 in the top view and ${name(p2)} as P2 below, each with their own HUD` },
        { file: "split-monaco-wet", label: "In the rain", caption: "P1 and P2 at Monaco in the wet",
          alt: `Split screen at Monaco in the rain: ${name(p1)} as P1 above, ${name(p2)} as P2 below, spray off every car` },
        { file: "split-side-by-side", label: "Side by side", w: 1600, h: 700, caption: "Side by side on a wide window",
          alt: `On a wide window the views sit side by side: ${name(p1)} as P1 on the left, ${name(p2)} as P2 on the right, at Spa` },
        { file: "split-pitlane", label: "Pit lane", caption: `2 players picked, ${name(p2)} as P2's driver`,
          alt: `The pit lane with 2 players picked and ${name(p2)} chosen as P2's driver` },
      ],
    };
  }

  function renderRaceDay() {
    const shots = raceDayShots();
    const base = "./assets/shots/race-day/";
    const sources = (s) => ({ src: `${base}${s.file}.jpg`, srcset: `${base}${s.file}-800.jpg 800w, ${base}${s.file}.jpg 1600w` });
    // The gallery is the wider of two columns (at most about 780 px), or the
    // full width once they stack; a thumbnail is a quarter of it (half on phones).
    const MAIN_SIZES = "(max-width: 900px) 92vw, min(48vw, 780px)";
    const THUMB_SIZES = "(max-width: 520px) 46vw, (max-width: 900px) 23vw, 190px";
    const GROUP_LABELS = { replays: "Replay pictures", podium: "Podium pictures", "two-player": "Two-player pictures" };
    const size = (s) => ({ w: s.w || 1600, h: s.h || 900 });
    document.querySelectorAll("[data-gallery]").forEach((holder) => {
      const list = shots[holder.dataset.gallery] || [];
      if (!list.length) return;
      const lead = list[0];
      holder.innerHTML = `
        <figure class="feature-main">
          <img src="${esc(sources(lead).src)}" srcset="${esc(sources(lead).srcset)}" sizes="${MAIN_SIZES}" width="${size(lead).w}" height="${size(lead).h}" alt="${esc(lead.alt)}" loading="lazy" decoding="async">
          <figcaption aria-live="polite"><span class="cap-tag">${esc(lead.label)}</span><span class="cap-text">${esc(lead.caption)}</span></figcaption>
        </figure>
        <div class="feature-strip" role="group" aria-label="${esc(GROUP_LABELS[holder.dataset.gallery] || "Pictures")}">${list.map((s, i) => `
          <button class="thumb${i === 0 ? " is-on" : ""}" type="button" aria-pressed="${i === 0}" data-index="${i}">
            <img src="${esc(base + s.file)}-400.jpg" srcset="${esc(base + s.file)}-400.jpg 400w, ${esc(base + s.file)}-800.jpg 800w" sizes="${THUMB_SIZES}" width="400" height="${Math.round(400 * size(s).h / size(s).w)}" alt="" loading="lazy" decoding="async">
            <span>${esc(s.label)}</span>
          </button>`).join("")}
        </div>`;
      const figure = holder.querySelector(".feature-main");
      holder.querySelectorAll(".thumb").forEach((button) => button.addEventListener("click", () => {
        const s = list[Number(button.dataset.index)];
        let img = figure.querySelector("img");
        // A picture that failed to load was taken out (guardImages): the next
        // one gets a new image, with the same fallback.
        if (!img) {
          img = Object.assign(document.createElement("img"), { sizes: MAIN_SIZES, loading: "lazy", decoding: "async" });
          img.addEventListener("error", () => { img.remove(); figure.classList.add("no-shot"); }, { once: true });
          figure.classList.remove("no-shot");
          figure.prepend(img);
        }
        Object.assign(img, { srcset: sources(s).srcset, src: sources(s).src, alt: s.alt, width: size(s).w, height: size(s).h });
        figure.querySelector(".cap-tag").textContent = s.label;
        figure.querySelector(".cap-text").textContent = s.caption;
        holder.querySelectorAll(".thumb").forEach((b) => {
          b.classList.toggle("is-on", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
      }));
    });
  }

  // The two players' keys, drawn from the game's own bindings (TwoPlayer.KEYS):
  // the four driving keys as a cluster, drift and power-up below. The game
  // reads keys by position, so these are their places on a QWERTY keyboard.
  const KEY_LABELS = { KeyW: "W", KeyA: "A", KeyS: "S", KeyD: "D", ShiftLeft: "Left Shift", Space: "Space",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", ShiftRight: "Right Shift", Slash: "/" };
  const ACTION_NAMES = { throttle: "Throttle", brake: "Brake, then reverse", left: "Steer left", right: "Steer right", drift: "Drift", item: "Power-up" };

  function renderKeymaps() {
    if (!window.TwoPlayer) return;
    const label = (code) => KEY_LABELS[code] || code;
    const key = (set, action, extra = "") => `<kbd class="key key-${action}" data-action="${action}" title="${esc(ACTION_NAMES[action])}">${set[action].map((c) => esc(label(c))).join(" ")}${extra}</kbd>`;
    const html = TwoPlayer.KEYS.map((set, i) => {
      // Left Shift is drawn before Space, and / before Right Shift, as they sit on the keyboard.
      const lower = i === 0
        ? key(set, "drift", "<small>Drift</small>") + key(set, "item", "<small>Power-up</small>")
        : key(set, "item", "<small>Power-up</small>") + key(set, "drift", "<small>Drift</small>");
      return `<div class="keymap-col" data-player="${i + 1}" aria-hidden="true">
        <p class="keymap-tag">P${i + 1}</p>
        <div class="key-cluster">${key(set, "throttle")}${key(set, "left")}${key(set, "brake")}${key(set, "right")}</div>
        <div class="key-row">${lower}</div>
      </div>`;
    }).join("");
    const spoken = TwoPlayer.KEYS.map((set, i) => `P${i + 1} drives with ${["throttle", "left", "brake", "right"].map((a) => set[a].map(label).join(" or ")).join(" ")}, ${set.drift.map(label).join(" or ")} to drift and ${set.item.map(label).join(" or ")} for power-ups`).join("; ");
    document.querySelectorAll("[data-keymap]").forEach((el) => {
      el.innerHTML = `<p class="visually-hidden">Two-player keys: ${esc(spoken)}.</p>${html}
        <p class="keymap-note">Keys go by their place on the keyboard (on AZERTY, P1 drives with Z Q S D); P2's power-up key is the one just left of Right Shift.</p>`;
    });
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
  renderRaceDay();
  renderKeymaps();
  guardImages();
  guardPlayOnPhones();
}());
