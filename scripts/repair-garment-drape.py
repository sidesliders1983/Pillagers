"""Repair a source-derived outer drape shell without changing its silhouette.

Independent Blender scene; never overwrite the original. A source drape cage
supplies the existing outer vertices and excludes the generated figure's inward
leg joins. Waist and hem caps are removed; source atlas colours are transferred
from the nearest original garment triangle. No body mesh is modified.
"""
import argparse, bpy, bmesh, json, sys, hashlib, math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path)
p.add_argument('--stitch-measured-waist',action='store_true',help='Join the exact split source waist ring to the source outer-cage rim, retaining both contours and original pigment.')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
source_record=json.loads(a.source.with_suffix('.provenance.json').read_text())
waist=source_record.get('sourceDrapeInterface',{}).get('heightMetres')
assert not a.stitch_measured_waist or source_record.get('sourceDrapeInterface',{}).get('splitBeforeSemanticOwnership'), 'Waist stitching requires an exact measured source surface split.'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
waist_source=[]
if a.stitch_measured_waist:
 for upper in bpy.context.scene.objects:
  if upper.type!='MESH' or upper.get('garmentRegion')!='cloth':continue
  ring_mesh=bmesh.new();ring_mesh.from_mesh(upper.data)
  for vertex in ring_mesh.verts:vertex.co=upper.matrix_world@vertex.co
  bmesh.ops.remove_doubles(ring_mesh,verts=list(ring_mesh.verts),dist=1e-6)
  for edge in ring_mesh.edges:
   if edge.is_boundary and all(abs(vertex.co.z-waist)<2e-6 for vertex in edge.verts):waist_source.extend(vertex.co.copy() for vertex in edge.verts)
  ring_mesh.free()
 unique={tuple(round(v[i],6) for i in range(3)):v for v in waist_source};waist_source=list(unique.values())
 assert len(waist_source)>8, 'Measured upper source waist ring is missing.'
records=[]
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH' or obj.get('garmentRegion')!='skirt' or obj.get('garmentSurface')=='accessory':continue
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 original=bmesh.new();original.from_mesh(obj.data);bmesh.ops.remove_doubles(original,verts=list(original.verts),dist=.000002);original.verts.ensure_lookup_table();original.verts.index_update();original.faces.ensure_lookup_table();original.faces.index_update()
 uv=original.loops.layers.uv.active
 image=next(n.image for n in obj.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image);size=tuple(image.size);pixels=list(image.pixels[:]);channels=image.channels
 def accent(face):
  sample=sum((loop[uv].uv for loop in face.loops),Vector((0,0)))/len(face.loops);x=max(0,min(size[0]-1,int(sample.x*size[0])));y=max(0,min(size[1]-1,int(sample.y*size[1])));offset=(y*size[0]+x)*channels;r,g,b=pixels[offset:offset+3]
  return r>g*1.7 and r>b*1.8
 accessories=[face for face in original.faces if accent(face)];fabric=[face for face in original.faces if face not in accessories]
 if accessories:
  clone=obj.copy();clone.data=obj.data.copy();bpy.context.collection.objects.link(clone);copy=bmesh.new();copy.from_mesh(clone.data);copy.faces.ensure_lookup_table();keep={face.index for face in accessories};bmesh.ops.delete(copy,geom=[f for f in copy.faces if f.index not in keep],context='FACES');bmesh.ops.delete(copy,geom=[v for v in copy.verts if not v.link_faces],context='VERTS');copy.to_mesh(clone.data);copy.free();clone.name=obj.name+'_source_ties';clone['garmentSurface']='accessory'
 points=[v.co.copy() for v in original.verts];triangles=[tuple(v.index for v in f.verts) for f in fabric]
 tree=BVHTree.FromPolygons(points,triangles);samples=[sum((loop[uv].uv for loop in f.loops),Vector((0,0)))/len(f.loops) for f in fabric];outerPoints=[v.co.copy() for v in {v for face in fabric for v in face.verts}]
 low=min(v.z for v in points);high=max(v.z for v in points);height=high-low
 hull=bmesh.new();vertices=[hull.verts.new(v) for v in outerPoints];result=bmesh.ops.convex_hull(hull,input=vertices,use_existing_faces=False)
 unused=[v for v in hull.verts if not v.link_faces]
 if unused:bmesh.ops.delete(hull,geom=unused,context='VERTS')
 bmesh.ops.recalc_face_normals(hull,faces=list(hull.faces))
 # The source cage closes the horizontal openings. Remove their top/bottom
 # facets explicitly; the remaining side silhouette is the original envelope.
 caps=[f for f in hull.faces if abs(f.normal.z)>.65 and (f.calc_center_median().z<low+height*.12 or f.calc_center_median().z>high-height*.10)]
 bmesh.ops.delete(hull,geom=caps,context='FACES');bmesh.ops.delete(hull,geom=[v for v in hull.verts if not v.link_faces],context='VERTS')
 bmesh.ops.triangulate(hull,faces=list(hull.faces));layer=hull.loops.layers.uv.new('UVMap')
 bridge_faces=0;bridge_width=0
 if a.stitch_measured_waist:
  # The cage may omit collinear/concave source-ring points. A minimal planar
  # zipper connects those exact contours instead of leaving point-only fans
  # or retaining a third sheet at the bodice interface.
  rim_edges=[edge for edge in hull.edges if edge.is_boundary and all(abs(v.co.z-waist)<2e-6 for v in edge.verts)]
  # A source ring point exactly on a cage edge must become a true shared edge
  # vertex, rather than remain an unconnected T-junction within that edge.
  for point in waist_source:
   for edge in list(rim_edges):
    first,last=edge.verts;axis=last.co-first.co;t=(point-first.co).dot(axis)/max(axis.length_squared,1e-12)
    if 1e-6<t<1-1e-6 and (point-first.co-axis*t).length<1e-6:
     new_edge,new_vertex=bmesh.utils.edge_split(edge,first,t);new_vertex.co=point;rim_edges.append(new_edge);break
  outer=list({v for edge in rim_edges for v in edge.verts})
  assert len(outer)>3, 'Source outer-cage waist rim is missing.'
  centre=sum(waist_source,Vector())/len(waist_source)
  angle=lambda point:math.atan2(point.y-centre.y,point.x-centre.x)
  inner=sorted(waist_source,key=angle);outer.sort(key=lambda v:angle(v.co))
  existing={tuple(round(v.co[i],6) for i in range(3)):v for v in hull.verts}
  inner_vertices=[]
  for point in inner:
   key=tuple(round(point[i],6) for i in range(3))
   if key not in existing:existing[key]=hull.verts.new(point)
   inner_vertices.append(existing[key])
  inner_angles=[angle(v.co) for v in inner_vertices];outer_angles=[angle(v.co) for v in outer]
  origin=min(inner_angles[0],outer_angles[0]);i=next((k-1 for k,value in enumerate(inner_angles) if value>=origin),len(inner_vertices)-1);j=next((k-1 for k,value in enumerate(outer_angles) if value>=origin),len(outer)-1)
  moved_i=moved_j=0
  while moved_i<len(inner_vertices) or moved_j<len(outer):
   ni=(i+1)%len(inner_vertices);nj=(j+1)%len(outer)
   ai=inner_angles[ni]+(2*math.pi if ni<=i else 0);aj=outer_angles[nj]+(2*math.pi if nj<=j else 0)
   # Compare event angles in the same monotonically increasing revolution.
   while ai<origin-1e-8:ai+=2*math.pi
   while aj<origin-1e-8:aj+=2*math.pi
   if moved_i>=len(inner_vertices):ai=float('inf')
   if moved_j>=len(outer):aj=float('inf')
   if abs(ai-aj)<1e-8:
    corners=[inner_vertices[i],outer[j],outer[nj],inner_vertices[ni]];i=ni;j=nj;moved_i+=1;moved_j+=1;origin=ai
   elif ai<aj:
    corners=[inner_vertices[i],outer[j],inner_vertices[ni]];i=ni;moved_i+=1;origin=ai
   else:
    corners=[inner_vertices[i],outer[j],outer[nj]];j=nj;moved_j+=1;origin=aj
   corners=list(dict.fromkeys(corners))
   if len(corners)<3:continue
   try:face=hull.faces.new(corners)
   except ValueError:continue
   if face.calc_area()<1e-10:hull.faces.remove(face);continue
   bridge_faces+=1
  bmesh.ops.triangulate(hull,faces=list(hull.faces));bmesh.ops.recalc_face_normals(hull,faces=list(hull.faces))
  for point in inner:
   distances=[]
   for first,last in zip(outer,outer[1:]+outer[:1]):
    axis=last.co-first.co;t=max(0,min(1,(point-first.co).dot(axis)/max(axis.length_squared,1e-12)));distances.append((point-first.co-axis*t).length)
   bridge_width=max(bridge_width,min(distances))
 for f in hull.faces:
  hit=tree.find_nearest(f.calc_center_median());sample=samples[hit[2]]
  for loop in f.loops:loop[layer].uv=sample
  f.smooth=False
 records.append({'region':'skirt','sourceTriangles':len(original.faces),'repairedTriangles':len(hull.faces),'preservedSourceAccessoryTriangles':len(accessories),'sourceBounds':{'min':[min(v[i] for v in points) for i in range(3)],'max':[max(v[i] for v in points) for i in range(3)]},'removedOpeningCaps':len(caps),'sourceWaistTransition':{'enabled':a.stitch_measured_waist,'originalVerticesDisplaced':0,'addedPolygons':bridge_faces,'retainedSourceRingVertices':len(waist_source),'nearestOuterVertexDistanceMaxMetres':bridge_width}})
 hull.to_mesh(obj.data);hull.free();original.free();obj.data.update();obj.data.validate(clean_customdata=False)
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
source=source_record;record={'reviewRequired':True,'style':source['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'fit':source['fit'],'sourceProvenance':source,'geometryOptimization':{'drapeRepair':records,'policy':'source outer vertices/cage and original palette; original silhouette; open waist and hem; no body masking'}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_text(json.dumps(record['fit']['garmentBind'],indent=2)+'\n');print('DRAPE_REPAIRED',records,flush=True)
