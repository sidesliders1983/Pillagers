"""Assign genuine native tie surfaces to their measured fabric support layer.

Only original leg-cloth facets geometrically coincident with a repaired native
upper-rim overlap notch qualify. Hue alone never selects trousers or anatomy.
The original tie outline/palette is preserved, with a declared2mm thin layer.
"""
import argparse,bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--maximum-source-contact',type=float,default=.01);p.add_argument('--thickness',type=float,default=.002);p.add_argument('--waist-seam-fade',type=float,default=.02);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True);record=json.loads(a.source.with_suffix('.provenance.json').read_text());patches=[p for r in record['fabricOverlapUnderlay']['records'] for p in r['patches'] if p['policy']=='native upper-rim overlap notch underlay'];assert patches;points=[Vector(p) for face in patches for p in face['pointsBlender']];triangles=[tuple(range(i,i+3)) for i in range(0,len(points),3)];tree=BVHTree.FromPolygons(points,triangles,all_triangles=True);bind=json.loads((a.source.parent/'garment-bind.json').read_text())['joints'];hip=bind['Hips'][1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];reports=[]
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
for obj in objects:
 if obj.get('garmentRegion')!='cloth' or obj.get('garmentSurface')=='accessory':continue
 bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.index_update();sourceId=bm.faces.layers.int.new('immutable_source_face')
 for face in bm.faces:face[sourceId]=face.index
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.faces.index_update();bm.verts.index_update();uv=bm.loops.layers.uv.active;images={}
 for i,material in enumerate(obj.data.materials):
  node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE');images[i]=(list(node.image.pixels[:]),node.image.size[:],node.image.channels)
 selected=[];evidence=[]
 for face in bm.faces:
  centre=face.calc_center_median();hit,normal,index,distance=tree.find_nearest(centre)
  if not hit or distance>a.maximum_source_contact:continue
  if max(tree.find_nearest(vertex.co)[3] for vertex in face.verts)>a.maximum_source_contact*2:continue
  sample=sum((loop[uv].uv for loop in face.loops),Vector((0,0)))/len(face.loops);pixels,size,channels=images[face.material_index];x=min(size[0]-1,max(0,int(sample.x*size[0])));y=min(size[1]-1,max(0,int(sample.y*size[1])));rgb=pixels[(y*size[0]+x)*channels:(y*size[0]+x)*channels+3];chroma=[v/max(1e-8,sum(rgb)) for v in rgb]
  if chroma[0]<.4:continue
  selected.append(face[sourceId]);evidence.append({'originalSourceFace':face[sourceId],'sourceRGB':rgb,'sourceChroma':chroma,'sourceFacetCentreBlender':list(centre),'sourceFacetCornersBlender':[list(v.co) for v in face.verts],'sourceFacetUV':[list(loop[uv].uv) for loop in face.loops],'primaryNotchTriangle':index,'actualNativeContactDistanceMetres':distance})
 bm.free()
 if not selected:continue
 clone=obj.copy();clone.data=obj.data.copy();bpy.context.scene.collection.objects.link(clone);clone.name=obj.name+'_native_tie';clone['garmentRegion']='skirt';clone['garmentSurface']='accessory';changes=[]
 for target,keep in [(clone,set(selected)),(obj,set(range(len(obj.data.polygons)))-set(selected))]:
  part=bmesh.new();part.from_mesh(target.data);part.faces.ensure_lookup_table();bmesh.ops.delete(part,geom=[f for f in part.faces if f.index not in keep],context='FACES');bmesh.ops.delete(part,geom=[v for v in part.verts if not v.link_faces],context='VERTS');bmesh.ops.remove_doubles(part,verts=list(part.verts),dist=1e-6)
  if target==clone:
   for vertex in part.verts:
    original=vertex.co.copy();radial=Vector((vertex.co.x-bind['Hips'][0],vertex.co.y+bind['Hips'][2],0));factor=max(0,min(1,(hip-vertex.co.z)/a.waist_seam_fade)) if a.waist_seam_fade>0 else 1
    if radial.length:vertex.co+=radial.normalized()*a.thickness*factor
    if (vertex.co-original).length>1e-8:changes.append({'sourceBlender':list(original),'targetBlender':list(vertex.co),'metres':(vertex.co-original).length})
  bmesh.ops.recalc_face_normals(part,faces=list(part.faces));part.to_mesh(target.data);part.free();target.data.update()
  for face in target.data.polygons:face.use_smooth=False
 reports.append({'mesh':obj.name,'nativeTieMesh':clone.name,'selectedOriginalSourceFaces':evidence,'changes':changes,'authoredLayerThicknessMetres':a.thickness,'maximumActualDisplacementMetres':max((c['metres'] for c in changes),default=0)})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);output={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':record,'sourceAccessoryOwnership':{'authority':'original warm tie facets coincident with native upper-rim underlay; no nearest-trouser/pigment-only selection','maximumSourceContactMetres':a.maximum_source_contact,'records':reports,'productionWearClearanceBaked':False}};a.output.with_suffix('.provenance.json').write_text(json.dumps(output,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('NATIVE_ACCESSORY',[(r['nativeTieMesh'],len(r['selectedOriginalSourceFaces']),r['maximumActualDisplacementMetres']) for r in reports],flush=True)
