// One painted icon per power-up, 64×64. The site inlines the SVG; the game's
// HUD turns each into an image once and draws it in the item slot, so the two
// always show the same picture.
(function (root, factory) {
  const icons = factory();
  if (typeof module === "object" && module.exports) module.exports = icons;
  else root.ITEM_ICONS = icons;
}(typeof self !== "undefined" ? self : this, function () {
  const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
  const tile = (fill) => `<rect width="64" height="64" rx="12" fill="${fill}"/>`;
  return {
    oilSlick: svg(`${tile("#1b1330")}<path d="M12 38C8 28 22 22 30 26C36 16 54 20 52 32C60 38 50 50 38 46C30 54 14 50 12 38Z" fill="#07070b"/><path d="M20 34C24 28 34 28 38 32" stroke="#b36bff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M26 40C32 36 42 36 46 40" stroke="#3de0ff" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="42" cy="30" rx="4" ry="2" fill="#ffffff" opacity=".5"/>`),
    debris: svg(`${tile("#06201e")}<path d="M14 44L30 12L50 30L38 52Z" fill="#2b2f36" stroke="#00d2be" stroke-width="3" stroke-linejoin="round"/><path d="M22 40L31 20M30 44L40 26M18 32L44 36" stroke="#4a515c" stroke-width="2"/><circle cx="52" cy="14" r="2" fill="#ffd166"/><circle cx="56" cy="22" r="1.5" fill="#ffd166"/>`),
    drs: svg(`${tile("#0b5e33")}<rect x="12" y="22" width="5" height="26" rx="1" fill="#10151c"/><rect x="47" y="22" width="5" height="26" rx="1" fill="#10151c"/><rect x="12" y="40" width="40" height="6" rx="2" fill="#10151c"/><path d="M17 32L47 26L47 30L17 36Z" fill="#e6f7ee"/><path d="M20 16H34V11L45 18L34 25V20H20Z" fill="#7dffb0"/>`),
    undercut: svg(`${tile("#2a0508")}<path d="M6 38L30 30V46Z" fill="#ff3b30" opacity=".45"/><ellipse cx="40" cy="41" rx="16" ry="7" fill="#7a0000"/><ellipse cx="40" cy="36" rx="16" ry="7" fill="#dc0000"/><ellipse cx="40" cy="35" rx="8" ry="3.5" fill="#ff8a80"/>`),
    overtakeMode: svg(`${tile("#3a2a00")}<circle cx="32" cy="32" r="22" fill="#ffc81e"/><circle cx="32" cy="32" r="22" fill="none" stroke="#fff3b0" stroke-width="3"/><path d="M35 12L20 36H30L27 52L44 26H34Z" fill="#fff8dc" stroke="#8a5a00" stroke-width="2" stroke-linejoin="round"/>`),
    stewardPenalty: svg(`${tile("#04142e")}<ellipse cx="32" cy="38" rx="25" ry="8" fill="none" stroke="#7cc4ff" stroke-width="3"/><ellipse cx="32" cy="42" rx="14" ry="6" fill="#004a99"/><ellipse cx="32" cy="37" rx="14" ry="6" fill="#0090ff"/><rect x="29" y="10" width="6" height="16" rx="3" fill="#ffffff"/><circle cx="32" cy="30" r="3" fill="#ffffff"/>`),
    formationLap: svg(`${tile("#2c1206")}<path d="M8 20L24 32L8 44ZM22 20L38 32L22 44ZM36 20L52 32L36 44Z" fill="#fff4e0" stroke="#ff9a3c" stroke-width="2" stroke-linejoin="round"/>`),
    safetyCar: svg(`${tile("#2a2412")}<rect x="22" y="17" width="9" height="6" rx="2" fill="#ffb000"/><rect x="33" y="17" width="9" height="6" rx="2" fill="#ffd000"/><path d="M8 44L14 32L24 27H42L52 33L56 44Z" fill="#c9ced6"/><path d="M23 32L27 29H40L46 33Z" fill="#26303b"/><circle cx="19" cy="45" r="6" fill="#111111"/><circle cx="45" cy="45" r="6" fill="#111111"/><rect x="28" y="36" width="10" height="4" rx="1" fill="#1b1b1b"/>`),
  };
}));
