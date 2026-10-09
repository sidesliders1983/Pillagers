import {Box3,Group,Object3D,Vector3,Mesh,Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AssetManager} from '../core/AssetManager';
import {NatureAssetKey} from '../config/NatureAssets';

/** Static pinned Large preset at the existing three conifer role heights; shared by Lab and Fjordside. */
export async function loadPineModels(assets:AssetManager){
 const {scene:source}=await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'nature/ez-tree-pilot/pine-large.gltf');
 source.updateMatrixWorld(true);
 const bounds=new Box3().setFromObject(source),center=bounds.getCenter(new Vector3()),sourceHeight=bounds.getSize(new Vector3()).y;
 if(!Number.isFinite(sourceHeight)||sourceHeight<=0)throw new Error('EZ-Tree pine has invalid source bounds');
 const models=new Map<NatureAssetKey,Group>();
 for(const id of ['kaykit-conifer-a','kaykit-conifer-b','kaykit-conifer-c'] as const){
  const baseline=assets.get(id);baseline.updateMatrixWorld(true);
  const height=new Box3().setFromObject(baseline).getSize(new Vector3()).y,scale=height/sourceHeight;
  const model=source.clone(true);model.scale.multiplyScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  const root=new Group();root.name='EZ-Tree Large · '+id;root.add(model);root.updateMatrixWorld(true);models.set(id,root);
 }
 const resolve = (id:NatureAssetKey):Object3D=>{
  if(!id.includes('conifer'))return assets.get(id);
  const model=models.get(id);if(!model)throw new Error('Missing required EZ-Tree conifer role: '+id);
  return model.clone(true);
 };
 return { resolve, dispose() {
  const resources = new Set<{dispose():void}>();
  source.traverse(node => {
   if (!(node instanceof Mesh)) return;
   resources.add(node.geometry);
   for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
    resources.add(material);
    for (const value of Object.values(material)) {
     if (value && typeof value === 'object' && 'isTexture' in value) resources.add(value as Texture);
    }
   }
  });
  for (const resource of resources) resource.dispose();
 } };
}
