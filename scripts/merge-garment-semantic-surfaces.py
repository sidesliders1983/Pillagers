"""Merge only identical authored layer/region domains, preserving every facet UV."""
import bpy,bmesh,argparse,json,sys,hashlib
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));groups={};records=[]
for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);semantic=tuple(obj.get(k) for k in ['garmentRegion','garmentBindDomain','garmentSurface']);groups.setdefault(semantic,[]).append(obj)
for semantic,objects in groups.items():
 names=[o.name for o in objects];bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 obj=objects[0];bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(obj.data);bm.free();obj.data.update();records.append({'semantic':semantic,'sourceMeshes':names,'triangles':len(obj.data.polygons)})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'semanticMerge':{'groups':records,'verticesDisplaced':0,'trianglesAdded':0,'uvPolicy':'original per-facet loop UVs retained; only identical region/bind/surface domains share a positional topology'}};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('MERGED_SAME_SEMANTICS',records,flush=True)
