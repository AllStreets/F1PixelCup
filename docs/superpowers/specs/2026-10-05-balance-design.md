# Balance: comebacks you can actually make

Found in play (2026-10-05): from the back of the grid it is too hard to get back to the front, or even to the middle. It is hard to get past cars, and the fast power-ups (Formation Lap, Overtake Mode) don't carry you past people the way they should.

## How it is measured

A headless measurement in the real game (`tools/balance/measure.js`, run through the shared browser runner) races a player car against the field with the game's own physics, AI and power-ups:

- **The player:** Leclerc's Ferrari (the default), driven by an autopilot that drives like a decent human. It has no line noise and makes no mistakes. It takes corners at 0.88 of the limit (Pro CPUs dare 0.85, Legend 0.93). It picks a side to pass a car in its way and uses its items as a sensible player would:
  - DRS and Overtake Mode on a straight or with a car close ahead;
  - the Undercut with a car ahead;
  - Debris with a car straight ahead;
  - Oil trailed with a car behind;
  - everything else at once.
  
  Driven alone, its laps sit between a Pro and a Legend CPU lap in the same car (Monza 33.0 s against 33.3 and 31.9; Suzuka 31.3 against 32.1 and 30.1).
- **The races:** 5 laps, dry, on 8 circuits (Monaco, Monza, Spa, Singapore, Suzuka, Bahrain, Hungaroring, Las Vegas), 10 seeds each, on each difficulty. That is 240 races from the back (P20) and 240 from pole.
- **What it records:**
  - the finishing position;
  - places gained per lap;
  - the share of the race spent stuck behind a car (a car less than 60 ahead in the player's lane);
  - blocked episodes (stuck behind the same car for a second or more) and how many end without getting past;
  - places gained in the 8 s after each power-up is used;
  - from pole, how often the player wins.

## Baseline (main at 0f239b3)

| From P20 | mean finish | win | top 3 | top 5 | top 10 | places/lap | stuck | blocked, not passed |
|---|---|---|---|---|---|---|---|---|
| Rookie | 6.0 | 19 % | 42 % | 52 % | 85 % | 2.81 | 45 % | 23 % |
| Pro | 16.6 | 0 % | 0 % | 0 % | 9 % | 0.67 | 43 % | 63 % |
| Legend | 18.9 | 0 % | 0 % | 0 % | 0 % | 0.21 | 31 % | 80 % |

From pole the player wins 98 % (Rookie), 82 % (Pro) and 69 % (Legend).

Places gained in the 8 s after use, all difficulties:

| Item | Safety Car | Formation Lap | Undercut | Overtake Mode | DRS | Steward Penalty | Oil | Debris |
|---|---|---|---|---|---|---|---|---|
| Places | +1.00 | +0.46 | +0.39 | +0.31 | +0.26 | +0.15 | +0.14 | +0.12 |

For comparison, the race average is +0.26 places per 8 s. The Formation Lap and Overtake Mode barely beat simply driving.

## Why it is hard (read from the code and the numbers)

1. **Being close behind a car makes you slower.** `applyTrafficAvoidance` cuts the throttle and adds up to 16 % brake for every car within 90 ahead and 42 across, for everyone. On a straight that holds the follower to about 219 against a 230 top speed. Real racing is the reverse: the tow makes the follower faster on the straight.
2. **Contact always punishes the car behind.** In a touch, the car further back loses 18 % of its speed and is pushed back; the car in front gains 8 and is pushed on. This happens even side by side, and even in Overtake Mode or on a Formation Lap. So a pass that ends in a touch fails.
3. **The Formation Lap isn't a ghost.** It is slowed by the same traffic penalty and contacts as any car. Four seconds of 1.42x is spent mostly stuck behind the car it hits.
4. **Overtake Mode is only 10 % faster,** for 5 s, and still loses every touch from behind.
5. **The CPU rubber band is weak where it matters:** at most 5 % on Pro, and none on Legend.

## Targets (5 laps, from P20, the autopilot player)

- **Rookie:** usually wins. Top 3 at least 75 %, win at least 40 %.
- **Pro:** usually top 5 and often wins. Top 5 at least 55 %, win at least 15 %, top 10 at least 90 %.
- **Legend:** a comeback is hard but possible, and the middle is reachable.
  - top 10 at least 50 %;
  - top 5 between 10 and 35 %;
  - a win at least 1 % and at most 10 %.
- **The leader's life isn't trivial.** From pole, a win at most 95 % on Rookie, at most 85 % on Pro and at most 75 % on Legend.
- **Passing works.** On Pro, stuck at most 25 % of the race, and at most 40 % of blocked episodes end without a pass.
- **The fast items earn their rarity.** Formation Lap at least +2 places in 8 s, Overtake Mode at least +1, DRS more than the race average.

## The levers

Each change must look physically honest and stay fun:

- **Slipstream (tow):** following closely in a car's wake on a straight raises your top speed. That is real, and it is the main tool for passing in F1. It comes with a pure rule in `racecraft.js`, tested.
- **Dirty air without the brake:** a car close ahead no longer brakes you. A CPU still lifts when it is about to run into the car in front.
- **Fair contacts:** side by side, nobody is thrown back. The car that runs into the back of another still loses speed. A car in Overtake Mode loses nothing in a touch.
- **Formation Lap:**
  - longer and faster;
  - a ghost: it passes through cars without contact or slowing;
  - it ends only once the car is clear of every other car, so it is never dropped on top of one.
- **Overtake Mode:**
  - faster and longer;
  - untouchable as before;
  - a car it touches spins and is knocked aside.
- **DRS:** opens for longer.
- **Item odds:** the back of the field rolls the strong items more often.
- **CPU rubber band:** CPU cars well ahead of the player ease off a little, on every difficulty. Cars right beside the player are left alone, so it never looks like cheating.
- **The Safety Car:** its routing is another branch's work and stays untouched. It may bunch the field harder.

The power-up copy in `game-data.js` (`POWER_UPS`) is read by the site's cards and the HUD. It changes with any effect that changes, and says exactly what the game does.

## Result

Filled in once the tuning is done, as a before-and-after table.
