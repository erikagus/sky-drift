"""Emerald Valley village houses: half-timbered, steep roofs, stone ground floor, dormer and chimney.

  blender -b --factory-startup -P tools/blender/make_valley_houses.py -- assets/models/valley

Front is Blender -Y (glTF +Z). Origin at the middle of the footprint, z = 0 at the stone base.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "valley"
os.makedirs(OUT, exist_ok=True)


def lin(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


def jit(c, rng, a):
    k = 1.0 + (rng.random() - 0.5) * 2 * a
    return (c[0] * k, c[1] * k, c[2] * k, 1.0)


class Piece:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new("Col")

    def paint(self, faces, color):
        for f in faces:
            for loop in f.loops:
                loop[self.col] = color

    def box(self, c, s, color, rot=(0.0, 0.0, 0.0)):
        m = (Matrix.Translation(Vector(c)) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y")
             @ Matrix.Rotation(rot[0], 4, "X") @ Matrix.Diagonal((s[0], s[1], s[2], 1.0)))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self.paint({f for v in res["verts"] for f in v.link_faces}, color)

    def orient(self, f, ref):
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - Vector(ref)) < 0:
            f.normal_flip()

    def gable(self, c, w, d, h, rows, gable_col, rz=0.0, strips=7):
        """Steep gabled roof, ridge along local Y, shingle rows alternate colours."""
        t = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rz, 4, "Z")
        ref = t @ Vector((0, 0, h * 0.3))
        vert = lambda x, y, z: self.bm.verts.new(t @ Vector((x, y, z)))
        for side in (-1, 1):
            for k in range(strips):
                t0, t1 = k / strips, (k + 1) / strips
                f = self.bm.faces.new((vert(side * (w / 2) * (1 - t0), -d / 2, h * t0), vert(side * (w / 2) * (1 - t0), d / 2, h * t0),
                                       vert(side * (w / 2) * (1 - t1), d / 2, h * t1), vert(side * (w / 2) * (1 - t1), -d / 2, h * t1)))
                self.orient(f, ref)
                self.paint([f], rows[k % len(rows)])
        for y in (-d / 2, d / 2):
            f = self.bm.faces.new((vert(-w / 2, y, 0), vert(w / 2, y, 0), vert(0, y, h)))
            self.orient(f, ref)
            self.paint([f], gable_col)
        f = self.bm.faces.new((vert(-w / 2, -d / 2, 0), vert(w / 2, -d / 2, 0), vert(w / 2, d / 2, 0), vert(-w / 2, d / 2, 0)))
        self.orient(f, ref)
        self.paint([f], gable_col)

    def to_object(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


TIMBER, STONE, PLASTER = "#4a3426", "#9b9486", ["#f1e6cc", "#ecdcbc", "#e3e0d2"]
ROOFS = [("#b8452f", "#a53b28"), ("#c97a3d", "#b96a32"), ("#5f6f84", "#52627a")]
SHUTTER = ["#2f6f6a", "#8d3a2c", "#3a5f8d"]


def build_house(name, seed, roof_idx, plaster_idx, shutter_idx, wide=0.0, annex=False):
    rng = random.Random(seed)
    p = Piece(name)
    w, d = 6.0 + wide + rng.random() * 0.6, 5.2 + rng.random() * 0.5
    h_stone, h_upper = 1.7, 2.9
    h = h_stone + h_upper
    plaster = lin(PLASTER[plaster_idx])

    p.box((0, 0, h_stone / 2), (w + 0.35, d + 0.35, h_stone), jit(lin(STONE), rng, 0.05))
    for k in range(5):  # stone courses
        p.box((0, 0, 0.3 + k * 0.34), (w + 0.42, d + 0.42, 0.06), lin("#7e786b"))
    p.box((0, 0, h_stone + h_upper / 2), (w, d, h_upper), plaster)
    p.box((0, 0, h_stone + 0.04), (w + 0.5, d + 0.5, 0.18), lin(TIMBER))  # jetty beam
    # half-timbering: posts, rails, braces on the long faces
    for sy in (-1, 1):
        face_y = sy * (d / 2 + 0.03)
        for i in range(5):
            x = -w / 2 + 0.15 + i * (w - 0.3) / 4
            p.box((x, face_y, h_stone + h_upper / 2), (0.2, 0.1, h_upper), lin(TIMBER))
        p.box((0, face_y, h_stone + h_upper * 0.5), (w, 0.1, 0.16), lin(TIMBER))
        p.box((0, face_y, h + 0.02), (w, 0.1, 0.2), lin(TIMBER))
        for sx in (-1, 1):
            p.box((sx * w * 0.25, face_y, h_stone + h_upper * 0.25), (0.14, 0.1, 1.7), lin(TIMBER),
                  rot=(0, sx * math.radians(38), 0))
    for sx in (-1, 1):
        face_x = sx * (w / 2 + 0.03)
        p.box((face_x, 0, h_stone + h_upper / 2), (0.1, d, 0.18), lin(TIMBER))
        for i in range(3):
            p.box((face_x, -d / 2 + 0.2 + i * (d - 0.4) / 2, h_stone + h_upper / 2), (0.1, 0.18, h_upper), lin(TIMBER))

    rows = [lin(c) for c in ROOFS[roof_idx]]
    roof_h = 3.1
    p.gable((0, 0, h + 0.1), d + 1.5, w + 1.2, roof_h, rows, plaster, rz=math.pi / 2, strips=8)
    p.box((0, 0, h + 0.1 + roof_h + 0.06), (w + 1.3, 0.34, 0.18), lin(ROOFS[roof_idx][1]))
    # dormer on the front slope
    dz = h + 1.6
    p.box((w * 0.18, -d * 0.28, dz + 0.55), (1.5, 1.3, 1.1), plaster)
    p.gable((w * 0.18, -d * 0.28 - 0.1, dz + 1.1), 1.7, 1.7, 0.75, rows, plaster, rz=math.pi / 2, strips=3)
    p.box((w * 0.18, -d * 0.28 - 0.66, dz + 0.55), (0.7, 0.08, 0.6), lin("#243548"))

    front = -d / 2 - 0.08
    p.box((-w * 0.22, front, 1.05 + 0.15), (1.2, 0.14, 2.1), lin("#5a3f2a"))   # door in the stone floor
    p.box((-w * 0.22, front - 0.04, 2.35), (1.5, 0.16, 0.16), lin(TIMBER))
    for wx in (w * 0.15, w * 0.34):
        p.box((wx, front, 1.05 + 0.4), (0.9, 0.1, 0.9), lin("#243548"))
        for sx in (-1, 1):
            p.box((wx + sx * 0.62, front - 0.05, 1.45), (0.32, 0.08, 0.92), lin(SHUTTER[shutter_idx]))
    for wx in (-w * 0.28, w * 0.0, w * 0.28):
        wz = h_stone + h_upper * 0.5 - 0.1
        p.box((wx, front - 0.02, wz + 0.2), (0.9, 0.1, 0.95), lin("#243548"))
        for sx in (-1, 1):
            p.box((wx + sx * 0.62, front - 0.06, wz + 0.2), (0.32, 0.08, 0.98), lin(SHUTTER[shutter_idx]))
        p.box((wx, front - 0.25, wz - 0.4), (1.1, 0.34, 0.22), lin("#6b4a30"))      # flower box
        p.box((wx, front - 0.25, wz - 0.22), (1.0, 0.3, 0.14), lin("#6aa84f"))
    # chimney (stone) and a little step
    p.box((-w * 0.3, d * 0.1, h + roof_h * 0.6), (0.9, 0.9, 2.3), lin("#8d6a55"))
    p.box((-w * 0.3, d * 0.1, h + roof_h * 0.6 + 1.2), (1.1, 1.1, 0.16), lin(TIMBER))
    p.box((-w * 0.22, front - 0.55, 0.12), (1.6, 0.9, 0.24), lin("#8a8477"))
    if annex:
        p.box((w / 2 + 1.5, 0, 1.2), (3.0, d * 0.8, 2.4), jit(lin(STONE), rng, 0.05))
        p.gable((w / 2 + 1.5, 0, 2.4), d * 0.8 + 0.8, 3.4, 1.4, rows, lin(STONE), rz=math.pi / 2, strips=4)
    return p.to_object()


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
        filepath=os.path.join(OUT, filename), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_materials="NONE", export_vertex_color="ACTIVE", export_vertex_color_name="Col",
        export_active_vertex_color_when_no_material=True,
    )
    print("EXPORTED", filename, len(obj.data.polygons), "faces")


for filename, make in (
    ("valley-house-a.glb", lambda: build_house("vh-a", 5, 0, 0, 0)),
    ("valley-house-b.glb", lambda: build_house("vh-b", 9, 1, 1, 1, wide=0.6, annex=True)),
    ("valley-house-c.glb", lambda: build_house("vh-c", 14, 2, 2, 2, wide=-0.4)),
    ("valley-house-d.glb", lambda: build_house("vh-d", 19, 0, 1, 2, wide=0.3, annex=True)),
):
    clear_scene()
    export(make(), filename)
print("DONE")
