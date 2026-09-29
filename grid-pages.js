// The site's driver and team pages (drivers.html, teams.html): the game's 2025
// grid with its real record, as a snapshot at the end of 2025. Facts come from
// window.GRID_2025 (assets/data/grid-2025.js, built from F1DB, CC BY 4.0, by
// tools/site/build_grid_data.js); colours, cars, names and titles from
// game-data.js. Every picture is the game's own render.
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
  const status = (text) => { if ($("grid-status")) $("grid-status").textContent = text; };

  // Age on the day of the season opener.
  function ageAt(dateOfBirth, day) {
    const [y, m, d] = dateOfBirth.split("-").map(Number);
    const [ty, tm, td] = day.split("-").map(Number);
    return ty - y - ((tm < m || (tm === m && td < d)) ? 1 : 0);
  }

  // "Red Bull in rounds 3-24": only when a driver changed seat, or didn't race
  // the whole season.
  function seatsNote(record, rounds) {
    const seats = record.season.teams;
    if (seats.length === 1 && seats[0].rounds === `1-${rounds}`) return "";
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
    const { season } = data;
    list.innerHTML = driverOrder(data.drivers).map((r) => {
      const game = DRIVERS.find((d) => d.id === r.id);
      const team = teamOf(r.melbourneTeamId);
      const moved = seatsNote(r, season.rounds);
      const s = r.season;
      const c = r.career;
      return `
        <article class="driver-card" data-id="${esc(r.id)}" style="--team:${esc(team ? team.body : "#888")}">
          <div class="driver-helmet"><img src="./assets/shots/helmets/${esc(r.id)}.jpg" width="360" height="360" alt="${esc(r.name)}'s helmet, as the game paints it" loading="lazy"></div>
          <div class="driver-body">
            <p class="kicker">#${num(r.number)} · ${esc(team ? team.short : "")}${s.champion ? ` · <span class="champion">${num(season.year)} World Champion</span>` : ""}</p>
            <h2>${esc(r.name)}</h2>
            <p class="muted driver-line">${esc(game ? game.title : "")} · ${esc(r.nationality)} · ${ageAt(r.dateOfBirth, season.firstRace)} at the season opener</p>
            <p class="standing"><span>${num(season.year)}</span> ${esc(ordinal(s.position))} · ${num(s.points)} pts</p>
            <dl class="record">
              <div><dt><span class="visually-hidden">${num(season.year)} </span>Wins</dt><dd>${num(s.wins)}</dd></div>
              <div><dt><span class="visually-hidden">${num(season.year)} </span>Podiums</dt><dd>${num(s.podiums)}</dd></div>
              <div><dt><span class="visually-hidden">${num(season.year)} </span>Poles</dt><dd>${num(s.poles)}</dd></div>
            </dl>
            <p class="career-line">Career to ${esc(season.careersTo)}: ${plural(c.starts, "start")} · ${plural(c.wins, "win")} · ${plural(c.podiums, "podium")} · ${plural(c.poles, "pole")}${num(c.titles) ? ` · ${plural(c.titles, "title")}` : ""}</p>
            ${moved ? `<p class="moved">In ${num(season.year)}: ${moved}.</p>` : ""}
          </div>
        </article>`;
    }).join("");
  }

  function renderTeams(data) {
    const list = $("team-cards");
    if (!list) return;
    const { season } = data;
    // Ferrari first (Leclerc and Hamilton's team), then by the championship.
    const order = [...data.teams].sort((a, b) => (a.id === "ferrari" ? -1 : b.id === "ferrari" ? 1 : a.season.position - b.season.position));
    list.innerHTML = order.map((r) => {
      const team = teamOf(r.id);
      const pair = DRIVERS.filter((d) => d.teamId === r.id);
      return `
        <article class="team-card" data-id="${esc(r.id)}" style="--team:${esc(team.body)}">
          <div class="team-shot"><img src="./assets/shots/team-${esc(r.id)}.jpg" width="900" height="555" alt="The ${esc(team.short)} ${esc(team.car)}, as the game renders it" loading="lazy"></div>
          <div class="team-body">
            <p class="kicker">${esc(r.country)}${r.season.champion ? ` · <span class="champion">${num(season.year)} Constructors' Champions</span>` : ""}</p>
            <h2>${esc(r.name)}</h2>
            <p class="team-car">${esc(team.car)}</p>
            <p class="standing"><span>${num(season.year)}</span> ${esc(ordinal(r.season.position))} · ${num(r.season.points)} pts · ${plural(r.season.wins, "win")}</p>
            <p class="career-line">As ${esc(team.short)}, to ${esc(season.careersTo)}: ${plural(r.career.titles, "title")} · ${plural(r.career.wins, "win")}</p>
            <ul class="team-drivers">${pair.map((d) => `<li><b>${num(d.number)}</b>${esc(d.name)}</li>`).join("")}</ul>
          </div>
        </article>`;
    }).join("");
  }

  if (window.Device) Device.guardPlayLinks(document, window);

  const data = window.GRID_2025;
  if (!data) {
    // The data script didn't load (a broken deploy, or blocked).
    const list = $("driver-cards") || $("team-cards");
    if (list) list.innerHTML = `<p class="muted">The grid's data didn't load. Check your connection and reload the page.</p>`;
    status("The grid's data didn't load.");
    return;
  }
  try {
    renderDrivers(data);
    renderTeams(data);
    status("");
  } catch (error) {
    console.error("The grid could not be drawn", error);
    const list = $("driver-cards") || $("team-cards");
    if (list) list.innerHTML = `<p class="muted">The grid couldn't be drawn. Reload the page to try again.</p>`;
    status("The grid couldn't be drawn.");
  }
}());
