"""Read-only Blender data audit; local evidence, never a public asset.

Executed only through scripts/blender-mcp-client.mjs. Captures all unowned
scenes and data without changing selection, context, transforms or properties.
"""
import bpy
import hashlib
import json
from pathlib import Path

OWNER = "memory-garden-landing-v1"
NAME = "MG_Workbench_Landing"
ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "design/workbench-landing"
ROOTS = ("MG_Desk", "MG_Inbox", "MG_Library", "MG_Query", "MG_Board", "MG_Updates", "MG_Assistant")
ANIMATIONS = ("MG_CaptureCard", "MG_CitationCard", "MG_TaskCard")


def scalar(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bpy.types.ID):
        return {"id": value.name_full, "type": value.bl_rna.identifier}
    try:
        return [scalar(v) for v in value]
    except TypeError:
        return str(value)


def properties(block):
    return {key: scalar(block[key]) for key in sorted(block.keys())}


def rna(block):
    result = {}
    for prop in block.bl_rna.properties:
        if prop.identifier == "rna_type" or prop.type in {"COLLECTION", "POINTER"}:
            continue
        try:
            result[prop.identifier] = scalar(getattr(block, prop.identifier))
        except (AttributeError, TypeError, RuntimeError):
            pass
    return result


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def material_state(mat):
    result = {"rna": rna(mat), "properties": properties(mat)}
    if mat.node_tree:
        result["nodes"] = [{"name": n.name, "type": n.bl_idname, "rna": rna(n),
                            "inputs": {s.identifier: scalar(s.default_value) for s in n.inputs if hasattr(s, "default_value")}}
                           for n in mat.node_tree.nodes]
        result["links"] = sorted([l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier] for l in mat.node_tree.links)
    return result


def snapshot():
    objects = {}
    for obj in sorted(bpy.data.objects, key=lambda x: x.name):
        if obj.get("mg_owner") == OWNER:
            continue
        state = {"type": obj.type, "rna": rna(obj), "properties": properties(obj),
                 "matrix_world": scalar(obj.matrix_world), "matrix_local": scalar(obj.matrix_local),
                 "parent": obj.parent.name if obj.parent else None,
                 "collections": sorted(c.name for c in obj.users_collection),
                 "materials": [s.material.name if s.material else None for s in obj.material_slots],
                 "modifiers": [rna(m) for m in obj.modifiers],
                 "constraints": [rna(c) for c in obj.constraints],
                 "data": obj.data.name if obj.data else None}
        if obj.type == "MESH":
            state["geometrySha256"] = digest({"v": [scalar(v.co) for v in obj.data.vertices],
                                               "e": [scalar(e.vertices) for e in obj.data.edges],
                                               "p": [(scalar(p.vertices), p.material_index, p.use_smooth) for p in obj.data.polygons]})
        elif obj.data:
            state["dataRNA"] = rna(obj.data)
        objects[obj.name] = state
    scenes = {}
    for scene in sorted(bpy.data.scenes, key=lambda x: x.name):
        if scene.get("mg_owner") == OWNER:
            continue
        scenes[scene.name] = {"objects": sorted(o.name for o in scene.objects), "properties": properties(scene),
                              "camera": scene.camera.name if scene.camera else None,
                              "world": scene.world.name if scene.world else None,
                              "render": rna(scene.render), "frame": scene.frame_current,
                              "collections": sorted(c.name for c in scene.collection.children)}
    return {"filepath": bpy.data.filepath, "scenes": scenes, "objects": objects,
            "materials": {m.name: material_state(m) for m in bpy.data.materials if m.get("mg_owner") != OWNER},
            "worlds": {w.name: material_state(w) for w in bpy.data.worlds if w.get("mg_owner") != OWNER},
            "collections": {c.name: {"objects": sorted(o.name for o in c.objects), "children": sorted(x.name for x in c.children), "properties": properties(c)}
                            for c in bpy.data.collections if c.get("mg_owner") != OWNER}}


def collisions():
    for blocks, names in ((bpy.data.scenes, (NAME,)), (bpy.data.collections, (NAME,)),
                          (bpy.data.objects, ROOTS + ANIMATIONS)):
        for name in names:
            block = blocks.get(name)
            if block is not None and block.get("mg_owner") != OWNER:
                raise RuntimeError("UNOWNED_NAME_COLLISION: " + name)
    for group in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for block in group:
            if block.name.startswith("MG_") and block.get("mg_owner") != OWNER:
                raise RuntimeError("UNOWNED_PREFIX_COLLISION: " + block.name)


def audit():
    collisions()
    current = snapshot()
    path = EVIDENCE / "original-scene-snapshot.json"
    if path.exists():
        previous = json.loads(path.read_text())
        if previous.get("owner") != OWNER or previous.get("snapshot") != current:
            def differences(a, b, path=""):
                if isinstance(a, dict) and isinstance(b, dict):
                    return sum((differences(a.get(k), b.get(k), path + "/" + k) for k in sorted(set(a) | set(b))), [])
                if a != b:
                    return [{"path": path, "before": a, "after": b}]
                return []
            raise RuntimeError("ORIGINAL_SCENE_CHANGED: " + json.dumps(differences(previous.get("snapshot"), current)))
    else:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"owner": OWNER, "sha256": digest(current), "snapshot": current}, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"ownershipCollisions": False, "originalSha256": digest(current),
                      "originalScenes": list(current["scenes"]), "originalObjects": list(current["objects"]),
                      "blenderVersion": bpy.app.version_string, "snapshotExact": True}))
    return current


if __name__ == "__main__":
    audit()
