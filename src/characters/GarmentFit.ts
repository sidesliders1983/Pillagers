import { BufferGeometry, Float32BufferAttribute, Group, Material, Mesh, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import { bodyZone, CharacterFitSystem } from './CharacterFitSystem';
import { ModuleMetadata, validateModule } from './AttachmentContract';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

/** Canonical garments retain their loose silhouette and share the body's rig.
 * Geometry is fitted once; ordinary skinning handles all following animation.
 */
export function fitGarment(source:Group,metadata:ModuleMetadata,body:SkinnedMesh,fit:CharacterFitSystem,ratio=1){
    validateModule(metadata);if(metadata.type!=='garment')throw new Error('Expected garment metadata.');
    const cage=fit.cages.get(metadata.fitCage!)!,root=new Group();root.name=metadata.id;
    source.updateMatrixWorld(true);const sourcePosition=body.geometry.attributes.position;
    type Reference={index:number;base:Vector3};type Tree={reference:Reference;axis:'x'|'y'|'z';left?:Tree;right?:Tree};
    const references:Reference[]=[];
    for(let i=0;i<sourcePosition.count;i++)references.push({index:i,base:new Vector3().fromBufferAttribute(sourcePosition,i)});
    const build=(points:Reference[],depth=0):Tree|undefined=>{if(!points.length)return;const axis=(['x','y','z'] as const)[depth%3];points.sort((a,b)=>a.base[axis]-b.base[axis]);const middle=Math.floor(points.length/2);return {reference:points[middle],axis,left:build(points.slice(0,middle),depth+1),right:build(points.slice(middle+1),depth+1)};};
    const tree=build(references);
    const neighbours=(point:Vector3)=>{const found:Array<{reference:Reference;d:number}>=[];
        const visit=(node?:Tree)=>{if(!node)return;const d=node.reference.base.distanceToSquared(point);found.push({reference:node.reference,d});found.sort((a,b)=>a.d-b.d);if(found.length>4)found.pop();
            const difference=point[node.axis]-node.reference.base[node.axis],first=difference<0?node.left:node.right,second=difference<0?node.right:node.left;visit(first);if(found.length<4||difference*difference<found[found.length-1].d)visit(second);
        };visit(tree);return found;
    };
    const bindIndices=body.geometry.attributes.skinIndex,bindWeights=body.geometry.attributes.skinWeight;
    const canonicalCentre=cage.canonicalBounds.getCenter(new Vector3()),centre=cage.bounds.getCenter(new Vector3());
    const canonicalSize=cage.canonicalBounds.getSize(new Vector3()),size=cage.bounds.getSize(new Vector3());
    const envelope=new ConvexHull().setFromPoints(cage.points);
    const pelvis=fit.cages.get('PELVIS_CAGE')!,hip=body.skeleton.bones.findIndex(b=>b.name==='Hips');
    const pelvisSize=pelvis.bounds.getSize(new Vector3()),pelvisBase=pelvis.canonicalBounds.getSize(new Vector3());
    const pelvisCentre=pelvis.bounds.getCenter(new Vector3()),pelvisCanonical=pelvis.canonicalBounds.getCenter(new Vector3());
    const seams=new Map<string,Array<{geometry:BufferGeometry;index:number}>>();
    const sleeves=new Map<string,{hull:ConvexHull;start:Vector3;end:Vector3}>();
    if(metadata.garmentFit==='regional')for(const side of ['L','R']){
        const points=references.filter(ref=>bodyZone(body,ref.index)===`UPPER_ARM_${side}`).map(ref=>body.getVertexPosition(ref.index,new Vector3()));
        const at=(name:string)=>body.worldToLocal(body.skeleton.bones.find(b=>b.name===name)!.getWorldPosition(new Vector3()));
        if(points.length>=4)sleeves.set(side,{hull:new ConvexHull().setFromPoints(points),start:at(`UpperArm_${side}`),end:at(`LowerArm_${side}`)});
    }
    source.traverse(object=>{if(!(object as Mesh).isMesh)return;const original=object as Mesh,geometry:BufferGeometry=original.geometry.clone();geometry.applyMatrix4(original.matrixWorld);
        const positions=geometry.attributes.position,indices:number[]=[],weights:number[]=[];
        for(let i=0;i<positions.count;i++){
            const p=new Vector3().fromBufferAttribute(positions,i),canonical=p.clone();
            const nearest=neighbours(canonical);
            const regional=metadata.garmentFit==='regional',region=original.userData.garmentRegion;
            if(regional){
                // Transfer a smooth displacement, retaining the authored stand-off
                // and folds. Never replace clothing vertices with body vertices.
                const delta=new Vector3();let sum=0;
                for(const {reference,d} of nearest){const w=1/Math.max(1e-6,d);sum+=w;
                    delta.addScaledVector(body.getVertexPosition(reference.index,new Vector3()).sub(reference.base),w);
                }
                p.add(delta.divideScalar(sum));
                if(region==='skirt'){
                    // A single open skirt stays a skirt, independent of leg girth.
                    p.x=canonical.x*pelvisSize.x/Math.max(.001,pelvisBase.x);
                    p.z=(canonical.z-pelvisCanonical.z)*Math.max(1,pelvisSize.z/Math.max(.001,pelvisBase.z))+pelvisCentre.z;
                    p.y=canonical.y*pelvisCentre.y/Math.max(.001,pelvisCanonical.y);
                }
                if(region==='footwear'){
                    const side=canonical.x>=0?'L':'R',anchor=new Vector3(side==='L'?.21:-.21,.105,0);
                    const foot=body.skeleton.bones.find(b=>b.name===`Foot_${side}`)!;
                    const current=body.worldToLocal(foot.getWorldPosition(new Vector3()));
                    const child=body.morphTargetInfluences?.[body.morphTargetDictionary?.Child??-1]??0;
                    p.copy(canonical).sub(anchor).multiplyScalar(1-.31*child).add(current);
                }
                if(region!=='footwear'){
                    p.x*=Math.max(1,ratio);p.z=centre.z+(p.z-centre.z)*Math.max(1,ratio);
                }
                if(region==='cloth'&&Math.abs(canonical.x)>.22&&canonical.y>1.03){
                    const sleeve=sleeves.get(canonical.x>=0?'L':'R');
                    if(sleeve){const axis=sleeve.end.clone().sub(sleeve.start),t=Math.max(0,Math.min(1,p.clone().sub(sleeve.start).dot(axis)/axis.lengthSq())),origin=sleeve.start.clone().addScaledVector(axis,t),outward=p.clone().sub(origin).normalize();let radius=Infinity;
                        for(const face of sleeve.hull.faces){const denominator=face.normal.dot(outward);if(denominator>1e-6)radius=Math.min(radius,(face.constant-face.normal.dot(origin))/denominator);}
                        if(radius>0&&Number.isFinite(radius)&&p.distanceTo(origin)<radius+metadata.clearance)p.copy(origin.addScaledVector(outward,radius+metadata.clearance));
                    }
                }
            }else{
            // Axis expansion, rather than body facet copying, preserves folds and
            // the original open hem. A broad envelope accommodates belly/chest.
            p.x=(p.x-canonicalCentre.x)*(size.x/Math.max(.001,canonicalSize.x))*Math.max(1,ratio)+centre.x;
            p.z=(p.z-canonicalCentre.z)*(size.z/Math.max(.001,canonicalSize.z))*Math.max(1,ratio)+centre.z;
            p.y=(p.y-cage.canonicalBounds.min.y)*(size.y/Math.max(.001,canonicalSize.y))+cage.bounds.min.y;
            }
            const direction=new Vector3(p.x-centre.x,0,p.z-centre.z).normalize();if(!regional||region!=='footwear')p.addScaledVector(direction,metadata.clearance);
            if(p.y>=cage.bounds.min.y&&p.y<=cage.bounds.max.y&&(!regional||Math.abs(canonical.x)<.23)){
                const origin=new Vector3(centre.x,p.y,centre.z);let radius=Infinity;
                for(const face of envelope.faces){const denominator=face.normal.dot(direction);if(denominator>1e-6)radius=Math.min(radius,(face.constant-face.normal.dot(origin))/denominator);}
                const distance=p.clone().sub(origin).length();
                if(radius>0&&Number.isFinite(radius)&&distance<radius+metadata.clearance)p.copy(origin.addScaledVector(direction,radius+metadata.clearance));
            }
            // Four neighbouring source vertices transfer existing skin weights;
            // full garments below the pelvis follow hips, avoiding split skirts.
            const influences=new Map<number,number>();let total=0;
            for(const {reference,d} of nearest){const contribution=1/Math.max(1e-8,d);total+=contribution;
                for(let k=0;k<4;k++){const bone=bindIndices.getComponent(reference.index,k),weight=bindWeights.getComponent(reference.index,k);influences.set(bone,(influences.get(bone)??0)+contribution*weight);}
            }
            const skirt=regional?region==='skirt':(metadata.slot==='full'||metadata.slot==='over')&&canonical.y<cage.canonicalBounds.min.y;
            let selected=skirt?[[hip,1]]:[...influences].map(([bone,weight])=>[bone,weight/total]).sort((a,b)=>b[1]-a[1]).slice(0,4);
            if(regional&&region==='mantle')selected=[[body.skeleton.bones.findIndex(b=>b.name==='Chest'),.7],[body.skeleton.bones.findIndex(b=>b.name==='Spine_02'),.3]];
            if(regional&&region==='footwear')selected=[[body.skeleton.bones.findIndex(b=>b.name===`Foot_${canonical.x>=0?'L':'R'}`),1]];
            const sum=selected.reduce((value,pair)=>value+pair[1],0);
            for(let k=0;k<4;k++){indices.push(selected[k]?.[0]??0);weights.push((selected[k]?.[1]??0)/sum);}
            positions.setXYZ(i,p.x,p.y,p.z);
            if(regional){const key=canonical.toArray().map(v=>Math.round(v*1e5)).join(',');const entries=seams.get(key)??[];entries.push({geometry,index:i});seams.set(key,entries);}
        }
        geometry.morphAttributes={};geometry.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));geometry.computeVertexNormals();geometry.computeBoundingSphere();
        const material=Array.isArray(original.material)?original.material.map(m=>m.clone()):original.material.clone();
        const mesh=new SkinnedMesh(geometry,material);mesh.name=original.name;mesh.userData={...original.userData};mesh.frustumCulled=false;mesh.castShadow=true;mesh.bind(body.skeleton,body.bindMatrix);root.add(mesh);
    });
    // Flat-shaded exports duplicate vertices at material/region boundaries.
    // Sew coincident source points in both fit and skin weights so a skirt,
    // bodice, sleeve and boot never open cracks as their bones move.
    for(const entries of seams.values()){
        if(entries.length<2)continue;
        const point=new Vector3(),influences=new Map<number,number>();
        for(const {geometry,index} of entries){point.add(new Vector3().fromBufferAttribute(geometry.attributes.position,index));
            for(let k=0;k<4;k++){const bone=geometry.attributes.skinIndex.getComponent(index,k),weight=geometry.attributes.skinWeight.getComponent(index,k);influences.set(bone,(influences.get(bone)??0)+weight);}}
        point.divideScalar(entries.length);const selected=[...influences].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=selected.reduce((s,p)=>s+p[1],0);
        for(const {geometry,index} of entries){geometry.attributes.position.setXYZ(index,point.x,point.y,point.z);
            for(let k=0;k<4;k++){geometry.attributes.skinIndex.setComponent(index,k,selected[k]?.[0]??0);geometry.attributes.skinWeight.setComponent(index,k,(selected[k]?.[1]??0)/sum);}}
    }
    root.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh){mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}});
    root.userData.attachmentMetadata=metadata;return root;
}
export function disposeGarment(group:Group){group.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]) (m as Material).dispose();}});group.removeFromParent();}
