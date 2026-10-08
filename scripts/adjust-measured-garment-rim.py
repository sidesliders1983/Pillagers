"""Rebuild a measured native rim one-ring by moving only its bounded control.
Original triangles, UV ownership, semantic regions and the open rim remain.
The target is the source boundary chord, never a body hull or garment template.
"""
import argparse,bpy,bmesh,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--controls',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();c=json.loads(a.controls.read_text());assert c['sourceSha256']==hashlib.sha256(a.source.read_bytes()).hexdigest();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));records=[]
for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.faces.index_update();bm.normal_update();uv=bm.loops.layers.uv.active
 for control in c['points']:
  if obj.get('garmentRegion')!=control['region']:continue
  original=Vector((control['point'][0],-control['point'][2],control['point'][1]));target=Vector((control['target'][0],-control['target'][2],control['target'][1]));matches=[v for v in bm.verts if (v.co-original).length<2e-6]
  if not matches:continue
  assert len(matches)==1;v=matches[0];assert sum(e.is_boundary for e in v.link_edges)==2;assert (target-original).length<=c['maximumDisplacementMetres'];assert all((other.co-target).length>1e-6 for other in bm.verts if other!=v)
  before={f:{'index':f.index,'points':[list(x.co) for x in f.verts],'UV':[list(l[uv].uv) for l in f.loops],'normal':list(f.normal),'areaMetresSquared':f.calc_area()} for f in v.link_faces};v.co=target;bm.normal_update();assert all(f.calc_area()>1e-10 for f in v.link_faces)
  records.append({'mesh':obj.name,'originalPointCanonical':control['point'],'targetPointCanonical':control['target'],'displacementMetres':(original-target).length,'authority':control['authority'],'oneRing':[dict(record,outputPoints=[list(x.co) for x in f.verts],outputNormal=list(f.normal),outputAreaMetresSquared=f.calc_area(),originalNormalDot=Vector(record['normal']).dot(f.normal)) for f,record in before.items()],'trianglesRemoved':0,'UVChanged':False})
 bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
assert len(records)==len(c['points']);bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
bindbytes=(a.source.parent/'garment-bind.json').read_bytes();(a.output.parent/'garment-bind.json').write_bytes(bindbytes)
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'nativeRimOneRingRepair':{'controls':str(a.controls.resolve()),'controlsSha256':hashlib.sha256(a.controls.read_bytes()).hexdigest(),'records':records,'productionClearanceBaked':False},'outputGarmentBind':{'frame':'universal-human-neutral-v1','units':'metres','up':'+Y','front':'+Z','origin':'ground','joints':json.loads(bindbytes)['joints'],'metadataSha256':hashlib.sha256(bindbytes).hexdigest()}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('MEASURED_RIM_ONERING',len(records),'MAX_DISPLACEMENT',max(r['displacementMetres'] for r in records),flush=True)
