"""Measure the source bust's exposed head; no generation or geometry synthesis.

Run in Blender. Fits a robust sphere to exposed warm skin on the upper head,
which provides a common centre and size even when hair hides the scalp.
The measured frame is later mapped onto the fixed runtime skull.
"""
import bpy, sys, json, hashlib
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parent.parent
output=root/'scratch/appearance-head-calibration.json'
records=json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
for kind,folder,styles in [('hair','appearance-v02',['short','medium','long','tied','bun','braid']),('beard','beards-v03',['stubble','short','medium','long','split-braid','braid'])]:
    for style in styles:
        existing=records.get(f'{kind}/{style}')
        if existing and 'front' in existing:continue
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        bpy.data.orphans_purge(do_recursive=True)
        path=root/'scratch'/folder/style/'generated.glb'
        bpy.ops.import_scene.gltf(filepath=str(path))
        points=[]
        for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
            images={}
            for i,material in enumerate(obj.data.materials):
                if material and material.use_nodes:
                    node=next((n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None)
                    if node:
                        pixels=np.empty(len(node.image.pixels),dtype=np.float32)
                        node.image.pixels.foreach_get(pixels)
                        images[i]=(tuple(node.image.size),pixels,node.image.channels)
            uv=obj.data.uv_layers.active.data
            for polygon in list(obj.data.polygons)[::16]:
                centre=obj.matrix_world@polygon.center
                if centre.z<-.25 or centre.z>.40 or abs(centre.x)>.32 or abs(centre.y)>.36 or polygon.material_index not in images:continue
                size,pixels,channels=images[polygon.material_index]
                loop=polygon.loop_indices[0];u,v=uv[loop].uv
                x=max(0,min(size[0]-1,int(u*size[0])));y=max(0,min(size[1]-1,int(v*size[1])))
                r,g,b=pixels[(y*size[0]+x)*channels:(y*size[0]+x)*channels+3]
                if r>.30 and g>.12 and r>g*1.2 and r>b*1.35:
                    points.append(tuple(centre))
        skin=np.asarray(points,dtype=np.float64)
        xyz=skin[skin[:,2]>0]
        assert len(xyz)>100,(kind,style,len(xyz))
        active=xyz
        for _ in range(4):
            matrix=np.column_stack([2*active,np.ones(len(active))])
            solution=np.linalg.lstsq(matrix,np.sum(active*active,axis=1),rcond=None)[0]
            centre=solution[:3];radius=float(np.sqrt(solution[3]+np.dot(centre,centre)))
            residual=np.abs(np.linalg.norm(xyz-centre,axis=1)-radius)
            active=xyz[residual<=np.quantile(residual,.85)]
        rms=float(np.sqrt(np.mean((np.linalg.norm(active-centre,axis=1)-radius)**2)))
        if existing:
            centre=np.asarray(existing['centre']);radius=existing['radius'];rms=existing['rms']
        assert .12<radius<.45 and -.12<centre[2]<.35 and rms<.07,(kind,style,centre,radius,rms)
        # Estimate the narrow neck centre from exposed-skin cross sections.
        # A circle fit can recover its centre even if a beard hides the front.
        necks=[]
        for z in np.arange(-.24,-.035,.02):
            band=skin[np.abs(skin[:,2]-z)<.013]
            if len(band)<30:continue
            width=np.quantile(band[:,0],.95)-np.quantile(band[:,0],.05)
            if not radius*.3<width<radius*1.2:continue
            solution=np.linalg.lstsq(np.column_stack([2*band[:,:2],np.ones(len(band))]),np.sum(band[:,:2]**2,axis=1),rcond=None)[0]
            neck=solution[:2];neck_radius_squared=solution[2]+np.dot(neck,neck)
            if neck_radius_squared<=0:continue
            neck_radius=float(np.sqrt(neck_radius_squared))
            error=float(np.sqrt(np.mean((np.linalg.norm(band[:,:2]-neck,axis=1)-neck_radius)**2)))
            if .04<neck_radius<radius*.8 and error<.025 and np.max(np.abs(neck))<.2:
                necks.append((width,np.array([*neck,z]),error))
        up=np.array([0.,0.,1.]);up_method='glTF vertical; neck not sufficiently constrained'
        if necks:
            neck=np.median([item[1] for item in sorted(necks,key=lambda item:item[0])[:3]],axis=0)
            candidate=centre-neck;candidate/=np.linalg.norm(candidate)
            if candidate[2]>.94:up=candidate;up_method='measured neck-to-head axis'
        if kind=='beard':
            # The beard itself identifies the face side of an otherwise bald head.
            bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
            bpy.ops.import_scene.gltf(filepath=str(root/'scratch'/folder/style/'beard-candidate.glb'))
            face=[]
            for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
                for vertex in list(obj.data.vertices)[::8]:
                    point=np.asarray(tuple(obj.matrix_world@vertex.co))
                    vertical=np.dot(point-centre,up)
                    if -radius*1.2<vertical<radius*.35 and np.linalg.norm(point-centre)<radius*1.6:face.append(point)
            face=np.asarray(face)
        else:
            # The reference pipeline records +Y as the face side. Exposed skin
            # alone is ambiguous for short styles (the back is exposed too).
            face=np.array([centre+np.array([0.,1.,0.])]*31)
        assert len(face)>30,(kind,style,'no facial orientation samples')
        front=np.mean(face,axis=0)-centre;front-=up*np.dot(front,up)
        if np.linalg.norm(front)<=.02:
            # Short hair exposes both sides: use the protruding facial surface.
            offsets=face-centre; offsets-=np.outer(offsets@up,up)
            lengths=np.linalg.norm(offsets,axis=1)
            front=np.mean(offsets[lengths>=np.quantile(lengths,.90)],axis=0)
        assert np.linalg.norm(front)>.005,(kind,style,'ambiguous face side')
        front/=np.linalg.norm(front)
        record={'centre':centre.tolist(),'radius':radius,'rms':rms,'samples':len(active),'source':str(path),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'method':'robust upper exposed-skin sphere fit'}
        record.update(up=up.tolist(),front=front.tolist(),upMethod=up_method,frontMethod='reference beard attachment centroid' if kind=='beard' else 'source pipeline +Y, projected perpendicular to measured up')
        records[f'{kind}/{style}']=record
        output.write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
        print('HEAD_CALIBRATION',kind,style,json.dumps(record),flush=True)

assert len(records)==12 and all('front' in frame for frame in records.values())
keys=['centre','radius','up','front','sourceSha256','rms','frontMethod','upMethod']
runtime={key:{field:frame[field] for field in keys} for key,frame in records.items()}
(root/'src/character-lab/ReferenceHeadFrames.ts').write_text(
    '/** Measured original bust frames; raw Blender coordinates, before legacy fitting. */\n'
    'export const referenceHeadFrames = '+json.dumps(runtime,indent=2)+' as const;\n',encoding='utf-8')
