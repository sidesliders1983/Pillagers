"""Fit original beard LOD surfaces to the same reference skull as generated hair."""
import bpy, sys, json, hashlib
from pathlib import Path
from mathutils import Vector

style, source, destination = sys.argv[sys.argv.index('--') + 1:]
source = Path(source).resolve()
destination = Path(destination).resolve()
destination.mkdir(parents=True, exist_ok=True)
for lod in range(3):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    path = source / f'Beard_{style}_LOD{lod}.glb'
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
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
        'removedSmallComponentVertices': 0,
        'sourceProvenance': json.loads((source.parent / 'beard-candidate.provenance.json').read_text(encoding='utf-8-sig')),
    }
    output.with_suffix('.provenance.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
