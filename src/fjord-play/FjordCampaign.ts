import { WeddingInvitationHistory } from './WeddingInvitationState';
import type { PresenceSite } from '../simulation/ResidentPresence';
import { planRoute, maximumTargetCorrection } from '../world-generation/LandRoutes';
import { residentMovementConfig } from '../systems/SocialEncounters';
import { communityHearthBounds, findCommunityHearthPlacement,
    inspectCommunityHearthPlacement, resolveCommunityHearthPlacement,
    type CommunityHearthPlacementResult } from './CommunityHearthPlacement';
import { communityHearthGeometry, communityHearthObstacleBounds } from './CommunityHearthGeometry';
import type { WeddingCandidate } from '../simulation/CulturalEvents';
import { readFirstSteps, type FirstStepsProgress } from './FirstStepsState';
import { migrateWildlifeAttention } from '../lore/WildlifeAttention';
import { attentionAlerts, eventOrdinal, type AttentionRecord, type AttentionAlert } from '../lore/AttentionHistory';
import { createAttentionMetadata, validateAttentionMetadata, reconcileAttention, attentionRead,
    readAttentionEvents, acknowledgeAttention, type AttentionMetadata } from '../lore/AttentionState';
import { foundingTime } from '../simulation/FoundingPhase';
import { initializeIslandClans } from '../simulation/SimulationCore';
import { inspectRivalSettlement, projectRivalSettlement, type ObservedRivalSettlement } from './RivalSettlement';
import { assertDiscoveryWorld } from '../simulation/ClanDiscovery';
import { freezeReadView } from '../gameplay-lab/ReadView';
import type { SimulationState } from '../simulation/SimulationCore';
import { createCampaignIsland, campaignIslandPlan, prepareMiningIsland, islandRecipe, type CampaignGeography } from './CampaignIsland';
import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { generateWorld } from '../world-generation/GenerateWorld';
import { parseWorld } from '../world-generation/WorldSave';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { WorldBlueprint, Point2 } from '../world-generation/WorldBlueprint';
import { createFjordLayout, fjordPlotFits, geographyIdentity, longshipBerth, projectFjordSettlement, settlementCampfire } from './FjordProjection';
import type { FjordLayout, FjordTransform } from './FjordProjection';
export const sharedCampaignKey = 'pillagers.gameplay-lab.v1';
export const fjordCampaignKey = 'pillagers.fjord-play.v1';
/** Presentation adapter around the very same session used by both existing gameplay views. */
type FjordCampaignProjection = ReturnType<typeof projectFjordSettlement> & { rival: ObservedRivalSettlement };
export class FjordCampaign {
    firstSteps?: FirstStepsProgress;
    private rivalLayout?: FjordLayout;
    private fresh = true;
    private invitationHistory!: WeddingInvitationHistory;
    private invitationEpoch = -1;
    private invitationRevision = -1;
    private invitationCandidates: WeddingCandidate[] = [];
    weddingInvitations() {
        const state = this.session.readSnapshot();
        if (this.invitationEpoch !== this.session.personalHistoryEpoch) {
            this.invitationHistory = WeddingInvitationHistory.restore(undefined, state, this.attentionView().records);
            this.invitationEpoch = this.session.personalHistoryEpoch;
            this.invitationRevision = -1;
        }
        if (this.invitationRevision !== this.session.revision) {
            this.invitationCandidates = this.invitationHistory.reconcile(state);
            this.invitationRevision = this.session.revision;
        }
        return freezeReadView(this.invitationCandidates);
    }
    weddingInvitationOffer(sourceId: string) {
        this.weddingInvitations();
        return this.invitationHistory.offer(this.session.readSnapshot(), sourceId);
    }
    resolveWeddingInvitation(sourceId: string) {
        this.weddingInvitations();
        this.invitationHistory.resolve(sourceId);
        this.invitationRevision = -1;
    }
    private weddingInvitationSave() {
        this.weddingInvitations();
        return this.invitationHistory.save();
    }
    private attentionMetadata!: AttentionMetadata;
    private attentionCoreRevision = -1;
    private attentionRecords: AttentionRecord[] = [];
    private currentAlerts: AttentionAlert[] = [];
    private attentionCache?: ReturnType<FjordCampaign['buildAttentionView']>;
    private buildAttentionView() {
        const records = this.attentionRecords.map(record => ({ ...record, read: attentionRead(this.attentionMetadata, record.eventId) }));
        const alerts = this.currentAlerts.map(alert => ({ ...alert,
            ...this.attentionMetadata.alerts.find(saved => saved.id === alert.id)! }));
        return freezeReadView({ records, alerts,
            unreadCount: records.filter(record => !record.read).length + alerts.filter(alert => !alert.acknowledged).length });
    }
    attentionView() {
        if (this.attentionCoreRevision !== this.session.revision) {
            const index = this.session.attentionHistory();
            this.attentionRecords = index.retained();
            this.currentAlerts = attentionAlerts(this.session.readSnapshot(), index.strandedIds());
            reconcileAttention(this.attentionMetadata, this.attentionRecords, this.currentAlerts,
                this.session.readSnapshot().events.length);
            this.attentionCoreRevision = this.session.revision;
            this.attentionCache = undefined;
        }
        return this.attentionCache ??= this.buildAttentionView();
    }
    attentionSave() { this.attentionView(); return structuredClone(this.attentionMetadata); }
    attentionSource(eventId: string) {
        const event = this.session.readSnapshot().events[eventOrdinal(eventId) - 1];
        return event?.id === eventId ? this.session.attentionHistory().format(event) : null;
    }
    markAttentionRead(ids: readonly string[]) {
        this.attentionView();
        readAttentionEvents(this.attentionMetadata, this.attentionRecords, ids);
        this.attentionCache = undefined;
    }
    acknowledgeAttention(id: string, since: number) {
        this.attentionView();
        acknowledgeAttention(this.attentionMetadata, id, since);
        this.attentionCache = undefined;
    }
    markAllAttentionRead() {
        this.attentionView();
        this.attentionMetadata.readThrough = this.session.readSnapshot().events.length;
        this.attentionMetadata.readIds = [];
        this.attentionCache = undefined;
    }
    private readView?: Readonly<FjordCampaignProjection>;
    private readRevision = -1;
    private readBlueprint?: WorldBlueprint;
    private readLayout = '';
    private hearthOffer?: { key: string; result: CommunityHearthPlacementResult };
    blueprint!: WorldBlueprint;
    layout!: FjordLayout;
    selection: {
        kind: string;
        id: string;
    } | null = null;
    constructor(readonly session: GameplaySession, private geography: CampaignGeography = 'legacy', restored?: string) {
        // Import validates a complete proposal before committing. A known save needs no throwaway geography.
        if (restored !== undefined) { this.importJSON(restored); return; }
        this.attentionMetadata = createAttentionMetadata(session.readSnapshot().events.length);
        this.invitationHistory = WeddingInvitationHistory.restore(undefined, session.readSnapshot());
        this.invitationEpoch = session.personalHistoryEpoch;
        this.blueprint = this.createGeography(session.snapshot().seed);
        this.layout = createFjordLayout(this.blueprint, undefined, session.snapshot().seed);
        this.bindExpeditionWorld();
    }
    private presenceBinding?: { key: string; sites: PresenceSite[] };
    private presenceSites(): PresenceSite[] {
        const state = this.session.readSnapshot(), link = state.world?.island;
        if (!link) throw new Error('Territorial reactions need a physical neighbouring clan.');
        const target = state.world!.targetClans[link.clanId];
        const key = JSON.stringify([geographyIdentity(this.blueprint),
            ...[state, target].map(clan => [Object.keys(clan.personas), clan.households,
                clan.residences, clan.buildings]), this.layout.plots, this.rivalLayout?.plots]);
        if (this.presenceBinding?.key === key) return this.presenceBinding.sites;
        // Static, validated residential facts establish homes before canonical presence takes over.
        const local = projectFjordSettlement({ ...state, residentPresence: undefined }, this.blueprint, this.layout);
        const remote = projectRivalSettlement({ ...target, residentPresence: undefined }, this.blueprint, this.rivalLayout);
        this.layout = local.layout;
        this.rivalLayout = remote.layout;
        const exclusions = [...Object.values(local.layout.plots), ...Object.values(remote.layout.plots)]
            .map(plot => ({ minX: plot.x - plot.halfWidth, maxX: plot.x + plot.halfWidth,
                minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth }));
        for (const fire of [local.campfire, remote.campfire]) exclusions.push({
            minX: fire.transform.x - fire.obstacleRadius, maxX: fire.transform.x + fire.obstacleRadius,
            minZ: fire.transform.z - fire.obstacleRadius, maxZ: fire.transform.z + fire.obstacleRadius,
        });
        const routeContext = { world: this.blueprint, exclusions };
        const sites = [state, target].map((clan, index): PresenceSite => {
            const view = index === 0 ? local : remote;
            const center = index === 0 ? this.blueprint.settlement.center : this.blueprint.rivalSite!.center;
            const homes: PresenceSite['homes'] = {};
            const reserveExterior = (preferred: Point2): Point2 => {
                const nav = this.blueprint.navigation;
                const column = Math.round((preferred.x - nav.bounds.minX) / nav.spacing);
                const row = Math.round((preferred.z - nav.bounds.minZ) / nav.spacing);
                const nearby: Point2[] = [];
                const reach = Math.ceil(maximumTargetCorrection / nav.spacing);
                for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
                    const point = { x: nav.bounds.minX + (column + dx) * nav.spacing,
                        z: nav.bounds.minZ + (row + dz) * nav.spacing };
                    if (Math.hypot(point.x - preferred.x, point.z - preferred.z) <= maximumTargetCorrection)
                        nearby.push(point);
                }
                nearby.sort((a, b) => Math.hypot(a.x - preferred.x, a.z - preferred.z) -
                    Math.hypot(b.x - preferred.x, b.z - preferred.z) || a.z - b.z || a.x - b.x);
                for (const point of [preferred, ...nearby]) {
                    if (Math.hypot(point.x - preferred.x, point.z - preferred.z) > maximumTargetCorrection) continue;
                    try {
                        const confirmed = planRoute(routeContext, point, preferred, true).target;
                        if (Math.hypot(confirmed.x - preferred.x, confirmed.z - preferred.z) > maximumTargetCorrection ||
                            Object.values(homes).some(home => Math.hypot(home.x - confirmed.x,
                                home.z - confirmed.z) < residentMovementConfig.radius * 2)) continue;
                        return { x: confirmed.x, z: confirmed.z };
                    } catch { /* Try the next nearby dry exterior through the existing route solver. */ }
                }
                throw new Error('No separate reachable home exterior for territorial presence.');
            };
            for (const [id, person] of Object.entries(clan.personas)) {
                if (person.deathWinter !== null) continue;
                const savedHome = clan.residentPresence?.residents[id]?.home;
                if (savedHome) {
                    homes[id] = { ...savedHome };
                    continue;
                }
                const home = Object.values(clan.households).find(home => home.memberIds.includes(id));
                const residence = home?.residenceId ? clan.residences[home.residenceId] : undefined;
                const plot = residence?.buildingId ? view.layout.plots['building:' + residence.buildingId] :
                    home ? view.layout.plots['household:' + home.id] : undefined;
                const actor = view.entities.find(entity => entity.kind === 'persona' && entity.id === id &&
                    !entity.status.expedition && !entity.status.mining);
                const point = actor?.transform ?? (home?.memberIds.flatMap(member => {
                    const visible = view.entities.find(entity => entity.kind === 'persona' && entity.id === member);
                    return visible?.transform && !visible.status.expedition && !visible.status.mining
                        ? [visible.transform] : [];
                })[0]);
                const fallback = plot ? { x: plot.x, z: plot.z + plot.halfDepth + 1.5 } : center;
                const exterior = { x: point?.x ?? fallback.x, z: point?.z ?? fallback.z };
                homes[id] = reserveExterior(exterior);
            }
            const source = index === 0 ? this.blueprint.settlement.bounds : this.blueprint.rivalSite!.bounds;
            const values = Object.values(homes);
            const terrain = this.blueprint.terrain.bounds;
            const bounds = { minX: Math.max(terrain.minX, Math.min(source.minX, ...values.map(p => p.x)) - 1),
                maxX: Math.min(terrain.maxX, Math.max(source.maxX, ...values.map(p => p.x)) + 1),
                minZ: Math.max(terrain.minZ, Math.min(source.minZ, ...values.map(p => p.z)) - 1),
                maxZ: Math.min(terrain.maxZ, Math.max(source.maxZ, ...values.map(p => p.z)) + 1) };
            return { clanId: clan.clan.id, center: { ...center }, bounds, homes };
        });
        this.presenceBinding = { key, sites };
        return sites;
    }
    enableTerritorialAwareness(): void {
        this.session.initializeTerritory();
    }
    private bindExpeditionWorld() {
        this.session.bindPhysicalWorld(this.blueprint, geographyIdentity(this.blueprint), () => {
            const fire = settlementCampfire(this.blueprint);
            const state = this.session.readSnapshot(), link = state.world?.island;
            const rival = link ? projectRivalSettlement(state.world!.targetClans[link.clanId], this.blueprint, this.rivalLayout) : undefined;
            this.rivalLayout = rival?.layout;
            const rivalFire = rival?.campfire.transform;
            const community = state.communityHearth;
            const resolved = community && community.tier > 0 && community.placement
                ? resolveCommunityHearthPlacement({ world: this.blueprint, worldId: geographyIdentity(this.blueprint),
                    plots: Object.values(this.layout.plots), paths: [] }, community.placement) : undefined;
            const geometry = resolved?.available && resolved.placement && community && community.tier > 0
                ? communityHearthGeometry(this.blueprint, resolved.placement, community.tier as 1 | 2) : undefined;
            const communityBounds = geometry?.occupancy.map(plot =>
                communityHearthBounds(communityHearthObstacleBounds(plot))) ?? [];
            const fireRadius = geometry ? geometry.fireObstacleRadius + .2 : 5;
            return [...Object.values(this.layout.plots), ...(campaignIslandPlan(this.blueprint)?.plots ?? []),
                ...Object.values(this.rivalLayout?.plots ?? {})]
                .map(plot => ({ minX: plot.x-plot.halfWidth, maxX: plot.x+plot.halfWidth,
                    minZ: plot.z-plot.halfDepth, maxZ: plot.z+plot.halfDepth }))
                .concat(communityBounds, [{ minX: fire.transform.x-fireRadius, maxX: fire.transform.x+fireRadius,
                    minZ: fire.transform.z-fireRadius, maxZ: fire.transform.z+fireRadius }], rivalFire ? [{
                        minX: rivalFire.x-5, maxX: rivalFire.x+5, minZ: rivalFire.z-5, maxZ: rivalFire.z+5
                    }] : []);
        }, () => Object.fromEntries(Object.keys(this.session.readSnapshot().landing?.longships ?? {})
            .map(id => [id, longshipBerth(this.layout.mooring)])), () => this.presenceSites());
    }
    /** Prepare new-campaign deposits before discovery/founding; historical worlds stay unchanged. */
    prepareMining(): void {
        const state = this.session.readSnapshot(), founding = foundingTime(state.foundingPhase);
        if (!this.fresh || state.discovery || state.time.winter !== founding.winter || state.time.tick !== founding.tick)
            throw new Error('Choose Mining when creating a new island campaign.');
        this.blueprint = prepareMiningIsland(this.blueprint);
        this.layout = createFjordLayout(this.blueprint, undefined, state.seed);
        this.bindExpeditionWorld();
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
    /** A new receipt stores the fire anchor. Detached trial receipts remain unchanged history. */
    communityHearthPlacement(preferred?: { x: number; z: number }): CommunityHearthPlacementResult {
        const view = this.readProjection();
        const stored = this.session.readSnapshot().communityHearth?.placement;
        const context = { world: this.blueprint, worldId: geographyIdentity(this.blueprint),
            plots: Object.values(view.layout.plots),
            paths: view.ground.paths.filter(path => path.from !== 'community-hearth').map(path => path.points) };
        const key = JSON.stringify([context.worldId, context.plots, context.paths, stored, preferred]);
        if (this.hearthOffer?.key === key) return structuredClone(this.hearthOffer.result);
        const resolved = stored ? view.communityHearthStatus : undefined;
        const result: CommunityHearthPlacementResult = stored && resolved
            ? { available: resolved.available, reason: resolved.reason,
                ...(resolved.available ? { placement: { ...stored } } : {}) }
            : findCommunityHearthPlacement(context, preferred);
        this.hearthOffer = { key, result };
        return structuredClone(result);
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
            ...(island ? { island, ...(this.blueprint.oreSites ? {oreSites: this.blueprint.oreSites} : {}) } : { blueprint: this.blueprint }), layout: this.layout, selection: this.selection,
            ...(this.rivalLayout ? { rivalLayout: this.rivalLayout } : {}),
            narrative: this.session.book.save(state), attention: this.attentionSave(),
            ...(state.culture ? { weddingInvitations: this.weddingInvitationSave() } : {}),
            ...(this.firstSteps ? { firstSteps: this.firstSteps } : {}) };
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
        const firstSteps = readFirstSteps(saved.firstSteps, proposal.readSnapshot());
        const attention = saved.attention ?? (saved.wildlifeReadIds !== undefined ?
            migrateWildlifeAttention(saved.wildlifeReadIds, proposal.readSnapshot(), proposal.attentionHistory().retained()) :
            createAttentionMetadata(proposal.readSnapshot().events.length));
        validateAttentionMetadata(attention, proposal.readSnapshot());
        const invitationHistory = WeddingInvitationHistory.restore(saved.weddingInvitations, proposal.readSnapshot(),
            proposal.attentionHistory().retained().map(record => ({ ...record, read: attentionRead(attention, record.eventId) })));
        const seed = proposal.snapshot().seed;
        if (saved.bridgeVersion === 2 && !saved.island) throw new Error('Missing campaign island recipe.');
        const baseBlueprint = saved.bridgeVersion === 2 ? createCampaignIsland(seed, saved.island) :
            extended ? parseWorld(JSON.stringify({ schemaVersion: 1, blueprint: saved.blueprint })) :
                seed === this.layout?.seed ? this.blueprint : this.createGeography(seed);
        const blueprint = saved.oreSites ? prepareMiningIsland(baseBlueprint, saved.oreSites) : baseBlueprint;
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
        const community = proposal.readSnapshot().communityHearth;
        if (community && community.tier > 0 && community.placement) {
            const result = view.communityHearthSite ? inspectCommunityHearthPlacement({ world: blueprint,
                worldId: geographyIdentity(blueprint), plots: Object.values(view.layout.plots),
                paths: view.ground.paths.filter(path => path.from !== 'community-hearth').map(path => path.points) },
                view.communityHearthSite.placement) : view.communityHearthStatus!;
            if (!result.available && (!view.communityHearthStatus?.legacy ||
                result.reason === 'Invalid historical Community Hearth placement.'))
                throw new Error('Invalid Community Hearth placement: ' + result.reason);
        }
        const rivalLink = proposal.readSnapshot().world?.island;
        if (!rivalLink && saved.rivalLayout) throw new Error('Unexpected rival layout in a legacy campaign.');
        const rival = rivalLink ? projectRivalSettlement(proposal.readSnapshot().world!.targetClans[rivalLink.clanId],
            blueprint, saved.rivalLayout) : undefined;
        this.session.loadJSON(proposal.saveJSON());
        this.session.book.restore(proposal.book.save(proposal.snapshot()), this.session.snapshot());

        this.blueprint = blueprint;
        this.firstSteps = firstSteps;
        this.attentionMetadata = structuredClone(attention);
        this.invitationHistory = invitationHistory;
        this.invitationEpoch = this.session.personalHistoryEpoch;
        this.invitationRevision = -1;
        this.attentionCoreRevision = -1;
        this.attentionCache = undefined;
        if (saved.bridgeVersion === 2) this.geography = saved.island.version;
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
        return this.geography !== 'legacy' ? createCampaignIsland(seed, islandRecipe(seed, this.geography)) :
            generateWorld({ seed, conifers: 'ez-tree' });
    }
    restart(sameFounders = true, weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false,
        foundingPhase = this.session.snapshot().foundingPhase, prepared?: GameplaySession) {
        const proposal = prepared ?? new GameplaySession();
        if (prepared) {
            const state = prepared.readSnapshot();
            if (!sameFounders || state.seed !== this.session.readSnapshot().seed ||
                state.foundingPhase !== foundingPhase || state.weather?.config.enabled !== weatherEnabled ||
                prepared.saveJSON() !== this.session.restartProposal().saveJSON())
                throw new Error('Prepared founding campaign does not match this replay.');
        } else {
            proposal.loadJSON(this.session.saveJSON());
            proposal.restartCampaign(sameFounders, undefined, weatherEnabled, undefined, foundingPhase);
        }
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
        delete saved.firstSteps;
        delete saved.attention;
        delete saved.weddingInvitations;
        delete saved.wildlifeReadIds;
        delete saved.rivalLayout;
        this.importJSON(JSON.stringify(saved));
        this.fresh = true;
    }
}
