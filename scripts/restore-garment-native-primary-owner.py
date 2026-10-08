"""Assign a proved native fabric continuation before source layer separation.

Exact immutable triangle coordinates and ancestry are required. The proof may
come from a later diagnostic stage; only corresponding original input facets
are retagged. No geometry, source UV, palette, or production fit is altered.
"""
import argparse,bpy,bmesh,json,sys,hashlib,itertools
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--native-ownership',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True);sourceSHA=hashlib.sha256(a.source.read_bytes()).hexdigest();record=json.loads(a.source.with_suffix('.provenance.json').read_text());proof=json.loads(a.native_ownership.read_text());ancestor=proof
while ancestor.get('sourceSha256')!=sourceSHA and isinstance(ancestor.get('sourceProvenance'),dict):ancestor=ancestor['sourceProvenance']
assert ancestor.get('sourceSha256')==sourceSHA,'Native diagnostic proof must descend from this exact earlier authoring surface.'
evidence=[row for r in proof['sourceAccessoryOwnership']['records'] for row in r['selectedOriginalSourceFaces']];assert all('sourceFacetCornersBlender' in row for row in evidence)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];reports=[];matched=set()
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for obj in objects:
 if obj.get('garmentRegion')!='cloth':continue
 selected=[];matches=[]
 for face in obj.data.polygons:
  points=[obj.data.vertices[i].co for i in face.vertices]
  for proofId,row in enumerate(evidence):
   target=[Vector(p) for p in row['sourceFacetCornersBlender']]
   if min(max((points[i]-target[j]).length for i,j in enumerate(order)) for order in itertools.permutations(range(3)))<2e-6:selected.append(face.index);matches.append({'sourceTriangle':face.index,'immutableNativeProofTriangle':row});matched.add(proofId);break
 if not selected:continue
 clone=obj.copy();clone.data=obj.data.copy();clone.name=obj.name+'_native_primary';bpy.context.scene.collection.objects.link(clone);clone['garmentRegion']='skirt';chosen=set(selected)
 for target,keep in [(clone,chosen),(obj,set(range(len(obj.data.polygons)))-chosen)]:
  bm=bmesh.new();bm.from_mesh(target.data);bm.faces.index_update();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(target.data);bm.free();target.data.update()
 reports.append({'sourceMesh':obj.name,'newPrimaryMesh':clone.name,'nativeFacets':matches,'sourceVerticesDisplaced':0,'sourceUVPalettePreserved':True})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);result={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':sourceSHA,'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':record,'nativeFabricOwnershipBeforeLayerSeparation':{'authority':'exact immutable source-face/UV correspondence and native rim contact; retain all original geometry','nativeProof':str(a.native_ownership.resolve()),'nativeProofSha256':hashlib.sha256(a.native_ownership.read_bytes()).hexdigest(),'records':reports,'unmatchedLaterDiagnosticFacets':[row for i,row in enumerate(evidence) if i not in matched],'sourceVerticesDisplaced':0,'productionWearClearanceBaked':False}};a.output.with_suffix('.provenance.json').write_text(json.dumps(result,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('NATIVE_PRIMARY_BEFORE_LAYER',[(r['newPrimaryMesh'],len(r['nativeFacets'])) for r in reports],'later-only',len(evidence)-len(matched),flush=True)
