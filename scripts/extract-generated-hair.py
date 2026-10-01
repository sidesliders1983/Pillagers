"""Extract dark, low-saturation hair surfaces from a reference-generated bust.

Run in Blender before the static LOD pipeline. This is a candidate extraction:
it deliberately requires a later visual/fit review before publication.
"""
import argparse,colorsys,json,sys
from pathlib import Path
import bpy,bmesh

p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path)
args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not args.output.exists()
bpy.ops.import_scene.gltf(filepath=str(args.source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert meshes
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();body=bpy.context.object
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
images={}
for i,material in enumerate(body.data.materials):
    if material and material.use_nodes:
        node=next((n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
        if node:images[i]=(tuple(node.image.size),list(node.image.pixels[:]),node.image.channels)
assert images,'A textured source is required for hair extraction.'
uv=body.data.uv_layers.active.data
def colour(material,loop):
    size,pixels,channels=images[material];u,v=uv[loop].uv
    x=max(0,min(size[0]-1,int(u*size[0])));y=max(0,min(size[1]-1,int(v*size[1])))
    offset=(y*size[0]+x)*channels;return pixels[offset:offset+3]
selected=[]
for polygon in body.data.polygons:
    if polygon.material_index not in images:continue
    samples=[colour(polygon.material_index,i) for i in polygon.loop_indices]
    hair=sum(.07<max(rgb)<.65 and colorsys.rgb_to_hsv(*rgb)[1]<.50 for rgb in samples)
    if hair>=len(samples)*.67:selected.append(polygon.index)
ratio=len(selected)/len(body.data.polygons)
assert .02<ratio<.85,f'Ambiguous hair extraction ({ratio:.1%}); visual adjustment required.'
bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table();keep=set(selected)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES')
loose=[v for v in bm.verts if not v.link_faces]
if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
bm.to_mesh(body.data);bm.free();body.data.update()
body.name='GeneratedHairCandidate';args.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',use_selection=True,export_animations=False)
args.output.with_suffix('.extraction.json').write_text(json.dumps({'source':str(args.source),'selectedFaces':len(selected),'fraction':ratio,'classification':'value 0.07..0.65, saturation <0.50, at least two thirds of UV corner samples','reviewRequired':True},indent=2)+'\n')
print('HAIR_EXTRACTION_CANDIDATE',len(selected),flush=True)
