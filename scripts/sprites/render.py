"""blender --background --python scripts/sprites/render.py -- --asset-root PATH --output public/sprites"""
import bpy,json,math,sys,argparse,hashlib
from pathlib import Path
from mathutils import Vector
parser=argparse.ArgumentParser();parser.add_argument('--asset-root',required=True);parser.add_argument('--output',default='public/sprites')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(args.asset_root);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
contract=json.loads(Path(__file__).with_name('contract.json').read_text(encoding='utf-8-sig'));manifest={'contract':contract,'sprites':[],'blender':bpy.app.version_string}
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);return m
def cube(name,location,scale,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat);return o
for spec in contract['sprites']:
 if spec.get('placeholder'):continue # ImageGen proxies are packed separately from retained source PNGs.
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 source=spec.get('source');h=spec['height'];mat=material('warm timber',(0.39,0.24,0.13))
 if source:
  path=root/source
  if not path.is_file():raise FileNotFoundError(path)
  bpy.ops.import_scene.gltf(filepath=str(path));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
  bpy.context.view_layer.update();points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
  lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)));factor=h/(hi.z-lo.z)
  # Root-parent transform preserves mesh, rig and material alignment.
  empty=bpy.data.objects.new('sprite ground origin',None);bpy.context.collection.objects.link(empty)
  for o in list(bpy.context.scene.objects):
   if o!=empty and o.parent is None:o.parent=empty
  empty.scale=(factor,)*3;empty.location=(-(lo.x+hi.x)*factor/2,-(lo.y+hi.y)*factor/2,-lo.z*factor)
  if spec.get('material')=='cattle':
   m=material('authored cattle ochre',(0.46,0.29,0.13))
   for o in meshes:o.data.materials.clear();o.data.materials.append(m)
  if spec.get('upgrade'):
   u=spec['upgrade'];stone=material('upgrade stone',(0.45,0.48,0.44));cube('visible upgrade foundation',(0,0,0.08),(4.5,4.2,0.16),stone)
   for n in range(u):cube('upgrade timber marker',(1.8-n*.3,-1.7,.65),(.16,.18,1.3),mat)
 elif spec['id']=='tent':
  canvas=material('canvas',(0.71,0.64,0.45));verts=[(-1.6,-1.5,0),(1.6,-1.5,0),(0,-1.5,h),(-1.6,1.5,0),(1.6,1.5,0),(0,1.5,h)];faces=[(0,1,2),(3,5,4),(0,2,5,3),(1,4,5,2)]
  mesh=bpy.data.meshes.new('tent');mesh.from_pydata(verts,[],faces);o=bpy.data.objects.new('tent placeholder',mesh);bpy.context.collection.objects.link(o);mesh.materials.append(canvas)
 else:
  # Explicit neutral dressed mannequin placeholders: no CharacterDNA appearance claim.
  body=material('generic tunic',(0.24,0.37,0.4) if spec['id']=='male' else (0.46,0.27,0.24));skin=material('neutral mannequin',(0.69,0.53,0.37))
  cube('torso',(0,0,h*.56),(h*.26,h*.16,h*.34),body)
  for x in [-1,1]:cube('leg',(x*h*.075,0,h*.2),(h*.09,h*.1,h*.4),mat);cube('arm',(x*h*.18,0,h*.55),(h*.075,h*.1,h*.32),body)
  bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=h*.11,location=(0,0,h*.86));bpy.context.object.data.materials.append(skin)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.seed=0;scene.render.film_transparent=True
 scene.render.resolution_x=spec['size'];scene.render.resolution_y=spec['size'];scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='Standard'
 camera=bpy.data.cameras.new('fixed isometric camera');obj=bpy.data.objects.new('fixed isometric camera',camera);bpy.context.collection.objects.link(obj);obj.location=(10,-10,10);obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler();camera.type='ORTHO';camera.ortho_scale=spec['size']/contract['pixelsPerMeter'];scene.camera=obj
 scene.world.color=(0.45,0.45,0.45)
 light=bpy.data.lights.new('fixed key','AREA');light.energy=850;light.size=8;lamp=bpy.data.objects.new('fixed key',light);bpy.context.collection.objects.link(lamp);lamp.location=(-3,-4,9);lamp.rotation_euler=(-lamp.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(out/(spec['id']+'.png'));bpy.ops.render.render(write_still=True)
 manifest['sprites'].append({**spec,'groundAnchor':[.5,.5],'sourceSha256':hashlib.sha256((root/source).read_bytes()).hexdigest() if source else None,'outputSha256':hashlib.sha256((out/(spec['id']+'.png')).read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
