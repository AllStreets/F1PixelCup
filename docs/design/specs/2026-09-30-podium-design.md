# The 3D podium ceremony (Stage K)

Roadmap stage 11. At the end of a cup, the top three of the real cup standings stand on a podium in 3D: the Blender-built drivers (Stage I) in their teams' suits, bareheaded with their own faces (the user, 2026-10-01; until the driver faces land they wear their own helmets). The ceremony runs as it does after a Grand Prix.

## The set (`r3d/podium.js`)

- **The podium.** Three steps: P1 in the middle and highest, P2 on its left, P3 on its right. They are numbered on their fronts and faced in the cup's colour.
- **Behind them,** a backdrop wall carrying the game's own original mark ("F1 PIXEL CUP" and the cup's name; no real series or sponsor marks).
- **In front of them,** a floor. Banners in each driver's team colours hang above their steps.
- **The light** is warm key light from the front with a cool rim from behind, in the style of a TV ceremony.
- **The drivers** come from `assets/driver.glb`, one clone each, dressed through the materials by role:
  - the suit in the team's base colour;
  - the trim in the team's trim colour;
  - dark gloves and boots;
  - bareheaded, each with their own face (`buildDriver(driver, team, { headwear: "none" })`, from the driver faces work); until that lands, the helmet with the driver's own painted design, the same texture the car's helmet wears (`r3d/car.js`).

## The ceremony

A timeline, on real time (it isn't the race clock):

| Time | What happens |
|---|---|
| 0–2.5 s | The camera sweeps in. The drivers stand (`stand`). |
| 2.5–5 s | P3, then P2, then P1 raise their arms (`arms_up`), each on stepping forward. |
| 5–9 s | P1 lifts the trophy (`trophy`) while P2 and P3 wave (`wave`). A confetti burst comes down over the podium. |
| 9 s on | All three spray champagne (`spray`). The spray shoots from each bottle's neck in the direction the bottle points and falls under gravity. The confetti keeps drifting down. The camera orbits slowly. It loops. |

Confetti is instanced paper squares tumbling as they fall, in the three drivers' team colours and gold. There are 600 pieces on High, 300 on Medium and 120 on Low. The spray is a pooled points system of 1500 drops on High and 750 on Medium (none on Low); a drop ends on what it hits (a step, the floor or the wall). Confetti lies where it lands, and goes round again only where the camera can't see it or after fading out. The trophy and the bottles change hands halfway through the poses' crossfade.

With reduced motion asked for, the camera holds its settled view, nobody steps forward, the banners hang still, the confetti lies on the ground, there is no spray, and the name plates stay up.

## In the page

- The podium screen keeps its title, its "Continue" and the career strip.
- The page's title (kicker, title, career strip) never touches the wall's own title: the camera frames the wall's title below it, and where a window's shape would still bring them together, the picture is lowered (a lens shift) just enough, eased so the shot never jumps.
- With 3D, the 2D steps give way to name plates over the scene (place, driver, team, points). Without 3D (or while it loads), the 2D steps are the fallback, as now.
- Leaving the screen stops the ceremony and frees its drivers.

## Checks

- **Browser** (`tools/checks/podium-check.js`):
  - the three drivers on the podium are the real cup's top three, in order (P1 in the middle);
  - each wears its team's suit colour and its own helmet texture (or, bareheaded, its own face);
  - the poses advance on the timeline;
  - the trophy is shown only while P1 lifts it;
  - confetti falls and spray flies once the ceremony reaches them;
  - leaving the screen stops it and frees it;
  - the 2D fallback without 3D;
  - no errors.
- **Screenshots** of the ceremony at each stage, with Leclerc and Hamilton on the podium.
