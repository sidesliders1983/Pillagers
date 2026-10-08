import {Group,InstancedMesh,Matrix4,Mesh,Object3D} from 'three';
import {AssetManager} from '../core/AssetManager';
import {natureAssetIds,NatureAssetKey} from '../config/NatureAssets';
import {seededRandom} from '../config/worldConfig';
import {shoreAt,surfaceHeightAt} from './Terrain';
import {buildings,buildingDistance,pathWeight} from './SettlementLayout';
/** Static authored primitives, instanced with each source node's world transform intact. */
export function createNature(assets:AssetManager,seed=1983){
 const group=new Group();group.name='KayKit Forest Nature Pack 1.0 FREE';
 const random=seededRandom(seed),dummy=new Object3D(),matrix=new Matrix4();
 const centers=[[-32,24],[32,35],[-12,49],[18,52]];
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
  const model=assets.get(id as NatureAssetKey);model.updateMatrixWorld(true);
  model.traverse(child=>{if(!(child instanceof Mesh))return;
   const instances=new InstancedMesh(child.geometry,child.material,transforms.length);instances.name=id;
   transforms.forEach((transform,i)=>instances.setMatrixAt(i,matrix.multiplyMatrices(transform,child.matrixWorld)));
   instances.castShadow=tree||deciduous||rock;instances.receiveShadow=true;instances.computeBoundingSphere();group.add(instances);
  });
 }
 group.userData.seed=seed;return group;
}
