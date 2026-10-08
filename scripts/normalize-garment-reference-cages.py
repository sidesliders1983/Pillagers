"""Calibrate measured generated-reference torso breadth/depth to canonical cages.

Pure offline coordinate authoring: retained facets, UVs, palette, hems and boots.
Controls are exact immutable source/body triangle sections, never DNA offsets.
No collision, body deletion, production wear clearance or replacement artwork.
"""
import argparse,bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('controls',type=Path);p.add_argument('output',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();data=json.loads(a.controls.read_text());assert hashlib.sha256(a.source.read_bytes()).hexdigest()==data['sourceSha256'];body=Path(data['canonicalBody']);assert hashlib.sha256(body.read_bytes()).hexdigest()==data['canonicalBodySha256'];a.output.parent.mkdir(parents=True,exist_ok=True)
controls=data['controls'];joints=data['joints'];hip=joints['Hips'][1];neck=joints['Neck'][1]
assert len(controls)>=3 and all(controls[i]['height']<controls[i+1]['height'] for i in range(len(controls)-1))
for row in controls:
 for key in ['source','canonical']:
  assert row[key]['min'][0]<0<row[key]['max'][0] and row[key]['min'][2]<0<row[key]['max'][2], 'A complete occupied torso section is required.'
def smooth(lo,hi,value):
 t=max(0,min(1,(value-lo)/(hi-lo)));return t*t*(3-2*t)
def sample(y):
 if y<=controls[0]['height']:return controls[0]
 if y>=controls[-1]['height']:return controls[-1]
 first=next(i for i in range(len(controls)-1) if controls[i]['height']<=y<=controls[i+1]['height']);left,right=controls[first:first+2];t=smooth(left['height'],right['height'],y)
 return {key:{bound:[left[key][bound][axis]*(1-t)+right[key][bound][axis]*t for axis in range(3)] for bound in ['min','max']} for key in ['source','canonical']}
def distance(point,segments):
 result=float('inf')
 for first,last in segments:
  start=Vector(joints[first]);axis=Vector(joints[last])-start;t=max(0,min(1,(point-start).dot(axis)/axis.length_squared));result=min(result,(point-start-axis*t).length)
 return result
spine=[('Hips','Chest'),('Chest','Neck')];arms=[(name+'_'+side,end+'_'+side) for side in ['L','R'] for name,end in [('UpperArm','LowerArm'),('LowerArm','Hand')]]
def calibrate(point):
 weight=smooth(hip,controls[0]['height'],point.y)*(1-smooth(controls[-1]['height'],neck,point.y))
 if not weight:return point
 torso=distance(point,spine);arm=distance(point,arms);weight*=smooth(.85,1.15,arm/max(1e-8,torso));row=sample(point.y);target=point.copy()
 for axis in [0,2]:
  sourceCentre=(row['source']['min'][axis]+row['source']['max'][axis])/2;targetCentre=(row['canonical']['min'][axis]+row['canonical']['max'][axis])/2
  scale=(row['canonical']['max'][axis]-row['canonical']['min'][axis])/(row['source']['max'][axis]-row['source']['min'][axis]);target[axis]=sourceCentre+(targetCentre-sourceCentre)*weight+(point[axis]-sourceCentre)*(1+(scale-1)*weight)
 return target
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH'];shared={};records=[]
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for obj in objects:
 for vertex in obj.data.vertices:
  point=Vector((vertex.co.x,vertex.co.z,-vertex.co.y));key=tuple(round(v,6) for v in point);mapped=point if obj.get('garmentRegion') in ['footwear','mantle'] else calibrate(point);shared.setdefault(key,[]).append((obj,vertex,point,mapped))
changes=[]
for key,entries in shared.items():
 mapped=sum((entry[3] for entry in entries),Vector())/len(entries)
 for obj,vertex,original,_ in entries:
  vertex.co=Vector((mapped.x,-mapped.z,mapped.y));movement=(mapped-original).length
  if movement>1e-7:changes.append({'mesh':obj.name,'source':list(original),'target':list(mapped),'metres':movement})
for obj in objects:
 obj.data.update()
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
 records.append({'mesh':obj.name,'region':obj.get('garmentRegion'),'triangles':len(obj.data.polygons)})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
provenance=json.loads(a.source.with_suffix('.provenance.json').read_text());result={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':data['sourceSha256'],'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':provenance,'sourceCageCalibration':{'measurements':data,'controlsSha256':hashlib.sha256(a.controls.read_bytes()).hexdigest(),'changes':changes,'maximumDisplacementMetres':max((row['metres'] for row in changes),default=0),'verticesDisplaced':len(changes),'sourceTopology':records,'policy':'continuous measured reference-to-canonical transverse affine calibration; spine/arm partition and hips/collar fades; shared source boundaries sewn; no wear clearance, collision, new triangles, body deletion or per-DNA branches'}}
for key in ['style','lod','fit','frame','garmentBind','authoringCalibration']:
 if key in provenance:result[key]=provenance[key]
a.output.with_suffix('.provenance.json').write_text(json.dumps(result,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('TRANSVERSE_CAGE_CALIBRATION',len(changes),result['sourceCageCalibration']['maximumDisplacementMetres'],flush=True)
