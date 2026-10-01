"""Blender integration regression: actual transformed, multipart, colored GLB -> three LODs.

blender --background --factory-startup --python-exit-code 1 --python scripts/test-optimize-character.py
The temporary fixture is generated here, no licensed or AI asset is required.
"""
import importlib.util
import json
import math
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

spec = importlib.util.spec_from_file_location("pipeline", Path(__file__).with_name("optimize-character.py"))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


with tempfile.TemporaryDirectory(prefix="pillagers-lods-") as folder:
    directory = Path(folder)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, location=(1.2, -0.7, 2.4))
    body = bpy.context.object
    body.scale = (0.65, 0.45, 0.9)
    body.rotation_euler.z = 0.3
    red = bpy.data.materials.new("red")
    red.use_nodes = True
    red.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.8, 0.04, 0.02, 1)
    body.data.materials.append(red)
    bpy.ops.mesh.primitive_cube_add(location=(2.1, -0.7, 2.4), scale=(0.7, 0.08, 0.12))
    sword = bpy.context.object
    blue = bpy.data.materials.new("blue")
    blue.use_nodes = True
    blue.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.02, 0.1, 0.8, 1)
    sword.data.materials.append(blue)
    # Multiple objects, transforms and materials exercise joining and world-space baking.
    bpy.ops.object.select_all(action="SELECT")
    source = directory / "fixture.glb"
    bpy.ops.export_scene.gltf(filepath=str(source), export_format="GLB", use_selection=True)
    before = pipeline.glb_stats(source)
    args = pipeline.arguments([str(source), str(directory / "lods"), "--name", "fixture",
                               "--targets", "800", "400", "200", "--textures", "128", "128", "128", "--voxel", "0.006"])
    report = pipeline.main(args)
    check(pipeline.glb_stats(source)["sha256"] == before["sha256"], "Source was changed")
    check(before["objects"] == 2 and before["materials"] == 2, "Fixture must be multipart")
    check(len(report["lods"]) == 3, "Three LODs required")
    reference = report["source"]["boundsBlender"]
    span = max(reference["max"][i] - reference["min"][i] for i in range(3))
    for lod in report["lods"]:
        check(0 < lod["triangles"] <= lod["target"] * 1.1, "Budget not reached")
        check(lod["materials"] == lod["textures"] == lod["objects"] == 1, "Export must have one mesh, material and texture")
        check(lod["bytes"] < before["bytes"], "Fixture LOD should be smaller than source")
        for limit in ["min", "max"]:
            check(max(abs(lod["boundsBlender"][limit][i] - reference[limit][i]) for i in range(3)) < span * 0.08,
                  "Scale/orientation/silhouette bounds drifted")
        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=str(args.output / lod["file"]))
        obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
        obj.data.calc_loop_triangles()
        check(len(obj.data.loop_triangles) == lod["triangles"], "Report differs from reimported GLB")
        check(all(math.isfinite(c) for v in obj.data.vertices for c in v.co), "Non-finite coordinates")
        check(len(obj.data.uv_layers) == 1, "Missing baked UVs")
        images = [n.image for m in obj.data.materials for n in m.node_tree.nodes if n.type == "TEX_IMAGE"]
        check(len(images) == 1 and list(images[0].size) == [128, 128], "Wrong baked image")
        pixels = list(images[0].pixels)
        check(max(pixels[0::4]) > 0.5 and max(pixels[2::4]) > 0.5, "Color bake lost red or blue source material")
        # Bounds independently measured after GLB round trip in world space.
        points = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        check(max(abs(min(p[i] for p in points) - lod["boundsBlender"]["min"][i]) for i in range(3)) < 1e-5, "GLB transform changed")
    try:
        pipeline.arguments([str(source), str(args.output)])
    except SystemExit as error:
        check(error.code != 0, "Existing outputs should be rejected")
    else:
        raise AssertionError("Existing output directory was accepted")
    print("PIPELINE_TEST::PASS multipart colors, budgets, transform round trip, source preservation, overwrite guard", flush=True)
