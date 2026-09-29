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
  // On a touch-only device, "Play" links open the note (a <dialog>) first.
  // "Play anyway" goes on to the game, which then doesn't show its own note
  // again this visit.
  function guardPlayLinks(doc, win, noteId = "phone-play-note") {
    if (!doc || !win || !isTouchOnly(win.matchMedia && win.matchMedia.bind(win))) return false;
    const note = doc.getElementById(noteId);
    if (!note) return false;
    doc.querySelectorAll("a.play-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof note.showModal === "function") note.showModal();
        else win.location.href = link.href;
      });
    });
    const close = note.querySelector("[data-close]");
    if (close) close.addEventListener("click", () => note.close());
    const go = note.querySelector("a.go-btn");
    if (go) {
      go.addEventListener("click", () => {
        try {
          win.sessionStorage.setItem("f1pixelcup.phoneNote", "seen");
        } catch (error) {
          // The game shows its note once more, that's all.
        }
      });
    }
    return true;
  }

  return { isTouchOnly, guardPlayLinks };
}));
