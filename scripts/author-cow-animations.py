"""Bake four editable cattle clips from the original adult female rig in Blender 5.2.
blender --background --factory-startup --python author-cow-animations.py --
    --source cow-female-adult-textured.glb --output path/to/Animations
The original mesh, UVs and skin weights are preserved. IK is baked to bone keys.
The bone map is specific to this adult female source, not the other cattle rigs.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector

FPS, PERIOD, WALK_SPEED = 30, 1.5, 0.50
TARGET_WITHERS_HEIGHT = 1.10
CLIPS = {"Idle": 6.0, "Graze": 12.0, "Walk": PERIOD, "HumanInteraction": 6.0}
LEGS = {
    "hind_left": ("Bone_022", "Bone_021", 4, 0.0, 0.64),
    "front_left": ("Bone_050", "Bone_049", 5, 0.25, 0.68),
    "hind_right": ("Bone_014", "Bone_013", 4, 0.5, 0.64),
    "front_right": ("Bone_041", "Bone_040", 5, 0.75, 0.68),
}
def smooth(x):
    x = max(0, min(1, x))
    return x*x*(3-2*x)
def wave(t, period, phase=0):
    return math.sin(2*math.pi*t/period+phase)

def author(source, output):
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes.new("Pillagers Cattle Authoring")
    bpy.context.window.scene = scene
    bpy.ops.import_scene.gltf(filepath=str(source))
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    meshes = [o for o in scene.objects if o.type == "MESH" and any(
        m.type == "ARMATURE" and m.object == arm for m in o.modifiers)]
    if len(meshes) != 1 or len(arm.data.bones) != 67:
        raise ValueError("Requires the original 67-bone adult female cow")
    for o in scene.objects:
        if o.type == "MESH" and o not in meshes:
            o.hide_render = True
            o.hide_set(True)
    vertices = [mesh.matrix_world @ v.co for mesh in meshes for v in mesh.data.vertices]
    # Adult-female-specific shoulder surface, excluding the higher neck/head.
    withers = [v.z for v in vertices if abs(v.x) < 0.12 and -0.48 < v.y < -0.15]
    if not withers:
        raise ValueError("Cannot measure the adult female shoulder surface")
    source_withers = max(withers) - min(v.z for v in vertices)
    physical_scale = TARGET_WITHERS_HEIGHT / source_withers
    source_height = max(v.z for v in vertices) - min(v.z for v in vertices)
    scene.render.fps = FPS
    scene.frame_start = 1
    rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    # A muzzle-to-poll surface axis gives an anatomical tilt, not bone Euler angles.
    muzzle = [v for v in vertices if v.y < -1.24 and abs(v.x) < 0.12]
    poll = [v for v in vertices if -1.05 < v.y < -0.95 and v.z > 1.54 and abs(v.x) < 0.12]
    if not muzzle or not poll:
        raise ValueError("Cannot identify adult female head landmarks")
    axis = (sum(muzzle, Vector()) / len(muzzle) - sum(poll, Vector()) / len(poll)).normalized()
    neutral_head_pitch = math.atan2(-axis.z, -axis.y)
    head_axis_local = rest["Bone_031"].to_3x3().inverted() @ (arm.matrix_world.to_3x3().inverted() @ axis)
    constraints, feet = [], {}
    for name, (end, hoof, count, phase, duty) in LEGS.items():
        target = bpy.data.objects.new("HoofTarget_"+name, None)
        scene.collection.objects.link(target)
        target.empty_display_size = 0.06
        target.location = arm.data.bones[end].tail_local
        target.rotation_mode = "QUATERNION"
        target.rotation_quaternion = rest[hoof].to_quaternion()
        ik = arm.pose.bones[end].constraints.new("IK")
        ik.name, ik.target, ik.chain_count = "Plant hoof "+name, target, count
        ik.iterations, ik.use_tail = 128, True
        rotate = arm.pose.bones[hoof].constraints.new("COPY_ROTATION")
        rotate.name, rotate.target = "Level hoof "+name, target
        rotate.owner_space = rotate.target_space = "WORLD"
        constraints.extend([ik, rotate])
        feet[name] = (target, target.location.copy(), phase, duty)
    arm.animation_data_create()
    def rotate(name, axis, angle):
        pb = arm.pose.bones[name]
        r = rest[name].to_quaternion()
        pb.rotation_quaternion = pb.rotation_quaternion @ (r.inverted() @ Quaternion(Vector(axis), angle) @ r)
    def pose(clip, t):
        for pb in arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.matrix_basis = Matrix.Identity(4)
        for target, initial, _, _ in feet.values():
            target.location = initial
        breath = 0.0025*(1-math.cos(2*math.pi*t/6))
        arm.pose.bones["Bone_000"].location = rest["Bone_000"].to_quaternion().inverted() @ Vector((0, 0, breath))
        rotate("Bone_036", (1,0,0), 0.010*wave(t,6))
        rotate("Bone_031", (0,0,1), 0.012*wave(t,6))
        rotate("Bone_009", (0,1,0), 0.12*wave(t,6))
        rotate("Bone_008", (0,1,0), 0.06*wave(t,6))
        ear = math.sin(math.pi*t/6)**10
        rotate("Bone_063", (0,1,0), 0.065*ear)
        rotate("Bone_066", (0,1,0), -0.045*ear)
        if clip == "Walk":
            bob = 0.006*(1-math.cos(4*math.pi*t/PERIOD))
            arm.pose.bones["Bone_000"].location = rest["Bone_000"].to_quaternion().inverted() @ Vector((0,0,bob))
            rotate("Bone_000", (0,1,0), 0.006*wave(t,PERIOD))
            arm.pose.bones["Bone_036"].rotation_quaternion = Quaternion()
            rotate("Bone_036", (1,0,0), 0.014*wave(t,PERIOD))
            for name in ["Bone_009","Bone_008","Bone_031","Bone_063","Bone_066"]:
                arm.pose.bones[name].rotation_quaternion = Quaternion()
            rotate("Bone_009", (0,1,0), 0.04*wave(t,PERIOD))
            rotate("Bone_031", (0,0,1), 0.008*wave(t,PERIOD))
            for target, initial, offset, duty in feet.values():
                phase = (t/PERIOD-offset)%1
                distance = WALK_SPEED*PERIOD*duty
                target.location = initial
                if phase <= duty:
                    target.location.y += -distance/2+WALK_SPEED*PERIOD*phase
                else:
                    u = (phase-duty)/(1-duty)
                    target.location.y += distance/2-distance*smooth(u)
                    target.location.z += 0.085*math.sin(math.pi*u)**1.2
        elif clip == "Graze":
            down = smooth(t/2.4)*(1-smooth((t-9.6)/2.4))
            rotate("Bone_000", (1,0,0), 0.065*down)
            # Z is Blender's vertical axis: gentle body, shoulder and head yaw.
            rotate("Bone_000", (0,0,1), math.radians(1.0)*down*wave(t,6))
            rotate("Bone_028", (0,0,1), math.radians(1.25)*down*wave(t,4))
            rotate("Bone_036", (1,0,0), 1.48*down)
            rotate("Bone_036", (0,0,1), math.radians(1.5)*down*wave(t,6,0.6))
            rotate("Bone_034", (1,0,0), 0.14*down)
            rotate("Bone_032", (1,0,0), -0.04*down+0.015*down*wave(t,2))
            desired_pitch = neutral_head_pitch*(1-down) + math.radians(75)*down
            # Counter-rotate the skull as the neck lowers. Correct in evaluated
            # armature space so the tilt stays 15 degrees off vertical through the sway.
            for _ in range(2):
                bpy.context.view_layer.update()
                evaluated = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
                direction = arm.matrix_world.to_3x3() @ (evaluated.pose.bones["Bone_031"].matrix.to_3x3() @ head_axis_local)
                pitch = math.atan2(-direction.z, -direction.y)
                rotate("Bone_031", (1,0,0), desired_pitch-pitch)
            bpy.context.view_layer.update()
            evaluated = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
            head = arm.pose.bones["Bone_031"]
            axis_local = evaluated.pose.bones["Bone_031"].matrix.to_3x3().inverted() @ (arm.matrix_world.to_3x3().inverted() @ Vector((0,0,1)))
            head.rotation_quaternion = head.rotation_quaternion @ Quaternion(axis_local.normalized(), math.radians(3.0)*down*wave(t,3,0.8))
            # This mesh has no anatomically separate jaw: no invented chewing bone.
        elif clip == "HumanInteraction":
            attention = math.sin(math.pi*t/6)**2
            rotate("Bone_036", (1,0,0), -0.16*attention)
            rotate("Bone_031", (1,0,0), attention*(-0.10+0.22*wave(t,2)))
            rotate("Bone_032", (0,0,1), 0.045*attention*wave(t,6))
            rotate("Bone_063", (0,1,0), -0.06*attention)
            rotate("Bone_066", (0,1,0), 0.06*attention)
    actions, contacts = {}, {}
    for clip, duration in CLIPS.items():
        arm.animation_data.action = None
        for c in constraints: c.mute = False
        samples, errors = [], []
        for frame in range(1, round(duration*FPS)+2):
            t = (frame-1)/FPS
            scene.frame_set(frame)
            pose(clip,t)
            bpy.context.view_layer.update()
            evaluated = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
            samples.append({b.name:b.matrix.copy() for b in evaluated.pose.bones})
            for name, (end, _, _, offset, duty) in LEGS.items():
                if clip != "Walk" or (t/PERIOD-offset)%1 <= duty:
                    errors.append((evaluated.pose.bones[end].tail-feet[name][0].location).length)
        for c in constraints: c.mute = True
        action = bpy.data.actions.new(clip)
        action.use_fake_user = True
        arm.animation_data.action = action
        previous = {}
        for frame, matrices in enumerate(samples,1):
            scene.frame_set(frame)
            for pb in arm.pose.bones:
                bone = arm.data.bones[pb.name]
                args = {} if not bone.parent else {
                    "parent_matrix":matrices[bone.parent.name],
                    "parent_matrix_local":rest[bone.parent.name]}
                pb.matrix_basis = bone.convert_local_to_pose(matrices[pb.name],rest[pb.name],invert=True,**args)
                if pb.name in previous and previous[pb.name].dot(pb.rotation_quaternion)<0:
                    pb.rotation_quaternion.negate()
                previous[pb.name] = pb.rotation_quaternion.copy()
                for path in ["location","rotation_quaternion","scale"]:
                    pb.keyframe_insert(data_path=path,frame=frame,group=pb.name)
        actions[clip] = action
        contacts[clip] = {"maxPlantedTargetErrorM":max(errors)*physical_scale,"duration":duration}
        print("AUTHORED",clip,len(samples),contacts[clip],flush=True)
    # Apply one uniform parent transform after baking, preserving mesh and keys.
    physical_root = bpy.data.objects.new("CowPhysicalScale", None)
    scene.collection.objects.link(physical_root)
    for obj in [arm, *meshes, *(target for target, _, _, _ in feet.values())]:
        if obj.parent is None:
            obj.parent = physical_root
    physical_root.scale = (physical_scale,) * 3
    physical_root["withersHeightM"] = TARGET_WITHERS_HEIGHT
    physical_root["sourceWithersHeightM"] = source_withers
    arm.animation_data.action = actions["Idle"]
    scene.frame_end = 181
    scene.frame_set(1)
    bpy.context.view_layer.update()
    for o in bpy.context.selected_objects: o.select_set(False)
    physical_root.select_set(True)
    arm.select_set(True)
    for mesh in meshes: mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.region_3d.view_location = (0, 0, 0.65)
                space.region_3d.view_distance = 3.6
                space.region_3d.view_rotation = Quaternion((0.5, 0.5, 0.5, 0.5))
                space.overlay.show_overlays = False
                types = space.shading.bl_rna.properties["type"].enum_items
                if any(item.identifier == "MATERIAL" for item in types):
                    space.shading.type = "MATERIAL"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(output/"cow-female-adult-animations.blend"))
    for pb in arm.pose.bones:
        for constraint in list(pb.constraints):
            pb.constraints.remove(constraint)
    bpy.ops.export_scene.gltf(filepath=str(output/"cow-female-adult-animated.glb"),
        use_selection=True,use_active_scene=True,export_format="GLB",export_animations=True,
        export_animation_mode="ACTIONS",export_force_sampling=True,
        export_anim_slide_to_zero=True,export_current_frame=False,export_skins=True)
    metadata = {"schemaVersion":1,"source":str(source),
        "sourceSha256":hashlib.sha256(source.read_bytes()).hexdigest(),
        "blenderVersion":bpy.app.version_string,"fps":FPS,"clips":contacts,
        "walkSpeedMps":WALK_SPEED*physical_scale,"walkCycleSeconds":PERIOD,
        "withersHeightM":TARGET_WITHERS_HEIGHT,"sourceWithersHeightM":source_withers,
        "physicalScale":physical_scale,"height":source_height*physical_scale,
        "variant":"adult-female","boneCount":len(arm.data.bones),
        "grazing":{"headTiltDegrees":75,"headTiltReference":"horizontal ground","verticalDeviationDegrees":15,"yawDegrees":{"body":1,"shoulders":1.25,"neck":1.5,"head":3}},
        "referenceMethod":"Authored keys with cattle gait literature; not video motion capture",
        "proposedVideo":"https://youtu.be/sObyVL3oU6g",
        "references":[
            "https://pmc.ncbi.nlm.nih.gov/articles/PMC6012707/",
            "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0253479"]}
    (output/"authoring.json").write_text(json.dumps(metadata,indent=2)+"\n",encoding="utf-8")
    return scene,arm,meshes,actions

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    a = p.parse_args(sys.argv[sys.argv.index("--")+1:])
    author(a.source.resolve(),a.output.resolve())
