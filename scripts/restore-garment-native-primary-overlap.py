"""Restore a native painted fabric continuation to its actual source layer.

Use the immutable native-contact face proof instead of brightness to assign
painted overlap facets. Only redundant newly authored upper-notch underlay is
removed. Original external surface, palette, trousers and points stay exact.
"""
import argparse,bpy,bmesh,json,sys,hashlib,itertools
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--native-ownership',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True);record=json.loads(a.source.with_suffix('.provenance.json').read_text());ownership=json.loads(a.native_ownership.read_text());assert ownership['sourceSha256']==hashlib.sha256(a.source.read_bytes()).hexdigest();patches=[p for r in record['fabricOverlapUnderlay']['records'] for p in r['patches'] if p['policy']=='native upper-rim overlap notch underlay'];assert patches
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];reports=[];removed=[]
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for obj in objects:
 if obj.get('garmentRegion')!='skirt' or obj.get('garmentSurface')=='accessory':continue
 bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.index_update();deletions=[]
 for face in bm.faces:
  points=[v.co for v in face.verts]
  for patch in patches:
   expected=[Vector(p) for p in patch['pointsBlender']]
   if min(max((points[i]-expected[j]).length for i,j in enumerate(order)) for order in itertools.permutations(range(3)))<2e-6:deletions.append(face);removed.append({'mesh':obj.name,'triangle':face.index,'originalPatchLineage':patch});break
 bmesh.ops.delete(bm,geom=deletions,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(obj.data);bm.free();obj.data.update()
assert len(removed)==len(patches),(len(removed),len(patches))
for proof in ownership['sourceAccessoryOwnership']['records']:
 obj=next(o for o in objects if o.name==proof['mesh']);selected={row['originalSourceFace'] for row in proof['selectedOriginalSourceFaces']};clone=obj.copy();clone.data=obj.data.copy();clone.name=obj.name+'_native_primary_overlap';bpy.context.scene.collection.objects.link(clone);clone['garmentRegion']='skirt'
 for target,keep in [(clone,selected),(obj,set(range(len(obj.data.polygons)))-selected)]:
  bm=bmesh.new();bm.from_mesh(target.data);bm.faces.index_update();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(target.data);bm.free();target.data.update()
 reports.append({'sourceMesh':obj.name,'primaryOverlapMesh':clone.name,'nativePrimaryFacets':proof['selectedOriginalSourceFaces'],'sourceVerticesDisplaced':0,'sourcePigmentUVRetained':True})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);result={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':record,'nativeOverlapOwnershipRepair':{'authority':'exact original native external-surface painted fabric continuation, matched to the original main-fabric rim','nativeProof':str(a.native_ownership.resolve()),'nativeProofSha256':hashlib.sha256(a.native_ownership.read_bytes()).hexdigest(),'primaryNativeFacets':reports,'onlyRedundantNewUnderlayRemoved':removed,'sourceVerticesDisplaced':0,'productionWearClearanceBaked':False}};a.output.with_suffix('.provenance.json').write_text(json.dumps(result,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('NATIVE_PRIMARY',[(r['primaryOverlapMesh'],len(r['nativePrimaryFacets'])) for r in reports],len(removed),flush=True)
