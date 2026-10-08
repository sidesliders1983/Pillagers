"""Remove sub-millimetre terminal texture-extraction needles before closure.

Only existing boundary faces with two exposed edges are considered. No vertex
is moved, no new geometry is added, and broad intentional rims are preserved.
"""
import bpy,bmesh,argparse,sys,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--maximum-altitude',type=float,default=.002);p.add_argument('--minimum-length',type=float,default=.004);p.add_argument('--maximum-altitude-ratio',type=float,default=.25);p.add_argument('--passes',type=int,default=12);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);assert not a.output.exists();a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()));o=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);original_faces=len(bm.faces);counts=[]
for _ in range(a.passes):
 remove=[]
 for f in bm.faces:
  if sum(e.is_boundary for e in f.edges)<2:continue
  length=max(e.calc_length() for e in f.edges);altitude=2*f.calc_area()/max(length,1e-12)
  if length>a.minimum_length and altitude<a.maximum_altitude and altitude/length<a.maximum_altitude_ratio:remove.append(f)
 if not remove:break
 counts.append(len(remove));bmesh.ops.delete(bm,geom=remove,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.verts.index_update();data=bpy.data.meshes.new('Clean authored boundary facets');data.from_pydata([tuple(v.co) for v in bm.verts],[],[[v.index for v in f.verts] for f in bm.faces]);data.update();data.validate();bm.free();o.data=data
m=bpy.data.materials.new('Profile reference grooming');m.diffuse_color=(.28,.15,.09,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.28,.15,.09,1);m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=1;data.materials.append(m)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
parent=json.loads(a.source.with_suffix('.provenance.json').read_text(encoding='utf-8-sig'));stats={'sourceTriangles':original_faces,'outputTriangles':len(data.polygons),'removedBoundaryNeedleFaces':sum(counts),'removedFacesPerPass':counts,'maximumTerminalAltitudeMetres':a.maximum_altitude,'minimumTerminalLengthMetres':a.minimum_length,'maximumAltitudeRatio':a.maximum_altitude_ratio,'boundaryEdgesRequired':2,'existingVerticesUnchanged':True,'facetedNormals':True,'profileMaterialCount':1};record={'reviewRequired':True,'style':parent['style'],'lod':2,'source':str(a.source.resolve()),'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'sourceProvenance':parent,'geometryOptimization':stats,'fit':parent['fit']};a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(stats),flush=True)
