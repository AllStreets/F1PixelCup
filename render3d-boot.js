// Starts the 3D renderer, or says clearly that it can't. The game shows a
// loading state until window.Render3D is ready, and switches to its 2D view
// only when this reports a failure: no WebGL, the renderer script missing, or
// the renderer throwing while it starts. progressAt is bumped as the car
// downloads, so a slow connection is told apart from a stalled one.
window.Render3DBoot = { startedAt: performance.now(), progressAt: 0 };

function fail(reason, error) {
  console.warn(`3D renderer unavailable (${reason}); using the 2D view.`, error || "");
  window.Render3D = { ready: false, failed: true };
}

function hasWebGL() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    // Hand the probe's context straight back; the renderer makes its own.
    if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch (error) {
    return false;
  }
}

if (!hasWebGL()) fail("no WebGL");
else import("./render3d.js").catch((error) => fail("renderer failed to start", error));
