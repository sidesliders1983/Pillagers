import { BufferGeometry, Float32BufferAttribute, Group, Material, Mesh, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import { CharacterFitSystem } from './CharacterFitSystem';
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
    source.traverse(object=>{if(!(object as Mesh).isMesh)return;const original=object as Mesh,geometry:BufferGeometry=original.geometry.clone();geometry.applyMatrix4(original.matrixWorld);
        const positions=geometry.attributes.position,indices:number[]=[],weights:number[]=[];
        for(let i=0;i<positions.count;i++){
            const p=new Vector3().fromBufferAttribute(positions,i),canonical=p.clone();
            // Axis expansion, rather than body facet copying, preserves folds and
            // the original open hem. A broad envelope accommodates belly/chest.
            p.x=(p.x-canonicalCentre.x)*(size.x/Math.max(.001,canonicalSize.x))*Math.max(1,ratio)+centre.x;
            p.z=(p.z-canonicalCentre.z)*(size.z/Math.max(.001,canonicalSize.z))*Math.max(1,ratio)+centre.z;
            p.y=(p.y-cage.canonicalBounds.min.y)*(size.y/Math.max(.001,canonicalSize.y))+cage.bounds.min.y;
            const direction=new Vector3(p.x-centre.x,0,p.z-centre.z).normalize();p.addScaledVector(direction,metadata.clearance);
            if(p.y>=cage.bounds.min.y&&p.y<=cage.bounds.max.y){
                const origin=new Vector3(centre.x,p.y,centre.z);let radius=Infinity;
                for(const face of envelope.faces){const denominator=face.normal.dot(direction);if(denominator>1e-6)radius=Math.min(radius,(face.constant-face.normal.dot(origin))/denominator);}
                const distance=p.clone().sub(origin).length();
                if(radius>0&&Number.isFinite(radius)&&distance<radius+metadata.clearance)p.copy(origin.addScaledVector(direction,radius+metadata.clearance));
            }
            // Four neighbouring source vertices transfer existing skin weights;
            // full garments below the pelvis follow hips, avoiding split skirts.
            const nearest=neighbours(canonical);
            const influences=new Map<number,number>();let total=0;
            for(const {reference,d} of nearest){const contribution=1/Math.max(1e-8,d);total+=contribution;
                for(let k=0;k<4;k++){const bone=bindIndices.getComponent(reference.index,k),weight=bindWeights.getComponent(reference.index,k);influences.set(bone,(influences.get(bone)??0)+contribution*weight);}
            }
            const hip=body.skeleton.bones.findIndex(b=>b.name==='Hips');
            const skirt=(metadata.slot==='full'||metadata.slot==='over')&&canonical.y<cage.canonicalBounds.min.y;
            const selected=skirt?[[hip,1]]:[...influences].map(([bone,weight])=>[bone,weight/total]).sort((a,b)=>b[1]-a[1]).slice(0,4);
            const sum=selected.reduce((value,pair)=>value+pair[1],0);
            for(let k=0;k<4;k++){indices.push(selected[k]?.[0]??0);weights.push((selected[k]?.[1]??0)/sum);}
            positions.setXYZ(i,p.x,p.y,p.z);
        }
        geometry.morphAttributes={};geometry.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));geometry.computeVertexNormals();geometry.computeBoundingSphere();
        const material=Array.isArray(original.material)?original.material.map(m=>m.clone()):original.material.clone();
        const mesh=new SkinnedMesh(geometry,material);mesh.name=original.name;mesh.frustumCulled=false;mesh.castShadow=true;mesh.bind(body.skeleton,body.bindMatrix);root.add(mesh);
    });
    root.userData.attachmentMetadata=metadata;return root;
}
export function disposeGarment(group:Group){group.traverse(object=>{const mesh=object as Mesh;if(mesh.isMesh){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]) (m as Material).dispose();}});group.removeFromParent();}
