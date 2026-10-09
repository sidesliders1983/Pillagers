import { Camera, Group, InstancedMesh, Mesh, Vector3 } from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { WorldLighting } from '../core/WorldLighting';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { parseWorld, serializeWorld } from '../world-generation/WorldSave';
import { World } from './World';
import { surfaceHeightAt } from './Terrain';
import { walkable, randomWalkablePosition, MovementTerrain } from '../systems/MovementSystem';
import { createBlueprintSurface, createBlueprintTerrain, disposeBlueprintTerrain } from './BlueprintTerrain';
import { loadWorldGroundMaterials } from './WorldGroundMaterials';
import { loadPineModels } from './PineModels';
import { createNatureFromPlan } from './KayKitNature';
import { NatureWind } from './NatureWind';
import { FjordsideWater } from './FjordsideWater';
import { BoatFloat } from './BoatFloat';
import { placeSettlement } from './PlaceSettlement';
import { blueprintMovement } from './BlueprintMovement';
import { planWorldAttachments, attachmentClearance, WorldAttachment } from './WorldAttachments';
import { hearth } from './SettlementLayout';

export interface WorldSelection {
    mode: 'reference' | 'generated';
    blueprint?: WorldBlueprint;
    quality: 'standard' | 'low';
    anisotropy?: number;
    attachments?: WorldAttachment[];
}

/** Separate geography save: Simulation Core resources, expeditions and residents are untouched. */
export function parseFjordsideSave(text: string): WorldSelection {
    if (text.length > 8_000_000) throw new Error('World file exceeds the 8MB limit.');
    const saved = JSON.parse(text);
    // Existing Environment Lab blueprints remain importable without regeneration.
    if ('blueprint' in saved && !('mode' in saved)) {
        return { mode: 'generated',blueprint: parseWorld(text),quality: 'standard' };
    }
    if (saved.fjordsideVersion !== 1 || !['reference','generated'].includes(saved.mode) ||
        !['standard','low'].includes(saved.quality)) throw new Error('Invalid Fjordside world save.');
    const blueprint = saved.mode === 'generated' ?
        parseWorld(JSON.stringify({ schemaVersion: 1,blueprint: saved.blueprint })) : undefined;
    if (blueprint && (!Array.isArray(saved.attachments) || saved.attachments.length !== 20 ||
        saved.attachmentVersion !== 'authored-props-v1')) throw new Error('Invalid production attachment save.');
    return { mode: saved.mode,quality: saved.quality,blueprint,attachments: saved.attachments };
}

/** Production factory: consumes stored geography and never calls the generator. */
export async function createWorld(assets: AssetManager, selection: WorldSelection) {
    const blueprint = selection.mode === 'generated' ?
        parseWorld(serializeWorld(selection.blueprint!)) : undefined;
    if (selection.mode === 'generated' && !blueprint?.validation.accepted)
        throw new Error('Only a validated WorldBlueprint can be activated in Fjordside.');
    const root = new Group();
    const attachments: WorldAttachment[] = [];
    let classic: World | undefined;
    let grounds: Awaited<ReturnType<typeof loadWorldGroundMaterials>> | undefined;
    let pines: Awaited<ReturnType<typeof loadPineModels>> | undefined;
    let water: FjordsideWater | undefined;
    let wind: NatureWind | undefined;
    let floatingBoat: BoatFloat | undefined;
    let terrain: Mesh | undefined;
    let movement: MovementTerrain;
    let motion = { water: true, wind: true };
    let quality = selection.quality;
    let waterTime = 0,windTime = 0;
    const dispose = () => {
        water?.dispose();
        wind?.dispose();
        if (!classic) root.traverse(node => { if (node instanceof InstancedMesh) node.dispose(); });
        if (blueprint && terrain) disposeBlueprintTerrain(terrain);
        grounds?.dispose();
        pines?.dispose();
        classic?.dispose();
        root.removeFromParent();
        root.clear();
    };
    try {
        if (blueprint) {
            await assets.loadNature();
            grounds = await loadWorldGroundMaterials(selection.quality,selection.anisotropy);
            const surface = createBlueprintSurface(blueprint);
            terrain = createBlueprintTerrain(blueprint,grounds.materials);
            if (blueprint.config.conifers === 'ez-tree') pines = await loadPineModels(assets);
            const nature = createNatureFromPlan(assets,blueprint.placementPlan,
                blueprint.config.seed,pines?.resolve);
            wind = new NatureWind(nature,!!pines);
            attachments.push(...planWorldAttachments(assets,blueprint));
            const mooring = attachments.find(item => item.key === 'boat')!;
            water = new FjordsideWater(blueprint.waterLevel, mooring, selection.quality);
            if (selection.attachments && JSON.stringify(selection.attachments) !== JSON.stringify(attachments))
                throw new Error('Saved production attachments no longer match the locked source contract.');
            root.add(terrain,nature,water.mesh,
                placeSettlement(assets,blueprint.settlement.buildings,surface.surfaceHeightAt));
            for (const item of attachments) {
                const model = assets.get(item.key);
                model.name = item.id;
                model.position.set(item.x,item.y,item.z);
                model.rotation.y = item.rotation;
                model.scale.setScalar(item.scale);
                root.add(model);
            }
            const base = blueprintMovement(blueprint);
            const safe = (x: number,z: number) => base.walkable(x,z) && attachments.every(p =>
                attachmentClearance(x,z,p) >= .65);
            movement = { ...base,walkable: safe,randomPosition(random) {
                for (let i = 0; i < 500; i++) {
                    const point = base.randomPosition(random);
                    if (safe(point.x,point.z)) return point;
                }
                throw new Error('No safe production resident position.');
            } };
        } else {
            classic = new World(assets, selection.quality);
            terrain = classic.terrain;
            root.add(classic.root);
            movement = { heightAt: surfaceHeightAt,walkable,randomPosition: randomWalkablePosition };
        }
        floatingBoat = new BoatFloat(root.getObjectByName('boat')!);
        floatingBoat.update((water ?? classic!.water).surface, 0);
        root.name = blueprint ? 'Integrated generated Fjordside' : 'Reference Fjordside';
        const fire = attachments.find(p => p.key === 'hearth') ??
            { ...hearth,y: surfaceHeightAt(hearth.x,hearth.z) };
        const center = blueprint?.settlement.center ?? { x: 0,z: 0 };
        return {
            root,terrain,movement,blueprint,attachments,
            hearth: new Vector3(fire.x,fire.y,fire.z),
            center: new Vector3(center.x,movement.heightAt(center.x,center.z),center.z+16),
            get quality() { return quality; },
            setQuality(value: 'standard' | 'low') {
                quality = value;
                (water ?? classic!.water).surface.setQuality(value === 'low' ? 'low' : 'medium');
                floatingBoat!.update((water ?? classic!.water).surface,waterTime);
            },
            setMotion(value: typeof motion) { motion = { ...value }; },
            update(time: number,lighting?: WorldLighting,camera?: Camera) {
                if (motion.water) waterTime = time;
                if (motion.wind) windTime = time;
                classic?.update(waterTime,lighting,camera);
                water?.update(waterTime,lighting,camera);
                wind?.update(windTime);
                floatingBoat!.update((water ?? classic!.water).surface,waterTime);
            },
            exportSave() {
                return JSON.stringify({ fjordsideVersion: 1,mode: selection.mode,
                    quality,blueprint,
                    attachmentVersion: 'authored-props-v1',attachments });
            },
            describe() {
                return { mode: selection.mode,seed: blueprint?.config.seed ?? 1983,
                    quality,buildings: blueprint ? 6 : 7,
                    populationSource: 'existing-fjordside',groundTier: grounds?.tier ?? 'reference',source: blueprint?.config.conifers ?? 'reference',
                    site: { x: center.x,z: center.z },attachments: attachments.length,
                    validation: blueprint?.validation ?? null,motion,water: { ...(water ?? classic!.water).describe(), boat: floatingBoat!.describe() } };
            },
            dispose,
        };
    } catch (error) {
        dispose();
        throw error;
    }
}
