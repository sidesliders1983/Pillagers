"""Repair and measure reviewed garment surfaces jointly. No new clothing artwork.
Blender CLI -- STYLE SOURCE FIGURE DESTINATION; preserves prior runs.
"""
import argparse,bpy,bmesh,json,sys,math,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from array import array
p=argparse.ArgumentParser(description=__doc__);p.add_argument('style');p.add_argument('source',type=Path);p.add_argument('figure',type=Path);p.add_argument('destination',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.destination.mkdir(parents=True,exist_ok=True)
provenance=json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'));frame=provenance['fit'];centre=Vector(frame['sourceCentreBlender']);scale=frame['scale']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.figure.resolve()))
figures=[o for o in bpy.context.scene.objects if o.type=='MESH'];ps=[(o.matrix_world@v.co-centre)*scale for o in figures for v in o.data.vertices]
# Resolve the same one-time reference yaw used for this published surface.
yaw=math.radians(frame.get('rotateBlenderZ',0))
for v in ps:
 x,y=v.x,v.y;v.x=x*math.cos(yaw)-y*math.sin(yaw);v.y=x*math.sin(yaw)+y*math.cos(yaw)
# Source facet colours come directly from the original generated atlas, avoiding
# black UV misses and preserving its generated cream/leather/mantle palette.
refVerts=[];refTriangles=[];refUV=[];refImages=[]
for figure in figures:
 offset=len(refVerts);verts=[(figure.matrix_world@v.co-centre)*scale for v in figure.data.vertices]
 for v in verts:
  x,y=v.x,v.y;v.x=x*math.cos(yaw)-y*math.sin(yaw);v.y=x*math.sin(yaw)+y*math.cos(yaw)
 refVerts.extend(verts);figure.data.calc_loop_triangles();uv=figure.data.uv_layers.active.data
 for tri in figure.data.loop_triangles:
  refTriangles.append(tuple(offset+i for i in tri.vertices));refUV.append(tuple(Vector((uv[k].uv.x,uv[k].uv.y,0)) for k in tri.loops));refImages.append(tri.material_index)
referenceMaterials=figures[0].data.materials;images={}
for i,mat in enumerate(referenceMaterials):
 node=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image);images[i]=(tuple(node.image.size),array('f',node.image.pixels[:]),node.image.channels)
referenceBVH=BVHTree.FromPolygons(refVerts,refTriangles,all_triangles=True)
def referenceRGB(point):
 hit,normal,index,distance=referenceBVH.find_nearest(point)
 if hit is None:return [.5,.45,.4]
 coords=[refVerts[k] for k in refTriangles[index]];tex=barycentric_transform(hit,*coords,*refUV[index]);size,pixels,channels=images[refImages[index]];x=max(0,min(size[0]-1,int(tex.x*size[0])));y=max(0,min(size[1]-1,int(tex.y*size[1])));offset=(y*size[0]+x)*channels;return pixels[offset:offset+3]
def mid(points,y):
 assert points,'Missing source anatomical cross-section'
 return [(min(v.x for v in points)+max(v.x for v in points))*.5,y,-(min(v.y for v in points)+max(v.y for v in points))*.5]
def band(y,minimumX=0,maximumX=10,side=0):return [v for v in ps if abs(v.z-y)<.025 and minimumX<abs(v.x)<maximumX and (not side or v.x*side>0)]
joints={}
for name,y in [('Hips',.9),('Chest',1.29),('Neck',1.43)]:joints[name]=mid(band(y,0,.15),y)
for side,sign in [('L',1),('R',-1)]:
 for name,y,x in [('UpperArm',1.40,.18),('LowerArm',1.10,.27),('Hand',.91,.30)]:joints[name+'_'+side]=mid(band(y,x,10,sign),y)
 ankle=mid(band(.18,0,10,sign),.105);joints['Foot_'+side]=ankle
 foot=[v for v in ps if v.z<.10 and v.x*sign>0]
 front=max(foot,key=lambda v:(v.x-ankle[0])**2+(-v.y-ankle[2])**2)
 dx,dz=front.x-ankle[0],-front.y-ankle[2];length=math.hypot(dx,dz)
 joints['Toe_'+side]=[ankle[0]+dx/length*.13,.05,ankle[2]+dz/length*.13]
 joints['LowerLeg_'+side]=mid(band(.49,0,10,sign),.49)
 joints['UpperLeg_'+side]=[ankle[0]*.62,.9,joints['Hips'][2]]
(a.destination/'garment-bind.json').write_text(json.dumps({'joints':joints},indent=2)+'\n')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objs=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.ops.object.select_all(action='DESELECT')
regionNames=[]
regionMaterials=[]
referenceMaterial=objs[0].data.materials[0]
for o in objs:
 regionNames.append(o.get('garmentRegion','cloth'));o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 # Temporary material indices retain garment region identity across joint weld.
 regionIndex=regionNames.index(o.get('garmentRegion','cloth'))
 temporary=referenceMaterial.copy();temporary.name='GarmentRegion_'+str(regionIndex);regionMaterials.append(temporary);o.data.materials.clear();o.data.materials.append(temporary)
 for f in o.data.polygons:f.material_index=0
bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();obj=objs[0];bm=bmesh.new();bm.from_mesh(obj.data)
# Classify residual source skin against the original atlas, never against a
# low-resolution optimized atlas that can contain black UV misses.
def source_arm_distance(point):
 distances=[]
 for side in ['L','R']:
  for name,end in [('UpperArm','LowerArm'),('LowerArm','Hand')]:
   first=joints[name+'_'+side];last=joints[end+'_'+side];start=Vector((first[0],-first[2],first[1]));axis=Vector((last[0],-last[2],last[1]))-start;t=max(0,min(2 if name=='LowerArm' else 1,(point-start).dot(axis)/axis.length_squared));distances.append((point-start-axis*t).length)
 return min(distances)
def source_leg_distance(point):
 distances=[]
 for side in ['L','R']:
  for name,end in [('UpperLeg','LowerLeg'),('LowerLeg','Foot')]:
   first=joints[name+'_'+side];last=joints[end+'_'+side];start=Vector((first[0],-first[2],first[1]));axis=Vector((last[0],-last[2],last[1]))-start;t=max(0,min(1,(point-start).dot(axis)/axis.length_squared));distances.append((point-start-axis*t).length)
 return min(distances)
residual=[];cuff={'cream-tunic':1.20,'long-dress':1.45,'mantle-tunic':1.08}[a.style]
for face in bm.faces:
 c=face.calc_center_median();rgb=referenceRGB(c);skin=rgb[0]>.60 and rgb[1]>.28 and rgb[2]>.20 and 1.22<rgb[0]/max(.001,rgb[1])<1.9 and rgb[0]/max(.001,rgb[2])>1.3
 # Resolve drape semantics from the original facet colour, not brightness in
 # a baked optimized atlas. A shaded hem keeps the same hip ownership.
 if .60<c.z<1.03 and a.style=='cream-tunic' and rgb[0]/max(.001,rgb[1])<1.30 and rgb[1]/max(.001,rgb[2])<1.40:face.material_index=regionNames.index('skirt')
 if .60<c.z<1.03 and a.style=='mantle-tunic' and rgb[2]>rgb[0]*1.05:face.material_index=regionNames.index('skirt')
 torsoStart=Vector((joints['Hips'][0],-joints['Hips'][2],joints['Hips'][1]));torsoAxis=Vector((joints['Neck'][0],-joints['Neck'][2],joints['Neck'][1]))-torsoStart;t=max(0,min(1,(c-torsoStart).dot(torsoAxis)/torsoAxis.length_squared));torsoDistance=(c-torsoStart-torsoAxis*t).length
 # The reference dress is sleeveless. Colour alone cannot distinguish light
 # source skin highlights from cream cloth; source skeletal regions establish
 # the armhole while retaining its actual generated shoulder straps.
 exposedArm=.45<c.z<(1.43 if a.style=='long-dress' else cuff) and source_arm_distance(c)<min(torsoDistance,source_leg_distance(c))*.85
 if exposedArm or skin and (c.z>1.4 and abs(c.x)<.17 or .45<c.z<cuff and source_arm_distance(c)<.17):residual.append(face)
bmesh.ops.delete(bm,geom=residual,context='FACES')
if a.style!='long-dress':
 drapeFaces=[f for f in bm.faces if f.material_index==regionNames.index('skirt')];hem=min(v.co.z for f in drapeFaces for v in f.verts);waist=max(v.co.z for f in drapeFaces for v in f.verts)
 for f in bm.faces:
  c=f.calc_center_median()
  if hem<c.z<waist and source_arm_distance(c)>source_leg_distance(c) and regionNames[f.material_index]!='footwear':f.material_index=regionNames.index('skirt')
before=sum(len(f.verts)-2 for f in bm.faces);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.001);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000002)
# Delete duplicated faces, preserving source per-loop UVs on the retained surface.
seen=set();duplicates=[]
for f in bm.faces:
 key=frozenset(f.verts)
 if key in seen:duplicates.append(f)
 else:seen.add(key)
bmesh.ops.delete(bm,geom=duplicates,context='FACES')
# Remove isolated extraction specks by actual surface area, not arbitrary triangle count.
unseen=set(bm.faces);removed=[];components=[]
while unseen:
 f=unseen.pop();part=[f];pending=[f]
 while pending:
  f=pending.pop()
  for e in f.edges:
   for n in e.link_faces:
    if n in unseen:unseen.remove(n);part.append(n);pending.append(n)
 area=sum(f.calc_area() for f in part);components.append({'faces':len(part),'area':area})
 if area<.00008:removed.extend(part)
bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
# Repair tiny closed extraction punctures; preserve larger authored openings.
unseen=set(e for e in bm.edges if e.is_boundary);filled=0
while unseen:
 first=unseen.pop();edges={first};q=[first]
 while q:
  e=q.pop()
  for v in e.verts:
   for n in v.link_edges:
    if n in unseen:unseen.remove(n);edges.add(n);q.append(n)
 verts={v for e in edges for v in e.verts};closed=all(sum(e in edges for e in v.link_edges)==2 for v in verts)
 boundaryCentre=sum((v.co for v in verts),Vector())/len(verts)
 # Necklines, sleeve cuffs and skirt hems are intentional openings.
 anatomicalOpening=boundaryCentre.z>1.40 or abs(boundaryCentre.x)>.20 and boundaryCentre.z>1.03
 if closed and not anatomicalOpening and sum(e.calc_length() for e in edges)<.20:
  new=bmesh.ops.holes_fill(bm,edges=list(edges),sides=0)['faces'];filled+=len(new)
  for f in new:
   neighbour=next((n for e in f.edges for n in e.link_faces if n not in new),None)
   if neighbour:f.material_index=neighbour.material_index
   uv=bm.loops.layers.uv.active
   if uv:
    for loop in f.loops:
     linked=[other for other in loop.vert.link_loops if other.face not in new]
     if linked:loop[uv].uv=linked[0][uv].uv
# Dissolve only coplanar redundancy while respecting region and texture seams.
bmesh.ops.dissolve_limit(bm,angle_limit=math.radians(2),verts=list(bm.verts),edges=list(bm.edges),delimit={'UV','MATERIAL'});bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
# Simplify jointly, preserving connected boundaries before splitting regions.
obj.data.calc_loop_triangles()
if len(obj.data.loop_triangles)>4300:
 modifier=obj.modifiers.new('Joint faceted ensemble budget','DECIMATE');modifier.ratio=4300/len(obj.data.loop_triangles);modifier.use_collapse_triangulate=True;bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
# Constant-colour padded facet tiles retain the source palette without UV cracks.
resolution=512;tile=7;across=resolution//tile;pixels=array('f',[0.0])*(resolution*resolution*4);uv=obj.data.uv_layers.active.data
for i,f in enumerate(obj.data.polygons):
 rgb=referenceRGB(f.center);tx=(i%across)*tile;ty=(i//across)*tile
 for y in range(ty,ty+tile):
  for x in range(tx,tx+tile):
   offset=(y*resolution+x)*4;pixels[offset:offset+4]=array('f',[*rgb,1])
 for k,loop in enumerate(f.loop_indices):uv[loop].uv=((tx+(1 if k!=1 else tile-1))/resolution,(ty+(1 if k!=2 else tile-1))/resolution)
image=bpy.data.images.new(a.style+'_reference_facets',width=resolution,height=resolution,alpha=False);image.pixels[:]=pixels;image.update()
referenceMaterial=referenceMaterial.copy();node=next(n for n in referenceMaterial.node_tree.nodes if n.type=='TEX_IMAGE' and n.image);node.image=image
for regionIndex,name in enumerate(regionNames):
 clone=obj.copy();clone.data=obj.data.copy();bpy.context.scene.collection.objects.link(clone);b=bmesh.new();b.from_mesh(clone.data);bmesh.ops.delete(b,geom=[f for f in b.faces if f.material_index!=regionIndex],context='FACES');bmesh.ops.delete(b,geom=[v for v in b.verts if not v.link_faces],context='VERTS');b.to_mesh(clone.data);b.free();clone.data.materials.clear();clone.data.materials.append(referenceMaterial)
 for f in clone.data.polygons:f.material_index=0;f.use_smooth=False
 clone.name=a.style+'_'+name;clone['garmentRegion']=name
 clone.data.validate()
 if not clone.data.polygons:bpy.data.objects.remove(clone,do_unlink=True)
bpy.data.objects.remove(obj,do_unlink=True)
file=a.destination/a.source.name;assert not file.exists(),'Preserve existing candidates';bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(file.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
report={'reviewRequired':True,'style':a.style,'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceProvenance':provenance,'fit':{'authoringFrame':'canonical','up':'+Y','front':'+Z','origin':'source skull axis / ground','garmentBind':{'joints':joints}},'geometryOptimization':{'jointRegionWeldMetres':.001,'planarAngleDegrees':2,'removedSourceSkinFaces':len(residual),'removedSpeckFaces':len(removed),'filledPunctures':filled,'removedDuplicateFaces':len(duplicates),'beforeTriangles':before,'targetTriangles':4300,'colourTransfer':'original generated figure facet centroid with padded 7px atlas tiles','componentsBefore':components}}
file.with_suffix('.provenance.json').write_text(json.dumps(report,indent=2)+'\n');print('GARMENT_REPAIRED',file,flush=True)
