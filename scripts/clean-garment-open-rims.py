"""Remove bounded high-frequency aliasing from intentional native garment rims.

Only degree-two open boundary paths move. True shared semantic seams and source
silhouette extrema are protected. Every original triangle and facet UV remains;
the maximum coordinate deviation is recorded for independent source review.
"""
import argparse,bpy,bmesh,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--maximum-displacement',type=float,default=.005);p.add_argument('--iterations',type=int,default=3);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert 0<a.maximum_displacement<=.005;assert 1<=a.iterations<=5;assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
def key(point):return tuple(round(v,6) for v in point)
owners={}
for obj in objects:
 for vertex in obj.data.vertices:owners.setdefault(key(vertex.co),set()).add(obj.name)
records=[]
for obj in objects:
 if obj.get('garmentRegion')=='footwear':continue
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.verts.index_update();bm.edges.index_update();bm.faces.index_update();boundary={v for v in bm.verts if any(edge.is_boundary for edge in v.link_edges)};original={v:v.co.copy() for v in boundary};protected={v for v in boundary if len(owners.get(key(v.co),[]))>1};unseen=set(boundary);loops=[]
 while unseen:
  first=unseen.pop();component={first};pending=[first]
  while pending:
   vertex=pending.pop()
   for edge in vertex.link_edges:
    if edge.is_boundary:
     other=edge.other_vert(vertex)
     if other in unseen:unseen.remove(other);component.add(other);pending.append(other)
  for axis in range(3):
   protected.add(min(component,key=lambda v:v.co[axis]));protected.add(max(component,key=lambda v:v.co[axis]))
  loops.append({'sourceVertices':[v.index for v in component],'sourceEdges':[edge.index for v in component for edge in v.link_edges if edge.is_boundary],'positionsBlender':[list(v.co) for v in component],'closed':all(sum(e.is_boundary for e in v.link_edges)==2 for v in component)})
 for iteration in range(a.iterations):
  target={}
  for vertex in boundary-protected:
   neighbours=[edge.other_vert(vertex) for edge in vertex.link_edges if edge.is_boundary]
   if len(neighbours)!=2:continue
   point=vertex.co.lerp((neighbours[0].co+neighbours[1].co)*.5,.35);delta=point-original[vertex]
   if delta.length>a.maximum_displacement:point=original[vertex]+delta.normalized()*a.maximum_displacement
   target[vertex]=point
  for vertex,point in target.items():vertex.co=point
 bm.normal_update();changes=[{'sourceVertex':v.index,'sourceFaces':[f.index for f in v.link_faces],'sourceBlender':list(point),'targetBlender':list(v.co),'metres':(v.co-point).length} for v,point in original.items() if (v.co-point).length>1e-8];bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
 records.append({'mesh':obj.name,'semantic':{k:obj.get(k) for k in ['garmentRegion','garmentBindDomain','garmentSurface']},'loops':loops,'changes':changes,'protectedSharedSeamOrExtremumVertices':len(protected),'maximumDeviationMetres':max((row['metres'] for row in changes),default=0)})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'sourceRimCleanup':{'maximumDisplacementMetres':a.maximum_displacement,'iterations':a.iterations,'records':records,'policy':'bounded native degree-two rim relaxation; shared true seams and measured silhouette extrema unchanged; no closed hem, replacement panels, wear clearance or body masking'}};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('BOUNDED_RIMS',[(r['mesh'],len(r['changes']),r['maximumDeviationMetres']) for r in records],flush=True)
