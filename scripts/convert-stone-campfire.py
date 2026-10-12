import bpy
import pathlib
import shutil
import sys

# Run in isolated background Blender, without touching an open scene.
source = pathlib.Path(sys.argv[sys.argv.index('--') + 1])
output = pathlib.Path('Assets/StoneCampFire')
output.mkdir(parents=True, exist_ok=True)
fbx = next(source.glob('*.fbx'))
local_fbx = output / fbx.name
shutil.copyfile(fbx, local_fbx)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.import_scene.fbx(filepath=str(local_fbx.resolve()))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
for material in {mat for obj in meshes for mat in obj.data.materials}:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    output_node = nodes.new('ShaderNodeOutputMaterial')
    links = material.node_tree.links
    links.new(shader.outputs['BSDF'], output_node.inputs['Surface'])
    for suffix, socket in [('texture', 'Base Color'), ('texture_roughness', 'Roughness'),
                           ('texture_metallic', 'Metallic'), ('texture_normal', 'Normal')]:
        path = next(source.glob('*_' + suffix + '.png'))
        node = nodes.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(str(path))
        if suffix != 'texture':
            node.image.colorspace_settings.name = 'Non-Color'
        if socket == 'Normal':
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(node.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs[socket])
        else:
            links.new(node.outputs['Color'], shader.inputs[socket])
    material.diffuse_color = (.35, .28, .20, 1)
bpy.ops.export_scene.gltf(filepath=str((output / 'campfire-source.glb').resolve()), export_format='GLB')
print('EXPORTED_CAMPFIRE', len(meshes))
