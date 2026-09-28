// Draw a circuit outline as an SVG path, fitted to a box with its
// proportions kept, for the landing page's circuit cards.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrackMap = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const round = (value) => Math.round(value * 100) / 100;

  function path(points, { width, height, padding = 10 }) {
    const viewBox = `0 0 ${width} ${height}`;
    if (!Array.isArray(points) || points.length < 2) return { d: "", start: null, heading: 0, viewBox };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX || 1;
    const spanY = Math.max(...ys) - minY || 1;
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const mapped = points.map((p) => ({
      x: round(offsetX + (p.x - minX) * scale),
      y: round(offsetY + (p.y - minY) * scale),
    }));
    const d = `M${mapped.map((p) => `${p.x},${p.y}`).join(" L")} Z`;
    const heading = round((Math.atan2(mapped[1].y - mapped[0].y, mapped[1].x - mapped[0].x) * 180) / Math.PI);
    return { d, start: mapped[0], heading, viewBox };
  }

  return { path };
}));
