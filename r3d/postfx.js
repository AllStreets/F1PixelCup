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
};
const NEUTRAL = { gain: [1, 1, 1], lift: [0, 0, 0], contrast: 1, saturation: 1 };

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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uLift, uGain;
    uniform float uContrast, uSaturation, uVignette, uAspect, uSunVisible, uFlare, uBlur, uHaze, uTime, uGold, uRed;
    uniform vec2 uSun;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      // Heat haze: a shimmer in the band just above the road's horizon.
      if (uHaze > 0.0) {
        float band = smoothstep(0.38, 0.5, uv.y) * smoothstep(0.66, 0.52, uv.y);
        uv.x += sin(uv.y * 140.0 + uTime * 7.0) * 0.0011 * uHaze * band;
      }
      vec3 col = texture2D(tDiffuse, uv).rgb;
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
  const burst = { gold: 0, red: 0, blur: 0 };
  let playerId = null;
  let sunVisible = 0;
  let sunCheck = 0;
  let sunBlocked = false;
  let sunOnScreen = false;
  let sunBlocker = "";
  // The flare eases on real time (it is how the picture looks, paused or not);
  // the bursts fade on race time (they freeze with a paused race).
  let lastWall = 0;
  const sunNdc = new THREE.Vector3();
  const ray = new THREE.Raycaster();

  // The player's own events set off the bursts (other cars' don't).
  window.addEventListener("f1:fx", (event) => {
    const d = event.detail || {};
    if (!passes.bursts || !playerId || d.racerId !== playerId) return;
    if (d.type === "overtakeMode") burst.gold = 1;
    else if (d.type === "hitTaken") burst.red = 1;
    else if (d.type === "itemUsed" && d.item === "drs") burst.blur = 1;
  });

  // The frame, copied off the canvas: sized to its drawing buffer.
  function frameSize() {
    return renderer.getDrawingBufferSize(new THREE.Vector2());
  }

  function build() {
    const size = renderer.getSize(new THREE.Vector2());
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
  }

  function setTier(next) {
    tier = next;
    passes = (window.Quality ? window.Quality.passesFor(next) : passes);
    if (passes.composer && !composer) build();
    if (!passes.composer) release();
    if (bloom) bloom.enabled = passes.bloom;
    if (!passes.bursts) { burst.gold = 0; burst.red = 0; burst.blur = 0; }
  }

  function setSize(w, h, dpr) {
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
  function updateSun(sunPosition, occluders, dt) {
    // Project with the camera as it is this frame (its matrices are otherwise
    // only brought up to date when the scene is drawn).
    camera.updateMatrixWorld();
    sunNdc.copy(sunPosition).project(camera);
    const onScreen = sunNdc.z < 1 && Math.abs(sunNdc.x) < 1.15 && Math.abs(sunNdc.y) < 1.15;
    sunOnScreen = onScreen;
    let target = 0;
    if (onScreen) {
      sunCheck -= 1;
      if (sunCheck <= 0) {
        sunCheck = 6;
        const dir = sunPosition.clone().sub(camera.position).normalize();
        ray.set(camera.position, dir);
        ray.far = camera.position.distanceTo(sunPosition);
        const hit = occluders.length > 0 ? ray.intersectObjects(occluders, true).find((h) => !h.object.userData.ground) : null;
        sunBlocked = Boolean(hit);
        sunBlocker = hit ? (hit.object.name || hit.object.parent?.name || hit.object.type) : "";
      }
      target = sunBlocked ? 0 : 1 - Math.min(1, Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)));
    }
    sunVisible += (target - sunVisible) * Math.min(1, dt * 6);
    finish.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
    finish.uniforms.uSunVisible.value = sunVisible;
  }

  // frame: { dt, now, trackId, speedFraction, boosting, playerId, sunPosition, occluders }
  function render(frame) {
    playerId = frame.playerId || null;
    const dt = Math.min(0.1, Math.max(0, frame.dt || 0));
    // Bursts fade: the gold over half a second, the red faster, the blur slower.
    burst.gold *= Math.exp(-dt / 0.5);
    burst.red *= Math.exp(-dt / 0.3);
    burst.blur *= Math.exp(-dt / 0.7);
    if (!passes.composer || !composer) {
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
    // Bloom only on real highlights (the sun, the floodlights, the item
    // boxes' glow), in display space: the sky and the white kerbs must not
    // bloom into a veil. Night bloom is only a touch stronger.
    bloom.strength = (grade.night ? 0.32 : 0.3) + burst.gold * 0.35;
    bloom.threshold = 0.9;
    const wall = performance.now();
    const wallDt = lastWall ? Math.min(0.1, (wall - lastWall) / 1000) : 0;
    lastWall = wall;
    // No sun to find at night (and no rays spent looking for it).
    if (passes.flare && !grade.night && frame.sunPosition) updateSun(frame.sunPosition, frame.occluders || [], wallDt);
    else { sunVisible = 0; u.uSunVisible.value = 0; }
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    renderer.copyFramebufferToTexture(frameTexture);
    composer.render(dt);
  }

  return {
    render,
    setTier,
    setSize,
    inspect: () => ({
      tier,
      passes: { ...passes, bloom: Boolean(bloom && bloom.enabled && passes.bloom) },
      burst: { ...burst },
      sunVisible,
      sun: { onScreen: sunOnScreen, blocked: sunBlocked, by: sunBlocker },
      blur: finish ? finish.uniforms.uBlur.value : 0,
      // What the effects hold on the GPU: the copied frame's size, or null.
      frame: frameTexture ? { width: frameTexture.image.width, height: frameTexture.image.height } : null,
    }),
  };
}
