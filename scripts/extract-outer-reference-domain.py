"""Clean a complete reference volume before reducing its pigment surface.

The original UV labels are sampled on the cleaned external surface before
simplification. Inner atlas charts cannot become disconnected garment/hair
plates. Reference pigment coverage is transferred, never redrawn.
"""
import bpy,bmesh,numpy as np,argparse,sys,json,hashlib,heapq
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--target',type=int,default=4000);p.add_argument('--voxel-size',type=float,default=.002);p.add_argument('--domain-close-radius',type=float,default=0);p.add_argument('--maximum-puncture-area',type=float,default=0);p.add_argument('--external-cache',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);record=json.loads(a.source.with_suffix('.provenance.json').read_text());src=np.load(a.source);assert 'pigment' in src,'Whole reference geometry and original pigment labels are required';labels=src['pigment'];positions=src['positions'];faces=src['faces']
geometry_signature=hashlib.sha256(positions.tobytes()+faces.tobytes()).hexdigest();cache_used=False
native_source_sha=record['sourceSha256'];native_frame=record.get('sourceHeadFrame');ancestor=record
while isinstance(ancestor,dict):
 if str(ancestor.get('source','')).lower().endswith('.glb'):native_source_sha=ancestor['sourceSha256']
 if not native_frame and ancestor.get('sourceHeadFrame'):native_frame=ancestor['sourceHeadFrame']
 ancestor=ancestor.get('sourceProvenance')
if a.external_cache and a.external_cache.exists():
 authority=json.loads(a.external_cache.with_suffix('.provenance.json').read_text())
 assert authority['sourceGLBSha256']==native_source_sha and authority['canonicalGeometrySha256']==geometry_signature and authority['voxelSizeMeters']==a.voxel_size,'External cache belongs to different source geometry, canonical frame or voxel size'
 assert hashlib.sha256(a.external_cache.read_bytes()).hexdigest()==authority['outputSha256'],'Immutable external source cache hash mismatch'
 cached=np.load(a.external_cache);external_positions=cached['positions'];external_faces=cached['faces'];nearest=cached['nearestOriginalFace'];assert len(nearest)==len(external_faces) and int(nearest.max())<len(labels)
 mesh=bpy.data.meshes.new('Immutable complete reference external surface');mesh.from_pydata(external_positions.tolist(),[],external_faces.tolist());mesh.update();o=bpy.data.objects.new('Reference volume',mesh);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table();cache_used=True;print('VERIFIED_EXTERNAL_CACHE',len(external_faces),flush=True);del cached,external_positions,external_faces,positions,faces,src
else:
 _,first,inverse=np.unique(np.round(positions/1e-6).astype(np.int64),axis=0,return_index=True,return_inverse=True);positions=positions[first];faces=inverse[faces];vertices=[Vector(q) for q in positions];triangles=faces.tolist();tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
 mesh=bpy.data.meshes.new('Complete original reference volume');mesh.from_pydata(positions.tolist(),[],triangles);mesh.update();mesh.validate();o=bpy.data.objects.new('Reference volume',mesh);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);print('WHOLE_REFERENCE',len(faces),len(positions),flush=True)
 mesh.remesh_voxel_size=a.voxel_size;mesh.remesh_voxel_adaptivity=0;bpy.ops.object.voxel_remesh();mesh=o.data;mesh.calc_loop_triangles();bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.faces.ensure_lookup_table();bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));nearest=[]
 for f in bm.faces:
  hit=tree.find_nearest(f.calc_center_median());nearest.append(hit[2] if hit[2] is not None else -1)
 nearest=np.array(nearest,dtype=np.int32);del tree,vertices,triangles,faces,positions,src
 if a.external_cache:
  a.external_cache.parent.mkdir(parents=True,exist_ok=True);bm.verts.index_update();np.savez_compressed(a.external_cache,positions=np.array([tuple(v.co) for v in bm.verts],dtype=np.float32),faces=np.array([[v.index for v in f.verts] for f in bm.faces],dtype=np.int32),nearestOriginalFace=nearest)
  authority={'sourceGLBSha256':native_source_sha,'canonicalGeometrySha256':geometry_signature,'voxelSizeMeters':a.voxel_size,'outputSha256':hashlib.sha256(a.external_cache.read_bytes()).hexdigest(),'sourceHeadFrame':native_frame,'sourceTriangles':len(labels),'externalTriangles':len(nearest),'mapping':'nearest original full-reference triangle index; no pigment classifications cached'}
  a.external_cache.with_suffix('.provenance.json').write_text(json.dumps(authority,indent=2)+'\n')
selected=[f for index,f in enumerate(bm.faces) if nearest[index]>=0 and labels[nearest[index]]]
initial_pigment_faces=len(selected);closed_punctures=0;puncture_area=0
if a.domain_close_radius or a.maximum_puncture_area:
 bm.faces.index_update();fs=list(bm.faces);centres=[f.calc_center_median() for f in fs];adjacency=[]
 for f in fs:
  neighbours={other.index for e in f.edges for other in e.link_faces if other is not f}
  adjacency.append([(j,(centres[f.index]-centres[j]).length) for j in neighbours])
 domain={f.index for f in selected}
 def expand(seed,radius):
  distances={};queue=[]
  # Only the colour boundary seeds the geodesic wave. The large interior of
  # the painted reference does not need to be copied into a priority queue.
  for i in seed:
   for j,d in adjacency[i]:
    if j not in seed and d<=radius and d<distances.get(j,float('inf')):
     distances[j]=d;heapq.heappush(queue,(d,j))
  while queue:
   distance,i=heapq.heappop(queue)
   if distance!=distances[i]:continue
   for j,cost in adjacency[i]:
    new_distance=distance+cost
    if j not in seed and new_distance<=radius and new_distance<distances.get(j,float('inf')):
     distances[j]=new_distance;heapq.heappush(queue,(new_distance,j))
  return seed|set(distances)
 if a.domain_close_radius:
  dilated=expand(domain,a.domain_close_radius)
  outside=set(range(len(fs)))-dilated
  domain=set(range(len(fs)))-expand(outside,a.domain_close_radius)
 if a.maximum_puncture_area:
  remaining=set(range(len(fs)))-domain
  while remaining:
   todo=[remaining.pop()];part=[];area=0
   while todo:
    i=todo.pop();part.append(i);area+=fs[i].calc_area()
    for j,_ in adjacency[i]:
     if j in remaining:remaining.remove(j);todo.append(j)
   if area<=a.maximum_puncture_area:
    domain.update(part);closed_punctures+=1;puncture_area+=area
 selected=[fs[i] for i in domain];del adjacency,centres,fs
 print('CLOSED_SOURCE_PIGMENT',initial_pigment_faces,len(selected),closed_punctures,flush=True)
selected_set=set(selected);removed=[f for f in bm.faces if f not in selected_set];bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(mesh);bm.free();print('EXTERNAL_PIGMENT',len(mesh.polygons),flush=True)
for i in range(12):
 count=sum(len(f.vertices)-2 for f in o.data.polygons)
 print('REDUCE',i,count,flush=True)
 if count<=a.target:break
 mod=o.modifiers.new('Reference faceted reduction','DECIMATE');mod.ratio=max(.1,a.target/count);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);remaining=set(bm.faces);parts=[]
while remaining:
 todo=[remaining.pop()];part=[]
 while todo:
  f=todo.pop();part.append(f)
  for e in f.edges:
   for other in e.link_faces:
    if other in remaining:remaining.remove(other);todo.append(other)
 parts.append(part)
largest=max(sum(f.calc_area() for f in part) for part in parts);micro=[f for part in parts if sum(f.calc_area() for f in part)<largest*.015 for f in part];bmesh.ops.delete(bm,geom=micro,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.normal_update();bm.verts.index_update();clean=bpy.data.meshes.new('Original external pigment facets');clean.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);clean.update();clean.validate();bm.free();o.data=clean;o.name=f"{'Hair' if record['kind']=='hair' else 'Beard'}_{record['style']}_LOD2"
m=bpy.data.materials.new('Profile reference hair');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;clean.materials.append(m)
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
out={'reviewRequired':True,'kind':record['kind'],'style':record['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':record,'geometryOptimization':{'outputTriangles':len(clean.polygons),'removedMicroscopicFaces':len(micro),'wholeReferenceVoxelSizeMeters':a.voxel_size,'pigmentTransfer':'nearest original UV-labelled triangle on cleaned external surface, before reduction','surfaceDomainClosingRadiusMeters':a.domain_close_radius,'maximumSourcePunctureAreaSquareMetres':a.maximum_puncture_area,'closedSourcePunctures':closed_punctures,'closedSourcePunctureAreaSquareMetres':puncture_area,'originalClassifiedExternalFaces':initial_pigment_faces,'contourRedrawn':False,'facetedNormals':True,'windingAuthority':'complete reference volume before pigment extraction','profileMaterialCount':1},'fit':record['fit']};a.output.with_suffix('.provenance.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['geometryOptimization']),flush=True)
if a.external_cache:
 out['geometryOptimization']['externalSurfaceCache']={'path':str(a.external_cache.resolve()),'sha256':hashlib.sha256(a.external_cache.read_bytes()).hexdigest(),'canonicalGeometrySha256':geometry_signature,'reused':cache_used}
 a.output.with_suffix('.provenance.json').write_text(json.dumps(out,indent=2)+'\n')
