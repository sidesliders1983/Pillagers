"""Replay measured native fabric ownership without changing source artwork.

Controls pin the exact immutable GLB and every selected source triangle. Their
semantic owner is authored from original pigment, surface adjacency and source
views; no morphology, colour threshold or style condition runs at equip time.
All native corner positions, UVs, material and triangle winding are retained.
"""
import argparse, hashlib, itertools, json, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('controls', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--source-bind', type=Path, help='Explicit measured source-pose sidecar when the pre-calibration figure has no sibling table.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
assert not args.output.exists()
bind_sidecar = args.source_bind or args.source.parent / 'garment-bind.json'
assert bind_sidecar.is_file(), 'The measured source-pose joint sidecar must exist before authoring starts.'
controls = json.loads(args.controls.read_text())
source_sha = hashlib.sha256(args.source.read_bytes()).hexdigest()
assert source_sha == controls['sourceSha256'], 'Native ownership controls require their exact measured source.'
assert controls['frame'] == 'metres/+Y/+Z/ground'
assert controls['facets'] and all(row['targetRegion'] in ('cloth', 'skirt', 'mantle', 'footwear') for row in controls['facets'])
assert all(row.get('targetSurface') in (None, 'accessory') for row in controls['facets'])
args.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
for obj in objects:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

matched = set()
records = []
for obj in objects:
    selection = {}
    for row_number, row in enumerate(controls['facets']):
        if row['mesh'] not in (obj.name, obj.get('name')):
            continue
        assert obj.get('garmentRegion') == row['sourceRegion']
        face = obj.data.polygons[row['faceIndex']]
        actual = [Vector((obj.data.vertices[index].co.x, obj.data.vertices[index].co.z, -obj.data.vertices[index].co.y)) for index in face.vertices]
        expected = [Vector(point) for point in row['positions']]
        error = min(max((actual[i] - expected[j]).length for i, j in enumerate(order)) for order in itertools.permutations(range(3)))
        assert error <= 2e-6, (obj.name, face.index, 'Immutable native triangle did not match', error)
        selection.setdefault((row['targetRegion'], row.get('targetSurface')), []).append(face.index)
        matched.add(row_number)
    if not selection:
        continue
    removed = set()
    for (target_region, target_surface), face_indices in selection.items():
        assert not removed.intersection(face_indices)
        removed.update(face_indices)
        clone = obj.copy()
        clone.data = obj.data.copy()
        clone.name = obj.name + '_native_' + target_region
        clone['garmentRegion'] = target_region
        if target_surface:
            clone['garmentSurface'] = target_surface
        bpy.context.scene.collection.objects.link(clone)
        bm = bmesh.new()
        bm.from_mesh(clone.data)
        bm.faces.index_update()
        chosen = set(face_indices)
        bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.index not in chosen], context='FACES')
        bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces], context='VERTS')
        bm.to_mesh(clone.data)
        bm.free()
        clone.data.update()
        records.append({'sourceMesh': obj.name, 'sourceRegion': obj.get('garmentRegion'), 'targetRegion': target_region, 'targetSurface': target_surface, 'originalFaceIndices': face_indices})
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.index_update()
    bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.index in removed], context='FACES')
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
assert matched == set(range(len(controls['facets']))), 'Every authored native facet must resolve exactly once.'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(args.output.resolve()), export_format='GLB', use_selection=True, export_extras=True, export_animations=False, export_cameras=False, export_lights=False)
result = {
    'reviewRequired': True,
    'source': str(args.source.resolve()),
    'sourceSha256': source_sha,
    'outputSha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
    'sourceProvenance': json.loads(args.source.with_suffix('.provenance.json').read_text()),
    'nativeFacetOwnership': {
        'controls': str(args.controls.resolve()),
        'controlsSha256': hashlib.sha256(args.controls.read_bytes()).hexdigest(),
        'authority': controls['authority'],
        'records': records,
        'sourceVerticesDisplaced': 0,
        'sourceTrianglesAddedOrRemoved': 0,
        'originalUVPaletteAndWindingPreserved': True,
        'productionWearClearanceBaked': False,
    },
}
args.output.with_suffix('.provenance.json').write_text(json.dumps(result, indent=2) + '\n')
(args.output.parent / 'garment-bind.json').write_bytes(bind_sidecar.read_bytes())
print('EXACT_NATIVE_FACET_OWNERSHIP', records, flush=True)
