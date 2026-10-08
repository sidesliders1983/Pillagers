"""Coherently simplify a traced native wear rim, retaining its source outline.

The measured closed boundary is sampled by its own arclength. A periodic local
filter removes repeated fringe excursions; existing native controls are then
retired with the manifold edge-link condition. Interior geometry, face UV
ownership and separate wear layers remain. No body or fitted cage is sampled.
"""
import argparse,bpy,bmesh,json,hashlib,sys,math
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--controls',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();c=json.loads(a.controls.read_text());assert c['sourceSha256']==hashlib.sha256(a.source.read_bytes()).hexdigest();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));records=[]
def canonical(p):return [p.x,p.z,-p.y]
for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.verts.index_update();bm.faces.index_update();bm.normal_update();uv=bm.loops.layers.uv.active
 for control in c['loops']:
  if obj.get('garmentRegion')!=control['region'] or obj.get('garmentSurface')=='accessory':continue
  seed=Vector((control['seed'][0],-control['seed'][2],control['seed'][1]));matches=[v for v in bm.verts if (v.co-seed).length<2e-6]
  if not matches:continue
  assert len(matches)==1;first=matches[0];ordered=[first];previous=None;current=first
  while True:
   boundary=[e.other_vert(current) for e in current.link_edges if e.is_boundary];assert len(boundary)==2,'Only a single deliberate wear-rim loop is supported.'
   nxt=next(v for v in boundary if v!=previous)
   if nxt==first:break
   assert nxt not in ordered;ordered.append(nxt);previous,current=current,nxt
  assert len(ordered)==control['sourceVertices'];original={v:v.co.copy() for v in bm.verts};originalfaces={f:{'id':f.index,'corners':[canonical(v.co) for v in f.verts],'normal':canonical(f.normal),'UV':[list(l[uv].uv) for l in f.loops]} for f in bm.faces};points=[original[v] for v in ordered];arc=[0.]
  for i in range(len(points)):arc.append(arc[-1]+(points[(i+1)%len(points)]-points[i]).length)
  perimeter=arc[-1]
  def sample(t):
   distance=(t%1)*perimeter;i=next((i for i in range(len(points)) if arc[i+1]>=distance),len(points)-1);return points[i].lerp(points[(i+1)%len(points)],(distance-arc[i])/max(1e-10,arc[i+1]-arc[i]))
  n=256;samples=[sample(i/n) for i in range(n)];radius=8
  filtered=[]
  for i in range(n):
   value=Vector();total=0
   for offset in range(-radius,radius+1):weight=math.exp(-.5*(offset/4)**2);value+=samples[(i+offset)%n]*weight;total+=weight
   filtered.append(value/total)
  def target(t):position=(t%1)*n;index=int(position);return filtered[index].lerp(filtered[(index+1)%n],position-index)
  desired=control['targetCorners'];anchors={min(range(len(ordered)),key=lambda i:abs(arc[i]/perimeter-j/desired)) for j in range(desired)};anchorverts={ordered[i] for i in anchors};ring=set(ordered)
  for i,v in enumerate(ordered):v.co=target(arc[i]/perimeter)
  bm.normal_update();collapsed=[];blocked=[]
  for vertex in list(ordered):
   if vertex in anchorverts or not vertex.is_valid:continue
   boundary=[e for e in vertex.link_edges if e.is_boundary]
   if len(boundary)!=2:blocked.append(original[vertex]);continue
   candidates=sorted([e.other_vert(vertex) for e in boundary],key=lambda v:(0 if v in anchorverts else 1,(v.co-vertex.co).length));chosen=None
   for nextvertex in candidates:
    edge=next(e for e in boundary if e.other_vert(vertex)==nextvertex);neighbours=lambda v:{e.other_vert(v) for e in v.link_edges};opposite={v for f in edge.link_faces for v in f.verts if v not in {vertex,nextvertex}}
    if neighbours(vertex)&neighbours(nextvertex)!=opposite:continue
    old=vertex.co.copy();vertex.co=nextvertex.co;valid=all(f.calc_area()>1e-10 for f in vertex.link_faces if nextvertex not in f.verts);vertex.co=old
    if valid:chosen=nextvertex;break
   if chosen is None:blocked.append(original[vertex]);continue
   collapsed.append({'originalPoint':canonical(original[vertex]),'mergedToOriginalPoint':canonical(original[chosen]),'outputPoint':canonical(chosen.co),'sourceFaces':[originalfaces[f]['id'] for f in vertex.link_faces if f in originalfaces],'displacementMetres':(original[vertex]-chosen.co).length});bmesh.ops.pointmerge(bm,verts=[vertex,chosen],merge_co=chosen.co.copy());bm.normal_update()
  remaining=[v for v in ring if v.is_valid];affected=[]
  for f,old in originalfaces.items():
   if not f.is_valid:continue
   if any(v in ring for v in f.verts):affected.append(dict(old,outputCorners=[canonical(v.co) for v in f.verts],outputNormal=canonical(f.normal),originalNormalDot=Vector((old['normal'][0],-old['normal'][2],old['normal'][1])).dot(f.normal)))
  changes=[{'originalPoint':canonical(original[v]),'outputPoint':canonical(v.co),'displacementMetres':(original[v]-v.co).length} for v in remaining]
  assert all(f.calc_area()>1e-10 for f in bm.faces)
  records.append({'mesh':obj.name,'semanticRegion':obj.get('garmentRegion'),'sourceRimVertices':len(ordered),'remainingRimVertices':len(remaining),'sourcePerimeterMetres':perimeter,'sampling':'256 equal native arclength samples, periodic Gaussian sigma4samples radius8; no body/template positions','targetCorners':desired,'originalRim':[canonical(v) for v in points],'collapsedControls':collapsed,'remainingControls':changes,'blockedControls':[canonical(v) for v in blocked],'originalFaceOwnership':affected,'maximumDisplacementMetres':max([r['displacementMetres'] for r in collapsed+changes]),'UVChanged':False,'interiorVerticesMoved':0,'openHemPreserved':True})
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
 for face in obj.data.polygons:face.use_smooth=False
assert len(records)==len(c['loops']);bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
bindbytes=(a.source.parent/'garment-bind.json').read_bytes();(a.output.parent/'garment-bind.json').write_bytes(bindbytes);record={'reviewRequired':True,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':json.loads(a.source.with_suffix('.provenance.json').read_text()),'nativePairedRimOptimization':{'controls':str(a.controls.resolve()),'controlsSha256':hashlib.sha256(a.controls.read_bytes()).hexdigest(),'records':records,'authority':'Independently traced native paired free-hem loops; accidental repeated fringe removed coherently without replacing the native garment silhouette, opening, interior panels, trousers or painted tie. Production clearance is not baked.'},'outputGarmentBind':{'frame':'universal-human-neutral-v1','units':'metres','up':'+Y','front':'+Z','origin':'ground','joints':json.loads(bindbytes)['joints'],'metadataSha256':hashlib.sha256(bindbytes).hexdigest()}}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print('NATIVE_PAIRED_RIM',[(r['sourceRimVertices'],r['remainingRimVertices'],r['maximumDisplacementMetres']) for r in records],flush=True)
