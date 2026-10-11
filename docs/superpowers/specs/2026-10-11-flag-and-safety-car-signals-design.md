# The chequered flag official and the Safety Car's signals (2026-10-11)

## The user's message, as tasks

(A subagent read the dictated message and listed its tasks; this is that list,
checked against the text. "col"/"HDL" is colour/HSL, "final lab" the final lap,
"Stewart's" the Steward's.)

1. **A chequered-flag official.**
   - a. "a person that looks slightly different from our drivers and our team mechanic": a figure of their own, not a driver, not the pit crew.
   - b. "meant to look like the person that actually does this in real life": dressed as the official who waves the flag at a finish.
   - c. "waving a checkered flag on the side of the racetrack right next to the actual driving lane": by the line, at the barrier beside the road, really waving.
   - d. "only on the final lap": from when the leader starts the last lap.
   - e. "stopping once the person that gets first wins": it stops when the winner takes the flag.
   - f. "not even if it's not me or P1 or P2": whoever wins, a CPU car as much as a player.
2. **A SAFETY CAR sign on screen.**
   - a. "kind of like the final lap sign ... says safety car": the words SAFETY CAR, in the FINAL LAP call's style.
   - b. "the exact same colour as the flag that appears for a normal safety car in F1": the yellow of the flags and the SC board shown under a Safety Car.
   - c. "appear when safety car appears": it comes on when the Safety Car is called.
   - d. "fade out as the safety car is off": it fades when the Safety Car goes in.
3. **A sound when the Safety Car comes out**, "that everyone hears": every player, its own sound.
4. **A sound for the player hit by the Steward Penalty**, "whether it's P1 or P2", "different from the other negative sound effects".

## 1. The official

- **Who:** the people model's standing civilian figure (the spectators' model, not the crews' overalls nor a driver's suit), dressed as a race official: white shirt, navy trousers, a gold trim. They stand on a flag stand (a railed platform on a post) where the old starter's box stood: just before the line, right behind the barrier on the side away from the pit wall (r3d/trackside.js buildStarter's own search for clear ground), facing the road. Never on the road: the scenery audit takes the stand in as before.
- **When** (`Marshals.chequered(racers, laps)`, pure): the flag waves while some car is on the last lap (`lap >= laps - 1`) and nobody has finished. It stops the moment the first car finishes, whoever it is. Before the last lap and after the winner the official holds the flag lowered at their side.
- **How it waves:** the figure's right arm, straight, raised over the head and swinging at the shoulder (`Marshals.flagPose`: one pure pose both the person shader's arm and the flag follow), the pole's foot at the wrist and the pole along the arm, the chequered cloth rippling. At rest the arm is down and the flag held out low over the rail. Raising and lowering ease over 0.4 s.
- **Everywhere:** the race's trackside frame carries `chequer` (so both split-screen views show it); a replay works it out from the recorded cars' laps (nothing new recorded); all three tiers draw it. The fireworks at the flag are unchanged.

## 2. The SAFETY CAR sign

- **Colour:** `#FEDD00`, hsl(52, 100%, 50%): Pantone Yellow C, the colour the FIA's International Sporting Code (Appendix H, flag specifications) gives for the yellow flag, which with the "SC" board is what the posts show under a Safety Car.
- **Style:** the FINAL LAP call's: bold 46 px Georgia, centred, one line lower (so the two can show together).
- **When** (`Entrances.sign(memory, out, now)`, pure): `out` is the Safety Car called and not yet going in (not leaving, not parked). The sign fades in over 0.25 s when it is called, stays while it is out, and fades over 1.5 s once it goes in.
- **Where:** each player's own HUD in the race (both views of two players); in a replay the same words in the broadcast graphics, from the recorded Safety Car.

## 3 and 4. The sounds (`signal-sounds.js`, pure recipes the game plays)

- **Safety Car out** (`SignalSounds.SAFETY_CAR`): a two-tone warning, low-high four times (triangle 587 Hz and 784 Hz, 0.16 s each), unlike the game's single beeps and sweeps. Played once on every call of the Safety Car, on the game's one sound output: every player hears it. In a replay, when the Safety Car appears.
- **Steward Penalty on you** (`SignalSounds.STEWARD_HIT`): a referee's double whistle (two sawtooth bursts falling from 2,350 Hz with a quick trill) over a low thud, in place of the spin's sound for that hit. Played for a human driver the penalty spins (player 1 or 2; not when Overtake Mode shrugs it off, not for CPU cars; once for one blast). In a replay, at the penalty's blast (its big flash; a shrugged one flashes smaller and is silent), as loud as it is near, in place of the spin's sound for the cars it spins.
- `tools/render-signal-sounds.js` renders both to WAV (docs/review/2026-10-11/) from the same recipes.

## Tests and checks

- Node: `Marshals.flagPose` (the pole's foot at the wrist, the pole along the raised arm); `Replay.eventsBetween` (the two sounds' events); `Marshals.chequered` (not before the last lap, on it, off at the first finisher, CPU or player); `Entrances.sign` (in, held, fade, gone; a replay seeking back); the two recipes (distinct from each other, each renders audibly, lengths).
- Browser, added to trackside-check (the official: not waving before the last lap, waving on it, lowered once a CPU car wins, a figure of the official kind on a stand clear of the road), powerups-check (the sign's alpha with the Safety Car out and after; the Safety Car sound once per call; the Steward sound once for a human hit, never for a CPU one or a shrugged one). Each seen failing on the old code. The replay's side (its events, the sign's memory on a seek back, the flag from recorded laps) is covered by the Node tests, not a browser check.
