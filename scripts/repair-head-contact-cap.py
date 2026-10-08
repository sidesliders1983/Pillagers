"""Repair a damaged scalp patch while retaining reference free-hair geometry.

This authoring operation uses the actual canonical HEAD_CAGE for scalp contact.
The free geometry is copied from the input reference-derived module.  It does
not synthesize hairstyle strands or add runtime fitting exceptions.
"""
import bpy, bmesh, argparse, sys, json, hashlib
from pathlib import Path
from mathutils import Vector

p=argparse.ArgumentParser()
p.add_argument('source',type=Path);p.add_argument('output',type=Path)
p.add_argument('--head-cage',type=Path,required=True)
p.add_argument('--target',type=int,default=2800)
p.add_argument('--free-minimum-gap',type=float,default=.010)
p.add_argument('--free-minimum-x',type=float)
p.add_argument('--free-maximum-x',type=float)
p.add_argument('--free-minimum-absolute-x',type=float)
p.add_argument('--free-minimum-posterior',type=float)
p.add_argument('--scalp-thickness',type=float,default=.006)
p.add_argument('--hairline-height',type=float,default=-.025,help='Measured source hairline plane intercept in canonical authoring metres')
p.add_argument('--hairline-posterior-slope',type=float,default=.5,help='Measured posterior hairline drop; preserves the authored forehead boundary')
p.add_argument('--free-source',type=Path,help='Separate reference-derived repaired free volume, in the same canonical frame')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
assert -.08<=a.hairline_height<=.025 and .25<=a.hairline_posterior_slope<=1.2
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
source=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.context.view_layer.objects.active=source
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
cage=json.loads(a.head_cage.read_text());size=cage['size'];canonical=[.1992,.2397,.2189]
points=[Vector((x*canonical[0]/size[0],-z*canonical[2]/size[2],y*canonical[1]/size[1])) for x,y,z in cage['points']]
hb=bmesh.new();vs=[hb.verts.new(q) for q in points]
bmesh.ops.convex_hull(hb,input=vs);bmesh.ops.recalc_face_normals(hb,faces=list(hb.faces))
planes=[(f.normal.copy(),f.normal.dot(f.verts[0].co)) for f in hb.faces];hb.free()
def support(direction):return min(c/d for n,c in planes if (d:=n.dot(direction))>1e-6)
def convex_object(name,positions):
 bm=bmesh.new();[bm.verts.new(q) for q in positions]
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
 bmesh.ops.convex_hull(bm,input=list(bm.verts))
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update()
 mesh=bpy.data.meshes.new(name);mesh.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);mesh.update();bm.free()
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);return obj
cap=[q*1.06 for q in points]
for v in source.data.vertices:
 q=v.co
 if -.09<q.z<.13:
  direction=q.normalized();r=support(direction)
  cap.append(direction*max(r*1.06,min(q.length,r+.025)))
o=convex_object('Reference contact envelope',cap)
bm=bmesh.new();bm.from_mesh(o.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector((0,0,a.hairline_height)),plane_no=Vector((0,a.hairline_posterior_slope,1)).normalized(),clear_inner=True,clear_outer=False)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(o.data);bm.free()
bpy.context.view_layer.objects.active=o
mod=o.modifiers.new('Bounded inward scalp rim','SOLIDIFY');mod.thickness=a.scalp_thickness;mod.offset=-1;mod.use_rim=True;mod.use_even_offset=False
bpy.ops.object.modifier_apply(modifier=mod.name)
# Generated facial and neck shadows are not hair.  Actual free grooming lies
# outside scalp contact and to the posterior/lateral side of that anatomy.
bm=bmesh.new();bm.from_mesh(source.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);kept=[]
for f in bm.faces:
 q=f.calc_center_median();r=support(q.normalized())
 # A coarse extraction triangle can span the whole cheek while its centroid
 # lies outside the face. Test its authored corners before creating a volume;
 # no facial support plane may be solidified into a free hair strand.
 face_anatomy=any(abs(v.co.x)<.060 and -.15<v.co.z<.025 and v.co.y<.055 and v.co.length-support(v.co.normalized())<.030 for v in f.verts)
 neck_anatomy=abs(q.x)<.055 and -.02<q.y<.085 and q.z<-.10
 lateral_contact_region=(a.free_minimum_x is None or all(v.co.x>=a.free_minimum_x for v in f.verts)) and (a.free_maximum_x is None or all(v.co.x<=a.free_maximum_x for v in f.verts)) and (a.free_minimum_absolute_x is None or all(abs(v.co.x)>=a.free_minimum_absolute_x for v in f.verts))
 posterior_contact_region=a.free_minimum_posterior is not None and all(v.co.y>=a.free_minimum_posterior for v in f.verts)
 has_lateral_region=any(v is not None for v in [a.free_minimum_x,a.free_maximum_x,a.free_minimum_absolute_x])
 within_free_region=q.z<-.15 or ((lateral_contact_region if has_lateral_region else False) or posterior_contact_region) if (has_lateral_region or a.free_minimum_posterior is not None) else True
 if q.z<.08 and q.length>r+a.free_minimum_gap and within_free_region and not(face_anatomy or neck_anatomy):kept.append(f)
removed=[f for f in bm.faces if f not in kept]
bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
boundary_count=sum(e.is_boundary for e in bm.edges)
# Seal the existing volume at its extraction perimeter. Extruding every open
# patch would turn a single anatomical shadow sheet into a real hair plate.
if boundary_count:bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
# Consistent winding alone does not choose the exterior of a closed imported
# chart. Give each repaired reference volume positive signed volume before a
# voxel union; an inward component otherwise subtracts the contact cap.
remaining=set(bm.faces);flipped_volumes=0
while remaining:
 todo=[remaining.pop()];part=[]
 while todo:
  f=todo.pop();part.append(f)
  for e in f.edges:
   for other in e.link_faces:
    if other in remaining:remaining.remove(other);todo.append(other)
 signed_volume=sum(f.verts[0].co.dot(f.verts[k].co.cross(f.verts[k+1].co))/6 for f in part for k in range(1,len(f.verts)-1))
 if signed_volume<-1e-10:bmesh.ops.reverse_faces(bm,faces=part);flipped_volumes+=1
bm.to_mesh(source.data);bm.free()
if a.free_source:
 before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(a.free_source.resolve()));imported=[obj for obj in bpy.context.scene.objects if obj not in before and obj.type=='MESH'];assert len(imported)==1
 repaired=imported[0];bpy.context.view_layer.objects.active=repaired;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);source.data=repaired.data;bpy.data.objects.remove(repaired,do_unlink=True)
bpy.context.view_layer.objects.active=source
bpy.ops.object.select_all(action='DESELECT');source.select_set(True);o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.join()
o.data.remesh_voxel_size=.002;o.data.remesh_voxel_adaptivity=0;bpy.ops.object.voxel_remesh();surface_triangles=len(o.data.polygons)*2
for _ in range(8):
 count=sum(len(f.vertices)-2 for f in o.data.polygons)
 print('REDUCE',_,count,'target',a.target,'active',bpy.context.view_layer.objects.active.name,flush=True)
 if count<=a.target:break
 mod=o.modifiers.new('Reference faceted reduction','DECIMATE');mod.ratio=max(.15,a.target/count);mod.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=mod.name)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
print('WELDED',sum(len(f.verts)-2 for f in bm.faces),flush=True)
remaining=set(bm.faces);parts=[]
while remaining:
 todo=[remaining.pop()];part=[]
 while todo:
  f=todo.pop();part.append(f)
  for edge in f.edges:
   for other in edge.link_faces:
    if other in remaining:remaining.remove(other);todo.append(other)
 parts.append(part)
largest=max(sum(f.calc_area() for f in part) for part in parts)
micro=[f for part in parts if sum(f.calc_area() for f in part)<largest*.015 for f in part]
bmesh.ops.delete(bm,geom=micro,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update()
mesh=bpy.data.meshes.new('Reference scalp and preserved free-hair facets');mesh.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);mesh.update();mesh.validate();bm.free();o.data=mesh
prov=json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'));o.name=f"Hair_{prov['style']}_LOD2"
m=bpy.data.materials.new('Profile reference hair');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;mesh.materials.append(m)
assert max(v.co.length for v in mesh.vertices)<1
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
record={'reviewRequired':True,'style':prov['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':prov,'geometryOptimization':{'outputTriangles':len(mesh.polygons),'sourceFreeHairFacesPreserved':len(kept),'removedAnatomicalAndDamagedContactFaces':len(removed),'freeHairSourceBoundaryEdges':boundary_count,'removedMicroscopicFaces':len(micro),'unionSurfaceTriangles':surface_triangles,'contactRepair':'reference envelope bounded by actual canonical HEAD_CAGE','headCageSha256':hashlib.sha256(a.head_cage.read_bytes()).hexdigest(),'scalpShellThicknessMeters':.003,'volumeUnionVoxelSizeMeters':.002,'hairlinePlane':{'point':[0,0,-.025],'normal':[0,.5,1]},'freeHairDomain':{'minimumStandOffMeters':a.free_minimum_gap,'maximumHeightMeters':.12,'facialAnatomyExclusion':{'sample':'any triangle corner','maximumHalfWidth':.060,'heightRange':[-.15,.025],'maximumPosteriorDepth':.055,'maximumHeadStandOff':.030},'neckAnatomyExclusion':{'maximumHalfWidth':.055,'posteriorRange':[-.02,.085],'maximumHeight':-.10}}},'fit':prov['fit']}
record['geometryOptimization']['scalpShellThicknessMeters']=a.scalp_thickness
record['geometryOptimization']['hairlinePlane']={'point':[0,0,a.hairline_height],'normal':[0,a.hairline_posterior_slope,1],'authority':'reference scalp boundary in canonical authoring coordinates'}
record['geometryOptimization']['freeHairDomain'].update({'maximumHeightMeters':.08,'referenceSemanticRegion':{'minimumX':a.free_minimum_x,'maximumX':a.free_maximum_x,'minimumAbsoluteX':a.free_minimum_absolute_x,'minimumPosterior':a.free_minimum_posterior,'regionAppliedAboveHeight':-.15},'extractionPerimeterClosure':'existing volume boundary hole fill; no sheet extrusion','outwardClosedVolumesCorrected':flipped_volumes})
record['geometryOptimization']['freeHairDomain']['referenceOuterVertexEnvelope']=False
if a.free_source:
 record['geometryOptimization']['freeHairDomain']['repairedReferenceSource']={'path':str(a.free_source.resolve()),'sha256':hashlib.sha256(a.free_source.read_bytes()).hexdigest(),'provenance':json.loads(a.free_source.with_suffix('.provenance.json').read_text())}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record['geometryOptimization']),flush=True)
