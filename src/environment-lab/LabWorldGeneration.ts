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
import { NatureWind } from '../world/NatureWind';
import { placeSettlement } from '../world/PlaceSettlement';
import { FjordWater } from '../world/FjordWater';
import { FjordsideWater } from '../world/FjordsideWater';
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
    water: FjordWater | FjordsideWater;
    wind: NatureWind;
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
    private readonly sandStudy: HTMLInputElement;
    private readonly sandResolution: HTMLSelectElement;

    constructor(private scene: Scene, private assets: AssetManager,
        private renderer: WebGLRenderer, private canvas: HTMLCanvasElement,
        private camera: PerspectiveCamera, private controls: OrbitControls,
        private reference: { terrain: Group; nature: Group; village: Group },
        private resolvePineModel: (id: NatureAssetKey) => Object3D,
        private changed: () => void) {
        document.querySelector('#environment-world-settings')!.insertAdjacentHTML('beforeend', `
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
                <label><input id="world-sand-study" type="checkbox">Sand study · approved ReferenceWater</label>
                <label>Standard sand<select id="world-sand-resolution" disabled>
                    <option value="256">256 px · baseline</option>
                    <option value="512">512 px · candidate</option>
                </select></label>
                <span>Lab only. Low retains 128 px without normals.</span>
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
        this.sandStudy = document.querySelector('#world-sand-study')!;
        this.sandResolution = document.querySelector('#world-sand-resolution')!;
        document.querySelector('#environment-camera')!.insertAdjacentHTML('beforeend',
            '<option value="sand-close" disabled>Sand shore close-up</option>' +
            '<option value="sand-shore" disabled>Sand shore gameplay distance</option>');
        this.sandStudy.addEventListener('change', () => {
            if (this.blueprint) void this.regenerate(this.blueprint);
        });
        this.sandResolution.addEventListener('change', () => void this.changeSandResolution());
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
        this.syncSandControls();
        this.status.textContent = 'Generating and validating the requested landscape…';
        const start = performance.now();
        let next: Preview | null = null, grounds: Grounds | null = null;
        try {
            const world = saved ?? generateWorld({ seed: Number(this.seed.value),
                preset: this.preset.value as WorldPreset, conifers: this.coniferSource() });
            const generationMs = performance.now()-start;
            const tier = this.quality();
            const sandPixels = tier === 'low' ? 128 : this.selectedSand();
            grounds = this.grounds?.tier === tier && this.grounds.sandPixels === sandPixels ? this.grounds :
                await loadWorldGroundMaterials(tier, this.renderer.capabilities.getMaxAnisotropy(), this.selectedSand());
            const surface = createBlueprintSurface(world);
            const terrain = createBlueprintTerrain(world, grounds.materials);
            const conifers = world.config.conifers ?? 'kaykit';
            const nature = createNatureFromPlan(this.assets, world.placementPlan, world.config.seed,
                conifers === 'ez-tree' ? this.resolvePineModel : undefined);
            nature.name = conifers === 'ez-tree' ? 'EZ-Tree Large + KayKit FREE undergrowth' :
                'Seeded KayKit FREE placement';
            const village = world.validation.accepted ?
                placeSettlement(this.assets, world.settlement.buildings, surface.surfaceHeightAt) : new Group();
            // Opt-in study holds the accepted prior-slice water fixed for both sand resolutions.
            const water = this.sandStudy.checked ? new FjordsideWater(world.waterLevel,
                world.settlement.harbor ?? world.settlement.center, tier) :
                new FjordWater({ ...fjordWaterConfig, quality: tier }, surface, world.coast);
            const root = new Group();
            root.name = 'Generated Fjordside proposal';
            root.add(terrain, nature, village, water.mesh);
            next = { root, terrain, nature, village, water,
                wind: new NatureWind(nature, conifers === 'ez-tree'), actors: [], movement: null };
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
            this.updateGroundSummary();
            this.changed();
            this.setCamera((document.querySelector('#environment-camera') as HTMLSelectElement).value);
        } catch (error) {
            this.release(next);
            if (grounds && grounds !== this.grounds) grounds.dispose();
            this.status.textContent = 'World generation failed: ' + (error instanceof Error ? error.message : String(error));
        } finally {
            if (revision === this.revision) {
                this.generate.disabled = false;
                this.syncSandControls();
            }
        }
    }

    private selectedSand(): 256 | 512 {
        return this.sandStudy.checked && this.sandResolution.value === '512' ? 512 : 256;
    }

    private syncSandControls() {
        this.sandStudy.disabled = this.generate.disabled;
        this.sandResolution.disabled = this.generate.disabled || !this.active ||
            !this.sandStudy.checked || this.quality() === 'low';
        for (const view of ['sand-close', 'sand-shore']) {
            (document.querySelector('#environment-camera option[value="' + view + '"]') as
                HTMLOptionElement).disabled = !this.active;
        }
    }

    private updateGroundSummary() {
        if (!this.grounds) return;
        const { tier, sandPixels, materials } = this.grounds;
        this.canvas.dataset.ground = JSON.stringify({ source: 'world-ground-v0.1',
            nativeLayers: 4, masks: 'Native alphaMap on independent world UV channel',
            colourSpace: 'sRGB', dataSpace: 'NoColorSpace',
            sourcePixels: tier === 'standard' ? 256 : 128, sandPixels,
            sandStudy: this.sandStudy.checked,
            waterSource: this.sandStudy.checked ? 'reference-water' : 'boona13',
            maps: [...materials].map(([id, material]) => ({ id,
                normalScale: material.normalScale.toArray(), roughness: material.roughness,
                textures: [material.map, material.normalMap, material.roughnessMap]
                    .filter(texture => texture !== null).map(texture => ({
                        file: texture!.image.src.split('/ground-materials/')[1],
                        width: texture!.image.width, height: texture!.image.height,
                        colourSpace: texture!.colorSpace, mipmaps: texture!.generateMipmaps,
                        anisotropy: texture!.anisotropy,
                    })),
            })),
        });
        document.querySelector('#environment-status')!.textContent =
            'Generated world · approved CC0 ground sources with native alpha masks · ' + tier +
            ' · sand ' + sandPixels + ' px · ' +
            (this.sandStudy.checked ? 'ReferenceWater sand study (Lab only)' : 'boona13 water');
    }

    /** Replace render materials/mesh only; keep geography, water, actors and camera. */
    private async changeSandResolution() {
        if (!this.preview || !this.sandStudy.checked || this.generate.disabled) return;
        const revision = ++this.revision;
        this.generate.disabled = true;
        this.syncSandControls();
        let next: Grounds | null = null;
        try {
            next = await loadWorldGroundMaterials(this.quality(),
                this.renderer.capabilities.getMaxAnisotropy(), this.selectedSand());
            if (!this.alive || revision !== this.revision || !this.preview) {
                next.dispose();
                return;
            }
            const previous = this.grounds;
            this.applyOverlay(next);
            this.grounds = next;
            previous?.dispose();
            this.updateGroundSummary();
        } catch (error) {
            if (next !== this.grounds) next?.dispose();
            this.status.textContent = 'Sand update failed: ' +
                (error instanceof Error ? error.message : String(error));
        } finally {
            if (revision === this.revision) {
                this.generate.disabled = false;
                this.syncSandControls();
            }
        }
    }

    private applyOverlay(grounds = this.grounds) {
        if (!this.preview || !this.blueprint || !grounds) return;
        const previous = this.preview.terrain;
        const overlay = (document.querySelector('#world-overlay') as HTMLSelectElement).value;
        const next = createBlueprintTerrain(this.blueprint, grounds.materials, overlay);
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
        const world = this.blueprint;
        const harbor = world.settlement.harbor ?? world.settlement.center;
        const point = (index: number) => ({
            x: world.terrain.bounds.minX + index % world.terrain.columns * world.terrain.spacing,
            z: world.terrain.bounds.minZ + Math.floor(index / world.terrain.columns) * world.terrain.spacing,
            y: world.terrain.heights[index],
        });
        const shoreCells = world.biomes.cells.map((biome, index) => ({ biome, index }))
            .filter(cell => cell.biome === 'shore' && world.terrain.heights[cell.index] > world.waterLevel + .3);
        shoreCells.sort((a, b) => {
            const pa = point(a.index), pb = point(b.index);
            return Math.hypot(pa.x - harbor.x, pa.z - harbor.z) - Math.hypot(pb.x - harbor.x, pb.z - harbor.z);
        });
        const shore = shoreCells.length ? point(shoreCells[0].index) :
            { ...harbor, y: world.settlement.elevation };
        const presets: Record<string, { position: number[];
        target: number[] }> = {
            village: { position: [x+34,15,z-20], target: [x,3,z+18] },
            shore: { position: [x+46,20,z-50], target: [x-25,7,z+20] },
            forest: { position: [-74,22,40], target: [-40,9,45] },
            overview: { position: [88,78,-78], target: [0,5,16] },
            landscape: { position: [88,78,-78], target: [0,5,16] },
            water: { position: [x+8,4,-42], target: [x-12,4,10] },
            'sand-close': { position: [shore.x+5.5,shore.y+3.5,shore.z-5.5],
                target: [shore.x,shore.y,shore.z] },
            'sand-shore': { position: [shore.x+17,shore.y+10,shore.z-17],
                target: [shore.x,shore.y,shore.z] },
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
        if (preview.water instanceof FjordsideWater) {
            preview.water.update(time, lighting, this.camera);
            this.canvas.dataset.studyWater = JSON.stringify(preview.water.describe());
        } else {
            preview.water.update(time, lighting);
            delete this.canvas.dataset.studyWater;
        }
        preview.wind.update(time);
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
        this.sandStudy.checked = false;
        delete this.canvas.dataset.studyWater;
        this.syncSandControls();
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
        preview.wind.dispose();
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
