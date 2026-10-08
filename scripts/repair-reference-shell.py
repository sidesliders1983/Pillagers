"""Remove occluded inward walls from a measured original garment surface.

The outer reference silhouette and UV loops are retained. The test requires
both an inward-facing facet and another source surface immediately outside it;
ordinary outward folds, collars, cuffs and hems are never filled or remade.
"""
import bpy,bmesh,argparse,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--domain',choices=['torso','limb','all'],default='all');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
record=json.loads(a.source.with_suffix('.provenance.json').read_text());joints=record['fit']['garmentBind']['joints'];joint=lambda n:Vector((joints[n][0],-joints[n][2],joints[n][1]))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));changes=[]
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH' or obj.get('garmentRegion')!='cloth':continue
 domain=obj.get('garmentBindDomain','unmarked')
 if a.domain!='all' and domain!=a.domain:continue
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000002);bm.normal_update();tree=BVHTree.FromBMesh(bm)
 spine=[('Hips','Chest'),('Chest','Neck')];limbs=[(x+'_'+s,y+'_'+s) for s in ['L','R'] for x,y in [('UpperArm','LowerArm'),('LowerArm','Hand'),('UpperLeg','LowerLeg'),('LowerLeg','Foot')]]
 segments=spine if domain=='torso' else limbs if domain=='limb' else spine+limbs
 def radial(c):
  candidates=[]
  for first,last in segments:
   start=joint(first);axis=joint(last)-start;t=max(0,min(1,(c-start).dot(axis)/axis.length_squared));d=c-start-axis*t;candidates.append((d.length_squared,d))
  return min(candidates,key=lambda p:p[0])[1].normalized()
 removed=[]
 for face in bm.faces:
  c=face.calc_center_median();direction=radial(c)
  if face.normal.dot(direction)>=-.12:continue
  hit=tree.ray_cast(c+direction*.0005,direction,.035)
  if hit[0] is not None:removed.append(face)
 bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 unseen=set(bm.faces);specks=[];parts=[]
 while unseen:
  first=unseen.pop();part=[first];pending=[first]
  while pending:
   for edge in pending.pop().edges:
    for neighbour in edge.link_faces:
     if neighbour in unseen:unseen.remove(neighbour);part.append(neighbour);pending.append(neighbour)
  parts.append((sum(f.calc_area() for f in part),part))
 largest=max((area for area,part in parts),default=0)
 for area,part in parts:
  if area<.00025 or domain=='torso' and area<largest*.10:specks.extend(part)
 bmesh.ops.delete(bm,geom=specks,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
 changes.append({'mesh':obj.name,'bindDomain':domain,'removedOccludedInwardFaces':len(removed),'removedLooseSpeckFaces':len(specks)})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
result={'reviewRequired':True,'style':record['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'fit':record['fit'],'sourceProvenance':record,'geometryOptimization':{'sourceWallRepair':changes,'policy':'delete only inward source facets occluded by an adjacent source wall within35mm; original UVs, openings and outer silhouette retained'}};a.output.with_suffix('.provenance.json').write_text(json.dumps(result,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_text(json.dumps(result['fit']['garmentBind'],indent=2)+'\n');print('SOURCE_SHELL_REPAIRED',changes,flush=True)
