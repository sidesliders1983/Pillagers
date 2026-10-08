import {ClampToEdgeWrapping,NoColorSpace,SRGBColorSpace,TextureLoader} from 'three';
import {groundRegions,regionalGroundConfig,GroundTier} from '../config/RegionalGroundConfig';
/** Loads one quality tier at a time. Callers own disposal; partial loads are cleaned on error. */
export async function loadRegionalGroundMaterials(tier:GroundTier='standard',maxAnisotropy=1){
 const loader=new TextureLoader(),root=import.meta.env.BASE_URL+`ground-materials/v04/${tier}/`,regions=new Map(),textures:import('three').Texture[]=[];
 try{
  for(const region of groundRegions()){
   const maps:Partial<Record<'colour'|'normal'|'roughness',import('three').Texture>>={};
   for(const role of (tier==='low'?['colour','roughness']:['colour','normal','roughness']) as ('colour'|'normal'|'roughness')[]){const t=await loader.loadAsync(root+region.id+'-'+role+'.webp');textures.push(t);maps[role]=t;t.colorSpace=role==='colour'?SRGBColorSpace:NoColorSpace;t.wrapS=t.wrapT=ClampToEdgeWrapping;t.generateMipmaps=true;t.anisotropy=Math.min(regionalGroundConfig.anisotropy,maxAnisotropy);}
   regions.set(region.id,{map:maps.colour!,normalMap:maps.normal??null,roughnessMap:maps.roughness!});
  }
  return {regions,tier,dispose(){for(const t of textures)t.dispose();}};
 }catch(error){for(const t of textures)t.dispose();throw error;}
}
