# A crowd that sounds like people

The user (2026-10-12), of the podium: "the crowd roar honestly sounds more like a water splashing sound. I want it to be more of a crowd roar."

## Why it sounded like water

The roar, the cheer, the welcome and the murmur were three bands of noise, each swelling slowly; the applause was bursts of bright noise; the grandstands' crowd in a race was one band of noise. Measured, the old roar had its centre of gravity at 3.3 kHz, 23% of its energy above 5 kHz, a spectrum as flat as noise (flatness 0.94) and almost no movement at the rate of syllables. That is surf, not voices.

## What a crowd is now (`crowd-sound.js`)

Pure, UMD, deterministic; rendered to samples, the same in the game, the tests and the WAVs.

- **Voices.** A few dozen, each a pulse train at a man's or a woman's shouting pitch (about 105 to 200 Hz and 210 to 380 Hz, up to a fifth higher when the crowd is excited), tilted bright as a shout is, through the three formants of a vowel ("aah", "ooh", "yeah", "oh", "ay"). Each shouts in syllables of its own (0.25 to 1.4 s, with breaths between), the pitch rising into the shout and sagging out of it, with a slow wander and a little roughness. How excited the crowd is sets how loud and how often each one shouts.
- **Near and far.** One voice in six (one in four in the grandstands) is near and louder, so a voice or two can be told apart, as in a real crowd.
- **Hubbub.** Under the voices only: noise kept between about 450 Hz and 2.4 kHz.
- **On top:** whistles (a tone swooping up, fluttering), an air horn or two, hand claps (a click through a resonance between 900 Hz and 2.2 kHz), placed where the crowd is most excited. Applause is mostly claps with a few voices.
- **A hall** round it (comb filters into all-passes).
- It is made at half the output rate and doubled, so nothing is left above 6 kHz: the bright hiss stays the champagne's.

The podium (`podium-sound.js`): the welcome (a cheer as each driver steps up), the applause after the anthem, the trophy's roar (up within a second, dying over several), the cheering at the champagne and the looped murmur are all this crowd with different shapes. The grandstands in a race (`game.js`): a 7 s loop of the same, rendered a few voices per task when the sound starts, its level set by how near the stands are, as before.

## The guard

`tests/crowd-sound.test.js` measures the rendered sounds and fails on shaped noise (the old recipe is kept in the test to show it):

| Measure | A crowd must be | The old roar |
|---|---|---|
| Spectral centroid | 600 to 1900 Hz | 3340 Hz |
| Energy above 5 kHz | under 3% | 23% |
| Flatness, 300 Hz to 3 kHz | under 0.72 | 0.94 |
| Loudness ripple at 2 to 8 Hz (syllables) | over 0.085 of the mean | 0.06 |

The fizz is held to the opposite (centroid over 4 kHz, over 40% above 5 kHz), so the two stay apart.

## To listen

`docs/review/2026-10-12/`: `crowd-roar-before.wav`, `crowd-roar-after.wav`, `grandstand-crowd.wav` (the loop twice), and `podium-celebration.wav` again.
