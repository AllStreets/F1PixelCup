// Where trackside pieces go round a circuit (docs/superpowers/specs/2026-10-05-historic-landmarks-design.md).
// Pure: the middle of the pit lane's zone round the lap, the lap's anchors from a point,
// a stand moved along the lap round a venue's main stand, and whether a round
// footprint touches a placed model's rectangles. In the page it defines
// window.Siting (used by r3d/landmarks.js and r3d/track.js); in Node it is
// require()-able.
(function attach(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Siting = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const wrap = (d, total) => ((d % total) + total) % total;

  // The middle of a stretch of the lap given by its points' lap distances
  // (ascending; the pit lane's zone), also where it runs across the line:
  // the run starts after its widest gap (where the stretch is not).
  function zoneMiddle(ds, total) {
    if (!ds.length) return null;
    let cut = 0;
    let widest = -1;
    ds.forEach((d, i) => {
      const next = i + 1 < ds.length ? ds[i + 1] : ds[0] + total;
      if (next - d > widest) { widest = next - d; cut = i + 1; }
    });
    const run = [...ds.slice(cut), ...ds.slice(0, cut)];
    return run[Math.floor(run.length / 2)];
  }

  // The whole lap from a lap distance, `spread` apart, nearest first; at
  // each, the side `away` before the other.
  function lapFrom(total, d0, spread, away) {
    const out = [];
    for (let k = 0; k * spread <= total / 2; k += 1) {
      [1, -1].forEach((sgn) => {
        if (k === 0 && sgn < 0) return;
        [away, -away].forEach((side) => out.push({ d: d0 + sgn * k * spread, side }));
      });
    }
    return out;
  }

  // A piece of the track data's scenery ({ x, y, d, angle, face }) moved
  // along the lap: on its own side, as far past the barrier as it was, to
  // the nearest place (either way, `step` apart, up to `reach`) that
  // `clear(x, y, angle, q)` accepts. The course gives sampleAt(d) (x, y,
  // tx, ty, nx, ny, outerL, outerR) and track.totalLength. Returns the moved
  // piece, or null.
  function slidePiece(course, piece, clear, { step = 40, reach = 1200 } = {}) {
    const total = course.track.totalLength;
    const p0 = course.sampleAt(piece.d);
    const off0 = (piece.x - p0.x) * p0.nx + (piece.y - p0.y) * p0.ny;
    const side = off0 >= 0 ? 1 : -1;
    const back = Math.abs(off0) - (side > 0 ? p0.outerR : p0.outerL);
    for (let k = 1; k * step <= reach; k += 1) {
      for (const sgn of [1, -1]) {
        const at = wrap(piece.d + sgn * k * step, total);
        const q = course.sampleAt(at);
        const off = side * ((side > 0 ? q.outerR : q.outerL) + back);
        const x = q.x + q.nx * off;
        const y = q.y + q.ny * off;
        const angle = Math.atan2(q.ty, q.tx);
        if (!clear(x, y, angle, q)) continue;
        return { ...piece, x, y, angle, face: Math.atan2(q.y - y, q.x - x), d: at, moved: true };
      }
    }
    return null;
  }

  // Does a round footprint (x, z, r) touch a placed model's rectangles?
  // claim: { x, z, yaw, scale, rects } as r3d/landmarks.js placeModel puts
  // it (rects in the model's metres, its front toward -z).
  function touchesRects(claim, x, z, r) {
    const dx = x - claim.x;
    const dz = z - claim.z;
    const c = Math.cos(claim.yaw);
    const s = Math.sin(claim.yaw);
    const lx = (dx * c - dz * s) / claim.scale;
    const lz = (dx * s + dz * c) / claim.scale;
    return claim.rects.some((q) => {
      const ex = Math.max(q.x0 - lx, 0, lx - q.x1);
      const ez = Math.max(q.z0 - lz, 0, lz - q.z1);
      return Math.hypot(ex, ez) * claim.scale < r;
    });
  }

  return { zoneMiddle, lapFrom, slidePiece, touchesRects };
}));
