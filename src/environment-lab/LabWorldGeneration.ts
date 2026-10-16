import type { TerrainShading } from '../world/TerrainShading';
import { browserGeneration } from '../world-generation/BrowserGeneration';
import { groundStudyViews, groundStudyCamera } from './GroundStudyViews';
import type { GroundBlending, RockTone } from '../config/GroundBlendConfig';
import { spatialOverlays } from '../world/SpatialOverlay';
import { renderSpatialDiagnostics } from './SpatialDiagnostics';
import { environmentOverlays, renderEnvironmentDiagnostics } from './EnvironmentDiagnostics';
import { gentlerIslandGeneratorVersion, freezeBlueprint } from '../world-generation/WorldBlueprint';
import { discoverySettlementGeneratorVersion } from '../world-generation/SettlementSites';
import { settlementStartingViews } from '../world-generation/SiteNavigation';
import { createSettlementSiteOverlay, renderSettlementSiteDiagnostics } from './SettlementSiteDiagnostics';
import { inspectMacroIsland } from '../world-generation/MacroIsland';
import { createMacroOverlay, disposeMacroOverlay } from './MacroOverlay';
import { Group, Object3D, InstancedMesh, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AssetManager } from '../core/AssetManager';
import type { ConiferSource, WorldBlueprint, WorldPreset } from '../world-generation/WorldBlueprint';
import { reviewSeeds } from '../world-generation/ReviewSeeds';
import { parseWorld, serializeWorld } from '../world-generation/WorldSave';
import { createBlueprintSurface, createBlueprintTerrainAsync, disposeBlueprintTerrain } from '../world/BlueprintTerrain';
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
    macroOverlay: Group;
    siteOverlay: Group;
    nature: Group;
    village: Group;
    water: FjordWater | FjordsideWater;
    wind: NatureWind;
    actors: { model: MeshyHuman; unit: Villager }[];
    movement: MovementSystem | null;
};

/** Lab-only geographical proposal. Original Fjordside and Simulation Core are never mutated. */
export class LabWorldGeneration {
    private generator = browserGeneration();
    private cancelGeneration = document.createElement('button');
    blueprint: WorldBlueprint | null = null;
    private preview: Preview | null = null;
    private grounds: Grounds | null = null;
    private revision = 0;
    private terrainRevision = 0;
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
                    <option value="island">Nordic Island · gentler highlands</option>
                </select></label>
                <label><input id="world-site-planning" type="checkbox">Player &amp; rival sites · v0.3e-r3 (islands)</label>
                <label><input id="world-environment-zoning" type="checkbox">Environment zoning · v1 (new worlds)</label>
                <label>Annual mean °C for new zoned worlds<input id="world-climate" type="number"
                    min="-40" max="40" step="0.5" value="6" title="Normal: 6 °C. Optional cold study: −8 °C. Applies on Generate World."></label>
                <label><input id="world-snow-study" type="checkbox" disabled>Potential snow cover · Lab study</label>
                <label>Rock colour<select id="world-rock-tone" disabled>
                    <option value="cool-grey">Cool grey · art direction candidate</option>
                    <option value="source">Original mossy olive · comparison</option>
                </select></label>
                <label>Ground rendering<select id="world-ground-blending" disabled>
                    <option value="baseline">Baseline · tiled biome masks</option>
                    <option value="zoned">Zoned blend · native source atlas</option>
                </select></label>
                <label>Terrain shading study<select id="world-terrain-shading" disabled>
                    <option value="baseline">A · existing flat triangles</option>
                    <option value="smooth">B · shared heightfield normals</option>
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
                    <option value="form">Normals only · neutral terrain</option>
                    <option value="source-grass">Grass albedo only · UV diagnostic</option>
                    <option value="sites">Settlement sites &amp; sightlines</option>
                    <option value="macro">Macro regions &amp; coast</option>
                    <option value="elevation">Elevation</option>
                    <option value="biomes">Biomes</option>
                    <option value="walkability">Walkability</option>
                    ${Object.entries(spatialOverlays).map(([key, label]) => '<option value="' + key + '" data-spatial-overlay disabled>' + label + '</option>').join('')}
                    ${Object.entries(environmentOverlays).map(([key, label]) => '<option value="' + key + '" data-environment-overlay disabled>' + label + '</option>').join('')}
                </select></label>
                <p>Lab proposal only · source assets preserved · production integration awaits review.</p>
            </section><pre id="world-generation-status" role="status">Reference Fjordside · seed 1983</pre><details id="world-sites-diagnostics" hidden></details><details id="world-environment-diagnostics" hidden></details><details id="world-spatial-diagnostics" hidden></details>
        `);
        this.status = document.querySelector('#world-generation-status')!;
        this.seed = document.querySelector('#world-seed')!;
        this.preset = document.querySelector('#world-preset')!;
        this.generate = document.querySelector('#world-generate')!;
        this.sandStudy = document.querySelector('#world-sand-study')!;
        this.sandResolution = document.querySelector('#world-sand-resolution')!;
        document.querySelector('#environment-camera')!.insertAdjacentHTML('beforeend',
            '<option value="player-start" disabled>Player starting view</option>' +
            '<option value="island-overhead" disabled>Island overhead</option>' +
            '<option value="island-oblique" disabled>Island oblique</option>' +
            '<option value="sand-close" disabled>Sand shore close-up</option>' +
            '<option value="sand-shore" disabled>Sand shore gameplay distance</option>' +
            Object.entries(groundStudyViews).map(([key, label]) => '<option value="' + key + '" disabled>' + label + '</option>').join(''));
        this.sandStudy.addEventListener('change', () => {
            if (this.blueprint) void this.regenerate(this.blueprint);
        });
        this.sandResolution.addEventListener('change', () => void this.changeGroundMaterials());
        document.querySelector('#world-rock-tone')!.addEventListener('change', () => void this.changeGroundMaterials());
        document.querySelector('#world-ground-blending')!.addEventListener('change', () => void this.changeGroundMaterials());
        document.querySelector('#world-snow-study')!.addEventListener('change', () => this.redrawTerrain());
        document.querySelector('#world-terrain-shading')!.addEventListener('change', () => this.redrawTerrain());
        document.querySelector('#world-review-seed')!.addEventListener('change', event => {
            const value = (event.target as HTMLSelectElement).value;
            if (value === '') return;
            const entry = reviewSeeds[Number(value)];
            this.seed.value = String(entry.seed);
            this.preset.value = entry.preset;
        });
        this.generate.addEventListener('click', () => void this.regenerate());
        this.cancelGeneration.type = 'button';
        this.cancelGeneration.textContent = 'Cancel generation';
        this.cancelGeneration.hidden = true;
        this.cancelGeneration.addEventListener('click', () => {
            this.revision++;
            this.generator.cancel();
            this.cancelGeneration.hidden = true;
            this.generate.disabled = false;
            this.status.textContent = 'Generation cancelled. The previous landscape is retained.';
            this.syncSandControls();
        });
        this.generate.insertAdjacentElement('afterend', this.cancelGeneration);
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
        document.querySelector('#world-overlay')!.addEventListener('change', () => this.redrawTerrain());
        document.querySelector('#world-reference')!.addEventListener('click', () => this.restore());
        document.querySelector('#environment-conifers')!.addEventListener('change', () => {
            if (!this.blueprint) return;
            void this.regenerate(this.blueprint, this.coniferSource());
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

    async regenerate(saved?: WorldBlueprint, requestedConifers?: 'kaykit' | 'ez-tree') {
        const revision = ++this.revision;
        this.generator.cancel();
        this.cancelGeneration.hidden = false;
        this.generate.disabled = true;
        this.syncSandControls();
        this.status.textContent = 'Generating and validating the requested landscape…';
        const start = performance.now();
        let next: Preview | null = null, grounds: Grounds | null = null;
        try {
            const report = (event: import('../world-generation/GenerationTask').GenerationProgress) => {
                if (event.type === 'phase' && revision === this.revision)
                    this.status.textContent = 'Generating: ' + event.stage.replaceAll('-', ' ') + '…';
            };
            let world: WorldBlueprint;
            if (saved) world = requestedConifers ? (await this.generator.generate({ kind: 'conifers', world: saved, conifers: requestedConifers }, report)).world : saved;
            else world = (await this.generator.generate({ kind: 'world', config: { seed: Number(this.seed.value),
                preset: this.preset.value as WorldPreset, conifers: this.coniferSource(),
                ...((document.querySelector('#world-environment-zoning') as HTMLInputElement).checked ?
                    { environment: { version: 1 as const, meanAnnualTemperatureC: Number((document.querySelector('#world-climate') as HTMLInputElement).value) } } : {}),
                ...(this.preset.value === 'island' ? { generatorVersion:
                    (document.querySelector('#world-site-planning') as HTMLInputElement).checked ?
                        discoverySettlementGeneratorVersion : gentlerIslandGeneratorVersion } : {}) } }, report)).world;
            if (!this.alive || revision !== this.revision) return;
            freezeBlueprint(world);
            const macro = world.config.preset === 'island' ? inspectMacroIsland(world) : null;
            const generationMs = performance.now()-start;
            const tier = this.quality();
            const blending = this.selectedBlending(world);
            const sandPixels = tier === 'low' ? 128 : this.selectedSand();
            grounds = this.grounds?.tier === tier && this.grounds.blending === blending && this.grounds.rockTone === this.selectedRockTone(world) &&
                (blending === 'zoned' || this.grounds.sandPixels === sandPixels) ? this.grounds :
                await loadWorldGroundMaterials(tier, this.renderer.capabilities.getMaxAnisotropy(), this.selectedSand(), blending, this.selectedRockTone(world));
            const surface = createBlueprintSurface(world);
            const terrain = await createBlueprintTerrainAsync(world, grounds.materials, 'none', undefined, grounds.blending,
                false, undefined, this.selectedShading());
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
                new FjordWater({ ...fjordWaterConfig, size: world.config.width * (world.config.preset === 'island' ? 4 : 1), quality: tier }, surface, world.coast);
            const root = new Group();
            root.name = 'Generated Fjordside proposal';
            const macroOverlay = createMacroOverlay(world, macro?.sitePair ?? [], macro?.terrainSeparation);
            macroOverlay.visible = false;
            const siteOverlay = createSettlementSiteOverlay(world);
            siteOverlay.visible = false;
            root.add(terrain, nature, village, water.mesh, macroOverlay, siteOverlay);
            next = { root, terrain, macroOverlay, siteOverlay, nature, village, water,
                wind: new NatureWind(nature, conifers === 'ez-tree'), actors: [], movement: null };
            if (world.validation.accepted && world.settlement.buildings.length) {
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
            (document.querySelector('#world-climate') as HTMLInputElement).value = String(world.config.environment?.meanAnnualTemperatureC ?? 6);
            this.generations++;
            this.scene.add(root);
            this.syncEnvironmentControls();
            if ((document.querySelector('#world-overlay') as HTMLSelectElement).value !== 'none' ||
                (document.querySelector('#world-snow-study') as HTMLInputElement).checked) await this.applyOverlay();
            else this.canvas.dataset.terrainShading = JSON.stringify(terrain.userData.terrainShading);
            if (!this.alive || revision !== this.revision || this.preview !== next) return;
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
                (macro && !world.siteSelection ? 'm · house placement deferred to site selection' :
                    'm · site score ' + world.validation.score + ' · connected buildings ' +
                    world.validation.connectedBuildings + '/6 · connected clearing ' +
                    world.validation.connectedArea + 'm²') + '\nBiomes: ' + JSON.stringify(world.biomes.coverage) +
                '\n' + world.placementPlan.length + ' source placements · ' + next.actors.length +
                ' reference residents · generation ' + generationMs.toFixed(1) + 'ms' +
                (world.validation.reasons.length ? '\n' + world.validation.reasons.join('\n') : '') +
                (macro ? '\nMacro ' + (macro.accepted ? 'PASS' : 'REJECTED') + ' · ' +
                    macro.landComponents + ' landmass · sea border ' + macro.seaBorder + ' · ' +
                    macro.sitePair.length + ' natural lowland pockets · max elevation ' +
                    macro.maximumElevation.toFixed(1) + 'm\n' + JSON.stringify(macro.regions) +
                    (macro.terrainSeparation ? '\nTerrain ridge: ' +
                        macro.terrainSeparation.heightAboveSites.toFixed(1) + 'm above sites · ' +
                        macro.terrainSeparation.width.toFixed(1) + 'm wide · walking connection ' +
                        ((macro.terrainSeparation.connection.length - 1) * world.terrain.spacing) + 'm' : '') +
                    (macro.reasons.length ? '\n' + macro.reasons.join('\n') : '') : '');
            renderSettlementSiteDiagnostics(document.querySelector('#world-sites-diagnostics')!, world);
            renderEnvironmentDiagnostics(document.querySelector('#world-environment-diagnostics')!, world);
            renderSpatialDiagnostics(document.querySelector('#world-spatial-diagnostics')!, world);
            (document.querySelector('#world-site-planning') as HTMLInputElement).checked = !!world.siteSelection;
            this.canvas.dataset.world = JSON.stringify({ seed: world.config.seed,
                generatorVersion: world.config.generatorVersion, preset: world.config.preset, conifers,
                validation: world.validation, macro: macro ? { ...macro, candidates: macro.candidates.length,
                    sitePair: macro.sitePair.map(({ cells: _cells, ...site }) => site) } : null, biomeCoverage: world.biomes.coverage,
                siteSelection: world.siteSelection ? { selected: world.siteSelection.selected,
                    rivalSite: world.rivalSite ?? null, candidates: world.siteSelection.candidates.length,
                    exposedRays: world.siteSelection.visibility.exposedRays,
                    rayCount: world.siteSelection.visibility.rays.length } : null,
                environment: world.environment ? { version: world.environment.version,
                    coverage: world.environment.coverage, regions: world.environment.regions.length,
                    climate: world.config.environment,
                    maximumSnowPotential: Math.max(...world.environment.fields.snowRetentionPotential) } : null,
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
            if (!this.alive || revision !== this.revision) return;
            this.status.textContent = 'World generation stopped: ' + (error instanceof Error ? error.message : String(error));
        } finally {
            if (revision === this.revision) {
                this.cancelGeneration.hidden = true;
                this.generate.disabled = false;
                this.syncSandControls();
            }
        }
    }

    private selectedBlending(world = this.blueprint): GroundBlending {
        return world?.environment && (document.querySelector('#world-ground-blending') as HTMLSelectElement).value === 'zoned' ? 'zoned' : 'baseline';
    }

    private selectedRockTone(world = this.blueprint): RockTone {
        return this.selectedBlending(world) === 'zoned' ?
            (document.querySelector('#world-rock-tone') as HTMLSelectElement).value as RockTone : 'source';
    }

    private selectedSand(): 256 | 512 {
        return this.sandStudy.checked && this.sandResolution.value === '512' ? 512 : 256;
    }

    private selectedShading(): TerrainShading {
        return (document.querySelector('#world-terrain-shading') as HTMLSelectElement).value as TerrainShading;
    }

    private syncSandControls() {
        (document.querySelector('#world-terrain-shading') as HTMLSelectElement).disabled = this.generate.disabled || !this.preview;
        (document.querySelector('#world-overlay') as HTMLSelectElement).disabled = this.generate.disabled;
        (document.querySelector('#world-ground-blending') as HTMLSelectElement).disabled =
            this.generate.disabled || !this.blueprint?.environment;
        (document.querySelector('#world-rock-tone') as HTMLSelectElement).disabled =
            this.generate.disabled || this.selectedBlending() !== 'zoned';
        (document.querySelector('#world-snow-study') as HTMLInputElement).disabled =
            this.generate.disabled || this.selectedBlending() !== 'zoned';
        this.sandStudy.disabled = this.generate.disabled;
        this.sandResolution.disabled = this.generate.disabled || !this.active ||
            !this.sandStudy.checked || this.quality() === 'low' || this.selectedBlending() === 'zoned';
        for (const view of Object.keys(groundStudyViews)) {
            (document.querySelector('#environment-camera option[value="' + view + '"]') as HTMLOptionElement).disabled = !this.blueprint?.environment;
        }
        for (const view of ['sand-close', 'sand-shore', 'island-overhead', 'island-oblique', 'player-start']) {
            (document.querySelector('#environment-camera option[value="' + view + '"]') as
                HTMLOptionElement).disabled = !this.active;
        }
    }

    private updateGroundSummary() {
        if (!this.grounds) return;
        const { tier, sandPixels, materials, blending, sourcePixels, rockTone } = this.grounds;
        const terrain = this.preview?.terrain;
        const layers = terrain ? (Array.isArray(terrain.material) ? terrain.material : [terrain.material]) : [];
        this.canvas.dataset.ground = JSON.stringify({
            source: blending === 'zoned' ? 'blended-ground-v1' : 'world-ground-v0.1', blending, rockTone,
            terrainBytes: terrain ? Object.values(terrain.geometry.attributes)
                .reduce((sum, attribute) => sum + attribute.array.byteLength, 0) : 0,
            indexBytes: terrain?.geometry.getIndex()?.array.byteLength ?? 0,
            maskBytes: layers.reduce((sum, material) => sum +
                ((material as import('three').MeshStandardMaterial).alphaMap?.image?.data?.byteLength ?? 0), 0),
            shading: terrain?.userData.terrainShading ?? null,
            flatShading: layers.map(material => (material as import('three').MeshStandardMaterial).flatShading),
            nativeLayers: layers.length, snowStudy: (document.querySelector('#world-snow-study') as HTMLInputElement).checked,
            snowLayerActive: layers.some(material => material.name === 'Climate snow candidate'), masks: 'Native alphaMap on independent world UV channel',
            colourSpace: 'sRGB', dataSpace: 'NoColorSpace',
            sourcePixels, sandPixels,
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
            'Generated world · ' + (blending === 'zoned' ? 'zoning blend + source atlas (Lab study)' : 'baseline tiled sources') + ' · ' + tier +
            ' · sand ' + sandPixels + ' px · ' +
            (this.sandStudy.checked ? 'ReferenceWater sand study (Lab only)' : 'boona13 water');
    }

    /** Replace render materials/mesh only; keep geography, water, actors and camera. */
    private async changeGroundMaterials() {
        if (!this.preview || this.generate.disabled) return;
        const revision = ++this.revision;
        this.generate.disabled = true;
        this.syncSandControls();
        let next: Grounds | null = null;
        try {
            next = await loadWorldGroundMaterials(this.quality(),
                this.renderer.capabilities.getMaxAnisotropy(), this.selectedSand(), this.selectedBlending(), this.selectedRockTone());
            if (!this.alive || revision !== this.revision || !this.preview) {
                next.dispose();
                return;
            }
            const previous = this.grounds;
            if (!await this.applyOverlay(next)) { next.dispose(); return; }
            this.grounds = next;
            previous?.dispose();
            this.updateGroundSummary();
        } catch (error) {
            if (next !== this.grounds) next?.dispose();
            (document.querySelector('#world-ground-blending') as HTMLSelectElement).value = this.grounds?.blending ?? 'baseline';
            (document.querySelector('#world-rock-tone') as HTMLSelectElement).value = this.grounds?.rockTone ?? 'cool-grey';
            this.status.textContent = 'Ground update failed: ' +
                (error instanceof Error ? error.message : String(error));
        } finally {
            if (revision === this.revision) {
                this.generate.disabled = false;
                this.syncSandControls();
            }
        }
    }

    private redrawTerrain() {
        void this.applyOverlay().then(applied => {
            if (applied) this.updateGroundSummary();
        }).catch(error => {
            this.status.textContent = 'Terrain preview failed: ' + (error instanceof Error ? error.message : String(error));
        });
    }

    /** Replace only rendering buffers, yielding within the existing scene-preparation pipeline. */
    private async applyOverlay(grounds = this.grounds): Promise<boolean> {
        if (!this.preview || !this.blueprint || !grounds) return false;
        const preview = this.preview, world = this.blueprint, revision = ++this.terrainRevision;
        const overlay = (document.querySelector('#world-overlay') as HTMLSelectElement).value;
        this.canvas.dataset.terrainStudyPending = 'true';
        try {
            const next = await createBlueprintTerrainAsync(world, grounds.materials,
                overlay === 'sites' ? 'form' : overlay, undefined, grounds.blending,
                (document.querySelector('#world-snow-study') as HTMLInputElement).checked,
                undefined, this.selectedShading());
            if (!this.alive || this.preview !== preview || this.blueprint !== world || revision !== this.terrainRevision) {
                disposeBlueprintTerrain(next);
                return false;
            }
            const previous = preview.terrain;
            preview.macroOverlay.visible = overlay === 'macro';
            preview.siteOverlay.visible = overlay === 'sites';
            this.canvas.dataset.overlay = overlay;
            next.visible = previous.visible;
            preview.root.remove(previous);
            disposeBlueprintTerrain(previous);
            preview.root.add(next);
            preview.terrain = next;
            this.canvas.dataset.spatial = JSON.stringify(next.userData.spatial);
            this.canvas.dataset.terrainShading = JSON.stringify(next.userData.terrainShading);
            return true;
        } finally {
            if (revision === this.terrainRevision) this.canvas.dataset.terrainStudyPending = 'false';
        }
    }

    private syncEnvironmentControls() {
        document.querySelectorAll<HTMLOptionElement>('[data-spatial-overlay]').forEach(option => {
            option.disabled = !this.blueprint;
        });
        const enabled = !!this.blueprint?.environment;
        (document.querySelector('#world-environment-zoning') as HTMLInputElement).checked = enabled;
        document.querySelectorAll<HTMLOptionElement>('[data-environment-overlay]').forEach(option => {
            option.disabled = !enabled;
        });
        const overlay = document.querySelector('#world-overlay') as HTMLSelectElement;
        if ((!enabled && overlay.value in environmentOverlays) ||
            (!this.blueprint && overlay.value in spatialOverlays)) {
            overlay.value = 'none';
        }
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
        const extent = world.config.width;
        const fit = Math.max(1, 1 / this.camera.aspect);
        presets['island-overhead'] = { position: [0, extent * 1.1 * fit, .01], target: [0, 0, 0] };
        // Frame the full irregular coast, including headlands nearest the camera.
        presets['island-oblique'] = { position: [extent * .52 * fit, extent * .806 * fit, -extent * .585 * fit],
            target: [0, 8, 0] };
        if (world.config.preset === 'island' && view === 'shore') {
            const surface = createBlueprintSurface(world);
            const distance = Math.hypot(x-harbor.x,z-harbor.z) || 1;
            const dx = (x-harbor.x)/distance, dz = (z-harbor.z)/distance;
            const cameraX = harbor.x-dx*60-dz*20, cameraZ = harbor.z-dz*60+dx*20;
            const targetX = harbor.x+dx*35, targetZ = harbor.z+dz*35;
            presets.shore = {
                position: [cameraX,Math.max(18,surface.surfaceHeightAt(cameraX,cameraZ)+12),cameraZ],
                target: [targetX,surface.surfaceHeightAt(targetX,targetZ)+6,targetZ]
            };
        }
        const startView = settlementStartingViews(world).find(p => p.id === 'player-start-camera')!;
        presets['player-start'] = { position: [startView.x, startView.y, startView.z],
            target: [x, world.settlement.elevation + 6, z] };
        this.camera.far = world.config.preset === 'island' ? Math.max(1200, extent * 5 * fit) : view.startsWith('island-') ? 500 : 300;
        this.camera.updateProjectionMatrix();
        const preset = groundStudyCamera(world, view) ?? presets[view] ?? presets.village;
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
        document.querySelector<HTMLElement>('#world-spatial-diagnostics')!.hidden = true;
        document.querySelector<HTMLElement>('#world-spatial-diagnostics')!.replaceChildren();
        delete this.canvas.dataset.spatial;
        document.querySelector<HTMLElement>('#world-sites-diagnostics')!.hidden = true;
        document.querySelector<HTMLElement>('#world-environment-diagnostics')!.hidden = true;
        this.camera.far = 300;
        this.camera.updateProjectionMatrix();
        this.revision++;
        this.terrainRevision++;
        this.canvas.dataset.terrainStudyPending = 'false';
        delete this.canvas.dataset.terrainShading;
        this.generator.cancel();
        this.cancelGeneration.hidden = true;
        this.generate.disabled = false;
        this.release(this.preview);
        this.preview = null;
        this.blueprint = null;
        this.syncEnvironmentControls();
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
        disposeMacroOverlay(preview.macroOverlay);
        disposeMacroOverlay(preview.siteOverlay);
        preview.nature.traverse(node => { if (node instanceof InstancedMesh) node.dispose(); });
        for (const actor of preview.actors) actor.model.dispose();
        preview.root.clear();
    }

    dispose() {
        this.alive = false;
        this.generator.dispose();
        this.revision++;
        this.release(this.preview);
        this.preview = null;
        this.grounds?.dispose();
        this.grounds = null;
    }
}
