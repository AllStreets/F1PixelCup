// The podium ceremony in 3D (docs/superpowers/specs/2026-09-30-podium-design.md).
//
// Its own scene and camera, drawn by the game's renderer while the podium
// screen is up: three steps faced in the cup's colour and numbered on their
// fronts, a backdrop wall with the game's own mark, a floor, banners in each
// driver's team colours, TV-ceremony light (a warm key from the front, a cool
// rim from behind), the cup's real top three dressed (r3d/driver.js), the
// confetti and the champagne. ceremony.js says what happens when; this module
// draws it.
//
// prepare() builds everything and compiles its shaders in the background
// before the first frame; until it returns true nothing of it is drawn (the
// page shows its 2D steps). dispose() frees it all.

import * as THREE from "three";
import { buildDriver, driverLoaded, suitColours } from "./driver.js";
import { canvasTexture, color } from "./textures.js";

const Ceremony = window.Ceremony;
const BASE_FOV = 36;
// Narrower than this, the view widens to keep the podium and its plates in frame.
const FRAME_ASPECT = 1.2;
const WALL_Z = -2.3;
const WALL_W = 24;
const WALL_H = 9;
const SPRAY_LIFE = 1.15;
const GOLD = "#e3b54a";
const FONT = "'Titillium Web', 'Trebuchet MS', system-ui, sans-serif";

// entries: [{ place, driver, team, points }], P1 first. cup: { id, name }.
// The effects (r3d/postfx.js) are made for this scene after it, and handed
// over with setFx.
export function createPodium(renderer, { entries, cup, tier, environment }) {
  let fx = null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, 0.1, 80);
  const own = { geometries: [], materials: [], textures: [] };
  const keep = (list, x) => { own[list].push(x); return x; };
  const geo = (g) => keep("geometries", g);
  const mat = (m) => keep("materials", m);
  const tex = (t) => keep("textures", t);

  const cupColour = Ceremony.cupColour(cup.id);
  // The steps, once (the confetti asks what is under it every frame).
  const STEPS = [1, 2, 3].map((place) => Ceremony.stepFor(place));
  const counts = Ceremony.counts(tier);
  let figures = [];
  let built = false;
  let compiled = false;
  let compiling = null;
  let uploads = [];
  let startedAt = 0;
  let lastAt = 0;
  let disposed = false;
  let firstFramePrograms = null;
  const confetti = { mesh: null, pieces: [], burstAt: -1 };
  // With reduced motion asked for (read every frame, it can change): the
  // camera holds its settled view, nobody steps forward, the banners hang
  // still, the confetti lies where it fell and there is no spray.
  const motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const still = () => Boolean(motionQuery && motionQuery.matches);
  const spray = { points: null, drops: [], next: 0, emitted: 0 };

  scene.background = color("#06070b");
  scene.fog = new THREE.Fog("#06070b", 16, 34);
  scene.environment = environment || null;
  scene.environmentIntensity = 0.32;

  // ---- The set ----

  function buildSet() {
    // The floor: a dark stage, a little glossy.
    const floor = new THREE.Mesh(geo(new THREE.PlaneGeometry(60, 40)), mat(new THREE.MeshStandardMaterial({ color: "#16171c", roughness: 0.38, metalness: 0.12 })));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // The steps.
    const top = mat(new THREE.MeshStandardMaterial({ color: "#24252c", roughness: 0.5, metalness: 0.08 }));
    const side = mat(new THREE.MeshStandardMaterial({ color: color(cupColour).multiplyScalar(0.55), roughness: 0.45, metalness: 0.1 }));
    const goldTrim = mat(new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.28, metalness: 0.9, emissive: "#5a3d0a", emissiveIntensity: 0.4 }));
    STEPS.forEach((s) => {
      const place = s.place;
      const front = mat(new THREE.MeshStandardMaterial({ map: tex(stepFront(place, s)), roughness: 0.42, metalness: 0.05 }));
      // BoxGeometry faces: +x, -x, +y, -y, +z (the front), -z.
      const box = new THREE.Mesh(geo(new THREE.BoxGeometry(s.width, s.height, s.depth)), [side, side, top, top, front, side]);
      box.position.set(s.x, s.height / 2, 0);
      box.castShadow = true;
      box.receiveShadow = true;
      box.name = `step${place}`;
      scene.add(box);
      const trim = new THREE.Mesh(geo(new THREE.BoxGeometry(s.width, 0.035, 0.035)), goldTrim);
      trim.position.set(s.x, s.height - 0.0175, s.depth / 2);
      scene.add(trim);
    });

    // The backdrop: the game's own mark, step-and-repeat, lit from within
    // like an LED wall.
    const wallTex = tex(backdropTexture());
    const wall = new THREE.Mesh(geo(new THREE.PlaneGeometry(WALL_W, WALL_H)), mat(new THREE.MeshStandardMaterial({
      map: wallTex, emissiveMap: wallTex, emissive: "#ffffff", emissiveIntensity: 0.42, roughness: 0.6, metalness: 0,
    })));
    wall.position.set(0, WALL_H / 2, WALL_Z);
    wall.receiveShadow = true;
    wall.name = "backdrop";
    scene.add(wall);

    // A rail across the wall, and a banner hanging from it over each step.
    const rail = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.025, 0.025, 6.4, 10)), mat(new THREE.MeshStandardMaterial({ color: "#8a8d96", roughness: 0.3, metalness: 0.85 })));
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 4.12, WALL_Z + 0.35);
    scene.add(rail);
    const bannerGeo = geo(bannerGeometry(0.86, 1.27));
    entries.forEach((e) => {
      const s = Ceremony.stepFor(e.place);
      const m = mat(new THREE.MeshStandardMaterial({ map: tex(bannerTexture(e)), side: THREE.DoubleSide, roughness: 0.75, alphaTest: 0.5 }));
      const banner = new THREE.Mesh(bannerGeo, m);
      banner.position.set(s.x, 4.1, WALL_Z + 0.38);
      banner.castShadow = true;
      banner.userData.sway = e.place * 1.7;
      banner.name = `banner${e.place}`;
      scene.add(banner);
    });
  }

  // A step's front: the cup's colour, its number big and italic.
  function stepFront(place, s) {
    const w = 640;
    const h = Math.round((w * s.height) / s.width);
    return canvasTexture(w, h, (g) => {
      const base = new THREE.Color(cupColour);
      const hex = (c) => `#${c.getHexString()}`;
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, hex(base.clone().offsetHSL(0, 0, 0.06)));
      grad.addColorStop(1, hex(base.clone().multiplyScalar(0.62)));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // A sheen across the face.
      const sheen = g.createLinearGradient(0, 0, w, h);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.45, "rgba(255,255,255,0.08)");
      sheen.addColorStop(0.55, "rgba(255,255,255,0)");
      g.fillStyle = sheen;
      g.fillRect(0, 0, w, h);
      const size = Math.min(h * 0.82, 300);
      g.font = `italic 900 ${size}px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,0.35)";
      g.shadowBlur = 18;
      g.shadowOffsetY = 6;
      g.fillStyle = "#ffffff";
      g.fillText(String(place), w / 2, h * 0.54);
    }, { repeat: false });
  }

  // The game's own mark: a red slanted bar and F1 PIXEL CUP, the cup's name
  // under it, on a step-and-repeat of the same; no series or sponsor marks.
  function backdropTexture() {
    // Sharp on High; half the size (a quarter of the memory) below it.
    const W = tier === "high" ? 4096 : 2048;
    const H = Math.round((W * WALL_H) / WALL_W);
    const k = W / 4096;
    return canvasTexture(W, H, (g) => {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0b0f22");
      bg.addColorStop(0.6, "#0e1430");
      bg.addColorStop(1, "#070912");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      // Step and repeat.
      g.save();
      g.textAlign = "center";
      g.textBaseline = "middle";
      const cellW = 520 * k;
      const cellH = 150 * k;
      for (let row = 0; row * cellH < H + cellH; row += 1) {
        for (let col = -1; col * cellW < W + cellW; col += 1) {
          const x = col * cellW + (row % 2 ? cellW / 2 : 0);
          const y = row * cellH + cellH / 2;
          g.fillStyle = "rgba(225, 6, 0, 0.2)";
          skewBar(g, x - 150 * k, y - 12 * k, 40 * k, 18 * k);
          g.fillStyle = "rgba(235, 240, 255, 0.085)";
          g.font = `italic 900 ${Math.round(40 * k)}px ${FONT}`;
          g.fillText(row % 2 ? cup.name.toUpperCase() : "F1 PIXEL CUP", x + 18 * k, y);
        }
      }
      g.restore();
      // The lockup on one line above the banners' rail: the red bar, F1
      // PIXEL CUP, a gold rule, the cup's name.
      const pxPerM = W / WALL_W;
      const cy = (WALL_H - 4.42) * pxPerM;
      const glow = g.createRadialGradient(W / 2, cy - 30 * k, 10 * k, W / 2, cy - 30 * k, W * 0.3);
      glow.addColorStop(0, "rgba(46, 66, 150, 0.6)");
      glow.addColorStop(1, "rgba(46, 66, 150, 0)");
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      g.textBaseline = "alphabetic";
      g.textAlign = "left";
      const big = `italic 900 ${Math.round(pxPerM * 0.62)}px ${FONT}`;
      const small = `700 ${Math.round(pxPerM * 0.36)}px ${FONT}`;
      const word = "F1 PIXEL CUP";
      const name = spaced(cup.name.toUpperCase());
      g.font = big;
      const ww = g.measureText(word).width;
      g.font = small;
      const nw = g.measureText(name).width;
      const bar = pxPerM * 0.55;
      const gap = pxPerM * 0.3;
      const total = bar + gap + ww + gap * 2 + nw;
      let x = (W - total) / 2;
      g.fillStyle = "#e10600";
      skewBar(g, x, cy - pxPerM * 0.42, bar, pxPerM * 0.24);
      x += bar + gap;
      g.shadowColor = "rgba(0,0,0,0.5)";
      g.shadowBlur = 16 * k;
      g.font = big;
      g.fillStyle = "#ffffff";
      g.fillText(word, x, cy);
      x += ww + gap;
      g.shadowBlur = 0;
      g.fillStyle = GOLD;
      g.fillRect(x - gap * 0.2, cy - pxPerM * 0.5, Math.max(2, 4 * k), pxPerM * 0.52);
      x += gap;
      g.font = small;
      g.fillText(name, x, cy - pxPerM * 0.06);
    }, { repeat: false });
  }

  const spaced = (s) => s.split("").join(String.fromCharCode(8202));
  function skewBar(g, x, y, w, h) {
    g.beginPath();
    g.moveTo(x + h * 0.5, y);
    g.lineTo(x + w + h * 0.5, y);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
    g.fill();
  }

  // A pennant: the team's colours, the driver's number and code.
  function bannerTexture(e) {
    const W = 256;
    const H = 380;
    const { suit, trim } = suitColours(e.team);
    return canvasTexture(W, H, (g) => {
      const cut = 70;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(W, 0);
      g.lineTo(W, H);
      g.lineTo(W / 2, H - cut);
      g.lineTo(0, H);
      g.closePath();
      g.save();
      g.clip();
      g.fillStyle = suit;
      g.fillRect(0, 0, W, H);
      const shade = g.createLinearGradient(0, 0, W, 0);
      shade.addColorStop(0, "rgba(0,0,0,0.25)");
      shade.addColorStop(0.5, "rgba(255,255,255,0.06)");
      shade.addColorStop(1, "rgba(0,0,0,0.25)");
      g.fillStyle = shade;
      g.fillRect(0, 0, W, H);
      g.fillStyle = trim;
      g.fillRect(0, 26, W, 14);
      g.fillRect(0, H - cut - 34, W, 10);
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `italic 900 130px ${FONT}`;
      g.shadowColor = "rgba(0,0,0,0.4)";
      g.shadowBlur = 10;
      g.fillText(String(e.driver.number), W / 2, 138);
      g.shadowBlur = 0;
      g.font = `700 46px ${FONT}`;
      g.fillText(spaced(e.driver.code), W / 2, 230);
      g.restore();
    }, { repeat: false });
  }

  // A banner hung at its top edge, with a soft fold across it.
  function bannerGeometry(w, h) {
    const g = new THREE.PlaneGeometry(w, h, 8, 10);
    g.translate(0, -h / 2, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin((x / w) * Math.PI * 2) * 0.035 * (-y / h + 0.3));
    }
    g.computeVertexNormals();
    return g;
  }

  // ---- The light: a warm key from the front, a cool rim from behind ----

  const key = new THREE.SpotLight("#ffe0bd", 230, 0, 0.42, 0.75, 2);
  const rims = [];
  function buildLights() {
    key.position.set(3.2, 8.5, 9.5);
    key.target.position.set(0, 1.4, 0);
    key.castShadow = true;
    const size = tier === "high" ? 2048 : 1024;
    key.shadow.mapSize.set(size, size);
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target);
    // The rims: behind the drivers, in front of the wall, aimed back at them.
    [[-3.4, 6.4, -1.7], [3.4, 6.4, -1.7], [0, 7, -1.9]].forEach(([x, y, z], i) => {
      const rim = new THREE.SpotLight("#8fbcff", i === 2 ? 50 : 85, 0, 0.5, 0.7, 2);
      rim.position.set(x, y, z);
      rim.target.position.set(x * 0.25, 1.5, 0.6);
      scene.add(rim, rim.target);
      rims.push(rim);
    });
    // A cool, low fill so the shadows aren't black, and a wash on the wall.
    scene.add(new THREE.HemisphereLight("#9fb2df", "#1c140e", 0.32));
    // Uplights at the foot of the wall, a warm wash up it.
    [-5.5, 0, 5.5].forEach((x) => {
      const up = new THREE.SpotLight("#ffcf9a", 26, 0, 0.62, 1, 2);
      up.position.set(x, 0.1, WALL_Z + 0.9);
      up.target.position.set(x, 4.5, WALL_Z);
      scene.add(up, up.target);
    });
  }

  // ---- The drivers ----

  function buildFigures() {
    figures = entries.map((e) => {
      // Bareheaded on the podium (the user, 2026-10-01): the option takes
      // effect with the driver faces (r3d/driver.js ignores it until then, and
      // the drivers wear their helmets).
      const fig = buildDriver(e.driver, e.team, { headwear: "none" });
      const s = Ceremony.stepFor(e.place);
      // The figure faces +X; turned to face the camera (+Z).
      fig.root.rotation.y = -Math.PI / 2;
      fig.root.position.set(s.x, s.height, s.standZ);
      fig.root.name = `podium-${e.driver.id}`;
      scene.add(fig.root);
      const props = {};
      fig.model.traverse((n) => { if (n.name === "trophy" || n.name === "bottle") props[n.name] = n; });
      return { entry: e, fig, step: s, neck: findNeck(fig), props };
    });
  }

  // The bottle's neck and the way it points, in the bottle's own space: from
  // the middle of the glass through the foil.
  function findNeck(fig) {
    let bottle = null;
    fig.model.traverse((n) => { if (!bottle && n.name === "bottle") bottle = n; });
    if (!bottle) return null;
    const boxOf = (name) => {
      const box = new THREE.Box3();
      bottle.traverse((n) => {
        if (n.isMesh && n.material && n.material.name === name) {
          if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
          box.union(n.geometry.boundingBox);
        }
      });
      return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
    };
    const glass = boxOf("bottle");
    const foil = boxOf("foil");
    if (!glass || !foil) return null;
    const tip = foil.clone().add(foil.clone().sub(glass).normalize().multiplyScalar(0.03));
    return { bottle, glass, tip };
  }

  // ---- Confetti and spray ----

  function buildConfetti() {
    const n = counts.confetti;
    const m = mat(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.35 }));
    const mesh = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(0.05, 0.034)), m, n);
    mesh.name = "confetti";
    mesh.frustumCulled = false;
    const palette = [...entries.map((e) => suitColours(e.team).suit), ...entries.map((e) => e.team.trim), GOLD, GOLD, "#f3e3b0"];
    const rnd = seeded(7);
    for (let i = 0; i < n; i += 1) {
      mesh.setColorAt(i, color(palette[Math.floor(rnd() * palette.length)]));
      confetti.pieces.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, phase: rnd() * 6.28, spin: 3 + rnd() * 5, landed: true, rest: 0, fade: 1, dirty: true, yaw: rnd() * 6.28, tilt: rnd() });
    }
    mesh.visible = false;
    confetti.mesh = mesh;
    confetti.rnd = rnd;
    scene.add(mesh);
  }

  function buildSpray() {
    const n = Math.max(1, counts.spray);
    const g = geo(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3).fill(-50), 3));
    g.setAttribute("aAge", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    // Champagne: a dense, bright jet at the neck that opens into a fading
    // mist; each drop grows and fades with its age.
    const m = mat(new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uColor: { value: color("#fff1cc") } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        uniform float uScale;
        varying float vAge;
        void main() {
          vAge = aAge;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aAge >= 1.0 ? 0.0 : min(mix(0.02, 0.07, sqrt(aAge)) * uScale / -mv.z, uScale * 0.03);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAge;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, r) * pow(1.0 - vAge, 1.6) * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * (1.15 - vAge * 0.35), a);
        }`,
      transparent: true,
      depthWrite: false,
    }));
    const points = new THREE.Points(g, m);
    points.name = "spray";
    points.frustumCulled = false;
    points.visible = counts.spray > 0;
    spray.points = points;
    spray.drops = Array.from({ length: counts.spray }, () => ({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, age: SPRAY_LIFE }));
    scene.add(points);
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // What a falling piece lands on: a step's top or the floor.
  function groundAt(x, z) {
    for (let i = 0; i < STEPS.length; i += 1) {
      const s = STEPS[i];
      if (Math.abs(x - s.x) < s.width / 2 && Math.abs(z) < s.depth / 2) return s.height + 0.003;
    }
    return 0.003;
  }

  const dummy = new THREE.Object3D();
  const frustum = new THREE.Frustum();
  const viewMatrix = new THREE.Matrix4();
  const at3 = new THREE.Vector3();
  const FADE = 1.5;
  function updateConfetti(t, dt, calm) {
    if (!Ceremony.confettiOn(t)) return;
    const { mesh, pieces, rnd } = confetti;
    if (confetti.burstAt < 0) {
      // The burst: thrown up and out over the podium.
      confetti.burstAt = t;
      mesh.visible = true;
      pieces.forEach((p) => throwPiece(p, rnd, true));
    }
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let moved = false;
    pieces.forEach((p, i) => {
      if (calm && !p.landed) {
        // Reduced motion: it lies where it would have fallen, now.
        p.y = groundAt(p.x, p.z);
        p.landed = true;
        p.rest = Infinity;
        p.fade = 1;
        p.dirty = true;
      }
      if (p.landed) {
        p.rest -= dt;
        if (p.rest <= 0) {
          // A while on the ground, then it goes round again from above: at
          // once where the camera can't see it, else it fades out first.
          if (p.fade >= 1 && !frustum.containsPoint(at3.set(p.x, p.y, p.z))) p.fade = 0;
          else p.fade -= dt / FADE;
          p.dirty = true;
          if (p.fade <= 0) throwPiece(p, rnd, false);
        }
      } else {
        Ceremony.stepConfetti(p, dt, groundAt);
        if (p.landed) p.rest = 0.5 + rnd() * 8;
        p.dirty = true;
      }
      // A piece lying still keeps the matrix it was given when it landed.
      if (!p.dirty) return;
      p.dirty = false;
      moved = true;
      if (p.landed) dummy.rotation.set(-Math.PI / 2, 0, p.yaw);
      else dummy.rotation.set(p.phase * 1.3, p.phase * 0.8 + p.yaw, p.tilt * 2);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(Math.max(0, p.fade));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    if (moved) mesh.instanceMatrix.needsUpdate = true;
  }

  function throwPiece(p, rnd, burst) {
    p.landed = false;
    p.fade = 1;
    p.dirty = true;
    p.x = (rnd() - 0.5) * 7;
    p.z = -1.4 + rnd() * 3.6;
    if (burst) {
      p.y = 4.4 + rnd() * 2.2;
      p.vx = (rnd() - 0.5) * 3.4;
      p.vy = 0.6 + rnd() * 2.6;
      p.vz = (rnd() - 0.3) * 2.2;
    } else {
      p.y = 6.2 + rnd() * 1.5;
      p.vx = (rnd() - 0.5) * 0.6;
      p.vy = 0;
      p.vz = (rnd() - 0.5) * 0.6;
    }
  }

  const neckAt = new THREE.Vector3();
  const glassAt = new THREE.Vector3();
  const dir = new THREE.Vector3();
  function updateSpray(t, dt, calm) {
    if (!spray.drops.length) return;
    const on = Ceremony.sprayOn(t, tier) && !calm;
    const pos = spray.points.geometry.attributes.position;
    if (on) {
      // Each bottle in spurts, a few hundred drops a second.
      const rate = spray.drops.length / (SPRAY_LIFE * figures.length);
      figures.forEach((f, k) => {
        if (!f.neck) return;
        const pulse = 0.55 + 0.45 * Math.sin(t * 7.3 + k * 2.1);
        f.neck.bottle.localToWorld(neckAt.copy(f.neck.tip));
        f.neck.bottle.localToWorld(glassAt.copy(f.neck.glass));
        dir.subVectors(neckAt, glassAt);
        f.emit = (f.emit || 0) + rate * pulse * dt;
        while (f.emit >= 1) {
          f.emit -= 1;
          const d = spray.drops[spray.next];
          spray.next = (spray.next + 1) % spray.drops.length;
          Ceremony.sprayDrop(neckAt, dir, Math.random, d);
          spray.emitted += 1;
        }
      });
    }
    const age = spray.points.geometry.attributes.aAge;
    spray.drops.forEach((d, i) => {
      if (d.age < SPRAY_LIFE) {
        Ceremony.stepDrop(d, dt);
        // It ends on what it hits: a step, the floor or the wall.
        if (d.z <= WALL_Z || d.y <= groundAt(d.x, d.z)) d.age = SPRAY_LIFE;
      }
      if (d.age >= SPRAY_LIFE) {
        pos.setXYZ(i, 0, -50, 0);
        age.setX(i, 1);
      } else {
        pos.setXYZ(i, d.x, d.y, d.z);
        age.setX(i, d.age / SPRAY_LIFE);
      }
    });
    pos.needsUpdate = true;
    age.needsUpdate = true;
  }

  // ---- Building, compiling, drawing ----

  // Builds once the driver model is in, then compiles its shaders and uploads
  // its textures in the background. True once it can draw without a stall.
  function prepare() {
    if (disposed) return false;
    if (compiled) return true;
    if (!built) {
      if (!driverLoaded()) return false;
      buildSet();
      buildLights();
      buildFigures();
      buildConfetti();
      buildSpray();
      built = true;
      return false;
    }
    if (!compiling) {
      placeCamera(0);
      scene.updateMatrixWorld(true);
      if (!renderer.compileAsync) {
        renderer.compile(scene, camera);
        compiled = true;
        return true;
      }
      const jobs = [renderer.compileAsync(scene, camera), compileShadows()];
      if (fx) jobs.push(fx.warm());
      uploads = texturesIn();
      compiling = Promise.all(jobs).then(() => { compiling.done = true; }, () => { compiling.done = true; });
      return false;
    }
    if (!compiling.done) return false;
    // The textures, a few a frame.
    const start = performance.now();
    while (uploads.length && performance.now() - start < 8) renderer.initTexture(uploads.pop());
    if (uploads.length) return false;
    compiled = true;
    return true;
  }

  // The shadow pass draws each caster with a depth material of its own kind
  // (skinned or not, with or without a map): compiled now with the key light.
  function compileShadows() {
    const casters = new THREE.Group();
    const kinds = new Set();
    const extra = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        const side = m.shadowSide ?? { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide }[m.side];
        const kind = [o.isSkinnedMesh, o.isInstancedMesh, side, Boolean(m.map), m.alphaTest > 0, Object.keys(o.geometry.attributes).sort().join()].join("|");
        if (kinds.has(kind)) return;
        kinds.add(kind);
        const depth = mat(new THREE.MeshDepthMaterial({ side, map: m.map, alphaTest: m.alphaTest }));
        let stand;
        if (o.isSkinnedMesh) {
          stand = new THREE.SkinnedMesh(o.geometry, depth);
          stand.bind(o.skeleton, o.bindMatrix);
        } else {
          stand = new THREE.Mesh(o.geometry, depth);
        }
        stand.matrixWorld.copy(o.matrixWorld);
        extra.push(stand);
        casters.add(stand);
      });
    });
    const fog = scene.fog;
    scene.fog = null;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    const job = renderer.compileAsync(casters, key.shadow.camera, scene);
    renderer.setRenderTarget(before);
    target.dispose();
    scene.fog = fog;
    return job;
  }

  function texturesIn() {
    const found = new Set();
    scene.traverse((o) => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) found.add(v); });
      });
    });
    return [...found];
  }

  function placeCamera(t, calm = still()) {
    const c = Ceremony.cameraAt(calm ? Ceremony.BEATS.sweepEnd : t);
    camera.position.set(c.x, c.y, c.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.lookX, c.lookY, c.lookZ);
  }

  function setSize(w, h) {
    const aspect = w / Math.max(1, h);
    const fov = Ceremony.fitFov(BASE_FOV, aspect, FRAME_ASPECT);
    if (Math.abs(camera.aspect - aspect) > 1e-4 || Math.abs(camera.fov - fov) > 1e-4) {
      camera.aspect = aspect;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // Drops are sized in metres: pixels per metre at unit distance.
    spray.scale = (h * renderer.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
  }

  // One frame of the ceremony, on real time. Returns the time into it.
  function render(now) {
    if (!compiled || disposed) return -1;
    if (!startedAt) {
      startedAt = now;
      lastAt = now;
      firstFramePrograms = renderer.info.programs ? renderer.info.programs.length : null;
    }
    const t = (now - startedAt) / 1000;
    const dt = Math.min(0.1, Math.max(0, (now - lastAt) / 1000));
    lastAt = now;
    const calm = still();
    figures.forEach((f) => {
      const place = f.entry.place;
      f.fig.play(Ceremony.poseAt(place, t));
      // The props change hands as the hands meet, halfway through the fade.
      if (f.props.trophy) f.props.trophy.visible = Ceremony.trophyShown(place, t);
      if (f.props.bottle) f.props.bottle.visible = Ceremony.bottleShown(place, t);
      f.fig.root.position.z = f.step.standZ + (calm ? 0 : Ceremony.STEP_FORWARD * Ceremony.forwardAt(place, t));
      f.fig.update(dt);
    });
    scene.children.forEach((o) => {
      if (o.userData.sway !== undefined) o.rotation.x = calm ? 0 : Math.sin(t * 0.9 + o.userData.sway) * 0.025;
    });
    placeCamera(t, calm);
    scene.updateMatrixWorld();
    updateConfetti(t, dt, calm);
    if (spray.points && spray.scale) spray.points.material.uniforms.uScale.value = spray.scale;
    updateSpray(t, dt, calm);
    renderer.toneMappingExposure = 1.0;
    if (fx) fx.render({ dt, now, trackId: "podium" });
    else renderer.render(scene, camera);
    if (firstFramePrograms !== null && renderer.info.programs) {
      inspectState.newPrograms = renderer.info.programs.length - firstFramePrograms;
      firstFramePrograms = null;
    }
    inspectState.t = t;
    return t;
  }
  const inspectState = { t: -1, newPrograms: null };

  // Where each plate goes: the foot of each step's front, on screen (CSS px).
  // The same list each frame, refilled.
  const v = new THREE.Vector3();
  const points = [];
  function anchors(w, h) {
    camera.updateMatrixWorld();
    figures.forEach((f, i) => {
      v.set(f.step.x, 0, f.step.depth / 2 + 0.05).project(camera);
      const a = points[i] || (points[i] = {});
      a.place = f.entry.place;
      a.x = (v.x * 0.5 + 0.5) * w;
      a.y = (-v.y * 0.5 + 0.5) * h;
    });
    points.length = figures.length;
    return points;
  }

  // Whether the name plates show at time t.
  const platesIn = (t) => Ceremony.platesShown(t, still());

  function inspect() {
    const t = inspectState.t;
    const airborne = confetti.pieces.filter((p) => !p.landed);
    const live = spray.drops.filter((d) => d.age < SPRAY_LIFE);
    return {
      drawing: compiled && startedAt > 0,
      t,
      beat: t >= 0 ? Ceremony.beatAt(t) : null,
      tier,
      still: still(),
      camera: [camera.position.x, camera.position.y, camera.position.z],
      cupColour,
      newProgramsOnFirstFrame: inspectState.newPrograms,
      drivers: figures.map((f) => {
        const p = f.fig.root.getWorldPosition(new THREE.Vector3());
        return { place: f.entry.place, ...f.fig.looks(), x: p.x, y: p.y, z: p.z };
      }),
      confetti: {
        count: confetti.pieces.length,
        visible: Boolean(confetti.mesh && confetti.mesh.visible),
        airborne: airborne.length,
        landed: confetti.pieces.length - airborne.length,
        meanVy: airborne.length ? airborne.reduce((s, p) => s + p.vy, 0) / airborne.length : 0,
        meanY: airborne.length ? airborne.reduce((s, p) => s + p.y, 0) / airborne.length : 0,
      },
      spray: { pool: spray.drops.length, live: live.length, emitted: spray.emitted, maxY: live.reduce((m, d) => Math.max(m, d.y), 0) },
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    // Each clone's skeletons hold a bone texture on the GPU once drawn
    // (r3d/driver.js's dispose leaves the shared model's parts alone).
    figures.forEach((f) => {
      const skeletons = new Set();
      f.fig.model.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) skeletons.add(n.skeleton); });
      skeletons.forEach((sk) => sk.dispose());
      f.fig.dispose();
    });
    if (confetti.mesh) confetti.mesh.dispose();
    figures = [];
    own.geometries.forEach((g) => g.dispose());
    own.materials.forEach((m) => m.dispose());
    own.textures.forEach((x) => x.dispose());
    key.shadow.dispose();
    scene.clear();
  }

  return { scene, camera, setFx: (f) => { fx = f; }, prepare, render, setSize, anchors, platesIn, inspect, dispose, ready: () => compiled, isDisposed: () => disposed, owned: () => ({ geometries: own.geometries.length, materials: own.materials.length, textures: own.textures.length }) };
}
