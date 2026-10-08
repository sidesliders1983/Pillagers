"""Repair the reference scalp envelope using canonical HEAD_CAGE support.

Reference cap directions/volume are retained. The actual fixed head supplies a
minimum contact volume; the original upper bun supplies its outer silhouette.
"""
import bpy,bmesh,sys,argparse,json,hashlib
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--head-cage',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));source=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=source;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);original=[v.co.copy() for v in source.data.vertices]
cage=json.loads(a.head_cage.read_text());size=cage['size'];canonical=[.1992,.2397,.2189];points=[Vector((x*canonical[0]/size[0],-z*canonical[2]/size[2],y*canonical[1]/size[1])) for x,y,z in cage['points']]
hb=bmesh.new();vs=[hb.verts.new(p) for p in points];bmesh.ops.convex_hull(hb,input=vs);bmesh.ops.recalc_face_normals(hb,faces=list(hb.faces));planes=[(f.normal.copy(),f.normal.dot(f.verts[0].co)) for f in hb.faces];hb.free()
def support(direction):return min(c/d for n,c in planes if (d:=n.dot(direction))>1e-6)
cap=[p*1.06 for p in points]
for point in original:
 if not (-.09<point.z<.13):continue
 direction=point.normalized();radius=support(direction);cap.append(direction*max(radius*1.06,min(point.length,radius+.025)))
def convex_object(name,points):
 bm=bmesh.new();vs=[bm.verts.new(p) for p in points];bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.convex_hull(bm,input=list(bm.verts));bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update();mesh=bpy.data.meshes.new(name);mesh.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);mesh.update();bm.free();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return o
o=convex_object(source.name,cap);free=[p for p in original if p.z>.115 and p.length-support(p.normalized())>.045]
free_translation=Vector()
if len(free)>4:
 # A source tie may be a different atlas colour, so the free bun can be a
 # separate semantic patch. Preserve its volume rigidly and bind its nearest
 # surface into the fitted contact envelope before the Boolean seam union.
 cap_bm=bmesh.new();cap_bm.from_mesh(o.data);cap_planes=[(f.normal.copy(),f.normal.dot(f.verts[0].co)) for f in cap_bm.faces];cap_bm.free();direction=-sum(free,Vector()).normalized()
 def touching(distance):return any(all(n.dot(p+direction*distance)<=c+1e-8 for n,c in cap_planes) for p in free)
 if not touching(0):
  lower,upper=0.,.3
  for _ in range(40):
   middle=(lower+upper)*.5
   if touching(middle):upper=middle
   else:lower=middle
  free_translation=direction*(upper+.002);free=[p+free_translation for p in free]
 bun=convex_object('Original upper bun envelope',free);bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Join original bun to contact cap','BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.object=bun;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(bun,do_unlink=True)
bm=bmesh.new();bm.from_mesh(o.data);before_faces=len(bm.faces)
# Interpolate the source surface at the pulled-back hairline instead of deleting
# whole lower facets. The continuous boundary keeps the posterior coverage and
# prevents isolated sloping support planes beside the cheek.
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector((0,0,-.025)),plane_no=Vector((0,.5,1)).normalized(),clear_inner=True,clear_outer=False)
remove=[None]*max(0,before_faces-len(bm.faces));bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update();mesh=bpy.data.meshes.new('Reference contact envelope');mesh.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);mesh.update();mesh.validate();bm.free();o.data=mesh
m=bpy.data.materials.new('Profile reference hair');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;mesh.materials.append(m)
bpy.context.view_layer.objects.active=o
# The reference hair is a volume. Close the repaired contact opening with a
# thin inward rim so its hairline does not render as an edge-on wire at the
# clearance slider endpoint. Outer silhouette and original bun stay unchanged.
shell=o.modifiers.new('Reference contact shell thickness','SOLIDIFY');shell.thickness=.003;shell.offset=-1;shell.use_rim=True;shell.use_even_offset=False;bpy.ops.object.modifier_apply(modifier=shell.name)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();mesh=o.data
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
prov=json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'));record={'reviewRequired':True,'style':prov['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':prov,'geometryOptimization':{'outputTriangles':len(mesh.polygons),'capRepair':'reference outer-envelope with actual canonical HEAD_CAGE minimum support','headCageSha256':hashlib.sha256(a.head_cage.read_bytes()).hexdigest(),'referenceContactHeight':[-.09,.13],'maximumContactStandOff':.025,'minimumSupportScale':1.06,'preservedUpperBunMinimumHeight':.115,'rigidFreeVolumeContactBinding':list(free_translation),'removedFaceAndLowerOpeningFaces':len(remove)},'fit':prov['fit']};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record['geometryOptimization']),flush=True)
