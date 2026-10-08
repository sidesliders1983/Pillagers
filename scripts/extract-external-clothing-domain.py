"""Cut original cloth pigment on an immutable dense external source BEFORE collapse.

The cache retains nearest original UV/face correspondence. Reduction preserves
the source external silhouette and the measured domain boundary; no replacement
garment is drawn and no body is modified. Isolated Blender factory scene only.
"""
import argparse,bpy,bmesh,hashlib,json,math,sys,numpy as np
from pathlib import Path
from array import array
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('cache',type=Path);p.add_argument('output',type=Path);p.add_argument('--layout',required=True,choices=['cream-tunic','long-dress','mantle-tunic']);p.add_argument('--source-frame',type=Path,required=True);p.add_argument('--source-bind',type=Path,required=True);p.add_argument('--native-palette-audit',type=Path,help='Immutable native head-versus-fabric/boot pigment decision, pinned to the complete exterior cache SHA.');p.add_argument('--target',type=int,default=5000);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
cache=np.load(a.cache);points=cache['positions'];triangles=cache['triangles'];rgb=cache['linearRGB'];centres=points[triangles].mean(axis=1);low=float(points[:,2].min());height=float(points[:,2].max()-low);head=rgb[(centres[:,2]>low+height*.88)&(centres[:,2]<low+height*.97)];head=head[(head[:,0]>head[:,1]*1.12)&(head[:,0]>head[:,2]*1.15)];assert len(head)>30;skin=np.median(head,axis=0);skin_chroma=skin/skin.sum();chroma=rgb/np.maximum(rgb.sum(axis=1,keepdims=True),1e-6)
flesh=(np.linalg.norm(chroma-skin_chroma,axis=1)<.075)&(rgb[:,0]>rgb[:,1]*1.25)&(rgb[:,0]<rgb[:,1]*1.95)&(chroma[:,0]-chroma[:,2]>.12)
frame=json.loads(a.source_frame.read_text())['fit'];bind=json.loads(a.source_bind.read_text())['joints'];measured=(centres-np.asarray(frame['sourceCentreBlender']))*frame['scale'];
if frame.get('rotateBlenderZ')==180:measured[:,:2]*=-1
joint=lambda name:np.asarray([bind[name][0],-bind[name][2],bind[name][1]])
def segment_distance(first,last):
 start=joint(first);axis=joint(last)-start;t=np.clip((measured-start)@axis/(axis@axis),0,1);return np.linalg.norm(measured-start-t[:,None]*axis,axis=1)
covered=(measured[:,2]>joint('Hips')[2]+.08)&(measured[:,2]<joint('Chest')[2]+.03)&(segment_distance('Hips','Chest')<np.minimum(segment_distance('UpperArm_L','LowerArm_L'),segment_distance('UpperArm_R','LowerArm_R')))
y=(centres[:,2]-low)*1.8/height;centre_x=(points[:,0].min()+points[:,0].max())*.5;x=np.abs(centres[:,0]-centre_x)*1.8/height;cuff={'cream-tunic':1.18,'mantle-tunic':1.06,'long-dress':1.45}[a.layout];arm_limit=.21 if a.layout=='long-dress' else .28;arm_floor=1.12 if a.layout=='long-dress' else .60
select=(y<=1.50)&~((y>1.40)&(x<.075))&~((y>arm_floor)&(y<cuff)&(x>arm_limit))
if a.layout=='long-dress':select&=~((y>.65)&(y<1.12)&(x>.24)&(rgb[:,0]>rgb[:,1]*1.3)&(rgb[:,0]>rgb[:,2]*1.5))
palette_provenance=None
if a.native_palette_audit:
 audit=np.load(a.native_palette_audit);report=json.loads(a.native_palette_audit.with_suffix('.json').read_text());cache_sha=hashlib.sha256(a.cache.read_bytes()).hexdigest();mask_sha=hashlib.sha256(a.native_palette_audit.read_bytes()).hexdigest();remove=audit['removeNativeSkin']
 assert str(audit['cacheSha256'])==cache_sha==report['cacheSha256'],'Native palette audit belongs to a different immutable source cache.'
 assert mask_sha==report['maskSha256'],'Native palette audit bytes differ from their reviewed report.'
 assert remove.dtype==np.bool_ and remove.shape==(len(triangles),),'Native palette ownership must cover every original exterior facet exactly once.'
 assert report['sourceStyle']==a.layout,'Native palette audit belongs to a different source layout.'
 # The native decision replaces the blanket lower-body exemption. Warm gear
 # whose pigment cannot be distinguished from skin is deliberately retained.
 removed=select&remove;ambiguous=select&flesh&~covered&~remove;legacy=select&((~flesh)|(y<1.12)|covered)
 select&=~remove|covered
 palette_provenance={'path':str(a.native_palette_audit.resolve()),'sha256':mask_sha,'cacheSha256':cache_sha,'authority':report['authority'],'decision':report['decision'],'headNativePaletteColours':report['headNativePaletteColours'],'gearNativePaletteColours':report['gearNativePaletteColours'],'removedOriginalFaceIDs':np.unique(cache['originalFace'][removed]).tolist(),'retainedAmbiguousOriginalFaceIDs':np.unique(cache['originalFace'][ambiguous]).tolist(),'removedNativeSkinFacets':int(removed.sum()),'removedFromLegacyDomainFacets':int((legacy&remove).sum()),'previouslyUnrecognizedGearOrAmbiguousFacets':int((select&~legacy).sum()),'ambiguousWarmGearRetained':int(ambiguous.sum())}
 print('NATIVE_PALETTE_OWNERSHIP',json.dumps({key:value for key,value in palette_provenance.items() if not key.endswith('IDs')}),flush=True)
else:
 select&=(~flesh)|(y<1.12)|covered
selected=np.flatnonzero(select);assert len(selected)>1000;print('DENSE_DOMAIN',len(triangles),len(selected),skin.tolist(),flush=True)
source_points=[Vector(row) for row in points];source_faces=[tuple(row) for row in triangles[selected]];tree=BVHTree.FromPolygons(source_points,source_faces,all_triangles=True);source_colour=rgb[selected]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);mesh=bpy.data.meshes.new('OriginalExternalCloth');mesh.from_pydata(points.tolist(),[],triangles[selected].tolist());mesh.update();obj=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(obj);obj.select_set(True);bpy.context.view_layer.objects.active=obj
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=height*.000002);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=height*1e-7);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
for iteration in range(8):
 mesh.calc_loop_triangles();count=len(mesh.loop_triangles)
 if count<=a.target*1.01:break
 modifier=obj.modifiers.new('Original garment-domain silhouette budget','DECIMATE');modifier.ratio=max(.25,a.target/count);modifier.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=modifier.name)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=height*1e-7);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
resolution=1024;tile=8;across=resolution//tile;assert len(mesh.polygons)<across*across;atlas=array('f',[0])*(resolution*resolution*4);uv=mesh.uv_layers.new(name='OriginalClothPigment').data
for i,face in enumerate(mesh.polygons):
 hit,normal,index,distance=tree.find_nearest(face.center);colour=source_colour[index];tx=i%across*tile;ty=i//across*tile
 for yy in range(ty,ty+tile):
  for xx in range(tx,tx+tile):offset=(yy*resolution+xx)*4;atlas[offset:offset+4]=array('f',[*map(float,colour),1])
 for k,loop in enumerate(face.loop_indices):uv[loop].uv=((tx+(tile-1 if k==1 else 1))/resolution,(ty+(tile-1 if k==2 else 1))/resolution)
 face.use_smooth=False;face.material_index=0
image=bpy.data.images.new('OriginalClothPigment',width=resolution,height=resolution,alpha=False);image.pixels[:]=atlas;image.update();material=bpy.data.materials.new('OriginalClothPigment');material.use_nodes=True;nodes=material.node_tree.nodes;bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=1;texture=nodes.new('ShaderNodeTexImage');texture.image=image;material.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color']);mesh.materials.append(material)
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
cache_provenance=json.loads(a.cache.with_suffix('.provenance.json').read_text());record={'reviewRequired':True,'source':cache_provenance['source'],'sourceSha256':cache_provenance['sourceSha256'],'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':cache_provenance['sourceProvenance'],'externalSurfaceCache':{'path':str(a.cache.resolve()),'sha256':hashlib.sha256(a.cache.read_bytes()).hexdigest(),'originalUVMappingRetained':True,'voxelFraction':cache_provenance['geometryOptimization']['voxelFraction']},'geometryOptimization':{'completeExternalTriangles':len(triangles),'selectedOriginalPigmentTrianglesBeforeReduction':len(selected),'outputTriangles':len(mesh.polygons),'measuredSkinLinearRGB':skin.tolist(),'measuredSkinChroma':skin_chroma.tolist(),'domain':'normalized measured head chroma; original covered-torso/cuff/neck references','order':'external original surface → original UV pigment boundary → geometry reduction → original retained-domain pigment atlas','policy':'source silhouette/folds/palette; no new artwork or body masks'}}
if palette_provenance:record['geometryOptimization']['nativePaletteOwnership']=palette_provenance
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('DENSE_DOMAIN_DONE',a.output,len(mesh.polygons),flush=True)
