"""Remove independently measured single-facet ears from intentional open rims.
Exact source-hash controls preserve the remaining source points, facets and UVs.
The native rim retreats only to its original neighbouring edge; it is not capped.
"""
import argparse,bpy,bmesh,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--controls',type=Path,required=True)
p.add_argument('--maximum-ear-area',type=float,default=.000075);p.add_argument('--maximum-contour-retreat',type=float,default=.01)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();controls=json.loads(a.controls.read_text());assert controls['sourceSha256']==hashlib.sha256(a.source.read_bytes()).hexdigest();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));records=[]
for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();bm.faces.index_update();bm.normal_update();uv=bm.loops.layers.uv.active
 for control in controls['ears']:
  if obj.get('garmentRegion')!=control['region']:continue
  goal=Vector((control['tip'][0],-control['tip'][2],control['tip'][1]));matches=[v for v in bm.verts if (v.co-goal).length<2e-6]
  if not matches:continue
  assert len(matches)==1;tip=matches[0];assert len(tip.link_faces)==1 and len(tip.link_edges)==2,'Only a true single-facet boundary ear may be removed.'
  face=tip.link_faces[0];assert len(face.verts)==3 and sum(e.is_boundary for e in face.edges)==2;area=face.calc_area();assert area<=a.maximum_ear_area
  neighbours=[edge.other_vert(tip) for edge in tip.link_edges];first,second=neighbours;edge=second.co-first.co;fraction=max(0,min(1,(tip.co-first.co).dot(edge)/edge.length_squared));retreat=(tip.co-first.co-edge*fraction).length;assert retreat<=a.maximum_contour_retreat+1e-6
  record={'sourceFace':control['faceIndex'],'originalTipCanonical':control['tip'],'originalCornersBlender':[list(v.co) for v in face.verts],'originalUV':[list(loop[uv].uv) for loop in face.loops],'normalBlender':list(face.normal),'removedAreaMetresSquared':area,'maximumContourDeviationMetres':retreat,'originalVerticesMoved':0,'rimPolicy':'original opposite edge becomes the same intentional open wear rim; no cap or replacement panel'}
  bmesh.ops.delete(bm,geom=[face],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');records.append(record)
 bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
assert len(records)==len(controls['ears']),'Every independent measured ear must be found exactly once.'
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'nativeRimEarCleanup':{'controls':str(a.controls.resolve()),'controlsSha256':hashlib.sha256(a.controls.read_bytes()).hexdigest(),'records':records,'trianglesRemoved':len(records),'productionClearanceBaked':False}}
bind=a.source.parent/'garment-bind.json';bindbytes=bind.read_bytes();(a.output.parent/'garment-bind.json').write_bytes(bindbytes);record['outputGarmentBind']={'frame':'universal-human-neutral-v1','units':'metres','up':'+Y','front':'+Z','origin':'ground','joints':json.loads(bindbytes)['joints'],'metadataSha256':hashlib.sha256(bindbytes).hexdigest()}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('NATIVE_RIM_EARS_REMOVED',len(records),'AREA',sum(r['removedAreaMetresSquared'] for r in records),'MAX_DEVIATION',max(r['maximumContourDeviationMetres'] for r in records),flush=True)
