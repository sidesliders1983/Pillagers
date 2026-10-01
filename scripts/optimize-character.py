"""Pillagers static character pipeline. Run with Blender --background --factory-startup.

Arguments follow Blender's -- separator. Never modifies the input or overwrites outputs.
Color is baked from the source, independently for each LOD. No GPU or paid service needed.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
import time
from pathlib import Path


def arguments(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--name", default="character")
    parser.add_argument("--targets", type=int, nargs=3, default=[8000, 4000, 1200])
    parser.add_argument("--textures", type=int, nargs=3, default=[1024, 512, 256])
    parser.add_argument("--voxel", type=float, default=0.0035, help="Fraction of largest dimension; 0 disables remesh for comparison")
    parser.add_argument("--planar-angle", type=float, default=6)
    args = parser.parse_args(argv)
    if not args.source.is_file() or args.source.suffix.lower() != ".glb":
        parser.error("source must be an existing GLB")
    if not args.name or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for c in args.name):
        parser.error("name must contain only letters, numbers, _ or -")
    if not (100 <= args.targets[2] < args.targets[1] < args.targets[0]):
        parser.error("targets must be decreasing and at least 100 triangles")
    if any(t not in [128, 256, 512, 1024, 2048] for t in args.textures):
        parser.error("texture sizes must be 128, 256, 512, 1024 or 2048")
    if not (args.voxel == 0 or 0.001 <= args.voxel <= 0.02) or not 0 <= args.planar_angle <= 30:
        parser.error("voxel must be 0 or 0.001..0.02; planar angle must be 0..30")
    args.source = args.source.resolve()
    args.output = args.output.resolve()
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("output directory must be empty; use a new run directory")
    return args


def glb_stats(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError("Invalid GLB header")
    size, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise ValueError("Missing GLB JSON")
    doc = json.loads(data[20:20 + size])
    triangles = vertices = primitives = 0
    for mesh in doc.get("meshes", []):
        for primitive in mesh["primitives"]:
            if primitive.get("mode", 4) != 4:
                raise ValueError("Only triangle meshes are supported")
            count = doc["accessors"][primitive["attributes"]["POSITION"]]["count"]
            vertices += count
            triangles += (doc["accessors"][primitive["indices"]]["count"] if "indices" in primitive else count) // 3
            primitives += 1
    if doc.get("skins") or doc.get("animations") or any(p.get("targets") for m in doc.get("meshes", []) for p in m["primitives"]):
        raise ValueError("Static meshes only: rigging, animations and morph targets would be lost")
    return {"vertices": vertices, "triangles": triangles, "materials": len(doc.get("materials", [])),
            "textures": len(doc.get("images", [])), "objects": sum("mesh" in n for n in doc.get("nodes", [])),
            "primitives": primitives, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main(args):
    import bpy
    import bmesh
    from mathutils import Vector

    started = time.time()
    baseline = glb_stats(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"schemaVersion": 1, "source": {"file": args.source.name, **baseline},
              "blender": bpy.app.version_string, "settings": {"voxelFraction": args.voxel,
              "planarAngleDegrees": args.planar_angle, "targets": args.targets, "textureSizes": args.textures},
              "stages": [], "lods": []}

    def stage(label, obj):
        obj.data.calc_loop_triangles()
        info = {"stage": label, "vertices": len(obj.data.vertices), "triangles": len(obj.data.loop_triangles)}
        report["stages"].append(info)
        print("PIPELINE::" + json.dumps(info), flush=True)

    def activate(obj):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

    def bounds(obj):
        points = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        return {"min": [min(p[i] for p in points) for i in range(3)], "max": [max(p[i] for p in points) for i in range(3)]}

    def copy(obj, name):
        clone = obj.copy()
        clone.data = obj.data.copy()
        clone.name = name
        bpy.context.scene.collection.objects.link(clone)
        return clone

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(args.source))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise ValueError("No mesh objects")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    source = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    report["source"]["boundsBlender"] = bounds(source)
    span = max(source.dimensions)
    if span <= 0:
        raise ValueError("Source has no volume")

    # Keep the original's UVs/materials intact for baking. Weld the processing copy.
    clean = copy(source, "clean")
    activate(clean)
    bm = bmesh.new()
    bm.from_mesh(clean.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=span * 1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=span * 1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(clean.data)
    bm.free()
    stage("cleanup", clean)
    clean.data.materials.clear()
    if args.voxel:
        clean.data.remesh_voxel_size = span * args.voxel
        clean.data.remesh_voxel_adaptivity = 0
        bpy.ops.object.voxel_remesh()
        stage("voxel-remesh", clean)
    if args.planar_angle:
        modifier = clean.modifiers.new("Planar planes", "DECIMATE")
        modifier.decimate_type = "DISSOLVE"
        modifier.angle_limit = math.radians(args.planar_angle)
        modifier.use_dissolve_boundaries = False
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        stage("planar", clean)
    clean.hide_render = True

    # Bake albedo only, not lighting, metallic maps or normal-map micro-detail.
    for material in source.data.materials:
        if not material:
            continue
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            raise ValueError("Expected glTF Principled material")
        color = bsdf.inputs["Base Color"]
        upstream = color.links[0].from_socket if color.is_linked else None
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value = color.default_value
        if upstream:
            links.new(upstream, emission.inputs["Color"])
        output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
        links.new(emission.outputs[0], output.inputs["Surface"])

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.margin = 4
    scene.render.bake.cage_extrusion = span * max(args.voxel * 2, 0.008)
    scene.render.bake.max_ray_distance = span * max(args.voxel * 6, 0.035)
    for index, (target, resolution) in enumerate(zip(args.targets, args.textures)):
        lod_start = time.time()
        name = "%s_LOD%d" % (args.name, index)
        lod = copy(clean, name)
        lod.hide_render = False
        activate(lod)
        # Limited passes after cleanup/remesh/planar simplification, never a blind 0.005.
        for iteration in range(12):
            lod.data.calc_loop_triangles()
            count = len(lod.data.loop_triangles)
            if count <= target * 1.01:
                break
            modifier = lod.modifiers.new("Budget pass", "DECIMATE")
            modifier.ratio = max(0.35, target / count)
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        lod.data.validate(clean_customdata=True)
        lod.data.update()
        stage(name, lod)
        if not 0 < len(lod.data.loop_triangles) <= target * 1.1:
            raise ValueError("Could not reach triangle budget for " + name)
        for polygon in lod.data.polygons:
            polygon.use_smooth = False
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.015)
        bpy.ops.object.mode_set(mode="OBJECT")
        image = bpy.data.images.new(name + "_albedo", width=resolution, height=resolution, alpha=False)
        material = bpy.data.materials.new(name + "_mat")
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        nodes.active = tex
        lod.data.materials.clear()
        lod.data.materials.append(material)
        source.hide_render = False
        activate(lod)
        source.select_set(True)
        print("PIPELINE::bake " + name, flush=True)
        bpy.ops.object.bake(type="EMIT")
        source.hide_render = True
        bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Metallic"].default_value = 0
        bsdf.inputs["Roughness"].default_value = 1
        destination = args.output / (name + ".glb")
        activate(lod)
        bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", use_selection=True,
                                  export_image_format="JPEG", export_animations=False, export_cameras=False,
                                  export_lights=False, export_extras=False)
        info = {"label": "LOD%d" % index, "file": destination.name, "target": target,
                "textureSize": resolution, "boundsBlender": bounds(lod), **glb_stats(destination)}
        info["reductionPercent"] = 100 * (1 - info["triangles"] / baseline["triangles"])
        info["seconds"] = round(time.time() - lod_start, 2)
        report["lods"].append(info)
        bpy.data.objects.remove(lod, do_unlink=True)
    report["seconds"] = round(time.time() - started, 2)
    provenance = args.source.with_suffix(".provenance.json")
    if provenance.is_file():
        report["sourceProvenance"] = json.loads(provenance.read_text(encoding="utf-8-sig"))
    report_path = args.output / (args.name + "_report.json")
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("PIPELINE::DONE " + str(report_path), flush=True)
    return report


if __name__ == "__main__":
    try:
        main(arguments(sys.argv[sys.argv.index("--") + 1:]))
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
