"""Rig the image-generated, statically optimized LODs. Run in a separate background Blender.

blender -b --factory-startup --python tools/blender/build_universal_human.py -- --input scratch/universal-human/lods --output public/universal-human
No downloads. Source topology/materials are preserved within each LOD. All axes share that topology.
"""
import argparse
import hashlib
import json
import math
import sys
import struct
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

MORPHS = ['Masculine','Feminine','Breasts','Powerful','Slight','Agile','Grounded','Tall','Short','Overweight','Underweight','Age','HeadWidth','HeadLength','Jaw','Nose','LegRatio','ShoulderSlope','Asymmetry','BellyJiggle','BreastJiggle']

def rotation_only_clips(path):
    """Blender bakes constant bind translations too. Keep only rotation tracks so morphology can adapt joints."""
    data=path.read_bytes();length,kind=struct.unpack_from('<II',data,12)
    document=json.loads(data[20:20+length]);binary=data[20+length:]
    for animation in document.get('animations',[]):
        animation['channels']=[channel for channel in animation['channels'] if channel['target']['path']=='rotation']
        assert animation['channels'],animation['name']
    encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+binary)

def band(z, center, width):
    return math.exp(-((z-center)/width)**2)

def smooth(low,high,value):
    t=max(0,min(1,(value-low)/(high-low)))
    return t*t*(3-2*t)

def breast_volume(x,z):
    # Two broad ellipsoid caps. max preserves the sternum valley instead of
    # adding both lobes into a central peak where they overlap.
    return max(max(0,1-((x-center)/.105)**2-((z-1.335)/.12)**2)**.65 for center in (-.085,.085))*(1-smooth(.15,.19,abs(x)))

def body_morph(point, key):
    x,y,z = point
    side = 1 if x>=0 else -1
    head = band(z,1.67,.14)
    shoulder = band(z,1.39,.13)
    chest = band(z,1.27,.16)
    waist = band(z,1.03,.16)
    hips = band(z,.89,.14)
    # Wide transition keeps adjacent vertices moving together, including elbows
    # near the torso; narrow region thresholds made extreme builds develop fins.
    armness=smooth(.15,.40,abs(x))
    legness=1-smooth(.77,.94,z)
    limbs=max(armness,legness)
    cx=side*(armness*max(0,.235+(1.4-z)*.32)+(1-armness)*legness*(.21-.08*smooth(.10,.90,z))*smooth(0,.10,abs(x)))
    if key in ('Masculine','Feminine'):
        sign=1 if key=='Masculine' else -1
        breadth=(.30*shoulder+.16*chest-.24*hips+.055*head+.12*waist) if sign>0 else (.18*shoulder+.06*chest-.16*hips+.055*head+.04*waist)
        depth=(.24*shoulder+.16*chest-.10*hips+.035*head) if sign>0 else (.14*shoulder+.06*chest-.08*hips+.035*head)
        x *= 1+sign*breadth
        y *= 1+sign*depth
        if key=='Masculine':
            x+=(x-cx)*.28*limbs
            y*=1+.28*limbs
    elif key=='Breasts':
        # Use undeformed torso coordinates, before feminine shoulder narrowing.
        # Soft volume must never adapt the skeleton or leak into the upper arm.
        volume=breast_volume(x,z)*smooth(.005,.06,-y)
        x+=side*.03*volume*smooth(0,.05,abs(x))
        z+=(z-1.335)*.25*volume
        y-=.20*volume
    elif key in ('Powerful','Slight'):
        sign=1 if key=='Powerful' else -1
        # Expand limb girth about its centre line, not distance from the body centre.
        girth=.65 if sign>0 else .22
        x += sign*((x-cx)*(girth+.08*limbs)+side*.045*shoulder*smooth(0,.12,abs(x)))
        y *= 1+sign*(.65 if sign>0 else .26)
    elif key in ('Agile','Grounded'):
        sign=1 if key=='Agile' else -1
        arm=smooth(.19,.30,abs(x))*smooth(.65,.85,z)*(1-smooth(1.45,1.58,z))
        leg=(1-smooth(.78,.90,z))*smooth(.05,.11,abs(x))
        region=max(arm,leg)
        arm_centre=side*max(.235,.235+(1.4-z)*.32)
        leg_centre=side*(.21-.08*smooth(.105,.90,z))
        centre=arm_centre if arm>leg else leg_centre
        # Agility thins girth around the limb centre, not the torso width.
        x-=sign*(x-centre)*.32*region
        y*=1-sign*.32*region
        z+=sign*.025*math.sin(math.pi*max(0,min(1,z/1.8)))
    elif key=='Overweight':
        # Strong caricature belly, with continuous transitions to hips/chest.
        # Soft volume is independent of shoulder breadth and muscular build.
        torso=1-smooth(.19,.36,abs(x))
        belly=band(z,1.035,.26)*torso
        front=smooth(-.015,.08,-y)
        # A broad, rounded ellipsoid cap instead of a narrow Gaussian peak.
        vertical=max(0,1-((z-1.04)/.32)**2)**.65
        horizontal=max(0,1-(x/.32)**2)**.65
        volume=vertical*horizontal*front
        x*=1+.65*belly+.08*head
        y*=1+.18*belly+.12*head
        y-=.42*volume
        z-=.18*volume
    elif key=='BellyJiggle':
        soft=band(z,1.035,.25)*(1-smooth(.19,.36,abs(x)))*smooth(-.015,.08,-y)
        z+=.055*soft;y-=.018*soft
    elif key=='BreastJiggle':
        soft=breast_volume(x,z)*smooth(.005,.06,-y)
        z+=.035*soft;y-=.012*soft
    elif key=='Underweight':
        # Reduce soft volume around limb centres, preserving length and joints.
        torso=1-smooth(.19,.36,abs(x))
        thinning=.10*band(z,1.10,.29)*torso+.18*limbs+.04*head
        x-=(x-cx)*thinning
        y*=1-thinning
    elif key=='Tall':
        z=z*1.1666666667+.025*math.sin(math.pi*z/1.8);x*=1.035;y*=1.035
    elif key=='Short':
        z=z*.8055555556-.025*math.sin(math.pi*z/1.8);x*=.96;y*=.96
    elif key=='Age':
        slump=smooth(.85,1.8,z)
        y-=.28*slump**1.4
        z-=.18*slump+.06*shoulder
        x*=1+.025*waist
    elif key=='HeadWidth':x*=1+.10*head
    elif key=='HeadLength':z+=.045*head*(z-1.6)/.15
    elif key=='Jaw':x*=1+.13*band(z,1.59,.055)
    elif key=='Nose':y-=.028*band(z,1.67,.04)*band(x,0,.045)*max(0,min(1,-y/.08))
    elif key=='LegRatio':z+=.08*math.sin(math.pi*max(0,min(1,z/1.8)))
    elif key=='ShoulderSlope':z-=.04*shoulder*min(1,abs(x)/.25)
    elif key=='Asymmetry':x+=.016*math.sin(z*4);z+=.008*max(-1,min(1,x/.15))*shoulder
    return Vector((x,y,z))

def rigid_region(point):
    x,y,z=point;side=1 if x>=0 else -1
    if z>1.25 and abs(x)<.40:
        return Vector((0,0,1.56)),smooth(1.25,1.50,z)*(1-smooth(.18,.40,abs(x))),'Head'
    if z<.28 and abs(x)>.08:
        return Vector((side*.21,0,.105)),1-smooth(.17,.28,z),'Foot_'+('L' if side>0 else 'R')
    hand=(1-smooth(.93,1.05,z))*smooth(.28,.36,abs(x))*smooth(.62,.72,z)
    return Vector((side*.39,0,.91)),hand,'Hand_'+('L' if side>0 else 'R')

def morph(point,key):
    # Head, hands and feet are rigid units. Only joint-centre translation follows
    # body proportions; volume, seed detail and soft motion never reshape it.
    anchor,amount,_=rigid_region(point)
    original=Vector(point)
    rigid=original+body_morph(anchor,key)-anchor
    return body_morph(point,key).lerp(rigid,amount)

def rig():
    bpy.ops.object.armature_add()
    obj=bpy.context.object;obj.name='PillagersHumanRig'
    bpy.ops.object.mode_set(mode='EDIT');obj.data.edit_bones.remove(obj.data.edit_bones[0])
    definitions=[
        ('Root',None,(0,0,0),(0,0,.15),False),
        ('Hips','Root',(0,0,.9),(0,0,1.02),True),
        ('Spine_01','Hips',(0,0,1.02),(0,0,1.15),True),
        ('Spine_02','Spine_01',(0,0,1.15),(0,0,1.29),True),
        ('Chest','Spine_02',(0,0,1.29),(0,0,1.43),True),
        ('Neck','Chest',(0,0,1.43),(0,0,1.56),True),
        ('Head','Neck',(0,0,1.56),(0,0,1.8),True),
    ]
    for side,s in [('L',1),('R',-1)]:
        def p(x,y,z):return (s*x,y,z)
        definitions += [
            ('Clavicle_'+side,'Chest',p(.025,0,1.40),p(.235,0,1.40),True),
            ('UpperArm_'+side,'Clavicle_'+side,p(.235,0,1.40),p(.33,0,1.10),True),
            ('LowerArm_'+side,'UpperArm_'+side,p(.33,0,1.10),p(.39,0,.91),True),
            ('Hand_'+side,'LowerArm_'+side,p(.39,0,.91),p(.425,0,.78),True),
            ('UpperLeg_'+side,'Hips',p(.13,0,.90),p(.18,0,.49),True),
            ('LowerLeg_'+side,'UpperLeg_'+side,p(.18,0,.49),p(.21,0,.105),True),
            ('Foot_'+side,'LowerLeg_'+side,p(.21,0,.105),p(.21,-.13,.05),True),
            ('Toe_'+side,'Foot_'+side,p(.21,-.13,.05),p(.21,-.22,.04),True),
            ('UpperArmTwist_'+side,'UpperArm_'+side,p(.2825,0,1.25),p(.30,0,1.20),True),
            ('UpperLegTwist_'+side,'UpperLeg_'+side,p(.155,0,.695),p(.16,0,.64),True),
        ]
    sockets=[('weapon_R','Hand_R',(-.42,-.035,.85)),('weapon_L','Hand_L',(.42,-.035,.85)),('shield','LowerArm_L',(.36,.045,1.02)),('back','Chest',(0,.13,1.33)),('hip','Hips',(.19,0,.91)),('head','Head',(0,0,1.8))]
    definitions += [(name,parent,pos,(pos[0],pos[1],pos[2]+.035),False) for name,parent,pos in sockets]
    for name,parent,head,tail,deform in definitions:
        bone=obj.data.edit_bones.new(name);bone.head=head;bone.tail=tail;bone.use_deform=deform
        if parent:bone.parent=obj.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    # Store local translation deltas in glTF coordinates. Runtime adapts bind skeleton along with mesh morphs.
    for bone in obj.data.bones:
        values={}
        for key in MORPHS:
            if key in ('Overweight','Underweight','Breasts','BellyJiggle','BreastJiggle'):
                values[key]=[0,0,0]
                continue
            d=morph(bone.head_local,key)-bone.head_local
            if bone.parent:d-=morph(bone.parent.head_local,key)-bone.parent.head_local
            rotation=bone.parent.matrix_local.to_3x3().inverted() if bone.parent else None
            if rotation:d=rotation@d
            values[key]=[d.x,d.z,-d.y]
        bone['morphTranslations']=json.dumps(values)
    obj['rigContract']='PillagersHumanRig-v0.1'
    return obj

def distance(point,a,b):
    segment=b-a;t=max(0,min(1,(point-a).dot(segment)/segment.length_squared))
    return (point-(a+segment*t)).length

def weights(body,armature):
    bones=[b for b in armature.data.bones if b.use_deform and 'Twist' not in b.name]
    groups={b.name:body.vertex_groups.new(name=b.name) for b in bones}
    for vertex in body.data.vertices:
        p=vertex.co;x,y,z=p;side='L' if x>=0 else 'R'
        _,rigid_amount,rigid_bone=rigid_region(p)
        if rigid_amount>=.999999:
            groups[rigid_bone].add([vertex.index],1,'REPLACE')
            continue
        # Continuous spatial weights across arm/torso and hip boundaries.
        # Hard region cutoffs left inner-arm vertices following the static
        # spine while adjacent arm vertices followed the walking motion.
        names=[b.name for b in bones]
        candidates=sorted([(distance(p,b.head_local,b.tail_local),b) for b in bones if b.name in names],key=lambda item:item[0])[:4]
        nearest=candidates[0][0]
        blend=[(math.exp(-((d-nearest)/.065)**2),b) for d,b in candidates]
        total=sum(w for w,b in blend)
        for w,b in blend:
            if w/total>.0001:groups[b.name].add([vertex.index],w/total,'REPLACE')
        actual=sum(g.weight for g in vertex.groups)
        for group in vertex.groups:body.vertex_groups[group.group].add([vertex.index],group.weight/actual,'REPLACE')
    modifier=body.modifiers.new('PillagersHumanRig','ARMATURE');modifier.object=armature;body.parent=armature

def animations(armature):
    armature.animation_data_create()
    bpy.context.scene.render.fps=30
    for name,duration,amplitude in [('Idle',90,.025),('Walk',36,.38),('Run',24,.65)]:
        action=bpy.data.actions.new(name);armature.animation_data.action=action
        for frame in range(0,duration+1,3):
            phase=2*math.pi*frame/duration
            for bone in armature.pose.bones:
                bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0)
                side=1 if bone.name.endswith('_L') else -1
                if name=='Idle':
                    if bone.name in ('Chest','Spine_02'):bone.rotation_euler.x=math.sin(phase)*amplitude
                else:
                    if bone.name.startswith('UpperLeg_'):bone.rotation_euler.x=side*math.sin(phase)*amplitude
                    elif bone.name.startswith('LowerLeg_'):bone.rotation_euler.x=max(0,-side*math.sin(phase))*amplitude*1.4
                    elif bone.name.startswith('UpperArm_'):bone.rotation_euler.x=-side*math.sin(phase)*amplitude*.75
                    elif bone.name.startswith('LowerArm_'):bone.rotation_euler.x=-.12-(.35 if name=='Run' else .05)
                    elif bone.name=='Chest':bone.rotation_euler.z=math.sin(phase)*amplitude*.08
                bone.keyframe_insert(data_path='rotation_euler',frame=frame,group=bone.name)
        track=armature.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(name,0,action)
        strip.action_frame_start=0;strip.action_frame_end=duration
    armature.animation_data.action=None
    for track in armature.animation_data.nla_tracks:track.mute=True
    for bone in armature.pose.bones:bone.rotation_euler=(0,0,0)
    bpy.context.scene.frame_set(0)

def validate(body,armature):
    assert len([b for b in armature.data.bones if b.use_deform])==26
    assert all(name in armature.data.bones for name in ['weapon_R','weapon_L','shield','back','hip','head'])
    assert [k.name for k in body.data.shape_keys.key_blocks][1:]==MORPHS
    assert all(0<len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<.001 for v in body.data.vertices)
    assert all(bpy.data.actions.get(name) for name in ['Idle','Walk','Run'])

def pad_texture_atlas():
    # Black unused atlas pixels bleed through mipmaps at UV island borders.
    # Extend neighbouring surface colours without changing UVs or anatomy.
    for image in bpy.data.images:
        width,height=image.size
        if width<128 or height<128:continue
        pixels=list(image.pixels[:]);channels=image.channels
        valid=[max(pixels[i*channels:i*channels+3])>.08 for i in range(width*height)]
        for _ in range(max(4,width//128)):
            updates=[]
            for i,filled in enumerate(valid):
                if filled:continue
                x,y=i%width,i//width
                neighbours=[j for j in (i-1 if x else -1,i+1 if x<width-1 else -1,i-width if y else -1,i+width if y<height-1 else -1) if j>=0 and valid[j]]
                if neighbours:updates.append((i,[sum(pixels[j*channels+c] for j in neighbours)/len(neighbours) for c in range(channels)]))
            for i,colour in updates:
                pixels[i*channels:(i+1)*channels]=colour;valid[i]=True
        image.pixels[:]=pixels;image.update();image.pack()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);args.output.mkdir(parents=True,exist_ok=True)
    report={'schemaVersion':1,'rig':'PillagersHumanRig','deformBones':26,'sockets':['weapon_R','weapon_L','shield','back','hip','head'],'morphs':MORPHS,'clips':['Idle','Walk','Run'],'lods':[]}
    for lod in range(3):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        source=args.input/f'UniversalHuman_LOD{lod}.glb';assert source.is_file(),source
        bpy.ops.import_scene.gltf(filepath=str(source))
        pad_texture_atlas()
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert meshes
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();body=bpy.context.object
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        positions=[v.co.copy() for v in body.data.vertices];low=Vector(tuple(min(p[i] for p in positions) for i in range(3)));high=Vector(tuple(max(p[i] for p in positions) for i in range(3)))
        # Pixal's exported Y-up import is Z-up in Blender. Ground and centre the mesh once.
        height=high.z-low.z;assert height>0
        center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
        for v in body.data.vertices:v.co=(v.co-center)*(1.8/height)
        # Pixal source faces +Y in Blender (-Z in glTF). Our rig, toes,
        # belly/breast morphs and forward slouch use -Y (+Z in glTF).
        # Rotate the source surface BEFORE generating shape keys and weights.
        body.rotation_mode='XYZ'
        body.rotation_euler.z=math.pi
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
        # The static planar LOD pass leaves long triangles on the shirt. Add
        # local surface samples before morphing, preserving UVs via bmesh.
        bm=bmesh.new();bm.from_mesh(body.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        faces=[f for f in bm.faces if all(.78<v.co.z<1.44 and abs(v.co.x)<.30 and v.co.y<.025 for v in f.verts)]
        # Reserve samples for both the chest and belly; sorting solely by area
        # could spend the entire budget on the shirt's abdominal panels.
        chest_faces=[f for f in faces if f.calc_center_median().z>1.16]
        belly_faces=[f for f in faces if f.calc_center_median().z<=1.16]
        count=[120,60,20][lod]
        faces=sorted(chest_faces,key=lambda f:f.calc_area(),reverse=True)[:count//2]+sorted(belly_faces,key=lambda f:f.calc_area(),reverse=True)[:count-count//2]
        edges=list({e for f in faces for e in f.edges})
        if edges:bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
        bm.to_mesh(body.data);bm.free();body.data.update()
        body.name='UniversalHuman';body['source']='Pixal3D reference image → static LOD → rig/morphs';body['lod']=lod
        # Share vertex normals in storage. The runtime uses derivative-based flat shading,
        # so faces remain faceted without tripling every morph's vertex payload.
        for polygon in body.data.polygons:polygon.use_smooth=True
        basis=body.shape_key_add(name='Basis')
        for name in MORPHS:
            key=body.shape_key_add(name=name);key.slider_min=-1
            for vertex,original in zip(key.data,basis.data):vertex.co=morph(original.co,name)
        armature=rig();weights(body,armature);animations(armature);validate(body,armature)
        body.data.calc_loop_triangles();triangles=len(body.data.loop_triangles)
        assert triangles<=[10000,4500,1400][lod]
        bpy.ops.object.select_all(action='DESELECT');body.select_set(True);armature.select_set(True);bpy.context.view_layer.objects.active=armature
        destination=args.output/f'UniversalHuman_LOD{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,export_extras=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_frame_range=False,export_force_sampling=True,export_skins=True,export_morph=True,export_morph_normal=False,export_all_influences=False,export_def_bones=False,export_cameras=False,export_lights=False)
        rotation_only_clips(destination)
        report['lods'].append({'file':destination.name,'triangles':triangles,'vertices':len(body.data.vertices),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
        if lod==0:bpy.ops.wm.save_as_mainfile(filepath=str(args.input.parent/'UniversalHuman.blend'))
    (args.output/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('UNIVERSAL_HUMAN::DONE',flush=True)

if __name__=='__main__':main()










