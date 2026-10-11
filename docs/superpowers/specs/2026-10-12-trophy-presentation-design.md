# The trophy presentation

The user (2026-10-12): "I want there to be 3 trophies and a ceremony scene that includes presentation of them to each of the three podium drivers. Use the current 1st place trophy for 3rd place but make it bronze, then a bigger trophy that's silver for 2nd and a grand, larger gold trophy for first. This scene does not have to be too long, but have a well-dressed man or woman present them. [...] make sure it has relevant audio and flows well with the existing scenes, and no audio or visuals overlap [...] rather, flow together smoothly."

## Where it sits

Four scenes, each ending before the next begins (`ceremony.js`: `SCENES`):

| Scene | From | What |
|---|---|---|
| Arrival | 0 | The sweep in; the drivers step up, arms raised |
| Anthem | 5.8 s | All three stand for the winner's anthem |
| Presentation | half a second after the anthem's last sound | The trophies: third, second, then the winner, whose lift is the big one |
| Champagne | 4.6 s after the winner takes the trophy | Corks, spray, the orbit |

The old trophy moment (the winner alone, a trophy appearing in the hand) is gone: the winner's lift at the end of the presentation is that moment, once, with the gold trophy handed over.

## The trophies (`r3d/trophies.js`)

Made in the podium's own scene (lathed, compiled with it), each in its own metal under the podium's lights:

- **Third:** the trophy the winner used to lift (the same profile and handles, from `tools/blender/build_driver.py`), in bronze. 33 cm.
- **Second:** a bigger cup of its own shape: a tall goblet with a knop in the stem, in silver. 50 cm.
- **First:** a grand one: a dark plinth, a wide urn with two big handles and a lid with a finial, in gold. 72 cm.

They wait on a small clothed table in front of the podium, beside the first step's number and clear of where the presenter stands for each handover.

## The presenter (`r3d/presenter.js`)

A dignitary, not a driver: built on the driver figure with a look of their own from the faces system and formal wear (the suit's sheet draws a shirt front, lapels and a tie or a blouse; bare hands; black shoes). A man in a dark navy suit and tie, or a woman in a deep green trouser suit: which one is drawn from the cup and its top three, so the same podium always has the same presenter. Not a real person's likeness.

## The scene (12.75 s to the winner's trophy, then the 4.6 s lift)

The presenter walks on from the side to the table. Then for third, second and first in turn: takes the trophy from the table in both hands (by its base), walks to the foot of that driver's step, holds it up; the driver reaches down and takes it by the stem; the presenter lets go and nods; the driver lifts it. Third and second then hold theirs in the left hand. With the winner's trophy given, the presenter steps back and walks off while the winner lifts the gold one (the fanfare sting, the confetti cannons, the roar: the moment that was already there). In the last moments of the lift the winner passes it to the left hand, so the right is free for the bottle: no hand ever holds a trophy and a bottle.

Hands are placed, not played back: each arm is solved (two bones, shoulder to wrist) every frame to put the hand on the trophy, so the hands meet it wherever the steps and the trophy's size put it. Walking swings the legs in step with the distance covered. These gestures are laid over the figure's own poses (`r3d/gestures.js`); the model file is unchanged.

## Sound (`podium-sound.js`), no overlaps

- A short processional of its own (an original tune, the same brass band) from the presenter's first steps, ended (its last echo included) before the winner's lift.
- The crowd: applause through the scene that swells at each handover; the winner's is the roar.
- A soft metallic ring as each trophy is lifted, lower for the bigger ones.
- The winner's lift keeps its sting and cannons.

Every cue belongs to a scene and ends before the next scene starts: the arrival's crowd before the anthem's first note, the anthem's last echo before the processional, the sting and the roar before the first cork. Tests hold the cues and the picture's beats to that.

## Camera

A medium shot that follows each handover along the podium, the push in on the winner for the lift, then back to the wide for the champagne. The name plates step aside for the whole presentation. Reduced motion keeps the camera still. With the sound off the timing is the same (only the anthem's wait shortens, as before).

## Checks

Node: the scenes in order without overlap (picture and sound), each handover's order (taken from the table, carried, given, lifted, held in the left hand), one big lift only, the presenter gone before the champagne, the camera continuous. Browser (`podium-check`): three trophies in three metals and three sizes, each where the timeline says (table, presenter, driver's right hand, left hand); hands within 3 cm of the trophy at each handover; the presenter is nobody on the grid and the same for the same podium; no trophy in the hand that holds the bottle; frame time per tier; no leak.
