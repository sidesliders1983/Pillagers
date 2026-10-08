"""Author four cattle clips on variant-specific original Meshy rigs in Blender 5.2.
Mappings and physical sizes live in cattle-rigs.json; no skeleton is replaced.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector

RIGS = json.loads(Path(__file__).with_name('cattle-rigs.json').read_text(encoding='utf-8-sig'))
FPS, PERIOD, WALK_SPEED = 30, 1.5, 0.50
CLIPS = {'Idle':6.0, 'Graze':12.0, 'Walk':PERIOD, 'HumanInteraction':6.0}
def smooth(x):
    x = max(0, min(1, x))
    return x*x*(3-2*x)
def wave(t, period, phase=0):
    return math.sin(2*math.pi*t/period+phase)

def author(source, output, variant=None):
    if variant is None:
        variant = next((key for key,c in RIGS.items() if Path(c['source']).name.casefold()==source.name.casefold()), None)
    if variant not in RIGS:
        raise ValueError('Unknown cattle source; select a configured variant')
    c=RIGS[variant]; stem=c['stem']; legs=c['legs']; walk_speed=c.get('walkSpeed',WALK_SPEED)
    root,spine,shoulder,head_name=c['root'],c['spine'],c['shoulder'],c['head']
    neck=[name for name,_ in c['neck']]; tail=c['tail']; ears=c['ears']
    output.mkdir(parents=True,exist_ok=True)
    scene=bpy.data.scenes.new('Pillagers Cattle '+variant);bpy.context.window.scene=scene
    bpy.ops.import_scene.gltf(filepath=str(source))
    arm=next(o for o in scene.objects if o.type=='ARMATURE')
    meshes=[o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' and m.object==arm for m in o.modifiers)]
    if len(meshes)!=1 or len(arm.data.bones)!=c['bones'] or sum(len(p.vertices)-2 for mesh in meshes for p in mesh.data.polygons)!=c['triangles']:
        raise ValueError('Requires the unchanged original '+c['label']+' geometry and rig')
    required={root,spine,shoulder,head_name,*neck,*tail,*ears,*[b for leg in legs.values() for b in leg[:2]]}
    if required-set(arm.data.bones.keys()):
        raise ValueError('Configured bone mapping does not match the source')
    for o in scene.objects:
        if o.type=='MESH' and o not in meshes:o.hide_render=True;o.hide_set(True)
    mesh=meshes[0]; vertices=[mesh.matrix_world@v.co for v in mesh.data.vertices]
    lo,hi=c['shoulderBand']
    source_withers=max(v.z for v in vertices if abs(v.x)<.12 and lo<v.y<hi)-min(v.z for v in vertices)
    physical_scale=c['withers']/source_withers
    source_height=max(v.z for v in vertices)-min(v.z for v in vertices)
    scene.render.fps=FPS;scene.frame_start=1
    rest={b.name:b.matrix_local.copy() for b in arm.data.bones}
    muzzle_ids=[i for i,v in enumerate(vertices) if v.y<c['muzzleY'] and abs(v.x)<.12]
    lo,hi,height=c['pollBand']
    poll_ids=[i for i,v in enumerate(vertices) if lo<v.y<hi and v.z>height and abs(v.x)<.12]
    if not muzzle_ids or not poll_ids:raise ValueError('Cannot identify head landmarks')
    def surface_axis(points):
        return (sum((points[i] for i in muzzle_ids),Vector())/len(muzzle_ids)-sum((points[i] for i in poll_ids),Vector())/len(poll_ids)).normalized()
    axis=surface_axis(vertices);neutral_pitch=math.atan2(-axis.z,-axis.y)
    head_axis_local=rest[head_name].to_3x3().inverted()@(arm.matrix_world.to_3x3().inverted()@axis)
    constraints,feet=[],{}
    for name,(end,hoof,count,phase,duty) in legs.items():
        target=bpy.data.objects.new('HoofTarget_'+name,None);scene.collection.objects.link(target)
        target.empty_display_size=.06;target.location=arm.data.bones[end].tail_local
        target.rotation_mode='QUATERNION';target.rotation_quaternion=rest[hoof].to_quaternion()
        ik=arm.pose.bones[end].constraints.new('IK');ik.name='Plant hoof '+name;ik.target=target;ik.chain_count=count;ik.iterations=128;ik.use_tail=True
        rotate=arm.pose.bones[hoof].constraints.new('COPY_ROTATION');rotate.name='Level hoof '+name;rotate.target=target;rotate.owner_space=rotate.target_space='WORLD'
        constraints.extend([ik,rotate]);feet[name]=(target,target.location.copy(),phase,duty)
    arm.animation_data_create()
    def rotate(name,axis,angle):
        pb=arm.pose.bones[name];r=rest[name].to_quaternion()
        pb.rotation_quaternion=pb.rotation_quaternion@(r.inverted()@Quaternion(Vector(axis),angle)@r)
    def pose(clip,t):
        for pb in arm.pose.bones:pb.rotation_mode='QUATERNION';pb.matrix_basis=Matrix.Identity(4)
        for target,initial,_,_ in feet.values():target.location=initial
        breath=.0025*(1-math.cos(2*math.pi*t/6))
        arm.pose.bones[root].location=rest[root].to_quaternion().inverted()@Vector((0,0,breath))
        rotate(neck[0],(1,0,0),.010*wave(t,6));rotate(head_name,(0,0,1),.012*wave(t,6))
        for name,amplitude in zip(tail,[.12,.06]):rotate(name,(0,1,0),amplitude*wave(t,6))
        ear=math.sin(math.pi*t/6)**10
        for name,amplitude in zip(ears,[.065,-.045]):rotate(name,(0,1,0),amplitude*ear)
        if clip=='Walk':
            bob=.006*(1-math.cos(4*math.pi*t/PERIOD))
            arm.pose.bones[root].location=rest[root].to_quaternion().inverted()@Vector((0,0,bob-c.get('walkBodyLowering',0)))
            rotate(root,(0,1,0),.006*wave(t,PERIOD))
            arm.pose.bones[neck[0]].rotation_quaternion=Quaternion();rotate(neck[0],(1,0,0),.014*wave(t,PERIOD))
            for name in [*tail,head_name,*ears]:arm.pose.bones[name].rotation_quaternion=Quaternion()
            if tail:rotate(tail[0],(0,1,0),.04*wave(t,PERIOD))
            rotate(head_name,(0,0,1),.008*wave(t,PERIOD))
            for target,initial,offset,duty in feet.values():
                phase=(t/PERIOD-offset)%1;distance=walk_speed*PERIOD*duty;target.location=initial
                if phase<=duty:target.location.y+=-distance/2+walk_speed*PERIOD*phase
                else:
                    u=(phase-duty)/(1-duty);target.location.y+=distance/2-distance*smooth(u);target.location.z+=.085*math.sin(math.pi*u)**1.2
        elif clip=='Graze':
            down=smooth(t/2.4)*(1-smooth((t-9.6)/2.4))
            rotate(root,(1,0,0),.025*down);rotate(spine,(1,0,0),.05*down);rotate(shoulder,(1,0,0),.08*down)
            rotate(root,(0,0,1),math.radians(1)*down*wave(t,6));rotate(shoulder,(0,0,1),math.radians(1.25)*down*wave(t,4))
            for name,angle in c['neck']:rotate(name,(1,0,0),(angle+(.015*wave(t,2) if name==neck[-1] else 0))*down)
            rotate(neck[0],(0,0,1),math.radians(1.5)*down*wave(t,6,.6))
            desired=neutral_pitch*(1-down)+math.radians(75)*down
            # Preserve the approved female mapping; other meshes have different
            # head weights, so correct against their evaluated surface landmarks.
            for _ in range(2 if variant=='adult-female' else 3):
                bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
                if variant=='adult-female':
                    evaluated=arm.evaluated_get(graph);direction=arm.matrix_world.to_3x3()@(evaluated.pose.bones[head_name].matrix.to_3x3()@head_axis_local)
                else:
                    evaluated=mesh.evaluated_get(graph);points=[evaluated.matrix_world@v.co for v in evaluated.data.vertices];direction=surface_axis(points)
                pitch=math.atan2(-direction.z,-direction.y);rotate(head_name,(1,0,0),desired-pitch)
            bpy.context.view_layer.update();evaluated=arm.evaluated_get(bpy.context.evaluated_depsgraph_get());head=arm.pose.bones[head_name]
            axis_local=evaluated.pose.bones[head_name].matrix.to_3x3().inverted()@(arm.matrix_world.to_3x3().inverted()@Vector((0,0,1)))
            head.rotation_quaternion=head.rotation_quaternion@Quaternion(axis_local.normalized(),math.radians(3)*down*wave(t,3,.8))
        elif clip=='HumanInteraction':
            attention=math.sin(math.pi*t/6)**2;rotate(neck[0],(1,0,0),-.16*attention)
            rotate(head_name,(1,0,0),attention*(-.10+.22*wave(t,2)));rotate(neck[-1],(0,0,1),.045*attention*wave(t,6))
            for name,angle in zip(ears,[-.06,.06]):rotate(name,(0,1,0),angle*attention)
    actions,contacts={},{}
    for clip,duration in CLIPS.items():
        arm.animation_data.action=None
        for cst in constraints:cst.mute=False
        samples,errors=[],[]
        for frame in range(1,round(duration*FPS)+2):
            t=(frame-1)/FPS;scene.frame_set(frame);pose(clip,t);bpy.context.view_layer.update()
            evaluated=arm.evaluated_get(bpy.context.evaluated_depsgraph_get());samples.append({b.name:b.matrix.copy() for b in evaluated.pose.bones})
            for name,(end,_,_,offset,duty) in legs.items():
                if clip!='Walk' or (t/PERIOD-offset)%1<=duty:errors.append((evaluated.pose.bones[end].tail-feet[name][0].location).length)
        for cst in constraints:cst.mute=True
        action=bpy.data.actions.new(clip);action.use_fake_user=True;arm.animation_data.action=action;previous={}
        for frame,matrices in enumerate(samples,1):
            scene.frame_set(frame)
            for pb in arm.pose.bones:
                bone=arm.data.bones[pb.name];args={} if not bone.parent else {'parent_matrix':matrices[bone.parent.name],'parent_matrix_local':rest[bone.parent.name]}
                pb.matrix_basis=bone.convert_local_to_pose(matrices[pb.name],rest[pb.name],invert=True,**args)
                if pb.name in previous and previous[pb.name].dot(pb.rotation_quaternion)<0:pb.rotation_quaternion.negate()
                previous[pb.name]=pb.rotation_quaternion.copy()
                for path in ['location','rotation_quaternion','scale']:pb.keyframe_insert(data_path=path,frame=frame,group=pb.name)
        actions[clip]=action;contacts[clip]={'maxPlantedTargetErrorM':max(errors)*physical_scale,'duration':duration}
        print('AUTHORED',variant,clip,len(samples),contacts[clip],flush=True)
    physical_root=bpy.data.objects.new('CowPhysicalScale',None);scene.collection.objects.link(physical_root)
    for obj in [arm,*meshes,*(target for target,_,_,_ in feet.values())]:
        if obj.parent is None:obj.parent=physical_root
    physical_root.scale=(physical_scale,)*3;physical_root['withersHeightM']=c['withers'];physical_root['sourceWithersHeightM']=source_withers
    arm.animation_data.action=actions['Idle'];scene.frame_end=181;scene.frame_set(1);bpy.context.view_layer.update()
    for obj in bpy.context.selected_objects:obj.select_set(False)
    for obj in [physical_root,arm,*meshes]:obj.select_set(True)
    bpy.context.view_layer.objects.active=arm
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active;space.region_3d.view_location=(0,0,c['withers']*.6);space.region_3d.view_distance=3.6*c['withers']/1.1
                space.region_3d.view_rotation=Quaternion((.5,.5,.5,.5));space.overlay.show_overlays=False
                if any(item.identifier=='MATERIAL' for item in space.shading.bl_rna.properties['type'].enum_items):space.shading.type='MATERIAL'
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output/(stem+'-animations.blend')))
    for pb in arm.pose.bones:
        for constraint in list(pb.constraints):pb.constraints.remove(constraint)
    bpy.ops.export_scene.gltf(filepath=str(output/(stem+'-animated.glb')),use_selection=True,use_active_scene=True,export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_anim_slide_to_zero=True,export_current_frame=False,export_skins=True)
    metadata={'schemaVersion':1,'source':str(source),'sourceRelative':'Assets/Characters/Cow/'+c['source'],'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blenderVersion':bpy.app.version_string,'fps':FPS,'clips':contacts,'walkSpeedMps':walk_speed*physical_scale,'walkCycleSeconds':PERIOD,'withersHeightM':c['withers'],'sourceWithersHeightM':source_withers,'physicalScale':physical_scale,'height':source_height*physical_scale,'variant':variant,'label':c['label'],'fileStem':stem,'boneCount':c['bones'],'triangles':c['triangles'],'grazing':{'headTiltDegrees':75,'headTiltReference':'horizontal ground','verticalDeviationDegrees':15,'neckPose':'distributed forward-and-down curve','yawDegrees':{'body':1,'shoulders':1.25,'neck':1.5,'head':3}},'referenceMethod':'Authored keys with cattle gait literature and user grazing reference; not video motion capture','proposedVideo':'https://youtu.be/sObyVL3oU6g','references':['https://pmc.ncbi.nlm.nih.gov/articles/PMC6012707/','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0253479']}
    (output/'authoring.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
    return scene,arm,meshes,actions
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--variant',choices=RIGS)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);author(a.source.resolve(),a.output.resolve(),a.variant)
