# The Safety Car's service entrances (2026-10-05)

## What the user asked

> The Safety Car should be able to drive onto the track through multiple
> entrances and just drive back to the pit lane, because I don't want it to
> just appear right in front of the first-place driver, but it needs to get
> to first place quicker.

Today (`game.js` deploySafetyCar / updateSafetyCar, `pitlane.js` wayOut / wayIn):
called, it drives out of its garage down the pit lane at the pit limit and
joins at the pit exit, wherever the leader is (often most of a lap away, so it
takes a long time to reach the front); the field is slowed the whole time it is
in the lane. Without a pit lane it appears 90 ahead of the leader.

## The idea

Real circuits have service roads behind the barriers and marshal gates through
gaps in them. Every circuit gets several such **service entrances**, spread
round the lap. Called, the Safety Car takes whichever way onto the track gets
it in front of the leader soonest (a service entrance, or the pit exit as
today), drives up its access road, waits at the gate if a car is coming, joins,
and drives at a fast catch-up pace to the front. Once it is in front of the
leader it settles to safety-car pace for its spell. Leaving is unchanged: it
lights down, drives the road to the pit entry and down the lane to its garage.

## Service entrances (`entrances.js`, pure, UMD, `window.Entrances`)

`Entrances.place({ points, total, halfWidth, street, pit, tunnel, bridges, decor })`
returns the circuit's entrances, sorted by lap distance. Each is a slip road
on one side of the lap (`side`, +1 or -1 along n = (-ty, tx), as pitlane.js):

- it leaves its **standby** spot `startD`, at `far` = run-off + 72 out from
  the centreline (outside the barrier, under a carport), running parallel to the
  track;
- curves in over `LENGTH` = 200 along the lap on a smoothstep, through a gap in
  the barrier (its **gate**, at `gateD`), across the run-off;
- and meets the road's edge lane (half-width - 6, the line the pit exit uses) at
  `mergeD`.

`latAt(d)` and `slopeAt(d)` give the road's line; `gap` the stretch of barrier
left open. Its width is 24 (a car is 16 wide).

Where one may go (all must hold, both for the 3D world and the physics, which
both read the same entrances from the track):

- a straight: the heading changes by under 0.2 rad over the whole slip road;
- full road width (no narrowed points) and full run-off: no other stretch of the
  lap within twice the run-off on that side, so the barrier is where the
  entrance expects it (r3d/track.js buildCourse measures the same);
- clear ground: every point of the access road and the carport keeps the
  run-off plus 16 from every other stretch of the circuit (the pit complex
  counts out to its garages), and 10 from the track data's scenery (stands,
  billboards, towers);
- clear of the start (the grid, the gantry and the starter: 450 before the line
  to 250 after), of the pit zone and its mouths (250 either side), of the
  tunnel (150) and of a bridge (500 of its crossing).

How many: one per 1,600 of lap, at least 3 and at most 6. Chosen greedily: the
pit exit is the first joining point; each entrance then goes as near as it can
to the middle of the largest stretch of lap with no joining point, at least 500
from every other.

## Ways onto the track and the choice

`Entrances.ways(entrances, pitLane)` lists every way on: each entrance (`kind:
"access"`, from its standby) and the pit lane (`kind: "pit"`, from the Safety
Car's bay, on pitlane.js wayOut, unchanged). Each way has `startD`, `startLat`,
`giveWayD` (where it stops if a car is coming: the gate; the start of the pit
exit's mouth), `mergeD`, `length` and `latAt(d)`.

`Entrances.choose(ways, { leaderD, leaderSpeed, total, speeds, catchSpeed,
scPace })` predicts, for each way, when the Safety Car would be in front of the
leader, and takes the soonest (the pit lane on a tie):

- **ahead**: if the leader is far enough away from the way's merge point to let
  the Safety Car drive its whole way first, it waits at its start (the carport,
  or its garage) and sets off so as to join `LEAD` = 0.75 s ahead of the leader:
  in front of them at once;
- **behind**: otherwise it sets off now, joins behind the leader (behind the
  next car if one is passing) and catches up.

Run time is from rest at `ACCEL` = 120 up to the way's speed: the pit limit
(0.35 of the field's mean top speed, as now) in the lane, 0.6 on an access
road.

## On the road

- **Catching:** at `CATCH` = 1.4 times the field's mean top speed, much faster
  than the field (it is a power-up, and a real Safety Car meets a field that
  has slowed). It passes cars on a clear line (`Entrances.passingLat`: the line
  across the road furthest from every car just ahead), and it still slows behind
  a car on its line rather than drive through it.
- **Fair and fun:** nobody is slowed while it is in the pit lane, on an access
  road or far away. A car is held to safety-car pace only once the Safety Car is
  leading, or while the Safety Car is within `NEAR` = 300 of it (the cars it is
  coming up to, and those just behind it, lift).
- **Picked up:** once it is ahead of the leader (the first rival still racing:
  never the car that called it) and within `PICKUP` = 200 of them, it is
  leading: its five seconds (PowerUps.TIMINGS.safetyCarMs) start then. It drives
  the centre line at safety-car pace (PowerUps.FACTORS.safetyCar), slower while
  the leader is still more than `PICKUP` behind.
- **Target: within 8 s of the call** on every circuit, for a leader anywhere on
  the lap at a typical racing speed. If it has not picked the leader up within
  15 s (it never should), it goes in.

## Leaving (unchanged)

Its time up, it lights down, eases to the pit side's edge, takes the pit entry
and parks at its bay (pitlane.js wayIn and parkAt, the single source of the
route). Called again in the pit lane on its way in, it parks and comes back out
of the pit exit; called again on the road on its way in, it turns back to
catching from where it is.

## Seeing it

- **The 3D world** (`r3d/entrances.js`, built in buildWorld before the decor, so
  it is in the scene when `prepare()` runs and everything else is placed round
  it): for each entrance the access road's tarmac (from the road's edge to past
  the carport, marked ground), the barrier and the street circuits' catch fence
  open over the gap, two gate leaves on posts that swing open while the Safety
  Car is near and shut again after, an amber beacon on a gate post that flashes
  while open, a marshal's booth by the gate with a marshal in it (the people
  model's crew figure, in orange), and a carport at the standby spot. All of it
  claims its ground (course.occupied) so no scenery is built on it;
  `auditScenery` takes the entrances in too and stays 0 on all 32 circuits.
- **The Safety Car** faces along its access road (its heading turned by the
  road's slope), its light bar flashing amber while it is out.
- **The feed:** "Safety Car deployed, joining at Tamburello." when the way joins
  near a named corner (the track data's corners, within 350), else "joining from
  the pit lane." or "joining through a service gate."
- **Minimap, 2D view, replays, two players, TV cameras:** it is still just a
  lap distance and an offset, so the minimap and 2D view show it wherever it is,
  replays record and play its path back unchanged, and the gates open in the
  replay as the Safety Car comes (from its position). Two players: the leader is
  the race's leader, the same for both.
- **Low tier:** draws all of it (it is static; only post-processing differs).

## Tests and checks

- Node (`tests/entrances.test.js`), first, failing before the module exists:
  every circuit has 3 to 6 entrances; each on a straight, on clear ground (the
  check above, recomputed independently), clear of the start, pit zone, tunnel
  and bridges, at least 500 apart; the slip road's line runs from the standby to
  the edge lane, through the barrier at the gate; `choose` takes an ahead way
  when there is time, a behind one otherwise, and the pit lane when it is
  soonest; a simulated pick-up (leader at 0.85 of a typical top speed, the
  game's own rules) is within 8 s from every point of every circuit's lap.
- Browser (`tools/checks/safety-car-check.js`, extended): on all 32 circuits,
  with the leader started at several points round the lap and the field moved at
  racing speed under the game's own hold rules: the Safety Car never appears
  within a car length of anyone, never overlaps a car, is always on the road, its
  pit lane or an access road, never jumps, reaches the leader within the target,
  and parks in front of its bay after. Proven failing on main.
- `trackside-check` / `auditScenery`: 0 on every circuit with the entrances in.
