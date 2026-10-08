"""Insert minimum planar source supports for a genuine outer garment sheet.
All new points lie on immutable native triangles; source corners, palette,
normals and silhouette stay exact. The shared fitter later transports them.
"""
import argparse,bpy,bmesh,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--minimum-native-gap',type=float,default=.0025)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
positions=[];triangles=[]
for obj in objects:
 if obj.get('garmentRegion')!='skirt' or obj.get('garmentSurface')=='accessory':continue
 base=len(positions);positions.extend([v.co.copy() for v in obj.data.vertices]);triangles.extend([tuple(base+i for i in face.vertices) for face in obj.data.polygons])
assert triangles;tree=BVHTree.FromPolygons(positions,triangles,all_triangles=True);records=[]
def key(point):return tuple(round(v*1e6) for v in point)
def edgekey(a,b):return tuple(sorted((key(a),key(b))))
edges={}
for obj in objects:
 if obj.get('garmentSurface')!='accessory':continue
 for face in obj.data.polygons:
  points=[obj.data.vertices[i].co.copy() for i in face.vertices]
  for k in range(3):
   first,last=points[k],points[(k+1)%3];middle=(first+last)/2
   if tree.find_nearest(middle)[3]>a.minimum_native_gap:edges[edgekey(first,last)]=middle
for obj in objects:
 accessory=obj.get('garmentSurface')=='accessory'
 uv=obj.data.uv_layers.active.data;source=[]
 for face in obj.data.polygons:
  assert len(face.vertices)==3
  points=[obj.data.vertices[i].co.copy() for i in face.vertices];uvs=[uv[i].uv.copy() for i in face.loop_indices]
  centre=sum(points,Vector())/3;hit,normal,donor,gap=tree.find_nearest(centre)
  source.append({'face':face.index,'points':points,'uv':uvs,'material':face.material_index,'normal':face.normal.copy(),'centre':centre,'gap':gap if accessory else 0,'donor':donor})
 newpositions=[];faces=[];newuv=[];newmaterials=[];repairs=[]
 def append(point,tex):
  index=len(newpositions);newpositions.append(point);newuv.append(tex);return index
 for record in source:
  points=record['points'];uvs=record['uv'];boundary=[]
  for k in range(3):
   boundary.append((points[k],uvs[k]));support=edges.get(edgekey(points[k],points[(k+1)%3]))
   if support is not None:boundary.append((support,(uvs[k]+uvs[(k+1)%3])/2))
  if len(boundary)==3 and record['gap']<=a.minimum_native_gap:
   faces.append(tuple(append(point,tex) for point,tex in boundary));newmaterials.append(record['material']);continue
  centre=append(record['centre'],sum(uvs,Vector((0,0)))/3);ids=[append(point,tex) for point,tex in boundary]
  for k in range(len(ids)):faces.append((ids[k],ids[(k+1)%len(ids)],centre));newmaterials.append(record['material'])
  repairs.append({'originalSourceFace':record['face'],'originalCornersBlender':[list(point) for point in points],'originalUV':[list(tex) for tex in uvs],'originalNormalBlender':list(record['normal']),'sourceCentroidBlender':list(record['centre']),'nearestPrimarySourceTriangle':record['donor'],'originalInteriorGapMetres':record['gap'],'edgeSupports':len(boundary)-3,'addedTriangles':len(boundary)-1})
 materials=list(obj.data.materials);mesh=bpy.data.meshes.new(obj.name+'_native_layer_supports');mesh.from_pydata(newpositions,[],faces);mesh.update()
 for material in materials:mesh.materials.append(material)
 layer=mesh.uv_layers.new(name='TEXCOORD_0')
 for i,face in enumerate(mesh.polygons):
  face.material_index=newmaterials[i];face.use_smooth=False
  for vertex,loop in zip(face.vertices,face.loop_indices):layer.data[loop].uv=newuv[vertex]
 obj.data=mesh
 records.append({'mesh':obj.name,'region':obj.get('garmentRegion'),'surface':obj.get('garmentSurface','main'),'originalFaces':len(source),'outputFaces':len(faces),'nativeSupports':repairs,'originalCornersDisplaced':0,'newPointsPolicy':'exact linear source-edge / native triangle-centroid interpolation; shared edges propagate across all source semantic meshes; each incident face keeps original UV interpolation and planar normal'})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'sourceLayerInteriorSupports':{'minimumNativeGapMetres':a.minimum_native_gap,'records':records,'productionWearClearanceBaked':False}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('NATIVE_LAYER_SUPPORTS',[(r['originalFaces'],r['outputFaces'],len(r['nativeSupports'])) for r in records],flush=True)
