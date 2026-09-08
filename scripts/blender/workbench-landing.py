"""Original miniature knowledge studio. Run ONLY through the local MCP bridge.

rtk proxy node scripts/blender-mcp-client.mjs execute \
  --file scripts/blender/workbench-landing.py --timeout-ms 180000

No bpy.ops.object.select_all/delete, external assets, private scene dependencies,
global save_mainfile, external process, network call or output-path input.
Geometry is batched by station/material; the three animated cards stay separate.
"""
import bpy
import bmesh
import hashlib
import json
import math
import runpy
from collections import defaultdict
from pathlib import Path
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
DESIGN = ROOT / "design/workbench-landing"
PUBLIC = ROOT / "frontend/assets/workbench-landing"
OWNER = "memory-garden-landing-v1"
NAME = "MG_Workbench_Landing"
AUDIT = runpy.run_path(str(DESIGN / "scene-audit.py"))
ROOTS = AUDIT["ROOTS"]
ANIMATIONS = AUDIT["ANIMATIONS"]
OUTPUTS = (DESIGN / "workbench.blend", PUBLIC / "workbench.glb",
           PUBLIC / "poster-desktop.webp", PUBLIC / "poster-mobile.webp")


def owned(block):
    if block.get("mg_owner") != OWNER:
        raise RuntimeError("UNOWNED_DATABLOCK: " + block.name)
    return block


def tag(block):
    block["mg_owner"] = OWNER
    return block


def validate_before_mutation():
    """Fail closed before touching any Blender data or existing asset output."""
    if not (DESIGN / "original-scene-snapshot.json").is_file():
        raise RuntimeError("READ_ONLY_BASELINE_REQUIRED")
    if not (DESIGN / "original-viewport.png").is_file():
        raise RuntimeError("ORIGINAL_SCREENSHOT_REQUIRED")
    baseline = AUDIT["audit"]()
    scene = bpy.data.scenes.get(NAME)
    collection = bpy.data.collections.get(NAME)
    if scene:
        owned(scene)
        if any(o.get("mg_owner") != OWNER for o in scene.objects):
            raise RuntimeError("UNOWNED_OBJECT_IN_TASK_SCENE")
        if any(c.get("mg_owner") != OWNER for c in scene.collection.children):
            raise RuntimeError("UNOWNED_COLLECTION_IN_TASK_SCENE")
    if collection:
        owned(collection)
        if collection.children or any(o.get("mg_owner") != OWNER for o in collection.objects):
            raise RuntimeError("UNOWNED_CONTENT_IN_TASK_COLLECTION")
        for other in bpy.data.scenes:
            if other != scene and collection in tuple(other.collection.children_recursive):
                raise RuntimeError("TASK_COLLECTION_SHARED_WITH_ORIGINAL")
    for obj in bpy.data.objects:
        if obj.get("mg_owner") != OWNER:
            continue
        if any(c != collection for c in obj.users_collection):
            raise RuntimeError("OWNED_OBJECT_LINKED_OUTSIDE_TASK: " + obj.name)
        if obj.data and (obj.data.get("mg_owner") != OWNER or obj.data.users > 1):
            raise RuntimeError("UNOWNED_OR_SHARED_OBJECT_DATA: " + obj.name)
    for mat in bpy.data.materials:
        if mat.get("mg_owner") == OWNER:
            for obj in bpy.data.objects:
                if obj.get("mg_owner") != OWNER and any(s.material == mat for s in obj.material_slots):
                    raise RuntimeError("TASK_MATERIAL_USED_BY_ORIGINAL")
    ledger_path = DESIGN / "owned-artifacts.json"
    expected = [str(p.relative_to(ROOT)) for p in OUTPUTS]
    if ledger_path.exists():
        ledger = json.loads(ledger_path.read_text())
        if ledger.get("owner") != OWNER or ledger.get("outputs") != expected:
            raise RuntimeError("UNOWNED_OUTPUT_MANIFEST")
    elif any(p.exists() for p in OUTPUTS):
        raise RuntimeError("UNOWNED_OUTPUT_COLLISION")
    report_path = DESIGN / "generation-report.json"
    if report_path.exists() and json.loads(report_path.read_text()).get("owner") != OWNER:
        raise RuntimeError("UNOWNED_GENERATION_REPORT")
    # Never follow an output symlink outside the task's declared paths.
    for p in OUTPUTS:
        if p.is_symlink() or p.resolve() != p:
            raise RuntimeError("OUTPUT_PATH_ESCAPE")
    PUBLIC.mkdir(parents=True, exist_ok=True)
    if not ledger_path.exists():
        ledger_path.write_text(json.dumps({"owner": OWNER, "outputs": expected}, indent=2) + "\n")
    return baseline


PALETTE = {
    "Graphite": (0.046, 0.066, 0.072, 1),
    "Ink": (0.017, 0.031, 0.034, 1),
    "Porcelain": (0.80, 0.78, 0.69, 1),
    "Paper": (0.96, 0.93, 0.82, 1),
    "Teal": (0.055, 0.36, 0.31, 1),
    "Mint": (0.28, 0.64, 0.51, 1),
    "Gold": (0.67, 0.40, 0.14, 1),
    "Clay": (0.57, 0.27, 0.18, 1),
    "Mist": (0.36, 0.47, 0.47, 1),
}


def material(key):
    name = "MG_Mat_" + key
    mat = bpy.data.materials.get(name)
    if mat:
        owned(mat)
    else:
        mat = tag(bpy.data.materials.new(name))
    mat.diffuse_color = PALETTE[key]
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next((node for node in nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if bsdf is None:
        raise RuntimeError("OWNED_MATERIAL_STRUCTURE_CHANGED: " + name)
    bsdf.inputs["Base Color"].default_value = PALETTE[key]
    bsdf.inputs["Roughness"].default_value = 0.67 if key != "Gold" else 0.43
    bsdf.inputs["Metallic"].default_value = 0.32 if key == "Gold" else 0.04
    return mat


class Geometry:
    """Build primitive pieces in memory and upload one mesh per material bucket."""
    def __init__(self):
        self.buckets = defaultdict(lambda: {"vertices": [], "faces": [], "smooth": []})

    def piece(self, root, mat, pos, shape="box", size=(1, 1, 1), bevel=0.04, rotation=(0, 0, 0)):
        bm = bmesh.new()
        try:
            if shape == "box":
                bmesh.ops.create_cube(bm, size=1)
                for v in bm.verts:
                    v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
                if bevel:
                    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * 0.44), segments=3, profile=0.5, affect="EDGES")
            elif shape == "cylinder":
                bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=32,
                                      radius1=size[0], radius2=size[1], depth=size[2])
                if bevel:
                    ring_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 0.0001]
                    bmesh.ops.bevel(bm, geom=ring_edges, offset=min(bevel, size[2] * 0.25), segments=3, profile=0.5, affect="EDGES")
            elif shape == "sphere":
                bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1)
                for v in bm.verts:
                    v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            rot = Euler(rotation).to_matrix()
            delta = Vector(pos)
            bucket = self.buckets[(root, mat)]
            bm.verts.ensure_lookup_table()
            bm.verts.index_update()
            offset = len(bucket["vertices"])
            bucket["vertices"].extend(tuple(rot @ v.co + delta) for v in bm.verts)
            for face in bm.faces:
                bucket["faces"].append(tuple(offset + v.index for v in face.verts))
                # Flat broad box faces plus smooth bevels keep the studio crisp.
                bucket["smooth"].append(shape != "box" or max(abs(x) for x in face.normal) < 0.999)
        finally:
            bm.free()

    def box(self, root, mat, pos, size, bevel=0.04, rotation=(0, 0, 0)):
        self.piece(root, mat, pos, size=size, bevel=bevel, rotation=rotation)

    def cylinder(self, root, mat, pos, radius, depth, rotation=(0, 0, 0), bevel=0.025):
        self.piece(root, mat, pos, "cylinder", (radius, radius, depth), bevel, rotation)

    def sphere(self, root, mat, pos, size):
        self.piece(root, mat, pos, "sphere", size, 0)


POSITIONS = {
    "MG_Desk": (0, 0, 0), "MG_Inbox": (-2.5, -1.0, 0.2),
    "MG_Library": (-1.5, 1.3, 0), "MG_Query": (1.2, 0.9, 0),
    "MG_Board": (2.65, 1.58, 0), "MG_Updates": (2.7, -0.9, 0.2),
    "MG_Assistant": (0.1, -1.5, 0.4),
}
CARD_PARENTS = {"MG_CaptureCard": "MG_Inbox", "MG_CitationCard": "MG_Query", "MG_TaskCard": "MG_Board"}
CARD_POSITIONS = {"MG_CaptureCard": (0.02, -0.06, 0.25),
                  "MG_CitationCard": (-0.37, -0.47, 0.48), "MG_TaskCard": (-0.61, -0.108, 1.43)}


def compose():
    g = Geometry()
    # Layered graphite plinth. Main tabletop is exactly 8 x 5 x .3; top z=0.
    r = "MG_Desk"
    g.box(r, "Graphite", (0, 0, -0.15), (8, 5, 0.3), 0.13)
    g.box(r, "Ink", (0, 0, -0.36), (7.72, 4.72, 0.2), 0.09)
    g.box(r, "Teal", (0, -2.405, -0.30), (5.5, 0.025, 0.035), 0.01)
    for x in (-3.3, 3.3):
        for y in (-1.8, 1.8):
            g.cylinder(r, "Ink", (x, y, -0.51), 0.25, 0.16)
    # Architectural back panel kept low and open; left return frames library.
    g.box(r, "Porcelain", (0, 2.32, 1.13), (7.75, 0.16, 2.25), 0.07)
    g.box(r, "Porcelain", (-3.78, 1.44, 0.66), (0.16, 1.8, 1.30), 0.06)
    g.box(r, "Teal", (0, 2.215, 0.12), (7.36, 0.05, 0.12), 0.025)
    # Restrained inlaid routing marks, no arrows or scene text.
    for x in (-1.42, -1.20, -0.98):
        g.box(r, "Mist", (x, -1.01, 0.008), (0.10, 0.025, 0.014), 0.004)
    for x in (0.94, 1.16, 1.38, 1.60):
        g.box(r, "Mist", (x, -1.35, 0.008), (0.10, 0.025, 0.014), 0.004)
    # Inbox: solid open tray, independent layers and independent moving card.
    r = "MG_Inbox"
    g.box(r, "Teal", (0, 0, -0.12), (1.46, 1.13, 0.15), 0.06)
    for x in (-0.68, 0.68):
        g.box(r, "Teal", (x, 0, 0.00), (0.10, 1.13, 0.22), 0.04)
    g.box(r, "Teal", (0, 0.51, 0.01), (1.40, 0.11, 0.24), 0.03)
    g.box(r, "Gold", (0, -0.565, -0.055), (0.42, 0.025, 0.065), 0.016)
    g.box(r, "Paper", (-0.08, 0.03, 0.018), (1.08, 0.80, 0.035), 0.014, (0, 0, -0.055))
    g.box(r, "Porcelain", (0.04, -0.03, 0.065), (1.08, 0.80, 0.035), 0.014, (0, 0, 0.035))
    r = "MG_CaptureCard"
    g.box(r, "Paper", (0, 0, 0), (1.03, 0.76, 0.048), 0.018)
    g.box(r, "Teal", (-0.32, 0.19, 0.029), (0.18, 0.17, 0.016), 0.01)
    for y, width in ((0.19, 0.43), (0.00, 0.71), (-0.13, 0.57)):
        g.box(r, "Mist", (0.04 if y == 0.19 else -0.04, y, 0.029), (width, 0.035, 0.013), 0.005)
    # Library: open cabinet with six varied book spines and two reading leaves.
    r = "MG_Library"
    g.box(r, "Teal", (-0.40, 0.63, 1.02), (2.03, 0.12, 1.94), 0.045)
    for x in (-1.37, 0.57):
        g.box(r, "Porcelain", (x, 0.30, 1.04), (0.13, 0.82, 2.05), 0.04)
    for z in (0.10, 1.05, 2.01):
        g.box(r, "Porcelain", (-0.40, 0.29, z), (2.07, 0.87, 0.12), 0.035)
    for i, (mat, height) in enumerate((("Gold", 0.71), ("Paper", 0.79), ("Teal", 0.66), ("Clay", 0.73), ("Mist", 0.80), ("Paper", 0.67))):
        x = -1.15 + i * 0.27
        g.box(r, mat, (x, 0.25, 1.14 + height / 2), (0.20, 0.53, height), 0.022)
        g.box(r, "Paper" if mat != "Paper" else "Gold", (x, -0.024, 1.34), (0.13, 0.018, 0.075), 0.005)
    for i, mat in enumerate(("Mist", "Paper", "Gold")):
        g.box(r, mat, (-0.79, 0.20, 0.23 + i * 0.16), (0.88 - i * 0.07, 0.58, 0.13), 0.022)
    g.box(r, "Graphite", (0.12, 0.25, 0.49), (0.47, 0.58, 0.64), 0.03)
    g.box(r, "Gold", (0.12, -0.05, 0.53), (0.26, 0.02, 0.065), 0.01)
    # Reading board stands proud in the open space; book crease is geometry.
    g.box(r, "Teal", (-0.40, -0.66, 0.10), (1.66, 0.84, 0.12), 0.055)
    for x, angle in ((-0.82, -0.075), (0.02, 0.075)):
        g.box(r, "Paper", (x, -0.65, 0.19), (0.79, 0.76, 0.045), 0.012, (0.13, angle, 0))
        for y in (-0.42, -0.56, -0.70, -0.84):
            g.box(r, "Mist", (x, y, 0.231 + (y + 0.65) * 0.13), (0.53, 0.025, 0.010), 0.002)
    # Query terminal: tall warm shell, inset dark screen with source-linked UI.
    r = "MG_Query"
    g.box(r, "Porcelain", (-0.32, -0.08, 0.10), (1.20, 0.71, 0.15), 0.06)
    g.box(r, "Graphite", (-0.32, 0.12, 0.54), (0.15, 0.17, 0.79), 0.04)
    g.box(r, "Porcelain", (-0.32, 0.08, 1.34), (1.83, 0.22, 1.22), 0.085)
    g.box(r, "Ink", (-0.32, -0.039, 1.36), (1.65, 0.035, 1.02), 0.047)
    g.box(r, "Teal", (-0.32, -0.062, 1.66), (1.41, 0.026, 0.21), 0.03)
    for z, width in ((1.41, 1.16), (1.28, 0.94), (1.15, 1.06)):
        g.box(r, "Mist", (-0.43, -0.069, z), (width, 0.015, 0.036), 0.007)
    for x in (-0.88, -0.69, -0.50):
        g.box(r, "Mint", (x, -0.071, 0.99), (0.12, 0.02, 0.07), 0.013)
    # Low compact keyboard reads as a tool rather than a second text panel.
    g.box(r, "Mist", (-0.32, -0.58, 0.12), (1.30, 0.35, 0.075), 0.025)
    for row in range(3):
        for col in range(10):
            g.box(r, "Porcelain", (-0.84 + col * 0.116, -0.68 + row * 0.10, 0.166), (0.075, 0.055, 0.018), 0.004)
    for x, z in ((-0.89, 0.36), (0.28, 0.36)):
        g.box(r, "Paper", (x, -0.44, z), (0.40, 0.065, 0.32), 0.02)
        g.box(r, "Gold", (x - 0.10, -0.48, z + 0.07), (0.08, 0.016, 0.08), 0.007)
    r = "MG_CitationCard"
    g.box(r, "Paper", (0, 0, 0), (0.49, 0.075, 0.37), 0.025)
    g.box(r, "Teal", (-0.14, -0.045, 0.075), (0.10, 0.02, 0.10), 0.015)
    for x, width, z in ((0.055, 0.19, 0.075), (0, 0.34, -0.06)):
        g.box(r, "Mist", (x, -0.046, z), (width, 0.017, 0.023), 0.004)
    # Four-column action board stands behind the compact updates screen.
    r = "MG_Board"
    g.box(r, "Graphite", (0, 0, 1.13), (1.70, 0.16, 1.68), 0.06)
    g.box(r, "Porcelain", (0, -0.088, 1.16), (1.54, 0.025, 1.43), 0.022)
    for i, mat in enumerate(("Mist", "Gold", "Clay", "Teal")):
        x = -0.585 + i * 0.39
        g.box(r, mat, (x, -0.108, 1.72), (0.32, 0.028, 0.12), 0.015)
        g.box(r, mat, (x, -0.108, 0.95), (0.015, 0.022, 1.15), 0.005)
        if i:
            for j in range(1 if i == 2 else 2):
                g.box(r, "Paper", (x, -0.129, 1.40 - j * 0.34), (0.28, 0.045, 0.24), 0.015)
                g.box(r, mat, (x - 0.068, -0.156, 1.45 - j * 0.34), (0.075, 0.012, 0.028), 0.003)
    for x in (-0.58, 0.58):
        g.box(r, "Graphite", (x, 0.025, 0.22), (0.09, 0.10, 0.44), 0.02)
        g.box(r, "Graphite", (x, 0.025, 0.04), (0.28, 0.48, 0.07), 0.02)
    r = "MG_TaskCard"
    g.box(r, "Paper", (0, -0.03, 0), (0.28, 0.06, 0.27), 0.018)
    g.box(r, "Teal", (-0.06, -0.068, 0.055), (0.07, 0.014, 0.045), 0.006)
    g.box(r, "Mist", (0, -0.068, -0.055), (0.17, 0.014, 0.025), 0.004)
    # Small notification station, visually subordinate to sources and query.
    r = "MG_Updates"
    g.box(r, "Teal", (0, 0, -0.12), (0.95, 0.65, 0.15), 0.05)
    g.box(r, "Graphite", (0, 0.06, 0.23), (0.12, 0.16, 0.51), 0.03)
    g.box(r, "Porcelain", (0, 0, 0.65), (0.83, 0.16, 0.90), 0.07)
    g.box(r, "Ink", (0, -0.092, 0.66), (0.68, 0.03, 0.70), 0.036)
    for i in range(3):
        z = 0.88 - i * 0.20
        g.box(r, "Mint" if i == 0 else "Mist", (-0.20, -0.116, z), (0.09, 0.016, 0.09), 0.014)
        g.box(r, "Paper", (0.06, -0.116, z), (0.30, 0.016, 0.026), 0.005)
    # Friendly rigid helper: floating rounded shell, dark face, two teal eyes.
    r = "MG_Assistant"
    g.cylinder(r, "Graphite", (0, 0, -0.32), 0.52, 0.14)
    g.cylinder(r, "Teal", (0, 0, -0.236), 0.39, 0.035, bevel=0.006)
    g.box(r, "Porcelain", (0, 0, 0.04), (0.60, 0.46, 0.55), 0.13)
    g.box(r, "Paper", (0, -0.015, 0.51), (0.83, 0.57, 0.60), 0.14)
    g.box(r, "Ink", (0, -0.309, 0.53), (0.64, 0.033, 0.34), 0.105)
    for x in (-0.15, 0.15):
        g.box(r, "Mint", (x, -0.333, 0.56), (0.072, 0.023, 0.105), 0.025)
    g.box(r, "Teal", (0, -0.246, 0.05), (0.21, 0.027, 0.06), 0.015)
    for x in (-0.41, 0.41):
        g.sphere(r, "Porcelain", (x, -0.02, 0.07), (0.14, 0.15, 0.23))
    g.cylinder(r, "Gold", (0.18, 0.02, 0.91), 0.025, 0.18, bevel=0.006)
    g.sphere(r, "Teal", (0.18, 0.02, 1.01), (0.07, 0.07, 0.07))
    return g


def object_for(name, collection, kind="EMPTY"):
    obj = bpy.data.objects.get(name)
    if obj:
        owned(obj)
        if obj.type != kind:
            raise RuntimeError("OWNED_OBJECT_TYPE_CHANGED: " + name)
        return obj
    if kind == "EMPTY":
        data = None
    else:
        groups = {"MESH": bpy.data.meshes, "CAMERA": bpy.data.cameras, "LIGHT": bpy.data.lights}
        data_name = name + "_Data"
        if groups[kind].get(data_name):
            raise RuntimeError("ORPHAN_DATA_COLLISION: " + data_name)
        data = tag(groups[kind].new(data_name, "AREA") if kind == "LIGHT" else groups[kind].new(data_name))
    obj = tag(bpy.data.objects.new(name, data))
    collection.objects.link(obj)
    return obj


def build_scene(g):
    scene = bpy.data.scenes.get(NAME)
    if not scene:
        scene = tag(bpy.data.scenes.new(NAME))
    collection = bpy.data.collections.get(NAME)
    if not collection:
        collection = tag(bpy.data.collections.new(NAME))
        scene.collection.children.link(collection)
    for root in ROOTS:
        obj = object_for(root, collection)
        obj.location = POSITIONS[root]
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
        obj.parent = None
        obj.empty_display_size = 0.15
    for card in ANIMATIONS:
        obj = object_for(card, collection)
        obj.parent = bpy.data.objects[CARD_PARENTS[card]]
        obj.location = CARD_POSITIONS[card]
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
        obj.empty_display_size = 0.10
    mats = {key: material(key) for key in PALETTE}
    for (root, key), bucket in sorted(g.buckets.items()):
        obj = object_for(root + "_" + key, collection, "MESH")
        mesh = owned(obj.data)
        mesh.clear_geometry()
        mesh.from_pydata(bucket["vertices"], [], bucket["faces"])
        mesh.materials.clear()
        mesh.materials.append(mats[key])
        for polygon, smooth in zip(mesh.polygons, bucket["smooth"]):
            polygon.use_smooth = smooth
        mesh.update()
        obj.parent = bpy.data.objects[root]
        obj.location = (0, 0, 0)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
        obj.hide_render = False
    expected_meshes = {root + "_" + key for root, key in g.buckets}
    actual_meshes = {o.name for o in scene.objects if o.type == "MESH"}
    if expected_meshes != actual_meshes:
        raise RuntimeError("OWNED_SCENE_HAS_UNEXPECTED_MESHES")
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    world = bpy.data.worlds.get("MG_World")
    if world:
        owned(world)
    else:
        world = tag(bpy.data.worlds.new("MG_World"))
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.bl_idname == "ShaderNodeBackground")
    background.inputs["Color"].default_value = (0.74, 0.78, 0.75, 1)
    background.inputs["Strength"].default_value = 0.32
    scene.world = world
    for name, pos, power, size, color in (
        ("MG_Key", (-3.8, -4.5, 8), 1250, 7.0, (1, 0.89, 0.74)),
        ("MG_Fill", (4.5, -0.5, 5.5), 850, 5.0, (0.70, 0.89, 1)),
        ("MG_Rim", (0.0, 5.0, 7), 1150, 4.0, (0.86, 1, 0.92)),
    ):
        lamp = object_for(name, collection, "LIGHT")
        lamp.location = pos
        lamp.rotation_euler = (Vector((0, 0, 0.7)) - lamp.location).to_track_quat("-Z", "Y").to_euler()
        lamp.data.energy = power
        lamp.data.shape = "DISK"
        lamp.data.size = size
        lamp.data.color = color
    camera = object_for("MG_Overview", collection, "CAMERA")
    camera.data.type = "ORTHO"
    camera.data.lens = 50
    camera.data.clip_start = 0.1
    camera.data.clip_end = 100
    camera.location = (9.6, -14.5, 11.8)
    camera.rotation_euler = (Vector((0, 0, 0.95)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = 12.2
    scene.camera = camera
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 86
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.use_file_extension = True
    return scene, collection


def counts(scene):
    meshes = [o for o in scene.objects if o.type == "MESH"]
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    return {"objects": len(scene.objects), "meshes": len(meshes), "triangles": triangles,
            "materialDrawCallsUpperBound": sum(len(o.data.materials) for o in meshes),
            "objectNames": sorted(o.name for o in scene.objects),
            "rootNodes": list(ROOTS), "animationNodes": list(ANIMATIONS)}


def render_poster(scene, path, width, height):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    # Ortho scale is horizontal at landscape and vertical at portrait; keep the
    # complete desktop silhouette, including back panel, inside both posters.
    scene.camera.data.ortho_scale = 12.2 if width > height else 12.8
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    for quality in (82, 76, 68, 58):
        if path.stat().st_size <= 250 * 1024:
            break
        scene.render.image_settings.quality = quality
        bpy.data.images["Render Result"].save_render(str(path), scene=scene)
    if path.stat().st_size > 250 * 1024:
        raise RuntimeError("POSTER_BUDGET: " + path.name)
    return {"path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size,
            "width": width, "height": height, "quality": scene.render.image_settings.quality}


def main():
    before = validate_before_mutation()
    geometry = compose()
    if len(geometry.buckets) > 65:
        raise RuntimeError("MESH_BUDGET_BEFORE_SCENE_WRITE")
    scene, collection = build_scene(geometry)
    metrics = counts(scene)
    if metrics["triangles"] > 60000 or metrics["materialDrawCallsUpperBound"] > 80:
        raise RuntimeError("GEOMETRY_BUDGET")
    if AUDIT["snapshot"]() != before:
        raise RuntimeError("ORIGINAL_CHANGED_DURING_BUILD")
    # Switching to our scene does not deselect or modify original scene objects.
    bpy.context.window.scene = scene
    view_layer = scene.view_layers[0]
    view_layer.update()
    for obj in scene.objects:
        obj.select_set(obj.type in {"MESH", "EMPTY"}, view_layer=view_layer)
    view_layer.objects.active = bpy.data.objects["MG_Desk"]
    export_args = {"filepath": str(PUBLIC / "workbench.glb"), "export_format": "GLB",
                   "use_selection": True, "use_active_scene": True, "use_renderable": True,
                   "export_extras": False, "export_animations": False, "export_cameras": False,
                   "export_lights": False, "export_yup": True, "export_apply": False,
                   "export_texcoords": False, "export_normals": True, "export_materials": "EXPORT",
                   "export_skins": False, "export_morph": False, "export_attributes": False,
                   "export_vertex_color": "NONE", "export_unused_images": False,
                   "export_unused_textures": False, "export_draco_mesh_compression_enable": False,
                   "will_save_settings": False}
    with bpy.context.temp_override(scene=scene, view_layer=view_layer):
        bpy.ops.export_scene.gltf(**export_args)
    if (PUBLIC / "workbench.glb").stat().st_size > 2 * 1024 * 1024:
        raise RuntimeError("GLB_BYTE_BUDGET")
    posters = []
    for filename, width, height in (("poster-desktop.webp", 1600, 1000), ("poster-mobile.webp", 900, 1100)):
        scene.render.image_settings.quality = 86
        with bpy.context.temp_override(scene=scene, view_layer=view_layer):
            posters.append(render_poster(scene, PUBLIC / filename, width, height))
    # Save a clean task-only library with relative render output, no private path.
    scene.render.filepath = "//poster-desktop.webp"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.camera.data.ortho_scale = 12.2
    bpy.data.libraries.write(str(DESIGN / "workbench.blend"), {scene}, fake_user=True, compress=True)
    library_inventory = inspect_library()
    after = AUDIT["snapshot"]()
    if after != before:
        raise RuntimeError("ORIGINAL_CHANGED_AFTER_EXPORT")
    baseline = json.loads((DESIGN / "original-scene-snapshot.json").read_text())
    if after != baseline["snapshot"]:
        raise RuntimeError("ORIGINAL_BASELINE_MISMATCH")
    report_path = DESIGN / "generation-report.json"
    previous = json.loads(report_path.read_text()) if report_path.exists() else None
    if previous and previous.get("owner") != OWNER:
        raise RuntimeError("UNOWNED_GENERATION_REPORT")
    run = (previous["run"] + 1) if previous else 1
    if previous and previous["metrics"]["objectNames"] != metrics["objectNames"]:
        raise RuntimeError("IDEMPOTENCY_OBJECT_NAMES_CHANGED")
    report = {"owner": OWNER, "run": run, "blenderVersion": bpy.app.version_string,
              "priorRuns": (previous.get("priorRuns", []) + [{"run": previous["run"],
                            "scriptSha256": previous["scriptSha256"], "objects": previous["metrics"]["objects"],
                            "meshes": previous["metrics"]["meshes"], "triangles": previous["metrics"]["triangles"],
                            "preservation": previous["preservation"], "outputs": previous["outputs"]}]) if previous else [],
              "source": "Original procedural local Blender geometry; no licensed assets, external services, text, or textures.",
              "script": "scripts/blender/workbench-landing.py",
              "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "scene": NAME, "metrics": metrics, "posters": posters,
              "scopedBlendInventory": library_inventory,
              "exportSettings": {k: v for k, v in export_args.items() if k != "filepath"},
              "preservation": {"exact": True, "beforeSha256": AUDIT["digest"](before),
                               "afterSha256": AUDIT["digest"](after), "baselineSha256": baseline["sha256"]},
              "idempotency": {"previousRun": previous["run"] if previous else None,
                              "sameObjectNames": previous["metrics"]["objectNames"] == metrics["objectNames"] if previous else None,
                              "previousObjects": previous["metrics"]["objects"] if previous else None},
              "outputs": [{"path": str(p.relative_to(ROOT)), "bytes": p.stat().st_size,
                           "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in OUTPUTS]}
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    # A bounded camera viewport makes the subsequent real MCP screenshot useful.
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"
            area.spaces.active.overlay.show_overlays = False
            area.spaces.active.shading.type = "MATERIAL"
    print(json.dumps({"run": run, "metrics": metrics, "posters": posters,
                      "preservation": report["preservation"], "idempotency": report["idempotency"]}))


def inspect_library():
    """Read-only source-library inventory and API diagnosis; loads no datablocks."""
    with bpy.data.libraries.load(str(DESIGN / "workbench.blend")) as (source, target):
        inventory = {key: list(getattr(source, key)) for key in ("scenes", "objects", "meshes", "materials", "worlds", "images", "texts")}
    if inventory["scenes"] != [NAME] or any(not n.startswith("MG_") for key in ("objects", "meshes", "materials", "worlds") for n in inventory[key]):
        raise RuntimeError("SCOPED_BLEND_INVENTORY_FAILURE")
    if inventory["images"] or inventory["texts"]:
        raise RuntimeError("UNEXPECTED_BLEND_IMAGE_OR_TEXT")
    return inventory


if __name__ == "__main__":
    main()
