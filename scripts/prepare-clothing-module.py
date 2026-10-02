"""Calibrate a reviewed image-to-3D outfit and tag its existing surfaces. Blender CLI.

No garment is authored here. Source textures, folds and silhouette come from the
generated figure. The original head/ground measure establishes the shared frame.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('style', choices=['cream-tunic','long-dress','mantle-tunic'])
p.add_argument('source', type=Path)
p.add_argument('figure', type=Path)
p.add_argument('output', type=Path)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
assert not a.output.exists(), 'Preserve reviewed outputs; use a new run.'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.figure.resolve()))
points=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
low=min(v.z for v in points);high=max(v.z for v in points);scale=1.8/(high-low)
head=[v for v in points if low+(high-low)*.87<v.z<low+(high-low)*.96]
centre=Vector((sum(v.x for v in head)/len(head),sum(v.y for v in head)/len(head),low))
feet=[v for v in points if v.z<low+(high-low)*.07]
ankles=[v for v in points if low+(high-low)*.10<v.z<low+(high-low)*.15]
ankle_y=sum(v.y for v in ankles)/len(ankles)
front=1 if max(v.y for v in feet)-ankle_y > ankle_y-min(v.y for v in feet) else -1
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
removed_fragment_faces=0
for obj in meshes:
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for v in obj.data.vertices:v.co=(v.co-centre)*scale
    obj.rotation_mode='XYZ'
    obj.rotation_euler.z=math.pi if front==1 else 0
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
    bm=bmesh.new();bm.from_mesh(obj.data)
    # Imported flat normals duplicate corners. Weld only coincident points
    # before measuring connected components; UV corners remain per loop.
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    unseen=set(bm.faces);removed=[]
    while unseen:
        first=unseen.pop();component=[first];pending=[first]
        while pending:
            face=pending.pop()
            for edge in face.edges:
                for neighbour in edge.link_faces:
                    if neighbour in unseen:unseen.remove(neighbour);component.append(neighbour);pending.append(neighbour)
        if sum(face.calc_area() for face in component)<.004:removed.extend(component)
    removed_fragment_faces+=len(removed)
    bmesh.ops.delete(bm,geom=removed,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(obj.data);bm.free()
    obj.data.update()
    images={}
    for i,mat in enumerate(obj.data.materials):
        node=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
        if node:images[i]=(tuple(node.image.size),list(node.image.pixels[:]),node.image.channels)
    uv=obj.data.uv_layers.active.data
    def rgb(face):
        size,pixels,channels=images[face.material_index]
        u,v=uv[face.loop_start].uv
        x=max(0,min(size[0]-1,int(u*size[0])));y=max(0,min(size[1]-1,int(v*size[1])))
        return pixels[(y*size[0]+x)*channels:(y*size[0]+x)*channels+3]
    regions={key:[] for key in ['cloth','skirt','mantle','footwear']}
    for face in obj.data.polygons:
        y=face.center.z
        colour=rgb(face)
        cuff={'cream-tunic':1.20,'long-dress':1.45,'mantle-tunic':1.08}[a.style]
        # Residual generated forearm facets share the source skin's pink hue.
        # Keep dark leather and saturated mantle reds, and never cut the hem.
        if .45<y<cuff and abs(face.center.x)>.20 and colour[0]>.60 and colour[1]>.28 and colour[2]>.20 and 1.22<colour[0]/max(.001,colour[1])<1.9:
            continue
        if y<.27:region='footwear'
        elif a.style=='long-dress' and y<1.03:
            # Reopen the generated skirt's underside without changing its hem.
            heights=[obj.data.vertices[i].co.z for i in face.vertices]
            if .27<y<.53 and max(heights)<.53 and max(heights)-min(heights)<.025 and face.normal.z<-.75:continue
            region='skirt'
        elif a.style=='mantle-tunic' and y>1.17 and (lambda c:c[0]>c[1]*1.25 and c[0]>c[2]*1.3)(rgb(face)):region='mantle'
        elif .67<y<1.03 and (lambda c:min(c)>.48 if a.style=='cream-tunic' else c[2]>c[0]*1.05)(rgb(face)):region='skirt'
        else:region='cloth'
        regions[region].append(face.index)
    for region,selected in regions.items():
        if not selected:continue
        clone=obj.copy();clone.data=obj.data.copy();bpy.context.scene.collection.objects.link(clone)
        bm=bmesh.new();bm.from_mesh(clone.data);bm.faces.ensure_lookup_table();keep=set(selected)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES')
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bm.to_mesh(clone.data);bm.free()
        clone.name=f'{a.style}_{region}';clone['garmentRegion']=region
        for poly in clone.data.polygons:poly.use_smooth=False
    bpy.data.objects.remove(obj,do_unlink=True)
a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
report=a.source.parent/f'Clothing_{a.style}_report.json'
record={'reviewRequired':True,'style':a.style,'lod':2,'source':str(a.source.resolve()),
    'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),
    'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),
    'fit':{'up':'+Y','front':'+Z','origin':'ground / source skull axis','sourceUp':'+Y','sourceFront':'-Z' if front==1 else '+Z',
           'sourceCentreBlender':list(centre),'scale':scale,'rotateBlenderZ':180 if front==1 else 0,
           'frontMeasurement':'toe extension relative to ankle cross-section'},
    'geometryPolicy':'existing reference surfaces only; tagged drape regions; skirt underside reopened',
    'removedFloatingFragmentFaces':removed_fragment_faces,'fragmentAreaThresholdMetresSquared':.004,
    'sourceProvenance':json.loads(report.read_text())}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print('CLOTHING_CALIBRATED',a.output,flush=True)
