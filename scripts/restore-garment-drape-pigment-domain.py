"""Restore shaded main-fabric ownership from its measured native pigment.

The old whole-face value classifier called dark fabric trousers. Grow only the
original source pigment family from existing main-drape faces, across shared
edges below the measured attached waist. Positions, UVs and palette are intact.
"""
import argparse,bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('audit',type=Path);p.add_argument('output',type=Path);p.add_argument('--chroma-distance',type=float,default=.045);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True);audit=json.loads(a.audit.read_text());assert audit['sha256']==hashlib.sha256(a.source.read_bytes()).hexdigest();rows=audit['faces'];bind=json.loads((a.source.parent/'garment-bind.json').read_text())['joints'];hip=bind['Hips'][1];waist=hip+(bind['Chest'][1]-hip)/3
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
def key(p):return tuple(round(v,6) for v in p)
edgeFaces={};neighbours={i:set() for i in range(len(rows))}
for i,row in enumerate(rows):
 for k in range(3):edge=tuple(sorted([key(row['points'][k]),key(row['points'][(k+1)%3])]));edgeFaces.setdefault(edge,[]).append(i)
for faces in edgeFaces.values():
 for first in faces:neighbours[first].update(set(faces)-{first})
seeds=[i for i,row in enumerate(rows) if row['region']=='skirt'];assert seeds;family=sum((Vector(rows[i]['chroma'])*rows[i]['area'] for i in seeds),Vector())/sum(rows[i]['area'] for i in seeds)
eligible={i for i,row in enumerate(rows) if row['region'] in ['cloth','skirt'] and row['centre'][1]<waist+1e-6 and (Vector(row['chroma'])-family).length<a.chroma_distance}
selected=set(seeds);pending=list(seeds)
while pending:
 current=pending.pop()
 for other in neighbours[current]:
  if other in eligible and other not in selected:selected.add(other);pending.append(other)
changes=[{**rows[i],'newRegion':'skirt','nativeChromaDistance':(Vector(rows[i]['chroma'])-family).length} for i in selected if rows[i]['region']!='skirt'];faceLookup={(row['mesh'],row['face']):row for row in changes}
for obj in objects:
 changed={face for (name,face) in faceLookup if name==obj.name}
 if not changed:continue
 original=obj.copy();original.data=obj.data.copy();bpy.context.scene.collection.objects.link(original);original.name=obj.name+'_native_shaded_drape';original['garmentRegion']='skirt'
 for target,keep in [(original,changed),(obj,set(range(len(obj.data.polygons)))-changed)]:
  bm=bmesh.new();bm.from_mesh(target.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(target.data);bm.free();target.data.update()
  for face in target.data.polygons:face.use_smooth=False
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':audit['sha256'],'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'sourceDrapeOwnership':{'authority':'existing main-drape native normalized pigment family grown only across source shared edges below measured Hips→Chest waist','nativeFamily':list(family),'maximumChromaDistance':a.chroma_distance,'waistMetres':waist,'changes':changes,'verticesDisplaced':0,'trianglesAdded':0,'paletteChanged':False}};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('RESTORED_NATIVE_DRAPE',len(changes),list(family),flush=True)
