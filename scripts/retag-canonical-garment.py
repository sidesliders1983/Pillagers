"""Repair source-derived canonical drape ownership, preserving its geometry/art.
Blender CLI -- STYLE SOURCE OUTPUT. Never mutates source GLBs.
"""
import bpy,bmesh,json,sys,hashlib,argparse
from pathlib import Path
from mathutils import Vector
from array import array
p=argparse.ArgumentParser(description=__doc__);p.add_argument('style');p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--minimum-island-area-ratio',type=float,default=.005);p.add_argument('--ground-sole',action='store_true');p.add_argument('--keep-original-shoulders',action='store_true');p.add_argument('--preserve-region-tags',action='store_true');p.add_argument('--polish-open-rims',action='store_true');p.add_argument('--rim-limit',type=float,default=.015);p.add_argument('--rim-iterations',type=int,default=6);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert 0<a.rim_limit<=.03 and 1<=a.rim_iterations<=16;assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objs=[o for o in bpy.context.scene.objects if o.type=='MESH'];material=objs[0].data.materials[0];image=next(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image);size=tuple(image.size);pixels=array('f',image.pixels[:]);channels=image.channels;regions=[];domains=[];surfaces=[]
for o in objs:
 region=o.get('garmentRegion','cloth');regions.append(region);domains.append(o.get("garmentBindDomain"));surfaces.append(o.get("garmentSurface"));temporary=material.copy();o.data.materials.clear();o.data.materials.append(temporary);o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();obj=objs[0];bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000002);uv=bm.loops.layers.uv.active;changed=0
sourceProvenance=json.loads(a.source.with_suffix('.provenance.json').read_text());joints=sourceProvenance['fit']['garmentBind']['joints'];joint=lambda name:Vector((joints[name][0],-joints[name][2],joints[name][1]))
def distance(point,a,b):
 start=joint(a);axis=joint(b)-start;t=max(0,min(1,(point-start).dot(axis)/axis.length_squared));return (point-start-axis*t).length,t
def anatomical_region(point):
 candidates=[(distance(point,'Hips','Chest')[0],'torso'),(distance(point,'Chest','Neck')[0],'torso')]
 for side in ['L','R']:
  for first,last,kind in [('UpperArm','LowerArm','arm'),('LowerArm','Hand','arm'),('UpperLeg','LowerLeg','leg'),('LowerLeg','Foot','leg')]:candidates.append((distance(point,first+'_'+side,last+'_'+side)[0],kind))
 return min(candidates)[1]
skirtFaces=[f for f in bm.faces if regions[f.material_index]=='skirt'];hem=min(v.co.z for f in skirtFaces for v in f.verts);waist=max(v.co.z for f in skirtFaces for v in f.verts);removed=[]
for f in bm.faces:
 c=f.calc_center_median();tex=sum((loop[uv].uv for loop in f.loops),Vector((0,0)))/len(f.loops);x=max(0,min(size[0]-1,int(tex.x*size[0])));y=max(0,min(size[1]-1,int(tex.y*size[1])));offset=(y*size[0]+x)*channels;rgb=pixels[offset:offset+3]
 cream=rgb[0]/max(.001,rgb[1])<1.30 and rgb[1]/max(.001,rgb[2])<1.40
 blue=rgb[2]>rgb[0]*1.05
 drapeBand=a.style!='long-dress' and hem<c.z<waist and anatomical_region(c)!='arm' and regions[f.material_index]!='footwear'
 if not a.keep_original_shoulders and a.style=='long-dress' and min(v.co.z for v in f.verts)>joint('Chest').z-.09 and anatomical_region(c)=='arm' and distance(c,'UpperArm_'+('L' if c.x>=0 else 'R'),'LowerArm_'+('L' if c.x>=0 else 'R'))[1]>.1:removed.append(f);continue
 if not a.preserve_region_tags and 'skirt' in regions and (drapeBand or .60<c.z<1.03 and (a.style=='cream-tunic' and cream or a.style=='mantle-tunic' and blue)):
  if f.material_index!=regions.index('skirt'):changed+=1
  f.material_index=regions.index('skirt')
bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
# Only isolated sub-centimetre extraction punctures are closed. Authored collars,
# cuffs and hems remain open; their geometry and UV colour are unchanged.
outgoing={};unseen=set();filled=0;skirtWidth=max(v.co.x for f in skirtFaces if f.is_valid for v in f.verts)-min(v.co.x for f in skirtFaces if f.is_valid for v in f.verts)
for edge in bm.edges:
 if not edge.is_boundary:continue
 loop=next(loop for loop in edge.link_faces[0].loops if loop.edge==edge);record=(edge,loop.link_loop_next.vert,loop.vert);unseen.add(record);outgoing.setdefault(record[1],[]).append(record)
while unseen:
 first=next(iter(unseen));record=first;cycle=[];edges=[];closed=False
 while record in unseen:
  unseen.remove(record);edge,start,end=record;cycle.append(start);edges.append(edge)
  if end==first[1]:closed=True;break
  possible=[candidate for candidate in outgoing.get(end,[]) if candidate in unseen]
  if not possible:break
  direction=(end.co-start.co).normalized();record=max(possible,key=lambda candidate:direction.dot((candidate[2].co-candidate[1].co).normalized()))
 if not closed or len(cycle)<3:continue
 centre=sum((v.co for v in cycle),Vector())/len(cycle);perimeter=sum(edge.calc_length() for edge in edges);lower=min(v.co.z for v in cycle);width=max(v.co.x for v in cycle)-min(v.co.x for v in cycle);drape=sum(regions[e.link_faces[0].material_index]=='skirt' for e in edges)/len(edges)
 # The wide lowest loop is the authored hem. Smaller openings above it are
 # extraction holes where the source figure's calf was joined into the skirt.
 extractionHole=a.style=='long-dress' and drape>.66 and lower>hem+.05 and centre.z<joint('Hips').z and width<skirtWidth*.65
 repairs=[cycle] if perimeter<.10 or extractionHole else []
 if drape>.66 and lower<=hem+.05 and max(v.co.z for v in cycle)>hem+.15:
  # An extraction slit can open into the authored hem, so it is not a separate
  # hole loop. Stitch only a narrow upward dent; retain the wide skirt opening.
  threshold=hem+.10;lowIndex=next((i for i,v in enumerate(cycle) if v.co.z<=threshold),None)
  if lowIndex is not None:
   ordered=cycle[lowIndex:]+cycle[:lowIndex]+[cycle[lowIndex]];run=[];start=ordered[0]
   for v in ordered[1:]:
    if v.co.z>threshold:run.append(v);continue
    if run:
     patch=[start,*run,v];patchWidth=max(p.co.x for p in patch)-min(p.co.x for p in patch)
     if patchWidth<skirtWidth*.5 and (start.co-v.co).length<skirtWidth*.5:repairs.append(patch)
    run=[];start=v
 new=[]
 for patch in repairs:
  try:new.append(bm.faces.new(patch))
  except ValueError:continue
 filled+=len(new)
 for f in new:
  neighbour=next(n for e in f.edges for n in e.link_faces if n not in new);f.material_index=neighbour.material_index
  # A newly closed hole samples one authored neighbouring facet, rather than
  # interpolating across unrelated UV tiles or original atlas regions.
  sample=sum((loop[uv].uv for loop in neighbour.loops),Vector((0,0)))/len(neighbour.loops)
  for loop in f.loops:loop[uv].uv=sample
unseen=set(bm.faces);islands=[];parts=[]
while unseen:
 first=unseen.pop();part=[first];pending=[first]
 while pending:
  f=pending.pop()
  for e in f.edges:
   for n in e.link_faces:
    if n in unseen:unseen.remove(n);part.append(n);pending.append(n)
 parts.append(part)
largest=max(sum(f.calc_area() for f in part) for part in parts)
for part in parts:
 area=sum(f.calc_area() for f in part)
 # Separate boots are legitimate modules. Detached cloth slivers have no
 # authored attachment and cannot become floating geometry at runtime.
 if area<.00008 or area<largest*a.minimum_island_area_ratio and not any(regions[f.material_index]=='footwear' for f in part):islands.extend(part)
bmesh.ops.delete(bm,geom=islands,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
if a.ground_sole:
 for v in bm.verts:
  if v.co.z<0 and any(regions[f.material_index]=='footwear' for f in v.link_faces):v.co.z=0
 bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
rimMovement=[]
if a.polish_open_rims:
 # UV extraction leaves sub-facet teeth on deliberate collar/armhole/cuff
 # openings. Relax only their boundary contour, not the outer cloth surface;
 # the 15mm authoring bound retains the source silhouette and open rims.
 rims={v for v in bm.verts if any(e.is_boundary for e in v.link_edges) and all(regions[f.material_index]=='cloth' for f in v.link_faces)}
 original={v:v.co.copy() for v in rims}
 for iteration in range(a.rim_iterations):
  moves={}
  for v in rims:
   neighbours=[e.other_vert(v) for e in v.link_edges if e.is_boundary]
   if len(neighbours)!=2:continue
   delta=(neighbours[0].co+neighbours[1].co)*.5-v.co
   limit=min(a.rim_limit,(neighbours[0].co-v.co).length*.35,(neighbours[1].co-v.co).length*.35)
   if delta.length>limit:delta.normalize();delta*=limit
   target=v.co+delta*.5;movement=target-original[v]
   if movement.length>a.rim_limit:target=original[v]+movement.normalized()*a.rim_limit
   moves[v]=target
  for v,target in moves.items():v.co=target
 rimMovement=[(v.co-original[v]).length for v in rims]
bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001);bmesh.ops.triangulate(bm,faces=list(bm.faces));seen=set();duplicates=[]
for face in bm.faces:
 key=frozenset(face.verts)
 if key in seen:duplicates.append(face)
 else:seen.add(key)
bmesh.ops.delete(bm,geom=duplicates,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
for regionIndex,name in enumerate(regions):
 clone=obj.copy();clone.data=obj.data.copy();bpy.context.collection.objects.link(clone);b=bmesh.new();b.from_mesh(clone.data);bmesh.ops.delete(b,geom=[f for f in b.faces if f.material_index!=regionIndex],context='FACES');bmesh.ops.delete(b,geom=[v for v in b.verts if not v.link_faces],context='VERTS');b.to_mesh(clone.data);b.free();clone.data.materials.clear();clone.data.materials.append(material)
 for f in clone.data.polygons:f.material_index=0;f.use_smooth=False
 clone.name=a.style+'_'+name+'_'+str(regionIndex);clone['garmentRegion']=name
 if domains[regionIndex]:clone['garmentBindDomain']=domains[regionIndex]
 if surfaces[regionIndex]:clone['garmentSurface']=surfaces[regionIndex]
 if not clone.data.polygons:bpy.data.objects.remove(clone,do_unlink=True)
bpy.data.objects.remove(obj,do_unlink=True);bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
report={'reviewRequired':True,'style':a.style,'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'fit':sourceProvenance['fit'],'sourceProvenance':sourceProvenance,'geometryOptimization':{'sourceRegionRetaggedFaces':changed,'removedExposedSourceArmFaces':len(removed),'filledTinyPunctures':filled,'removedDuplicateFaces':len(duplicates),'openRimRelaxation':{'enabled':a.polish_open_rims,'iterations':a.rim_iterations if a.polish_open_rims else 0,'maximumDisplacementMetres':max(rimMovement,default=0) if a.polish_open_rims else 0,'displacementLimitMetres':a.rim_limit},'geometryPolicy':'preserved generated palette and semantic regions; bounded tiny-puncture/duplicate cleanup; canonical ground constraint; optional measured open-rim relaxation'}};a.output.with_suffix('.provenance.json').write_text(json.dumps(report,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_text(json.dumps(report['fit']['garmentBind'],indent=2)+'\n');print('CANONICAL_RETAG',changed,filled,len(removed),a.output,flush=True)
