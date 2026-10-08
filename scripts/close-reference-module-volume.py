"""Bounded authoring closure of tiny texture-domain tunnels and thin residue.

All geometry comes from the input reference module.  The intentional mouth
opening is much larger than the millimetre closure radius and remains open.
This never changes the runtime attachment/cage system.
"""
import bpy,bmesh,argparse,sys,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--target',type=int,default=1500);p.add_argument('--radius',type=float,default=.003);p.add_argument('--opening-radius',type=float,default=.0015);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();assert 0<a.radius<=.004 and 0<=a.opening_radius<=.002;a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));o=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
def offset(distance):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
 moves=[(v,v.normal.copy()*distance) for v in bm.verts]
 for v,delta in moves:v.co+=delta
 bm.to_mesh(o.data);bm.free();o.data.update()
def volume():o.data.remesh_voxel_size=.0015;o.data.remesh_voxel_adaptivity=0;bpy.ops.object.voxel_remesh()
# Closing joins small pigment-domain gaps without changing the large mouth.
offset(a.radius);volume();offset(-a.radius);volume()
# Opening removes tiny attached hook/prong residues rather than leaving a wire.
if a.opening_radius:
 offset(-a.opening_radius);volume();offset(a.opening_radius);volume()
surface=sum(len(f.vertices)-2 for f in o.data.polygons)
for _ in range(8):
 count=sum(len(f.vertices)-2 for f in o.data.polygons)
 if count<=a.target:break
 mod=o.modifiers.new('Reference faceted reduction','DECIMATE');mod.ratio=max(.15,a.target/count);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);remaining=set(bm.faces);parts=[]
while remaining:
 todo=[remaining.pop()];part=[]
 while todo:
  f=todo.pop();part.append(f)
  for e in f.edges:
   for other in e.link_faces:
    if other in remaining:remaining.remove(other);todo.append(other)
 parts.append(part)
largest=max(sum(f.calc_area() for f in part) for part in parts);removed=[f for part in parts if sum(f.calc_area() for f in part)<largest*.015 for f in part]
bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update();data=bpy.data.meshes.new('Repaired reference volume facets');data.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);data.update();data.validate();bm.free();o.data=data
m=bpy.data.materials.new('Profile reference hair');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;data.materials.append(m)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
prov=json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'));record={'reviewRequired':True,'style':prov['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':prov,'geometryOptimization':{'outputTriangles':len(data.polygons),'closedSourceSurfaceTriangles':surface,'closingRadiusMeters':a.radius,'openingRadiusMeters':a.opening_radius,'volumeUnionVoxelSizeMeters':.0015,'removedMicroscopicFaces':len(removed),'facetedNormals':True,'profileMaterialCount':1},'fit':prov['fit']};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record['geometryOptimization']),flush=True)
