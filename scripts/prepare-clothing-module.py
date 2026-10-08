"""Calibrate a reviewed image-to-3D outfit and tag its existing surfaces. Blender CLI.

No garment is authored here. Source textures, folds and silhouette come from the
generated figure. The original head/ground measure establishes the shared frame.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('style', choices=['cream-tunic','long-dress','mantle-tunic'])
p.add_argument('source', type=Path)
p.add_argument('figure', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--full-figure',action='store_true',help='Extract only after optimization of the closed full reference figure.')
p.add_argument('--source-bind',type=Path,help='Measured generated-figure joints; limits residual skin removal to arms only.')
p.add_argument('--already-calibrated',action='store_true',help='Tag an optimized surface already in this generated figure metre frame.')
p.add_argument('--source-frame',type=Path,help='Reuse the measured original figure frame without reopening its dense mesh.')
p.add_argument('--surface-domain-reviewed',action='store_true',help='Preserve an original UV-domain extraction; do not classify fabric as residual skin again.')
p.add_argument('--sleeveless',action='store_true',help='Author the original upper bodice as a torso bind domain; this outfit has no source sleeves.')
p.add_argument('--split-drape-boundary',action='store_true',help='Split original triangles at the measured one-third Hips→Chest waist interface before assigning cloth/drape ownership; preserve interpolated original UVs.')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bind=json.loads(a.source_bind.read_text())['joints'] if a.source_bind else None
assert not a.sleeveless or bind, 'Sleeveless source domains require measured bind joints.'
assert not a.split_drape_boundary or bind, 'A source drape interface requires measured bind joints.'
waist_interface=bind['Hips'][1]+(bind['Chest'][1]-bind['Hips'][1])/3 if bind else 1.03
def torso_distance(point):
    if not bind:return float('inf')
    distances=[]
    for first,last in [('Hips','Chest'),('Chest','Neck')]:
        start=Vector((bind[first][0],-bind[first][2],bind[first][1]));axis=Vector((bind[last][0],-bind[last][2],bind[last][1]))-start;t=max(0,min(1,(point-start).dot(axis)/axis.length_squared));distances.append((point-start-axis*t).length)
    return min(distances)
def arm_distance(point):
    if not bind:return float('inf')
    distances=[]
    for side in ['L','R']:
        for name,end in [('UpperArm','LowerArm'),('LowerArm','Hand')]:
            first=bind[name+'_'+side];last=bind[end+'_'+side];start=Vector((first[0],-first[2],first[1]));axis=Vector((last[0],-last[2],last[1]))-start;t=max(0,min(2 if name=='LowerArm' else 1,(point-start).dot(axis)/axis.length_squared));distances.append((point-start-axis*t).length)
    return min(distances)
def leg_distance(point):
    if not bind:return float('inf')
    distances=[]
    for side in ['L','R']:
        start=Vector((bind['LowerLeg_'+side][0],-bind['LowerLeg_'+side][2],bind['LowerLeg_'+side][1]));axis=Vector((bind['Foot_'+side][0],-bind['Foot_'+side][2],bind['Foot_'+side][1]))-start;t=max(0,min(1,(point-start).dot(axis)/axis.length_squared));distances.append((point-start-axis*t).length)
    return min(distances)
assert not a.output.exists(), 'Preserve reviewed outputs; use a new run.'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
if a.source_frame:
    measured=json.loads(a.source_frame.read_text())['fit'];scale=measured['scale'];centre=Vector(measured['sourceCentreBlender']);front=1 if measured.get('rotateBlenderZ',0)==180 else -1
else:
    bpy.ops.import_scene.gltf(filepath=str(a.figure.resolve()))
    points=[o.matrix_world@v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
    low=min(v.z for v in points);high=max(v.z for v in points);scale=1.8/(high-low)
    head=[v for v in points if low+(high-low)*.87<v.z<low+(high-low)*.96]
    centre=Vector((sum(v.x for v in head)/len(head),sum(v.y for v in head)/len(head),low))
    feet=[v for v in points if v.z<low+(high-low)*.07]
    ankles=[v for v in points if low+(high-low)*.10<v.z<low+(high-low)*.15]
    ankle_y=sum(v.y for v in ankles)/len(ankles)
    front=1 if max(v.y for v in feet)-ankle_y > ankle_y-min(v.y for v in feet) else -1
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.source.resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
removed_fragment_faces=0
for obj in meshes:
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if not a.already_calibrated:
        for v in obj.data.vertices:v.co=(v.co-centre)*scale
    obj.rotation_mode='XYZ'
    obj.rotation_euler.z=0 if a.already_calibrated else math.pi if front==1 else 0
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
    bm=bmesh.new();bm.from_mesh(obj.data)
    # Imported flat normals duplicate corners. Weld only coincident points
    # before measuring connected components; UV corners remain per loop.
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    if a.split_drape_boundary:
        # A centroid-only semantic cut can let an entire upper-waist triangle
        # be replaced by the lower drape cage, while its neighbouring bodice
        # still owns the same edge. Split the immutable source surface first,
        # with bmesh retaining the original loop UV interpolation.
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector((0,0,waist_interface)),plane_no=Vector((0,0,1)),clear_inner=False,clear_outer=False)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
    unseen=set(bm.faces);removed=[]
    while unseen:
        first=unseen.pop();component=[first];pending=[first]
        while pending:
            face=pending.pop()
            for edge in face.edges:
                for neighbour in edge.link_faces:
                    if neighbour in unseen:unseen.remove(neighbour);component.append(neighbour);pending.append(neighbour)
        area=sum(face.calc_area() for face in component);componentCentre=sum((face.calc_center_median()*face.calc_area() for face in component),Vector())/max(area,1e-12)
        # A reviewed sleeveless source has no detached forearm fabric domain.
        # Keep separate boots, leg wraps and authored ties by their measured
        # source anatomical distance; this is independent of shaded skin hue.
        detachedBareArm=a.sleeveless and arm_distance(componentCentre)<min(torso_distance(componentCentre),leg_distance(componentCentre))*.9
        if area<.004 or detachedBareArm:removed.extend(component)
    removed_fragment_faces+=len(removed)
    bmesh.ops.delete(bm,geom=removed,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(obj.data);bm.free()
    obj.data.update()
    images={}
    for i,mat in enumerate(obj.data.materials):
        node=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
        if node:images[i]=(tuple(node.image.size),list(node.image.pixels[:]),node.image.channels)
    uv=obj.data.uv_layers.active.data
    def rgb(face):
        size,pixels,channels=images[face.material_index]
        u,v=sum((uv[k].uv for k in face.loop_indices),Vector((0,0)))/len(face.loop_indices)
        x=max(0,min(size[0]-1,int(u*size[0])));y=max(0,min(size[1]-1,int(v*size[1])))
        return pixels[(y*size[0]+x)*channels:(y*size[0]+x)*channels+3]
    regions={key:[] for key in ['cloth','skirt','mantle','footwear','bodice']}
    for face in obj.data.polygons:
        y=face.center.z
        pigment=rgb(face)
        lowerLegLimit=max(bind['LowerLeg_'+side][1]+(bind['UpperLeg_'+side][1]-bind['LowerLeg_'+side][1])*.4 for side in ['L','R']) if bind else .65
        # The original warm brown calf-wrap pigment is a leg/boot domain, not
        # the neutral brown dress hem or red waist tie. Classify before drape
        # repair so a wide wrap cannot inherit hips-only skirt skinning.
        calfWrap=bind and y<lowerLegLimit and pigment[0]>pigment[1]*1.45 and pigment[0]>pigment[2]*1.65 and leg_distance(face.center)<torso_distance(face.center)*.75
        colour=rgb(face)
        if a.surface_domain_reviewed and bind and y<bind['Chest'][1]-.05 and arm_distance(face.center)<.08 and colour[0]>.60 and colour[1]>.28 and colour[2]>.20 and 1.22<colour[0]/max(.001,colour[1])<1.9 and colour[0]/max(.001,colour[2])>1.30:
            continue
        cuff={'cream-tunic':1.20,'long-dress':1.45,'mantle-tunic':1.08}[a.style]
        # Residual generated forearm facets share the source skin's pink hue.
        # Keep dark leather and saturated mantle reds, and never cut the hem.
        if not a.surface_domain_reviewed and a.full_figure and (y>1.58 or y>1.40 and abs(face.center.x)<.17 and colour[0]>.60 and colour[0]/max(.001,colour[1])>1.23 and colour[0]/max(.001,colour[2])>1.3):continue
        if not a.surface_domain_reviewed and .45<y<cuff and arm_distance(face.center)<.17 and colour[0]>.60 and colour[1]>.28 and colour[2]>.20 and 1.22<colour[0]/max(.001,colour[1])<1.9 and colour[0]/max(.001,colour[2])>1.30:
            continue
        if y<.27 or calfWrap:region='footwear'
        elif a.style=='long-dress' and y<waist_interface:
            # Leg wrapping is not a skirt: its existing lower-leg bind region
            # must follow the calf while the outer dress retains an open drape.
            if y<.65 and leg_distance(face.center)<.10:region='cloth'
            else:region='skirt'
        elif a.style=='mantle-tunic' and y>1.17 and (lambda c:c[0]>c[1]*1.25 and c[0]>c[2]*1.3)(rgb(face)):region='mantle'
        elif .67<y<waist_interface and (lambda c:min(c)>.48 if a.style=='cream-tunic' else c[2]>c[0]*1.05)(rgb(face)):region='skirt'
        else:region='cloth'
        if a.sleeveless and region=='cloth' and y>bind['Hips'][1]+.02:region='bodice'
        regions[region].append(face.index)
    for region,selected in regions.items():
        if not selected:continue
        clone=obj.copy();clone.data=obj.data.copy();bpy.context.scene.collection.objects.link(clone)
        bm=bmesh.new();bm.from_mesh(clone.data);bm.faces.ensure_lookup_table();keep=set(selected)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES')
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bm.to_mesh(clone.data);bm.free()
        clone.name=f'{a.style}_{region}';clone['garmentRegion']='cloth' if region=='bodice' else region
        if region=='bodice':clone['garmentBindDomain']='torso'
        for poly in clone.data.polygons:poly.use_smooth=False
    bpy.data.objects.remove(obj,do_unlink=True)
a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
report=a.source.parent/f'Clothing_{a.style}_report.json'
record={'reviewRequired':True,'style':a.style,'lod':2,'source':str(a.source.resolve()),
    'sourceSha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),
    'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),
    'fit':{'up':'+Y','front':'+Z','origin':'ground / source skull axis','sourceUp':'+Y','sourceFront':'-Z' if front==1 else '+Z',
           'sourceCentreBlender':list(centre),'scale':scale,'rotateBlenderZ':180 if front==1 else 0,
           'frontMeasurement':'toe extension relative to ankle cross-section'},
    'geometryPolicy':'existing reference surfaces only; tagged drape regions; skirt underside reopened',
    'removedFloatingFragmentFaces':removed_fragment_faces,'fragmentAreaThresholdMetresSquared':.004,
    'sourceDrapeInterface':{'splitBeforeSemanticOwnership':a.split_drape_boundary,'heightMetres':waist_interface,'authority':'one third of measured Hips→Chest; original positions/UVs retained'},
    'sourceProvenance':json.loads(report.read_text()) if report.exists() else json.loads(a.source.with_suffix('.provenance.json').read_text())}
if bind:record['fit']['garmentBind']={'joints':bind}
a.output.with_suffix('.provenance.json').write_text(json.dumps(record,indent=2)+'\n')
print('CLOTHING_CALIBRATED',a.output,flush=True)
