import bpy,bmesh,sys,json,hashlib,math
from pathlib import Path
from mathutils import Vector
style=sys.argv[sys.argv.index('--')+1];source=Path(sys.argv[-2]).resolve();dest=Path(sys.argv[-1]).resolve();dest.mkdir(parents=True,exist_ok=True)
for lod in range(3):
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);path=source/f'Hair_{style}_LOD{lod}.glb';bpy.ops.import_scene.gltf(filepath=str(path))
 obj=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=obj;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00002)
 unseen=set(bm.verts);parts=[]
 while unseen:
  pending=[unseen.pop()];part=set(pending)
  while pending:
   v=pending.pop()
   for edge in v.link_edges:
    w=edge.other_vert(v)
    if w in unseen:unseen.remove(w);part.add(w);pending.append(w)
  parts.append(part)
 areas=[sum(f.calc_area() for f in {f for v in part for f in v.link_faces}) for part in parts];largest=max(areas);drop=[v for part,area in zip(parts,areas) if area<largest*.025 for v in part]
 if drop:bmesh.ops.delete(bm,geom=drop,context='VERTS')
 bm.to_mesh(obj.data);bm.free()
 # Reference bust faces +Y; fixed human faces -Y in Blender. Uniform scale
 # preserves the generated silhouette, translating its source skull centre.
 for vertex in obj.data.vertices:
  p=vertex.co;vertex.co=Vector((-p.x*.52,-p.y*.52,(p.z-.075)*.52))
 obj.name=f'Hair_{style}_LOD{lod}';obj.data.materials.clear();mat=bpy.data.materials.new('ProfileHair');mat.diffuse_color=(.22,.11,.07,1);obj.data.materials.append(mat)
 obj.data.update();bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
 out=dest/f'Hair_{style}_LOD{lod}.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=False,export_extras=True)
 record={'style':style,'lod':lod,'source':str(path),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'fit':{'sourceSkullCentre':[0,0,.075],'scale':.52,'rotateBlenderZ':180,'headReferenceSize':[.1992,.2397,.2189]},'removedSmallComponentVertices':len(drop),'sourceProvenance':json.loads((source.parent/'hair-candidate.provenance.json').read_text(encoding='utf-8-sig'))}
 out.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n')
