// Moving a piece of a city (its ground's points) off the track: plain maths,
// no three.js, so the Node tests can run it (tests/vegas-place.test.js).
//
// `course` is the game's course (r3d/track.js): clearance(x, z, reach) is how
// far a point is outside the nearest barrier (negative inside), and
// nearestSample(x, z) the nearest point of the track ({ x, y, nx, ny }).

// The shift (game units, along x and z) that takes every point at least
// `margin` outside the barriers, moving straight away from the track a step
// at a time; with `blocked(x, z)`, a moved piece must also keep off ground
// already taken. Returns { dx, dz, shift } (shift 0 if it was clear), or
// { dropped: why } if it would have to go further than `maxShift`.
export function shiftClear(points, course, { margin = 10, maxShift = 70, blocked = null } = {}) {
  if (!points.length) return { dx: 0, dz: 0, shift: 0 };
  let dx = 0;
  let dz = 0;
  let shift = 0;
  for (let k = 0; k < 8; k += 1) {
    let worst = null;
    let least = Infinity;
    points.forEach(([x, z]) => {
      const c = course.clearance(x + dx, z + dz, margin + 60);
      if (c < least) { least = c; worst = [x + dx, z + dz]; }
    });
    const crowded = shift > 0 && blocked && points.some(([x, z]) => blocked(x + dx, z + dz));
    if (least >= margin && !crowded) return { dx, dz, shift };
    if (least >= margin && crowded) return { dropped: "crowded" };
    const near = course.nearestSample(worst[0], worst[1]);
    if (!near) return { dropped: "lost" };
    let ux = worst[0] - near.x;
    let uz = worst[1] - near.y;
    // (A point on the centreline itself: out along the track's normal.)
    if (Math.hypot(ux, uz) < 1e-3) { ux = near.nx; uz = near.ny; }
    const len = Math.hypot(ux, uz) || 1;
    const need = margin - least + 3;
    dx += (ux / len) * need;
    dz += (uz / len) * need;
    shift = Math.hypot(dx, dz);
    if (shift > maxShift) return { dropped: "too far" };
  }
  // Pushed back and forth (a piece across the road): left out.
  return { dropped: "straddles" };
}

// Tiles (`size` units) a point falls in, as a key: pieces merged per tile
// stay small enough to be left out of a view they are not in.
export function tileKey(x, z, size = 600) {
  return `${Math.floor(x / size)},${Math.floor(z / size)}`;
}
