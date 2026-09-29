// Light in the tunnel (docs/superpowers/specs/2026-09-29-trackside-design.md,
// G2). Whatever is inside the tunnel -- the road, the barriers, the cars, the
// walls and ceiling -- is out of the sky's and the sun's light, and lit by the
// lamps instead; whatever is outside is not touched. So from the approach the
// mouth is dark, from inside the exit is bright, and a car is dark or lit by
// where it is, not by where the camera is.
//
// The tunnel is handed to the shaders as a chain of boxes along its stretch of
// the lap. Every lit (standard) material gets a few lines added: its light is
// scaled by how deep inside the tunnel the pixel is, easing in over RAMP at
// each portal as light spills in, and the lamps' warm light is added.
import * as THREE from "three";

const SEGMENTS = 24;
export const TUNNEL_RAMP = 40;
// What of the daylight still reaches the middle of the tunnel.
const DEEP = 0.08;

export const tunnelUniforms = {
  tOn: { value: 0 },
  tBound: { value: new THREE.Vector4() },
  tSegA: { value: Array.from({ length: SEGMENTS }, () => new THREE.Vector4()) },
  tSegB: { value: Array.from({ length: SEGMENTS }, () => new THREE.Vector4()) },
  tLength: { value: 1 },
  tRoof: { value: 36 },
  tLamp: { value: new THREE.Color(0xffd6a0).multiplyScalar(0.3) },
};

// Point the shaders at a circuit's tunnel (or at none).
export function setTunnel(course, tunnel, roof) {
  const u = tunnelUniforms;
  if (!tunnel) { u.tOn.value = 0; return; }
  const total = course.track.totalLength;
  const length = ((tunnel.to - tunnel.from) % total + total) % total;
  const part = length / SEGMENTS;
  let cx = 0;
  let cz = 0;
  const centres = [];
  for (let k = 0; k < SEGMENTS; k += 1) {
    const s = part * (k + 0.5);
    const p = course.sampleAt(tunnel.from + s);
    const half = Math.max(p.outerL, p.outerR) + 2.5;
    u.tSegA.value[k].set(p.x, p.y, p.tx, p.ty);
    u.tSegB.value[k].set(part / 2 + 1, half, s, p.h);
    centres.push([p.x, p.y, half]);
    cx += p.x / SEGMENTS;
    cz += p.y / SEGMENTS;
  }
  const radius = Math.max(...centres.map(([x, z, half]) => Math.hypot(x - cx, z - cz) + Math.hypot(part / 2 + 1, half)));
  u.tBound.value.set(cx, cz, radius, 0);
  u.tLength.value = length;
  u.tRoof.value = roof;
  u.tOn.value = 1;
}

export const TUNNEL_GLSL = /* glsl */ `
  uniform float tOn;
  uniform vec4 tBound;
  uniform vec4 tSegA[${SEGMENTS}];
  uniform vec4 tSegB[${SEGMENTS}];
  uniform float tLength;
  uniform float tRoof;
  uniform vec3 tLamp;
  // 1 outside the tunnel, down to ${DEEP.toFixed(2)} deep inside it.
  float tunnelOpen(vec3 p) {
    if (tOn < 0.5) return 1.0;
    vec2 q = p.xz - tBound.xy;
    if (dot(q, q) > tBound.z * tBound.z) return 1.0;
    float open = 1.0;
    for (int i = 0; i < ${SEGMENTS}; i++) {
      vec2 d = p.xz - tSegA[i].xy;
      float along = dot(d, tSegA[i].zw);
      float across = dot(d, vec2(-tSegA[i].w, tSegA[i].z));
      if (abs(along) <= tSegB[i].x && abs(across) <= tSegB[i].y && p.y <= tSegB[i].w + tRoof + 0.5) {
        float s = tSegB[i].z + along;
        float inside = smoothstep(0.0, ${TUNNEL_RAMP.toFixed(1)}, min(s, tLength - s));
        open = min(open, 1.0 - ${(1 - DEEP).toFixed(2)} * inside);
      }
    }
    return open;
  }
`;

const VERTEX = /* glsl */ `
  vec4 tunnelP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    tunnelP = instanceMatrix * tunnelP;
  #endif
  vTunnelPos = (modelMatrix * tunnelP).xyz;
`;

const FRAGMENT = /* glsl */ `
  float tunnelLit = tunnelOpen(vTunnelPos);
  reflectedLight.directDiffuse *= tunnelLit;
  reflectedLight.directSpecular *= tunnelLit;
  reflectedLight.indirectDiffuse *= tunnelLit;
  reflectedLight.indirectSpecular *= tunnelLit;
  reflectedLight.indirectDiffuse += (1.0 - tunnelLit) * tLamp * diffuseColor.rgb;
`;

// Add the tunnel's light to a standard material (once), keeping any shader
// changes it already has.
function patch(material) {
  if (!material || !material.isMeshStandardMaterial || material.userData.tunnelLight) return false;
  material.userData.tunnelLight = true;
  const before = material.onBeforeCompile;
  // The program key as it stands now (three's default is the source of
  // onBeforeCompile, which is about to be wrapped).
  const beforeKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    if (before) before.call(material, shader, renderer);
    Object.assign(shader.uniforms, tunnelUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTunnelPos;")
      .replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vTunnelPos;\n${TUNNEL_GLSL}`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${FRAGMENT}`);
  };
  material.customProgramCacheKey = () => `${beforeKey}|tunnel-light`;
  material.needsUpdate = true;
  return true;
}

// Give every lit material under `root` the tunnel's light. Returns how many
// it patched now.
export function lightInTunnel(root) {
  let patched = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (patch(m)) patched += 1; });
  });
  return patched;
}
