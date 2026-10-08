import {Mesh,MeshStandardMaterial,Scene} from 'three';
/** Exposed QA inventory of the visible fixture, not a second renderer or asset treatment. */
export function auditLabScene(scene:Scene){
 const meshes:{name:string;instances:number;castShadow:boolean;receiveShadow:boolean;materials:number[]}[]=[],materials:object[]=[],ids=new Map<import('three').Material,number>();
 scene.traverseVisible(node=>{if(!(node instanceof Mesh))return;
  const refs=[];for(const m of Array.isArray(node.material)?node.material:[node.material]){
   if(!ids.has(m)){ids.set(m,materials.length);materials.push({name:m.name,type:m.type,...(m instanceof MeshStandardMaterial?{roughness:m.roughness,metalness:m.metalness,normalScale:m.normalScale.toArray(),map:m.map?.name||m.map?.image?.currentSrc||!!m.map,normalMap:m.normalMap?.name||m.normalMap?.image?.currentSrc||!!m.normalMap,roughnessMap:m.roughnessMap?.name||m.roughnessMap?.image?.currentSrc||!!m.roughnessMap,explicitEnvMap:!!m.envMap,consumesSceneEnvironment:!m.envMap}:{} )});}
   refs.push(ids.get(m)!);
  }
  meshes.push({name:node.name||node.parent?.name||'(unnamed)',instances:'isInstancedMesh' in node?(node as import('three').InstancedMesh).count:1,castShadow:node.castShadow,receiveShadow:node.receiveShadow,materials:refs});
 });return{meshes,materials};
}
