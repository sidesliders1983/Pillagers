"""Blender 4.5.9 template source. Editable contacts/free regions, one source for all views.
Run through scripts/prepare-meshy-modules.mjs; no provider jobs or external add-ons.
"""
import bpy, bmesh, json, math, sys, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree
args=sys.argv[sys.argv.index('--')+1:]; data=json.load(open(args[0],encoding='utf-8-sig')); output=args[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
# Native source supplies a locked fitting reference, not exported body geometry.
bpy.ops.import_scene.gltf(filepath=data['sourcePath'],import_pack_images=True)
for obj in list(bpy.context.scene.objects):
    obj.hide_render=True;obj.hide_set(True)
    obj['purpose']='Locked Meshy source; excluded from module export'
reference=data['surfaces'][0]; low=data['surfaces'][2]
native_armature=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
if native_armature.animation_data:native_armature.animation_data.action=None
reference_tree=BVHTree.FromPolygons([Vector((x,-z,y)) for x,y,z in [reference['positions'][i:i+3] for i in range(0,len(reference['positions']),3)]],[reference['indices'][i:i+3] for i in range(0,len(reference['indices']),3)],all_triangles=True)
def vecs(values): return [tuple(values[i:i+3]) for i in range(0,len(values),3)]
def mesh_obj(name,vertices,faces):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([(x,-z,y) for x,y,z in vertices],[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);return obj
body=mesh_obj('ContactReference_LOD0',vecs(reference['positions']),[reference['indices'][i:i+3] for i in range(0,len(reference['indices']),3)])
body.hide_render=True;body.hide_set(True);body['sourceSHA256']=data['sourceHash'];body['purpose']='Actual neutral metre surface. Never exported.'

def shell(name,kind):
    obj=mesh_obj(name,vecs(low['positions']),[low['indices'][i:i+3] for i in range(0,len(low['indices']),3)])
    # Semantic source selection excludes hands, feet and helper anatomy.
    if kind.startswith('outfit'):
        keep={'TORSO_UPPER','TORSO_LOWER','PELVIS','UPPER_ARM_L','UPPER_ARM_R','NECK'} if kind=='outfit-upper' else {'PELVIS','UPPER_LEG_L','UPPER_LEG_R','LOWER_LEG_L','LOWER_LEG_R','FEET'}
        source_faces=[low['indices'][i:i+3] for i in range(0,len(low['indices']),3) if all(low['regions'][v] in keep for v in low['indices'][i:i+3])]
        old_mesh=obj.data;mesh=bpy.data.meshes.new(name+'_semantic');mesh.from_pydata([(x,-z,y) for x,y,z in vecs(low['positions'])],[],source_faces);obj.data=mesh;bpy.data.meshes.remove(old_mesh)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.00001)
    # Crop anatomy with planes before broadening it; openings are source authored.
    def cut(point,normal,clear_inner=True):
        co=Vector((point[0],-point[2],point[1]));no=Vector((normal[0],-normal[2],normal[1]))
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=co,plane_no=no,clear_inner=clear_inner,clear_outer=not clear_inner)
    if kind=='hair':
        cut((0,1.53,0),(0,1,-.5));offset=.007;ratio=.6
    elif kind=='beard':
        cut((0,1.434,0),(0,1,0));cut((0,1.489,0),(0,-1,0));cut((0,0,.018),(0,0,1));offset=.008;ratio=.75
    elif kind=='outfit-upper':
        cut((0,.925,0),(0,1,0));cut((0,1.389,0),(0,-1,0))
        # Short sleeve plane: source LeftArm -> LeftForeArm, before the elbow.
        # Apply the sleeve crop only outside the torso; it must not cut the waist.
        arm_faces=[f for f in bm.faces if f.calc_center_median().x>.19]
        arm_geom=set(arm_faces)
        for f in arm_faces:arm_geom.update(f.edges);arm_geom.update(f.verts)
        bmesh.ops.bisect_plane(bm,geom=list(arm_geom),dist=.000001,plane_co=(.229,.064,1.194),plane_no=(-.38,-.02,.92),clear_inner=True)
        offset=.020;ratio=.62
    else:
        cut((0,.205,0),(0,1,0));cut((0,1.025,0),(0,-1,0));offset=.016;ratio=.7
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.normal_update()
    # Preserve source contour at the contact rim; only a bounded stand-off here.
    for v in bm.verts:
        on_mirror=abs(v.co.x)<.00001
        v.co+=v.normal*offset
        if on_mirror:v.co.x=0
    bm.to_mesh(obj.data);bm.free()
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    dec=obj.modifiers.new('Broad panels; inspect locked openings','DECIMATE');dec.ratio=ratio
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Cut the mirror boundary AFTER reduction so it is never collapsed into
    # separated fans meeting at a single point on the symmetry plane.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=True)
    remaining=set(bm.faces)
    while remaining:
        first=remaining.pop();component=[first];pending=[first]
        while pending:
            face=pending.pop()
            for edge in face.edges:
                for neighbor in edge.link_faces:
                    if neighbor in remaining:remaining.remove(neighbor);component.append(neighbor);pending.append(neighbor)
        if len(component)<4:bmesh.ops.delete(bm,geom=component,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(obj.data);bm.free()
    mirror=obj.modifiers.new('Bilateral construction','MIRROR');mirror.use_clip=True;mirror.use_mirror_merge=True;mirror.merge_threshold=.00001
    bpy.ops.object.modifier_apply(modifier=mirror.name)
    obj.select_set(False);return obj

hair=shell('Module_hair_contact','hair');beard=shell('Module_beard_contact','beard')
# Angular locks are deliberate broad masses attached to the source skull cap.
def wedge(name,cx,cy,cz,w,h,length):
    v=[(cx-w/2,cy,cz-length/2),(cx+w/2,cy,cz-length/2),(cx-w/2,cy,cz+length/2),(cx+w/2,cy,cz+length/2),(cx-w*.30,cy+h,cz-length*.30),(cx+w*.30,cy+h,cz-length*.30),(cx-w*.30,cy+h*.65,cz+length*.40),(cx+w*.30,cy+h*.65,cz+length*.40)]
    return mesh_obj(name,v,[(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5),(4,5,7,6),(0,2,3,1)])
locks=[wedge('Module_hair_lock_'+str(i),x,1.605-abs(x)*.35,-.025,.044,.065,.14) for i,x in enumerate([-.072,-.036,0,.036,.072])]
# The lower-face patch controls contact; the small free wedge controls the chin silhouette.
beard_tip=wedge('Module_beard_wedge',0,1.432,.085,.105,.055,.07)
reference_vertices=vecs(reference['positions'])
# Cuff contacts are taken from the same fixed arm section used by body clipping.
cuff_sections={}
for side in [1,-1]:
    normal=Vector((side*.38,-.923,-.06));origin=Vector((side*.182,1.298,-.062));segments=[]
    for triangle in range(len(reference['indices'])//3):
        ids=reference['indices'][triangle*3:triangle*3+3]
        if not all(reference['regions'][i] in ['UPPER_ARM_'+('L' if side==1 else 'R'),'LOWER_ARM_'+('L' if side==1 else 'R')] for i in ids):continue
        points=[Vector(reference_vertices[i]) for i in ids];distances=[(p-origin).dot(normal)-.456 for p in points];cuts=[]
        for k in range(3):
            j=(k+1)%3
            if (distances[k]>=0)!=(distances[j]>=0):
                t=distances[k]/(distances[k]-distances[j]);bary=[0,0,0];bary[k]=1-t;bary[j]=t;cuts.append((points[k].lerp(points[j],t),bary))
        if len(cuts)==2:segments.append((ids,cuts))
    cuff_sections[side]=segments

def cuff_anchor(p,side):
    point=Vector(p);best=None;distance=float('inf')
    for ids,((a,ba),(b,bb)) in cuff_sections[side]:
        edge=b-a;t=max(0,min(1,(point-a).dot(edge)/edge.length_squared));d=(point-a.lerp(b,t)).length_squared
        if d<distance:distance=d;best=(ids,[ba[k]*(1-t)+bb[k]*t for k in range(3)])
    ids,bary=best;hit=sum((Vector(reference_vertices[i])*bary[k] for k,i in enumerate(ids)),Vector((0,0,0)))
    return ids,bary,hit

def cuff_weights(p,side):
    ids,bary,hit=cuff_anchor(p,side);sums={}
    for k,i in enumerate(ids):
        for j in range(4):
            joint=reference['joints'][i*4+j];sums[joint]=sums.get(joint,0)+reference['weights'][i*4+j]*bary[k]
    top=sorted(((j,w) for j,w in sums.items() if w>0),key=lambda x:(-x[1],x[0]))[:4];total=sum(w for j,w in top)
    return {'joints':[j for j,w in top]+[0]*(4-len(top)),'weights':[w/total for j,w in top]+[0]*(4-len(top))}

def neckline_ring(count):
    """Sample the actual closed native neck section in its topological order."""
    normal = Vector((0, 1, .3))
    points = []
    edges = set()

    def register(point):
        for index, existing in enumerate(points):
            if (point - existing).length_squared < 1e-12:
                return index
        points.append(point)
        return len(points) - 1

    for triangle in range(len(reference['indices']) // 3):
        indices = reference['indices'][triangle * 3:triangle * 3 + 3]
        if not any(reference['regions'][vertex] == 'NECK' for vertex in indices):
            continue
        corners = [Vector(reference_vertices[vertex]) for vertex in indices]
        distances = [corner.dot(normal) - 1.415 for corner in corners]
        cuts = []
        for k in range(3):
            next_corner = (k + 1) % 3
            if (distances[k] >= 0) == (distances[next_corner] >= 0):
                continue
            fraction = distances[k] / (distances[k] - distances[next_corner])
            cuts.append(register(corners[k].lerp(corners[next_corner], fraction)))
        if len(cuts) == 2 and cuts[0] != cuts[1]:
            edges.add(tuple(sorted(cuts)))
    neighbours = {index: [] for index in range(len(points))}
    for a, b in sorted(edges):
        neighbours[a].append(b)
        neighbours[b].append(a)
    if any(len(values) != 2 for values in neighbours.values()):
        raise RuntimeError('Native neck section is not a closed manifold loop')
    ordered = []
    previous, current = -1, 0
    while True:
        ordered.append(points[current])
        next_point = next(vertex for vertex in neighbours[current] if vertex != previous)
        previous, current = current, next_point
        if current == 0:
            break
    if len(ordered) != len(points):
        raise RuntimeError('Native neck section has more than one component')
    axis = normal.normalized()
    front = Vector((0, 0, 1))
    front = (front - axis * front.dot(axis)).normalized()
    right = axis.cross(front)
    area = sum(a.dot(front) * b.dot(right) - a.dot(right) * b.dot(front)
               for a, b in zip(ordered, ordered[1:] + ordered[:1]))
    if area < 0:
        ordered.reverse()
    distances = [0]
    for a, b in zip(ordered, ordered[1:] + ordered[:1]):
        distances.append(distances[-1] + (b - a).length)
    start, frontmost = None, -float('inf')
    for k, (a, b) in enumerate(zip(ordered, ordered[1:] + ordered[:1])):
        if (a.x >= 0) == (b.x >= 0):
            continue
        fraction = a.x / (a.x - b.x)
        point = a.lerp(b, fraction)
        if point.dot(front) > frontmost:
            frontmost = point.dot(front)
            start = distances[k] + (b - a).length * fraction
    if start is None:
        raise RuntimeError('Native neck section has no central front contact')
    if count is None:
        front_point = None
        for k, (a, b) in enumerate(zip(ordered, ordered[1:] + ordered[:1])):
            if distances[k] <= start <= distances[k + 1]:
                front_point = a.lerp(b, (start - distances[k]) / (distances[k + 1] - distances[k]))
                break
        remainder = sorted(((distances[k] - start + distances[-1]) % distances[-1], point)
                           for k, point in enumerate(ordered)
                           if (point - front_point).length_squared >= 1e-12)
        return [tuple(front_point)] + [tuple(point) for distance, point in remainder]
    ring = []
    for corner in range(count):
        target = (start + distances[-1] * corner / count) % distances[-1]
        for k, (a, b) in enumerate(zip(ordered, ordered[1:] + ordered[:1])):
            if distances[k] <= target <= distances[k + 1]:
                fraction = (target - distances[k]) / (distances[k + 1] - distances[k])
                ring.append(tuple(a.lerp(b, fraction)))
                break
    return ring

def designed_outfit():
    """Panel construction, not decimated anatomy. Fixed authored opening loops."""
    def finish(name,v,f,contact,color_indices=None):
        obj=mesh_obj(name,v,f)
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
        obj['contactIndices']=contact;obj['design']='Authored panel loops and articulation; no body-shell simplification'
        if color_indices:obj['trimFaces']=color_indices
        return obj
    n=16;v=[];f=[];contact=[];trim=[]
    neck_contacts = neckline_ring(None)
    # Broad front/back panels flare below the belt; neck and sleeves have fixed rims.
    specs=[(.86,.186,.151,-.010),(.955,.181,.155,-.014),(1.015,.164,.137,-.015),(1.20,.189,.154,-.030),(1.355,.192,.145,-.045)]
    for row,(y,rx,rz,cz) in enumerate(specs):
        for k in range(n):
            a=math.tau*k/n
            height=y
            if row==0:height+=.025*abs(math.cos(a))
            if row==4:height-=.04*abs(math.cos(a))
            v.append((rx * math.sin(a), height, rz * math.cos(a) + cz))
    for row in range(len(specs)-1):
        for k in range(n):
            # Branch sleeve openings between upper panel loops, not intersecting tubes.
            if row==3 and k in [2,3,4,5,10,11,12,13]:continue
            f.append((row*n+k,row*n+(k+1)%n,(row+1)*n+(k+1)%n,(row+1)*n+k))
            if row==4:trim.append(len(f)-1)
    def bridge(previous, current):
        a = b = 0
        while a < len(previous) or b < len(current):
            ta = (a + 1) / len(previous) if a < len(previous) else 2
            tb = (b + 1) / len(current) if b < len(current) else 2
            if abs(ta - tb) < 1e-8:
                f.append((previous[a % len(previous)], previous[(a + 1) % len(previous)],
                          current[(b + 1) % len(current)], current[b % len(current)]))
                a += 1
                b += 1
            elif ta < tb:
                f.append((previous[a % len(previous)], previous[(a + 1) % len(previous)],
                          current[b % len(current)]))
                a += 1
            else:
                f.append((previous[a % len(previous)], current[(b + 1) % len(current)],
                          current[b % len(current)]))
                b += 1

    band_start = len(v)
    axis = Vector((0, 1, .3)).normalized()
    for k, point in enumerate(neck_contacts):
        tangent = Vector(neck_contacts[(k + 1) % len(neck_contacts)]) - Vector(neck_contacts[k - 1])
        outward = tangent.cross(axis).normalized()
        v.append(tuple(Vector(point) - axis * .015 + outward * .004))
    neck_start = len(v)
    v.extend(neck_contacts)
    contact.extend(range(neck_start, neck_start + len(neck_contacts)))
    bridge(list(range(4 * n, 5 * n)), list(range(band_start, neck_start)))
    bridge(list(range(band_start, neck_start)), list(range(neck_start, len(v))))
    sleeve_start = len(v)
    for side,start in [(1,2),(-1,10)]:
        hole=[3*n+k for k in range(start,start+5)]+[4*n+k for k in range(start+4,start-1,-1)]
        # Articulated test sleeve covers the elbow, ending at a fixed wrist section.
        axis=Vector((side*.38,-.923,-.06)).normalized();u=Vector((0,0,1));u=(u-axis*u.dot(axis)).normalized();w=axis.cross(u)
        previous=hole
        for row,(cx,cy,cz,radius,depth) in enumerate([(.277,1.074,-.077,.104,.244),(.338,.867,-.033,.070,.456)]):
            centre=Vector((side*cx,cy,cz));normal=Vector((side*.38,-.923,-.06));centre-=normal*((centre-Vector((side*.182,1.298,-.062))).dot(normal)-depth)/normal.length_squared
            first=Vector(v[previous[0]])-centre;angle=math.atan2(first.dot(w),first.dot(u));candidates=[]
            for direction in [1,-1]:
                ring=[tuple(centre+(u*math.cos(angle+direction*k*math.tau/10)+w*math.sin(angle+direction*k*math.tau/10))*radius) for k in range(10)]
                score=sum((Vector(v[h])-Vector(p)).length_squared for h,p in zip(previous,ring));candidates.append((score,ring))
            ring=min(candidates,key=lambda x:x[0])[1]
            if row==1:
                # The visible skin and garment share the exact source-section rim.
                unique=[]
                for ids,cuts in cuff_sections[side]:
                    for hit,bary in cuts:
                        if not any((hit-other).length_squared<=1e-12 for other in unique):unique.append(hit)
                ordered=sorted(unique,key=lambda p:math.atan2((p-centre).dot(w),(p-centre).dot(u)))
                first=min(range(len(ordered)),key=lambda i:(ordered[i]-Vector(v[previous[0]])).length_squared)
                candidates=[]
                for direction in [1,-1]:
                    sequence=[ordered[(first+direction*k)%len(ordered)] for k in range(len(ordered))]
                    score=sum((Vector(v[h])-sequence[round(k*len(sequence)/len(previous))%len(sequence)]).length_squared for k,h in enumerate(previous));candidates.append((score,sequence))
                ring=[tuple(p) for p in min(candidates,key=lambda x:x[0])[1]]
            offset=len(v);v.extend(ring)
            if row==1:contact.extend(range(offset,offset+len(ring)))
            a=b=0;na=len(previous);nb=len(ring)
            while a<na or b<nb:
                ta=(a+1)/na if a<na else 2;tb=(b+1)/nb if b<nb else 2
                if abs(ta-tb)<1e-8:
                    f.append((previous[a%na],previous[(a+1)%na],offset+(b+1)%nb,offset+b%nb));a+=1;b+=1
                elif ta<tb:f.append((previous[a%na],previous[(a+1)%na],offset+b%nb));a+=1
                else:f.append((previous[a%na],offset+(b+1)%nb,offset+b%nb));b+=1
            previous=list(range(offset,offset+len(ring)))
    tunic=finish('Module_tunic_panels',v,f,contact,trim);tunic['sleeveStart']=sleeve_start;tunic['rimWeightPairs']=[[band_start+k,neck_start+k] for k in range(len(neck_contacts))]
    # Trouser waist forks into two independent, tapered leg loops at a sewn crotch.
    v=[];f=[]
    for k in range(16):
        a=math.tau*k/16;v.append((.168*math.sin(a),1.005,.133*math.cos(a)-.011))
    crotch=[]
    for z,y in [(-.075,.795),(0,.781),(.075,.795)]:crotch.append(len(v));v.append((0,y,z))
    for side in [1,-1]:
        previous=(list(range(9))+crotch) if side==1 else (list(range(8,16))+[0]+list(reversed(crotch)))
        rows=[(.80,.108,.069,.110,-.003),(.665,.124,.063,.098,-.005),(.55,.139,.078,.079,-.003),(.48,.146,.074,.078,-.026),(.36,.159,.065,.068,-.065)]
        for y,cx,rx,rz,cz in rows:
            ring=[]
            for k in range(12):
                a=-math.pi/6+k*math.tau/12
                # Mirrored right loop starts at the rear waist centre.
                zsign=1 if side==1 else -1
                ring.append(len(v));v.append((side*(cx+rx*math.sin(a)),y,zsign*rz*math.cos(a)+cz))
            for k in range(12):f.append((previous[k],previous[(k+1)%12],ring[(k+1)%12],ring[k]))
            previous=ring
    trousers=finish('Module_trousers_panels',v,f,[])
    # Shaped ankle, instep and sole; the boot replaces the covered body foot.
    v=[];f=[];contact=[]
    for side in [1,-1]:
        previous=None
        specs=[(.425,.155,-.054,.074,.080),(.403,.158,-.059,.075,.081),(.205,.177,-.092,.060,.080),(.115,.187,-.050,.065,.113),(.066,.208,.006,.085,.184),(.015,.208,.006,.085,.184)]
        for row,(y,cx,cz,rx,rz) in enumerate(specs):
            ring=[]
            for k in range(12):
                a=k*math.tau/12;localx=rx*math.sin(a);localz=rz*math.cos(a)
                if row>=4:
                    # Outward-turned native foot, broad toe and squared heel planes.
                    x=cx+localx*math.cos(.23)+localz*math.sin(.23);z=cz-localx*math.sin(.23)+localz*math.cos(.23)
                else:x=cx+localx;z=cz+localz
                ring.append(len(v));v.append((side*x,y,z))
                if row==0:contact.append(len(v)-1)
            if previous:
                for k in range(12):f.append((previous[k],previous[(k+1)%12],ring[(k+1)%12],ring[k]))
            previous=ring
        f.append(tuple(reversed(previous)))
    boots=finish('Module_boots',v,f,contact)
    return tunic,trousers,boots

upper,lower,boots=designed_outfit()

# Belt strip is a separate layer with its own weights and contact.
def belt():
    vertices=[];faces=[];n=16
    for y in [1.001,1.031]:
        for k in range(n):
            a=k*math.tau/n;vertices.append((.174*math.sin(a),y,.146*math.cos(a)-.015))
    for k in range(n):faces.append((k,(k+1)%n,(k+1)%n+n,k+n))
    return mesh_obj('Module_belt',vertices,faces)
belt_obj=belt()
pouch=wedge('Module_pouch',0,-.065,.005,.095,.13,.045)
flap=wedge('Module_pouch_flap',0,-.018,.03,.10,.027,.012)
module_objects={'hair':[hair,*locks],'beard':[beard,beard_tip],'outfit':[upper,lower,boots,belt_obj],'pouch':[pouch,flap]}
palettes={'hair':[(.13,.074,.035)],'beard':[(.13,.074,.035)],'outfit':[(.36,.27,.15),(.075,.105,.105),(.105,.047,.025),(.105,.047,.025)],'pouch':[(.23,.13,.059)]}
# Material colors are linear and broad; no albedo or generated detail textures.
result={}
from mathutils.kdtree import KDTree
reference_vertices=vecs(reference['positions']);source_kd=KDTree(len(reference_vertices))
for i,p in enumerate(reference_vertices):source_kd.insert(Vector(p),i)
source_kd.balance()
arm_kd={}
for side in [1,-1]:
    candidates=[i for i in range(len(reference_vertices)) if reference['regions'][i] in ['UPPER_ARM_'+('L' if side==1 else 'R'),'LOWER_ARM_'+('L' if side==1 else 'R')]]
    tree=KDTree(len(candidates))
    for i in candidates:tree.insert(Vector(reference_vertices[i]),i)
    tree.balance();arm_kd[side]=tree
def authored_weights(piece,p,contact,sleeve=False):
    x,y,z=p;side=1 if x>=0 else -1;arm=9 if side==1 else 22;up=34 if side==1 else 39;leg=35 if side==1 else 40;foot=36 if side==1 else 41;toe=37 if side==1 else 42
    if contact and piece=='Module_tunic_panels' and abs(x)>.16 and y<1.30:return cuff_weights(p,side)
    if sleeve and not contact:
        point,source_vertex,distance=arm_kd[side].find(Vector(p));return {'joints':reference['joints'][source_vertex*4:source_vertex*4+4],'weights':reference['weights'][source_vertex*4:source_vertex*4+4]}
    if contact or (piece=='Module_tunic_panels' and (y>1.045 or abs(x)>.22 and y>.82)):
        point,source_vertex,distance=source_kd.find(Vector(p))
        return {'joints':reference['joints'][source_vertex*4:source_vertex*4+4],'weights':reference['weights'][source_vertex*4:source_vertex*4+4]}
    if piece=='Module_boots':
        if y>.205:values=[(leg,1)]
        elif y>.10:
            t=(y-.10)/.105;values=[(leg,t),(foot,1-t)]
        else:
            t=max(0,min(.85,(z-.02)/.12));values=[(foot,1-t),(toe,t)]
    elif piece=='Module_trousers_panels':
        if y>.82 or (abs(x)<.01 and y>.70):values=[(0,1)]
        elif y>.80:
            t=(y-.80)/.12;values=[(0,t),(up,1-t)]
        elif y>.60:values=[(up,1)]
        elif y>.48:
            t=(y-.48)/.12;values=[(up,t),(leg,1-t)]
        else:values=[(leg,1)]
    elif piece=='Module_belt':values=[(0,1)]
    else:
        if y<.96:
            t=max(0,min(.7,(.96-y)/.105))*max(0,min(1,abs(x)/.08));values=[(0,1-t),(up,t)]
        elif y<1.045:values=[(0,1)]
        elif y<1.14:
            t=(y-1.015)/.125;values=[(0,1-t),(1,t)]
        elif y<1.26:
            t=(y-1.14)/.12;values=[(1,1-t),(2,t)]
        else:values=[(2,.35),(3,.65)]
        if abs(x)>.155 and y>1.17:
            t=max(0,min(.8,(abs(x)-.155)/.12));values=[(j,w*(1-t)) for j,w in values]+[(arm,t)]
    values=[(j,w) for j,w in values if w>0];return {'joints':[j for j,w in values]+[0]*(4-len(values)),'weights':[w for j,w in values]+[0]*(4-len(values))}
for name,objects in module_objects.items():
    vertices=[];faces=[];colors=[];parts=[];skin_weights=[];face_colors=[]
    for part,obj in enumerate(objects):
        bpy.context.view_layer.objects.active=obj;obj.hide_set(False);obj.select_set(True)
        tri=obj.modifiers.new('Explicit export triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name);obj.select_set(False)
        obj.data.update();color=palettes[name][min(part,len(palettes[name])-1)]
        for polygon in obj.data.polygons:
            centroid=polygon.center
            trim=name=='outfit' and obj.name=='Module_tunic_panels' and (centroid.z>1.345 and abs(centroid.x)<.125)
            face_colors.append((.44,.345,.21) if trim else color)
        material=bpy.data.materials.new(obj.name+'_linear_palette');material.diffuse_color=(*color,1);obj.data.materials.append(material)
        contact=obj.vertex_groups.new(name='CONTACT_LOCKED');free=obj.vertex_groups.new(name='FREE_DESIGN');boundary=obj.vertex_groups.new(name='BOUNDARY_LOCKED')
        bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();rim=[v.index for v in bm.verts if any(e.is_boundary for e in v.link_edges)];boundary.add(rim,1,'REPLACE');bm.free()
        ids=list(range(len(obj.data.vertices)))
        contacts=list(obj.get('contactIndices',[])) if name=='outfit' else (ids if part==0 else [])
        if contacts:contact.add(contacts,1,'REPLACE')
        frees=[i for i in ids if i not in contacts]
        if frees:free.add(frees,1,'REPLACE')
        offset=len(vertices);vertices.extend([(v.co.x,v.co.z,-v.co.y) for v in obj.data.vertices]);faces.extend([tuple(offset+i for i in p.vertices) for p in obj.data.polygons]);colors.extend([color]*len(obj.data.vertices));parts.append({'name':obj.name,'start':offset,'count':len(obj.data.vertices),'contactIndices':[offset+i for i in contacts],'rimWeightPairs':[[offset+a,offset+b] for a,b in obj.get('rimWeightPairs',[])],'contact':part==0,'boundary':[offset+i for i in rim]})
        # Native vertex groups keep the editable template bound to the imported rig.
        joint_names=data['nativeJointNames']
        groups=[]
        for joint_name in joint_names:
            blender_name=joint_name.replace('mixamorig','mixamorig:') if joint_name.startswith('mixamorig') else joint_name
            groups.append(obj.vertex_groups.get(blender_name) or obj.vertex_groups.new(name=blender_name))
        if name!='pouch':
            for vertex in obj.data.vertices:
                if name=='outfit':
                    p=(vertex.co.x,vertex.co.z,-vertex.co.y);value=authored_weights(obj.name,p,vertex.index in contacts,obj.name=='Module_tunic_panels' and vertex.index>=obj['sleeveStart']);skin_weights.append(value)
                    for joint,weight in zip(value['joints'],value['weights']):
                        if weight>0:groups[joint].add([vertex.index],weight,'REPLACE')
                    continue
                if name in ('hair','beard'):
                    groups[5].add([vertex.index],1,'REPLACE');continue
                hit,normal,triangle,distance=reference_tree.find_nearest(vertex.co)
                ids=reference['indices'][triangle*3:triangle*3+3]
                points=[Vector((reference['positions'][i*3],-reference['positions'][i*3+2],reference['positions'][i*3+1])) for i in ids]
                a,b,c=points;v0=b-a;v1=c-a;v2=hit-a;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);denom=d00*d11-d01*d01
                beta=(d11*d20-d01*d21)/denom;gamma=(d00*d21-d01*d20)/denom;bary=[1-beta-gamma,beta,gamma];sums={}
                for k,i in enumerate(ids):
                    for j in range(4):
                        joint=reference['joints'][i*4+j];sums[joint]=sums.get(joint,0)+reference['weights'][i*4+j]*bary[k]
                top=sorted(sums.items(),key=lambda item:-item[1])[:4];total=sum(weight for joint,weight in top)
                for joint,weight in top:
                    if weight>0:groups[joint].add([vertex.index],weight/total,'REPLACE')
            armature=obj.modifiers.new('Native Meshy rig; same source bind','ARMATURE');armature.object=native_armature
        obj['module']=name;obj['construction']='bilateral' if name!='pouch' else 'intentional-asymmetry';obj['recipeVersion']=1
    result[name]={'vertices':vertices,'faces':faces,'colors':colors,'parts':parts,'skinWeights':skin_weights,'faceColors':face_colors}
# One editable source and consistent orthographic cameras for every technical view.
for name,location in [('Front',(0,-4,.9)),('Back',(0,4,.9)),('Left',(4,0,.9)),('Right',(-4,0,.9))]:
    camera_data=bpy.data.cameras.new(name);camera_data.type='ORTHO';camera_data.ortho_scale=2.0;camera=bpy.data.objects.new(name,camera_data);bpy.context.collection.objects.link(camera);camera.location=location;camera.rotation_euler=(Vector((0,0,.9))-camera.location).to_track_quat('-Z','Y').to_euler()
body.hide_set(False);body.display_type='WIRE';body.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(output,'MeshyHuman_modules-v2.blend'))
json.dump(result,open(os.path.join(output,'authored-meshes.json'),'w'),separators=(',',':'))
print('MODULE_TEMPLATES_EXPORTED',[(name,len(value['faces'])) for name,value in result.items()])
