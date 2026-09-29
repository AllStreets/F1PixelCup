// Starts the 3D renderer, or says clearly that it can't. The game shows a
// loading state until window.Render3D is ready, and switches to its 2D view
// only when this reports a failure: no WebGL, the renderer script missing, or
// the renderer throwing while it starts.
function fail(reason, error) {
  console.warn(`3D renderer unavailable (${reason}); using the 2D view.`, error || "");
  window.Render3D = { ready: false, failed: true };
}

function hasWebGL() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch (error) {
    return false;
  }
}

if (!hasWebGL()) fail("no WebGL");
else import("./render3d.js").catch((error) => fail("renderer failed to start", error));
