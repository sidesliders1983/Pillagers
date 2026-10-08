"""Detach measured free-drape/trouser interfaces without closing the open hem.

The generated reference has one external figure surface, so cloth and trousers
can meet on the same source edge. That colour-domain edge is not a sewn hem:
the two existing source layers need independent motion. Only the free fabric
incident to those measured lower interfaces receives a thin authored stand-off.
The actual waist and upper seams retain their coincident points. This operation
never adds body wear clearance, changes triangles/UVs, or removes trousers.
"""
import argparse,bpy,bmesh,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--thickness',type=float,default=.002);p.add_argument('--audit-only',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert 0<a.thickness<=.002;assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bind=json.loads((a.source.parent/'garment-bind.json').read_text());hips=Vector(bind['joints']['Hips']);hip=hips.y
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
def point(vertex):return Vector((vertex.co.x,vertex.co.z,-vertex.co.y))
def key(position):return tuple(round(v,6) for v in position)
edges={};vertex_owners={}
for obj in objects:
 region=obj.get('garmentRegion');positions=[point(v) for v in obj.data.vertices]
 for face in obj.data.polygons:
  for vertex in face.vertices:vertex_owners.setdefault(key(positions[vertex]),set()).add(region)
  for i in range(len(face.vertices)):
   first,last=positions[face.vertices[i]],positions[face.vertices[(i+1)%len(face.vertices)]];edge=tuple(sorted([key(first),key(last)]));edges.setdefault(edge,[]).append({'mesh':obj.name,'region':region,'surface':obj.get('garmentSurface','main'),'face':face.index})
interfaces=[];seeds=set()
for edge,owners in edges.items():
 regions={owner['region'] for owner in owners}
 if regions=={'cloth','skirt'} and max(p[1] for p in edge)<hip-1e-6 and any(owner['region']=='skirt' and owner['surface']=='main' for owner in owners):
  interfaces.append({'points':edge,'owners':owners,'lengthMetres':(Vector(edge[0])-Vector(edge[1])).length});seeds.update(edge)
changes=[];records=[]
for obj in objects:
 if obj.get('garmentRegion')!='skirt' or obj.get('garmentSurface')=='accessory':continue
 # Select only connected free fabric supported by an actual shared lower rim.
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.verts.ensure_lookup_table();pending=[v for v in bm.verts if key(point(v)) in seeds];connected=set(pending)
 while pending:
  vertex=pending.pop()
  for edge in vertex.link_edges:
   other=edge.other_vert(vertex)
   if other not in connected and point(other).y<hip-1e-6:connected.add(other);pending.append(other)
 for vertex in connected:
  original=point(vertex);radial=Vector((original.x-hips.x,0,original.z-hips.z))
  if radial.length<1e-8:continue
  # Shared waist remains exact. A one-facet measured interface-scale fade
  # makes the thin layer approach its sewn waist continuously.
  incident=[row['lengthMetres'] for row in interfaces if key(original) in row['points']];fade=max(1e-6,min(.05,max(incident,default=.03)));factor=max(0,min(1,(hip-original.y)/fade));mapped=original+radial.normalized()*a.thickness*factor
  changes.append({'mesh':obj.name,'sourcePoint':list(original),'targetPoint':list(mapped),'metres':(mapped-original).length,'sourceFaces':[f.index for f in vertex.link_faces]})
  if not a.audit_only:vertex.co=Vector((mapped.x,-mapped.z,mapped.y))
 if not a.audit_only:bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);obj.data.update()
 bm.free();records.append({'mesh':obj.name,'affectedVertices':len(connected)})
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'wearLayerSeparation':{'authority':'original positional edge adjacency between main skirt fabric and leg cloth below measured Hips; intentional free hem is not a sewn trouser seam','hips':list(hips),'thicknessMetres':a.thickness,'interfaces':interfaces,'changes':changes,'maximumDisplacementMetres':max((row['metres'] for row in changes),default=0),'records':records,'trianglePolicy':'all original facets and UV loops retained; no lower trousers/body removed; no production wear clearance baked; upper waist/bodice/cuff seams unchanged'}}
if not a.audit_only:
 for obj in objects:
  for face in obj.data.polygons:face.use_smooth=False
 bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);record['outputSha256']=hashlib.sha256(a.output.read_bytes()).hexdigest();a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes())
else:a.output.with_suffix('.audit.json').write_text(json.dumps(record,indent=2)+'\n')
print('SOURCE_WEAR_LAYER',len(interfaces),len(changes),record['wearLayerSeparation']['maximumDisplacementMetres'],flush=True)
