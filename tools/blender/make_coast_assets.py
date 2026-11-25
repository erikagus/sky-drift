"""Builds the Azure Coast set pieces and exports each one as a .glb with vertex colours.

Run headless:
  blender -b --factory-startup -P tools/blender/make_coast_assets.py -- assets/models/coast

Conventions: 1 unit = 1 metre, Blender -Y is the "front" (becomes +Z in glTF),
piers extend toward +Y (becomes -Z in glTF), boats are long along X.
Colours are painted per face / vertex, no materials (the game shades them itself).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "coast"
os.makedirs(OUT, exist_ok=True)


def lin(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


class Piece:
    """A bmesh with a colour layer and a few shape helpers."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new("Col")

    def paint(self, faces, color):
        for f in faces:
            for loop in f.loops:
                loop[self.col] = color

    def _orient(self, face, ref):
        face.normal_update()
        if face.normal.dot(face.calc_center_median() - Vector(ref)) < 0:
            face.normal_flip()

    def box(self, center, size, color, rz=0.0):
        m = (Matrix.Translation(Vector(center)) @ Matrix.Rotation(rz, 4, "Z")
             @ Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        faces = {f for v in res["verts"] for f in v.link_faces}
        self.paint(faces, color)

    def gable(self, center, w, d, h, roof_cols, gable_col, rz=0.0, strips=5):
        """Gabled roof: ridge runs along local Y, eaves at x = +-w/2 (z = 0), ridge at z = h."""
        t = Matrix.Translation(Vector(center)) @ Matrix.Rotation(rz, 4, "Z")
        ref = t @ Vector((0, 0, h * 0.3))
        vert = lambda x, y, z: self.bm.verts.new(t @ Vector((x, y, z)))
        for side in (-1, 1):
            for k in range(strips):
                t0, t1 = k / strips, (k + 1) / strips
                x0, z0 = side * (w / 2) * (1 - t0), h * t0
                x1, z1 = side * (w / 2) * (1 - t1), h * t1
                f = self.bm.faces.new((vert(x0, -d / 2, z0), vert(x0, d / 2, z0),
                                       vert(x1, d / 2, z1), vert(x1, -d / 2, z1)))
                self._orient(f, ref)
                self.paint([f], roof_cols[k % len(roof_cols)])
        for y in (-d / 2, d / 2):
            f = self.bm.faces.new((vert(-w / 2, y, 0), vert(w / 2, y, 0), vert(0, y, h)))
            self._orient(f, ref)
            self.paint([f], gable_col)
        f = self.bm.faces.new((vert(-w / 2, -d / 2, 0), vert(w / 2, -d / 2, 0),
                               vert(w / 2, d / 2, 0), vert(-w / 2, d / 2, 0)))
        self._orient(f, ref)
        self.paint([f], gable_col)

    def to_object(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


# --------------------------------------------------------------------------- houses
WALLS = {"cream": "#efe2c0", "blue": "#9fc7d8", "ochre": "#dcb98a", "white": "#e8e2d3"}
ROOFS = {
    "terracotta": ("#d4683a", "#c25a30"),
    "orange": ("#e3a548", "#d4953a"),
    "slate": ("#7e8996", "#6f7a88"),
    "red": ("#c4572f", "#b34a28"),
}
WOOD, WOOD_DARK, STONE, BRICK = "#8b6a44", "#5b432c", "#a89f8f", "#9b5a43"
GLASS = "#5b87a3"
SHUTTERS = ["#3f8e8a", "#b8553c", "#3c6e9c", "#4f8a55"]


def build_house(name, wall, roof, shutter, two_story, seed):
    rng = random.Random(seed)
    p = Piece(name)
    w, d = 5.8 + rng.random() * 1.4, 4.8 + rng.random() * 0.8
    h = 5.2 if two_story else 3.0
    base = 0.45

    p.box((0, 0, base / 2), (w + 0.4, d + 0.4, base), lin(STONE))
    p.box((0, 0, base + h / 2), (w, d, h), lin(WALLS[wall]))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((sx * w / 2, sy * d / 2, base + h / 2), (0.28, 0.28, h + 0.05), lin(WOOD_DARK))
    if two_story:
        p.box((0, 0, base + 2.7), (w + 0.12, d + 0.12, 0.22), lin(WOOD_DARK))

    rc = [lin(c) for c in ROOFS[roof]]
    roof_h = 1.9 + rng.random() * 0.6
    p.gable((0, 0, base + h), d + 1.3, w + 1.0, roof_h, rc, lin(WALLS[wall]), rz=math.pi / 2)
    p.box((0, 0, base + h + roof_h + 0.1), (w + 1.1, 0.34, 0.2), lin(ROOFS[roof][1]))

    front = -d / 2 - 0.04
    p.box((-w * 0.2, front, base + 1.05), (1.1, 0.12, 2.0), lin(WOOD_DARK))
    p.box((-w * 0.2, front - 0.02, base + 2.12), (1.4, 0.14, 0.14), lin(WOOD))
    for wx in (w * 0.18, w * 0.38):
        win_z = base + h * (0.62 if two_story is False else 0.35)
        p.box((wx, front, win_z), (0.9, 0.1, 0.95), lin(GLASS))
        p.box((wx - 0.62, front - 0.04, win_z), (0.34, 0.08, 0.98), lin(SHUTTERS[shutter]))
        p.box((wx + 0.62, front - 0.04, win_z), (0.34, 0.08, 0.98), lin(SHUTTERS[shutter]))
    if two_story:
        for wx in (-w * 0.2, w * 0.18, w * 0.38):
            p.box((wx, front, base + 4.0), (0.9, 0.1, 0.95), lin(GLASS))
            p.box((wx, front - 0.5, base + 3.35), (1.3, 0.9, 0.12), lin(WOOD))

    # porch awning + posts
    p.box((0, front - 0.95, base + 2.55), (w * 0.9, 1.9, 0.14), lin(ROOFS[roof][0]), 0)
    for sx in (-1, 1):
        p.box((sx * w * 0.42, front - 1.8, base + 1.25), (0.2, 0.2, 2.5), lin(WOOD_DARK))
    p.box((0, front - 1.0, base + 0.08), (w * 0.9, 2.0, 0.16), lin(WOOD))

    p.box((w * 0.28, d * 0.12, base + h + roof_h * 0.55), (0.8, 0.8, 1.7), lin(BRICK))
    p.box((w * 0.28, d * 0.12, base + h + roof_h * 0.55 + 0.9), (0.95, 0.95, 0.14), lin(WOOD_DARK))
    # clutter by the door: crates and a barrel
    p.box((w * 0.45, front - 0.7, base + 0.38), (0.7, 0.7, 0.7), lin(WOOD))
    p.box((w * 0.45 + 0.6, front - 0.55, base + 0.25), (0.5, 0.5, 0.5), lin(WOOD_DARK))
    return p.to_object()


# --------------------------------------------------------------------------- rocks
def build_rock(name, seed, radius, height, squash):
    rng = random.Random(seed)
    off = Vector((rng.random() * 50, rng.random() * 50, rng.random() * 50))
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    for v in bm.verts:
        p = v.co.copy()
        n = noise.fractal(p * 1.4 + off, 0.55, 2.0, 4)
        ridge = noise.turbulence(p * 0.9 + off, 3, False)
        r = 1.0 + 0.36 * n + 0.18 * ridge
        q = p * r
        z = q.z * height
        z_terrace = round(z * 0.55) / 0.55
        z = z + (z_terrace - z) * 0.3
        v.co = Vector((q.x * radius * squash[0], q.y * radius * squash[1], z))
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z = max(v.co.z, zmin * 0.55) - zmin * 0.55
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True  # soft rock, not flat facets
    bm.normal_update()
    zmax = max(v.co.z for v in bm.verts)
    lavender, tan, moss = lin("#a9a0b2"), lin("#c9a47f"), lin("#6f9a52")
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert
            strata = 0.5 + 0.5 * math.sin(v.co.z * 1.6 + noise.noise(v.co * 0.7 + off) * 3.0)
            c = mix(lavender, tan, 0.25 + strata * 0.75)
            up = max(0.0, v.normal.z)
            if up > 0.55 and v.co.z > zmax * 0.35:
                c = mix(c, moss, min(1.0, (up - 0.55) * 2.2))
            shade = 0.82 + 0.18 * (v.co.z / zmax)
            loop[col] = (c[0] * shade, c[1] * shade, c[2] * shade, 1.0)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# --------------------------------------------------------------------------- pier
def build_pier(length=18.0):
    p = Piece("coast-pier")
    plank_cols = [lin("#9a7650"), lin("#8b6a44"), lin("#a58156")]
    n = int(length / 0.95)
    for i in range(n):
        p.box((0, 0.5 + i * 0.95, -0.11), (2.4, 0.86, 0.22), plank_cols[i % 3])
    for i in range(0, int(length / 3.0) + 1):
        y = 0.6 + i * 3.0
        for sx in (-1, 1):
            p.box((sx * 1.0, y, -1.6), (0.3, 0.3, 3.6), lin(WOOD_DARK))
        p.box((0, y, -0.34), (2.5, 0.26, 0.2), lin(WOOD_DARK))
    for sx in (-1, 1):
        p.box((sx * 1.18, length * 0.5, -0.3), (0.12, length, 0.14), lin(WOOD_DARK))
    end = length + 0.2
    for sx in (-1, 1):
        p.box((sx * 1.05, end, 0.4), (0.2, 0.2, 1.0), lin(WOOD_DARK))
    p.box((0, end, 1.45), (0.1, 0.1, 1.9), lin(WOOD_DARK))
    p.box((0, end, 2.55), (0.4, 0.4, 0.45), lin("#ffd98a"))
    return p.to_object()


# --------------------------------------------------------------------------- boats
def build_boat(name, hull_hex, trim_hex):
    p = Piece(name)
    bm = p.bm

    def ring(scale, z, n=18):
        out = []
        for k in range(n):
            t = k / n * math.tau
            x = math.cos(t) * 2.1 * scale
            s = math.sin(t)
            taper = max(0.0, 1.0 - (math.cos(t)) ** 2) ** 0.45
            y = math.copysign(abs(s) ** 0.9, s) * 0.85 * scale * taper
            out.append(bm.verts.new((x, y, z)))
        return out

    bottom, outer, inner, floor_ = ring(0.5, 0.0), ring(1.0, 0.52), ring(0.84, 0.52), ring(0.5, 0.2)
    n = len(bottom)

    def band(a, b, color):
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            p.paint([f], color)

    hull, trim, wood = lin(hull_hex), lin(trim_hex), lin("#d9c39a")
    band(bottom, outer, hull)
    band(outer, inner, trim)
    band(inner, floor_, wood)
    for ringv, color in ((bottom, hull), (floor_, wood)):
        p.paint([bm.faces.new(ringv)], color)
    for x in (-0.7, 0.5):
        p.box((x, 0, 0.5), (0.16, 1.5, 0.1), lin(WOOD))
    p.box((0.1, 1.0, 0.6), (0.06, 1.2, 0.05), lin(WOOD_DARK), rz=0.5)
    obj = p.to_object()
    return obj


# --------------------------------------------------------------------------- export
def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def export(obj, filename):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, filename),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_vertex_color_name="Col",
        export_active_vertex_color_when_no_material=True,
    )
    print("EXPORTED", filename, len(obj.data.polygons), "faces")


JOBS = [
    ("coast-house-a.glb", lambda: build_house("house-a", "blue", "terracotta", 0, False, 11)),
    ("coast-house-b.glb", lambda: build_house("house-b", "cream", "orange", 1, True, 23)),
    ("coast-house-c.glb", lambda: build_house("house-c", "ochre", "slate", 2, False, 37)),
    ("coast-house-d.glb", lambda: build_house("house-d", "white", "red", 3, True, 41)),
    ("coast-rock-a.glb", lambda: build_rock("rock-a", 5, 4.2, 5.2, (1.0, 0.85))),
    ("coast-rock-b.glb", lambda: build_rock("rock-b", 9, 5.2, 3.4, (1.25, 0.8))),
    ("coast-pier.glb", lambda: build_pier(18.0)),
    ("coast-boat-a.glb", lambda: build_boat("boat-a", "#a3623a", "#e9d9b4")),
    ("coast-boat-b.glb", lambda: build_boat("boat-b", "#d9c9a3", "#3f7f9a")),
    ("coast-boat-c.glb", lambda: build_boat("boat-c", "#3f7f9a", "#e9d9b4")),
]

for filename, make in JOBS:
    clear_scene()
    export(make(), filename)
print("DONE")
