// One icon per power-up, 64×64, in one broadcast-graphics style (see
// docs/superpowers/specs/2026-09-29-power-ups-beauty-design.md): a top-lit dark
// tile with an accent bar, and a flat glyph in white plus the item's accent on
// a 4 px grid -- letters drawn as paths, no fonts, no glows. The site inlines
// the SVG; the game's HUD turns each into an image once and draws it in the
// item slot, so the two always show the same picture.
(function (root, factory) {
  const icons = factory();
  if (typeof module === "object" && module.exports) module.exports = icons;
  else root.ITEM_ICONS = icons;
}(typeof self !== "undefined" ? self : this, function () {
  const WHITE = "#f5f7fb";
  const INK = "#0c0e13";
  const ACCENTS = {
    drs: "#00d46a",
    overtakeMode: "#ffd400",
    oilSlick: "#9b7bff",
    debris: "#8a94a6",
    undercut: "#e8002d",
    stewardPenalty: "#2f7bff",
    formationLap: "#ff8a00",
    safetyCar: "#ffb000",
  };
  // The shared tile. Gradient ids are per icon: the site inlines all eight.
  const icon = (id, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`
    + `<defs><linearGradient id="tile-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d212b"/><stop offset="1" stop-color="#0c0e13"/></linearGradient></defs>`
    + `<rect width="64" height="64" rx="14" fill="url(#tile-${id})"/>`
    + `<rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#ffffff" stroke-opacity=".09"/>`
    + `<rect x="14" y="55" width="36" height="4" rx="2" fill="${ACCENTS[id]}"/>`
    + glyph(ACCENTS[id]) + `</svg>`;

  const icons = {
    // The on-screen DRS mark: the letters on a green plate.
    drs: icon("drs", (a) => `<rect x="8" y="18" width="48" height="28" rx="6" fill="${a}"/>`
      + `<path fill="${INK}" fill-rule="evenodd" d="M12 24h6a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6h-6zM16 28v8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z"/>`
      + `<path fill="${INK}" fill-rule="evenodd" d="M26 24h7a5 5 0 0 1 5 5v1a5 5 0 0 1-3 4.6L38 40h-4.4l-2.6-5.5H30V40h-4zM30 28v3h3a1.5 1.5 0 0 0 0-3z"/>`
      + `<path fill="${INK}" d="M52 24h-8a4 4 0 0 0-4 4v1.5a4 4 0 0 0 4 4h4V36h-8v4h8a4 4 0 0 0 4-4v-1.5a4 4 0 0 0-4-4h-4V28h8z"/>`),
    // A bolt over speed lines.
    overtakeMode: icon("overtakeMode", (a) => `<rect x="11" y="21" width="9" height="3" rx="1.5" fill="${WHITE}"/>`
      + `<rect x="11" y="29" width="6" height="3" rx="1.5" fill="${WHITE}" fill-opacity=".7"/>`
      + `<rect x="11" y="37" width="8" height="3" rx="1.5" fill="${WHITE}" fill-opacity=".45"/>`
      + `<path fill="${a}" d="M38 11 20 34.5h11L27.5 52 46 27.5H35z"/>`),
    // A drop over an iridescent pool.
    oilSlick: icon("oilSlick", (a) => `<ellipse cx="32" cy="45" rx="19" ry="6" fill="${a}"/>`
      + `<ellipse cx="25" cy="44" rx="6.5" ry="1.7" fill="${WHITE}" fill-opacity=".55"/>`
      + `<path fill="${WHITE}" d="M32 11c-4.5 6-10 13.2-10 19a10 10 0 0 0 20 0c0-5.8-5.5-13-10-19z"/>`
      + `<ellipse cx="28" cy="31" rx="2.2" ry="3.4" fill="${INK}" fill-opacity=".18"/>`),
    // Carbon shards flying apart.
    debris: icon("debris", (a) => `<path fill="${WHITE}" d="M15 40 29 16l7 18z"/>`
      + `<path fill="${a}" d="M38 14l13 8-9 7z"/>`
      + `<path fill="${WHITE}" d="M36 41l13-6-2 15z"/>`
      + `<path fill="${a}" d="M19 47l6-3 1 5z"/>`),
    // A fresh set of softs, and the chevron of a homing shot.
    undercut: icon("undercut", (a) => `<circle cx="27" cy="32" r="17" fill="#2b303b"/>`
      // The TV tyre mark: the compound's ring round an S (the soft).
      + `<circle cx="27" cy="32" r="12.5" fill="none" stroke="${a}" stroke-width="5"/>`
      + `<path fill="${WHITE}" transform="translate(27 32) scale(.62) translate(-46 -32)" d="M52 24h-8a4 4 0 0 0-4 4v1.5a4 4 0 0 0 4 4h4V36h-8v4h8a4 4 0 0 0 4-4v-1.5a4 4 0 0 0-4-4h-4V28h8z"/>`
      + `<path fill="${a}" d="M47 23l7 9-7 9-2.6-2 5.4-7-5.4-7z"/>`),
    // A stopwatch with a plus: time added.
    stewardPenalty: icon("stewardPenalty", (a) => `<rect x="27" y="11" width="8" height="4" rx="1.5" fill="${WHITE}"/>`
      + `<rect x="29.5" y="14" width="3" height="5" fill="${WHITE}"/>`
      + `<circle cx="31" cy="34" r="14" fill="none" stroke="${WHITE}" stroke-width="4"/>`
      + `<rect x="29.5" y="24" width="3" height="11.5" rx="1.5" fill="${WHITE}"/>`
      + `<circle cx="31" cy="34" r="2.5" fill="${WHITE}"/>`
      + `<circle cx="46" cy="20" r="9.5" fill="#141821"/>`
      + `<circle cx="46" cy="20" r="8" fill="${a}"/>`
      + `<rect x="41.5" y="18.75" width="9" height="2.5" rx="1" fill="${WHITE}"/>`
      + `<rect x="44.75" y="15.5" width="2.5" height="9" rx="1" fill="${WHITE}"/>`),
    // Three chevrons: the field in line, on autopilot.
    formationLap: icon("formationLap", (a) => [12, 24, 36].map((x, i) => {
      const fill = i === 2 ? WHITE : a;
      const opacity = i === 0 ? ` fill-opacity=".45"` : "";
      return `<path fill="${fill}"${opacity} d="M${x} 18h6l10 14-10 14h-6l10-14z"/>`;
    }).join("")),
    // A long, low GT with its light bar on the roof.
    safetyCar: icon("safetyCar", (a) => `<rect x="28" y="21" width="14" height="3.5" rx="1.75" fill="${a}"/>`
      + `<path fill="${WHITE}" d="M8 40v-3c0-2 1.4-3.3 3.6-3.7L21 31.2c3.6-3.7 7.6-5.7 13.2-5.7h4.6c3.6 0 6.8 2.4 9.8 5.9l4.2.9c1.9.4 3.2 1.9 3.2 3.8V40a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z"/>`
      + `<path fill="${INK}" d="M24.5 31.2c3-3 6-4.2 9.8-4.2h4.3c2.4 0 4.8 1.5 6.9 4.2z"/>`
      + `<rect x="12" y="36" width="42" height="1.4" rx=".7" fill="${INK}" fill-opacity=".35"/>`
      + `<circle cx="17" cy="42" r="5.5" fill="${INK}"/><circle cx="17" cy="42" r="2.2" fill="${WHITE}"/>`
      + `<circle cx="46" cy="42" r="5.5" fill="${INK}"/><circle cx="46" cy="42" r="2.2" fill="${WHITE}"/>`),
  };
  // The accents ride along, but not as an icon: the map's keys are the items.
  Object.defineProperty(icons, "ACCENTS", { value: ACCENTS, enumerable: false });
  return icons;
}));
