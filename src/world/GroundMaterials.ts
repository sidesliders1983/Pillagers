import {ClampToEdgeWrapping,NoColorSpace,TextureLoader} from 'three';
import {groundTreatmentConfig} from '../config/GroundTreatmentConfig';

// The offline atlas already contains the world-scale repeats and transitions.
export async function loadGroundMaterials(){
 const loader=new TextureLoader(),root=import.meta.env.BASE_URL+'ground-materials/v02/';
 const [normalMap,roughnessMap]=await Promise.all([
  loader.loadAsync(root+'normal.png'),loader.loadAsync(root+'roughness.png'),
 ]);
 for(const texture of [normalMap,roughnessMap]){
  texture.colorSpace=NoColorSpace;
  texture.wrapS=texture.wrapT=ClampToEdgeWrapping;
  texture.anisotropy=4;
 }
 return {normalMap,roughnessMap,normalScale:groundTreatmentConfig.normalScale,
  dispose(){normalMap.dispose();roughnessMap.dispose();}};
}
