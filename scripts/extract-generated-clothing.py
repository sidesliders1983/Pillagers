"""Produce review candidates from original generated outfits, without synthesizing surfaces.

Head colour supplies a per-source skin mask. Ambiguous fabric/skin boundaries require
visual review; this script deliberately neither rigs nor publishes the candidate.
"""
import bpy, bmesh, argparse, sys, json, hashlib, statistics, math
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--layout', choices=['cream-tunic','long-dress','mantle-tunic'])
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.output.exists():
    raise RuntimeError('Candidate already exists; preserve it and use a new review run.')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(args.source))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert meshes, 'Source has no meshes'
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
images = {}
for i, material in enumerate(body.data.materials):
    if material and material.use_nodes:
        node = next((n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        if node:
            images[i] = (tuple(node.image.size), list(node.image.pixels[:]), node.image.channels)
assert images and body.data.uv_layers.active, 'Textured original required'
uv = body.data.uv_layers.active.data
def colour(material, loop):
    size, pixels, channels = images[material]
    u, v = uv[loop].uv
    x = max(0, min(size[0]-1, int(u*size[0])))
    y = max(0, min(size[1]-1, int(v*size[1])))
    start = (y*size[0]+x)*channels
    return pixels[start:start+3]
minimum = min(v.co.z for v in body.data.vertices)
maximum = max(v.co.z for v in body.data.vertices)
height = maximum-minimum
head_samples = []
for polygon in body.data.polygons:
    if polygon.material_index in images and minimum+height*.88 < polygon.center.z < minimum+height*.97:
        for loop in polygon.loop_indices:
            rgb = colour(polygon.material_index, loop)
            if rgb[0] > rgb[1]*1.12 and rgb[0] > rgb[2]*1.15:
                head_samples.append(rgb)
assert len(head_samples) > 30, 'Could not identify reference skin; manual extraction required'
skin = [statistics.median(c[i] for c in head_samples) for i in range(3)]
selected = []
centre_x = (min(v.co.x for v in body.data.vertices)+max(v.co.x for v in body.data.vertices))/2
for polygon in body.data.polygons:
    if polygon.center.z > minimum+height*.83 or polygon.material_index not in images:
        continue
    samples = [colour(polygon.material_index, loop) for loop in polygon.loop_indices]
    skin_corners = sum(math.dist(rgb, skin) < .18 for rgb in samples)
    if args.layout:
        # These reference outfits have covered legs/boots. Skin-colour alone
        # incorrectly removes tan leather and cannot separate rust from skin.
        # Spatial cuff/neck cuts complement colour, without creating surfaces.
        y=(polygon.center.z-minimum)*1.8/height
        x=abs(polygon.center.x-centre_x)*1.8/height
        cuff={'cream-tunic':1.18,'mantle-tunic':1.06,'long-dress':1.45}[args.layout]
        arm_limit=.21 if args.layout=='long-dress' else .28
        arm_floor=1.12 if args.layout=='long-dress' else .60
        if y>1.50 or (y>1.40 and x<.075) or (arm_floor<y<cuff and x>arm_limit):
            continue
        if y<1.12:
            if args.layout=='long-dress' and .65<y and x>.24 and sum(rgb[0]>rgb[1]*1.3 and rgb[0]>rgb[2]*1.5 for rgb in samples)>len(samples)*.67:
                continue
            selected.append(polygon.index)
            continue
        skin_corners=sum(math.dist(rgb,skin)<.25 for rgb in samples)
    if skin_corners < len(samples)*.67:
        selected.append(polygon.index)
assert len(selected) > 100, 'Extraction empty or ambiguous'
bm = bmesh.new()
bm.from_mesh(body.data)
bm.faces.ensure_lookup_table()
keep = set(selected)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
loose = [v for v in bm.verts if not v.link_faces]
if loose:
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
bm.to_mesh(body.data)
bm.free()
body.name = 'GeneratedClothingCandidate'
args.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(args.output), export_format='GLB', use_selection=True,
                          export_animations=False, export_extras=True)
record = {'source': str(args.source.resolve()),
          'sourceSha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
          'outputSha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
          'selectedFaces': len(selected), 'skinReferenceLinearRGB': skin,
          'skinDistanceThreshold': .18, 'headCutoffHeightFraction': .83,
          'reviewLayout': args.layout,
          'reviewRequired': True, 'rigged': False, 'published': False,
          'sourceProvenance': json.loads(args.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'))}
args.output.with_suffix('.provenance.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
print('CLOTHING_REVIEW_CANDIDATE', len(selected), flush=True)
