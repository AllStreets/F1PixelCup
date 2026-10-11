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
  - a Bullet Bill: on rails through the field, never slowed; any car it touches spins and is knocked aside (the first round made it a ghost; the user asked for the knock-aside);
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

## Second round (the user's notes, 2026-10-05)

The user liked the harder CPUs, and asked for more:

1. **Steering matters, a little.** A car that isn't steered should run wide in a corner, off the road and into the barriers, while a player who steers still has an easy drive.
   - The cause: every step the player's car was turned 22 % of the way back along the road, a strong autopilot. And the physics wall stood at the road's edge, so a car could never leave the road. The barriers drawn past the run-off were never reached.
   - The fix: the barriers are one shared rule, `runoff.js`, drawn by the renderer and hit by the physics in the same place. The player's assist is 8 % a step, aimed always forwards round the lap. On the run-off a car has more drag and its off-road top speed.
2. **Barrier hits look and feel real.** The part of the velocity into the wall bounces back at 35 %, and the wall's friction scrubs some of the rest. The car is left running along the wall, nose turned a little away from it, into a decaying wobble. A hard hit throws sparks and a puff of dust, shakes the camera and plays the impact sound. It is never through the wall (the car is set back to the line), and never stuck (it keeps rolling up the road; the old watchdog stays).
3. **Cars behind slip past while you recover.** A car that is spinning (from any hit, the Steward Penalty included), or shaken off a wall, takes no part in contacts for that moment, and CPU cars don't lift behind it.
4. **The Steward Penalty is the heaviest hit:** a 2.6 s spin keeping 8 % of the speed, with a blast of smoke and sparks. The Oil Slick is a short spin of 0.85 s keeping 65 %. Every hit now has its own speed loss (`SPIN_KEEP`).
5. **Every item stronger, true to its Mario Kart counterpart:**
   - **DRS (Mushroom):** a burst of 20 % of top speed at once.
   - **Oil Slick (Banana):** lasts 30 s, and a trailed slick also spins the first car that runs into it.
   - **Debris (Green shell):** faster (1.45x) and lives 8 s.
   - **Undercut (Red shell):** faster (1.6x) and homes in harder.
   - **Overtake Mode (Star):** 1.2x.
   - **Formation Lap (Bullet Bill):** knocks cars aside.
   - **Safety Car (Lightning):** seven seconds, and every rival loses the power-up it holds. Its routing is untouched.
   - Steward Penalties and Safety Cars come out of the boxes less often. The heavier hits made the leader's life too hard: from pole on Pro the player won only about a quarter of races.

## Third round: the pole-sitter is the favourite again (2026-10-10)

After the second round, starting on pole won only 25 % of races on Pro and 4 % on Legend, and starting last won more often than starting first. The measurements showed why: the leader was spun about eight times a race, and one Steward Penalty alone cost more than the usual losing margin of two seconds. The targets: from pole about 90 % on Rookie, 45 to 55 % on Pro, 15 to 25 % on Legend, with the comeback from last still there.

- **The Steward Penalty is rare:** only from the back half of the field (3 % and 4 %), and never within 60 s of the last one.
- **A car can't be pinned:** after a spin it can't be spun again for 4.5 s (it was 1.4 s).
- **Fewer shells near the front:** P2 to P5 roll more DRS and oil, less Debris and Undercut. The leader rolls mostly oil (70 %), to trail as a shield.
- **Oil lies for 15 s,** not 30: the leader no longer meets the whole field's slicks a lap later.
- **The tow is 6 %,** not 9 %: a train of cars no longer reels a lone leader in.
- **Legend's pace edge is 3 %,** not 5 %.
- **The rubber band is weaker** (8 %, 4 %, 2 %): the power-ups carry the comeback, and nothing eases off for a player who is leading.
- **A broken box is back in 2 s,** not 1 (it was 3 before this work): a little less of everything, for everyone.
- **The measuring autopilot** holds an Oil Slick behind it as a shield while it is in the top three, as a sensible leader would.

## Fourth round: spinning cars, solid or not (2026-10-12)

The user: driving straight through a spinning car is sometimes too easy, and has a Mario Kart feel; a spinning car that blocks has more of an F1 feel. "I like both and I want both."

- **The setting:** Settings, "Spinning cars block the road", Off by default. Its note says which way it is: Off, "The Mario Kart way: you drive straight through a car that is spinning or has hit the wall"; On, "The F1 way: a car that is spinning or has hit the wall is solid. Go round it, or lose your speed against it."
- **Off** is the behaviour above: a spinning or wall-shaken car takes no part in contacts until it is clear, and CPU cars don't lift behind it.
- **On:** it is as solid as any car (`powerups.js` `carsCollide`). Running into it costs the usual speed; CPU cars steer round it from further away, as they do with the setting off, and lift when they are about to hit it.
- One setting for everyone on track, players and CPU cars, in one and two players. Kept in the browser (`f1pixelcup.solidSpins`). A race takes it as it stands at the start, and its replay's recording carries it (`header.solidSpins`). Careers and scores don't depend on it.

## Result

Measured once on the final code (after every fix and merge) with `tools/balance/`: the autopilot as above, 8 circuits x 6 seeds per row (48 races), 5 laps, dry. "Before" is main at 0f239b3, measured the same way.

**From the back (P20):**

| | mean finish | win | top 3 | top 5 | top 10 | places/lap | stuck | blocked, not passed |
|---|---|---|---|---|---|---|---|---|
| Rookie before | 4.5 | 29 % | 50 % | 71 % | 90 % | 3.11 | 46 % | 15 % |
| Rookie after | 1.0 | 100 % | 100 % | 100 % | 100 % | 3.80 | 15 % | 0 % |
| Pro before | 12.3 | 0 % | 0 % | 2 % | 33 % | 1.54 | 51 % | 34 % |
| Pro after | 2.8 | 27 % | 73 % | 94 % | 100 % | 3.44 | 29 % | 15 % |
| Legend before | 16.8 | 0 % | 0 % | 0 % | 2 % | 0.65 | 40 % | 60 % |
| Legend after | 6.0 | 4 % | 25 % | 44 % | 96 % | 2.80 | 39 % | 29 % |

**From pole:**

| | before: mean, win | after: mean, win, top 3 |
|---|---|---|
| Rookie | 1.1, 98 % | 1.0, 100 %, 100 % |
| Pro | 1.1, 92 % | 1.9, 60 %, 79 % |
| Legend | 1.4, 73 % | 4.1, 13 %, 40 % |

With 48 races a row, a win rate is good to about 7 points either way: the same code measured 42 % from pole on Pro over 64 races the run before.

**Places gained in the 8 s after use, from the back on Pro:**

| Item | before | after |
|---|---|---|
| Overtake Mode | +0.2 | +7.0 |
| Safety Car | +1.1 | +4.0 |
| Formation Lap | +0.4 | +2.7 |
| Steward Penalty | 0.0 | +1.5 |
| DRS | +0.3 | +1.3 |
| Undercut | +0.3 | +1.2 |
| Debris | +0.2 | +0.5 |
| Oil Slick | +0.7 | 0.0 |

**Steering** (measured in the second round; the assist is unchanged since): driven alone, a steered car meets the wall 0 to 3 times in two laps; an unsteered one 6 to 21 times a lap, and laps 50 to 90 % slower.

**The Steward Penalty:** a car hit by it at full speed loses more than twice the road it loses to an Oil Slick (`powerups-check` `stewardCostsMoreThanOil`).

**On screen** (`docs/review/2026-10-10/balance-*.jpg`, from the real game): the wall hit from the chase camera and from the replay's trackside camera, the Steward Penalty's blast, and the field going round a spinning car. Looking at them found two faults, both fixed: the chase camera stayed on the road while the car went to the wall, and CPU cars drove straight through a spinning car instead of round it.

**Against the targets:**
- **From last:** Pro top 5 94 % (the target was at least 55 %); Legend top 10 96 % with a win in 4 % of races; Rookie wins every time.
- **From pole:** Pro 60 % (the aim was 45 to 55 %), Legend 13 % (15 to 25 %), Rookie 100 % (about 90 %). Pro and Legend are within the measurement's noise of their aims. Rookie is easier than aimed for, from either end of the grid.
- **Stuck behind a car on Pro:** 29 %, over the first round's 25 % target; blocked episodes that end without a pass are down from 34 % to 15 %.
