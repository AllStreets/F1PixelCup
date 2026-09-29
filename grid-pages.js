// The site's driver and team pages (drivers.html, teams.html): the game's 2025
// grid with its real record. Facts come from assets/data/grid-2025.json, built
// from F1DB (CC BY 4.0) by tools/site/build_grid_data.js; colours, cars and
// titles from game-data.js. Every picture is the game's own render.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const plural = (n, one, many = `${one}s`) => `${num(n)} ${num(n) === 1 ? one : many}`;
  const ordinal = (n) => {
    const v = num(n);
    const s = ["th", "st", "nd", "rd"][(v % 100 > 10 && v % 100 < 14) ? 0 : (v % 10 < 4 ? v % 10 : 0)] || "th";
    return `${v}${s}`;
  };
  const teamOf = (id) => TEAMS.find((t) => t.id === id);

  // Age on the day of the season opener.
  function ageAt(dateOfBirth, day) {
    const [y, m, d] = dateOfBirth.split("-").map(Number);
    const [ty, tm, td] = day.split("-").map(Number);
    return ty - y - ((tm < m || (tm === m && td < d)) ? 1 : 0);
  }

  // "Raced for Red Bull in rounds 3-24": only when a driver changed seat, or
  // didn't race the whole season.
  function seatsNote(record) {
    const seats = record.season.teams;
    const full = seats.length === 1 && seats[0].rounds === "1-24";
    if (full) return "";
    return seats.map((s) => `${esc((teamOf(s.teamId) || { short: s.teamId }).short)} in rounds ${esc(s.rounds.replace("-", "–"))}`).join(", then ");
  }

  // Leclerc first, Hamilton second, then team by team.
  function driverOrder(records) {
    const first = ["leclerc", "hamilton"];
    const rest = TEAMS.flatMap((t) => DRIVERS.filter((d) => d.teamId === t.id).map((d) => d.id)).filter((id) => !first.includes(id));
    return [...first, ...rest].map((id) => records.find((r) => r.id === id)).filter(Boolean);
  }

  function renderDrivers(data) {
    const list = $("driver-cards");
    if (!list) return;
    list.innerHTML = driverOrder(data.drivers).map((r) => {
      const game = DRIVERS.find((d) => d.id === r.id);
      const team = teamOf(r.melbourneTeamId);
      const moved = seatsNote(r);
      const s = r.season;
      const c = r.career;
      return `
        <article class="driver-card" data-id="${esc(r.id)}" style="--team:${esc(team ? team.body : "#888")}">
          <div class="driver-helmet"><img src="./assets/shots/helmets/${esc(r.id)}.jpg" alt="${esc(r.name)}'s helmet, as the game paints it" loading="lazy"></div>
          <div class="driver-body">
            <p class="kicker">#${num(r.number)} · ${esc(team ? team.short : "")}${s.champion ? ` · <span class="champion">2025 World Champion</span>` : ""}</p>
            <h3>${esc(r.name)}</h3>
            <p class="muted driver-line">${esc(game ? game.title : "")} · ${esc(r.nationality)} · ${ageAt(r.dateOfBirth, data.season.firstRace)} at the season opener</p>
            <dl class="record">
              <div><dt>2025</dt><dd>${esc(ordinal(s.position))} · ${num(s.points)} pts</dd></div>
              <div><dt>Wins</dt><dd>${num(s.wins)}</dd></div>
              <div><dt>Podiums</dt><dd>${num(s.podiums)}</dd></div>
              <div><dt>Poles</dt><dd>${num(s.poles)}</dd></div>
            </dl>
            <p class="career-line">Career: ${plural(c.starts, "start")} · ${plural(c.wins, "win")} · ${plural(c.podiums, "podium")} · ${plural(c.poles, "pole")}${num(c.titles) ? ` · ${plural(c.titles, "title")}` : ""}</p>
            ${moved ? `<p class="moved">In 2025: ${moved}.</p>` : ""}
          </div>
        </article>`;
    }).join("");
  }

  function renderTeams(data) {
    const list = $("team-cards");
    if (!list) return;
    // Ferrari first (Leclerc and Hamilton's team), then by the 2025 championship.
    const order = [...data.teams].sort((a, b) => (a.id === "ferrari" ? -1 : b.id === "ferrari" ? 1 : a.season.position - b.season.position));
    list.innerHTML = order.map((r) => {
      const team = teamOf(r.id);
      const pair = DRIVERS.filter((d) => d.teamId === r.id);
      return `
        <article class="team-card" data-id="${esc(r.id)}" style="--team:${esc(team.body)}">
          <div class="team-shot"><img src="./assets/shots/team-${esc(r.id)}.jpg" alt="The ${esc(team.short)} ${esc(team.car)}, as the game renders it" loading="lazy"></div>
          <div class="team-body">
            <p class="kicker">${esc(r.country)}${r.season.champion ? ` · <span class="champion">2025 Constructors' Champions</span>` : ""}</p>
            <h3>${esc(r.fullName)}</h3>
            <p class="team-car">${esc(team.car)}</p>
            <dl class="record">
              <div><dt>2025</dt><dd>${esc(ordinal(r.season.position))} · ${num(r.season.points)} pts</dd></div>
              <div><dt>Wins</dt><dd>${num(r.season.wins)}</dd></div>
              <div><dt>Titles</dt><dd>${num(r.career.titles)}</dd></div>
              <div><dt>All-time wins</dt><dd>${num(r.career.wins)}</dd></div>
            </dl>
            <ul class="team-drivers">${pair.map((d) => `<li><b>${num(d.number)}</b>${esc(d.name)}</li>`).join("")}</ul>
          </div>
        </article>`;
    }).join("");
  }

  function credit(data) {
    document.querySelectorAll(".f1db-release").forEach((el) => { el.textContent = `, release ${data.source.release}`; });
  }

  // As on the landing page: phones are warned before a keyboard game.
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
    note.querySelector("a.go-btn").addEventListener("click", () => {
      try {
        window.sessionStorage.setItem("f1pixelcup.phoneNote", "seen");
      } catch (error) {
        // The game shows its note once more, that's all.
      }
    });
  }

  guardPlayOnPhones();
  fetch("./assets/data/grid-2025.json")
    .then((r) => r.json())
    .then((data) => { renderDrivers(data); renderTeams(data); credit(data); })
    .catch(() => {
      const list = $("driver-cards") || $("team-cards");
      if (list) list.innerHTML = `<p class="muted">The grid couldn't be loaded. Refresh to try again.</p>`;
    });
}());
