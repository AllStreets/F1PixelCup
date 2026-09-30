"""Parts shared by the Blender build scripts (build_f1_car.py, build_driver.py).

The helmet is one shell for the car and the drivers alike, so each driver's
painted design (r3d/car.js) fits both: equirectangular UVs, u round the head
with the front at u = 0.5 (the seam at the back), v up to the crown.
"""
import bmesh
import math

HELMET_R = 0.135


def helmet_bmesh(cx, cz):
    """The shell: an egg a little longer than it is wide, a flatter chin, a
    skirt flared at the neck. Centred at (cx, 0, cz)."""
    bm = bmesh.new()
    bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=HELMET_R, calc_uvs=True)
    for v in bm.verts:
        x, y, z = v.co
        # (Blender's UV sphere puts u = 0.5 on +X, the front, and its seam at the back.)
        x *= 1.12
        if z < -0.03:
            # Flatter chin at the front, a flared skirt at the neck.
            k = (-0.03 - z) / 0.105
            x *= 1 - 0.18 * k if x > 0 else 1 + 0.04 * k
            y *= 1 + 0.05 * k
        v.co = (x + cx, y, z + cz)
    return bm


def shell_z(cx, cz, x, y):
    k = 1 - ((x - cx) / 0.151) ** 2 - (y / HELMET_R) ** 2
    return cz + HELMET_R * math.sqrt(max(k, 0.0))


def spoiler_bmesh(cx, cz):
    """The rear spoiler: a lip moulded to the top back of the shell. Its
    underside follows the shell (sunk a hair into it), and it thickens toward
    the trailing edge, as the real ones do."""
    bm = bmesh.new()
    nx, ny = 8, 7
    x0, x1, half_span = cx - 0.048, cx - 0.095, 0.058
    grid = {}
    for i in range(nx):
        x = x0 + (x1 - x0) * i / (nx - 1)
        lift = 0.002 + 0.008 * (i / (nx - 1)) ** 1.5
        for j in range(ny):
            y = -half_span + 2 * half_span * j / (ny - 1)
            # Taper toward the ends of the span.
            t = lift * (1 - 0.6 * abs(y) / half_span)
            zb = shell_z(cx, cz, x, y) - 0.003
            grid[(i, j, 0)] = bm.verts.new((x, y, zb))
            grid[(i, j, 1)] = bm.verts.new((x, y, zb + t + 0.003))
    for i in range(nx - 1):
        for j in range(ny - 1):
            bm.faces.new((grid[(i, j, 1)], grid[(i + 1, j, 1)], grid[(i + 1, j + 1, 1)], grid[(i, j + 1, 1)]))
            bm.faces.new((grid[(i, j, 0)], grid[(i, j + 1, 0)], grid[(i + 1, j + 1, 0)], grid[(i + 1, j, 0)]))
    for i in range(nx - 1):
        for j in (0, ny - 1):
            bm.faces.new((grid[(i, j, 0)], grid[(i + 1, j, 0)], grid[(i + 1, j, 1)], grid[(i, j, 1)]))
    for j in range(ny - 1):
        for i in (0, nx - 1):
            bm.faces.new((grid[(i, j, 0)], grid[(i, j, 1)], grid[(i, j + 1, 1)], grid[(i, j + 1, 0)]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def spoiler_uvs(ob):
    """Every spoiler UV points at (0.25, 0.98) -- v = 0.02 once in glTF, the top
    rows of the painted design at x = 64 -- which every motif paints in the
    crown colour; so the spoiler wears the crown colour. A new motif must keep that."""
    uv = ob.data.uv_layers.new(name="UVMap")
    for loop in uv.data:
        loop.uv = (0.25, 0.98)
