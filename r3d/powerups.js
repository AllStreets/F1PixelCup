// Power-ups in 3D: shots, oil, trailed oil, the safety car, the Overtake Mode
// and Formation Lap glows, and the impact flashes. game.js decides where
// everything is (in track coordinates, turned into world x/y by powerUpFrame);
// this only draws it, sitting on the road height at each thing's lap distance
// so it follows bridges and never floats or sinks.
import * as THREE from "three";
import { canvasTexture } from "./textures.js";
import { itemModel, swapBody, whenItemsReady, itemsState } from "./items.js";

const POOL = 24;

function additive(color, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

// A reusable set of meshes that starts with a few and grows whenever more are
// on track, so nothing in the race is ever left undrawn.
function pool(group, n, make) {
  const list = [];
  list.grow = (count) => {
    while (list.length < count) {
      const m = make();
      m.visible = false;
      group.add(m);
      list.push(m);
    }
  };
  list.grow(n);
  return list;
}

// Every item is a holder whose body -- a simple stand-in at first -- is
// swapped for the hand-built model once it loads (./items.js).
function holder(kind, standIn) {
  const g = new THREE.Group();
  const model = itemModel(kind);
  const body = model || standIn();
  g.add(body);
  g.userData.body = body;
  g.userData.kind = kind;
  return g;
}

function puck(color, emissive, kind) {
  const g = holder(kind, () => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 2.4, 24),
      new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.3 }));
    body.castShadow = true;
    return body;
  });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(3.4, 22, 12, 1, true), additive(color, 0.45));
  trail.rotation.z = Math.PI / 2;
  trail.position.x = -13;
  trail.userData.fx = true;
  g.add(trail);
  g.userData.trail = trail;
  return g;
}

function stewardMesh() {
  const g = puck(0x0090ff, 0x003a80, "steward");
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 0.8, 8, 32), additive(0x7cc4ff, 0.9));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

function debrisMesh() {
  return holder("debris", () => {
    // Stand-in: a jagged carbon shard with teal-lit edges.
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(5.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.25, metalness: 0.8, emissive: 0x00d2be, emissiveIntensity: 0.3, flatShading: true }));
    m.scale.set(1.3, 0.55, 0.9);
    m.castShadow = true;
    return m;
  });
}

// A painted slick: an irregular black pool with thin-film rainbow bands and a
// wet highlight, so it reads on dark tarmac from the chase camera.
let oilTexture = null;
function makeOilTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const blobs = [[128, 128, 92], [84, 110, 58], [170, 100, 54], [150, 170, 60], [96, 164, 46], [190, 150, 40]];
    const pool = () => {
      g.beginPath();
      blobs.forEach(([x, y, r]) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); });
    };
    g.clearRect(0, 0, w, h);
    g.save();
    pool();
    g.clip();
    g.fillStyle = "rgba(6, 6, 10, 0.96)";
    g.fillRect(0, 0, w, h);
    // Thin-film bands: purple, blue, cyan, green, gold, fading to the middle.
    [["#b36bff", 96], ["#4d6bff", 84], ["#3de0ff", 72], ["#48f09a", 60], ["#ffd84a", 48]].forEach(([c, r], i) => {
      g.strokeStyle = c;
      g.globalAlpha = 0.34 - i * 0.03;
      g.lineWidth = 9;
      g.beginPath();
      g.ellipse(132 + i * 3, 124 - i * 2, r, r * 0.8, 0.3, 0, Math.PI * 2);
      g.stroke();
    });
    g.globalAlpha = 1;
    const shine = g.createRadialGradient(104, 92, 4, 104, 92, 60);
    shine.addColorStop(0, "rgba(255,255,255,0.55)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = shine;
    g.fillRect(0, 0, w, h);
    g.restore();
    // A soft wet rim around the pool.
    pool();
    g.strokeStyle = "rgba(20, 20, 30, 0.8)";
    g.lineWidth = 3;
    g.stroke();
  }, { repeat: false });
}

// The modelled pool's surface: near-black and glassy, with thin-film bands
// across it (the same colours as the stand-in's slick).
let sheenTexture = null;
let oilSurface = null;
function oilModelMaterial() {
  if (!sheenTexture) {
    sheenTexture = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = "#000000";
      g.fillRect(0, 0, w, h);
      // Thin, broken bands off-centre: a slick's sheen, not rings on a target.
      [["#b36bff", 100], ["#4d6bff", 86], ["#3de0ff", 72], ["#48f09a", 58], ["#ffd84a", 44]].forEach(([c, r], i) => {
        g.strokeStyle = c;
        g.globalAlpha = 0.34 - i * 0.04;
        g.lineWidth = 5;
        for (let arc = 0; arc < 3; arc += 1) {
          const from = 0.4 + arc * 2.1 + i * 0.5;
          g.beginPath();
          g.ellipse(118 + i * 6, 132 - i * 4, r, r * 0.72, 0.5, from, from + 1.3);
          g.stroke();
        }
      });
    }, { repeat: false });
  }
  if (!oilSurface) {
    // Dark first. Seen along the road from the chase camera, a glossy coat
    // mirrors the sky and reads as a grey puddle of water; a slick is a dark
    // patch with a thin-film sheen, so the sheen carries it.
    oilSurface = new THREE.MeshStandardMaterial({
      color: 0x030304, roughness: 0.38, metalness: 0.0, envMapIntensity: 0.1,
      emissive: 0xffffff, emissiveMap: sheenTexture, emissiveIntensity: 0.75,
      polygonOffset: true, polygonOffsetFactor: -3,
    });
  }
  return oilSurface;
}

function oilMesh() {
  const g = holder("oil", () => {
    if (!oilTexture) oilTexture = makeOilTexture();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({
      map: oilTexture, emissiveMap: oilTexture, emissive: 0xffffff, emissiveIntensity: 0.35,
      transparent: true, depthWrite: false, roughness: 0.32, metalness: 0.05,
      polygonOffset: true, polygonOffsetFactor: -3,
    }));
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    return m;
  });
  dressOil(g.userData.body);
  return g;
}

function dressOil(body) {
  if (body.userData.fromGlb) body.traverse((node) => { if (node.isMesh) node.material = oilModelMaterial(); });
}

// Soft round glow used for impacts, bounce sparks and the lights.
let glowTexture = null;
function makeGlowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

function flashSprite() {
  if (!glowTexture) glowTexture = makeGlowTexture();
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}

// A low silver GT car: an extruded side profile with a glass house, a stripe,
// silver-rimmed wheels and a roof light bar whose amber lamps alternate.
function extrude(profile, depth, material, bevel = 0.5) {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function safetyCarMesh() {
  const car = holder("safetyCar", safetyCarStandIn);
  car.userData.lamps = lampsOf(car.userData.body);
  return car;
}

// The two roof lamps: the model's lamp_L and lamp_R, or the stand-in's.
function lampsOf(body) {
  if (body.userData.lamps) return body.userData.lamps;
  const lamps = [];
  body.traverse((node) => { if (node.isMesh && /^lamp_/.test(node.name)) lamps.push(node); });
  return lamps.sort((a, b) => a.name.localeCompare(b.name));
}

function safetyCarStandIn() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0e141b, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0x00a06a, roughness: 0.4, metalness: 0.3 });
  // Side profile, car-local +X forward, units ≈ the game's (car ~25 long).
  const body = extrude([[-12.2, 1.6], [-12.9, 3.6], [-12.2, 5.6], [-10.5, 6.2], [-5, 6.4], [7, 5.6], [11.2, 4.6], [12.6, 3.2], [12.6, 1.6]], 9, paint, 0.7);
  const cabin = extrude([[-5.2, 6.2], [-2.6, 8.9], [2.4, 8.9], [6.6, 5.9]], 7.4, glass, 0.4);
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(22, 0.7, 0.2), stripe);
  stripeL.position.set(0, 3.6, 5.25);
  const stripeR = stripeL.clone();
  stripeR.position.z = -5.25;
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 9.4), dark);
  splitter.position.set(12.4, 1.4, 0);
  g.add(body, cabin, stripeL, stripeR, splitter);
  const tyre = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.85 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 0.95, roughness: 0.2 });
  [[8, 1], [8, -1], [-8, 1], [-8, -1]].forEach(([x, side]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.8, 24), tyre);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 2.4, side * 4.8);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 18), rim);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, 2.4, side * 5.75);
    g.add(w, r);
  });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 6.4), dark);
  bar.position.set(0, 9.6, 0);
  g.add(bar);
  const lamps = [-1, 1].map((side) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xffa000, emissiveIntensity: 2 }));
    lamp.position.set(0, 10.1, side * 1.7);
    g.add(lamp);
    return lamp;
  });
  // Headlights and tail lights.
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.4 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 1.2 });
  [-1, 1].forEach((side) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 1.8), head);
    h.position.set(12.9, 3.8, side * 3.2);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 3.2), tail);
    t.position.set(-13.3, 4.7, side * 2.9);
    g.add(h, t);
  });
  // Rear: a dark diffuser and a glass rear screen, so it reads from the chase camera.
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 8.6), dark);
  diffuser.position.set(-13.2, 1.9, 0);
  const rearScreen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), glass);
  rearScreen.position.set(-4.35, 7.6, 0);
  rearScreen.rotation.set(0, -Math.PI / 2, 0);
  rearScreen.rotateX(-0.85);
  g.add(diffuser, rearScreen);
  g.userData.lamps = lamps;
  return g;
}

export function createPowerUpLayer(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const shots = {
    undercut: pool(group, POOL, () => puck(0xdc0000, 0x550000, "undercut")),
    stewardPenalty: pool(group, 2, stewardMesh),
    debris: pool(group, POOL, debrisMesh),
  };
  const oil = pool(group, POOL, oilMesh);
  const trails = pool(group, 20, oilMesh);
  const flashes = pool(group, POOL, flashSprite);
  const safetyCar = safetyCarMesh();
  safetyCar.visible = false;
  group.add(safetyCar);
  let quality = "high";
  const shown = { shots: 0, hazards: 0, trails: 0, safetyCar: false, flashes: 0, visibleFromGlb: 0 };

  // The models landed: everything already made swaps its stand-in.
  whenItemsReady(() => {
    shots.undercut.forEach((g) => swapBody(g, itemModel("undercut")));
    shots.stewardPenalty.forEach((g) => swapBody(g, itemModel("steward")));
    shots.debris.forEach((g) => swapBody(g, itemModel("debris")));
    [...oil, ...trails].forEach((g) => { if (swapBody(g, itemModel("oil"))) dressOil(g.userData.body); });
    if (swapBody(safetyCar, itemModel("safetyCar"))) safetyCar.userData.lamps = lampsOf(safetyCar.userData.body);
  });

  const auraMats = {
    gold: new THREE.MeshBasicMaterial({ color: 0xffc81e, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }),
    white: new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }),
  };
  let streakTexture = null;
  function streak() {
    if (!streakTexture) {
      streakTexture = canvasTexture(256, 32, (g, w, h) => {
        const lin = g.createLinearGradient(0, 0, w, 0);
        lin.addColorStop(0, "rgba(255,255,255,0)");
        lin.addColorStop(1, "rgba(255,255,255,1)");
        g.fillStyle = lin;
        g.fillRect(0, h * 0.3, w, h * 0.4);
      }, { repeat: false });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.4), new THREE.MeshBasicMaterial({
      map: streakTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  function aura(car) {
    if (!car.aura) {
      const shell = car.model.clone(true);
      shell.traverse((node) => {
        if (node.isMesh) { node.material = auraMats.gold; node.castShadow = false; node.receiveShadow = false; }
      });
      shell.scale.multiplyScalar(1.1);
      shell.position.y -= 0.2;
      const trails = [-1, 1].map((side) => {
        const t = streak();
        // Behind the rear wheels, just above the road (car-local: +X forward).
        t.position.set(-24, 3.4, side * 3.4);
        return t;
      });
      car.root.add(shell, ...trails);
      car.aura = { shell, trails };
    }
    return car.aura;
  }

  function place(mesh, item, course, lift) {
    mesh.position.set(item.x, course.heightAt(item.d) + lift, item.y);
    mesh.rotation.y = -(item.heading || 0);
  }

  function sync({ powerUps, racers, cars, course, now }) {
    const fx = quality !== "low";
    const used = { undercut: 0, stewardPenalty: 0, debris: 0 };
    Object.entries(shots).forEach(([type, list]) => list.grow(powerUps.shots.filter((s) => s.type === type).length));
    oil.grow(powerUps.hazards.length);
    trails.grow(powerUps.trails.length);
    flashes.grow(powerUps.flashes.length);
    powerUps.shots.forEach((s) => {
      const list = shots[s.type];
      const mesh = list && list[used[s.type]++];
      if (!mesh) return;
      mesh.visible = true;
      const flying = s.type === "stewardPenalty";
      const modelled = mesh.userData.body && mesh.userData.body.userData.fromGlb;
      // The modelled Undercut is a tyre: it stands on the road and rolls.
      const rolling = s.type === "undercut" && modelled;
      place(mesh, s, course, flying ? 16 : rolling ? 3.2 : 2.4);
      if (rolling) mesh.userData.body.rotation.z = -(s.d || 0) / 3.2;
      // Behind the modelled tyre the trail is a slim, faint streak (the
      // stand-in puck's broad cone swamped it).
      // (The cone runs along its own Y; X and Z are its radius.)
      if (mesh.userData.trail) mesh.userData.trail.scale.set(rolling ? 0.4 : 1, rolling ? 0.8 : 1, rolling ? 0.4 : 1);
      if (s.type === "debris") mesh.rotation.set(now / 90, now / 70, now / 110);
      if (mesh.userData.trail) mesh.userData.trail.visible = fx;
      if (mesh.userData.ring) mesh.userData.ring.rotation.z = now / 120;
    });
    Object.entries(shots).forEach(([type, list]) => list.forEach((m, i) => { if (i >= used[type]) m.visible = false; }));

    oil.forEach((m, i) => {
      const h = powerUps.hazards[i];
      m.visible = Boolean(h);
      if (h) { m.position.set(h.x, course.heightAt(h.d) + 0.35, h.y); m.rotation.y = -(h.heading || 0); }
    });
    trails.forEach((m, i) => {
      const t = powerUps.trails[i];
      m.visible = Boolean(t);
      // A trailed slick is the drip behind the car, smaller than a dropped pool.
      if (t) { m.position.set(t.x, course.heightAt(t.d) + 0.35, t.y); m.rotation.y = -(t.heading || 0); m.scale.setScalar(0.6); }
    });

    const sc = powerUps.safetyCar;
    safetyCar.visible = Boolean(sc);
    if (sc) {
      place(safetyCar, sc, course, 0);
      const blink = Math.floor(now / 180) % 2;
      safetyCar.userData.lamps.forEach((lamp, i) => { lamp.material.emissiveIntensity = i === blink ? 3 : 0.2; });
    }

    flashes.forEach((m, i) => {
      const f = powerUps.flashes[i];
      m.visible = Boolean(f) && fx;
      if (!m.visible) return;
      m.position.set(f.x, course.heightAt(f.d) + 5, f.y);
      m.scale.setScalar(f.size * 2.4 * (0.5 + f.t));
      m.material.color.set(f.color);
      m.material.opacity = 0.9 * (1 - f.t);
    });

    racers.forEach((r) => {
      const car = cars.get(r.id);
      if (!car) return;
      const gold = r.protectedUntil > now;
      const white = r.formationUntil > now;
      if (!gold && !white) {
        if (car.aura) { car.aura.shell.visible = false; car.aura.trails.forEach((t) => { t.visible = false; }); }
        return;
      }
      const a = aura(car);
      const mat = white ? auraMats.white : auraMats.gold;
      a.shell.visible = true;
      a.shell.traverse((node) => { if (node.isMesh) node.material = mat; });
      mat.opacity = (white ? 0.55 : 0.5) + Math.sin(now / 55) * 0.12;
      a.trails.forEach((t) => {
        t.visible = fx;
        t.material.color.setHex(white ? 0xff9a3c : 0xffc81e);
      });
    });

    shown.shots = Object.values(shots).reduce((s, list) => s + list.filter((m) => m.visible).length, 0);
    shown.hazards = oil.filter((m) => m.visible).length;
    shown.trails = trails.filter((m) => m.visible).length;
    shown.safetyCar = safetyCar.visible;
    shown.flashes = flashes.filter((m) => m.visible).length;
    const fromGlb = (m) => m.visible && m.userData.body && m.userData.body.userData.fromGlb;
    shown.visibleFromGlb = [...Object.values(shots).flat(), ...oil, ...trails, safetyCar].filter(fromGlb).length;
  }

  return {
    group,
    sync,
    setQuality(tier) { quality = tier; },
    inspect: () => ({ ...shown, itemsLoaded: itemsState().ready }),
  };
}
