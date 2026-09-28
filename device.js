// Is this a touch-only device (a phone or tablet without a keyboard and
// mouse)? The game is keyboard-driven, so these get a note before playing.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Device = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function isTouchOnly(matchMedia) {
    if (typeof matchMedia !== "function") return false;
    try {
      return Boolean(matchMedia("(pointer: coarse)").matches && matchMedia("(hover: none)").matches);
    } catch (error) {
      return false;
    }
  }
  return { isTouchOnly };
}));
