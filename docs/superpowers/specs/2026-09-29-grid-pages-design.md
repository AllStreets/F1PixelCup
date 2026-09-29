# The 2025 grid on the site — design

Date: 2026-09-29 · Stage E of `docs/superpowers/plans/2026-09-29-master-todo.md` · built autonomously (the user's standing instruction).

## What

Two new site pages, `drivers.html` and `teams.html`, give the game's 2025 grid its real record, with the facts taken from **F1DB** (CC BY 4.0). The game's grid is the lineup as it lined up in Melbourne, round 1, and the pages say so. Where a driver changed seat during 2025 (Lawson, Tsunoda, Doohan), the card says that too.

## The data

- **Build.** `tools/site/build_grid_data.js <f1db-json-dir>` reads an F1DB JSON release (`f1db-json-splitted.zip`) and writes `assets/data/grid-2025.js` (`window.GRID_2025`). The script is committed and loaded by the pages, so there is no fetch at all, and no failure over `file://`.
- **Source block.**

  ```
  { source: { name: "F1DB", url, release, license: "CC BY 4.0", licenseUrl, attribution },
    drivers: [ { id, f1dbId, name, number, code, nationality, dateOfBirth, melbourneTeamId,
                 season: { position, points, wins, podiums, poles, teams: [{ teamId, rounds }] },
                 career: { starts, wins, podiums, poles, titles } } ],
    teams:   [ { id, f1dbId, name, fullName, country,
                 season: { position, points, wins },
                 career: { titles, wins } } ] }
  ```

- **Drivers.** `id` and `teamId` are the game's own (`game-data.js`); `f1dbId` is F1DB's.
- **2025 season.** Race wins, podiums and poles count Grands Prix only (not sprints). They are computed from F1DB's 2025 race results and qualifying.
- **The page is a snapshot at the end of 2025.** The latest release also holds later races, so career totals are counted from F1DB's race rows up to and including 2025. The builder first checks that this rule, run over every year, gives F1DB's own all-time totals. Team records are for F1DB's constructor under its current name, labelled "As Racing Bulls" and so on, so earlier names such as Toro Rosso aren't counted.
- **Names** are the game's, everywhere: no title sponsors in team names. F1DB's own names are kept as `f1dbName`.
- **Nationality** is the F1DB country's demonym.
- **No prose is invented.** The cards show F1DB facts and the game's own title for each driver ("Monaco Maestro"); no written biographies.

## The pages

- **`drivers.html`** has 20 cards in the site's order: Leclerc first, Hamilton second, then team by team. Each card shows:
  - the driver's **helmet**, rendered by the game (`assets/shots/helmets/<id>.jpg`, captured by `tools/capture-shots.js`);
  - the number, name, nationality and age at the start of 2025;
  - the 2025 championship position and points, wins, podiums and poles;
  - career starts, wins, podiums, poles and titles;
  - the team in Melbourne, plus a note when they moved.
- **`teams.html`** has 10 cards. Each shows:
  - the team's **showroom render** (`assets/shots/team-<id>.jpg`, already on the site);
  - the full name and car;
  - the 2025 constructors' position, points and wins;
  - career titles and wins;
  - the Melbourne pair.
- **Navigation.** Both pages share the landing page's header, styles and navigation ("Drivers" and "Teams" join the nav). The landing page's grid section links to them.
- **No official material:** no official photos, logos or sponsor marks. Everything pictured is the game's own render.
- **Footer on every site page** (index, drivers, teams):
  - "Fan-made, not affiliated with Formula 1, the FIA or the teams."
  - "Race data: F1DB by Marcel Overdijk, CC BY 4.0 (linked), release …, adapted: …", alongside the existing credits. The same static text is on all three pages, and a Node test ties the release to the data.
- **Layout:** no horizontal scroll at phone width, and the cards stack to one column.

## Tests

- **Node** (`tests/grid-data.test.js`): the JSON has 20 drivers and 10 teams matching `game-data.js` one to one, and every required field present and typed. It also checks the source block:
  - it names F1DB and CC BY 4.0;
  - its numbers are sane: no negatives, distinct championship positions (21 drivers raced in 2025, so ours are a subset), and team positions 1–10 each used once;
  - the 2025 champions are flagged: Norris (423) and McLaren (833), exactly as F1DB has them.
- **Browser** (`landing-check.js`):
  - drivers.html renders 20 cards and teams.html 10;
  - every card image loads;
  - there is no horizontal scroll at 390 px;
  - the footer carries the not-affiliated line and the F1DB credit on all three pages;
  - the nav links work.

## Revisions after review

- **Snapshot.** Careers now stop at the end of 2025 (Antonelli's 2026 wins were showing).
- **Credit.** The CC BY credit is complete: author, licence link and a note of what was adapted.
- **Titles.** The game's driver titles were corrected: Hadjar "F2 Runner-up", Piastri "Clinical Contender", and Sainz, not Albon, is the "Smooth Operator".
- **Sponsors.** Title sponsors were removed from team names and descriptions (tested).
- **Page structure:**
  - no live region over the list, a status line, and a noscript note;
  - cross-links for phones, and one nav labelled "Site";
  - h2 card names, and lighter red for small text on the panels.
- **Phone guard.** It is shared in `device.js`.
- **Checks.** Stronger: literal facts, clicked navigation, one column at 390 px, and the missing-data state.
- **Ruling:** the team shots keep the showroom's dark backdrop above the turntable. It reads as a studio and is the same on all ten cards and on the landing page.
