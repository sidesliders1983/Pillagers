import { foundingTime } from '../simulation/FoundingPhase';
import { initializeIslandClans } from '../simulation/SimulationCore';
import { inspectRivalSettlement, projectRivalSettlement, type ObservedRivalSettlement } from './RivalSettlement';
import { assertDiscoveryWorld } from '../simulation/ClanDiscovery';
import { freezeReadView } from '../gameplay-lab/ReadView';
import type { SimulationState } from '../simulation/SimulationCore';
import { createCampaignIsland, campaignIslandPlan, type CampaignGeography } from './CampaignIsland';
import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { generateWorld } from '../world-generation/GenerateWorld';
import { parseWorld } from '../world-generation/WorldSave';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createFjordLayout, fjordPlotFits, geographyIdentity, projectFjordSettlement, settlementCampfire } from './FjordProjection';
import type { FjordLayout, FjordTransform } from './FjordProjection';
export const sharedCampaignKey = 'pillagers.gameplay-lab.v1';
export const fjordCampaignKey = 'pillagers.fjord-play.v1';
/** Presentation adapter around the very same session used by both existing gameplay views. */
type FjordCampaignProjection = ReturnType<typeof projectFjordSettlement> & { rival: ObservedRivalSettlement };
export class FjordCampaign {
    private rivalLayout?: FjordLayout;
    private fresh = true;
    private readView?: Readonly<FjordCampaignProjection>;
    private readRevision = -1;
    private readBlueprint?: WorldBlueprint;
    private readLayout = '';
    blueprint!: WorldBlueprint;
    layout!: FjordLayout;
    selection: {
        kind: string;
        id: string;
    } | null = null;
    constructor(readonly session: GameplaySession, private geography: CampaignGeography = 'legacy', restored?: string) {
        // Import validates a complete proposal before committing. A known save needs no throwaway geography.
        if (restored !== undefined) { this.importJSON(restored); return; }
        this.blueprint = geography === 'island-pool-v1' ? createCampaignIsland(session.snapshot().seed) :
            generateWorld({ seed: session.snapshot().seed, conifers: 'ez-tree' });
        this.layout = createFjordLayout(this.blueprint, undefined, session.snapshot().seed);
        this.bindExpeditionWorld();
    }
    private bindExpeditionWorld() {
        this.session.bindPhysicalWorld(this.blueprint, geographyIdentity(this.blueprint), () => {
            const fire = settlementCampfire(this.blueprint);
            const state = this.session.readSnapshot(), link = state.world?.island;
            const rival = link ? projectRivalSettlement(state.world!.targetClans[link.clanId], this.blueprint, this.rivalLayout) : undefined;
            this.rivalLayout = rival?.layout;
            const rivalFire = rival?.campfire.transform;
            return [...Object.values(this.layout.plots), ...(campaignIslandPlan(this.blueprint)?.plots ?? []),
                ...Object.values(this.rivalLayout?.plots ?? {})]
                .map(plot => ({ minX: plot.x-plot.halfWidth, maxX: plot.x+plot.halfWidth,
                    minZ: plot.z-plot.halfDepth, maxZ: plot.z+plot.halfDepth }))
                .concat([{ minX: fire.transform.x-5, maxX: fire.transform.x+5,
                    minZ: fire.transform.z-5, maxZ: fire.transform.z+5 }], rivalFire ? [{
                        minX: rivalFire.x-5, maxX: rivalFire.x+5, minZ: rivalFire.z-5, maxZ: rivalFire.z+5
                    }] : []);
        });
    }
    enableDiscovery(): void {
        if (!campaignIslandPlan(this.blueprint)) throw new Error('Discovery requires a physical island campaign.');
        const state = this.session.readSnapshot(), worldId = geographyIdentity(this.blueprint);
        const founding = foundingTime(state.foundingPhase);
        if (this.fresh && !state.discovery && state.time.winter === founding.winter && state.time.tick === founding.tick) {
            const proposal = initializeIslandClans(state, this.blueprint, worldId);
            const target = proposal.world!.targetClans[proposal.world!.island!.clanId];
            const rival = projectRivalSettlement(target, this.blueprint);
            if (rival.entities.some(entity => !entity.transform && !entity.status.indoorReason))
                throw new Error('The rival founding population cannot safely occupy the reserved site.');
            this.session.initializeIslandClans(this.blueprint, worldId);
            this.rivalLayout = rival.layout;
        } else this.session.initializeDiscovery(this.blueprint, worldId);
        this.bindExpeditionWorld();
    }
    project(state: SimulationState = this.session.snapshot()): FjordCampaignProjection {
        const view = projectFjordSettlement(state, this.blueprint, this.layout);
        this.layout = view.layout;
        const link = state.world?.island;
        const rival = link ? projectRivalSettlement(state.world!.targetClans[link.clanId], this.blueprint, this.rivalLayout) : undefined;
        this.rivalLayout = rival?.layout;
        return { ...view, rival: inspectRivalSettlement(state, this.blueprint, rival) };
    }
    /** Cached immutable presentation read; the public project() remains an owned mutable result. */
    readProjection() {
        const layoutKey = JSON.stringify([this.layout, this.rivalLayout]);
        if (!this.readView || this.readRevision !== this.session.revision ||
            this.readBlueprint !== this.blueprint || this.readLayout !== layoutKey) {
            const view = this.project(this.session.readSnapshot());
            // The adapter owns a mutable layout; readers must not freeze or mutate it through the view.
            this.readView = freezeReadView(structuredClone(view));
            this.readRevision = this.session.revision;
            this.readBlueprint = this.blueprint;
            this.readLayout = JSON.stringify([this.layout, this.rivalLayout]);
        }
        return this.readView;
    }
    setMooring(transform: FjordTransform) {
        if (this.layout.mooringResolved)
            return;
        this.layout.mooring = { ...transform };
        this.layout.mooringResolved = true;
    }
    exportData() {
        this.readProjection();
        // Preserve authoritative serialization validation, once for each committed Core revision.
        this.session.saveJSON();
        const state = this.session.readSnapshot();
        const island = campaignIslandPlan(this.blueprint)?.recipe;
        return { bridgeVersion: island ? 2 : 1, campaign: state,
            ...(island ? { island } : { blueprint: this.blueprint }), layout: this.layout, selection: this.selection,
            ...(this.rivalLayout ? { rivalLayout: this.rivalLayout } : {}),
            narrative: this.session.book.save(state) };
    }
    exportJSON() {
        return JSON.stringify(this.exportData());
    }
    importJSON(text: string) {
        if (text.length > 24000000)
            throw new Error('Campaign file exceeds the 24MB limit.');
        const saved = JSON.parse(text);
        const proposal = new GameplaySession();
        const extended = saved.bridgeVersion !== undefined;
        if (extended && ![1, 2].includes(saved.bridgeVersion))
            throw new Error('Unsupported Fjord campaign version.');
        proposal.loadJSON(extended ? JSON.stringify(saved.campaign) : text);
        if (saved.narrative) proposal.book.restore(saved.narrative, proposal.snapshot());
        const seed = proposal.snapshot().seed;
        if (saved.bridgeVersion === 2 && !saved.island) throw new Error('Missing campaign island recipe.');
        const blueprint = saved.bridgeVersion === 2 ? createCampaignIsland(seed, saved.island) :
            extended ? parseWorld(JSON.stringify({ schemaVersion: 1, blueprint: saved.blueprint })) :
                seed === this.layout?.seed ? this.blueprint : this.createGeography(seed);
        if (!campaignIslandPlan(blueprint) && blueprint.config.seed !== seed)
            throw new Error('Campaign and geography seed identities do not match.');
        let layout = extended ? saved.layout as FjordLayout :
            seed === this.layout?.seed ? structuredClone(this.layout) : createFjordLayout(blueprint, undefined, seed);
        const legacyLayout = saved.layout?.version === 'fjord-layout-v1';
        if (!layout || layout.seed !== seed || layout.geographyId !== geographyIdentity(blueprint))
            throw new Error('Campaign and presentation identities do not match.');
        const parcelHalfSize = legacyLayout ? 6.5 : 7.5;
        const finiteTransform = (p: FjordTransform) => p &&
            [p.x, p.y, p.z, p.rotation, p.scale].every(Number.isFinite) && p.scale === 1;
        if (!layout || !layout.plots || !layout.points || !finiteTransform(layout.mooring) ||
            !Object.values(layout.plots).every(p => finiteTransform(p) &&
                p.halfWidth === parcelHalfSize && p.halfDepth === parcelHalfSize) ||
            !Object.values(layout.points).every(finiteTransform))
            throw new Error('Invalid presentation layout.');
        if (campaignIslandPlan(blueprint)) {
            const expected = createFjordLayout(blueprint, undefined, seed).mooring;
            if (JSON.stringify(layout.mooring) !== JSON.stringify(expected) || !layout.mooringResolved)
                throw new Error('Invalid island mooring in presentation layout.');
        }
        const plots = Object.values(layout.plots);
        const fire = settlementCampfire(blueprint);
        if (!legacyLayout && plots.some(p => Math.hypot(
            Math.max(0, Math.abs(p.x - fire.transform.x) - p.halfWidth),
            Math.max(0, Math.abs(p.z - fire.transform.z) - p.halfDepth)) < fire.clearingRadius))
            throw new Error('A presentation plot occupies the campfire clearing.');
        if (typeof layout.mooringResolved !== 'boolean' || plots.some(p => !fjordPlotFits(blueprint, p)))
            throw new Error('Invalid plot support in presentation layout.');
        for (let i = 0; i < plots.length; i++)
            for (const q of plots.slice(i + 1)) {
                const p = plots[i];
                if (Math.abs(p.x - q.x) <= p.halfWidth + q.halfWidth &&
                    Math.abs(p.z - q.z) <= p.halfDepth + q.halfDepth)
                    throw new Error('Overlapping presentation plots.');
            }
        const surface = createBlueprintSurface(blueprint);
        if (Object.values(layout.points).some(p => Math.abs(p.y - surface.surfaceHeightAt(p.x, p.z)) > 1e-6 ||
            p.y <= blueprint.waterLevel + .25))
            throw new Error('Invalid outdoor support in presentation layout.');
        // Old parcels did not reserve a nucleus or the full sweep of upgraded homes.
        // Rebuild presentation only; retain geography, mooring and every canonical fact.
        if (legacyLayout) {
            const resolved = layout.mooringResolved;
            layout = createFjordLayout(blueprint, layout.mooring, seed);
            layout.mooringResolved = resolved;
        }
        const discovery = proposal.readSnapshot().discovery;
        if (discovery) assertDiscoveryWorld(discovery, blueprint, geographyIdentity(blueprint));
        proposal.bindPhysicalWorld(blueprint, geographyIdentity(blueprint));
        const view = projectFjordSettlement(proposal.snapshot(), blueprint, layout);
        const rivalLink = proposal.readSnapshot().world?.island;
        if (!rivalLink && saved.rivalLayout) throw new Error('Unexpected rival layout in a legacy campaign.');
        const rival = rivalLink ? projectRivalSettlement(proposal.readSnapshot().world!.targetClans[rivalLink.clanId],
            blueprint, saved.rivalLayout) : undefined;
        this.session.loadJSON(proposal.saveJSON());
        this.session.book.restore(proposal.book.save(proposal.snapshot()), this.session.snapshot());

        this.blueprint = blueprint;
        if (saved.bridgeVersion === 2) this.geography = 'island-pool-v1';
        this.layout = view.layout;
        this.rivalLayout = rival?.layout;
        this.bindExpeditionWorld();
        this.fresh = false;
        this.selection = extended && saved.selection && typeof saved.selection.kind === 'string' &&
            typeof saved.selection.id === 'string' ? saved.selection : null;
    }
    startCampaign(proposal: GameplaySession, geography = this.geography) {
        const next = new FjordCampaign(proposal, geography);
        // Project and validate the complete proposal before committing any canonical state.
        this.importJSON(next.exportJSON());
        this.geography = geography;
        this.fresh = true;
    }
    private createGeography(seed: number) {
        return this.geography === 'island-pool-v1' ? createCampaignIsland(seed) :
            generateWorld({ seed, conifers: 'ez-tree' });
    }
    restart(sameFounders = true, weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false, foundingPhase = this.session.snapshot().foundingPhase) {
        const proposal = new GameplaySession();
        proposal.loadJSON(this.session.saveJSON());
        proposal.restartCampaign(sameFounders, undefined, weatherEnabled, undefined, foundingPhase);
        if (!sameFounders) {
            this.startCampaign(proposal);
            return;
        }
        const saved = JSON.parse(this.exportJSON());
        saved.campaign = JSON.parse(proposal.saveJSON());
        saved.narrative = proposal.book.save(proposal.snapshot());
        saved.layout = createFjordLayout(this.blueprint,
            this.layout.mooringResolved ? this.layout.mooring : undefined, proposal.snapshot().seed);
        saved.selection = null;
        delete saved.rivalLayout;
        this.importJSON(JSON.stringify(saved));
        this.fresh = true;
    }
}
