"""Stone arch bridge and fishing trawler for Sky Drift (replaces the old box-built versions).

  blender -b --factory-startup -P tools/blender/make_props.py -- assets/models/props

Bridge: X along the span, Y across, Z up, water at z = 0, towers at x = +-16 (same footprint the
game's collision / "fly under" check expects). Trawler: bow toward +Y (glTF -Z), waterline z = 0.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "props"
os.makedirs(OUT, exist_ok=True)


def lin(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


def jitter(color, rng, amount):
    k = 1.0 + (rng.random() - 0.5) * 2 * amount
    return (color[0] * k, color[1] * k, color[2] * k, 1.0)


class Piece:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new("Col")

    def paint(self, faces, color):
        for f in faces:
            for loop in f.loops:
                loop[self.col] = color

    def box(self, center, size, color, rot=(0.0, 0.0, 0.0)):
        m = (Matrix.Translation(Vector(center))
             @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
             @ Matrix.Diagonal((size[0], size[1], size[2], 1.0)))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self.paint({f for v in res["verts"] for f in v.link_faces}, color)

    def quad(self, p, color):
        f = self.bm.faces.new([self.bm.verts.new(v) for v in p])
        self.paint([f], color)
        return f

    def pyramid(self, base_center, half_x, half_y, height, color):
        c = Vector(base_center)
        corners = [c + Vector(v) for v in ((-half_x, -half_y, 0), (half_x, -half_y, 0), (half_x, half_y, 0), (-half_x, half_y, 0))]
        apex = c + Vector((0, 0, height))
        ref = c + Vector((0, 0, height * 0.3))
        faces = []
        for i in range(4):
            f = self.bm.faces.new([self.bm.verts.new(v) for v in (corners[i], corners[(i + 1) % 4], apex)])
            f.normal_update()
            if f.normal.dot(f.calc_center_median() - ref) < 0:
                f.normal_flip()
            faces.append(f)
        self.paint(faces, color)

    def to_object(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


# --------------------------------------------------------------------------- bridge
STONES = ["#a39b8b", "#8e877a", "#b1a898", "#9a9382"]
MOSSY = "#6f7f6a"
CAP = "#c3b9a3"
PAVE = ["#b7a98d", "#a89a7e"]
SLATE = "#6f7f8f"


def arch_z(x):
    t = x / 15.2
    return 14.8 - t * t * 3.4


def build_bridge():
    rng = random.Random(4)
    p = Piece("bridge")
    # --- towers, laid course by course so they read as masonry
    for sx in (-1, 1):
        cx = sx * 16.0
        z = -3.5
        course = 0
        while z < 13.9:
            frac = (z + 3.5) / 17.4
            w, d = 5.0 - 0.55 * frac, 6.6 - 0.5 * frac
            h = 0.85
            base = lin(MOSSY) if z < 0.9 else lin(STONES[course % 4])
            p.box((cx + (rng.random() - 0.5) * 0.06, 0, z + h / 2), (w, d, h), jitter(base, rng, 0.07))
            # corner quoins stick out a touch
            for qx in (-1, 1):
                for qy in (-1, 1):
                    p.box((cx + qx * (w / 2), qy * (d / 2), z + h / 2), (0.34, 0.34, h * 0.98), jitter(lin(CAP), rng, 0.05))
            z += h
            course += 1
        p.box((cx, 0, 14.15), (5.9, 7.4, 0.38), lin(CAP))
        p.box((cx, 0, 14.5), (4.6, 6.0, 0.4), lin(STONES[0]))
        p.pyramid((cx, 0, 14.7), 2.5, 3.2, 2.3, lin(SLATE))
        # arched window slit on each long face
        for sy in (-1, 1):
            p.box((cx, sy * 3.32, 10.6), (0.8, 0.12, 2.0), lin("#4b5560"))
    # --- curved deck, built from short segments following the arch
    n = 26
    xs = [-15.2 + 30.4 * i / n for i in range(n + 1)]
    half_w = 2.9
    for i in range(n):
        x0, x1 = xs[i], xs[i + 1]
        z0, z1 = arch_z(x0), arch_z(x1)
        top0, top1, bot0, bot1 = z0 + 0.85, z1 + 0.85, z0 - 0.85, z1 - 0.85
        pave = lin(PAVE[i % 2])
        p.quad([(x0, -half_w, top0), (x1, -half_w, top1), (x1, half_w, top1), (x0, half_w, top0)], pave)
        p.quad([(x0, half_w, bot0), (x1, half_w, bot1), (x1, -half_w, bot1), (x0, -half_w, bot0)], lin("#6e685c"))
        stone = jitter(lin(STONES[i % 4]), rng, 0.06)
        p.quad([(x0, half_w, bot0), (x1, half_w, bot1), (x1, half_w, top1), (x0, half_w, top0)], stone)
        p.quad([(x1, -half_w, bot1), (x0, -half_w, bot0), (x0, -half_w, top0), (x1, -half_w, top1)], stone)
        # parapet block on each side, tilted to follow the slope
        slope = math.atan2(top1 - top0, x1 - x0)
        seg_len = math.hypot(x1 - x0, top1 - top0) + 0.04
        mx, mz = (x0 + x1) / 2, (top0 + top1) / 2
        for sy in (-1, 1):
            p.box((mx, sy * 2.68, mz + 0.42), (seg_len, 0.5, 0.84), jitter(lin(STONES[(i + 1) % 4]), rng, 0.06), rot=(0, -slope, 0))
            p.box((mx, sy * 2.68, mz + 0.9), (seg_len, 0.66, 0.16), lin(CAP), rot=(0, -slope, 0))
    # --- lamp posts the game hangs its lanterns on (x = -11.4, 0, 11.4)
    for x in (-11.4, 0.0, 11.4):
        for sy in (-1, 1):
            p.box((x, sy * 2.75, arch_z(x) + 0.85 + 0.9), (0.2, 0.2, 1.8), lin("#4b3a2b"))
    return p.to_object()


# --------------------------------------------------------------------------- trawler
def build_trawler():
    p = Piece("trawler")
    bm = p.bm
    L, n = 7.6, 16
    hull_red, hull_dark, trim, deck = lin("#d9382a"), lin("#7a2a1c"), lin("#2c3540"), lin("#9c7448")
    secs = []
    for i in range(n + 1):
        s = i / n
        y = -L / 2 + s * L
        taper = max(0.0, (s - 0.5) / 0.5)
        w = max(0.05, 1.4 * (1 - 0.97 * taper ** 2.2))
        rim = 1.0 + 0.45 * s ** 3
        keel = min(-0.45 + 0.55 * taper ** 1.5, rim - 0.6)
        mid = (rim + keel) * 0.5 + 0.1
        pts = [(-w, rim), (-w * 0.93, mid), (-w * 0.55, keel + 0.12), (0, keel), (w * 0.55, keel + 0.12), (w * 0.93, mid), (w, rim)]
        secs.append([bm.verts.new((x, y, z)) for x, z in pts])
    for i in range(n):
        a, b = secs[i], secs[i + 1]
        for j in range(6):
            f = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            zc = sum(v.co.z for v in f.verts) / 4
            p.paint([f], trim if zc > 0.9 else (hull_red if zc > 0.1 else hull_dark))
        f = bm.faces.new((a[0], b[0], b[6], a[6]))
        p.paint([f], deck)
    p.paint([bm.faces.new(secs[0])], hull_red)
    p.paint([bm.faces.new(list(reversed(secs[-1])))], hull_red)
    # --- superstructure
    cream, glass, roof, wood = lin("#f4eadb"), lin("#243548"), lin("#8c5a38"), lin("#8b6a44")
    p.box((0, -0.35, 1.85), (2.1, 2.5, 1.75), cream)
    p.box((0, 0.92, 2.15), (1.7, 0.08, 0.62), glass)
    for sx in (-1, 1):
        p.box((sx * 1.06, -0.35, 2.15), (0.08, 1.6, 0.62), glass)
    p.box((0, -0.35, 2.84), (2.4, 2.8, 0.24), roof)
    p.box((0, -1.8, 3.0), (0.55, 0.55, 1.5), lin("#d9382a"))
    p.box((0, -1.8, 3.8), (0.6, 0.6, 0.2), lin("#1d2229"))
    p.box((0, 0.5, 3.5), (0.2, 0.2, 5.0), wood)
    p.box((0, 1.15, 3.4), (0.14, 3.1, 0.14), wood, rot=(math.radians(-35), 0, 0))
    p.box((0.7, -2.7, 1.35), (0.8, 0.8, 0.8), lin("#a77a4c"))
    p.box((-0.55, -2.8, 1.25), (0.7, 0.7, 0.6), lin("#8b6a44"))
    p.box((0, 2.4, 1.15), (0.9, 0.7, 0.4), lin("#4b5560"))
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


for filename, make in (("stone-bridge.glb", build_bridge), ("trawler.glb", build_trawler)):
    clear_scene()
    export(make(), filename)
print("DONE")
