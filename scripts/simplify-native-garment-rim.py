"""Conservative measured boundary-edge collapse; preserve the open wear rim.

Controls pin an immutable source and independently measured rim coordinates.
Only a degree-two boundary point with no cross-semantic weld is eligible. Its
one-ring must keep positive, similarly oriented facets after the collapse.
Existing face UV loops/palette remain owned by their original triangles.
"""
import argparse,bpy,bmesh,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--controls',type=Path,required=True);p.add_argument('--maximum-displacement',type=float,default=.05)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();controls=json.loads(a.controls.read_text());assert controls['sourceSha256']==hashlib.sha256(a.source.read_bytes()).hexdigest();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];records=[];rejected=[]
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.faces.index_update();bm.normal_update();uv=bm.loops.layers.uv.active
 for control in controls['points']:
  if obj.get('garmentRegion')!=control['region'] or obj.get('garmentSurface')=='accessory':continue
  goal=Vector((control['point'][0],-control['point'][2],control['point'][1]));matches=[v for v in bm.verts if (v.co-goal).length<2e-6]
  if not matches:continue
  assert len(matches)==1;vertex=matches[0];boundary=[e for e in vertex.link_edges if e.is_boundary]
  if len(boundary)!=2:continue
  candidates=sorted([e.other_vert(vertex) for e in boundary],key=lambda v:(v.co-vertex.co).length)
  chosen=None
  for target in candidates:
   displacement=(target.co-vertex.co).length
   if displacement>a.maximum_displacement:continue
   edge=next(e for e in boundary if e.other_vert(vertex)==target)
   neighbours=lambda v:{e.other_vert(v) for e in v.link_edges}
   opposite={v for f in edge.link_faces for v in f.verts if v not in {vertex,target}}
   if neighbours(vertex)&neighbours(target)!=opposite:continue
   old=vertex.co.copy();vertex.co=target.co;valid=True
   for face in vertex.link_faces:
    if target in face.verts:continue
    normal=face.normal.copy();points=[v.co for v in face.verts];cross=(points[1]-points[0]).cross(points[2]-points[0])
    if cross.length<1e-9 or cross.normalized().dot(normal)<.15:valid=False;break
   vertex.co=old
   if valid:chosen=target;break
  if chosen is None:rejected.append({'mesh':obj.name,'point':control['point'],'reason':'edge exceeds measured displacement or one-ring facet reverses/collapses'});continue
  faces=[{'index':f.index,'points':[list(v.co) for v in f.verts],'uv':[list(l[uv].uv) for l in f.loops],'normal':list(f.normal),'removed':chosen in f.verts} for f in vertex.link_faces]
  target=chosen.co.copy();record={'mesh':obj.name,'sourcePoint':control['point'],'targetPointCanonical':[target.x,target.z,-target.y],'displacementMetres':(vertex.co-target).length,'sourceOneRing':faces,'removedTriangles':sum(f['removed'] for f in faces),'policy':'collapse measured incidental rim excursion to existing native neighbouring corner; no cap, new silhouette template, UV repaint or body removal'}
  bmesh.ops.pointmerge(bm,verts=[vertex,chosen],merge_co=target);bm.normal_update();records.append(record)
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
assert records,'No eligible native rim collapse.'
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
bindbytes=(a.source.parent/'garment-bind.json').read_bytes();(a.output.parent/'garment-bind.json').write_bytes(bindbytes)
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'nativeRimSimplification':{'controls':str(a.controls.resolve()),'controlsSha256':hashlib.sha256(a.controls.read_bytes()).hexdigest(),'records':records,'rejected':rejected,'maximumDisplacementMetres':max(r['displacementMetres'] for r in records),'trianglesRemoved':sum(r['removedTriangles'] for r in records),'productionClearanceBaked':False},'outputGarmentBind':{'frame':'universal-human-neutral-v1','units':'metres','up':'+Y','front':'+Z','origin':'ground','joints':json.loads(bindbytes)['joints'],'metadataSha256':hashlib.sha256(bindbytes).hexdigest()}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('MEASURED_RIM_COLLAPSES',len(records),'REMOVED',record['nativeRimSimplification']['trianglesRemoved'],'MAX_DISPLACEMENT',record['nativeRimSimplification']['maximumDisplacementMetres'],'REJECTED',len(rejected),flush=True)
