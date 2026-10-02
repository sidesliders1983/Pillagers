"""Fit original beard LOD surfaces to the same reference skull as generated hair."""
import bpy, bmesh, sys, json, hashlib, argparse
from pathlib import Path
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('style')
parser.add_argument('source')
parser.add_argument('destination')
parser.add_argument('--lod', type=int, choices=[0, 1, 2], default=2)
parser.add_argument('--fragment-area', type=float, default=0, help='Discard isolated components below this fraction of the largest component area')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
style, source, destination = args.style, args.source, args.destination
source = Path(source).resolve()
destination = Path(destination).resolve()
destination.mkdir(parents=True, exist_ok=True)
for lod in [args.lod]:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    path = source / f'Beard_{style}_LOD{lod}.glb'
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    removed = 0
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if args.fragment_area:
            bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00002)
            unseen=set(bm.verts);parts=[]
            while unseen:
                pending=[unseen.pop()];part=set(pending)
                while pending:
                    vertex=pending.pop()
                    for edge in vertex.link_edges:
                        other=edge.other_vert(vertex)
                        if other in unseen:unseen.remove(other);part.add(other);pending.append(other)
                parts.append(part)
            areas=[sum(face.calc_area() for face in {face for vertex in part for face in vertex.link_faces}) for part in parts]
            largest=max(areas)
            drop=[vertex for part,area in zip(parts,areas) if area < largest*args.fragment_area for vertex in part]
            removed+=len(drop)
            if drop:bmesh.ops.delete(bm, geom=drop, context='VERTS')
            bm.to_mesh(obj.data);bm.free()
        for vertex in obj.data.vertices:
            p = vertex.co.copy()
            vertex.co = Vector((-p.x * .52, -p.y * .52, (p.z - .075) * .52))
        obj.name = f'Beard_{style}_LOD{lod}'
        obj.data.materials.clear()
        material = bpy.data.materials.new('ProfileBeard')
        material.diffuse_color = (.22, .11, .07, 1)
        obj.data.materials.append(material)
        obj.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    output = destination / path.name
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                              export_animations=False, export_extras=True)
    record = {
        'reviewRequired': True,
        'style': style, 'lod': lod, 'source': str(path),
        'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'outputSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'fit': {'sourceSkullCentre': [0, 0, .075], 'scale': .52,
                'rotateBlenderZ': 180, 'headReferenceSize': [.1992, .2397, .2189]},
        # Preserve every original component, including the braid's binding.
        'removedSmallComponentVertices': removed,
        'fragmentAreaThreshold': args.fragment_area,
        'sourceProvenance': json.loads((source.parent / 'beard-candidate.provenance.json').read_text(encoding='utf-8-sig')),
    }
    output.with_suffix('.provenance.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
