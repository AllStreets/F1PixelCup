// Post-processing: the hybrid look (docs/superpowers/specs/2026-09-29-postfx-design.md).
//
// A Broadcast base -- bloom, a per-circuit grade, a vignette, a sun flare when
// the sun is really in view, a speed blur at the edges of the frame and heat
// haze at Bahrain -- with brief Arcade bursts on the player's own events: a
// gold punch for Overtake Mode, a red pulse when hit, a blur surge on DRS.
//
// Which parts run depends on the graphics tier (quality.js): high has it all,
// medium bloom + grade + bursts, low none of it (the scene is drawn directly).
//
// Every tier draws the scene the same way, straight to the canvas: the sky and
// the fog are authored in display space, and three.js only tone-maps a draw to
// the screen, so an HDR render target would tone-map them twice and wash the
// picture out. The effects tiers then copy the finished frame into a texture
// and work on it in display space -- High is Low plus the effects, never a
// different exposure.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { CopyShader } from "three/addons/shaders/CopyShader.js";

// Per-circuit grades, in display space: lift and gain per channel, then
// contrast and saturation. Night circuits bloom more (the floodlights).
const GRADES = {
  monza: { gain: [1.03, 1.0, 0.95], lift: [0, 0, 0], contrast: 1.04, saturation: 1.08 },
  spa: { gain: [0.96, 1.0, 1.04], lift: [0, 0.005, 0.012], contrast: 1.05, saturation: 0.92 },
  silverstone: { gain: [0.98, 1.0, 1.02], lift: [0, 0, 0.008], contrast: 1.03, saturation: 1.0 },
  suzuka: { gain: [1.0, 1.02, 0.98], lift: [0, 0, 0], contrast: 1.04, saturation: 1.04 },
  monaco: { gain: [1.02, 1.0, 0.98], lift: [0, 0, 0], contrast: 1.06, saturation: 1.12 },
  singapore: { gain: [1.05, 1.0, 0.96], lift: [0, 0.01, 0.02], contrast: 1.08, saturation: 1.1, night: true },
  bahrain: { gain: [1.06, 1.0, 0.9], lift: [0.01, 0.005, 0], contrast: 1.05, saturation: 1.05, haze: 1 },
  interlagos: { gain: [1.02, 1.02, 0.98], lift: [0, 0, 0], contrast: 1.05, saturation: 1.1 },
  albertpark: { gain: [1.02, 1.01, 0.97], lift: [0, 0, 0.004], contrast: 1.05, saturation: 1.12 },
  shanghai: { gain: [1.01, 1.0, 0.97], lift: [0.012, 0.012, 0.014], contrast: 1.02, saturation: 0.94 },
  jeddah: { gain: [1.04, 1.0, 0.95], lift: [0.004, 0.01, 0.02], contrast: 1.08, saturation: 1.12, night: true },
  miami: { gain: [1.03, 1.01, 0.97], lift: [0, 0, 0], contrast: 1.06, saturation: 1.18 },
  imola: { gain: [1.0, 1.02, 0.97], lift: [0, 0.004, 0], contrast: 1.05, saturation: 1.06 },
  barcelona: { gain: [1.04, 1.01, 0.94], lift: [0.006, 0.004, 0], contrast: 1.05, saturation: 1.04 },
  montreal: { gain: [0.99, 1.0, 1.02], lift: [0, 0.003, 0.008], contrast: 1.04, saturation: 1.08 },
  redbullring: { gain: [0.99, 1.02, 1.0], lift: [0, 0.004, 0.006], contrast: 1.05, saturation: 1.1 },
  hungaroring: { gain: [1.04, 1.01, 0.95], lift: [0.004, 0.002, 0], contrast: 1.05, saturation: 1.05 },
  zandvoort: { gain: [0.99, 1.0, 1.03], lift: [0.006, 0.008, 0.012], contrast: 1.03, saturation: 1.02 },
  baku: { gain: [1.03, 1.0, 0.97], lift: [0.004, 0.004, 0.006], contrast: 1.06, saturation: 1.06 },
  cota: { gain: [1.04, 1.01, 0.94], lift: [0.004, 0.002, 0], contrast: 1.05, saturation: 1.06 },
  mexico: { gain: [1.02, 1.0, 0.98], lift: [0.006, 0.006, 0.01], contrast: 1.04, saturation: 1.1 },
  lasvegas: { gain: [1.04, 0.98, 1.04], lift: [0.008, 0.004, 0.02], contrast: 1.1, saturation: 1.2, night: true },
  losail: { gain: [1.05, 1.0, 0.93], lift: [0.006, 0.006, 0.014], contrast: 1.07, saturation: 1.08, night: true },
  yasmarina: { gain: [1.03, 0.99, 1.0], lift: [0.004, 0.008, 0.022], contrast: 1.08, saturation: 1.14, night: true },
  hockenheim: { gain: [1.0, 1.01, 0.98], lift: [0, 0.003, 0.004], contrast: 1.05, saturation: 1.04 },
  nurburgring: { gain: [0.97, 1.0, 1.03], lift: [0.006, 0.008, 0.012], contrast: 1.03, saturation: 0.92 },
  estoril: { gain: [1.04, 1.01, 0.95], lift: [0.004, 0.003, 0], contrast: 1.05, saturation: 1.06 },
  kyalami: { gain: [1.05, 1.01, 0.93], lift: [0.006, 0.004, 0], contrast: 1.06, saturation: 1.02 },
  sepang: { gain: [1.0, 1.02, 0.99], lift: [0.008, 0.01, 0.01], contrast: 1.03, saturation: 1.12 },
  istanbul: { gain: [1.05, 1.0, 0.94], lift: [0.006, 0.004, 0.002], contrast: 1.05, saturation: 1.0 },
  mugello: { gain: [1.03, 1.01, 0.96], lift: [0.002, 0.002, 0], contrast: 1.05, saturation: 1.1 },
  watkinsglen: { gain: [1.05, 1.0, 0.92], lift: [0.004, 0.002, 0], contrast: 1.06, saturation: 1.12 },
  // The podium ceremony (r3d/podium.js): a warm TV grade, its lights bloom.
  podium: { gain: [1.04, 1.0, 0.96], lift: [0.004, 0.004, 0.012], contrast: 1.07, saturation: 1.06, night: true },
};
const NEUTRAL = { gain: [1, 1, 1], lift: [0, 0, 0], contrast: 1, saturation: 1 };

// The passes draw on three's full-screen triangle: a position and a uv, no
// normal (one would compile them differently), for compiling them ahead.
const QUAD = new THREE.BufferGeometry();
QUAD.setAttribute("position", new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
QUAD.setAttribute("uv", new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
const QUAD_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uVignette: { value: 0.28 },
    uAspect: { value: 16 / 9 },
    uSun: { value: new THREE.Vector2(-1, -1) },
    uSunVisible: { value: 0 },
    uFlare: { value: 0 },
    uBlur: { value: 0 },
    uHaze: { value: 0 },
    uTime: { value: 0 },
    uGold: { value: 0 },
    uRed: { value: 0 },
    uRain: { value: 0 },
    uStreak: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uLift, uGain;
    uniform float uContrast, uSaturation, uVignette, uAspect, uSunVisible, uFlare, uBlur, uHaze, uTime, uGold, uRed, uRain, uStreak;
    uniform vec2 uSun;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    // Rain on the lens: in each cell of a grid, maybe a drop, that lands,
    // slides down a little and dries; it bends the picture behind it like a
    // lens. At speed the airflow stretches the drops sideways.
    vec3 drops(vec2 uv, float scale, float seed) {
      vec2 g = vec2(uv.x * uAspect, uv.y) * scale;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = hash(id + seed);
      float t = fract(uTime * (0.18 + 0.2 * h) + h * 7.0);
      vec2 c = (vec2(hash(id + seed + 1.3), hash(id + seed + 2.7)) - 0.5) * 0.6;
      c.y -= t * 0.35;
      float r = 0.16 * (0.5 + 0.5 * hash(id + seed + 4.1));
      // Whole inside its cell (stretched by the airflow too), never cut by its edge.
      float wide = r * (1.0 + uStreak * 1.5);
      c = clamp(c, vec2(-0.48 + wide, -0.48 + r), vec2(0.48 - wide, 0.48 - r));
      vec2 d = f - c;
      d.x /= 1.0 + uStreak * 1.5;
      float there = step(h, uRain * 0.5) * (1.0 - t);
      float drop = smoothstep(r, r * 0.8, length(d)) * there;
      // In screen units: a drop is a little lens, and turns what is behind
      // it over (the offset is about its own size); its edge is a dark rim.
      vec2 offset = d / scale;
      offset.x /= uAspect;
      float rim = smoothstep(r * 0.55, r * 0.95, length(d)) * drop;
      return vec3(offset * drop * 1.8, rim);
    }
    void main() {
      vec2 uv = vUv;
      float rim = 0.0;
      if (uRain > 0.001) {
        vec3 a = drops(vUv, 7.0, 0.0);
        vec3 b = drops(vUv, 13.0, 17.0);
        uv -= a.xy + b.xy;
        rim = max(a.z, b.z);
      }
      // Heat haze: a shimmer in the band just above the road's horizon.
      if (uHaze > 0.0) {
        float band = smoothstep(0.38, 0.5, uv.y) * smoothstep(0.66, 0.52, uv.y);
        uv.x += sin(uv.y * 140.0 + uTime * 7.0) * 0.0011 * uHaze * band;
      }
      vec3 col = texture2D(tDiffuse, uv).rgb;
      col *= 1.0 - rim * 0.18;
      // Speed: a radial blur that only touches the edges of the frame.
      if (uBlur > 0.001) {
        vec2 dir = uv - 0.5;
        float edge = smoothstep(0.18, 0.72, length(dir));
        vec3 acc = col;
        for (int i = 1; i < 6; i++) acc += texture2D(tDiffuse, uv - dir * float(i) * 0.011 * uBlur * edge).rgb;
        col = acc / 6.0;
      }
      // Arcade punch: a quick colour split on a hit or Overtake Mode.
      float split = uRed * 0.006 + uGold * 0.004;
      if (split > 0.0001) {
        col.r = mix(col.r, texture2D(tDiffuse, uv + (uv - 0.5) * split).r, 0.85);
        col.b = mix(col.b, texture2D(tDiffuse, uv - (uv - 0.5) * split).b, 0.85);
      }
      // The grade.
      col = (col - 0.5) * uContrast + 0.5;
      col = col * uGain + uLift;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      // The sun flare: a soft glow round the sun and ghosts along the line
      // through the middle of the frame -- only while the sun is really seen.
      if (uSunVisible * uFlare > 0.001) {
        vec2 d = uv - uSun; d.x *= uAspect;
        float glow = exp(-dot(d, d) * 38.0) * 0.32;
        vec2 axis = vec2(0.5) - uSun;
        float ghosts = 0.0;
        for (int i = 1; i < 4; i++) {
          vec2 g = uv - (uSun + axis * float(i) * 0.6); g.x *= uAspect;
          ghosts += smoothstep(0.035 + 0.012 * float(i), 0.0, length(g)) * 0.07;
        }
        col += (glow + ghosts) * uSunVisible * uFlare * vec3(1.0, 0.9, 0.72);
      }
      // Overtake Mode: warm light round the edges.
      float r = length((uv - 0.5) * vec2(1.0, 1.0 / uAspect * 1.6));
      col += uGold * vec3(0.22, 0.16, 0.0) * smoothstep(0.25, 0.75, r);
      // The vignette, and a red pulse through it when hit.
      float vig = smoothstep(0.42, 0.9, length(uv - 0.5) * 1.2);
      col *= 1.0 - vig * uVignette;
      col = mix(col, vec3(0.85, 0.06, 0.05), vig * uRed * 0.55);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPostFx(renderer, scene, camera) {
  let tier = "low";
  let passes = { composer: false, bloom: false, grade: false, flare: false, speedBlur: false, haze: false, bursts: false };
  let composer = null;
  let bloom = null;
  let finish = null;
  let frameTexture = null;
  // The effects' shaders, compiled in the background when they are built;
  // until they are ready the frame is drawn without them rather than
  // stalling on them.
  let ready = false;
  let warming = null;
  // Each view's own bursts and sun (split screen has two; one view is view 0).
  // The flare eases on real time (it is how the picture looks, paused or not);
  // the bursts fade on race time (they freeze with a paused race).
  const views = [];
  function viewFor(index) {
    if (!views[index]) {
      views[index] = { burst: { gold: 0, red: 0, blur: 0 }, playerId: null, sunVisible: 0, sunCheck: 0, sunBlocked: false, sunOnScreen: false, sunBlocker: "", lastWall: 0 };
    }
    return views[index];
  }
  viewFor(0);
  // The view being drawn, in the drawing buffer's pixels (null: the whole canvas).
  let pixels = null;
  // The size last asked for (setSize), in CSS px.
  let sized = null;
  const sunNdc = new THREE.Vector3();
  const ray = new THREE.Raycaster();

  // A player's own events set off the bursts in that player's view (other cars' don't).
  function onFx(event) {
    const d = event.detail || {};
    if (!passes.bursts) return;
    views.forEach((v) => {
      if (!v.playerId || d.racerId !== v.playerId) return;
      if (d.type === "overtakeMode") v.burst.gold = 1;
      else if (d.type === "hitTaken") v.burst.red = 1;
      else if (d.type === "itemUsed" && d.item === "drs") v.burst.blur = 1;
    });
  }
  window.addEventListener("f1:fx", onFx);

  // The frame, copied off the canvas: sized to its drawing buffer, or to the
  // view's part of it.
  function frameSize() {
    return pixels ? new THREE.Vector2(pixels.w, pixels.h) : renderer.getDrawingBufferSize(new THREE.Vector2());
  }

  function build() {
    const size = sized ? new THREE.Vector2(sized.w, sized.h) : renderer.getSize(new THREE.Vector2());
    const drawn = frameSize();
    frameTexture = new THREE.FramebufferTexture(drawn.x, drawn.y);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    // The first pass reads the copied frame, not the composer's buffer.
    const frame = new ShaderPass(CopyShader, "frame");
    frame.uniforms.tDiffuse.value = frameTexture;
    composer.addPass(frame);
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.4, 0.9);
    composer.addPass(bloom);
    finish = new ShaderPass(FinishShader);
    composer.addPass(finish);
    ready = false;
    warming = null;
    if (renderer.compileAsync) warm();
    else ready = true;
  }

  // Low keeps nothing on the GPU: the composer's buffers, the bloom's mips
  // and the frame copy are freed, and built again if a higher tier returns.
  function release() {
    if (!composer) return;
    bloom.dispose();
    finish.material.dispose();
    composer.passes.forEach((pass) => { if (pass !== bloom && pass !== finish && pass.material) pass.material.dispose(); });
    composer.dispose();
    frameTexture.dispose();
    composer = null;
    bloom = null;
    finish = null;
    frameTexture = null;
    ready = false;
    warming = null;
  }

  function setTier(next) {
    tier = next;
    passes = (window.Quality ? window.Quality.passesFor(next) : passes);
    if (passes.composer && !composer) build();
    if (!passes.composer) release();
    if (bloom) bloom.enabled = passes.bloom;
    if (!passes.bursts) views.forEach((v) => { v.burst.gold = 0; v.burst.red = 0; v.burst.blur = 0; });
  }

  // The size the effects work at, in CSS px: the canvas, or (view true) one
  // split-screen view (the views are the same size).
  function setSize(w, h, dpr, view = false) {
    sized = { w, h };
    pixels = view ? { w: Math.round(w * dpr), h: Math.round(h * dpr) } : null;
    if (!composer) return;
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    const drawn = frameSize();
    if (frameTexture.image.width !== drawn.x || frameTexture.image.height !== drawn.y) {
      frameTexture.dispose();
      frameTexture = new THREE.FramebufferTexture(drawn.x, drawn.y);
      composer.passes[0].uniforms.tDiffuse.value = frameTexture;
    }
  }

  // How much of the sun the camera sees: on screen, in front, and not behind
  // scenery (a ray toward it, every few frames, eased).
  function updateSun(v, sunPosition, occluders, dt) {
    // Project with the camera as it is this frame (its matrices are otherwise
    // only brought up to date when the scene is drawn).
    camera.updateMatrixWorld();
    sunNdc.copy(sunPosition).project(camera);
    const onScreen = sunNdc.z < 1 && Math.abs(sunNdc.x) < 1.15 && Math.abs(sunNdc.y) < 1.15;
    v.sunOnScreen = onScreen;
    let target = 0;
    if (onScreen) {
      v.sunCheck -= 1;
      if (v.sunCheck <= 0) {
        v.sunCheck = 6;
        const dir = sunPosition.clone().sub(camera.position).normalize();
        ray.set(camera.position, dir);
        ray.far = camera.position.distanceTo(sunPosition);
        const hit = occluders.length > 0 ? ray.intersectObjects(occluders, true).find((h) => !h.object.userData.ground) : null;
        v.sunBlocked = Boolean(hit);
        v.sunBlocker = hit ? (hit.object.name || hit.object.parent?.name || hit.object.type) : "";
      }
      target = v.sunBlocked ? 0 : 1 - Math.min(1, Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)));
    }
    v.sunVisible += (target - v.sunVisible) * Math.min(1, dt * 6);
    finish.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
    finish.uniforms.uSunVisible.value = v.sunVisible;
  }

  // frame: { dt, now, trackId, speedFraction, boosting, playerId, sunPosition,
  // occluders, view, viewport }. Split screen draws each view on its own:
  // view is 0 or 1, viewport its rectangle in CSS px from the canvas's
  // bottom left (the renderer's viewport and scissor are already set to it).
  function render(frame) {
    const v = viewFor(frame.view || 0);
    v.playerId = frame.playerId || null;
    const dt = Math.min(0.1, Math.max(0, frame.dt || 0));
    // Bursts fade: the gold over half a second, the red faster, the blur slower.
    const burst = v.burst;
    burst.gold *= Math.exp(-dt / 0.5);
    burst.red *= Math.exp(-dt / 0.3);
    burst.blur *= Math.exp(-dt / 0.7);
    if (!passes.composer || !composer || !ready) {
      renderer.render(scene, camera);
      return;
    }
    const grade = GRADES[frame.trackId] || NEUTRAL;
    const u = finish.uniforms;
    u.uLift.value.fromArray(grade.lift);
    u.uGain.value.fromArray(grade.gain);
    u.uContrast.value = grade.contrast;
    u.uSaturation.value = grade.saturation;
    u.uAspect.value = camera.aspect;
    u.uTime.value = (frame.now || 0) / 1000;
    u.uHaze.value = passes.haze ? grade.haze || 0 : 0;
    u.uFlare.value = passes.flare && !grade.night ? 1 : 0;
    const speed = Math.max(0, Math.min(1, ((frame.speedFraction || 0) - 0.55) / 0.45));
    // The speed blur is High's; the DRS surge is a burst, so Medium has it too.
    const steady = passes.speedBlur ? speed * 0.4 + (frame.boosting ? 0.12 : 0) : 0;
    u.uBlur.value = Math.min(1, steady + (passes.bursts ? burst.blur * 0.7 : 0));
    u.uGold.value = burst.gold;
    u.uRed.value = burst.red;
    // Rain on the lens, stretched by the airflow at speed.
    u.uRain.value = Math.max(0, Math.min(1, frame.rain || 0));
    u.uStreak.value = speed;
    // Bloom only on real highlights (the sun, the floodlights, the item
    // boxes' glow), in display space: the sky and the white kerbs must not
    // bloom into a veil. Night bloom is only a touch stronger.
    bloom.strength = (grade.night ? 0.32 : 0.3) + burst.gold * 0.35;
    bloom.threshold = 0.9;
    const wall = performance.now();
    const wallDt = v.lastWall ? Math.min(0.1, (wall - v.lastWall) / 1000) : 0;
    v.lastWall = wall;
    // No sun to find at night (and no rays spent looking for it).
    if (passes.flare && !grade.night && frame.sunPosition) updateSun(v, frame.sunPosition, frame.occluders || [], wallDt);
    else { v.sunVisible = 0; u.uSunVisible.value = 0; }
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    // A view's own rectangle is copied, and the last pass draws back into it
    // (the renderer's viewport and scissor are the view's).
    const at = frame.viewport;
    const ratio = renderer.getPixelRatio();
    if (at) copyFrom.set(Math.round(at.x * ratio), Math.round(at.y * ratio));
    renderer.copyFramebufferToTexture(frameTexture, at ? copyFrom : null);
    composer.render(dt);
  }
  const copyFrom = new THREE.Vector2();

  // Compile the effects' shaders (the scene's compile never sees them) with
  // the targets they draw to: all but the last into the effects' buffers, the
  // last to the screen.
  function warm() {
    if (!composer) return Promise.resolve();
    if (warming) return warming;
    const quads = (list) => { const g = new THREE.Group(); list.forEach((m) => g.add(new THREE.Mesh(QUAD, m))); return g; };
    const offscreen = [composer.passes[0].material, composer.copyPass.material, bloom.materialHighPassFilter,
      ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial];
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.readBuffer);
    const jobs = [renderer.compileAsync(quads(offscreen), QUAD_CAMERA)];
    renderer.setRenderTarget(null);
    jobs.push(renderer.compileAsync(quads([finish.material]), QUAD_CAMERA));
    renderer.setRenderTarget(before);
    const built = composer;
    const done = () => { if (composer === built) ready = true; };
    warming = Promise.all(jobs).then(done, done);
    return warming;
  }

  // Everything it holds on the GPU, and its listener (a second instance, the
  // podium's, comes and goes).
  function dispose() {
    release();
    window.removeEventListener("f1:fx", onFx);
  }

  return {
    render,
    setTier,
    setSize,
    warm,
    dispose,
    // Back to one view: player 2's bursts and sun are let go.
    dropViews() { views.length = 1; },
    // index: which split-screen view's bursts and sun (0 with one view).
    inspect: (index = 0) => ({
      tier,
      // Whether the effects are drawing (their shaders compiled).
      drawing: Boolean(composer && ready),
      passes: { ...passes, bloom: Boolean(bloom && bloom.enabled && passes.bloom) },
      burst: { ...viewFor(index).burst },
      sunVisible: viewFor(index).sunVisible,
      sun: { onScreen: viewFor(index).sunOnScreen, blocked: viewFor(index).sunBlocked, by: viewFor(index).sunBlocker },
      blur: finish ? finish.uniforms.uBlur.value : 0,
      rain: finish ? finish.uniforms.uRain.value : 0,
      // What the effects hold on the GPU: the copied frame's size, or null.
      frame: frameTexture ? { width: frameTexture.image.width, height: frameTexture.image.height } : null,
    }),
  };
}
