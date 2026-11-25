"""Leaf-card trees for Sky Drift (the layered-foliage look, not lollipop low-poly).

Each tree is two meshes in one .glb:
  trunk  vertex-coloured bark + branches
  crown  dozens of quad "cards" facing outward, UV'd into a 2x2 leaf-clump atlas that the
         game paints at runtime; vertex colour R = how deep inside the crown (ambient shade)

Run headless:
  blender -b --factory-startup -P tools/blender/make_trees.py -- assets/models/trees
Blender +Z is up, exported as glTF +Y.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "trees"
os.makedirs(OUT, exist_ok=True)


def lin(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


BARK = [lin("#6b4a30"), lin("#5a3f2a"), lin("#7a573a")]


def new_obj(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def frustum(bm, col, p0, p1, r0, r1, sides=7):
    """Tapered limb from p0 to p1, open at p0, capped at p1."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    side = axis.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    up = axis.cross(side).normalized()
    ring = lambda c, r: [
        bm.verts.new(c + (side * math.cos(t) + up * math.sin(t)) * r)
        for t in (k / sides * math.tau for k in range(sides))
    ]
    a, b = ring(p0, r0), ring(p1, r1)
    for i in range(sides):
        f = bm.faces.new((a[i], a[(i + 1) % sides], b[(i + 1) % sides], b[i]))
        for loop in f.loops:
            loop[col] = BARK[i % 3]
    cap = bm.faces.new(b)
    for loop in cap.loops:
        loop[col] = BARK[0]


def build_trunk(rng, height, lean, branches, crown_center, crown_radius, base_r):
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    top = Vector((lean[0], lean[1], height))
    mid = Vector((lean[0] * 0.4, lean[1] * 0.4, height * 0.5))
    frustum(bm, col, (0, 0, -0.2), (0, 0, 0.45), base_r * 1.45, base_r * 1.05)   # root flare
    frustum(bm, col, (0, 0, 0.4), mid, base_r * 1.05, base_r * 0.8)
    frustum(bm, col, mid, top, base_r * 0.8, base_r * 0.55)
    for k in range(branches):
        ang = k / branches * math.tau + rng.random() * 0.8
        start = top - Vector((0, 0, rng.random() * 0.5))
        reach = crown_radius * (0.55 + rng.random() * 0.25)
        end = Vector((
            crown_center.x + math.cos(ang) * reach,
            crown_center.y + math.sin(ang) * reach,
            crown_center.z + (rng.random() - 0.3) * crown_radius * 0.45,
        ))
        frustum(bm, col, start, end, base_r * 0.42, base_r * 0.14, sides=6)
    return new_obj("trunk", bm)


def build_crown(rng, center, radii, cards, size_range, seed_shift=0.0):
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    uv = bm.loops.layers.uv.new("UVMap")
    for _ in range(cards):
        # point on a shell of the ellipsoid, biased outward, upper half a bit denser
        d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1) * 0.85 + 0.12))
        d.normalize()
        depth = 0.45 + 0.55 * rng.random() ** 0.6
        c = center + Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * depth
        n = Vector((d.x / radii[0], d.y / radii[1], d.z / radii[2] + 0.05)).normalized()
        t1 = n.cross(Vector((0, 0, 1)))
        if t1.length < 1e-3:
            t1 = Vector((1, 0, 0))
        t1.normalize()
        t2 = n.cross(t1).normalized()
        roll = rng.random() * math.tau
        t1, t2 = (t1 * math.cos(roll) + t2 * math.sin(roll)), (t2 * math.cos(roll) - t1 * math.sin(roll))
        s = rng.uniform(*size_range) * (0.75 + 0.25 * depth)
        corners = [c - t1 * s / 2 - t2 * s / 2, c + t1 * s / 2 - t2 * s / 2,
                   c + t1 * s / 2 + t2 * s / 2, c - t1 * s / 2 + t2 * s / 2]
        verts = [bm.verts.new(p) for p in corners]
        f = bm.faces.new(verts)
        if f.normal.dot(n) < 0:
            f.normal_flip()
        cell = rng.randrange(4)
        u0, v0 = (cell % 2) * 0.5, (cell // 2) * 0.5
        uvs = [(u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5)]
        if rng.random() < 0.5:
            uvs = [uvs[1], uvs[0], uvs[3], uvs[2]]
        shade = 0.5 + 0.5 * min(1.0, depth) + 0.1 * max(0.0, n.z)
        for loop, uvc in zip(f.loops, uvs):
            loop[uv].uv = uvc
            loop[col] = (shade, shade, shade, 1.0)
    return new_obj("crown", bm)


def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def export(objs, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
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
        export_texcoords=True,
    )
    print("EXPORTED", filename, [(o.name, len(o.data.polygons)) for o in objs])


def tree(seed, trunk_h, base_r, crown_z, radii, cards, size, branches, lean=(0.15, 0.1)):
    rng = random.Random(seed)
    center = Vector((lean[0], lean[1], crown_z))
    trunk = build_trunk(rng, trunk_h, lean, branches, center, max(radii[0], radii[1]), base_r)
    crown = build_crown(rng, center, radii, cards, size)
    return [trunk, crown]


def bush(seed):
    rng = random.Random(seed)
    crown = build_crown(rng, Vector((0, 0, 0.75)), (1.25, 1.25, 0.8), 26, (1.0, 1.5))
    return [crown]


JOBS = [
    ("leafy-oak.glb", lambda: tree(3, 1.9, 0.30, 3.0, (2.2, 2.1, 1.55), 78, (1.5, 2.3), 5)),
    ("leafy-round.glb", lambda: tree(8, 1.4, 0.26, 2.5, (1.85, 1.85, 1.6), 64, (1.4, 2.1), 4, (-0.1, 0.12))),
    ("leafy-tall.glb", lambda: tree(13, 2.5, 0.24, 3.55, (1.5, 1.5, 1.9), 62, (1.3, 2.0), 4, (0.1, -0.15))),
    ("leafy-bush.glb", lambda: bush(21)),
]

for filename, make in JOBS:
    clear_scene()
    export(make(), filename)
print("DONE")
