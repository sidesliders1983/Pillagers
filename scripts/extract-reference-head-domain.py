"""Trace the original UV colour domain before simplifying a narrow module."""
import bpy,bmesh,numpy as np,sys,argparse,json,hashlib
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--kind',required=True);p.add_argument('--style',required=True);p.add_argument('--target',type=int,default=1400);p.add_argument('--remesh-domain',action='store_true');p.add_argument('--head-cage',type=Path);p.add_argument('--source-anatomy',type=Path);p.add_argument('--no-dissolve',action='store_true');p.add_argument('--closing-pixels',type=int,default=2);p.add_argument('--minimum-beard-height',type=float,default=-.17);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();assert 0<=a.closing_pixels<=32;a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));o=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);mesh=o.data;mesh.calc_loop_triangles()
frame=json.loads(Path('scratch/appearance-pass/head-frames.json').read_text())[a.kind+'/'+a.style];centre=Vector(frame['centre']);up=Vector(frame['up']).normalized();front=Vector(frame['front']);front=(front-up*front.dot(up)).normalized();right=front.cross(up).normalized();diameter=2*frame['radius']
source_axis_size=[diameter,diameter,diameter]
if a.source_anatomy:
 anatomy=json.loads(a.source_anatomy.read_text());assert anatomy['sourceSha256']==hashlib.sha256(a.source.read_bytes()).hexdigest();frame=anatomy['frameProposal'];centre=Vector(frame['centre']);up=Vector(frame['up']).normalized();front=Vector(frame['front']);front=(front-up*front.dot(up)).normalized();right=front.cross(up).normalized();source_axis_size=frame['headBoundsInFrame']['size']
uv=np.empty(len(mesh.uv_layers.active.data)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape((-1,2));triangles=np.asarray([list(t.vertices) for t in mesh.loop_triangles],dtype=np.int32);loops=np.asarray([list(t.loops) for t in mesh.loop_triangles],dtype=np.int32);coords=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',coords);coords=coords.reshape((-1,3));tex=uv[loops].mean(axis=1)
image=next(n.image for n in mesh.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image);pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);rgb=pixels.reshape((image.size[1],image.size[0],image.channels))[:,:,:3];v=rgb.max(axis=2);s=(v-rgb.min(axis=2))/np.maximum(v,1e-6)
# Hair is brown/orange including saturated strands and ties.  Classifying the
# original atlas first retains narrow braids which full-bust simplification
# previously merged into the pale skin/fabric domain.
mask=(v>.03)&(v<.69) if a.kind=='hair' else (v>.03)&(v<.69)&(s<.65)
def dilate(mask):
 padded=np.pad(mask,1,constant_values=False);return np.logical_or.reduce([padded[y:y+mask.shape[0],x:x+mask.shape[1]] for y in range(3) for x in range(3)])
def erode(mask):
 padded=np.pad(mask,1,constant_values=True);return np.logical_and.reduce([padded[y:y+mask.shape[0],x:x+mask.shape[1]] for y in range(3) for x in range(3)])
for _ in range(a.closing_pixels):mask=dilate(mask)
for _ in range(a.closing_pixels):mask=erode(mask)
selected=mask[np.clip((tex[:,1]*image.size[1]).astype(int),0,image.size[1]-1),np.clip((tex[:,0]*image.size[0]).astype(int),0,image.size[0]-1)]
matrix=np.asarray([list(-right*.1992/source_axis_size[0]),list(-front*.2189/source_axis_size[2]),list(up*.2397/source_axis_size[1])]);canonical=(coords-np.asarray(centre))@matrix.T;centres=canonical[triangles].mean(axis=1)
if a.kind=='beard':selected&=(centres[:,2]<-.008)&(centres[:,2]>a.minimum_beard_height)&(centres[:,1]<.075)
if a.kind=='hair' and a.head_cage:
 cage=json.loads(a.head_cage.read_text());hull=bmesh.new();hvs=[hull.verts.new((x,-z,y)) for x,y,z in cage['points']];bmesh.ops.convex_hull(hull,input=hvs);bmesh.ops.recalc_face_normals(hull,faces=list(hull.faces));planes=[(np.asarray(f.normal),f.normal.dot(f.verts[0].co)) for f in hull.faces];hull.free()
 lengths=np.linalg.norm(centres,axis=1);directions=centres/np.maximum(lengths[:,None],1e-9);radii=np.full(len(centres),np.inf)
 for normal,constant in planes:
  dots=directions@normal;radii=np.minimum(radii,np.divide(constant,dots,out=np.full(len(dots),np.inf),where=dots>1e-6))
 anatomy=(np.abs(centres[:,0])<.060)&(centres[:,2]<.025)&(centres[:,2]>-.15)&(centres[:,1]<.055)
 neck=(np.abs(centres[:,0])<.055)&(centres[:,1]>-.02)&(centres[:,1]<.085)&(centres[:,2]<-.10)
 selected&=~(anatomy|neck)
ids=np.flatnonzero(selected);used=np.unique(triangles[ids]);mapping=np.full(len(coords),-1,dtype=np.int32);mapping[used]=np.arange(len(used));data=bpy.data.meshes.new('Original reference colour domain');data.from_pydata(canonical[used].tolist(),[],mapping[triangles[ids]].tolist());data.update();o.data=data;print('DOMAIN',len(ids),len(used),flush=True)
if a.remesh_domain:
 data.remesh_voxel_size=.002;data.remesh_voxel_adaptivity=0;bpy.ops.object.voxel_remesh();data=o.data
bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
if not a.remesh_domain and not a.no_dissolve:bmesh.ops.dissolve_limit(bm,angle_limit=.10,verts=list(bm.verts),edges=list(bm.edges),use_dissolve_boundaries=False)
bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free();data.update();print('DOMAIN_SURFACE',len(data.polygons),flush=True)
for _ in range(10):
 count=sum(len(f.vertices)-2 for f in data.polygons)
 if count<=a.target:break
 mod=o.modifiers.new('Reference boundary reduction','DECIMATE');mod.ratio=max(.15,a.target/count);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name);data=o.data
bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.verts.index_update();clean=bpy.data.meshes.new('Reference domain facets');clean.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);clean.update();clean.validate();bm.free();o.data=clean;o.name=f'{"Hair" if a.kind=="hair" else "Beard"}_{a.style}_LOD2'
m=bpy.data.materials.new('Profile reference hair');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;clean.materials.append(m)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
record={'reviewRequired':True,'style':a.style,'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig')),'geometryOptimization':{'rawTriangles':len(triangles),'classifiedReferenceTriangles':len(ids),'outputTriangles':len(clean.polygons),'classificationOrder':'original UV domain before simplification','textureClosingRadiusPixels':a.closing_pixels,'planarDissolveAngleRadians':.10 if not a.remesh_domain and not a.no_dissolve else None,'volumeUnionVoxelSizeMeters':.002 if a.remesh_domain else None,'minimumBeardHeightMeters':a.minimum_beard_height if a.kind=='beard' else None,'sourceAnatomySha256':hashlib.sha256(a.source_anatomy.read_bytes()).hexdigest() if a.source_anatomy else None,'sourceAxisSize':source_axis_size,'facetedNormals':True,'profileMaterialCount':1},'fit':{'authoringFrame':'canonical','up':'+Y','front':'+Z','origin':'fixed skull centre','canonicalHeadSize':[.1992,.2397,.2189]}};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('EXTRACTED',record['geometryOptimization'],flush=True)
