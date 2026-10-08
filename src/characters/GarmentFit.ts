import { Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Material, MeshStandardMaterial, Matrix4, Mesh, Quaternion, Ray, SkinnedMesh, Triangle, Uint16BufferAttribute, Vector3 } from 'three';
import { bodyZone, CharacterFitSystem } from './CharacterFitSystem';
import { ModuleMetadata, validateModule } from './AttachmentContract';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
type Segment={a:string;b:string;zone?:string};

/** The measured source frame is a coordinate calibration, not a wear fit.
 * It preserves authored topology/folds and is shared by authoring and runtime.
 */
function garmentPoseCalibration(metadata:ModuleMetadata,fit:CharacterFitSystem){
    const sourceJoints=metadata.garmentBind?.joints;
    const sourceJoint=(name:string)=>new Vector3(...(sourceJoints as Record<string,readonly [number,number,number]>)[name]);
    const canonicalJoint=(name:string)=>fit.canonicalJoints.get(name)!.clone();
    const sourceFront=sourceJoints?sourceJoint('UpperArm_L').sub(sourceJoint('UpperArm_R')).cross(sourceJoint('Neck').sub(sourceJoint('Hips'))).normalize():new Vector3(0,0,1);
    const canonicalFront=canonicalJoint('UpperArm_L').sub(canonicalJoint('UpperArm_R')).cross(canonicalJoint('Neck').sub(canonicalJoint('Hips'))).normalize();
    const frame=(axis:Vector3,hint:Vector3)=>{const y=axis.clone().normalize(),z=hint.clone().addScaledVector(y,-hint.dot(y));if(z.lengthSq()<1e-6)z.set(0,1,0).addScaledVector(y,-y.y);z.normalize();const x=y.clone().cross(z).normalize();z.copy(x).cross(y).normalize();return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));};
    const segment=(point:Vector3,a:string,b:string)=>{
        const start=sourceJoint(a),axis=sourceJoint(b).sub(start),fraction=Math.max(0,Math.min(1,point.clone().sub(start).dot(axis)/axis.lengthSq()));
        const local=point.clone().sub(start.clone().addScaledVector(axis,fraction)),target=canonicalJoint(a),targetAxis=canonicalJoint(b).sub(target);
        const rotation=b.startsWith('Toe_')?new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(targetAxis.x,targetAxis.z)-Math.atan2(axis.x,axis.z)):frame(targetAxis,canonicalFront).multiply(frame(axis,sourceFront).invert());return local.applyQuaternion(rotation).add(target.addScaledVector(targetAxis,fraction));
    };
    const smooth=(low:number,high:number,value:number)=>{const t=Math.max(0,Math.min(1,(value-low)/(high-low)));return t*t*(3-2*t);};
    const spine:Segment[]=[{a:'Hips',b:'Chest'},{a:'Chest',b:'Neck'}];
    const segments:Segment[]=[...spine,...['L','R'].flatMap(side=>[{a:'UpperArm_'+side,b:'LowerArm_'+side,zone:'UPPER_ARM_'+side},{a:'LowerArm_'+side,b:'Hand_'+side,zone:'LOWER_ARM_'+side},{a:'UpperLeg_'+side,b:'LowerLeg_'+side,zone:'UPPER_LEG_'+side},{a:'LowerLeg_'+side,b:'Foot_'+side,zone:'LOWER_LEG_'+side}])];
    const field=(point:Vector3,list:Segment[],joint:(name:string)=>Vector3,map:(point:Vector3,a:string,b:string,zone?:string)=>Vector3)=>{
        const output=new Vector3();let sum=0;
        for(const {a,b,zone} of list){const first=joint(a),axis=joint(b).sub(first),delta=point.clone().sub(first),fraction=Math.max(0,Math.min(1,delta.dot(axis)/axis.lengthSq())),distance=delta.addScaledVector(axis,-fraction).lengthSq(),weight=1/Math.pow(distance+.0025,2);output.addScaledVector(map(point,a,b,zone),weight);sum+=weight;}
        return output.divideScalar(sum);
    };
    const selectedSegments=(point:Vector3,region:string,domain?:string)=>{
        const side=point.x>=0?'L':'R';
        if(region==='footwear')return [{a:'Foot_'+side,b:'Toe_'+side,zone:'FEET'},{a:'LowerLeg_'+side,b:'Foot_'+side,zone:'LOWER_LEG_'+side}];
        // A free hem/tie belongs to the hips frame. Source leg poses must not
        // pull its outer drape into separate limb coordinate domains.
        if(region==='skirt')return [{a:'Hips',b:'Chest'}];
        return region==='mantle'||domain==='torso'?spine:segments;
    };
    const canonicalize=(point:Vector3,region:string,domain?:string)=>sourceJoints?field(point,selectedSegments(point,region,domain),sourceJoint,segment):point;
    return {sourceJoints,canonicalJoint,canonicalize,smooth,segments};
}

/** Bake only the measured source pose into the canonical rig coordinate frame.
 * Morphology, stand-off, collision and support refinement remain runtime work.
 * Materials stay immutable; every resulting geometry belongs to this group.
 */
export function calibrateGarmentSource(source:Group,metadata:ModuleMetadata,fit:CharacterFitSystem){
    validateModule(metadata);if(metadata.type!=='garment'||!metadata.garmentBind)throw new Error('Measured garment bind data is required for source calibration.');
    source.updateMatrixWorld(true);const root=new Group();root.name=metadata.id;
    const {canonicalize}=garmentPoseCalibration(metadata,fit);
    const seams=new Map<string,Array<{geometry:BufferGeometry;index:number}>>();
    source.traverse(object=>{const original=object as Mesh;if(!original.isMesh)return;
        const geometry=original.geometry.clone();geometry.applyMatrix4(original.matrixWorld);const positions=geometry.attributes.position;
        for(let i=0;i<positions.count;i++){const sourcePoint=new Vector3().fromBufferAttribute(positions,i),key=sourcePoint.toArray().map(value=>Math.round(value*1e5)).join(','),point=canonicalize(sourcePoint,original.userData.garmentRegion??'cloth',original.userData.garmentBindDomain);positions.setXYZ(i,point.x,point.y,point.z);const entries=seams.get(key)??[];entries.push({geometry,index:i});seams.set(key,entries);}
        geometry.morphAttributes={};geometry.computeVertexNormals();geometry.computeBoundingSphere();
        const mesh=new Mesh(geometry,original.material);mesh.name=original.name;mesh.userData={...original.userData};root.add(mesh);
    });
    // Semantic pose maps meet at one source point. Flat UV/normal copies and
    // adjacent cloth/boot domains must retain the same canonical seam position.
    for(const entries of seams.values()){if(entries.length<2)continue;const point=new Vector3();for(const {geometry,index} of entries)point.add(new Vector3().fromBufferAttribute(geometry.attributes.position,index));point.divideScalar(entries.length);for(const {geometry,index} of entries)geometry.attributes.position.setXYZ(index,point.x,point.y,point.z);}
    root.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh){mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}});
    root.userData.attachmentMetadata=metadata;return root;
}

/** Canonical garments retain their loose silhouette and share the body's rig.
 * Geometry is fitted once; ordinary skinning handles all following animation.
 */
export function fitGarment(source:Group,metadata:ModuleMetadata,body:SkinnedMesh,fit:CharacterFitSystem,ratio=1){
    validateModule(metadata);if(metadata.type!=='garment')throw new Error('Expected garment metadata.');
    const cage=fit.cages.get(metadata.fitCage!)!,root=new Group();root.name=metadata.id;
    source.updateMatrixWorld(true);const sourcePosition=body.geometry.attributes.position;
    type Reference={index:number;base:Vector3};type Tree={reference:Reference;axis:'x'|'y'|'z';left?:Tree;right?:Tree};
    const references:Reference[]=[];
    const uniqueReferences=new Set<string>();
    for(let i=0;i<sourcePosition.count;i++){const base=new Vector3().fromBufferAttribute(sourcePosition,i),key=base.toArray().map(v=>Math.round(v*1e6)).join(',');if(!uniqueReferences.has(key)){references.push({index:i,base});uniqueReferences.add(key);}}
    const build=(points:Reference[],depth=0):Tree|undefined=>{if(!points.length)return;const axis=(['x','y','z'] as const)[depth%3];points.sort((a,b)=>a.base[axis]-b.base[axis]);const middle=Math.floor(points.length/2);return {reference:points[middle],axis,left:build(points.slice(0,middle),depth+1),right:build(points.slice(middle+1),depth+1)};};
    const tree=build(references);
    const neighbours=(point:Vector3,count=4)=>{const found:Array<{reference:Reference;d:number}>=[];
        const visit=(node?:Tree)=>{if(!node)return;const d=node.reference.base.distanceToSquared(point);found.push({reference:node.reference,d});found.sort((a,b)=>a.d-b.d);if(found.length>count)found.pop();
            const difference=point[node.axis]-node.reference.base[node.axis],first=difference<0?node.left:node.right,second=difference<0?node.right:node.left;visit(first);if(found.length<count||difference*difference<found[found.length-1].d)visit(second);
        };visit(tree);return found;
    };
    const bindIndices=body.geometry.attributes.skinIndex,bindWeights=body.geometry.attributes.skinWeight;
    const canonicalCentre=cage.canonicalBounds.getCenter(new Vector3()),centre=cage.bounds.getCenter(new Vector3());
    const canonicalSize=cage.canonicalBounds.getSize(new Vector3()),size=cage.bounds.getSize(new Vector3());
    const envelope=new ConvexHull().setFromPoints(cage.points);
    const pelvis=fit.cages.get('PELVIS_CAGE')!,hip=body.skeleton.bones.findIndex(b=>b.name==='Hips');
    const pelvisSize=pelvis.bounds.getSize(new Vector3()),pelvisBase=pelvis.canonicalBounds.getSize(new Vector3());
    const pelvisCentre=pelvis.bounds.getCenter(new Vector3()),pelvisCanonical=pelvis.canonicalBounds.getCenter(new Vector3());
    const drapePoints=references.filter(ref=>/^(PELVIS|UPPER_LEG_|LOWER_LEG_)/.test(bodyZone(body,ref.index))).map(ref=>body.getVertexPosition(ref.index,new Vector3()));
    const drapeBounds=new Box3().setFromPoints(drapePoints),drapeEnvelope=new ConvexHull().setFromPoints(drapePoints);
    const materialCopies=new Map<Material,Material>();
    const ownedMaterial=(original:Material)=>{let copy=materialCopies.get(original);if(!copy){copy=original.clone();copy.side=DoubleSide;if((copy as MeshStandardMaterial).isMeshStandardMaterial)(copy as MeshStandardMaterial).flatShading=true;materialCopies.set(original,copy);}return copy;};
    type Surface={triangle:Triangle;vertices:number[];box:Box3;normal:Vector3};
    type SurfaceTree={box:Box3;left?:SurfaceTree;right?:SurfaceTree;faces?:Surface[]};
    const surface:Surface[]=[];const bodyIndex=body.geometry.index;
    for(let i=0;i<(bodyIndex?.count??sourcePosition.count);i+=3){const vertices=[0,1,2].map(k=>bodyIndex?bodyIndex.getX(i+k):i+k),points=vertices.map(id=>body.getVertexPosition(id,new Vector3())),triangle=new Triangle(points[0],points[1],points[2]);surface.push({triangle,vertices,box:new Box3().setFromPoints(points),normal:triangle.getNormal(new Vector3())});}
    const surfaceTree=(faces:Surface[]):SurfaceTree=>{const box=new Box3();faces.forEach(face=>box.union(face.box));if(faces.length<=8)return {box,faces};const size=box.getSize(new Vector3()),axis=size.x>size.y&&size.x>size.z?'x':size.y>size.z?'y':'z';faces.sort((a,b)=>a.box.getCenter(new Vector3())[axis]-b.box.getCenter(new Vector3())[axis]);const half=Math.floor(faces.length/2);return {box,left:surfaceTree(faces.slice(0,half)),right:surfaceTree(faces.slice(half))};};
    const collisionTree=surfaceTree(surface);
    const canonicalSurface=surface.map(face=>{const points=face.vertices.map(id=>new Vector3().fromBufferAttribute(sourcePosition,id)),triangle=new Triangle(...points as [Vector3,Vector3,Vector3]);return {triangle,vertices:face.vertices,box:new Box3().setFromPoints(points),normal:triangle.getNormal(new Vector3())};});
    // Height supplies a well-conditioned anatomy scale for source fold depth.
    // Sculpted breast/belly mass is already represented by the target anchor.
    const canonicalTree=surfaceTree(canonicalSurface),standOffScale=collisionTree.box.getSize(new Vector3()).y/Math.max(1e-8,canonicalTree.box.getSize(new Vector3()).y);
    const closestSurface=(point:Vector3,tree=collisionTree)=>{let distance=Infinity,result:Surface|undefined,closest=new Vector3();const probe=new Vector3();
        const search=(node:SurfaceTree)=>{if(node.box.distanceToPoint(point)**2>distance)return;if(node.faces){for(const face of node.faces){face.triangle.closestPointToPoint(point,probe);const d=probe.distanceToSquared(point);if(d<distance){distance=d;result=face;closest.copy(probe);}}}else{const first=node.left!.box.distanceToPoint(point)<node.right!.box.distanceToPoint(point)?node.left!:node.right!,second=first===node.left?node.right!:node.left!;search(first);search(second);}};search(tree);return {face:result!,closest,distance:Math.sqrt(distance)};
    };
    // Exact parity classifies the closed body surface without relying on face
    // normals, which can turn inward in extreme faceted shoulder morphs.
    const collisionRay=new Ray(new Vector3(),new Vector3(.371,.529,.763).normalize()),rayHit=new Vector3();
    const insideBody=(point:Vector3)=>{collisionRay.origin.copy(point);const hits:number[]=[];const search=(node:SurfaceTree)=>{if(!collisionRay.intersectsBox(node.box))return;if(node.faces){for(const face of node.faces)if(collisionRay.intersectTriangle(face.triangle.a,face.triangle.b,face.triangle.c,false,rayHit)){const d=rayHit.distanceTo(point);if(d>1e-6)hits.push(d);}}else{search(node.left!);search(node.right!);}};search(collisionTree);hits.sort((a,b)=>a-b);return hits.filter((hit,i)=>!i||hit-hits[i-1]>1e-5).length%2===1;};
    const clearSurface=(point:Vector3)=>{const hit=closestSurface(point),inside=insideBody(point);if(!inside&&hit.distance>=metadata.clearance)return point;const surfaceNormal=inside||hit.distance<1e-6,direction=surfaceNormal?hit.face.normal.clone():point.clone().sub(hit.closest).normalize();if(surfaceNormal&&insideBody(hit.closest.clone().addScaledVector(direction,metadata.clearance)))direction.negate();return point.copy(hit.closest).addScaledVector(direction,metadata.clearance);};
    const seams=new Map<string,Array<{geometry:BufferGeometry;index:number}>>();
    const sleeves=new Map<string,{hull:ConvexHull;start:Vector3;end:Vector3}>();
    // Imported figure poses are measured once in metadata. First transfer that
    // source bind frame into the shared canonical rig; morphology follows below.
    const {sourceJoints,canonicalJoint,canonicalize,smooth,segments}=garmentPoseCalibration(metadata,fit);
    // Deform against the actual canonical/morphed surface. Skeleton joints do
    // not encode every sculpted shoulder, child proportion or belly offset.
    // An exact surface anchor transports stable authored stand-off; sculpted
    // mass cannot amplify an unobserved normal derivative into a cloth sail.
    const surfaceJoints=new Map<string,Vector3>();
    const surfaceJoint=(name:string)=>{if(!surfaceJoints.has(name)){const base=canonicalJoint(name),shift=new Vector3();let sum=0;for(const {reference,d} of neighbours(base,16)){const w=1/Math.max(1e-5,d);sum+=w;shift.addScaledVector(body.getVertexPosition(reference.index,new Vector3()).sub(reference.base),w);}surfaceJoints.set(name,base.add(shift.divideScalar(sum)));}return surfaceJoints.get(name)!.clone();};
    const morphPoint=(point:Vector3,region:string)=>{
        const drape=region==='skirt'?new Vector3((point.x-pelvisCanonical.x)*pelvisSize.x/pelvisBase.x+pelvisCentre.x,point.y*pelvisCentre.y/pelvisCanonical.y,(point.z-pelvisCanonical.z)*pelvisSize.z/pelvisBase.z+pelvisCentre.z):null;
        // The attached waist shares torso transport; the lower free hem keeps
        // its hips-owned affine field. One continuous band joins both domains.
        const waist=canonicalJoint('Hips').y+(canonicalJoint('Chest').y-canonicalJoint('Hips').y)/3,drapeBlend=drape?smooth(canonicalJoint('Hips').y,waist,point.y):1;
        if(drape&&drapeBlend===0)return drape;
        // Transport source stand-off from its exact canonical surface anchor.
        // Body shape affects the barycentric anchor; it must
        // not magnify an unobserved surface-normal derivative into a cloth sail.
        const hit=closestSurface(point,canonicalTree),bary=hit.face.triangle.getBarycoord(hit.closest,new Vector3())??new Vector3(1,0,0),points=hit.face.vertices.map(id=>body.getVertexPosition(id,new Vector3()));
        const anchor=points.reduce((sum,p,i)=>sum.addScaledVector(p,bary.getComponent(i)),new Vector3()),offset=point.clone().sub(hit.closest);
        // Raw faceted normals can reverse/rotate strongly under torso sculpting.
        // Preserve the stable source-frame gap rather than rotating it by an
        // unstable individual facet or applying its mass-dependent derivative.
        const transported=anchor.addScaledVector(offset,standOffScale);return drape?drape.lerp(transported,drapeBlend):transported;
    };
    const authoredDrape:Vector3[]=[];
    source.traverse(object=>{const mesh=object as Mesh;if(!mesh.isMesh||(mesh.userData.garmentRegion!=='skirt'||mesh.userData.garmentSurface==='accessory'))return;for(let i=0;i<mesh.geometry.attributes.position.count;i++){const point=canonicalize(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld),'skirt');authoredDrape.push(morphPoint(point,'skirt'));}});
    const authoredDrapeBounds=new Box3().setFromPoints(authoredDrape),authoredDrapeEnvelope=authoredDrape.length>=4?new ConvexHull().setFromPoints(authoredDrape):null;
    const boots=new Map<string,{anchor:Vector3;current:Vector3;angle:number;scale:number}>();
    if(sourceJoints&&metadata.garmentFit==='regional')source.traverse(object=>{const mesh=object as Mesh;if(!mesh.isMesh||mesh.userData.garmentRegion!=='footwear')return;
        const all=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>canonicalize(new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld),'footwear'));
        for(const side of ['L','R']){
            const points=all.filter(p=>(p.x>=0)===(side==='L'));
            if(!points.length)continue;
            const bounds=new Box3().setFromPoints(points),sole=points.filter(p=>p.y<bounds.min.y+(bounds.max.y-bounds.min.y)*.4);
            const anchor=new Box3().setFromPoints(sole).getCenter(new Vector3()),current=new Vector3();
            const bodyPoints=references.filter(ref=>bodyZone(body,ref.index)==='FEET'&&(ref.base.x>=0)===(side==='L')).map(ref=>body.getVertexPosition(ref.index,new Vector3()));
            if(!bodyPoints.length)throw new Error('Footwear requires calibrated body foot coverage for '+side);
            const bodyBounds=new Box3().setFromPoints(bodyPoints),bodySize=bodyBounds.getSize(new Vector3()),bootSize=new Box3().setFromPoints(sole).getSize(new Vector3());
            const scale=Math.max(bodySize.x/Math.max(.001,bootSize.x),bodySize.z/Math.max(.001,bootSize.z))*1.20;
            current.copy(bodyBounds.getCenter(new Vector3()));current.y=bodyBounds.min.y+(anchor.y-bounds.min.y)*scale-metadata.clearance*.2;
            boots.set(side,{anchor,current,angle:0,scale});
        }
    });
    if(metadata.garmentFit==='regional')for(const side of ['L','R']){
        const points=references.filter(ref=>bodyZone(body,ref.index)===`UPPER_ARM_${side}`).map(ref=>body.getVertexPosition(ref.index,new Vector3()));
        const at=(name:string)=>surfaceJoint(name);
        if(points.length>=4)sleeves.set(side,{hull:new ConvexHull().setFromPoints(points),start:at(`UpperArm_${side}`),end:at(`LowerArm_${side}`)});
    }
    // Flat UV/normal exports repeat the same source point for each facet. Fit
    // one point per semantic region; UVs and authored facet topology stay intact.
    const fittedPoints=new Map<string,{point:Vector3;influences:number[][]}>();
    source.traverse(object=>{if(!(object as Mesh).isMesh)return;const original=object as Mesh,geometry:BufferGeometry=original.geometry.clone();geometry.applyMatrix4(original.matrixWorld);
        const positions=geometry.attributes.position,indices:number[]=[],weights:number[]=[];geometry.setAttribute('fitReference',new Float32BufferAttribute(Array.from(positions.array),3));
        for(let i=0;i<positions.count;i++){
            const sourcePoint=new Vector3().fromBufferAttribute(positions,i),regionName=original.userData.garmentRegion??'cloth',domain=original.userData.garmentBindDomain,cacheKey=regionName+':'+(domain??'')+':'+sourcePoint.toArray().join(','),cached=fittedPoints.get(cacheKey);
            if(cached){positions.setXYZ(i,cached.point.x,cached.point.y,cached.point.z);for(let k=0;k<4;k++){indices.push(cached.influences[k]?.[0]??0);weights.push(cached.influences[k]?.[1]??0);}if(metadata.garmentFit==='regional'){const key=sourcePoint.toArray().map(v=>Math.round(v*1e5)).join(','),entries=seams.get(key)??[];entries.push({geometry,index:i});seams.set(key,entries);}continue;}
            const p=canonicalize(sourcePoint.clone(),regionName,domain),canonical=p.clone();
            const nearest=neighbours(canonical);
            const regional=metadata.garmentFit==='regional',region=original.userData.garmentRegion,freeDrape=region==='skirt'&&original.userData.garmentSurface!=='accessory';
            if(regional){
                // Transfer a smooth displacement, retaining the authored stand-off
                // and folds. Never replace clothing vertices with body vertices.
                if(sourceJoints)p.copy(morphPoint(canonical,region));else{
                    const delta=new Vector3();let sum=0;
                    for(const {reference,d} of nearest){const w=1/Math.max(1e-6,d);sum+=w;delta.addScaledVector(body.getVertexPosition(reference.index,new Vector3()).sub(reference.base),w);}p.add(delta.divideScalar(sum));
                }
                if(region==='skirt'&&!sourceJoints){
                    // A single open skirt stays a skirt, independent of leg girth.
                    p.x=canonical.x*pelvisSize.x/Math.max(.001,pelvisBase.x);
                    p.z=(canonical.z-pelvisCanonical.z)*pelvisSize.z/Math.max(.001,pelvisBase.z)+pelvisCentre.z;
                    p.y=canonical.y*pelvisCentre.y/Math.max(.001,pelvisCanonical.y);
                }
                if(region==='footwear'&&boots.size){
                    const boot=boots.get(canonical.x>=0?'L':'R')!;
                    const sole=canonical.clone().sub(boot.anchor).multiplyScalar(boot.scale).add(boot.current),shaft=morphPoint(canonical,region);p.copy(sole).lerp(shaft,smooth(canonicalJoint('Foot_'+(canonical.x>=0?'L':'R')).y+.025,canonicalJoint('Foot_'+(canonical.x>=0?'L':'R')).y+.15,canonical.y));
                }
                if(region!=='footwear'&&!sourceJoints){
                    // Garment looseness is local to the occupied body segment.
                    // Global X scaling would move a trouser leg away from its
                    // boot and a cuff away from its arm as the ratio increases.
                    let limb:Segment|undefined,best=Infinity;
                    if(region==='cloth'&&domain!=='torso')for(const candidate of segments){const start=canonicalJoint(candidate.a),axis=canonicalJoint(candidate.b).sub(start),t=Math.max(0,Math.min(1,canonical.clone().sub(start).dot(axis)/axis.lengthSq())),d=canonical.distanceToSquared(start.addScaledVector(axis,t));if(d<best){best=d;limb=candidate;}}
                    if(limb?.zone){const start=surfaceJoint(limb.a),axis=surfaceJoint(limb.b).sub(start),t=Math.max(0,Math.min(1,p.clone().sub(start).dot(axis)/axis.lengthSq())),origin=start.addScaledVector(axis,t);p.sub(origin).multiplyScalar(Math.max(1,ratio)).add(origin);}
                    else{p.x*=Math.max(1,ratio);p.z=centre.z+(p.z-centre.z)*Math.max(1,ratio);}
                }
                if(region==='cloth'&&domain!=='torso'&&Math.abs(canonical.x)>.22&&canonical.y>1.03){
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
            // A free drape is a layer over the fitted trousers, which already
            // reserve body clearance. Retain an additional layer of stand-off.
            if(regional&&region==='skirt')p.addScaledVector(direction,metadata.clearance);
            if(regional&&freeDrape&&authoredDrapeEnvelope&&p.y>=authoredDrapeBounds.min.y&&p.y<=authoredDrapeBounds.max.y){
                // Deep inward source folds can reveal the inner leg volume even
                // when every edge is closed. Retain shallow authored faceting
                // inside the source-derived drape cage, without skin wrapping.
                const origin=new Vector3(pelvisCentre.x,p.y,pelvisCentre.z),outward=p.clone().sub(origin).normalize();let radius=Infinity;
                for(const face of authoredDrapeEnvelope.faces){const denominator=face.normal.dot(outward);if(denominator>1e-6)radius=Math.min(radius,(face.constant-face.normal.dot(origin))/denominator);}
                const minimum=radius-metadata.clearance*2;if(minimum>0&&Number.isFinite(minimum)&&p.distanceTo(origin)<minimum)p.copy(origin.addScaledVector(outward,minimum));
            }
            if(regional&&freeDrape&&p.y>=drapeBounds.min.y&&p.y<=drapeBounds.max.y){
                // One loose hem encloses both legs. Project against their shared
                // envelope instead of pushing folds into separate thigh surfaces.
                const origin=new Vector3(pelvisCentre.x,p.y,pelvisCentre.z),outward=p.clone().sub(origin).normalize();let radius=Infinity;
                for(const face of drapeEnvelope.faces){const denominator=face.normal.dot(outward);if(denominator>1e-6)radius=Math.min(radius,(face.constant-face.normal.dot(origin))/denominator);}
                if(radius>0&&Number.isFinite(radius)&&p.distanceTo(origin)<radius+metadata.clearance*2)p.copy(origin.addScaledVector(outward,radius+metadata.clearance*2));
            }
            // Measured regional clothing follows the actual local body surface.
            // A global radial torso hull erases the shoulder/neck saddle and
            // inflates sleeveless straps into lateral shelves. Retain the broad
            // envelope only for legacy modules without measured source binding.
            if((!regional||!sourceJoints)&&p.y>=cage.bounds.min.y&&p.y<=cage.bounds.max.y){
                const origin=new Vector3(centre.x,p.y,centre.z);let radius=Infinity;
                for(const face of envelope.faces){const denominator=face.normal.dot(direction);if(denominator>1e-6)radius=Math.min(radius,(face.constant-face.normal.dot(origin))/denominator);}
                const distance=p.clone().sub(origin).length();
                if(radius>0&&Number.isFinite(radius)&&distance<radius+metadata.clearance)p.copy(origin.addScaledVector(direction,radius+metadata.clearance));
            }
            if(regional&&sourceJoints){
                clearSurface(p);
                // The slider controls garment-to-body spacing. Scaling the
                // body axis itself moves collars/cuffs away from their sockets.
                // Preserve that axis and expand only the already-cleared gap.
                if(region!=='footwear'&&ratio>1){const anchor=closestSurface(p).closest;p.sub(anchor).multiplyScalar(ratio).add(anchor);}
            }
            // Four neighbouring source vertices transfer existing skin weights;
            // full garments below the pelvis follow hips, avoiding split skirts.
            const influences=new Map<number,number>();let total=0;
            const hit=regional&&sourceJoints?closestSurface(p):null;
            if(hit){const bary=hit.face.triangle.getBarycoord(hit.closest,new Vector3())??new Vector3(1,0,0);for(let corner=0;corner<3;corner++){const id=hit.face.vertices[corner],contribution=bary.getComponent(corner);total+=contribution;for(let k=0;k<4;k++){const bone=bindIndices.getComponent(id,k),weight=bindWeights.getComponent(id,k);influences.set(bone,(influences.get(bone)??0)+contribution*weight);}}}
            else for(const {reference,d} of nearest){const contribution=1/Math.max(1e-8,d);total+=contribution;
                for(let k=0;k<4;k++){const bone=bindIndices.getComponent(reference.index,k),weight=bindWeights.getComponent(reference.index,k);influences.set(bone,(influences.get(bone)??0)+contribution*weight);}
            }
            const skirt=regional?region==='skirt':(metadata.slot==='full'||metadata.slot==='over')&&canonical.y<cage.canonicalBounds.min.y;
            if(regional&&region==='cloth'&&canonical.y<canonicalJoint('Hips').y){const side=canonical.x>=0?'L':'R';for(const bone of influences.keys()){const name=body.skeleton.bones[bone].name;if(name!=='Hips'&&!['UpperLeg_'+side,'LowerLeg_'+side,'Foot_'+side].includes(name))influences.delete(bone);}total=[...influences.values()].reduce((sum,w)=>sum+w,0);if(total<1e-8){influences.set(hip,1);total=1;}}
            if(regional&&domain==='torso'){for(const bone of influences.keys())if(/Arm|Hand/.test(body.skeleton.bones[bone].name))influences.delete(bone);total=[...influences.values()].reduce((sum,w)=>sum+w,0);if(total<1e-8){influences.set(hip,1);total=1;}}
            let selected=skirt?[[hip,1]]:[...influences].map(([bone,weight])=>[bone,weight/total]).sort((a,b)=>b[1]-a[1]).slice(0,4);
            if(regional&&region==='mantle')selected=[[body.skeleton.bones.findIndex(b=>b.name==='Chest'),.7],[body.skeleton.bones.findIndex(b=>b.name==='Spine_02'),.3]];
            if(regional&&region==='footwear'){
                const side=canonical.x>=0?'L':'R',ankle=canonicalJoint('Foot_'+side),toe=canonicalJoint('Toe_'+side),knee=canonicalJoint('LowerLeg_'+side),shaft=smooth(toe.y,ankle.y+(knee.y-ankle.y)*.4,canonical.y);
                selected=[[body.skeleton.bones.findIndex(b=>b.name==='Foot_'+side),1-shaft],[body.skeleton.bones.findIndex(b=>b.name==='LowerLeg_'+side),shaft]];
            }
            const sum=selected.reduce((value,pair)=>value+pair[1],0);
            fittedPoints.set(cacheKey,{point:p.clone(),influences:selected.map(([bone,w])=>[bone,w/sum])});
            for(let k=0;k<4;k++){indices.push(selected[k]?.[0]??0);weights.push((selected[k]?.[1]??0)/sum);}
            positions.setXYZ(i,p.x,p.y,p.z);
            if(regional){const key=sourcePoint.toArray().map(v=>Math.round(v*1e5)).join(',');const entries=seams.get(key)??[];entries.push({geometry,index:i});seams.set(key,entries);}
        }
        geometry.morphAttributes={};geometry.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));geometry.computeVertexNormals();geometry.computeBoundingSphere();
        const material=Array.isArray(original.material)?original.material.map(ownedMaterial):ownedMaterial(original.material);
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
    // Unregistered contract fixtures retain their authored topology. Support
    // refinement is reserved for measured regional reference garments.
    if(metadata.garmentFit!=='regional'||!sourceJoints){root.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh){mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}});root.userData.attachmentMetadata=metadata;return root;}
    // Shared edge supports prevent T-junctions: when one coarse face needs an
    // outward midpoint, every neighbouring face receives that exact midpoint.
    type Corner={p:Vector3;ref:Vector3;uv:Vector3;influences:Map<number,number>;color?:number[]};
    const mixColor=(corners:Corner[],weights:number[])=>corners[0].color?.map((_,component)=>corners.reduce((sum,corner,index)=>sum+corner.color![component]*weights[index],0));
    const blend=(corners:Corner[]):Corner=>{const p=new Vector3(),ref=new Vector3(),uv=new Vector3(),influences=new Map<number,number>();for(const c of corners){p.add(c.p);ref.add(c.ref);uv.add(c.uv);for(const [bone,w] of c.influences)influences.set(bone,(influences.get(bone)??0)+w/corners.length);}return {p:p.divideScalar(corners.length),ref:ref.divideScalar(corners.length),uv:uv.divideScalar(corners.length),influences,color:mixColor(corners,corners.map(()=>1/corners.length))};};
    const interpolate=(corners:Corner[],weights:number[]):Corner=>{const p=new Vector3(),ref=new Vector3(),uv=new Vector3(),influences=new Map<number,number>();corners.forEach((c,i)=>{p.addScaledVector(c.p,weights[i]);ref.addScaledVector(c.ref,weights[i]);uv.addScaledVector(c.uv,weights[i]);for(const [bone,w] of c.influences)influences.set(bone,(influences.get(bone)??0)+w*weights[i]);});return {p,ref,uv,influences,color:mixColor(corners,weights)};};
    const referenceKey=(point:Vector3)=>point.toArray().map(v=>Math.round(v*1e5)).join(',');
    const edgeKey=(a:Corner,b:Corner)=>[referenceKey(a.ref),referenceKey(b.ref)].sort().join('|');
    const segmentTriangleHit=(a:Vector3,b:Vector3,triangle:Triangle)=>{const axis=b.clone().sub(a),length=axis.length(),hit=new Ray(a,axis.divideScalar(length)).intersectTriangle(triangle.a,triangle.b,triangle.c,false,new Vector3());if(!hit)return null;const fraction=hit.clone().sub(a).dot(axis)/length;return fraction>1e-6&&fraction<1-1e-6?{hit,fraction}:null;};
    const edgeBodyHits=(a:Vector3,b:Vector3)=>{const ray=new Ray(a,b.clone().sub(a).normalize()),hits:number[]=[];const search=(node:SurfaceTree)=>{if(!ray.intersectsBox(node.box))return;if(node.faces)for(const face of node.faces){const hit=segmentTriangleHit(a,b,face.triangle);if(hit)hits.push(hit.fraction);}else{search(node.left!);search(node.right!);}};search(collisionTree);return hits.sort((a,b)=>a-b);};
    const bodyEdgeHits=(triangle:Triangle)=>{const box=new Box3().setFromPoints([triangle.a,triangle.b,triangle.c]),hits:Vector3[]=[];const search=(node:SurfaceTree)=>{if(!node.box.intersectsBox(box))return;if(node.faces)for(const face of node.faces){const points=[face.triangle.a,face.triangle.b,face.triangle.c];for(let k=0;k<3;k++){const hit=segmentTriangleHit(points[k],points[(k+1)%3],triangle);if(hit)hits.push(hit.hit);}}else{search(node.left!);search(node.right!);}};search(collisionTree);return hits;};
    const edges=new Map<string,{p:Vector3;fraction:number}>(),meshFaces=new Map<SkinnedMesh,Corner[][]>();
    root.traverse(object=>{const mesh=object as SkinnedMesh;if(!mesh.isSkinnedMesh)return;const old=mesh.geometry,positions=old.attributes.position,index=old.index,refs=old.attributes.fitReference;
        const corner=(id:number):Corner=>{const influences=new Map<number,number>();for(let k=0;k<4;k++){const bone=old.attributes.skinIndex.getComponent(id,k),weight=old.attributes.skinWeight.getComponent(id,k);if(weight>0)influences.set(bone,(influences.get(bone)??0)+weight);}return {p:new Vector3().fromBufferAttribute(positions,id),ref:new Vector3().fromBufferAttribute(refs,id),uv:old.attributes.uv?new Vector3(old.attributes.uv.getX(id),old.attributes.uv.getY(id),0):new Vector3(),influences,color:old.attributes.color?Array.from({length:old.attributes.color.itemSize},(_,component)=>old.attributes.color.getComponent(id,component)):undefined};};
        const faces:Corner[][]=[];for(let i=0;i<(index?.count??positions.count);i+=3){const corners=[0,1,2].map(k=>corner(index?index.getX(i+k):i+k));faces.push(corners);for(let k=0;k<3;k++){const a=corners[k],b=corners[(k+1)%3],hits=edgeBodyHits(a.p,b.p),fraction=hits.length?(hits[0]+hits[hits.length-1])*.5:.5,mid=interpolate([a,b],[1-fraction,fraction]),cleared=clearSurface(mid.p.clone());if(hits.length||cleared.distanceToSquared(mid.p)>metadata.clearance*metadata.clearance*.64)edges.set(edgeKey(a,b),{p:cleared,fraction:referenceKey(a.ref)<referenceKey(b.ref)?fraction:1-fraction});}}meshFaces.set(mesh,faces);
    });
    for(const [mesh,faces] of meshFaces){const outputPositions:number[]=[],outputUV:number[]=[],outputRefs:number[]=[],outputBones:number[]=[],outputWeights:number[]=[],outputIndices:number[]=[],outputColors:number[]=[],colorSize=mesh.geometry.attributes.color?.itemSize;
        const append=(c:Corner)=>{const id=outputPositions.length/3;outputPositions.push(...c.p.toArray());outputRefs.push(...c.ref.toArray());outputUV.push(c.uv.x,c.uv.y);if(c.color)outputColors.push(...c.color);const selected=[...c.influences].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=selected.reduce((s,p)=>s+p[1],0);for(let k=0;k<4;k++){outputBones.push(selected[k]?.[0]??0);outputWeights.push((selected[k]?.[1]??0)/sum);}return id;};
        for(const corners of faces){const boundary:Corner[]=[];for(let k=0;k<3;k++){const a=corners[k],b=corners[(k+1)%3];boundary.push(a);const support=edges.get(edgeKey(a,b));if(support){const fraction=referenceKey(a.ref)<referenceKey(b.ref)?support.fraction:1-support.fraction,mid=interpolate([a,b],[1-fraction,fraction]);mid.p.copy(support.p);boundary.push(mid);}}
            const triangle=new Triangle(...corners.map(c=>c.p) as [Vector3,Vector3,Vector3]),hits=bodyEdgeHits(triangle),middle=hits.length?interpolate(corners,(triangle.getBarycoord(hits.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(hits.length),new Vector3())??new Vector3(1/3,1/3,1/3)).toArray()):blend(corners),cleared=clearSurface(middle.p.clone());if(!hits.length&&boundary.length===3&&cleared.distanceToSquared(middle.p)<=metadata.clearance*metadata.clearance*.64){outputIndices.push(...corners.map(append));continue;}
            middle.p.copy(cleared);const center=append(middle),ids=boundary.map(append);for(let k=0;k<ids.length;k++)outputIndices.push(ids[k],ids[(k+1)%ids.length],center);
        }
        const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(outputPositions,3));if(mesh.geometry.attributes.uv)geometry.setAttribute('uv',new Float32BufferAttribute(outputUV,2));geometry.setAttribute('fitReference',new Float32BufferAttribute(outputRefs,3));geometry.setAttribute('skinIndex',new Uint16BufferAttribute(outputBones,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(outputWeights,4));geometry.setIndex(outputIndices);if(colorSize)geometry.setAttribute('color',new Float32BufferAttribute(outputColors,colorSize));mesh.geometry.dispose();mesh.geometry=geometry;
    }
    // Newly inserted source-edge supports are shared by adjacent flat facets.
    const supports=new Map<string,Array<{geometry:BufferGeometry;index:number}>>();
    root.traverse(object=>{const mesh=object as Mesh;if(!mesh.isMesh)return;const reference=mesh.geometry.attributes.fitReference;for(let i=0;i<reference.count;i++){const key=new Vector3().fromBufferAttribute(reference,i).toArray().map(v=>Math.round(v*1e5)).join(',');const entries=supports.get(key)??[];entries.push({geometry:mesh.geometry,index:i});supports.set(key,entries);}});
    for(const entries of supports.values()){if(entries.length<2)continue;const point=new Vector3(),influences=new Map<number,number>();for(const {geometry,index} of entries){point.add(new Vector3().fromBufferAttribute(geometry.attributes.position,index));for(let k=0;k<4;k++){const bone=geometry.attributes.skinIndex.getComponent(index,k),w=geometry.attributes.skinWeight.getComponent(index,k);influences.set(bone,(influences.get(bone)??0)+w);}}point.divideScalar(entries.length);clearSurface(point);const selected=[...influences].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=selected.reduce((s,p)=>s+p[1],0);for(const {geometry,index} of entries){geometry.attributes.position.setXYZ(index,point.x,point.y,point.z);for(let k=0;k<4;k++){geometry.attributes.skinIndex.setComponent(index,k,selected[k]?.[0]??0);geometry.attributes.skinWeight.setComponent(index,k,(selected[k]?.[1]??0)/sum);}}}
    root.traverse(object=>{const mesh=object as Mesh;if(!mesh.isMesh)return;
        if(mesh.userData.garmentRegion==='footwear'){
            // The shared canonical origin is the ground plane. Outward body
            // clearance can otherwise move the sole below it; flatten that
            // underside, retaining the generated shoe outline and intact feet.
            const positions=mesh.geometry.attributes.position,index=mesh.geometry.index,kept:number[]=[],a=new Vector3(),b=new Vector3(),c=new Vector3();
            for(let i=0;i<positions.count;i++)if(positions.getY(i)<0)positions.setY(i,0);
            for(let i=0;i<(index?.count??positions.count);i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);a.fromBufferAttribute(positions,ids[0]);b.fromBufferAttribute(positions,ids[1]);c.fromBufferAttribute(positions,ids[2]);if(new Triangle(a,b,c).getArea()>1e-10)kept.push(...ids);}
            const retained=[...new Set(kept)],remap=new Map(retained.map((old,index)=>[old,index]));
            for(const [name,attribute] of Object.entries(mesh.geometry.attributes)){
                const values:number[]=[];
                for(const old of retained)for(let component=0;component<attribute.itemSize;component++)values.push(attribute.getComponent(old,component));
                mesh.geometry.setAttribute(name,name==='skinIndex'?new Uint16BufferAttribute(values,attribute.itemSize):new Float32BufferAttribute(values,attribute.itemSize,attribute.normalized));
            }
            mesh.geometry.setIndex(kept.map(old=>remap.get(old)!));
        }
        mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    });
    root.userData.attachmentMetadata=metadata;return root;
}
export function disposeGarment(group:Group){const materials=new Set<Material>();group.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]) materials.add(m as Material);}});for(const material of materials)material.dispose();group.removeFromParent();}
