import { Box3, Color, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { worldConfig } from '../config/worldConfig';
import { splitEmissiveSurfaces } from './EmissiveSurfaces';
const registry = { spruce: 'spruce-tree', birch: 'birch-tree', boulder: 'boulder', cliff: 'fjord-cliff-rock', greatHall: 'great-hall', hut: 'turf-dwelling', storehouse: 'stabbur-storehouse', hearth: 'cooking-hearth', well: 'village-well', logs: 'log-pile', barrel: 'barrel', crate: 'storage-crate', boat: 'faering-rowboat', jetty: 'jetty-pier', heather: 'heather-shrub', grass: 'grass-tuft', fish: 'fish-drying-rack', rune: 'runestone' };
export type AssetKey = keyof typeof registry;
export class AssetManager {
    readonly windowMaterials:MeshStandardMaterial[]=[];
    readonly fireMaterials:MeshStandardMaterial[]=[];
    private models = new Map<AssetKey, Group>();
    private draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    private loader = new GLTFLoader().setDRACOLoader(this.draco);
    async load() {
        await Promise.all((Object.keys(registry) as AssetKey[]).map(async (key) => {
            const { scene } = await this.loader.loadAsync(`${import.meta.env.BASE_URL}assets/Terrain/${registry[key]}.glb`);
            // Pack nodes have centered translations: normalize actual world bounds to a grounded pivot.
            scene.updateMatrixWorld(true);
            const bounds = new Box3().setFromObject(scene), center = bounds.getCenter(new Vector3());
            scene.position.set(-center.x, -bounds.min.y, -center.z);
            const root = new Group();
            root.add(scene);
            root.updateMatrixWorld(true);
            root.traverse(node => {
                if (node instanceof Mesh) {
                    // Apply the illustrative palette once at load time; source GLBs stay untouched.
                    const colors = node.geometry.getAttribute('color');
                    if (colors) {
                        const windows=key==='greatHall'||key==='hut'||key==='storehouse';
                        const position=node.geometry.getAttribute('position'),point=new Vector3();
                        const emissive=(windows||key==='hearth')?splitEmissiveSurfaces(node,i=>{
                            const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i);
                            if(windows)return b>r*1.1&&g>r*1.05;
                            point.fromBufferAttribute(position,i).applyMatrix4(node.matrixWorld);
                            return r>.55&&r>g*1.5&&g>b*1.25&&point.y<.6;
                        }):null;
                        if(emissive)(windows?this.windowMaterials:this.fireMaterials).push(emissive);
                        const color = new Color(), neutral = new Color();
                        const palette = worldConfig.palette, treatment = worldConfig.materials;
                        const foliage = new Color(palette.foliage), roof = new Color(palette.roof);
                        const rock = new Color(palette.rock), timber = new Color(palette.timber);
                        const nature = key === 'spruce' || key === 'birch' || key === 'grass' || key === 'heather';
                        const stone = key === 'boulder' || key === 'cliff' || key === 'rune';
                        for (let i = 0; i < colors.count; i++) {
                            color.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
                            const green = color.g > color.r * 1.12 && color.g > color.b * 1.12;
                            const luminance = color.r * .2126 + color.g * .7152 + color.b * .0722;
                            neutral.setRGB(luminance, luminance, luminance);
                            color.lerp(neutral, treatment.desaturation);
                            if (stone)
                                color.lerp(rock, treatment.rockBlend);
                            else if (green)
                                color.lerp(nature ? foliage : roof, nature ? treatment.foliageBlend : treatment.roofBlend);
                            else
                                color.lerp(timber, treatment.timberBlend);
                            colors.setXYZ(i, color.r, color.g, color.b);
                        }
                        colors.needsUpdate = true;
                    }
                    node.castShadow = true;
                    node.receiveShadow = true;
                    for (const material of Array.isArray(node.material) ? node.material : [node.material])
                        if (material instanceof MeshStandardMaterial) {
                            material.roughness = 1;
                            material.metalness = 0;
                        }
                }
            });
            root.updateMatrixWorld(true);
            this.models.set(key, root);
        }));
        this.draco.dispose();
    }
    get(key: AssetKey): Object3D {
        const model = this.models.get(key);
        if (!model)
            throw new Error(`Asset not loaded: ${key}`);
        return model.clone(true);
    }
}
