"""Repair a generated figure's external surface before clothing UV extraction.

The immutable source supplies every palette sample. No replacement shape,
garment or body is invented; the external surface is volume-cleaned before
source pigment domains are cut out in the next authoring step.
"""
import argparse,bpy,bmesh,hashlib,json,math,sys
from pathlib import Path
from array import array
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('source',type=Path);p.add_argument('output',type=Path)
p.add_argument('--target',type=int,default=30000);p.add_argument('--voxel',type=float,default=.0035)
p.add_argument('--external-cache-only',action='store_true',help='Cache the dense external surface and original UV/face pigment mapping before any reduction.')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
assert a.source.is_file() and not a.output.exists()
a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
original=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
span=max(original.dimensions);original.data.calc_loop_triangles()
triangles=list(original.data.loop_triangles);positions=[v.co.copy() for v in original.data.vertices]
uv=original.data.uv_layers.active.data
texcoords=[tuple(Vector((*uv[i].uv,0)) for i in triangle.loops) for triangle in triangles]
materials=[t.material_index for t in triangles];images={}
for i,material in enumerate(original.data.materials):
 image=next(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
 pixels=array('f',[0])*len(image.pixels);image.pixels.foreach_get(pixels)
 images[i]=(tuple(image.size),pixels,image.channels)
reference=BVHTree.FromPolygons(positions,[t.vertices for t in triangles],all_triangles=True)
def colour(point):
 hit,normal,index,distance=reference.find_nearest(point)
 triangle=triangles[index];tex=barycentric_transform(hit,*[positions[v] for v in triangle.vertices],*texcoords[index])
 size,pixels,channels=images[materials[index]]
 x=max(0,min(size[0]-1,int(tex.x*size[0])));y=max(0,min(size[1]-1,int(tex.y*size[1])));offset=(y*size[0]+x)*channels
 return pixels[offset:offset+3]
def mapped_colour(point):
 hit,normal,index,distance=reference.find_nearest(point)
 triangle=triangles[index];tex=barycentric_transform(hit,*[positions[v] for v in triangle.vertices],*texcoords[index])
 size,pixels,channels=images[materials[index]];x=max(0,min(size[0]-1,int(tex.x*size[0])));y=max(0,min(size[1]-1,int(tex.y*size[1])));offset=(y*size[0]+x)*channels
 return pixels[offset:offset+3],index,tex[:2]
clean=original.copy();clean.data=original.data.copy();bpy.context.collection.objects.link(clean)
bpy.ops.object.select_all(action='DESELECT');clean.select_set(True);bpy.context.view_layer.objects.active=clean
bm=bmesh.new();bm.from_mesh(clean.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=span*.00001)
bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=span*.0000001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(clean.data);bm.free()
clean.data.materials.clear();clean.data.remesh_voxel_size=span*a.voxel;clean.data.remesh_voxel_adaptivity=0
print('EXTERNAL_FIGURE::voxel',span*a.voxel,flush=True);bpy.ops.object.voxel_remesh()
clean.data.calc_loop_triangles();voxelTriangles=len(clean.data.loop_triangles)
if a.external_cache_only:
 import numpy as np
 cache=a.output.with_suffix('.npz');assert not cache.exists();faces=list(clean.data.loop_triangles)
 points=np.asarray([tuple(v.co) for v in clean.data.vertices],dtype=np.float32);indices=np.asarray([tuple(face.vertices) for face in faces],dtype=np.int32)
 rgb=np.empty((len(faces),3),dtype=np.float32);parent=np.empty(len(faces),dtype=np.int32);source_uv=np.empty((len(faces),2),dtype=np.float32)
 print('EXTERNAL_FIGURE::cache-pigment',len(faces),flush=True)
 for i,face in enumerate(faces):
  point=sum((clean.data.vertices[v].co for v in face.vertices),Vector())/3;rgb[i],parent[i],source_uv[i]=mapped_colour(point)
  if i and i%100000==0:print('EXTERNAL_FIGURE::cache-progress',i,flush=True)
 np.savez_compressed(cache,positions=points,triangles=indices,linearRGB=rgb,originalFace=parent,originalUV=source_uv)
 record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(cache.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig')),'geometryOptimization':{'sourceTriangles':len(triangles),'externalVoxelTriangles':voxelTriangles,'voxelFraction':a.voxel,'palette':'original immutable UV barycentric pigment transferred BEFORE decimation','cache':'immutable complete external surface, nearest original face and UV mapping; no threshold or simplification applied'}}
 cache.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('EXTERNAL_FIGURE::CACHE_DONE',cache,flush=True);sys.exit(0)
for iteration in range(8):
 clean.data.calc_loop_triangles();count=len(clean.data.loop_triangles)
 if count<=a.target*1.01:break
 modifier=clean.modifiers.new('Preserve source silhouette before UV extraction','DECIMATE');modifier.ratio=max(.35,a.target/count);modifier.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=modifier.name)
bm=bmesh.new();bm.from_mesh(clean.data);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=span*.0000001)
parts=[];unseen=set(bm.faces)
while unseen:
 first=unseen.pop();part=[first];pending=[first]
 while pending:
  for edge in pending.pop().edges:
   for neighbour in edge.link_faces:
    if neighbour in unseen:unseen.remove(neighbour);part.append(neighbour);pending.append(neighbour)
 parts.append(part)
loose=[f for part in parts if sum(f.calc_area() for f in part)<span*span*.000005 for f in part]
bmesh.ops.delete(bm,geom=loose,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(clean.data);bm.free();clean.data.update()
resolution=2048;tile=8;across=resolution//tile;atlas=array('f',[0])*(resolution*resolution*4)
assert len(clean.data.polygons)<=across*across
# The remesh can inherit a stale UV map. The new facet atlas must be the sole
# render UV domain, or export silently samples the original coordinates.
while clean.data.uv_layers:clean.data.uv_layers.remove(clean.data.uv_layers[0])
uv=clean.data.uv_layers.new(name='OriginalPigmentFacets').data
print('EXTERNAL_FIGURE::source-palette',len(clean.data.polygons),flush=True)
for i,face in enumerate(clean.data.polygons):
 rgb=colour(face.center);tx=(i%across)*tile;ty=(i//across)*tile
 for y in range(ty,ty+tile):
  for x in range(tx,tx+tile):offset=(y*resolution+x)*4;atlas[offset:offset+4]=array('f',[*rgb,1])
 for k,loop in enumerate(face.loop_indices):uv[loop].uv=((tx+(tile-1 if k==1 else 1))/resolution,(ty+(tile-1 if k==2 else 1))/resolution)
 face.use_smooth=False;face.material_index=0
image=bpy.data.images.new('OriginalSourcePigment',width=resolution,height=resolution,alpha=False);image.pixels[:]=atlas;image.update()
material=bpy.data.materials.new('OriginalPigmentFacets');material.use_nodes=True;nodes=material.node_tree.nodes
bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=1
texture=nodes.new('ShaderNodeTexImage');texture.image=image;material.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color'])
clean.data.materials.append(material);clean.name='ExternalOriginalFigure'
bpy.ops.object.select_all(action='DESELECT');clean.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig')),'geometryOptimization':{'sourceTriangles':len(triangles),'externalVoxelTriangles':voxelTriangles,'outputTriangles':len(clean.data.polygons),'voxelFraction':a.voxel,'removedLooseFaces':len(loose),'palette':'original immutable source UV barycentric transfer; padded facet atlas','policy':'repair external full figure before cutting original clothing pigment domains'}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print('EXTERNAL_FIGURE::DONE',a.output,flush=True)
