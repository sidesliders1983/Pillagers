import { Group, Object3D, InstancedMesh, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AssetManager } from '../core/AssetManager';
import type { ConiferSource, WorldBlueprint, WorldPreset } from '../world-generation/WorldBlueprint';
import { reviewSeeds } from '../world-generation/ReviewSeeds';
import { parseWorld, serializeWorld } from '../world-generation/WorldSave';
import { changeWorldConifers, generateWorld } from '../world-generation/GenerateWorld';
import { createBlueprintSurface, createBlueprintTerrain, disposeBlueprintTerrain } from '../world/BlueprintTerrain';
import { loadWorldGroundMaterials } from '../world/WorldGroundMaterials';
import { createNatureFromPlan } from '../world/KayKitNature';
import { placeSettlement } from '../world/PlaceSettlement';
import { FjordWater } from '../world/FjordWater';
import { fjordWaterConfig } from '../config/FjordWaterConfig';
import { worldConfig } from '../config/worldConfig';
import { generateCharacterDNA } from '../characters/generateCharacterDNA';
import { meshyHumanFactory, MeshyHuman } from '../characters/MeshyHuman';
import { Villager } from '../entities/Villager';
import { MovementSystem } from '../systems/MovementSystem';
import { blueprintMovement } from '../world/BlueprintMovement';
import type { WorldLighting } from '../core/WorldLighting';
import type { NatureAssetKey } from '../config/NatureAssets';

type Grounds = Awaited<ReturnType<typeof loadWorldGroundMaterials>>;
type Preview = {
    root: Group;
    terrain: Mesh;
    nature: Group;
    village: Group;
    water: FjordWater;
    actors: { model: MeshyHuman; unit: Villager }[];
    movement: MovementSystem | null;
};

/** Lab-only geographical proposal. Original Fjordside and Simulation Core are never mutated. */
export class LabWorldGeneration {
    blueprint: WorldBlueprint | null = null;
    private preview: Preview | null = null;
    private grounds: Grounds | null = null;
    private revision = 0;
    private alive = true;
    private original = new Map<string, string | boolean>();
    private generations = 0;
    private referenceGround: { tier?: string; summary?: string; status: string } | null = null;
    private readonly status: HTMLElement;
    private readonly seed: HTMLInputElement;
    private readonly preset: HTMLSelectElement;
    private readonly generate: HTMLButtonElement;

    constructor(private scene: Scene, private assets: AssetManager,
        private renderer: WebGLRenderer, private canvas: HTMLCanvasElement,
        private camera: PerspectiveCamera, private controls: OrbitControls,
        private reference: { terrain: Group; nature: Group; village: Group },
        private resolvePineModel: (id: NatureAssetKey) => Object3D,
        private changed: () => void) {
        document.querySelector('nav')!.insertAdjacentHTML('beforebegin', `
            <section class="world-generation" aria-label="Procedural world preview">
                <label>Review seed<select id="world-review-seed">
                    <option value="">Custom seed</option>
                    ${reviewSeeds.map((entry, index) => '<option value="' + index + '">' + entry.seed + ' · ' + entry.preset + '</option>').join('')}
                </select></label>
                <label>World seed<input id="world-seed" aria-label="World seed" type="number"
                    min="0" max="4294967295" step="1" value="17"></label>
                <label>Landscape preset<select id="world-preset">
                    <option value="fjord">Fjord</option>
                    <option value="coastal-valley">Coastal Valley</option>
                    <option value="rocky-inlet">Rocky Inlet</option>
                </select></label>
                <button id="world-generate">Generate World</button>
                <button id="world-reference">Reference Fjordside</button>
                <button id="world-export" disabled>Export world</button>
                <label>Import world<input id="world-import" type="file" accept=".json,application/json"></label>
                <label>Diagnostic overlay<select id="world-overlay">
                    <option value="none">Source materials</option>
                    <option value="biomes">Biomes</option>
                    <option value="walkability">Walkability</option>
                </select></label>
                <p>Lab proposal only · source assets preserved · production integration awaits review.</p>
            </section><pre id="world-generation-status" role="status">Reference Fjordside · seed 1983</pre>
        `);
        this.status = document.querySelector('#world-generation-status')!;
        this.seed = document.querySelector('#world-seed')!;
        this.preset = document.querySelector('#world-preset')!;
        this.generate = document.querySelector('#world-generate')!;
        document.querySelector('#world-review-seed')!.addEventListener('change', event => {
            const value = (event.target as HTMLSelectElement).value;
            if (value === '') return;
            const entry = reviewSeeds[Number(value)];
            this.seed.value = String(entry.seed);
            this.preset.value = entry.preset;
        });
        this.generate.addEventListener('click', () => void this.regenerate());
        document.querySelector('#world-export')!.addEventListener('click', () => {
            if (!this.blueprint) return;
            const url = URL.createObjectURL(new Blob([serializeWorld(this.blueprint)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'fjordside-' + this.blueprint.config.seed + '.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        document.querySelector('#world-import')!.addEventListener('change', async event => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) return;
            try {
                const world = parseWorld(await file.text());
                this.seed.value = String(world.config.seed);
                this.preset.value = world.config.preset;
                await this.regenerate(world);
            } catch (error) {
                this.status.textContent = 'World import failed: ' + (error instanceof Error ? error.message : String(error));
            } finally {
                input.value = '';
            }
        });
        document.querySelector('#world-overlay')!.addEventListener('change', () => this.applyOverlay());
        document.querySelector('#world-reference')!.addEventListener('click', () => this.restore());
        document.querySelector('#environment-conifers')!.addEventListener('change', () => {
            if (!this.blueprint) return;
            void this.regenerate(changeWorldConifers(this.blueprint, this.coniferSource()));
        });
        document.querySelector('#environment-quality')!.addEventListener('change', () => {
            if (this.blueprint) void this.regenerate(this.blueprint);
        });
    }

    get active() { return this.preview !== null; }
    private coniferSource(): ConiferSource {
        return (document.querySelector('#environment-conifers') as HTMLSelectElement).value === 'ez-tree' ?
            'ez-tree' : 'kaykit';
    }

    private quality() {
        return (document.querySelector('#environment-quality') as HTMLSelectElement).value === 'low' ?
            'low' : 'standard';
    }

    async regenerate(saved?: WorldBlueprint) {
        const revision = ++this.revision;
        this.generate.disabled = true;
        this.status.textContent = 'Generating and validating the requested landscape…';
        const start = performance.now();
        let next: Preview | null = null, grounds: Grounds | null = null;
        try {
            const world = saved ?? generateWorld({ seed: Number(this.seed.value),
                preset: this.preset.value as WorldPreset, conifers: this.coniferSource() });
            const generationMs = performance.now()-start;
            const tier = this.quality();
            grounds = this.grounds?.tier === tier ? this.grounds :
                await loadWorldGroundMaterials(tier, this.renderer.capabilities.getMaxAnisotropy());
            const surface = createBlueprintSurface(world);
            const terrain = createBlueprintTerrain(world, grounds.materials);
            const conifers = world.config.conifers ?? 'kaykit';
            const nature = createNatureFromPlan(this.assets, world.placementPlan, world.config.seed,
                conifers === 'ez-tree' ? this.resolvePineModel : undefined);
            nature.name = conifers === 'ez-tree' ? 'EZ-Tree Large + KayKit FREE undergrowth' :
                'Seeded KayKit FREE placement';
            const village = world.validation.accepted ?
                placeSettlement(this.assets, world.settlement.buildings, surface.surfaceHeightAt) : new Group();
            const water = new FjordWater({ ...fjordWaterConfig, quality: tier }, surface, world.coast);
            const root = new Group();
            root.name = 'Generated Fjordside proposal';
            root.add(terrain, nature, village, water.mesh);
            next = { root, terrain, nature, village, water, actors: [], movement: null };
            if (world.validation.accepted) {
                for (let i = 0; i < 10; i++) {
                    // Same ten reference identities for every landscape, not a generated population.
                    const dna = generateCharacterDNA((worldConfig.seed+Math.imul(i+1,2654435761))>>>0);
                    const model = await meshyHumanFactory.createWorld(dna);
                    const unit = new Villager(i, model.root);
                    next.actors.push({ model, unit });
                    village.add(model.root);
                }
                next.movement = new MovementSystem(next.actors.map(a => a.unit), undefined,
                    blueprintMovement(world));
            }
            if (!this.alive || revision !== this.revision) {
                this.release(next);
                if (grounds !== this.grounds) grounds.dispose();
                return;
            }
            if (!this.active) this.rememberReference();
            this.release(this.preview);
            if (this.grounds && this.grounds !== grounds) this.grounds.dispose();
            this.grounds = grounds;
            this.preview = next;
            this.blueprint = world;
            this.generations++;
            this.scene.add(root);
            this.applyOverlay();
            (document.querySelector('#world-export') as HTMLButtonElement).disabled = false;
            for (const id of ['material','grass']) {
                (document.querySelector('#environment-'+id) as HTMLInputElement).disabled = true;
            }
            const grass = document.querySelector('#environment-grass') as HTMLInputElement;
            grass.checked = false;
            (document.querySelector('#environment-quality') as HTMLSelectElement).value = tier;
            (document.querySelector('#environment-conifers') as HTMLSelectElement).value = conifers;
            (document.querySelector('#environment-quality option[value=legacy]') as HTMLOptionElement).disabled = true;
            this.status.textContent = (world.validation.accepted ? 'PASS' : 'REJECTED') +
                ' · seed ' + world.config.seed + ' · ' + world.config.preset +
                ' · ' + world.config.generatorVersion + '\nNormalized parameters: ' + JSON.stringify(world.config) + '\nWater level ' + world.waterLevel +
                'm · site score ' + world.validation.score + ' · connected buildings ' +
                world.validation.connectedBuildings + '/6 · connected clearing ' +
                world.validation.connectedArea + 'm²\nBiomes: ' + JSON.stringify(world.biomes.coverage) +
                '\n' + world.placementPlan.length + ' source placements · ' + next.actors.length +
                ' reference residents · generation ' + generationMs.toFixed(1) + 'ms' +
                (world.validation.reasons.length ? '\n' + world.validation.reasons.join('\n') : '');
            this.canvas.dataset.world = JSON.stringify({ seed: world.config.seed,
                generatorVersion: world.config.generatorVersion, preset: world.config.preset, conifers,
                validation: world.validation, biomeCoverage: world.biomes.coverage,
                naturePlacements: world.placementPlan.length, referenceResidents: next.actors.length,
                bounds: world.terrain.bounds, site: world.settlement.center, waterLevel: world.waterLevel,
                generationMs, previewPreparationMs: performance.now() - start,
                terrainBytes: Object.values(terrain.geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0),
                terrainVertices: terrain.geometry.attributes.position.count,
                generations: this.generations });
            this.canvas.dataset.groundTier = tier;
            this.canvas.dataset.ground = JSON.stringify({ source: 'world-ground-v0.1',
                nativeLayers: 4, masks: 'Native alphaMap on independent world UV channel',
                colourSpace: 'sRGB', dataSpace: 'NoColorSpace',
                sourcePixels: tier === 'standard' ? 256 : 128 });
            document.querySelector('#environment-status')!.textContent =
                'Generated world · approved CC0 ground sources with native alpha masks · ' + tier +
                ' · ' + (conifers === 'ez-tree' ? 'EZ-Tree Large + KayKit FREE undergrowth' : 'KayKit FREE scenery') +
                ' · unchanged Meshy models and boona13 water';
            this.changed();
            this.setCamera((document.querySelector('#environment-camera') as HTMLSelectElement).value);
        } catch (error) {
            this.release(next);
            if (grounds && grounds !== this.grounds) grounds.dispose();
            this.status.textContent = 'World generation failed: ' + (error instanceof Error ? error.message : String(error));
        } finally {
            if (revision === this.revision) this.generate.disabled = false;
        }
    }

    private applyOverlay() {
        if (!this.preview || !this.blueprint || !this.grounds) return;
        const previous = this.preview.terrain;
        const overlay = (document.querySelector('#world-overlay') as HTMLSelectElement).value;
        const next = createBlueprintTerrain(this.blueprint, this.grounds.materials, overlay);
        next.visible = previous.visible;
        this.preview.root.remove(previous);
        disposeBlueprintTerrain(previous);
        this.preview.root.add(next);
        this.preview.terrain = next;
    }

    private rememberReference() {
        this.referenceGround = { tier: this.canvas.dataset.groundTier,
            summary: this.canvas.dataset.ground,
            status: document.querySelector('#environment-status')!.textContent ?? '' };
        for (const id of ['quality','conifers','material','grass','camera']) {
            const control = document.querySelector('#environment-'+id) as HTMLInputElement | HTMLSelectElement;
            this.original.set(id, control instanceof HTMLInputElement ? control.checked : control.value);
        }
    }

    syncVisibility() {
        for (const id of ['terrain','nature','village'] as const) {
            const control = document.querySelector('#environment-'+(id === 'terrain' ? 'ground' : id)) as HTMLInputElement;
            this.reference[id].visible = !this.active && control.checked;
            if (this.preview) this.preview[id].visible = control.checked;
        }
        if (this.preview) {
            const heights = this.preview.nature.userData.coniferHeights as number[];
            const source = this.blueprint?.config.conifers ?? 'kaykit';
            this.canvas.dataset.conifers = JSON.stringify({ source, preset: source === 'ez-tree' ? 'Large' : null,
                count: heights.length, minHeight: Math.min(...heights), maxHeight: Math.max(...heights) });
            document.querySelector('#environment-conifers-status')!.textContent =
                'Generated ' + (source === 'ez-tree' ? 'EZ-Tree Large' : 'KayKit FREE') +
                ' scenery · ' + heights.length + ' varied conifers';
        }
        if (this.preview) this.preview.water.mesh.visible =
            (document.querySelector('#environment-water') as HTMLInputElement).checked;
    }

    setCamera(view: string) {
        if (!this.blueprint) return false;
        const { x,z } = this.blueprint.settlement.center;
        const presets: Record<string, { position: number[];
        target: number[] }> = {
            village: { position: [x+34,15,z-20], target: [x,3,z+18] },
            shore: { position: [x+46,20,z-50], target: [x-25,7,z+20] },
            forest: { position: [-74,22,40], target: [-40,9,45] },
            overview: { position: [88,78,-78], target: [0,5,16] },
            landscape: { position: [88,78,-78], target: [0,5,16] },
            water: { position: [x+8,4,-42], target: [x-12,4,10] },
            close: { position: [x+8,7,z-2], target: [x-4,3,z+14] },
        };
        const preset = presets[view] ?? presets.village;
        this.controls.enableDamping = false;
        this.camera.position.fromArray(preset.position);
        this.controls.target.fromArray(preset.target);
        this.controls.update();
        this.controls.enableDamping = true;
        return true;
    }

    update(dt: number, time: number, lighting: WorldLighting) {
        const preview = this.preview;
        if (!preview) return;
        preview.water.update(time, lighting);
        preview.movement?.update(dt);
        for (const actor of preview.actors) {
            const state = actor.unit.interactionState;
            if (state === 'talking' || state === 'listening') actor.model.setAnimation(state === 'talking' ? 'Talk' : 'Listen');
            else actor.model.setMovementSpeed(actor.unit.speed);
            actor.model.update(dt);
        }
        this.canvas.dataset.referenceActors = JSON.stringify(preview.actors.map(a => ({
            id: a.unit.id, x: a.model.root.position.x, y: a.model.root.position.y,
            z: a.model.root.position.z, speed: a.unit.speed, animation: a.model.state,
        })));
    }

    restore() {
        this.revision++;
        this.generate.disabled = false;
        this.release(this.preview);
        this.preview = null;
        this.blueprint = null;
        this.grounds?.dispose();
        this.grounds = null;
        for (const [id, value] of this.original) {
            const control = document.querySelector('#environment-'+id) as HTMLInputElement | HTMLSelectElement;
            control.disabled = false;
            if (control instanceof HTMLInputElement) control.checked = value as boolean;
            else control.value = value as string;
        }
        (document.querySelector('#environment-quality option[value=legacy]') as HTMLOptionElement).disabled = false;
        delete this.canvas.dataset.world;
        delete this.canvas.dataset.referenceActors;
        (document.querySelector('#world-export') as HTMLButtonElement).disabled = true;
        if (this.referenceGround) {
            this.canvas.dataset.groundTier = this.referenceGround.tier ?? '';
            this.canvas.dataset.ground = this.referenceGround.summary ?? '';
            document.querySelector('#environment-status')!.textContent = this.referenceGround.status;
        }
        this.status.textContent = 'Reference Fjordside · seed 1983';
        this.changed();
    }

    private release(preview: Preview | null) {
        if (!preview) return;
        this.scene.remove(preview.root);
        preview.water.dispose();
        disposeBlueprintTerrain(preview.terrain);
        preview.nature.traverse(node => { if (node instanceof InstancedMesh) node.dispose(); });
        for (const actor of preview.actors) actor.model.dispose();
        preview.root.clear();
    }

    dispose() {
        this.alive = false;
        this.revision++;
        this.release(this.preview);
        this.preview = null;
        this.grounds?.dispose();
        this.grounds = null;
    }
}
