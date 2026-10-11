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
| then | The champagne; the camera orbits | A cork for each bottle at the moment its spray starts (first, second, third, a quarter of a second or so apart), the fizz, cheering that fades |

Back to pit lane works at any moment and stops the sound. Reduced motion keeps the sound. With the game's sound off nothing is played and the ceremony keeps only a 3 s pause where the anthem goes. Replays are not affected. Two-player and single-race podiums run the same.

## The anthems

Synthesized by the game from note lists, never a recording. The melodies are not written from memory: each comes from a file kept in `tools/anthems/`, and `anthem-data.js` is generated from them by `tools/anthems/build.js` (a test checks the committed file is exactly what the sources build to).

- **From MIDI files on Wikimedia Commons**, read mechanically (`tools/anthems/midi.js`: the tune's track and the bass track, the top and bottom note at each onset): France, the United Kingdom, Germany, Japan, Canada, Australia.
- **Read by hand from a score**, typed into `tools/anthems/transcribed/<country>.txt`, each naming its score: the Netherlands and Spain (public-domain files on Commons), Monaco (nationalanthems.info's score, CC BY 4.0) and New Zealand (Woods's melody, from the New Zealand Gazette's setting as nationalanthems.info hosts it; linked, not kept).
- **None for Italy and Brazil.** No score of either that is both free to use and legible enough to read reliably was found (the candidates: a low-resolution modern edition, a museum cover, the piano introduction only). Their winners get the game's own fanfare, an original tune, in the anthem's place.
- **Thailand's is held back.** It was transcribed from the Royal Gazette's score and checked, but its composer died in 1968: public domain in Thailand, not clearly so everywhere. A Thai winner gets the fanfare until the user decides.

Every composition is in the public domain. Each source's URL, author and licence is in the data, in `THIRD-PARTY-NOTICES` and credited in the README.

Each excerpt is the opening of the anthem to a cadence, at the score's tempo: 15 to 38 s (Japan's is the whole anthem; Germany's leaves out a repeat and Canada's the middle lines). Where the source has no bass line, a plain one (roots under the tune) was written for the game and the transcription says so.

Each driver in `game-data.js` has a `country`, the nationality they race under; the banners carry its flag (`r3d/flags.js`, plain geometry).

## The synth (`podium-sound.js`)

Pure, UMD, deterministic; the same code renders in the game, in the Node tests and in the WAVs (`tools/render-podium-sound.js`).

- **Anthem and fanfares:** a small brass band in a hall. The tune on trumpets (additive, nine harmonics that open as the note swells, a soft 45 ms attack, a little vibrato), the same an octave down on horns, the bass on a tuba, through a Schroeder reverb.
- **Crowd:** three bands of noise, each swelling on its own, shaped by the beats (a cheer as each driver steps up, a roar with the trophy, cheering that fades after the champagne).
- **Applause:** hundreds of claps, each a few milliseconds of bright noise, thinning out.
- **Cork:** a short thump whose pitch falls, and the first hiss.
- **Fizz:** bright noise pulsing as the bottle is shaken, dying away as it empties (none on Low, where there is no spray).
- **Confetti cannon:** a low thump and a rush.

`cues(ceremony, { tier })` places each sound on the timeline. The game renders the buffers one task at a time behind the cup's last results (the anthem in four steps), and on the ceremony's first frame schedules every cue on the audio clock, through the master gain (the sound setting).

## Checks

- **Node:** the timeline's new order and that the anthem's length moves what follows; each driver maps to an anthem or the fallback; each excerpt's length, range and note order; the sources and licences recorded and credited; the note lists equal the build; the synth plays the right pitches at the right times; the cues sit on the beats.
- **Browser (`podium-check`):** with the sound off, silent and short; with it on, the anthem is the winner's (Gasly: France; Leclerc: Monaco; Antonelli: the fanfare), every sound rendered ahead and started at its beat on the audio clock, the audio clock runs with the picture, the anthem is really heard (level, and one long note's pitch measured), a drop leaves no bottle before its own cork, and leaving stops it.
