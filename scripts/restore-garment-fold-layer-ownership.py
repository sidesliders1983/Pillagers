"""Restore paired native hem/lining facets to their measured fabric layer.

A source fold can be mistaken for calf cloth by a nearest-bone centroid tag.
Exact same-pigment, opposed-normal nearby primary triangles provide evidence.
This changes only semantic owner of corresponding original source facets.
"""
import argparse,bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--maximum-pair-distance',type=float,default=.015);p.add_argument('--maximum-chroma-distance',type=float,default=.045);p.add_argument('--maximum-normal-dot',type=float,default=-.35);p.add_argument('--outward-continuation-distance',type=float,default=0);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True);bind=json.loads((a.source.parent/'garment-bind.json').read_text())['joints'];hip=bind['Hips'][1];bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];reports=[];images={}
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 for material in obj.data.materials:
  if material.name not in images:
   node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE');images[material.name]=(list(node.image.pixels[:]),node.image.size[:],node.image.channels)
def colour(obj,face):
 uv=obj.data.uv_layers.active.data;sample=sum((uv[i].uv for i in face.loop_indices),Vector((0,0)))/len(face.loop_indices);pixels,size,channels=images[obj.data.materials[face.material_index].name];x=min(size[0]-1,max(0,int(sample.x*size[0])));y=min(size[1]-1,max(0,int(sample.y*size[1])));rgb=pixels[(y*size[0]+x)*channels:(y*size[0]+x)*channels+3];return rgb,Vector(tuple(v/max(1e-8,sum(rgb)) for v in rgb))
donors=[];points=[];triangles=[]
for obj in objects:
 if obj.get('garmentRegion')!='skirt' or obj.get('garmentSurface')=='accessory':continue
 for face in obj.data.polygons:
  base=len(points);corners=[obj.data.vertices[i].co.copy() for i in face.vertices];points.extend(corners);triangles.append(tuple(range(base,base+3)));rgb,chroma=colour(obj,face);donors.append({'mesh':obj.name,'triangle':face.index,'normal':face.normal.copy(),'rgb':rgb,'chroma':chroma,'corners':corners})
assert donors;tree=BVHTree.FromPolygons(points,triangles,all_triangles=True)
for obj in objects:
 if obj.get('garmentRegion')!='cloth':continue
 selected=[];evidence=[]
 for face in obj.data.polygons:
  centre=face.center
  if centre.z>=hip:continue
  closest,normal,index,distance=tree.find_nearest(centre);donor=donors[index];normalDot=face.normal.dot(donor['normal']);rgb,chroma=colour(obj,face);colourDistance=(chroma-donor['chroma']).length
  oriented=normal.copy();radial=Vector((centre.x,centre.y,0))
  if oriented.dot(radial)<0:oriented.negate()
  signedGap=(centre-closest).dot(oriented);paired=distance<=a.maximum_pair_distance and normalDot<=a.maximum_normal_dot;outward=a.outward_continuation_distance>0 and distance<=a.outward_continuation_distance and signedGap>=.002 and centre.z>=min(p.z for p in points)
  if colourDistance>a.maximum_chroma_distance or not(paired or outward):continue
  selected.append(face.index);evidence.append({'sourceMesh':obj.name,'sourceTriangle':face.index,'sourceCornersBlender':[list(obj.data.vertices[i].co) for i in face.vertices],'sourceRGB':rgb,'sourceChroma':list(chroma),'pairedPrimaryMesh':donor['mesh'],'pairedPrimaryTriangle':donor['triangle'],'pairedPrimaryRGB':donor['rgb'],'pairedPrimaryChroma':list(donor['chroma']),'actualPairDistanceMetres':distance,'normalDot':normalDot,'signedSourceGapMetres':signedGap,'policy':'opposed native fold' if paired else 'outward same-pigment fabric continuation','chromaDistance':colourDistance})
 if not selected:continue
 clone=obj.copy();clone.data=obj.data.copy();clone.name=obj.name+'_native_fold';clone['garmentRegion']='skirt';bpy.context.scene.collection.objects.link(clone);chosen=set(selected)
 for target,keep in [(clone,chosen),(obj,set(range(len(obj.data.polygons)))-chosen)]:
  bm=bmesh.new();bm.from_mesh(target.data);bm.faces.index_update();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(target.data);bm.free();target.data.update()
 reports.append({'sourceMesh':obj.name,'nativeFoldMesh':clone.name,'facets':evidence,'sourceVerticesDisplaced':0,'sourceUVPaletteRetained':True})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'nativeFoldLayerOwnership':{'authority':'original same-pigment opposed-normal fold triangles paired with primary drape below canonical Hips','maximumPairDistanceMetres':a.maximum_pair_distance,'maximumChromaDistance':a.maximum_chroma_distance,'maximumNormalDot':a.maximum_normal_dot,'records':reports,'sourceVerticesDisplaced':0,'productionWearClearanceBaked':False}};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('NATIVE_FOLD_OWNERSHIP',[(r['nativeFoldMesh'],len(r['facets'])) for r in reports],flush=True)
