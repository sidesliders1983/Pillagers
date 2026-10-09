import type { AssetPlacement } from '../world-generation/WorldBlueprint';
import {Box3,Group,InstancedMesh,Matrix4,Mesh,Object3D,Vector3} from 'three';
import {AssetManager} from '../core/AssetManager';
import {natureAssetIds,NatureAssetKey} from '../config/NatureAssets';
import {seededRandom} from '../config/worldConfig';
import {shoreAt,surfaceHeightAt} from './Terrain';
import {buildings,buildingDistance,pathWeight} from './SettlementLayout';
/** Static authored primitives, instanced with each source node's world transform intact. */
export function createNature(assets:AssetManager,seed=1983,resolveModel:(id:NatureAssetKey)=>Object3D=id=>assets.get(id)){
 const group=new Group();group.name='KayKit Forest Nature Pack 1.0 FREE';
 const random=seededRandom(seed),dummy=new Object3D(),matrix=new Matrix4();
 const centers=[[-32,24],[32,35],[-12,49],[18,52]],heights:number[]=[];
 for(const id of natureAssetIds){
  const tree=id.includes('conifer'),deciduous=id.includes('deciduous'),rock=id.includes('rock')||id.includes('boulder'),grass=id.includes('grass'),cluster=id.includes('rock-cluster');
  const requested=tree?24:deciduous?8:grass?80:cluster?6:rock?16:36,transforms:Matrix4[]=[];
  for(let i=0;i<requested;i++){
   let placed=false;
   for(let attempt=0;attempt<160;attempt++){
    const center=centers[Math.floor(random()*centers.length)],angle=random()*Math.PI*2,radius=Math.sqrt(random())*(tree?11:15);
    let x=center[0]+Math.cos(angle)*radius,z=center[1]+Math.sin(angle)*radius;
    if(rock){x=-42+random()*84;z=shoreAt(x)+.8+random()*4.2;if(i%4===0)z=12+random()*36;}
    if(grass||id.includes('bush')){x=-42+random()*84;z=shoreAt(x)+4+random()*45;const patch=.5+.5*Math.sin(x*.37+z*.18)*Math.cos(z*.31-x*.14);if(random()>patch*.55)continue;}
    const padding=tree?2:deciduous?1.4:cluster?2.8:rock?1.3:.25;
    if(Math.abs(x)>50||z>58||z<-14||Math.max(pathWeight(x,z),pathWeight(x-padding,z),pathWeight(x+padding,z),pathWeight(x,z-padding),pathWeight(x,z+padding))>.08||buildings.some(b=>buildingDistance(x,z,b)<padding))continue;
    if(!rock&&(z-shoreAt(x)<3||surfaceHeightAt(x,z)<.55))continue;
    dummy.position.set(x,surfaceHeightAt(x,z)-(rock?.12:0),z);dummy.rotation.y=random()*Math.PI*2;
    dummy.scale.setScalar(tree?.65+random()*.3:deciduous?.65:grass?.35+random()*.3:cluster?.5+random()*.35:rock?.7+random()*.55:.65+random()*.45);
    dummy.updateMatrix();transforms.push(dummy.matrix.clone());placed=true;break;
   }
   // Failed placement is skipped; never leak the last rejected point into a route/footprint.
   if(!placed)continue;
  }
  appendNatureModel(group, resolveModel(id), id, transforms, heights);
 }
 group.userData.seed=seed;group.userData.coniferHeights=heights;return group;
}

function appendNatureModel(group: Group, model: Object3D, id: NatureAssetKey,
    transforms: readonly Matrix4[], heights: number[]) {
    model.updateMatrixWorld(true);
    if (id.includes('conifer')) {
        const height = new Box3().setFromObject(model).getSize(new Vector3()).y;
        for (const transform of transforms) heights.push(height*Math.abs(transform.elements[5]));
    }
    const matrix = new Matrix4();
    model.traverse(child => {
        if (!(child instanceof Mesh)) return;
        const instances = new InstancedMesh(child.geometry, child.material, transforms.length);
        instances.name = id;
        transforms.forEach((transform, i) => instances.setMatrixAt(i,
            matrix.multiplyMatrices(transform, child.matrixWorld)));
        instances.castShadow = !id.includes('grass') && !id.includes('bush');
        instances.receiveShadow = true;
        instances.userData.seasonalFoliage = !id.includes('rock') && !id.includes('boulder') &&
            (child.material as import('three').Material).name !== 'branches';
        instances.computeBoundingSphere();
        group.add(instances);
    });
}

/** Same authored primitives and instancing path for reference and generated scenery. */
export function createNatureFromPlan(assets: AssetManager, plan: readonly AssetPlacement[],
    seed: number, resolveModel: (id: NatureAssetKey) => Object3D = id => assets.get(id)) {
    const group = new Group(), dummy = new Object3D(), heights: number[] = [];
    group.name = 'Seeded KayKit FREE placement';
    for (const id of natureAssetIds) {
        const transforms = plan.filter(p => p.assetId === id).map(p => {
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.y = p.rotation;
            dummy.scale.setScalar(p.scale);
            dummy.updateMatrix();
            return dummy.matrix.clone();
        });
        appendNatureModel(group, resolveModel(id), id, transforms, heights);
    }
    group.userData.seed = seed;
    group.userData.coniferHeights = heights;
    return group;
}
