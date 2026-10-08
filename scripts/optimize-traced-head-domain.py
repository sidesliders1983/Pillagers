"""Optimize an original colour-domain trace in its canonical source frame."""
import bpy,bmesh,numpy as np,argparse,sys,json,hashlib,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--target',type=int,default=1500);p.add_argument('--volume',action='store_true');p.add_argument('--minimum-component-area-ratio',type=float,default=.015);p.add_argument('--planar-angle-degrees',type=float,default=0);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);record=json.loads(a.source.with_suffix('.provenance.json').read_text());src=np.load(a.source);mesh=bpy.data.meshes.new('Original pigment domain');mesh.from_pydata(src['positions'].tolist(),[],src['faces'].tolist());mesh.update();o=bpy.data.objects.new(f"{'Hair' if record.get('kind')=='hair' else 'Beard'}_{record['style']}_LOD2",mesh);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
# Exported UV chart vertices are split copies of one geometric surface. Weld
# their positions before reduction, otherwise each chart collapses separately
# and removes portions of a thin continuous pigment strap.
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(mesh);bm.free();mesh.update()
if a.volume:mesh.remesh_voxel_size=.0015;mesh.remesh_voxel_adaptivity=0;bpy.ops.object.voxel_remesh()
if a.planar_angle_degrees:
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.dissolve_limit(bm,angle_limit=math.radians(a.planar_angle_degrees),verts=list(bm.verts),edges=list(bm.edges),use_dissolve_boundaries=False);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
for _ in range(10):
 count=sum(len(f.vertices)-2 for f in o.data.polygons)
 if count<=a.target:break
 mod=o.modifiers.new('Reference faceted reduction','DECIMATE');mod.ratio=max(.15,a.target/count);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);remaining=set(bm.faces);parts=[]
while remaining:
 todo=[remaining.pop()];part=[]
 while todo:
  f=todo.pop();part.append(f)
  for edge in f.edges:
   for other in edge.link_faces:
    if other in remaining:remaining.remove(other);todo.append(other)
 parts.append(part)
largest=max(sum(f.calc_area() for f in part) for part in parts);removed=[f for part in parts if sum(f.calc_area() for f in part)<largest*a.minimum_component_area_ratio for f in part]
bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update();mesh=bpy.data.meshes.new('Original pigment reference facets');mesh.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);mesh.update();mesh.validate();bm.free();o.data=mesh
m=bpy.data.materials.new('Profile reference hair');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;mesh.materials.append(m)
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
out={'reviewRequired':True,'style':record['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':record,'geometryOptimization':{'outputTriangles':len(mesh.polygons),'removedMicroscopicFaces':len(removed),'minimumComponentAreaRatio':a.minimum_component_area_ratio,'volumeUnionVoxelSizeMeters':.0015 if a.volume else None,'facetedNormals':True,'profileMaterialCount':1},'fit':record['fit']};a.output.with_suffix('.provenance.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['geometryOptimization']),flush=True)
if a.planar_angle_degrees:
 out['geometryOptimization']['planarDissolveAngleDegrees']=a.planar_angle_degrees;out['geometryOptimization']['pigmentBoundaryDissolved']=False;a.output.with_suffix('.provenance.json').write_text(json.dumps(out,indent=2)+'\n')
