import {
    BufferGeometry, Float32BufferAttribute, Group, Material, Matrix4, Mesh,
    Object3D, SkinnedMesh, Vector3,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export const staticPoseExportVersion='pillagers-static-pose/1' as const;
export interface StaticPoseExportMetadata {
    snapshot: unknown;
    source: unknown;
}
export interface StaticPoseExportOptions {
    /** Review overlays can be excluded without changing the live fit/debug state. */
    excludedRoots?: readonly Object3D[];
}
export interface StaticPoseExport {
    root: Group;
    triangles: number;
    materials: number;
    dispose(): void;
}

/** JSON-only provenance: reject silent loss, cycles and non-finite numbers. */
function plainCopy(value: unknown, seen=new Set<object>()): unknown {
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Export metadata must be finite JSON.');return value;}
    if(typeof value!=='object')throw new Error('Export metadata must be plain JSON.');
    if(seen.has(value))throw new Error('Export metadata must not contain cycles.');
    seen.add(value);
    try {
        if(Array.isArray(value)){
            if(Object.keys(value).length!==value.length||Object.keys(value).some((key,i)=>key!==String(i)))throw new Error('Export metadata arrays must be dense.');
            return value.map(v=>plainCopy(v,seen));
        }
        if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new Error('Export metadata must be plain JSON.');
        return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plainCopy(v,seen)]));
    }finally{seen.delete(value);}
}
function localMatrix(object: Object3D): Matrix4 {
    return object.matrixAutoUpdate?new Matrix4().compose(object.position,object.quaternion,object.scale):object.matrix.clone();
}
function parentWorld(object: Object3D): Matrix4 {
    const chain: Object3D[]=[];for(let p=object.parent;p;p=p.parent)chain.unshift(p);
    const matrix=new Matrix4();for(const p of chain)matrix.multiply(localMatrix(p));return matrix;
}
function visible(object: Object3D): boolean {
    for(let p: Object3D|null=object;p;p=p.parent)if(!p.visible)return false;return true;
}
/**
 * Freeze actual canonical morph+skin geometry into portable facet-normal meshes.
 * The source graph, skeleton caches, shared geometry/materials and pin stay untouched.
 * Only preview-root translation is removed; canonical scale is baked exactly once.
 */
export function createStaticPoseExport(source: Group, metadata: StaticPoseExportMetadata, options: StaticPoseExportOptions={}): StaticPoseExport {
    if(!metadata||typeof metadata!=='object'||!Object.hasOwn(metadata,'snapshot')||!Object.hasOwn(metadata,'source')||Object.keys(metadata).some(k=>k!=='snapshot'&&k!=='source'))throw new Error('Static export requires snapshot and source provenance.');
    const lineage=plainCopy(metadata) as StaticPoseExportMetadata;
    const original: Object3D[]=[];source.traverse(o=>original.push(o));
    const evaluation=cloneSkeleton(source),copies: Object3D[]=[];evaluation.traverse(o=>copies.push(o));
    if(copies.length!==original.length)throw new Error('Static evaluation graph correspondence failed.');
    const exclusion=new Set(options.excludedRoots??[]);
    const excluded=(o:Object3D)=>{for(let p:Object3D|null=o;p;p=p.parent){if(exclusion.has(p))return true;if(p===source)break;}return false;};
    const parent=parentWorld(source),context=new Group();context.matrixAutoUpdate=false;context.matrix.copy(parent);
    // Remove layout translation before skeleton Float32 matrices are evaluated.
    // Baking at a displaced layout then subtracting it would introduce avoidable skin rounding.
    evaluation.position.set(0,0,0);
    if(!evaluation.matrixAutoUpdate){evaluation.matrix.elements[12]=0;evaluation.matrix.elements[13]=0;evaluation.matrix.elements[14]=0;}
    context.add(evaluation);context.updateMatrixWorld(true);
    evaluation.traverse(o=>{if((o as SkinnedMesh).isSkinnedMesh)(o as SkinnedMesh).skeleton.update();});
    const output=new Group();output.name='StaticPosedCharacter';
    output.userData={staticPoseExport:{version:staticPoseExportVersion,mode:'static-posed',editableRig:false,animations:false,metadata:lineage,normalPolicy:'unit geometric face normal after Float32 position bake',translationPolicy:'remove preview root translation only; preserve and bake canonical scale once'}};
    const ownedGeometry=new Set<BufferGeometry>(),ownedMaterials=new Map<Material,Material>();let triangles=0,disposed=false;
    const dispose=()=>{if(disposed)return;disposed=true;for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials.values())m.dispose();output.clear();};
    try {
        for(let n=0;n<copies.length;n++){
            const mesh=copies[n] as Mesh,live=original[n];
            if(!mesh.isMesh||!visible(live)||excluded(live))continue;
            if((mesh as Mesh & {isInstancedMesh?:boolean}).isInstancedMesh)throw new Error('Static character export does not support instanced meshes.');
            const geometry=mesh.geometry,position=geometry.getAttribute('position');if(!position)throw new Error('Visible mesh has no POSITION.');
            const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
            const count=geometry.index?.count??position.count,start=Math.max(0,geometry.drawRange.start),end=Math.min(count,start+geometry.drawRange.count);
            if(!Number.isInteger(start)||start%3||(!Number.isFinite(end)&&end!==Infinity)||end%3)throw new Error('Mesh draw range must contain complete triangles.');
            const groups=Array.isArray(mesh.material)?geometry.groups:[{start:0,count,materialIndex:0}];
            const positions:number[]=[],colors:number[]=[],uvs=new Map<string,number[]>(),emittedGroups:Array<{start:number;count:number;materialIndex:number}>=[],usedMaterials:Material[]=[];
            const color=geometry.getAttribute('color');
            for(const key of Object.keys(geometry.attributes))if(/^uv\d*$/.test(key))uvs.set(key,[]);
            const reflected=mesh.matrixWorld.determinant()<0;
            const at=(i:number)=>geometry.index?geometry.index.getX(i):i;
            for(const group of groups){
                const lo=Math.max(start,group.start),hi=Math.min(end,group.start+group.count),material=materials[group.materialIndex??0];
                if(!material)throw new Error('Mesh group has no material.');
                if(!material.visible||lo>=hi)continue;
                if(lo%3||hi%3)throw new Error('Material group must contain complete triangles.');
                let materialIndex=usedMaterials.indexOf(material);if(materialIndex<0){materialIndex=usedMaterials.length;usedMaterials.push(material);}
                const groupStart=positions.length/3;
                for(let t=lo;t<hi;t+=3){
                    const vertices=reflected?[at(t),at(t+2),at(t+1)]:[at(t),at(t+1),at(t+2)];
                    for(const i of vertices){
                        const point=mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld);
                        if(!point.toArray().every(Number.isFinite))throw new Error('Posed triangle has non-finite positions.');
                        positions.push(point.x,point.y,point.z);
                        if(color)for(let k=0;k<color.itemSize;k++)colors.push(color.getComponent(i,k));
                        for(const[key,array]of uvs){const attribute=geometry.getAttribute(key);for(let k=0;k<attribute.itemSize;k++)array.push(attribute.getComponent(i,k));}
                    }triangles++;
                }
                emittedGroups.push({start:groupStart,count:positions.length/3-groupStart,materialIndex});
            }
            if(!positions.length)continue;
            const baked=new Float32BufferAttribute(positions,3),normal=new Float32Array(positions.length);
            for(let t=0;t<baked.count;t+=3){
                const a=new Vector3().fromBufferAttribute(baked,t),b=new Vector3().fromBufferAttribute(baked,t+1),c=new Vector3().fromBufferAttribute(baked,t+2),face=b.sub(a).cross(c.sub(a));
                if(!Number.isFinite(face.lengthSq())||face.lengthSq()===0)throw new Error('Posed triangle degenerates after Float32 baking.');
                face.normalize();for(let k=0;k<3;k++)normal.set(face.toArray(),(t+k)*3);
            }
            const result=new BufferGeometry();ownedGeometry.add(result);result.setAttribute('position',baked);result.setAttribute('normal',new Float32BufferAttribute(normal,3));
            if(color)result.setAttribute('color',new Float32BufferAttribute(colors,color.itemSize));
            for(const[key,array]of uvs)result.setAttribute(key,new Float32BufferAttribute(array,geometry.getAttribute(key).itemSize));
            for(const g of emittedGroups)result.addGroup(g.start,g.count,g.materialIndex);
            const clonedMaterials=usedMaterials.map(material=>{
                let copy=ownedMaterials.get(material);if(!copy){copy=material.clone();if('flatShading'in copy)(copy as Material & {flatShading:boolean}).flatShading=false;ownedMaterials.set(material,copy);}return copy;
            });
            const emitted=new Mesh(result,clonedMaterials.length===1?clonedMaterials[0]:clonedMaterials);
            emitted.name=mesh.name;emitted.castShadow=mesh.castShadow;emitted.receiveShadow=mesh.receiveShadow;
            emitted.userData={staticPoseExport:{sourceMeshName:mesh.name,triangles:result.getAttribute('position').count/3,reflectedTransformWindingCorrected:reflected}};
            output.add(emitted);
        }
        if(!triangles)throw new Error('No visible character triangles to export.');
        output.userData.staticPoseExport.triangles=triangles;output.userData.staticPoseExport.materials=ownedMaterials.size;
        return {root:output,triangles,materials:ownedMaterials.size,dispose};
    }catch(error){dispose();throw error;}
}
