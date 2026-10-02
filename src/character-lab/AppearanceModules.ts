import { BufferGeometry, Float32BufferAttribute, Group, Material, Mesh, MeshStandardMaterial, Vector3, SkinnedMesh } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { CharacterAppearance } from '../characters/CharacterAppearance';
import { AppearanceFit } from '../characters/CharacterDNA';
import { referenceHeadMapper } from './ReferenceHeadFit';
import { referenceHeadFrames } from './ReferenceHeadFrames';
import { appearanceMetadata, CageName, FitVolume, ModuleMetadata } from '../characters/AttachmentContract';

// A triangle can cut through a faceted skull even when its three vertices are
// outside it. Check its surface too, retaining the generated topology.
function clearSkullTriangles(mesh:Mesh,hull:ConvexHull,minY:number,clearance:number,maxY=Infinity){
    const positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
    const count=index?.count??positions.count;
    const samples:number[][]=[];
    for(let a=0;a<=6;a++)for(let b=0;b<=6-a;b++)samples.push([a/6,b/6,(6-a-b)/6]);
    // Flat normals/UV seams duplicate vertices in GLB. Move coincident copies
    // together, otherwise the fit operation tears adjacent hair triangles apart.
    const groups=new Map<string,number[]>(),shared:number[][]=[];
    for(let i=0;i<positions.count;i++){
        const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(v=>Math.round(v*1e7)).join(',');
        let ids=groups.get(key);if(!ids){ids=[];groups.set(key,ids);}ids.push(i);shared[i]=ids;
    }
    for(let pass=0;pass<12;pass++){
        let changed=false;
        for(let triangle=0;triangle<count;triangle+=3){
            const ids=[0,1,2].map(k=>index?index.getX(triangle+k):triangle+k);
            const points=ids.map(id=>new Vector3().fromBufferAttribute(positions,id));
            let deficit=0;
            for(const weights of samples){
                const p=new Vector3();points.forEach((v,k)=>p.addScaledVector(v,weights[k]));
                if(p.y<minY||p.y>maxY||p.length()<1e-8)continue;
                const direction=p.clone().normalize();let radius=Infinity;
                for(const face of hull.faces){const d=face.normal.dot(direction);if(d>1e-6)radius=Math.min(radius,face.constant/d);}
                if(Number.isFinite(radius))deficit=Math.max(deficit,radius+clearance-p.length());
            }
            if(deficit>.0001){changed=true;points.forEach((p,k)=>{p.addScaledVector(p.clone().normalize(),deficit*1.15);for(const id of shared[ids[k]])positions.setXYZ(id,p.x,p.y,p.z);});}
        }
        if(!changed)break;
    }
}

// Retessellate the reference stubble before wrapping it onto the fixed skull.
// Large flat source faces otherwise disappear inside the head between vertices.
function subdivideSurface(mesh:Mesh,passes:number){
    let geometry=mesh.geometry.toNonIndexed();
    for(let pass=0;pass<passes;pass++){
        const p=geometry.attributes.position,vertices:number[]=[];
        for(let i=0;i<p.count;i+=3){
            const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),c=new Vector3().fromBufferAttribute(p,i+2);
            const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);
            for(const v of [a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca])vertices.push(v.x,v.y,v.z);
        }
        geometry.dispose();geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
    }
    mesh.geometry.dispose();mesh.geometry=geometry;
}

/** Reference-generated geometry only. An unavailable module stays absent. */
export function appearanceModules(profile:CharacterAppearance,size:Vector3,lod:number,fit:AppearanceFit={hair:1,beard:1,clothing:1},source:Group|null=null,skull:Vector3[]=[],beardSource:Group|null=null,metadataOverride?:ModuleMetadata,volumes?:ReadonlyMap<CageName,FitVolume>){
    const canonicalMap=(metadata:ModuleMetadata)=>(p:Vector3)=>p.multiply(size.clone().divide(new Vector3(...(metadata.canonicalHeadSize??[.1992,.2397,.2189]))));
    const group=new Group();group.name='Appearance';group.userData.appearance=profile;group.userData.appearanceFit=fit;
    group.userData.coordinateFrame={origin:'fixed skull bounding-box centre',front:'+Z',up:'+Y',attachment:'Head'};
    group.userData.hairAsset=source?'reference-generated':'pending';
    group.userData.beardAsset=profile.beardStyle==='none'?'not-applicable':beardSource?'reference-generated':'pending';
    if(beardSource&&profile.beardStyle!=='none'){
        const metadata=metadataOverride??appearanceMetadata('beard',profile.beardStyle);
        const beard=beardSource.clone(true);beard.name='GeneratedBeard';beard.updateMatrixWorld(true);
        beard.userData.referenceHeadFrame=referenceHeadFrames[`beard/${profile.beardStyle}`];
        const reference=new Vector3(.1992,.2397,.2189);
        const scale=Math.max(size.x/reference.x,size.y/reference.y,size.z/reference.z);
        const map=metadata.authoringFrame==='canonical'?canonicalMap(metadata):referenceHeadMapper('beard',metadata.sourceStyle??profile.beardStyle,size);
        const faceVolume=volumes?.get(metadata.fitCage??'LOWER_FACE_CAGE');
        const jawWidth=faceVolume?faceVolume.bounds.getSize(new Vector3()).x/Math.max(.001,faceVolume.canonicalBounds.getSize(new Vector3()).x):1;
        const jawHull=skull.length>=4?new ConvexHull().setFromPoints(skull):null;
        beard.traverse(object=>{
            if(!(object as Mesh).isMesh)return;
            const mesh=object as Mesh;mesh.geometry=mesh.geometry.clone();
            mesh.geometry.applyMatrix4(mesh.matrixWorld);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);
            if(metadata.subdivisions)subdivideSurface(mesh,metadata.subdivisions);
            // Scale around the jaw attachment, keeping the upper edge in place.
            const position=mesh.geometry.attributes.position,anchor=new Vector3(0,-.045,.065).multiplyScalar(scale);
            for(let i=0;i<position.count;i++){
                const p=map(new Vector3().fromBufferAttribute(position,i));
                p.x*=jawWidth;
                // Keep cheek/sideburn attachment against the actual fixed head.
                // Only fit existing vertices; the generated beard silhouette below
                // the jaw remains intact.
                if(jawHull&&p.y>(metadata.attachmentBand?(metadata.attachmentBand.minimumY??-Infinity):-.32)*size.y&&p.y<(metadata.attachmentBand?.maximumY??Infinity)*size.y){
                    const direction=p.clone().normalize();let radius=Infinity;
                    for(const face of jawHull.faces){const denominator=face.normal.dot(direction);if(denominator>1e-6)radius=Math.min(radius,face.constant/denominator);}
                    if(Number.isFinite(radius))p.copy(direction.multiplyScalar(radius+metadata.clearance));
                }
                // The size slider grows the free beard, not its cheek attachments.
                const t=metadata.attachmentBand?.minimumY===null?0:Math.max(0,Math.min(1,(-.045*scale-p.y)/(.10*scale))),growth=1+(fit.beard-1)*t*t*(3-2*t);
                p.sub(anchor).multiplyScalar(growth).add(anchor);position.setXYZ(i,p.x,p.y,p.z);
            }
            mesh.material=new MeshStandardMaterial({color:profile.color,roughness:1,flatShading:true});
            mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();mesh.castShadow=true;
        });
        group.add(beard);
    }
    if(!source)return group;
    const hair=source.clone(true);hair.name='GeneratedHair';hair.updateMatrixWorld(true);
    const metadata=metadataOverride??appearanceMetadata('hair',profile.hairStyle);
    const minimumY=(metadata.attachmentBand?(metadata.attachmentBand.minimumY??-Infinity):-.45)*size.y,maximumY=(metadata.attachmentBand?.maximumY??Infinity)*size.y;
    hair.userData.referenceHeadFrame=referenceHeadFrames[`hair/${profile.hairStyle}`];
    const map=metadata.authoringFrame==='canonical'?canonicalMap(metadata):referenceHeadMapper('hair',metadata.sourceStyle??profile.hairStyle,size);
    const hull=skull.length>=4?new ConvexHull().setFromPoints(skull):null;
    const clearance=Math.min(size.x,size.y,size.z)*.5*(fit.hair-1);
    hair.traverse(object=>{
        if(!(object as Mesh).isMesh)return;
        const mesh=object as Mesh;mesh.geometry=mesh.geometry.clone();
        mesh.material=new MeshStandardMaterial({color:profile.color,roughness:1,flatShading:true});
        // Bake imported transforms into owned geometry before fitting, so LODs
        // and exported GLBs share the same coordinate frame.
        mesh.geometry.applyMatrix4(mesh.matrixWorld);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);
        const positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++){
            const p=map(new Vector3().fromBufferAttribute(positions,i)),direction=p.clone().normalize();
            if(hull&&p.y>minimumY&&p.y<maximumY){
                let radius=Infinity;
                for(const face of hull.faces){const denominator=face.normal.dot(direction);if(denominator>1e-6)radius=Math.min(radius,face.constant/denominator);}
                if(Number.isFinite(radius)&&p.length()<radius+.003)p.copy(direction.multiplyScalar(radius+.003));
            }
            p.addScaledVector(p.clone().normalize(),clearance);positions.setXYZ(i,p.x,p.y,p.z);
        }
        if(hull)clearSkullTriangles(mesh,hull,minimumY,metadata.clearance+clearance,maximumY);
        if(metadata.trim){
            // The generated bust left a small central chin fragment in the hair
            // extraction. Keep the side locks and the back of the hairstyle.
            const index=mesh.geometry.index,kept:number[]=[],count=index?.count??positions.count;
            for(let i=0;i<count;i+=3){
                const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),centre=new Vector3();
                for(const id of ids)centre.add(new Vector3().fromBufferAttribute(positions,id));centre.multiplyScalar(1/3);
                const coordinates=[centre.x/size.x,centre.y/size.y,centre.z/size.z];
                if(coordinates.every((value,k)=>value>(metadata.trim!.min[k]??-Infinity)&&value<(metadata.trim!.max[k]??Infinity)))continue;
                kept.push(...ids);
            }
            mesh.geometry.setIndex(kept);
        }
        mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();mesh.castShadow=true;
    });
    group.add(hair);return group;
}

/** A simple waist wrap proves a separate garment can share skinning and morphs. */
export function clothingLayer(body:SkinnedMesh,ratio=1){
    const source=body.geometry,position=source.attributes.position,index=source.index;
    if(!index||!source.attributes.skinIndex)return null;
    const triangles:number[]=[];
    for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
        if(ids.every(v=>position.getY(v)>.83&&position.getY(v)<1.04&&Math.abs(position.getX(v))<.30))triangles.push(...ids);
    }
    if(!triangles.length)return null;
    const geometry=source.clone();geometry.setIndex(triangles);
    const p=geometry.attributes.position;
    const width=1.035*ratio;
    for(let i=0;i<p.count;i++){p.setX(i,p.getX(i)*width);p.setZ(i,p.getZ(i)*width);}
    // Inflate relative morph deltas too, so the wrap follows a growing belly.
    for(const attribute of geometry.morphAttributes.position??[])for(let i=0;i<attribute.count;i++){attribute.setX(i,attribute.getX(i)*width);attribute.setZ(i,attribute.getZ(i)*width);}
    const garment=new SkinnedMesh(geometry,new MeshStandardMaterial({color:'#71634e',roughness:1,flatShading:true}));
    garment.name='ClothingWaistWrap';garment.bind(body.skeleton,body.bindMatrix);garment.morphTargetInfluences=body.morphTargetInfluences?.slice();garment.morphTargetDictionary=body.morphTargetDictionary;
    garment.frustumCulled=false;garment.castShadow=true;return garment;
}

export function disposeModules(group:Group){
    const materials=new Set<Material>();
    group.traverse(o=>{if((o as Mesh).isMesh){const mesh=o as Mesh;mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m as MeshStandardMaterial);}});
    for(const material of materials)material.dispose();group.removeFromParent();
}
