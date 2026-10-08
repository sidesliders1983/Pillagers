"""Bounded source-rim repair and explicit thin accessory layer separation.

Repairs only two open vertex fans within the same source surface. It adds the
minimum missing corner triangle, retaining the intentional remaining open rim.
Source UV pigments, contours and all original vertices remain unchanged, except
an explicitly requested semantic accessory thickness, recorded independently of
production body wear clearance. Isolated Blender CLI; never overwrite inputs.
"""
import argparse, bpy, bmesh, hashlib, json, sys
from pathlib import Path
from mathutils import Vector

p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--accessory-layer-thickness',type=float,default=0);p.add_argument('--maximum-corner-gap',type=float,default=.015);p.add_argument('--maximum-corner-area',type=float,default=.000075)
p.add_argument('--quality-report',type=Path,required=True,help='Global metric-welded source audit; only these actual invalid global vertices may be repaired. Semantic mesh seams are not defects.')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();assert 0<=a.accessory_layer_thickness<=.002;a.output.parent.mkdir(parents=True,exist_ok=True)
quality=json.loads(a.quality_report.read_text());assert quality['sha256']==hashlib.sha256(a.source.read_bytes()).hexdigest(),'The global topology report must describe these exact immutable source bytes.'
global_invalid=[Vector((v['position'][0],-v['position'][2],v['position'][1])) for v in quality['vertexLinkDetails']]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));records=[]
for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.faces.index_update();bm.edges.index_update();source_face_ids={face:face.index for face in bm.faces};source_edge_ids={edge:edge.index for edge in bm.edges};bm.normal_update();uv=bm.loops.layers.uv.active;repairs=[];unresolved=[]
 for vertex in list(bm.verts):
  if not any((vertex.co-point).length<2e-6 for point in global_invalid):continue
  remaining=set(vertex.link_faces);fans=[]
  while remaining:
   first=remaining.pop();fan={first};pending=[first]
   while pending:
    face=pending.pop()
    for edge in face.edges:
     if vertex not in edge.verts:continue
     for neighbour in edge.link_faces:
      if neighbour in remaining:remaining.remove(neighbour);fan.add(neighbour);pending.append(neighbour)
   fans.append(fan)
  if len(fans)<=1:continue
  endpoints=[]
  for fan in fans:
   neighbours={edge.other_vert(vertex) for face in fan for edge in face.edges if vertex in edge.verts and sum(f in fan for f in edge.link_faces)==1}
   endpoints.append(list(neighbours))
  if len(fans)!=2 or any(len(ends)!=2 for ends in endpoints):unresolved.append({'point':list(vertex.co),'fans':len(fans),'reason':'not two open rim paths'});continue
  candidates=[]
  for first in endpoints[0]:
   for second in endpoints[1]:
    gap=(first.co-second.co).length;cross=(first.co-vertex.co).cross(second.co-vertex.co);area=cross.length/2
    if gap<=a.maximum_corner_gap and 1e-10<area<=a.maximum_corner_area:candidates.append((gap,area,first,second))
  if not candidates:unresolved.append({'point':list(vertex.co),'fans':2,'reason':'source gap exceeds bounded corner repair'});continue
  gap,area,first,second=min(candidates,key=lambda row:(row[0],row[1]));normal=sum((face.normal*face.calc_area() for face in vertex.link_faces),Vector());corners=[vertex,first,second]
  if (first.co-vertex.co).cross(second.co-vertex.co).dot(normal)<0:corners.reverse()
  original_faces=sorted(source_face_ids[face] for face in vertex.link_faces if face in source_face_ids);original_edges=sorted(source_edge_ids[edge] for edge in vertex.link_edges if edge in source_edge_ids);original_corner_points=[list(corner.co) for corner in corners]
  try:new=bm.faces.new(corners)
  except ValueError:unresolved.append({'point':list(vertex.co),'fans':2,'reason':'existing face prevents bridge'});continue
  old=min((face for face in fans[0]|fans[1] if face in source_face_ids),key=lambda face:(face.calc_center_median()-new.calc_center_median()).length);new.material_index=old.material_index;sample=sum((loop[uv].uv for loop in old.loops),Vector((0,0)))/len(old.loops)
  for loop in new.loops:loop[uv].uv=sample
  repairs.append({'point':list(vertex.co),'gapMetres':gap,'addedAreaMetresSquared':area,'addedTriangles':1,'sourceVerticesDisplaced':0,'sourceIncidentFaces':original_faces,'sourceIncidentEdges':original_edges,'originalCornerPointsBlender':original_corner_points,'sourcePaletteFace':source_face_ids[old],'sourcePaletteUV':[list(loop[uv].uv) for loop in old.loops],'patchUV':list(sample)})
 bm.normal_update();shifted=0
 if a.accessory_layer_thickness and obj.get('garmentSurface')=='accessory':
  for vertex in bm.verts:
   if vertex.normal.length>1e-8:vertex.co+=vertex.normal.normalized()*a.accessory_layer_thickness;shifted+=1
 bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
 records.append({'mesh':obj.name,'region':obj.get('garmentRegion'),'surface':obj.get('garmentSurface','main'),'cornerRepairs':repairs,'unresolvedSourceCorners':unresolved,'accessoryThicknessMetres':a.accessory_layer_thickness if shifted else 0,'accessoryVerticesDisplaced':shifted})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
source=json.loads(a.source.with_suffix('.provenance.json').read_text());record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':source,'geometryOptimization':{'boundedSourceCornerRepairs':records,'maximumCornerGapMetres':a.maximum_corner_gap,'maximumCornerAreaMetresSquared':a.maximum_corner_area,'accessoryPolicy':'actual source accessory surface thickness; separate from body wear clearance; applied once during authoring; shared runtime unchanged'}}
for key in ['style','lod','fit','frame','garmentBind','authoringCalibration']:
 if key in source:record[key]=source[key]
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n')
bind=a.source.parent/'garment-bind.json'
if bind.exists():(a.output.parent/'garment-bind.json').write_bytes(bind.read_bytes())
print('SOURCE_BOUNDARY_REPAIR',json.dumps(records),flush=True)
