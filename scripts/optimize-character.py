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
    parser.add_argument("--lod", type=int, choices=[0, 1, 2], help="Process only this LOD; retain its original label and budget")
    parser.add_argument("--voxel", type=float, default=0.0035, help="Fraction of largest dimension; 0 disables remesh for comparison")
    parser.add_argument("--planar-angle", type=float, default=6)
    parser.add_argument("--weld-fraction", type=float, default=1e-6, help="Merge coincident source samples within this fraction of its span")
    parser.add_argument("--minimum-island-area", type=float, default=0, help="Discard floating extraction specks smaller than this fraction of span squared")
    parser.add_argument("--colour-transfer", choices=['ray','closest'], default='ray', help="Closest surface transfer avoids black ray misses on thin garments")
    args = parser.parse_args(argv)
    if not 0 < args.weld_fraction <= .001:
        parser.error("weld fraction must be in (0, .001]")
    if not 0 <= args.minimum_island_area <= .001:
        parser.error("minimum island area must be in [0, .001]")
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
              "planarAngleDegrees": args.planar_angle, "targets": args.targets, "textureSizes": args.textures,
              "weldFraction": args.weld_fraction,
              "minimumIslandArea": args.minimum_island_area,
              "colourTransfer": args.colour_transfer,
              "selectedLOD": args.lod},
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
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=span * args.weld_fraction)
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
    if args.minimum_island_area:
        bm = bmesh.new()
        bm.from_mesh(clean.data)
        unseen = set(bm.faces)
        removed = []
        while unseen:
            first = unseen.pop()
            component, pending = [first], [first]
            while pending:
                face = pending.pop()
                for edge in face.edges:
                    for neighbour in edge.link_faces:
                        if neighbour in unseen:
                            unseen.remove(neighbour)
                            component.append(neighbour)
                            pending.append(neighbour)
            if sum(face.calc_area() for face in component) < span * span * args.minimum_island_area:
                removed.extend(component)
        bmesh.ops.delete(bm, geom=removed, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(clean.data)
        bm.free()
        stage("remove-extraction-specks", clean)
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
    closest = None
    if args.colour_transfer == 'closest':
        from array import array
        from mathutils.bvhtree import BVHTree
        source.data.calc_loop_triangles()
        triangles = list(source.data.loop_triangles)
        closest = BVHTree.FromPolygons([v.co for v in source.data.vertices], [t.vertices for t in triangles], all_triangles=True)
        originals = {}
        for i,mat in enumerate(source.data.materials):
            node = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
            colours = array('f', [0]) * len(node.image.pixels)
            node.image.pixels.foreach_get(colours)
            originals[i] = (tuple(node.image.size), colours, node.image.channels)
        original_uv = source.data.uv_layers.active.data

        def transfer(target, image, resolution):
            pixels = array('f', [0]) * (resolution * resolution * 4)
            valid = bytearray(resolution * resolution)
            target.data.calc_loop_triangles()
            uv = target.data.uv_layers.active.data
            for tri in target.data.loop_triangles:
                coords = [uv[i].uv * resolution for i in tri.loops]
                pa,pb,pc = coords
                denominator = (pb.y-pc.y)*(pa.x-pc.x)+(pc.x-pb.x)*(pa.y-pc.y)
                if abs(denominator)<1e-9:continue
                vertices = [target.data.vertices[i].co for i in tri.vertices]
                for y in range(max(0,int(min(p.y for p in coords))),min(resolution,int(max(p.y for p in coords))+1)):
                    for x in range(max(0,int(min(p.x for p in coords))),min(resolution,int(max(p.x for p in coords))+1)):
                        u=((pb.y-pc.y)*(x+.5-pc.x)+(pc.x-pb.x)*(y+.5-pc.y))/denominator
                        v=((pc.y-pa.y)*(x+.5-pc.x)+(pa.x-pc.x)*(y+.5-pc.y))/denominator
                        w=1-u-v
                        if min(u,v,w)<0:continue
                        position=vertices[0]*u+vertices[1]*v+vertices[2]*w
                        hit,normal,index,distance=closest.find_nearest(position)
                        if hit is None:continue
                        original=triangles[index]
                        a,b,c=[source.data.vertices[i].co for i in original.vertices]
                        ab,ac,ap=b-a,c-a,hit-a
                        d00,d01,d11,d20,d21=ab.dot(ab),ab.dot(ac),ac.dot(ac),ap.dot(ab),ap.dot(ac)
                        denom=d00*d11-d01*d01
                        if abs(denom)<1e-20:continue
                        bv=(d11*d20-d01*d21)/denom;bw=(d00*d21-d01*d20)/denom
                        texuv=sum((original_uv[loop].uv*factor for loop,factor in zip(original.loops,[1-bv-bw,bv,bw])),Vector((0,0)))
                        size,colours,channels=originals[original.material_index]
                        tx=max(0,min(size[0]-1,int(texuv.x*size[0])));ty=max(0,min(size[1]-1,int(texuv.y*size[1])))
                        offset=(ty*size[0]+tx)*channels;destination=(y*resolution+x)*4
                        pixels[destination:destination+4]=array('f',[*colours[offset:offset+3],1])
                        valid[y*resolution+x]=1
            # Small UV padding preserves boundaries under bilinear filtering.
            for iteration in range(6):
                updates=[]
                for i,filled in enumerate(valid):
                    if filled:continue
                    x,y=i%resolution,i//resolution
                    neighbours=[j for j in (i-1 if x else -1,i+1 if x<resolution-1 else -1,i-resolution if y else -1,i+resolution if y<resolution-1 else -1) if j>=0 and valid[j]]
                    if neighbours:updates.append((i,neighbours[0]))
                for i,j in updates:pixels[i*4:i*4+4]=pixels[j*4:j*4+4];valid[i]=1
            image.pixels[:]=pixels
            image.update()
    for index, (target, resolution) in enumerate(zip(args.targets, args.textures)):
        if args.lod is not None and index != args.lod:
            continue
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
        if closest is not None:transfer(lod,image,resolution)
        else:bpy.ops.object.bake(type="EMIT")
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
