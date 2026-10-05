# Choosing races: random cups, custom cups and single races (Stage P)

Work order item 5 (`docs/superpowers/plans/2026-10-01-work-order.md`). The pit lane already offers the six calendar cups and the 2025 Season. It gains three more ways to race: a random cup, a custom cup and a single race. Built autonomously (no design review).

## 1. The pit lane

A new first row, **Race**, picks how to race. Its pills, in this order:

| Pill | What it is |
|---|---|
| Cup | One of the calendar cups (later the historical cups too, Stage L2): the **Cup** row below picks which. |
| Season | The 2025 Season, as now (it moves here from the Cup row). |
| Random cup | Four circuits drawn at random. |
| Custom cup | Any four circuits, in the player's order. |
| Single race | One circuit, random or chosen. |

Below the Race row, only what the choice needs:

- **Cup:** the Cup row (the six calendar cups) and the cup's four circuits, as now.
- **Season:** the season's line and its hint, Resume and New season, as now.
- **Random cup:** a **Draw** row with a **Reroll** button, and the four drawn circuits in race order (numbered). Hint: "Four circuits drawn from all 24, no repeats. Reroll for another four." (the count is the real size of the pool, not a fixed 24).
- **Custom cup:** a **Circuits** row with a **Choose circuits** button (it opens the circuit picker, below), and the chosen circuits in race order. Hint: "Any four circuits, in the order you choose." With fewer than four chosen, the list says how many are still to pick, and the Start button reads "Choose 4 circuits ›" and opens the picker instead of starting.
- **Single race:** a **Circuit** row with two pills, **Random** and **Chosen**, then a **Reroll** button (Random) or a **Choose circuit** button (Chosen), and the circuit's name. Picking Chosen with no circuit chosen yet opens the picker.

Difficulty, Grid, Weather and Players follow, unchanged, for every choice. The weather hint fits the choice ("Dry races all cup.", "Dry races all season.", "A dry race."). Players: one or two in a cup, a random cup, a custom cup and a single race; the Season stays one player's championship (the 2 players pill is disabled there, as now).

The Start button names what it starts: "Start Opening Cup ›", "Start Random Cup ›", "Start Custom Cup ›", "Start single race ›", or the season's Resume.

**Remembered** between visits (each read back through a pure check, so a stale or broken value falls back to the default and never breaks the pit lane):

- the Race choice, `f1pixelcup.race` (`cup`, `season`, `random`, `custom`, `single`). With none stored, it follows the stored cup (`f1pixelcup.cup`), so a player who last picked the Season still lands on it;
- the random cup's draw and the single race's random draw, by seed (`f1pixelcup.draw`);
- the custom cup's circuits, by id, in order (`f1pixelcup.custom`): unknown ids and repeats are dropped, at most four kept;
- the single race's choice and chosen circuit (`f1pixelcup.single`).

A `?race=random` (or `custom`, `single`, `season`, `cup`) link picks the Race choice, as `?cup=` picks a cup; the address goes back to plain `play.html`.

**Never under the car:** every new row is a `.choice-row` (the showroom measures every control of the pit lane), and `showroom-check` covers each new choice at every window size it already tries, one and two players.

## 2. The draw (random cup and random single race)

`choices.js` (pure, UMD, Node tests):

- `draw(pool, count, seed)`: `count` circuits from `pool`, **no repeats**, the same seed always the same circuits in the same order (a seeded Fisher-Yates on a copy, mulberry32). The pool is every circuit in `CIRCUITS`, whatever its length: when historical circuits arrive they join the draw with no change here. A count larger than the pool gives the whole pool, shuffled.
- `reroll(pool, count, seed, current)`: the next seed whose draw is not the current one (the same circuits in the same order count as the same); `{ seed, ids }`. With a pool of one circuit there is nothing else to draw, and it says so (`same: true`).
- Seeds are 32-bit unsigned integers. A first visit seeds from `crypto.getRandomValues` (or `Math.random` without it).

**Shown before the start:** the draw is in the pit lane before Start is pressed, and it is exactly what is raced. Starting a random cup (or a random single race) races the draw on screen and then readies a fresh one for next time (a reroll of it), so the same four are not dealt every visit.

## 3. The custom cup

- **The circuit picker** is an overlay (like Career and Settings: a dialog, focus kept inside, Esc closes it). A search box at the top, then the running order, then every circuit as a card.
- **Search** matches the start of any word of the circuit's name, short name, places (the cities and names its race goes by: São Paulo, Abu Dhabi, Melbourne, USA, UK), country, theme and id, ignoring case and accents ("montreal", "Sao Paulo" and "jose" all find theirs; "usa" never finds Lusail), as the player types. No match: "No circuit matches ‘…’."
- **Each card** is the circuit's own map (its outline, drawn by `trackmap.js`, the same as the site's cards), its name and country, and the calendar cup it belongs to. A chosen card shows its place in the order. Clicking a card adds it to the end of the order, or takes it out; a fifth can't be added until one is taken out (the cards say "Four chosen" in their hint).
- **The running order:** four numbered slots. Each chosen circuit has buttons to move it earlier or later, and to remove it. Empty slots say "Pick a circuit".
- **Done** closes the picker. A "Clear" button empties the order.
- In single-race mode the same picker chooses one circuit: clicking a card chooses it and closes the picker.

`choices.js`:

- `validateCustom(ids, pool, size = 4)`: `{ ok, reason }`; ok only for exactly `size` ids, every one in the pool, none repeated (`reason`: `count`, `unknown` or `repeat`).
- `parseCustom(text, pool, size = 4)`: a stored list, read safely (bad JSON, unknown ids, repeats dropped, at most `size`).
- `toggle(ids, id, size)`, `move(ids, index, dir)`: the picker's edits, pure (never more than `size`, never a repeat; a move off either end leaves the order as it is).
- `search(circuits, query)`: the filter above.

The game starts a custom cup only when `validateCustom` passes.

## 4. Racing them

A random cup, a custom cup and a single race are run by the same code as a calendar cup (`beginCup`, `startRaceWeekend`, `finalizeRace`): qualifying or from the back, the weather, two players, replays, results.

| | Random cup | Custom cup | Single race |
|---|---|---|---|
| Id (career history, podium colour) | `randomCup` | `customCup` | `singleRace` |
| Name on screen | Random Cup | Custom Cup | Single race |
| Races | 4 | 4 | 1 |
| Weather | as chosen; Changeable rains as often as each circuit does, seeded by the run | same | same |
| Career races and best laps | every race | every race | the race |
| Cup bonus (top three, × difficulty) | yes | yes | no (one race is not a cup; its race points count) |
| Podium | the 3D podium, the cup's top three | same | the race's top three, as a Grand Prix podium |

- The results' kicker reads "Race 2 of 4 · Random Cup" (or "Single race" for a single race), and their last column is the cup's points ("Cup"), or "Total" for a single race (its race points and the fastest lap's).
- A single race's standings are its finishing order, so the podium's title gives the place the player really finished.
- The single race's podium: the kicker "Single race · <circuit>", the title "Race winner" (or "You finished 4th"; two players as in a cup), the wall names the circuit's country. The career strip shows the race's own career lines (no cup bonus line).
- The podium's step colours: each new id gets its own (`Ceremony.cupColour`).
- Leaving mid-cup works as in any cup: finished races count, the cup bonus only at the end.
- The active cup is a snapshot taken at the start: rerolling or editing in the pit lane later never changes a cup being raced.

## 5. Checks

- **Node (written first, seen failing):** `tests/choices.test.js`: the draw (count, no repeats, in the pool, seeded, every circuit reachable, a count over the pool), reroll (a different draw, deterministic, the pool-of-one case), `validateCustom` (each reason), `parseCustom` (broken text, unknown ids, repeats, too many), `toggle`, `move`, `search` (case, accents, country, no match), the remembered race choice. `ceremony.test.js`: the three new ids have colours. A test that nothing in `choices.js` assumes 24 circuits (a pool of 40 draws from all 40).
- **Browser:** `tools/checks/choices-check.js`, in `run-all`, each mode end to end in the real game: a random cup shown before the start, rerolled (a different four), started (the four on screen are the four raced), raced to its podium (3D) with the career credited (four races and the cup); a custom cup picked through the picker with search and reordering, started, its order raced; a single race random and chosen; two players in a custom cup (both careers credited); and no page errors. Proven failing on main.
- `showroom-check` gains the new choices.

## 6. The site

The circuits section says how to race them: the six calendar cups, the season, and the new random cup, custom cup and single race, with a real in-game screenshot of the new pit lane (`tools/capture-shots.js`), and links into each (`play.html?race=random` and so on). `landing-check` covers the new copy and links.
