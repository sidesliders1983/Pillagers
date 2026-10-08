"""Optimize the full existing generated bust before extracting reference hair.
The closed bust remains manifold during reduction; extraction is the final step.
"""
import bpy,bmesh,json,math,sys,argparse,hashlib,colorsys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from array import array
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--kind',choices=['hair','beard'],required=True);p.add_argument('--style',required=True);p.add_argument('--target',type=int,default=4500);p.add_argument('--complete-scalp',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();source=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);source.data.calc_loop_triangles();triangles=list(source.data.loop_triangles);uv=source.data.uv_layers.active.data;bvh=BVHTree.FromPolygons([v.co for v in source.data.vertices],[tri.vertices for tri in triangles],all_triangles=True);images={}
for i,mat in enumerate(source.data.materials):
 node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image);pixels=array('f',[0])*len(node.image.pixels);node.image.pixels.foreach_get(pixels);images[i]=(tuple(node.image.size),pixels,node.image.channels)
def colour(point):
 hit,n,index,d=bvh.find_nearest(point);tri=triangles[index];x,y,z=[source.data.vertices[i].co for i in tri.vertices];ab,ac,ap=y-x,z-x,hit-x;den=ab.dot(ab)*ac.dot(ac)-ab.dot(ac)**2
 if abs(den)<1e-20:return [1,1,1]
 v=(ac.dot(ac)*ap.dot(ab)-ab.dot(ac)*ap.dot(ac))/den;w=(ab.dot(ab)*ap.dot(ac)-ab.dot(ac)*ap.dot(ab))/den;tex=sum((uv[loop].uv*weight for loop,weight in zip(tri.loops,[1-v-w,v,w])),Vector((0,0)));size,pixels,channels=images[tri.material_index];tx=max(0,min(size[0]-1,int(tex.x*size[0])));ty=max(0,min(size[1]-1,int(tex.y*size[1])));offset=(ty*size[0]+tx)*channels;return pixels[offset:offset+3]
clone=source.copy();clone.data=source.data.copy();bpy.context.collection.objects.link(clone);bpy.context.view_layer.objects.active=clone;source.select_set(False);clone.select_set(True);span=max(clone.dimensions)
clone.data.remesh_voxel_size=span*.007;clone.data.remesh_voxel_adaptivity=0;bpy.ops.object.voxel_remesh();print('REMESH',len(clone.data.vertices),len(clone.data.polygons),flush=True)
# Collapse directly from the watertight voxel surface. Dissolving mildly curved
# quads into huge concave n-gons before triangulation creates folded wedges.
bm=bmesh.new();bm.from_mesh(clone.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(clone.data);bm.free()
for i in range(12):
 count=sum(len(f.vertices)-2 for f in clone.data.polygons)
 if count<=a.target:break
 mod=clone.modifiers.new('Preserve bust silhouette','DECIMATE');mod.ratio=max(.35,a.target/count);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
clone.data.update();print('BUST_REDUCED',len(clone.data.vertices),sum(len(f.vertices)-2 for f in clone.data.polygons),flush=True)
frame=json.loads(Path('scratch/appearance-pass/head-frames.json').read_text())[a.kind+'/'+a.style];centre=Vector(frame['centre']);up=Vector(frame['up']).normalized();front=Vector(frame['front']);front=(front-up*front.dot(up)).normalized();right=front.cross(up).normalized();diameter=2*frame['radius']
selected=[]
for face in clone.data.polygons:
 points=[clone.data.vertices[i].co for i in face.vertices];rgb=colour(sum(points,Vector())/len(points));h,s,v=colorsys.rgb_to_hsv(*rgb)
 raw=sum(points,Vector())/len(points)-centre;canonical=Vector((-raw.dot(right)*.1992/diameter,-raw.dot(front)*.2189/diameter,raw.dot(up)*.2397/diameter))
 scalp=a.complete_scalp and a.kind=='hair' and (canonical.z>.035 or (canonical.y>-.02 and canonical.z>-.085))
 if (.03<v<.69 and s<.65) or scalp:selected.append(face.index)
bm=bmesh.new();bm.from_mesh(clone.data);bm.faces.ensure_lookup_table();keep=set(selected)
# Atlas highlights and dark source seams must not puncture an otherwise closed
# scalp. Classify connected regions on the original bust before deleting skin.
# Keep the large connected exposed skin region; absorb enclosed atlas islands.
if a.kind in ['hair','beard']:
 # Close gaps left by source-atlas highlights at the size of one reduced facet.
 # Dilation followed by erosion preserves the reference perimeter while joining
 # thin cracks and isolated punctures; no new surface is invented.
 original_keep=set(keep)
 for _ in range(2):
  add={n.index for face in bm.faces if face.index in keep for edge in face.edges for n in edge.link_faces};keep.update(add)
 for _ in range(2):
  remove={face.index for face in bm.faces if face.index in keep and any(n.index not in keep for edge in face.edges for n in edge.link_faces)}
  keep.difference_update(remove)
 for _ in range(2):
  fill=[]
  for face in bm.faces:
   if face.index in keep:continue
   neighbours={n for edge in face.edges for n in edge.link_faces if n!=face}
   if sum(n.index in keep for n in neighbours)>=2:fill.append(face.index)
  keep.update(fill)
 remaining={f for f in bm.faces if f.index not in keep};regions=[]
 while remaining:
  todo=[remaining.pop()];region=[]
  while todo:
   face=todo.pop();region.append(face)
   for edge in face.edges:
    for other in edge.link_faces:
     if other in remaining:remaining.remove(other);todo.append(other)
  regions.append(region)
 regions.sort(key=lambda region:sum(f.calc_area() for f in region),reverse=True)
 for region in regions[1:]:
  keep.update(f.index for f in region)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
for vertex in bm.verts:
 raw=vertex.co-centre;vertex.co=Vector((-raw.dot(right)*.1992/diameter,-raw.dot(front)*.2189/diameter,raw.dot(up)*.2397/diameter))
# Remove extracted skin residue in the exposed central face. Side hair remains.
if a.kind=='hair':
 bmesh.ops.delete(bm,geom=[face for face in bm.faces if
  (abs(face.calc_center_median().x)<.086 and face.calc_center_median().y<-.02 and face.calc_center_median().z<.025) or
  (abs(face.calc_center_median().x)<.084 and face.calc_center_median().y<.045 and face.calc_center_median().z<-.10)
 ],context='FACES')
# Ignore micro islands left by shadows on the source shoulders/neck.
remaining=set(bm.faces);parts=[]
while remaining:
 todo=[remaining.pop()];part=[]
 while todo:
  face=todo.pop();part.append(face)
  for edge in face.edges:
   for other in edge.link_faces:
    if other in remaining:remaining.remove(other);todo.append(other)
 parts.append(part)
areas=[sum(f.calc_area() for f in p) for p in parts];largest=max(areas);drop=[f for part,area in zip(parts,areas) if area<largest*.015 or (a.kind=='hair' and max(v.co.z for face in part for v in face.verts)<-.14) for f in part];bmesh.ops.delete(bm,geom=drop,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.normal_update();bm.verts.index_update()
# Bake clean indexed facets, with profile colour replacing the source atlas.
data=bpy.data.meshes.new('Reference hair facets');data.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in face.verts] for face in bm.faces]);data.update();data.validate();clone.data=data;bm.free();clone.name=f'{"Hair" if a.kind=="hair" else "Beard"}_{a.style}_LOD2';
for face in data.polygons:face.use_smooth=False
material=bpy.data.materials.new('Profile reference hair');material.diffuse_color=(.28,.15,.09,1);material.use_nodes=True;material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;data.materials.append(material)
bpy.ops.object.select_all(action='DESELECT');clone.select_set(True);bpy.context.view_layer.objects.active=clone;bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
report={'rawTriangles':len(triangles),'fullBustTriangleBudget':a.target,'outputTriangles':sum(len(f.vertices)-2 for f in data.polygons),'extractionOrder':'optimize closed reference bust, then classify reduced source surfaces','classification':{'minValue':.03,'maxValue':.69,'maxSaturation':.65},'microIslandArea':.015};prov={'reviewRequired':True,'style':a.style,'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig')),'geometryOptimization':report,'fit':{'authoringFrame':'canonical','up':'+Y','front':'+Z','origin':'fixed skull centre','canonicalHeadSize':[.1992,.2397,.2189]}};a.output.with_suffix('.provenance.json').write_text(json.dumps(prov,indent=2)+'\n');a.output.with_suffix('.audit.json').write_text(json.dumps(report,indent=2)+'\n');print('FULL_REFERENCE_EXTRACTED',json.dumps(report),flush=True)
