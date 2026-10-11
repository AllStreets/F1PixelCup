# The podium's sound and the winner's anthem

The user (2026-10-11): "there should be sounds for the champagne popping and the podium celebrations. I want to have the national anthem play, just like an instrumental version of the national anthem, for the winning driver corresponding to their homeland."

## The order of the ceremony

As at a real podium (`ceremony.js`, `withAnthem(seconds)`; everything after the anthem moves with its length):

| When | What is seen | What is heard |
|---|---|---|
| 0 to 2.5 s | The camera sweeps in | The crowd's murmur swelling |
| 2.5 to 5.2 s | Third, second, then first step forward, arms up | A cheer for each |
| 5.8 s, for the anthem's length | All three stand still; the camera pushes slowly in on the winner, their flag on the banner behind | The winner's anthem, then applause |
| 0.9 s after it, for 4 s | The winner lifts the trophy, the others wave, confetti | A fanfare sting, two confetti cannons, the roar |
| then | The champagne; the camera orbits | A cork for each bottle at the moment its spray starts (first, second, third, a quarter of a second or so apart), the fizz, cheering that settles to a quiet murmur for as long as the podium stays up |

Back to pit lane works at any moment and stops the sound. Reduced motion keeps the sound (but not the fizz: no spray is drawn then). With the game's sound off nothing is played and the ceremony keeps only a 3 s pause where the anthem goes. Replays are not affected. Two-player and single-race podiums run the same.

## The anthems

Synthesized by the game from note lists, never a recording. The melodies are not written from memory: each comes from a file kept in `tools/anthems/`, and `anthem-data.js` is generated from them by `tools/anthems/build.js` (a test checks the committed file is exactly what the sources build to).

- **From MIDI files on Wikimedia Commons**, read mechanically (`tools/anthems/midi.js`: the tune's track and the bass track, the top and bottom note at each onset): France, the United Kingdom, Germany, Japan, Canada, Australia.
- **Read by hand from a score**, typed into `tools/anthems/transcribed/<country>.txt`, each naming its score: the Netherlands, Spain and Thailand (public-domain files on Commons), Italy (the Canto line of Maurizio Benedetti's critical edition on IMSLP, dedicated to the public domain; the first strophe, without the piano introduction, whose dense chords could not be read reliably), Monaco and Brazil (nationalanthems.info's scores, CC BY 4.0; Brazil's is the anthem's instrumental introduction) and New Zealand (Woods's melody, from the New Zealand Gazette's setting as nationalanthems.info hosts it; linked, not kept). A second reader checked every one note by note against its score.
- **Thailand** (the user, 2026-10-12: include it): its composer died in 1968, so it is in the public domain in Thailand and was published there as a state announcement, but not yet everywhere by the life-plus-70 rule. The notices say so.
- All 20 drivers have an anthem (13 countries). The game's own fanfare, an original tune, is kept for a winner from anywhere else.

Each source's URL, author and licence is in the data, in `THIRD-PARTY-NOTICES` and credited in the README.

Each excerpt is the opening of the anthem to a cadence, at the score's tempo: 15 to 38 s (Japan's is the whole anthem; Germany's leaves out a repeat and Canada's the middle lines). Where the source has no bass line, a plain one (roots under the tune) was written for the game and the transcription says so.

Each driver in `game-data.js` has a `country`, the nationality they race under; the banners carry its flag (`r3d/flags.js`, plain geometry).

## The synth (`podium-sound.js`)

Pure, UMD, deterministic; the same code renders in the game, in the Node tests and in the WAVs (`tools/render-podium-sound.js`).

- **Anthem and fanfares:** a small brass band in a hall. The tune on trumpets (additive, nine harmonics that open as the note swells, a soft 45 ms attack, a little vibrato, each note tongued so a repeated note is heard twice), the same an octave down on horns, the bass on a tuba, through a Schroeder reverb. A tune written above the trumpets' top (Kimigayo's source) is played an octave down; a bass under the tuba's reach an octave up.
- **Crowd and applause:** voices, not noise (`crowd-sound.js`; docs/superpowers/specs/2026-10-12-crowd-sound-design.md), shaped by the beats (a cheer as each driver steps up, hands after the anthem, a roar with the trophy, cheering that settles after the champagne).
- **Cork:** a short thump whose pitch falls, and the first hiss.
- **Fizz:** bright noise pulsing as the bottle is shaken, dying away as it empties (none on Low, where there is no spray).
- **Confetti cannon:** a low thump and a rush.

`cues(ceremony, { tier, spray })` places each sound on the timeline; the whole mix never clips. The game renders the buffers a small step per task behind the cup's last results (the anthem two notes at a time), in the order they are needed, and on the ceremony's first frame schedules every cue on the audio clock, through the master gain (the sound setting). Pressed before they are all rendered, the ceremony still opens at once and each sound joins as it is ready. Changing the sound setting on the results lays the ceremony out again.

## Checks

- **Node:** the timeline's new order and that the anthem's length moves what follows; each driver maps to an anthem or the fallback; each excerpt's length, range and note order; the sources and licences recorded and credited; the note lists equal the build; the synth plays the right pitches at the right times; the cues sit on the beats.
- **Browser (`podium-check`):** with the sound off, silent and short; with it on, the anthem is the winner's (Gasly: France; Leclerc: Monaco; Antonelli: Italy), every sound rendered ahead and started at its beat on the audio clock (and caught up after an early press), the sound setting changed on the results, the 2D podium's sound, the audio clock runs with the picture, the anthem is really heard (level, and one long note's pitch measured), a drop leaves no bottle before its own cork, and leaving stops it.
