import { Camera, Group, InstancedMesh, Mesh, Vector3 } from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { WorldLighting } from '../core/WorldLighting';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { parseWorld, serializeWorld } from '../world-generation/WorldSave';
import { World } from './World';
import { surfaceHeightAt } from './Terrain';
import { walkable, randomWalkablePosition, MovementTerrain } from '../systems/MovementSystem';
import { createBlueprintSurface, createBlueprintTerrain, disposeBlueprintTerrain, updateBlueprintWear } from './BlueprintTerrain';
import { loadWorldGroundMaterials } from './WorldGroundMaterials';
import { loadPineModels } from './PineModels';
import { createNatureFromPlan } from './KayKitNature';
import { NatureWind } from './NatureWind';
import { FjordsideWater } from './FjordsideWater';
import { BoatFloat } from './BoatFloat';
import { placeSettlement } from './PlaceSettlement';
import { blueprintMovement } from './BlueprintMovement';
import { planWorldAttachments, planReferenceTent, attachmentClearance, initialTentFootprint, WorldAttachment } from './WorldAttachments';
import { hearth } from './SettlementLayout';
import { tentBuildingPlot, clearBuildingPlotNature, BuildingPlot } from './BuildingPlot';

export interface WorldSelection {
    mode: 'reference' | 'generated';
    settlement?: 'prototype' | 'canonical';
    blueprint?: WorldBlueprint;
    quality: 'standard' | 'low';
    anisotropy?: number;
    attachments?: WorldAttachment[];
    attachmentVersion?: 'authored-props-v1' | 'authored-props-v2' | 'authored-props-v3' | 'authored-props-v4';
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
    const version = saved.attachmentVersion;
    if (version !== undefined && !['authored-props-v1','authored-props-v2','authored-props-v3','authored-props-v4'].includes(version))
        throw new Error('Invalid production attachment version.');
    if (blueprint) {
        const expected = version === 'authored-props-v1' ? 20 : 21;
        if (!version || !Array.isArray(saved.attachments) || saved.attachments.length !== expected)
            throw new Error('Invalid production attachment save.');
    } else if (saved.attachments !== undefined) {
        const expected = version === 'authored-props-v1' ? 0 : 1;
        if (!version || !Array.isArray(saved.attachments) || saved.attachments.length !== expected)
            throw new Error('Invalid reference attachment save.');
    }
    return { mode: saved.mode,quality: saved.quality,blueprint,
        attachments: saved.attachments,attachmentVersion: version };
}

/** Production factory: consumes stored geography and never calls the generator. */
export async function createWorld(assets: AssetManager, selection: WorldSelection) {
    const blueprint = selection.mode === 'generated' ?
        parseWorld(serializeWorld(selection.blueprint!)) : undefined;
    if (selection.mode === 'generated' && !blueprint?.validation.accepted)
        throw new Error('Only a validated WorldBlueprint can be activated in Fjordside.');
    const attachmentVersion = selection.attachmentVersion === 'authored-props-v1' ?
        'authored-props-v1' : 'authored-props-v4';
    const canonical = selection.settlement === 'canonical';
    const includeTent = !canonical && attachmentVersion !== 'authored-props-v1';
    const root = new Group();
    const attachments: WorldAttachment[] = [];
    let tentPlot: (BuildingPlot & ReturnType<typeof clearBuildingPlotNature>) | null = null;
    const validateAttachments = (plans: readonly WorldAttachment[][]) => {
        if (!selection.attachments) return;
        const saved = JSON.stringify(selection.attachments);
        if (!plans.some(expected => JSON.stringify(expected) === saved))
            throw new Error('Saved production attachments no longer match the locked source contract.');
    };
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
            try { grounds = await loadWorldGroundMaterials(selection.quality,selection.anisotropy); }
            catch (error) {
                if (!canonical) throw error;
                assets.diagnostics.push('Ground maps unavailable; native terrain material fallback.');
            }
            const surface = createBlueprintSurface(blueprint);
            terrain = createBlueprintTerrain(blueprint,grounds?.materials,'none',
                canonical ? blueprint.terrain.heights.map(() => 0) : undefined);
            if (blueprint.config.conifers === 'ez-tree') {
                try { pines = await loadPineModels(assets); }
                catch (error) { if (!canonical) throw error;
                    assets.diagnostics.push('EZ-Tree unavailable; existing KayKit conifer fallback.'); }
            }
            const nature = createNatureFromPlan(assets,blueprint.placementPlan,
                blueprint.config.seed,pines?.resolve);
            root.add(nature); // Own instance buffers even if a required plot cannot be placed.
            try { attachments.push(...planWorldAttachments(assets,blueprint,includeTent)); }
            catch (error) {
                if (!canonical) throw error;
                assets.diagnostics.push('Source attachment fit unavailable; only the coastal mooring placeholder remains. '+String(error));
                const harbor=blueprint.settlement.harbor!;
                const shore=blueprint.coast.map(s=>({x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2})).sort((a,b)=>
                    Math.hypot(a.x-harbor.x,a.z-harbor.z)-Math.hypot(b.x-harbor.x,b.z-harbor.z))[0];
                const direction=new Vector3(shore.x-harbor.x,0,shore.z-harbor.z).normalize();
                attachments.push({id:'boat',key:'boat',x:shore.x+direction.x*6,z:shore.z+direction.z*6,
                    y:blueprint.waterLevel+.15,rotation:Math.atan2(direction.x,direction.z),
                    scale:1,halfWidth:.75,halfDepth:2,support:'marine'});
            }
            const mooring = attachments.find(item => item.key === 'boat')!;
            water = new FjordsideWater(blueprint.waterLevel, mooring, selection.quality);
            if (selection.attachmentVersion === 'authored-props-v2') {
                validateAttachments([planWorldAttachments(assets,blueprint,true,initialTentFootprint,false)]);
            } else if (selection.attachmentVersion === 'authored-props-v3') {
                const previous = planWorldAttachments(assets,blueprint,true,initialTentFootprint,false);
                const compact = attachments.find(item => item.key === 'tent')!;
                validateAttachments([planWorldAttachments(assets,blueprint,true,undefined,false),
                    previous.map(item => item.key === 'tent' ? { ...item,
                        halfWidth: compact.halfWidth,halfDepth: compact.halfDepth } : item)]);
            } else validateAttachments([attachments]);
            if (includeTent) {
                const tent = attachments.find(item => item.key === 'tent')!;
                const plot = tentBuildingPlot(assets,tent.x,tent.z);
                tentPlot = { ...plot,...clearBuildingPlotNature(nature,plot) };
            }
            wind = new NatureWind(nature,!!pines);
            root.add(terrain,nature,water.mesh);
            if (!canonical) root.add(placeSettlement(assets,blueprint.settlement.buildings,surface.surfaceHeightAt));
            for (const item of attachments) {
                if (canonical && item.key !== 'jetty' && item.key !== 'cliff') continue;
                const model = assets.get(item.key);
                model.name = item.id;
                model.position.set(item.x,item.y,item.z);
                model.rotation.y = item.rotation;
                model.scale.setScalar(item.scale);
                root.add(model);
            }
            movement = blueprintMovement(blueprint);
        } else {
            classic = new World(assets, selection.quality);
            terrain = classic.terrain;
            root.add(classic.root);
            movement = { heightAt: surfaceHeightAt,walkable,randomPosition: randomWalkablePosition };
            if (includeTent) {
                const tent = planReferenceTent(assets,classic);
                attachments.push(tent);
                if (selection.attachmentVersion === 'authored-props-v2' ||
                    selection.attachmentVersion === 'authored-props-v3') {
                    const previous = { ...tent,x: 9,z: 17,y: surfaceHeightAt(9,17) };
                    validateAttachments([[selection.attachmentVersion === 'authored-props-v2' ?
                        { ...previous,...initialTentFootprint } : previous]]);
                } else validateAttachments([attachments]);
                const plot = tentBuildingPlot(assets,tent.x,tent.z);
                tentPlot = { ...plot,...clearBuildingPlotNature(classic.root.getObjectByName('Scenery')!,plot) };
                const model = assets.get('tent');
                model.position.set(tent.x,tent.y,tent.z);
                model.rotation.y = tent.rotation;
                root.add(model);
            } else validateAttachments([attachments]);
        }
        const base = movement;
        const safe = (x: number,z: number) => base.walkable(x,z) && attachments.every(p =>
            attachmentClearance(x,z,p) >= .65);
        movement = { ...base,walkable: safe,randomPosition(random) {
            for (let attempt = 0; attempt < 500; attempt++) {
                const point = base.randomPosition(random);
                if (safe(point.x,point.z)) return point;
            }
            throw new Error('No safe production resident position.');
        } };
        if (!canonical) {
            floatingBoat = new BoatFloat(root.getObjectByName('boat')!);
            floatingBoat.update((water ?? classic!.water).surface, 0);
        }
        root.name = blueprint ? 'Integrated generated Fjordside' : 'Reference Fjordside';
        const fire = attachments.find(p => p.key === 'hearth') ??
            { ...hearth,y: surfaceHeightAt(hearth.x,hearth.z) };
        const center = blueprint?.settlement.center ?? { x: 0,z: 0 };
        return {
            root,terrain,movement,blueprint,attachments,
            setGroundWeights(weights: readonly number[]) {
                if (canonical && terrain) updateBlueprintWear(terrain,weights);
            },
            clearPlot: (plot: BuildingPlot) => clearBuildingPlotNature(root,plot),
            hearth: new Vector3(fire.x,fire.y,fire.z),
            center: new Vector3(center.x,movement.heightAt(center.x,center.z),center.z+16),
            get quality() { return quality; },
            setQuality(value: 'standard' | 'low') {
                quality = value;
                (water ?? classic!.water).surface.setQuality(value === 'low' ? 'low' : 'medium');
                floatingBoat?.update((water ?? classic!.water).surface,waterTime);
            },
            setMotion(value: typeof motion) { motion = { ...value }; },
            update(time: number,lighting?: WorldLighting,camera?: Camera) {
                if (motion.water) waterTime = time;
                if (motion.wind) windTime = time;
                classic?.update(waterTime,lighting,camera);
                water?.update(waterTime,lighting,camera);
                wind?.update(windTime);
                floatingBoat?.update((water ?? classic!.water).surface,waterTime);
            },
            exportSave() {
                return JSON.stringify({ fjordsideVersion: 1,mode: selection.mode,
                    quality,blueprint,
                    attachmentVersion,attachments });
            },
            describe() {
                return { mode: selection.mode,seed: blueprint?.config.seed ?? 1983,
                    quality,buildings: canonical ? 0 : blueprint ? 6 : 7,
                    populationSource: 'existing-fjordside',groundTier: grounds?.tier ?? 'reference',source: blueprint?.config.conifers ?? 'reference',
                    site: { x: center.x,z: center.z },attachments: attachments.length,
                    tent: attachments.find(item => item.key === 'tent') ?? null,tentPlot,attachmentVersion,
                    validation: blueprint?.validation ?? null,motion,water: { ...(water ?? classic!.water).describe(), boat: floatingBoat?.describe() ?? null } };
            },
            dispose,
        };
    } catch (error) {
        dispose();
        throw error;
    }
}
