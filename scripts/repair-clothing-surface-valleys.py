"""Conform only a generated fabric's inward valley to its own outer envelope.

Retains original triangles, UV pigments, measured source waist/hem and semantic
interfaces. Original accent/tie facets are kept as accessory surfaces and never
projected. The source cage is a bounded authoring coordinate field, not a mesh
replacement or a runtime body wrapper. Factory-startup Blender only.
"""
import argparse,bpy,bmesh,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
record=json.loads(a.source.with_suffix('.provenance.json').read_text());bind=record['fit']['garmentBind']['joints'];hip=Vector((bind['Hips'][0],-bind['Hips'][2],bind['Hips'][1]));chest=Vector((bind['Chest'][0],-bind['Chest'][2],bind['Chest'][1]));waist=hip.z+(chest.z-hip.z)/3;fade_height=(chest.z-hip.z)/6
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
for obj in objects:
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
reports=[]
for obj in objects:
 if obj.get('garmentRegion')!='skirt' or obj.get('garmentSurface')=='accessory':continue
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.faces.ensure_lookup_table();bm.faces.index_update();uv=bm.loops.layers.uv.active
 image=next(node.image for node in obj.data.materials[0].node_tree.nodes if node.type=='TEX_IMAGE' and node.image);width,height=image.size;pixels=list(image.pixels[:]);channels=image.channels
 def accent(face):
  sample=sum((loop[uv].uv for loop in face.loops),Vector((0,0)))/len(face.loops);x=max(0,min(width-1,int(sample.x*width)));y=max(0,min(height-1,int(sample.y*height)));r,g,b=pixels[(y*width+x)*channels:(y*width+x)*channels+3];return r>g*1.7 and r>b*1.8
 accessories={face for face in bm.faces if accent(face)};fabric={face for face in bm.faces if face not in accessories};protected={vertex for face in accessories for vertex in face.verts};other_points=[vertex.co.copy() for other in objects if other!=obj for vertex in other.data.vertices]
 point_keys={tuple(round(point[i],6) for i in range(3)) for point in other_points}
 protected.update(vertex for vertex in bm.verts if tuple(round(vertex.co[i],6) for i in range(3)) in point_keys)
 cage=bmesh.new();bmesh.ops.convex_hull(cage,input=[cage.verts.new(vertex.co) for vertex in {vertex for face in fabric for vertex in face.verts}],use_existing_faces=False);bmesh.ops.recalc_face_normals(cage,faces=list(cage.faces));tree=BVHTree.FromBMesh(cage)
 displaced=[];affected=set();before_normals={face:face.normal.copy() for face in fabric}
 for vertex in {vertex for face in fabric for vertex in face.verts}:
  if vertex in protected:continue
  fade=max(0,min(1,(waist-vertex.co.z)/fade_height))
  if not fade:continue
  axis=hip+(chest-hip)*((vertex.co.z-hip.z)/(chest.z-hip.z));radial=Vector((vertex.co.x-axis.x,vertex.co.y-axis.y,0))
  if radial.length<1e-7:continue
  start=Vector((axis.x,axis.y,vertex.co.z));hit,normal,index,distance=tree.ray_cast(start,radial.normalized())
  if hit is None:continue
  outward=hit-vertex.co
  if outward.dot(radial)<=1e-7:continue
  delta=outward*fade
  if delta.length<1e-6:continue
  displaced.append({'source':list(vertex.co),'delta':list(delta),'metres':delta.length});affected.update(vertex.link_faces);vertex.co+=delta
 bm.normal_update();fold_changed=sum(face.normal.dot(before_normals[face])<0 for face in fabric)
 if accessories:
  clone=obj.copy();clone.data=obj.data.copy();bpy.context.collection.objects.link(clone);part=bmesh.new();part.from_mesh(clone.data);part.faces.ensure_lookup_table();keep={face.index for face in accessories};bmesh.ops.delete(part,geom=[face for face in part.faces if face.index not in keep],context='FACES');bmesh.ops.delete(part,geom=[v for v in part.verts if not v.link_faces],context='VERTS');part.to_mesh(clone.data);part.free();clone.name=obj.name+'_source_ties';clone['garmentSurface']='accessory'
 bmesh.ops.delete(bm,geom=list(accessories),context='FACES');bmesh.ops.delete(bm,geom=[vertex for vertex in bm.verts if not vertex.link_faces],context='VERTS');bm.to_mesh(obj.data);bm.free();cage.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
 reports.append({'sourceMesh':obj.name,'sourceTrianglesRetained':len(fabric)+len(accessories),'sourceAccessoryTrianglesProtected':len(accessories),'sharedSemanticVerticesProtected':len(protected),'sourceWaistMetres':waist,'zeroWaistFadeAuthority':'measured Hips→Chest one-third; fade length one-sixth of that segment','sourceFabricVerticesDisplaced':len(displaced),'affectedSourceFaces':len(affected),'maximumDisplacementMetres':max((row['metres'] for row in displaced),default=0),'foldNormalsReoriented':fold_changed,'sourceCoordinateChanges':displaced})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
result={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':record,'fit':record['fit'],'style':record['style'],'lod':record['lod'],'geometryOptimization':{'sourceValleyField':reports,'policy':'original source surface topology/UV palette; original waist/hem and all semantic interfaces retained; protected native accessories; no body masks, no added wear clearance, no replacement surface'}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(result,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_text(json.dumps(record['fit']['garmentBind'],indent=2)+'\n');print('SOURCE_VALLEY_FIELD',json.dumps([{key:value for key,value in row.items() if key!='sourceCoordinateChanges'} for row in reports]),flush=True)
