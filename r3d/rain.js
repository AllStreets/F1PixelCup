// Rain (docs/superpowers/specs/2026-09-29-rain-design.md): the wet road, the
// overcast, the falling rain and the spray off the wheels. What is wet is the
// game's (weather.js); this draws it. All of it is off in a dry race.
import * as THREE from "three";
import { tunnelUniforms, TUNNEL_GLSL } from "./tunnel-light.js";

// A material that looks different wet: its roughness and how much darker its
// colour goes (water fills the texture and darkens it).
export function wettable(material, wet) {
  material.userData.wet = wet;
  return material;
}
export const WET_ROAD = { roughness: 0.28, tint: 0.6 };
export const WET_RUNOFF = { roughness: 0.35, tint: 0.7 };
export const WET_GRAVEL = { roughness: 0.7, tint: 0.75 };
export const WET_PAINT = { roughness: 0.3, tint: 0.92 };
export const WET_GRASS = { roughness: 0.75, tint: 0.8 };

// How many streaks fall and how many spray particles there can be, by tier.
const STREAKS = { high: 5000, medium: 2500, low: 1000 };
const SPRAY = { high: 1400, medium: 700, low: 0 };
// The box of rain round the camera, how fast it falls (and drifts), and the
// shutter that turns a drop into a streak.
const BOX = new THREE.Vector3(760, 420, 760);
const FALL = 170;
const WIND = new THREE.Vector2(14, 6);
const SHUTTER = 1 / 30;
// Spray: its life, how it rises and falls, and the speed below which a
// tyre throws none.
const SPRAY_LIFE = 0.55;
const SPRAY_GRAVITY = 140;
const SPRAY_FROM = 45;
const SPRAY_NEAR = 900;
// The overcast: the sun's share, the sky's grey, the fog in closer.
const OVERCAST = { sun: 0.3, hemi: 0.85, env: 0.9, fog: 0.6, near: 0.55, far: 0.6 };
const GREY = new THREE.Color("#7c838b");

function buildStreaks() {
  const n = STREAKS.high;
  const seeds = new Float32Array(n * 2 * 3);
  const ends = new Float32Array(n * 2);
  let s = 12345;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i += 1) {
    const x = rand(); const y = rand(); const z = rand();
    for (let k = 0; k < 2; k += 1) {
      seeds.set([x, y, z], (i * 2 + k) * 3);
      ends[i * 2 + k] = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute("aEnd", new THREE.BufferAttribute(ends, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...tunnelUniforms,
      uTime: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uCamVel: { value: new THREE.Vector3() },
      uBox: { value: BOX.clone() },
      uFall: { value: FALL },
      uWind: { value: WIND.clone() },
      uShutter: { value: SHUTTER },
      uColor: { value: new THREE.Color("#cfd6de") },
      uOpacity: { value: 0.38 },
    },
    vertexShader: /* glsl */ `
      attribute float aEnd;
      uniform float uTime, uFall, uShutter;
      uniform vec3 uCamera, uCamVel, uBox;
      uniform vec2 uWind;
      varying float vFade;
      varying vec3 vPos;
      void main() {
        // Each drop falls through a box of rain fixed to the world, wrapped
        // round the camera: driving through it is what slants the streaks.
        vec3 drift = vec3(uWind.x, -uFall, uWind.y) * uTime;
        vec3 corner = uCamera - uBox * 0.5;
        vec3 head = mod(position * uBox + drift - corner, uBox) + corner;
        // Seen by a moving camera over one shutter: the drop's motion less the camera's.
        vec3 rel = vec3(uWind.x, -uFall, uWind.y) - uCamVel;
        vec3 p = head - rel * uShutter * aEnd;
        vec3 off = (head - uCamera) / (uBox * 0.5);
        vFade = (1.0 - smoothstep(0.7, 1.0, max(abs(off.x), max(abs(off.y), abs(off.z))))) * smoothstep(6.0, 30.0, length(head - uCamera));
        vPos = head;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${TUNNEL_GLSL}
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;
      varying vec3 vPos;
      void main() {
        // No rain under the tunnel's roof.
        float open = smoothstep(0.35, 0.95, tunnelOpen(vPos));
        gl_FragColor = vec4(uColor, uOpacity * vFade * open);
      }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  lines.name = "rain";
  return lines;
}

function buildSpray() {
  const n = SPRAY.high;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("aLife", new THREE.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color("#dfe4ea") } },
    vertexShader: /* glsl */ `
      attribute float aLife;
      uniform float uScale;
      varying float vLife;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Grows as it rises and spreads.
        gl_PointSize = aLife > 0.0 ? uScale * (4.0 + 10.0 * (1.0 - aLife)) / -mv.z : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vLife;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float soft = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(uColor, soft * vLife * 0.32);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.name = "spray";
  return points;
}

export function createRain(scene) {
  const streaks = buildStreaks();
  const spray = buildSpray();
  streaks.visible = false;
  spray.visible = false;
  scene.add(streaks, spray);
  const drops = Array.from({ length: SPRAY.high }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  let next = 0;
  let wet = false;
  let tier = "high";
  let time = 0;
  const lastCamera = new THREE.Vector3();
  const camVel = new THREE.Vector3();
  const wheelAt = new THREE.Vector3();
  let emitted = 0;

  // Make a circuit wet or dry: its surfaces, its light, its fog and its sky.
  // The dry values are kept, so a dry race after a wet one is dry again.
  function apply(world, scene3, isWet) {
    if (world.weather === (isWet ? "wet" : "dry")) return;
    world.weather = isWet ? "wet" : "dry";
    world.group.traverse((o) => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        const w = m.userData.wet;
        if (!w) return;
        if (!m.userData.dry) m.userData.dry = { roughness: m.roughness, color: m.color.clone() };
        const dry = m.userData.dry;
        m.roughness = isWet ? w.roughness : dry.roughness;
        m.color.copy(dry.color);
        if (isWet) m.color.multiplyScalar(w.tint);
      });
      const sky = o.material.uniforms && o.material.uniforms.overcast;
      if (sky) sky.value = isWet ? (world.venue.night ? 0.5 : 1) : 0;
    });
    if (!world.dryLight) world.dryLight = { ...world.light };
    const dl = world.dryLight;
    Object.assign(world.light, isWet
      ? { sun: dl.sun * OVERCAST.sun, hemi: dl.hemi * OVERCAST.hemi, env: dl.env * OVERCAST.env }
      : { sun: dl.sun, hemi: dl.hemi, env: dl.env });
    const fog = scene3.fog;
    if (fog) {
      if (!world.dryFog) world.dryFog = { color: fog.color.clone(), near: fog.near, far: fog.far };
      const df = world.dryFog;
      fog.color.copy(df.color);
      if (isWet && !world.venue.night) fog.color.lerp(GREY, OVERCAST.fog);
      fog.near = isWet ? df.near * OVERCAST.near : df.near;
      fog.far = isWet ? df.far * OVERCAST.far : df.far;
    }
  }

  function setTier(next) {
    tier = next;
    streaks.geometry.setDrawRange(0, STREAKS[tier] * 2);
  }

  // Each frame: the rain round the camera, and the spray behind every car
  // near it that is going fast enough to throw any.
  function update({ camera, world, racers, dt, isWet }) {
    wet = isWet;
    streaks.visible = wet;
    const sprayOn = wet && SPRAY[tier] > 0;
    spray.visible = sprayOn;
    if (!wet) {
      lastCamera.copy(camera.position);
      return;
    }
    time += dt;
    if (dt > 0) camVel.copy(camera.position).sub(lastCamera).divideScalar(dt);
    // A jump (a new camera, a new circuit) is not the camera driving.
    if (camVel.length() > 1500) camVel.set(0, 0, 0);
    lastCamera.copy(camera.position);
    const u = streaks.material.uniforms;
    u.uTime.value = time;
    u.uCamera.value.copy(camera.position);
    u.uCamVel.value.copy(camVel);

    emitted = 0;
    const cap = SPRAY[tier];
    if (sprayOn && world) {
      racers.forEach((racer) => {
        const car = world.cars.get(racer.id);
        if (!car || !car.root.visible) return;
        const speed = Math.abs(racer.speed || 0);
        if (speed < SPRAY_FROM) return;
        if (car.root.position.distanceTo(camera.position) > SPRAY_NEAR) return;
        const share = Math.min(1, (speed - SPRAY_FROM) / 150);
        const heading = racer.heading || 0;
        const back = { x: -Math.cos(heading), z: -Math.sin(heading) };
        ["RL", "RR"].forEach((id) => {
          const wheel = car.wheels && car.wheels[id];
          if (!wheel) return;
          wheel.getWorldPosition(wheelAt);
          // Per wheel, per second: up to 90 puffs at speed.
          let count = share * 90 * dt;
          while (count > 0) {
            if (count < 1 && Math.random() > count) break;
            count -= 1;
            const d = drops[next];
            next = (next + 1) % cap;
            const spread = (Math.random() - 0.5) * 30;
            d.life = 1;
            d.x = wheelAt.x + back.x * 4;
            d.y = wheelAt.y - 1;
            d.z = wheelAt.z + back.z * 4;
            d.vx = back.x * speed * 0.25 - back.z * spread + racer.speed * Math.cos(heading) * 0.55;
            d.vz = back.z * speed * 0.25 + back.x * spread + racer.speed * Math.sin(heading) * 0.55;
            d.vy = 30 + Math.random() * 45 * share;
            emitted += 1;
          }
        });
      });
    }
    const pos = spray.geometry.attributes.position;
    const life = spray.geometry.attributes.aLife;
    let live = 0;
    for (let i = 0; i < SPRAY.high; i += 1) {
      const d = drops[i];
      if (i >= cap || !sprayOn) d.life = 0;
      if (d.life > 0) {
        d.life -= dt / SPRAY_LIFE;
        d.vy -= SPRAY_GRAVITY * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.life > 0) live += 1;
      }
      pos.setXYZ(i, d.x, d.y, d.z);
      life.setX(i, Math.max(0, d.life));
    }
    pos.needsUpdate = true;
    life.needsUpdate = true;
    spray.userData.live = live;
  }

  return {
    apply,
    setTier,
    update,
    inspect: () => ({
      wet,
      streaks: streaks.visible ? streaks.geometry.drawRange.count / 2 : 0,
      spray: spray.visible ? spray.userData.live || 0 : 0,
      camVel: camVel.length(),
    }),
  };
}
