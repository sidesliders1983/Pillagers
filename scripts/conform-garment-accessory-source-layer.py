"""Repair measured ornament-to-fabric chord contacts in source coordinates.

Only explicitly authored accessory meshes are processed. Their matching region
and pose domain primary layer provides actual triangle support; neither anatomy
nor trousers from another role can become the support. Original UV pigment and
faceting are retained, with minimum edge/interior supports where necessary.
This declares a thin source material layer, not production body wear clearance.
"""
import argparse,bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--source-layer',type=float,default=.002);p.add_argument('--maximum-source-deviation',type=float,default=.025);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];bind=json.loads((a.source.parent/'garment-bind.json').read_text())['joints'];reports=[]
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
def key(obj):return obj.get('garmentRegion','cloth'),obj.get('garmentBindDomain')
for obj in objects:
 if obj.get('garmentSurface')!='accessory':continue
 donors=[o for o in objects if o.get('garmentSurface')!='accessory' and key(o)==key(obj)];assert donors
 points=[];faces=[]
 for donor in donors:
  base=len(points);points.extend(v.co.copy() for v in donor.data.vertices);faces.extend(tuple(base+i for i in f.vertices) for f in donor.data.polygons)
 tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
 def clear(point):
  anchor,normal,face,distance=tree.find_nearest(point);radial=Vector((point.x-bind['Hips'][0],point.y+bind['Hips'][2],0))
  if normal.dot(radial)<0:normal.negate()
  gap=(point-anchor).dot(normal);target=point+normal*max(0,a.source_layer-gap);assert (target-point).length<=a.maximum_source_deviation,(list(point),gap)
  return target,{'supportFace':face,'sourceGapMetres':gap,'sourceDistanceMetres':distance,'sourceBlender':list(point),'targetBlender':list(target),'displacementMetres':(target-point).length}
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.verts.index_update();bm.faces.index_update();bm.edges.index_update();uv=bm.loops.layers.uv.active;original={vertex:vertex.co.copy() for vertex in bm.verts};changes=[]
 for vertex in bm.verts:
  target,evidence=clear(vertex.co);vertex.co=target
  if evidence['displacementMetres']>1e-8:changes.append({'sourceVertex':vertex.index,**evidence})
 edge_support={}
 for edge in list(bm.edges):
  point=sum((v.co for v in edge.verts),Vector())*.5;target,evidence=clear(point)
  if evidence['displacementMetres']>1e-5:edge_support[edge]=(bm.verts.new(target),evidence)
 source_faces=list(bm.faces);added=[]
 for face in source_faces:
  corners=list(face.verts);boundary=[];uvs=[]
  for loop in face.loops:
   boundary.append(loop.vert);uvs.append(loop[uv].uv.copy())
   if loop.edge in edge_support:
    boundary.append(edge_support[loop.edge][0]);uvs.append((loop[uv].uv+loop.link_loop_next[uv].uv)*.5)
  centre=sum((v.co for v in corners),Vector())/3;target,evidence=clear(centre)
  if len(boundary)==3 and evidence['displacementMetres']<=1e-5:continue
  support=bm.verts.new(target);centreUV=sum((loop[uv].uv for loop in face.loops),Vector((0,0)))/3;sourceUV=[list(loop[uv].uv) for loop in face.loops];sourceId=face.index;material=face.material_index;bm.faces.remove(face)
  for i in range(len(boundary)):
   triangle=bm.faces.new([boundary[i],boundary[(i+1)%len(boundary)],support]);triangle.material_index=material
   for loop,sample in zip(triangle.loops,[uvs[i],uvs[(i+1)%len(boundary)],centreUV]):loop[uv].uv=sample
  added.append({'originalAccessoryFace':sourceId,'originalFaceUV':sourceUV,'newTriangles':len(boundary),'centreSupport':evidence,'edgeSupports':[record for edge,(v,record) in edge_support.items() if v in boundary]})
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
 reports.append({'mesh':obj.name,'donorMeshes':[d.name for d in donors],'semanticRole':key(obj),'declaredSourceLayerMetres':a.source_layer,'vertexCorrections':changes,'necessarySupportFaces':added,'originalUVPaletteRetained':True,'productionWearClearanceBaked':False})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'sourcePrimaryLayerContactRepair':{'authority':'exact same-region/domain original primary triangles; bounded necessary ornament chord supports','maximumSourceDeviationMetres':a.maximum_source_deviation,'records':reports}};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('LAYER_CONTACT',[(r['mesh'],len(r['vertexCorrections']),len(r['necessarySupportFaces']),max((c['displacementMetres'] for c in r['vertexCorrections']),default=0)) for r in reports],flush=True)
