// Two-player split screen (docs/superpowers/specs/2026-10-01-split-screen-design.md).
// Pure rules: how the window is cut into two views, each view's HUD area and
// field of view, the two key sets, reading a gamepad, and player 2's driver.
// In the page this defines window.TwoPlayer; in Node it is require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TwoPlayer = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // The HUD's design area, as the single view has it (game.js).
  const SAFE_WIDTH = 1024;
  const SAFE_HEIGHT = 576;
  // Wider than this (width over height), the views go side by side.
  const SIDE_BY_SIDE_FROM = 2.1;
  // The rule between the two views, at least this thick.
  const DIVIDER = 4;
  // A split view never shows more to the sides than a 2.4:1 picture would.
  const WIDE_CAP = 2.4;
  const BASE_ASPECT = 16 / 9;
  // The stick and the triggers read nothing until past these.
  const STICK_DEAD = 0.25;
  const TRIGGER_DEAD = 0.1;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // The window (CSS px) cut into two equal views and the divider between
  // them, all whole pixels, tiling it exactly.
  function layout(width, height) {
    const W = Math.max(0, Math.round(width));
    const H = Math.max(0, Math.round(height));
    if (H === 0 || W / H > SIDE_BY_SIDE_FROM) {
      const w = Math.max(0, Math.floor((W - DIVIDER) / 2));
      return {
        arrangement: "side",
        views: [{ x: 0, y: 0, w, h: H }, { x: W - w, y: 0, w, h: H }],
        divider: { x: w, y: 0, w: W - 2 * w, h: H },
      };
    }
    const h = Math.max(0, Math.floor((H - DIVIDER) / 2));
    return {
      arrangement: "stacked",
      views: [{ x: 0, y: 0, w: W, h }, { x: 0, y: H - h, w: W, h }],
      divider: { x: 0, y: h, w: W, h: H - 2 * h },
    };
  }

  // A view's logical HUD area: at least the safe area, grown in whichever
  // direction the view is longer. scale is real pixels per logical unit.
  function hudFit(w, h) {
    const cssW = Math.max(1, w);
    const cssH = Math.max(1, h);
    const scale = Math.min(cssW / SAFE_WIDTH, cssH / SAFE_HEIGHT);
    return { width: cssW / scale, height: cssH / scale, scale };
  }

  // Vertical field of view (degrees) for a split view of this aspect.
  function viewFov(fov, aspect) {
    const a = aspect > 0 ? aspect : BASE_ASPECT;
    const t = Math.tan((fov * Math.PI) / 360);
    if (a < BASE_ASPECT) return (Math.atan((t * BASE_ASPECT) / a) * 360) / Math.PI;
    if (a <= WIDE_CAP) return fov;
    return (Math.atan((t * WIDE_CAP) / a) * 360) / Math.PI;
  }

  // The two key sets, by physical key (KeyboardEvent.code).
  const KEYS = [
    { throttle: ["KeyW"], brake: ["KeyS"], left: ["KeyA"], right: ["KeyD"], drift: ["ShiftLeft"], item: ["Space"] },
    { throttle: ["ArrowUp"], brake: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"], drift: ["ShiftRight"], item: ["Slash"] },
  ];
  const BY_CODE = new Map();
  KEYS.forEach((set, player) => Object.entries(set).forEach(([action, codes]) => codes.forEach((code) => BY_CODE.set(code, { player, action }))));

  function keyFor(code) {
    const hit = BY_CODE.get(code);
    return hit ? { ...hit } : null;
  }

  // A gamepad in the standard mapping, read as the game's controls (into out
  // when given, so nothing new is made each frame). A device with another
  // layout (a wheel, a flight stick) reads as nothing: its buttons mean
  // something else.
  const NOTHING = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, pause: false };
  function readPad(pad, out = {}) {
    if (!pad || pad.mapping !== "standard") return Object.assign(out, NOTHING);
    const buttons = pad.buttons || [];
    // A trigger's value is how far it is pulled (pressed is set part way); a
    // button that reports no value counts as full when pressed.
    const value = (i) => {
      const b = buttons[i];
      if (b === undefined || b === null) return 0;
      if (typeof b === "number") return b;
      const v = Number(b.value) || 0;
      return v === 0 && b.pressed ? 1 : v;
    };
    const down = (i) => value(i) > 0.5;
    const trigger = (v) => (v <= TRIGGER_DEAD ? 0 : clamp((v - TRIGGER_DEAD) / (1 - TRIGGER_DEAD), 0, 1));
    const x = Number((pad.axes || [])[0]) || 0;
    let steer = Math.abs(x) <= STICK_DEAD ? 0 : Math.sign(x) * clamp((Math.abs(x) - STICK_DEAD) / (1 - STICK_DEAD), 0, 1);
    if (down(14) !== down(15)) steer = down(15) ? 1 : -1;
    out.throttle = Math.max(down(0) ? 1 : 0, trigger(value(7)));
    out.brake = Math.max(down(1) ? 1 : 0, trigger(value(6)));
    out.steer = steer;
    out.drift = down(4) || down(5);
    out.item = down(2) || down(3);
    out.pause = down(9);
    return out;
  }

  // A player's keys and pad together: whichever asks for more. Keys are
  // { throttle, brake, left, right, drift, item } (the single player's
  // Space counts as item).
  function merge(keys, pad, out = {}) {
    const k = keys || {};
    const p = pad || NOTHING;
    const keySteer = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const steerKeys = Boolean(k.left || k.right);
    out.throttle = Math.max(k.throttle ? 1 : 0, p.throttle || 0);
    out.brake = Math.max(k.brake ? 1 : 0, p.brake || 0);
    out.steer = steerKeys ? keySteer : clamp(p.steer || 0, -1, 1);
    out.drift = Boolean(k.drift || p.drift);
    out.item = Boolean(k.item || k.space || p.item);
    return out;
  }

  // The pads in play: connected ones with the standard layout, in the browser's order.
  function padsInOrder(list) {
    return Array.from(list || []).filter((pad) => pad && pad.connected !== false && pad.mapping === "standard");
  }

  // Which pad (by its index) each player has: a player keeps theirs while it
  // stays connected; a new pad fills the first empty slot.
  function assignPads(slots, pads) {
    const here = new Set(pads.map((pad) => pad.index));
    const next = slots.map((index) => (index !== null && here.has(index) ? index : null));
    pads.forEach((pad) => {
      if (next.includes(pad.index)) return;
      const free = next.indexOf(null);
      if (free >= 0) next[free] = pad.index;
    });
    return next;
  }

  // Player 2's driver: the player's second favourite, else the first.
  const FAVOURITES = ["hamilton", "leclerc"];
  function secondDriver(ids, firstId) {
    return FAVOURITES.find((id) => id !== firstId && ids.includes(id)) || ids.find((id) => id !== firstId) || null;
  }

  // The next (dir 1) or previous (-1) driver round the list, skipping one.
  function stepDriver(ids, currentId, dir, skipId) {
    const n = ids.length;
    let i = Math.max(0, ids.indexOf(currentId));
    for (let tries = 0; tries < n; tries += 1) {
      i = (((i + dir) % n) + n) % n;
      if (ids[i] !== skipId) return ids[i];
    }
    return currentId;
  }

  // How far the nearest human is ahead (+) or behind (-) of this progress.
  function nearestGap(humans, mine) {
    let best = null;
    (humans || []).forEach((p) => {
      const gap = p - mine;
      if (best === null || Math.abs(gap) < Math.abs(best)) best = gap;
    });
    return best === null ? 0 : best;
  }

  return {
    SAFE_WIDTH, SAFE_HEIGHT, SIDE_BY_SIDE_FROM, DIVIDER, WIDE_CAP, STICK_DEAD, TRIGGER_DEAD, KEYS,
    layout, hudFit, viewFov, keyFor, readPad, merge, padsInOrder, assignPads, secondDriver, stepDriver, nearestGap,
  };
}));
