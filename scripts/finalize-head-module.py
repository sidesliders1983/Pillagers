"""Finish canonical reference surfaces without touching published originals."""
import bpy,bmesh,sys,argparse,json,hashlib
from mathutils import Vector
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--kind',choices=['hair','beard'],required=True);p.add_argument('--compact-nape',action='store_true');p.add_argument('--repair-enclosed-holes',action='store_true');p.add_argument('--head-cage',type=Path);p.add_argument('--minimum-hair-height',type=float);p.add_argument('--anatomy-already-removed',action='store_true');p.add_argument('--remove-boundary-needles',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));o=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
anatomical_faces=[]
if a.kind=='hair' and not a.anatomy_already_removed:
 # Generated full busts have dark facial/neck shadows in the hair palette. The
 # exposed face and central neck are excluded during authoring for every style.
 anatomical_faces=[f for f in bm.faces if any(abs(v.co.x)<.09 and v.co.y<-.01 and v.co.z<.015 for v in f.verts) or (abs(f.calc_center_median().x)<.088 and f.calc_center_median().y<.085 and f.calc_center_median().z<-.10)]
 if a.head_cage:
  cage=json.loads(a.head_cage.read_text());hull=bmesh.new();vs=[hull.verts.new((x,-z,y)) for x,y,z in cage['points']];bmesh.ops.convex_hull(hull,input=vs);bmesh.ops.recalc_face_normals(hull,faces=list(hull.faces));planes=[(f.normal.copy(),f.normal.dot(f.verts[0].co)) for f in hull.faces];hull.free()
  def facial_contact(f):
   point=f.calc_center_median()
   if not (-.14<point.z<.025 and point.y<.065):return False
   direction=point.normalized();radius=min(c/d for n,c in planes if (d:=n.dot(direction))>1e-6)
   return point.length<radius+.06
  anatomical_faces=list(set(anatomical_faces+[f for f in bm.faces if facial_contact(f)]))
 bmesh.ops.delete(bm,geom=anatomical_faces,context='FACES')
 if a.minimum_hair_height is not None:
  extra=[f for f in bm.faces if any(v.co.z<a.minimum_hair_height for v in f.verts)]
  anatomical_faces.extend(extra);bmesh.ops.delete(bm,geom=extra,context='FACES')
 # Source classification may leave needle facets on a patch perimeter. Their
 # sub-millimetre tips carry no reference silhouette detail at prototype scale.
 needles=[]
 for face in bm.faces if a.remove_boundary_needles else []:
  if not any(e.is_boundary for e in face.edges):continue
  longest=max(e.calc_length() for e in face.edges)
  if longest>.005 and face.calc_area()/longest**2<.02:needles.append(face)
 anatomical_faces.extend(needles);bmesh.ops.delete(bm,geom=needles,context='FACES')
if a.compact_nape:
 # The compact bun reference has no hanging neck/collar module. Remove generated
 # lower-bust anatomy, retaining the original upper bun and outer cap facets.
 extra=[f for f in bm.faces if f.calc_center_median().z<-.08 or (f.calc_center_median().y>.12 and f.calc_center_median().z<.09)]
 anatomical_faces.extend(extra);bmesh.ops.delete(bm,geom=extra,context='FACES')
repaired_faces=0
if a.repair_enclosed_holes:
 # Atlas punctures can meet the legitimate outer opening at one vertex. Their
 # boundary graph then has a branch and must be decomposed into independent
 # cycles, rather than treating the whole graph as one unrepairable seam.
 adjacency={};edge_lookup={}
 for edge in bm.edges:
  if not edge.is_boundary:continue
  u,v=edge.verts;adjacency.setdefault(u,set()).add(v);adjacency.setdefault(v,set()).add(u);edge_lookup[frozenset((u,v))]=edge
 remaining=set(adjacency);cycles=[]
 while remaining:
  root=next(iter(remaining));stack=[root];parent={root:root};used={root:set()}
  while stack:
   vertex=stack.pop()
   for neighbour in adjacency[vertex]:
    if neighbour not in used:
     parent[neighbour]=vertex;stack.append(neighbour);used[neighbour]={vertex}
    elif neighbour not in used[vertex]:
     cycle=[neighbour,vertex];ancestor=parent[vertex]
     while ancestor not in used[neighbour]:cycle.append(ancestor);ancestor=parent[ancestor]
     cycle.append(ancestor);cycles.append(cycle);used[neighbour].add(vertex)
  remaining.difference_update(parent)
 loops=[]
 for cycle in cycles:
  edges=[edge_lookup[frozenset((v,cycle[(i+1)%len(cycle)]))] for i,v in enumerate(cycle)]
  loops.append((edges,set(cycle)))
 for edges,vs in loops:
  # Face/neck opening is intentional; small enclosed patches behind or above it
  # are source-atlas punctures. Bridge only their existing boundary vertices.
  mean_y=sum(v.co.y for v in vs)/len(vs);mean_z=sum(v.co.z for v in vs)/len(vs);length=sum(e.calc_length() for e in edges)
  mouth=a.kind=='beard' and abs(sum(v.co.x for v in vs)/len(vs))<.045 and mean_y<-.065 and mean_z>-.055
  if (a.kind=='hair' and length<.65 and (mean_y>.015 or mean_z>.04)) or (a.kind=='beard' and length<.15 and not mouth):
   if not all(edge.is_boundary for edge in edges):continue
   # Fan through a new interior support point. Reusing a diagonal between two
   # perimeter vertices can collide with an existing tangent face at a branched
   # atlas boundary and create a third face on an edge.
   centre=bm.verts.new(sum((v.co for v in vs),Vector())/len(vs))
   for edge in edges:
    loop=next(loop for loop in edge.link_faces[0].loops if loop.edge==edge)
    bm.faces.new((loop.link_loop_next.vert,loop.vert,centre));repaired_faces+=1
remaining=set(bm.faces);parts=[]
while remaining:
 todo=[remaining.pop()];part=[]
 while todo:
  f=todo.pop();part.append(f)
  for edge in f.edges:
   for other in edge.link_faces:
    if other in remaining:remaining.remove(other);todo.append(other)
 parts.append(part)
# Brown source clothing and forehead shadows are unrelated texture islands.
removed=[]
largest_area=max(sum(f.calc_area() for f in part) for part in parts)
for part in parts:
 zs=[v.co.z for f in part for v in f.verts]
 neck_island=a.kind=='hair' and max(zs)<-.10 and all(abs(v.co.x)<.06 and -.10<v.co.y<.085 for f in part for v in f.verts)
 if sum(f.calc_area() for f in part)<largest_area*.015 or neck_island or (a.kind=='hair' and max(zs)<-.14) or (a.kind=='beard' and (min(zs)>.005 or max(zs)<-.12)):removed.extend(part)
bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update()
data=bpy.data.meshes.new('Canonical reference facets');data.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);data.update();data.validate();bm.free();o.data=data
for f in data.polygons:f.use_smooth=False
m=bpy.data.materials.new('Profile reference hair');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;data.materials.append(m)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
prov=json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'));record={'reviewRequired':True,'style':prov['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':prov,'geometryOptimization':{'outputTriangles':sum(len(f.vertices)-2 for f in data.polygons),'removedUnrelatedIslandFaces':len(removed),'removedAnatomicalFaces':len(anatomical_faces),'repairedEnclosedHoleFaces':repaired_faces,'facetedNormals':True,'profileMaterialCount':1,'authoringParameters':{'kind':a.kind,'compactNape':a.compact_nape,'repairEnclosedHoles':a.repair_enclosed_holes,'headCageSha256':hashlib.sha256(a.head_cage.read_bytes()).hexdigest() if a.head_cage else None,'minimumHairHeightMeters':a.minimum_hair_height,'anatomyAlreadyRemoved':a.anatomy_already_removed,'removeBoundaryNeedles':a.remove_boundary_needles}},'fit':prov['fit']};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('FINALIZED',a.output,record['geometryOptimization'],flush=True)
