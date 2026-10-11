# The trophy presentation

The user (2026-10-12): "I want there to be 3 trophies and a ceremony scene that includes presentation of them to each of the three podium drivers. Use the current 1st place trophy for 3rd place but make it bronze, then a bigger trophy that's silver for 2nd and a grand, larger gold trophy for first. This scene does not have to be too long, but have a well-dressed man or woman present them. [...] make sure it has relevant audio and flows well with the existing scenes, and no audio or visuals overlap [...] rather, flow together smoothly."

## Where it sits

Four scenes, each ending before the next begins (`ceremony.js`: `SCENES`):

| Scene | From | What |
|---|---|---|
| Arrival | 0 | The sweep in; the drivers step up, arms raised |
| Anthem | 5.8 s | All three stand for the winner's anthem |
| Presentation | 0.2 s after the anthem's last sound | The trophies: third, second, then the winner, whose lift is the big one |
| Champagne | 4.6 s after the winner takes the trophy | Corks, spray, the orbit |

The old trophy moment (the winner alone, a trophy appearing in the hand) is gone: the winner's lift at the end of the presentation is that moment, once, with the gold trophy handed over.

## The trophies (`r3d/trophies.js`)

Made in the podium's own scene (lathed, compiled with it), each in its own metal under the podium's lights:

- **Third:** the trophy the winner used to lift (the same profile and handles, from `tools/blender/build_driver.py`), in bronze. 33 cm.
- **Second:** a bigger cup of its own shape: a tall goblet with a knop in the stem, in silver. 50 cm.
- **First:** a grand one: a dark plinth, a wide urn with two big handles and a lid with a finial, in gold. 72 cm.

They wait in a row on a clothed table off the podium's left end (from the camera), its length running away from the camera: the bronze nearest, the gold at the back. The table is outside every step's front from wherever the camera is (a test holds it to that), so it never covers a number or a name plate, and it stays where it is through the champagne. Confetti lies on its top.

## The presenter (`r3d/presenter.js`)

A dignitary, not a driver: built on the driver figure with a look of their own from the faces system and formal wear (the suit's sheet draws a shirt front, lapels and a tie or a blouse, and behind a collar, the back seam and its vent; bare hands; black shoes). A man in a dark navy suit and tie, or a woman in a deep green trouser suit: which one is drawn from the cup and its top three, so the same podium always has the same presenter. Not a real person's likeness.

## The scene (18.5 s to the winner's trophy, then the 4.6 s lift)

The presenter stands by the table from the start of the ceremony, as the officials of a real podium do, and does not move until the anthem is over. Then for third, second and first in turn: turns to the table, takes the trophy in both hands (by its foot), lifts it straight up and in, turns, walks to the foot of that driver's step, turns to the driver and holds it up; the driver bends and takes it by the stem, under the cup; the presenter lets go and nods; the driver lifts it. Third and second then bring theirs down in front of the chest, the left hand takes the stem under the right, and the left keeps it by their side. With the winner's trophy given, the presenter turns and walks away past the front of the table, out of the picture (of a 16:9 window and of one as wide as 32:9) before the first bottle is in a hand, while the winner lifts the gold one (the fanfare sting, the confetti cannons, the roar: the moment that was already there). In the last second of the lift the winner brings it down to the left hand the same way, so the right is free for the bottle: no hand ever holds a trophy and a bottle, and a trophy is never in nobody's hands.

The pace is a person's: a walk of 1.8 m/s reached and left over a third of a second, turns made on the spot (never while walking), the legs' swing matched to the ground covered. That and the table standing off the podium's end are why it runs 18.5 s and not the 12 to 16 first aimed at: the earlier 14.8 s had the presenter moving at up to 4.3 m/s round a table that stood in front of the first step's number.

With reduced motion nobody steps: each driver stands forward on their step from the start, so the handover is the same.

Hands are placed, not played back: each arm is solved (two bones, shoulder to wrist) every frame to put the hand on the trophy, and to turn it along the stem, so the hands meet it wherever the steps and the trophy's size put it. A hand comes to a stem another hand holds from the side, and leaves it to the side, never through the cup; held up, a trophy leans in the hand so its foot is clear of the wrist. These gestures are laid over the figure's own poses (`r3d/gestures.js`); the model file is unchanged.

## Sound (`podium-sound.js`), no overlaps

- A processional of its own (an original tune, the same brass band) in time with the scene: it starts with the presentation, 0.2 s after the anthem's last echo; its tempo is set so that its four phrases bring the presenter to the winner and its last note sounds as the gold trophy is raised to them; it has died away as the winner takes it, when the sting begins.
- The crowd: applause through the scene that swells at each handover and rises to the winner's; then the roar, held through the lift.
- A soft metallic ring as each trophy is lifted, lower for the bigger ones.
- The winner's lift keeps its sting and cannons.

Every cue belongs to a scene and ends before the next scene starts: the arrival's crowd before the anthem's first note, the anthem's last echo before the processional, the sting and the roar before the first cork. Tests hold the cues and the picture's beats to that.

## Camera

A medium shot that follows the presenter from the table to each handover and back, standing off to the right of what it looks at so a handover is seen between the two of them and not over the presenter's shoulder; never faster than 3 m/s. Then the push in on the winner for the lift, and back to the wide for the champagne. The name plates step aside for the whole presentation. Reduced motion keeps the camera still (and the plates up: the table is clear of them). With the sound off the timing is the same (only the anthem's wait shortens, as before).

## Checks

Node: the scenes in order without overlap (picture and sound), each handover's order (taken from the table, carried, given, lifted, brought down to the left hand), one big lift only, the presenter's pace, turns and path (never through a step or the table), out of the picture before the champagne at 16:9, 21:9 and 32:9, the table clear of every step's front from every camera position, the shot's side and speed, the processional's fit to the scene. Browser (`podium-check`), measured in the scene every frame rather than read back from the timeline: three trophies in three metals and three sizes standing on the table; each trophy always on the table or in somebody's hands; hands within 3 cm wherever they are put on a trophy; no forearm through a cup, no trophy into a body, no trophy through another or the table; the presenter's pace; the presenter is nobody on the grid and the same for the same podium; no trophy in the hand that holds the bottle; the table clear of the name plates; the same with reduced motion; frame time per tier; no leak.
