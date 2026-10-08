"""Finalize source-pose calibrated clothing from the shared canonical authoring fit.
Blender CLI -- STYLE SURFACES_JSON SOURCE_GLB DESTINATION. No replacement art.
"""
import bpy,bmesh,json,sys,math,hashlib,argparse
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from array import array
p=argparse.ArgumentParser(description=__doc__);p.add_argument('style');p.add_argument('surfaces',type=Path);p.add_argument('source',type=Path);p.add_argument('destination',type=Path);p.add_argument('--target',type=int,default=3000);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.destination.mkdir(parents=True,exist_ok=True)
data=json.loads(a.surfaces.read_text());bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));referenceMaterial=next(o for o in bpy.context.scene.objects if o.type=='MESH').data.materials[0];image=next(n.image for n in referenceMaterial.node_tree.nodes if n.type=='TEX_IMAGE' and n.image);size=tuple(image.size);pixels=array('f',image.pixels[:]);channels=image.channels
for o in list(bpy.context.scene.objects):bpy.data.objects.remove(o,do_unlink=True)
regions=[];objs=[];referenceSources=[]
for record in data['meshes']:
 ps=[Vector((record['position'][i],-record['position'][i+2],record['position'][i+1])) for i in range(0,len(record['position']),3)];faces=[tuple(record['index'][i:i+3]) for i in range(0,len(record['index']),3)]
 referenceSources.append((BVHTree.FromPolygons(ps,faces,all_triangles=True),ps,faces,[tuple(Vector((record['uv'][v*2],1-record['uv'][v*2+1],0)) for v in face) for face in faces]))
 mesh=bpy.data.meshes.new(a.style+'_'+record['region']);mesh.from_pydata(ps,[],faces);mesh.update();o=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(o);o['garmentRegion']=record['region'];regions.append(record['region']);temporary=referenceMaterial.copy();temporary.name='CanonicalRegion_'+str(len(regions)-1);mesh.materials.append(temporary);objs.append(o)
def colour(point,region):
 tree,ps,faces,uvs=referenceSources[region];hit,normal,index,distance=tree.find_nearest(point);tex=barycentric_transform(hit,*[ps[k] for k in faces[index]],*uvs[index]);x=max(0,min(size[0]-1,int(tex.x*size[0])));y=max(0,min(size[1]-1,int(tex.y*size[1])));offset=(y*size[0]+x)*channels;return pixels[offset:offset+3]
bpy.ops.object.select_all(action='DESELECT')
for o in objs:o.select_set(True)
bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();obj=objs[0];bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update();before=len(obj.data.polygons)
modifier=obj.modifiers.new('Canonical faceted ensemble budget','DECIMATE');modifier.ratio=min(1,a.target/before);modifier.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=modifier.name)
bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
resolution=512 if len(obj.data.polygons)<=4096 else 1024;tile=8;across=resolution//tile;atlas=array('f',[0.0])*(resolution*resolution*4);uv=obj.data.uv_layers.new(name='ReferenceFacets').data
for i,f in enumerate(obj.data.polygons):
 rgb=colour(f.center,f.material_index);tx=(i%across)*tile;ty=(i//across)*tile
 for y in range(ty,ty+tile):
  for x in range(tx,tx+tile):offset=(y*resolution+x)*4;atlas[offset:offset+4]=array('f',[*rgb,1])
 for k,loop in enumerate(f.loop_indices):uv[loop].uv=((tx+(1 if k!=1 else tile-1))/resolution,(ty+(1 if k!=2 else tile-1))/resolution)
image=bpy.data.images.new(a.style+'_canonical_reference_facets',width=resolution,height=resolution,alpha=False);image.pixels[:]=atlas;image.update();material=referenceMaterial.copy();next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE').image=image
for regionIndex,name in enumerate(regions):
 clone=obj.copy();clone.data=obj.data.copy();bpy.context.collection.objects.link(clone);b=bmesh.new();b.from_mesh(clone.data);bmesh.ops.delete(b,geom=[f for f in b.faces if f.material_index!=regionIndex],context='FACES');bmesh.ops.delete(b,geom=[v for v in b.verts if not v.link_faces],context='VERTS');b.to_mesh(clone.data);b.free();clone.data.materials.clear();clone.data.materials.append(material)
 for f in clone.data.polygons:f.material_index=0;f.use_smooth=False
 clone.name=a.style+'_'+name+'_'+str(regionIndex);clone['garmentRegion']=name
 if data['meshes'][regionIndex].get('bindDomain'):clone['garmentBindDomain']=data['meshes'][regionIndex]['bindDomain']
 if data['meshes'][regionIndex].get('surface'):clone['garmentSurface']=data['meshes'][regionIndex]['surface']
 if not clone.data.polygons:bpy.data.objects.remove(clone,do_unlink=True)
bpy.data.objects.remove(obj,do_unlink=True);bpy.ops.object.select_all(action='SELECT');file=a.destination/('Clothing_'+a.style+'_LOD2.glb');assert not file.exists();bpy.ops.export_scene.gltf(filepath=str(file.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
record={'reviewRequired':True,'style':a.style,'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'fit':{'authoringFrame':'canonical','up':'+Y','front':'+Z','origin':'canonical root / feet','garmentBind':data['garmentBind'],'sourcePoseCalibration':'measured source-to-canonical pose coordinates only through shared GarmentFit calibration; morphology and collision reserved for runtime','authoringCalibration':data.get('authoringCalibration',{'status':'historical authoring policy unrecorded'})},'geometryOptimization':{'beforeTriangles':before,'targetTriangles':a.target,'colourTransfer':'preserved reference facet palette with padded 8px atlas tiles','jointRegionWeldMetres':.00001}}
file.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.destination/'garment-bind.json').write_text(json.dumps(data['garmentBind'],indent=2)+'\n');print('CANONICAL_GARMENT',file,'written',flush=True)

