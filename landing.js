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
        const holder = img.closest(".hero, .circuit-shot, .team-shot, .pu-shot, .feature-main, .thumb");
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
          <div class="circuit-shot"><img src="./assets/shots/circuit-${esc(c.id)}.jpg" alt="${esc(shotCar(SHOT_DRIVERS.circuits[c.id]))} at ${esc(c.name)}" loading="lazy"></div>
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
        { file: "replay-onboard", label: "Onboard", caption: `Onboard with ${name(day.onboard)}, and his throttle, brake and steering trace`,
          alt: `Replay onboard ${shotCar(day.onboard)} at Monaco, with the throttle, brake and steering trace` },
        { file: "replay-helicopter", label: "Helicopter", caption: `The helicopter over the field, following ${name(day.replay)}`,
          alt: `Replay from the helicopter: the field at Monaco from above, following ${shotCar(day.replay)}` },
        { file: "replay-director", label: "Director", caption: "The director cuts to a battle in the pack",
          alt: "Replay, the director's choice: three cars wheel to wheel through a Monaco corner, seen through the catch fence" },
      ],
      podium: [
        { file: "podium-spray", label: "Champagne", caption: `${name(first)}, ${name(second)} and ${name(third)} spray the champagne`,
          alt: `The podium: ${name(first)} on the top step, ${name(second)} second and ${name(third)} third, bareheaded in their team suits, spraying champagne` },
        { file: "podium-arms", label: "Arms up", caption: "Arms up, each on stepping forward",
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
    const sources = (s) => ({ src: `./assets/shots/race-day/${s.file}.jpg`, srcset: `./assets/shots/race-day/${s.file}-800.jpg 800w, ./assets/shots/race-day/${s.file}.jpg 1600w` });
    const MAIN_SIZES = "(max-width: 900px) 100vw, 60vw";
    document.querySelectorAll("[data-gallery]").forEach((holder) => {
      const list = shots[holder.dataset.gallery] || [];
      if (!list.length) return;
      const lead = list[0];
      holder.innerHTML = `
        <figure class="feature-main">
          <img src="${sources(lead).src}" srcset="${sources(lead).srcset}" sizes="${MAIN_SIZES}" width="${lead.w || 1600}" height="${lead.h || 900}" alt="${esc(lead.alt)}" loading="lazy" decoding="async">
          <figcaption><span class="cap-tag">${esc(lead.label)}</span><span class="cap-text">${esc(lead.caption)}</span></figcaption>
        </figure>
        <div class="feature-strip" role="group" aria-label="More pictures">${list.map((s, i) => `
          <button class="thumb${i === 0 ? " is-on" : ""}" type="button" aria-pressed="${i === 0}" data-index="${i}">
            <img src="./assets/shots/race-day/${esc(s.file)}-800.jpg" width="800" height="${Math.round(800 * (s.h || 900) / (s.w || 1600))}" alt="" loading="lazy" decoding="async">
            <span>${esc(s.label)}</span>
          </button>`).join("")}
        </div>`;
      holder.querySelectorAll(".thumb").forEach((button) => button.addEventListener("click", () => {
        const s = list[Number(button.dataset.index)];
        const img = holder.querySelector(".feature-main img");
        if (!img) return;
        Object.assign(img, { srcset: sources(s).srcset, src: sources(s).src, alt: s.alt, width: s.w || 1600, height: s.h || 900 });
        holder.querySelector(".cap-tag").textContent = s.label;
        holder.querySelector(".cap-text").textContent = s.caption;
        holder.querySelectorAll(".thumb").forEach((b) => {
          b.classList.toggle("is-on", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
      }));
    });
  }

  // The two players' keys, drawn from the game's own bindings (TwoPlayer.KEYS):
  // the four driving keys as a cluster, drift and power-up below.
  const KEY_LABELS = { KeyW: "W", KeyA: "A", KeyS: "S", KeyD: "D", ShiftLeft: "Left Shift", Space: "Space",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", ShiftRight: "Right Shift", Slash: "/" };
  const ACTION_NAMES = { throttle: "Throttle", brake: "Brake, then reverse", left: "Steer left", right: "Steer right", drift: "Drift", item: "Power-up" };

  function renderKeymaps() {
    if (!window.TwoPlayer) return;
    const key = (set, action, extra = "") => `<kbd class="key key-${action}" data-action="${action}" title="${esc(ACTION_NAMES[action])}">${set[action].map((c) => esc(KEY_LABELS[c] || c)).join(" ")}${extra}</kbd>`;
    const html = TwoPlayer.KEYS.map((set, i) => {
      // On the keyboard P2's "/" sits just left of Right Shift; P1's Left Shift
      // sits left of Space's row. Each pair is drawn in that order.
      const lower = i === 0
        ? key(set, "drift", "<small>Drift</small>") + key(set, "item", "<small>Power-up</small>")
        : key(set, "item", "<small>Power-up</small>") + key(set, "drift", "<small>Drift</small>");
      return `<div class="keymap-col" data-player="${i + 1}">
        <p class="keymap-tag">P${i + 1}</p>
        <div class="key-cluster">${key(set, "throttle")}${key(set, "left")}${key(set, "brake")}${key(set, "right")}</div>
        <div class="key-row">${lower}</div>
      </div>`;
    }).join("");
    const label = (code) => KEY_LABELS[code] || code;
    const spoken = TwoPlayer.KEYS.map((set, i) => `P${i + 1} drives with ${["throttle", "left", "brake", "right"].map((a) => set[a].map(label).join(" or ")).join(" ")}, ${set.drift.map(label).join(" or ")} to drift and ${set.item.map(label).join(" or ")} for power-ups`).join("; ");
    document.querySelectorAll("[data-keymap]").forEach((el) => {
      el.innerHTML = html;
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", `Two-player keys: ${spoken}`);
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
