"""Restore only fabric omitted beneath native trouser/tie overlaps.

Measured main-fabric boundary paths supply every contour. Existing reference
vertices, folds, trousers, tie and palette remain intact. Small additions close
an overlap notch and continue missing hem fabric to nearby existing hem height;
the open hem and true waist seams remain open/attached as authored.
"""
import argparse,bpy,bmesh,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--hem-window-degrees',type=float,default=20);p.add_argument('--maximum-hem-patch-height',type=float,default=.16);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True);bind=json.loads((a.source.parent/'garment-bind.json').read_text())['joints'];hip=bind['Hips'][1];waist=hip+(bind['Chest'][1]-hip)/3
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for obj in objects:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
reports=[]
for obj in objects:
 if obj.get('garmentRegion')!='skirt' or obj.get('garmentSurface')=='accessory':continue
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.verts.index_update();bm.edges.index_update();bm.faces.index_update();bm.normal_update();uv=bm.loops.layers.uv.active;sourceFaces={f:f.index for f in bm.faces};sourceEdges={e:e.index for e in bm.edges};sourceVertices={v:v.index for v in bm.verts};sourceCoordinates={v:v.co.copy() for v in bm.verts};unseen={e for e in bm.edges if e.is_boundary};loops=[]
 while unseen:
  edge=unseen.pop();first,last=edge.verts;chain=[first,last];edges=[edge]
  while chain[-1]!=first:
   candidates=[e for e in chain[-1].link_edges if e in unseen and e.is_boundary]
   if not candidates:break
   edge=candidates[0];unseen.remove(edge);edges.append(edge);chain.append(edge.other_vert(chain[-1]))
  assert chain[-1]==first,'Underlay requires a simple measured closed rim.';loops.append((chain[:-1],edges))
 measurements=[{'sourceVertices':[sourceVertices[v] for v in chain],'sourceEdges':[sourceEdges[e] for e in edges],'sourcePointsBlender':[list(v.co) for v in chain],'heightRangeMetres':[min(v.co.z for v in chain),max(v.co.z for v in chain)]} for chain,edges in loops];patches=[];added=set()
 def palette(face,vertices):
  sample=sum((loop[uv].uv for loop in face.loops),Vector((0,0)))/len(face.loops)
  return sample,sourceFaces[face]
 def add_face(vertices,template,policy,lineage):
  if len(set(vertices))<3:return
  points=[v.co for v in vertices];area=(points[1]-points[0]).cross(points[2]-points[0]).length/2
  if area<1e-10:return
  face=bm.faces.new(vertices);sample,source=palette(template,vertices);face.material_index=template.material_index
  for loop in face.loops:loop[uv].uv=sample
  added.add(face);patches.append({'policy':policy,'sourcePaletteFace':source,'sourcePaletteUV':[list(loop[uv].uv) for loop in template.loops],'patchUV':list(sample),'pointsBlender':[list(v.co) for v in vertices],'areaMetresSquared':area,**lineage})
 for chain,edges in loops:
  heights=[v.co.z for v in chain]
  if max(heights)<hip-1e-6:
   # The lowest source contour, within an anatomical angular neighbourhood,
   # supplies the height of omitted cloth. Existing low points remain exact.
   angles=[math.atan2(-v.co.y-bind['Hips'][2],v.co.x-bind['Hips'][0]) for v in chain];window=math.radians(a.hem_window_degrees);target=[]
   for i,vertex in enumerate(chain):
    nearby=sorted(chain[k].co.z for k in range(len(chain)) if abs(math.atan2(math.sin(angles[k]-angles[i]),math.cos(angles[k]-angles[i])))<=window);q=nearby[max(0,int((len(nearby)-1)*.2))];height=min(vertex.co.z,q);assert vertex.co.z-height<=a.maximum_hem_patch_height
    target.append(vertex if vertex.co.z-height<1e-5 else bm.verts.new(Vector((vertex.co.x,vertex.co.y,height))))
   for i,edge in enumerate(edges):
    j=(i+1)%len(chain);template=next(f for f in edge.link_faces if f in sourceFaces);lineage={'sourceBoundaryEdge':sourceEdges[edge],'sourceBoundaryVertices':[sourceVertices[chain[i]],sourceVertices[chain[j]]],'nativeHemHeightMetres':[chain[i].co.z,chain[j].co.z],'measuredContinuationHeightMetres':[target[i].co.z,target[j].co.z]};add_face([chain[i],chain[j],target[j]],template,'native lower hem continuation',lineage);add_face([chain[i],target[j],target[i]],template,'native lower hem continuation',lineage)
  elif max(heights)>=waist-1e-5 and min(heights)<hip-.03:
   # The waist loop must not descend through the free hem merely because the
   # source painted a tie directly onto its single external figure surface.
   start=next(i for i,v in enumerate(chain) if v.co.z>=hip);ordered=chain[start:]+chain[:start];inside=[]
   for i,vertex in enumerate(ordered+[ordered[0]]):
    if vertex.co.z<hip:
     if not inside:inside=[ordered[(i-1)%len(ordered)]]
     inside.append(vertex)
    elif inside:
     inside.append(vertex);centre=sum((v.co for v in inside),Vector())/len(inside);template=min((f for v in inside for f in v.link_faces if f in sourceFaces),key=lambda f:(f.calc_center_median()-centre).length);support=bm.verts.new(centre);lineage={'sourceBoundaryVertices':[sourceVertices[v] for v in inside],'minimumNecessaryInteriorSupportBlender':list(centre)}
     for k in range(len(inside)):add_face([inside[k],inside[(k+1)%len(inside)],support],template,'native upper-rim overlap notch underlay',lineage)
     inside=[]
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
 reports.append({'mesh':obj.name,'nativeLoopMeasurements':measurements,'patches':patches,'addedTriangles':len(patches),'addedAreaMetresSquared':sum(row['areaMetresSquared'] for row in patches),'originalVerticesDisplaced':0})
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False);record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'fabricOverlapUnderlay':{'authority':'measured original main-fabric rim edges and neighbouring native hem contour; original tie/trousers/waist/folds retained','hemAngularWindowDegrees':a.hem_window_degrees,'records':reports,'productionWearClearanceBaked':False}};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');(a.output.parent/'garment-bind.json').write_bytes((a.source.parent/'garment-bind.json').read_bytes());print('SOURCE_UNDERLAY',[(r['mesh'],r['addedTriangles'],r['addedAreaMetresSquared']) for r in reports],flush=True)
