# Performance headroom: resolution per tier, dynamic resolution, cheaper shadows

Date: 2026-10-05. Branch `perf`. Asked by the user ("the game is pretty laggy now").

## What the measurements showed

A headed, GPU-accelerated Chromium on the user's Mac (Apple M5 Pro, 120 Hz ProMotion
Retina screen), at devicePixelRatio 2 in a 1728x1117 window (a 3456x2234 drawing
buffer), timing real `requestAnimationFrame` intervals, the GPU (the
`EXT_disjoint_timer_query_webgl2` timer) and the main thread (`tools/perf/`).

- **The user's lag was the machine, not the game.** Seven agents' browsers ran at
  100 % CPU each (load average 246). With them stopped the user found the lag gone.
  The shared runner now allows two agent browsers at a time.
- **No commit made the game slower.** The same scenes at nine commits from
  2026-10-01 (`b04943f`) to `main` cost the same: 8 to 9 ms of GPU a race frame on a
  quiet machine. The moving crowd costs nothing measurable (frozen or removed, the
  same numbers): its pose is worked out in the vertex shader.
- **But there is no headroom.** A race frame at DPR 2 takes 8 to 10 ms of GPU with
  vsync, about 14.6 ms with vsync off (High, Monaco), against 8.3 ms per frame on a
  120 Hz screen. The cost follows the pixel count: 7.9 ms at a pixel ratio of 1.5,
  4.8 ms at 1. Medium costs as much as High at DPR 2 (its bloom and frame copy are
  full size). About 40 % of the draw calls are the sun's shadow map (some 460 of
  1,100 at Monaco).

## Rules

1. **A render pixel ratio cap per tier** (`Quality.PIXEL_RATIO`): High 2, Medium 1.5,
   Low 1 (never more than the screen's own ratio). The 2D HUD keeps the screen's
   ratio: text stays crisp whatever the 3D does.
2. **Dynamic resolution** (`Quality.createScaler`), during racing frames only: the
   ratio steps down by 0.125 when the frames miss 60 fps (median over 18.5 ms or
   the slowest tenth over 26 ms), and when a high-refresh screen's frames
   alternate between one and two refreshes (judder), down to a floor per tier
   (High 1.25, Medium 1, Low 0.75; never above the cap). It steps back up when
   there is clear headroom (the slowest tenth under 12 ms), or, on a 60 Hz screen
   where headroom can't be seen, as a probe after some seconds steady; a probe that
   fails waits twice as long next time. The High look at full size is kept
   whenever the machine holds it.
3. **Smarter auto quality.** In Auto, the tier steps down only once the dynamic
   resolution is at its floor and the frames have missed 60 fps for three windows
   running, so a machine that can hold High at a lower ratio keeps High's effects.
   The stepped-down tier starts no higher than the ratio it had. The first second
   of racing (and after a pause) is not judged. A new circuit starts at the tier's
   own ratio again. The showroom and the podium always draw at the tier's cap.
4. **Cheaper shadows.** Each car casts its shadow from one mesh of the whole car
   (`carShadow`, which writes no colour or depth when the scene is drawn) in place
   of a shadow draw for each of its twenty-odd parts: at Monaco the shadow map
   went from about 440 draws a frame to under 100. The turn of the wheels and the
   DRS flap no longer show in the shadow (too small to see there).
5. **Bloom without full-size copies.** The frame copied off the canvas is read
   straight by the bloom (half size and down) and by the finish pass, which adds
   the bloom as it reads the frame. The old chain copied the frame into a
   full-size half-float buffer, blended the bloom over it full size and copied
   again; the picture is the same sum (frame + bloom).
6. **A perf check that can fail** (`tools/checks/perf-check.js`, headed through
   `tools/perf/check-headed.js`): a race at Monaco at DPR 2 (CDP device metrics)
   must draw within each tier's cap, cast every car's shadow from its one mesh,
   keep the shadow map's draws few, and lower the ratio when frames are made slow;
   headed, High and Medium and the showroom must hold 60 fps and the ratio must
   climb back.

## Not changed

The crowd, the yachts and the post-processing chain look the same. Nothing new
draws.
