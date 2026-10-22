import { Box3, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Object3D, Texture, TextureLoader, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { generatedHouseFiles } from '../config/HousingAssets';
import {natureAssetIds,NatureAssetKey} from '../config/NatureAssets';
import { worldConfig } from '../config/worldConfig';
import { splitEmissiveSurfaces } from './EmissiveSurfaces';
import { terrainModels as registry, terrainAssetPath } from '../config/TerrainAssets';
import { supportedHomeLights } from '../world/HomeLighting';
import { homeLightGeometry } from '../world/HomeLightGeometry';
export type AssetKey = keyof typeof registry | keyof typeof generatedHouseFiles | NatureAssetKey | 'tent' | 'stoneCampfire';
export interface AssetPreparationProgress {
    completed: number;
    total: number;
    resource: string;
    error?: unknown;
}
export class AssetManager {
    readonly homeLightMaps = new Map<string, Texture>();
    async loadHomeLighting() {
        const loader = new TextureLoader();
        const response = await fetch(import.meta.env.BASE_URL + 'game-assets/houses/lights/manifest.json');
        if (!response.ok) throw new Error('Home light surface manifest is missing.');
        const manifest = await response.json() as { assets: Record<string, { bindings:
            { node: string; triangleCount: number; triangles: number[] }[];
            windows: { position: number[]; outward: number[] }[] }> };
        await Promise.all(supportedHomeLights.map(async key => {
            const texture = await loader.loadAsync(import.meta.env.BASE_URL + 'game-assets/houses/lights/' + key + '.png');
            texture.flipY = false; // Same glTF UV orientation as the authored atlas.
            texture.channel = 1;
            this.homeLightMaps.set(key, texture);
            const root = this.models.get(key)!;
            if (root.userData.placeholder) return;
            root.userData.homeLightWindows = manifest.assets[key].windows;
            root.traverse(node => {
                if (!(node instanceof Mesh)) return;
                const binding = manifest.assets[key].bindings.find(entry => entry.node === node.name);
                if (!binding || (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) !== binding.triangleCount * 3)
                    throw new Error('Home light surfaces do not match ' + key + '/' + node.name);
                const original = node.geometry;
                node.geometry = homeLightGeometry(original, binding.triangles);
                original.dispose();
            });
        }));
    }
    readonly windowMaterials:MeshStandardMaterial[]=[];
    readonly fireMaterials:MeshStandardMaterial[]=[];
    private models = new Map<AssetKey, Group>();
    private draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    private loader = new GLTFLoader().setDRACOLoader(this.draco).setMeshoptDecoder(MeshoptDecoder);
    readonly diagnostics: string[] = [];
    private tolerant = false;
    async loadForSimulation(progress?: (event: AssetPreparationProgress) => void) {
        this.tolerant = true;
        await this.load(progress);
    }
    private fallback(key: AssetKey, reason: unknown) {
        this.diagnostics.push(key + ': placeholder — ' + String(reason));
        const dimensions = key.endsWith('Terrain') ? [11.5,.05,11.5] : key === 'tent' ? [1.88,1.5,2] :
            key === 'boat' ? [1.5,.8,4] : key === 'hut' || key === 'farmHut' ? [4.6,3.5,4] :
            key === 'greatHall' ? [11.2,6,8.8] : key === 'homestead' || key === 'longhouse' ? [9.6,5,6.6] : [.6,.6,.6];
        const root = new Group();
        const mesh = new Mesh(new BoxGeometry(...dimensions as [number,number,number]),
            new MeshStandardMaterial({ color: 0x9d8465, roughness: 1 }));
        mesh.position.y = dimensions[1]/2; root.add(mesh); root.name = key;
        root.userData.placeholder = true; this.models.set(key,root);
    }
    async load(progress?: (event: AssetPreparationProgress) => void) {
        let manifest: {assets: Partial<Record<keyof typeof generatedHouseFiles,{file:string}>>};
        try {
            const response = await fetch(import.meta.env.BASE_URL+'game-assets/houses/manifest.json');
            if (!response.ok) throw new Error('Generated house assets missing; run pnpm assets:houses');
            manifest = await response.json();
        } catch (error) {
            if (!this.tolerant) throw error;
            progress?.({ completed: 0, total: 0, resource: 'game-assets/houses/manifest.json', error });
            this.diagnostics.push('House manifest unavailable; registry paths use safe fallbacks.');
            manifest = { assets: Object.fromEntries(Object.entries(generatedHouseFiles).map(([key,file]) => [key,{file}])) };
        }
        const generated=Object.entries(manifest.assets).map(([key,entry])=>({key:key as AssetKey,url:import.meta.env.BASE_URL+'game-assets/houses/'+entry!.file,authored:true}));
        const scenery = (Object.keys(registry) as (keyof typeof registry)[])
            .filter(key => key !== 'hut' && key !== 'greatHall')
            .map(key => ({
                key: key as AssetKey,
                url: import.meta.env.BASE_URL + terrainAssetPath(registry[key]),
                authored: false
            }));
        const tent = { key: 'tent' as const,
            url: import.meta.env.BASE_URL + 'scenery/meshy-tent-v1/tent.glb', authored: true };
        const campfire = { key: 'stoneCampfire' as const,
            url: import.meta.env.BASE_URL + 'scenery/meshy-campfire-v1/campfire.glb', authored: true };
        const entries = [...scenery, ...generated, tent, campfire];
        let completed = 0;
        progress?.({ completed, total: entries.length, resource: '' });
        await Promise.all(entries.map(async ({key,url,authored}) => {
            let failure: unknown;
            progress?.({ completed, total: entries.length, resource: url });
            try {
                const { scene } = await this.loader.loadAsync(url);
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
                        if (colors && !authored) {
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
                            if (material instanceof MeshStandardMaterial && !authored) {
                                material.roughness = 1;
                                material.metalness = 0;
                            }
                    }
                });
                root.updateMatrixWorld(true);
                root.name=key;root.userData.authoredHousing=authored && key !== 'tent' && key !== 'stoneCampfire';
                root.userData.authoredScenery=key === 'tent' || key === 'stoneCampfire';
                this.models.set(key, root);
            } catch (error) {
                if (!this.tolerant) throw error;
                failure = error;
                this.fallback(key,error);
            } finally {
                progress?.({ completed: ++completed, total: entries.length, resource: url, error: failure });
            }
        }));
        if (this.tolerant) for (const key of Object.keys(generatedHouseFiles) as AssetKey[])
            if (!this.models.has(key)) this.fallback(key,'Missing manifest entry');
        this.draco.dispose();
    }
    async loadNature(){
        try {
            if(natureAssetIds.every(id=>this.models.has(id)))return;
            const response=await fetch(import.meta.env.BASE_URL+'nature/kaykit-v1/manifest.json');
            if(!response.ok)throw new Error('Required KayKit FREE assets missing; run asset-pipeline nature');
            const manifest=await response.json() as {assets:Record<NatureAssetKey,{file:string}>};
            let sharedMaterial:MeshStandardMaterial|undefined;
            let foliageMaterial:MeshStandardMaterial|undefined;
            for(const key of natureAssetIds){
                const entry=manifest.assets[key];if(!entry)throw new Error('Missing required KayKit role: '+key);
                const {scene}=await this.loader.loadAsync(import.meta.env.BASE_URL+'nature/kaykit-v1/'+entry.file);
                scene.updateMatrixWorld(true);const bounds=new Box3().setFromObject(scene),center=bounds.getCenter(new Vector3());
                scene.position.set(-center.x,-bounds.min.y,-center.z);const root=new Group();root.add(scene);root.name=key;
                root.traverse(node=>{if(node instanceof Mesh){
                    const materials=Array.isArray(node.material)?node.material:[node.material];
                    for(const material of materials)if(material instanceof MeshStandardMaterial){
                        // All locked selections use the identical original forest atlas/material.
                        if(!sharedMaterial)sharedMaterial=material;
                        else if(material!==sharedMaterial){material.map?.dispose();material.dispose();}
                    }
                    if(!foliageMaterial&&sharedMaterial){foliageMaterial=sharedMaterial.clone();foliageMaterial.color.set(0xb7c9b8);}
                    node.material=key.includes('rock')||key.includes('boulder')?sharedMaterial!:foliageMaterial!;node.castShadow=true;node.receiveShadow=true;
                }});root.updateMatrixWorld(true);this.models.set(key,root);
            }
        } catch (error) {
            if (!this.tolerant) throw error;
            for (const key of natureAssetIds) if (!this.models.has(key)) this.fallback(key,error);
        }
    }
    dispose(){
        for (const texture of this.homeLightMaps.values()) texture.dispose();
        this.homeLightMaps.clear();
        const geometries=new Set<import('three').BufferGeometry>(),materials=new Set<import('three').Material>(),textures=new Set<import('three').Texture>();
        for(const model of this.models.values())model.traverse(node=>{if(node instanceof Mesh){geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material]){materials.add(m);for(const value of Object.values(m))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value as import('three').Texture);}}});
        for(const resource of [...geometries,...materials,...textures])resource.dispose();this.models.clear();this.draco.dispose();
    }
    has(key: AssetKey){return this.models.has(key);}
    get(key: AssetKey): Object3D {
        const model = this.models.get(key);
        if (!model)
            throw new Error(`Asset not loaded: ${key}`);
        return model.clone(true);
    }
}
