import { wildlifeAttentionAdapter } from '../lore/WildlifeAttention';
import { AttentionHistoryIndex } from '../lore/AttentionHistory';
import { WildlifeHistoryIndex } from '../lore/WildlifeHistory';
import { initializeWildlifeSightings, assertWildlifeWorld } from '../simulation/WildlifeSightings';
import { assertSpatialWorld, exploreOffer, startExpeditionOffer, expeditionModeActive, type PhysicalExpeditionContext } from '../simulation/SpatialExpeditions';
import { islandMissionOffer, type IslandTarget } from '../simulation/IslandMissions';
import { boardLongshipOffer, disembarkLongshipOffer, longshipFoodOffer } from '../simulation/LongshipTransport';
import type { Cargo, MissionType } from '../simulation/WorldExpeditions';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { birthdayCalendarMode } from '../simulation/BirthdayCalendar';
import { freezeReadView } from './ReadView';
import { FamilyTreeIndex } from '../lore/FamilyTree';
import { PersonalHistoryIndex } from '../lore/PersonalHistory';
import { ClanBook } from '../lore/ClanBook';
import { createCampaign, applyCommand, serializeState, reconstructState, initializePhysicalDiscovery, initializeIslandClans } from '../simulation/SimulationCore';
import type { BirthdayCalendarMode, CampaignLivestockRules, FoundingPhase, SimulationCommand, SimulationState } from '../simulation/SimulationCore';
/** Browser pacing is transient; only explicit commands change canonical state. */
export class GameplaySession {
    private state: SimulationState;
    private physicalWorld?: PhysicalExpeditionContext;
    private physicalExclusions?: () => PhysicalExpeditionContext['exclusions'];
    private physicalShips?: () => PhysicalExpeditionContext['longshipOrigins'];
    bindPhysicalWorld(world: PhysicalExpeditionContext['world'], worldId: string,
        exclusions?: () => PhysicalExpeditionContext['exclusions'],
        ships?: () => PhysicalExpeditionContext['longshipOrigins']): void {
        const fullWorld = world as WorldBlueprint;
        const context = { world, worldId, ...(fullWorld.config && fullWorld.coast && fullWorld.biomes && fullWorld.placementPlan ? { wildlifeWorld: fullWorld } : {}) };
        assertSpatialWorld(this.state, context);
        assertWildlifeWorld(this.state, context);
        this.physicalWorld = context;
        this.physicalExclusions = exclusions;
        this.physicalShips = ships;
    }
    private physicalContext() {
        return this.physicalWorld && { ...this.physicalWorld, exclusions: this.physicalExclusions?.(),
            longshipOrigins: this.physicalShips?.() };
    }
    boardLongshipOffer(groupId: string, shipId: string, origins?: Record<string, { x: number; z: number }>) {
        return boardLongshipOffer(this.state, groupId, shipId, this.physicalContext(), origins);
    }
    disembarkLongshipOffer(groupId: string) {
        return disembarkLongshipOffer(this.state, groupId, this.physicalContext());
    }
    longshipFoodOffer(groupId: string) {
        return longshipFoodOffer(this.state, groupId, this.physicalContext());
    }
    startExpeditionOffer(groupId: string, testFoodPerMember?: number) {
        return startExpeditionOffer(this.state, groupId, this.physicalContext(), testFoodPerMember);
    }
    islandMissionOffer(groupId: string, target: IslandTarget, type: MissionType,
        priorities: Cargo[] = [], origins?: Record<string, { x: number; z: number }>) {
        return islandMissionOffer(this.state, groupId, target, type, priorities, this.physicalContext(), origins);
    }
    get expeditionMode() { return expeditionModeActive(this.state); }
    get effectiveMinutesPerWinter() {
        return this.expeditionMode ? 10 * this.state.ticksPerWinter / 1000 : this.minutesPerWinter;
    }
    exploreOffer(groupId: string, target: { x: number; z: number }, origins?: Record<string, { x: number; z: number }>) {
        return exploreOffer(this.state, groupId, target, this.physicalContext(), origins);
    }
    private canonicalRevision = 0;
    private readState?: Readonly<SimulationState>;
    private serializedState?: string;
    get revision(): number { return this.canonicalRevision; }
    /** One deeply frozen, isolated UI copy per committed revision. snapshot() still returns owned copies. */
    readSnapshot(): Readonly<SimulationState> {
        return this.readState ??= freezeReadView(this.snapshot());
    }
    private invalidateRead(): void {
        this.canonicalRevision++;
        this.readState = undefined;
        this.serializedState = undefined;
    }
    private attentionIndex = new AttentionHistoryIndex([wildlifeAttentionAdapter]);
    attentionHistory() {
        this.attentionIndex.append(this.state.events);
        return this.attentionIndex;
    }
    private familyIndex = new FamilyTreeIndex();
    familyTree() {
        return this.familyIndex.read(this.state);
    }
    private wildlifeIndex = new WildlifeHistoryIndex();
    wildlifeHistory() {
        this.wildlifeIndex.append(this.state.events, this.state.clan.id);
        return this.wildlifeIndex;
    }
    private personalIndex = new PersonalHistoryIndex();
    private personalBookKey = '';
    private historyGeneration = 0;
    get personalHistoryEpoch(): number {
        return this.historyGeneration;
    }
    personalHistory(personaId: string, limit = 10, offset = 0) {
        if (!this.state.personas[personaId] && !this.state.personaArchive?.[personaId])
            return {personaId, records:[], totalRecords:0, partialAttribution:false};
        this.personalIndex.append(this.state.events);
        if (this.personalBookKey !== this.book.publicationKey) {
            this.personalIndex.publish(this.book.snapshot().chapters);
            this.personalBookKey = this.book.publicationKey;
        }
        return this.personalIndex.read(personaId, limit, offset);
    }
    personalHistoryReference(personaId: string, eventId: string,
        chapterIndex: number, paragraphIndex: number | null): boolean {
        this.personalHistory(personaId);
        return this.personalIndex.hasReference(personaId, eventId, chapterIndex, paragraphIndex);
    }
    book: ClanBook;
    private fractionalTicks = 0;
    trend = { food: 0, materials: 0 };
    running = false;
    minutesPerWinter = 3;
    constructor(seed = 32, narrativeSeed?: number, socialEnabled = true, foundingPhase?: FoundingPhase,
        calendarMode?: BirthdayCalendarMode, livestock?: CampaignLivestockRules) {
        this.state = createCampaign(seed, {}, {}, {}, {}, {enabled: socialEnabled}, {}, foundingPhase, calendarMode, livestock);
        this.book = new ClanBook(this.state, true, narrativeSeed);
    }
    initializeWildlife(): void {
        const world = this.physicalWorld?.wildlifeWorld;
        if (!world || !this.physicalWorld) throw new Error('Wildlife requires a physical island.');
        this.state = initializeWildlifeSightings(this.state, world, this.physicalWorld.worldId);
        this.invalidateRead();
    }
    initializeDiscovery(world: WorldBlueprint, worldId: string): void {
        this.state = initializePhysicalDiscovery(this.state, world, worldId);
        this.bindPhysicalWorld(world, worldId);
        this.invalidateRead();
    }
    initializeIslandClans(world: WorldBlueprint, worldId: string): void {
        const next = initializeIslandClans(this.state, world, worldId);
        assertSpatialWorld(next, { world, worldId });
        this.state = next;
        this.bindPhysicalWorld(world, worldId);
        if (this.physicalWorld?.wildlifeWorld) this.initializeWildlife();
        else this.invalidateRead();
    }
    snapshot(): SimulationState {
        return structuredClone(this.state);
    }
    setRunning(running: boolean): void {
        this.running = running;
    }
    setMinutesPerWinter(minutes: number): void {
        if (![1, 3, 5].includes(minutes))
            throw new Error('Choose 1, 3 or 5 minutes per Winter');
        this.minutesPerWinter = minutes;
    }
    command(command: SimulationCommand): void {
        let next: SimulationState;
        let book = this.book;
        const ticks = command.type === 'AdvanceWinter' ? this.state.ticksPerWinter :
            command.type === 'AdvanceTicks' ? command.ticks : 0;
        const untilChapter = (book.nextWinter - this.state.time.winter) * this.state.ticksPerWinter - this.state.time.tick;
        if (Number.isSafeInteger(ticks) && Number.isSafeInteger(this.state.time.tick + ticks) &&
            Number.isSafeInteger(this.state.time.winter + Math.floor((this.state.time.tick + ticks) / this.state.ticksPerWinter)) &&
            ticks >= untilChapter && untilChapter > 0) {
            next = this.state;
            book = this.book.fork(this.state);
            let remaining = ticks;
            while (remaining > 0) {
                const until = (book.nextWinter - next.time.winter) * next.ticksPerWinter - next.time.tick;
                const step = Math.min(remaining, until);
                next = applyCommand(next, { type: 'AdvanceTicks', ticks: step }, this.physicalContext());
                remaining -= step;
                if (step === until) book.closeCheckpoint(next);
            }
        } else next = applyCommand(this.state, command, this.physicalContext());
        this.trend = { food: next.stocks.food - this.state.stocks.food, materials: next.stocks.materials - this.state.stocks.materials };
        this.state = next;
        this.book = book;
        this.invalidateRead();
    }
    /** UI task transaction: existing zero-time management rules, committed only after all succeed. */
    commandBatch(commands: readonly SimulationCommand[]): void {
        const allowed = new Set([
            'BuildHouse', 'AssignOccupation', 'SpecializeBuilding', 'AssignCattle',
            'AssignLivestock', 'UpgradeBuilding', 'SetSmitheryTarget'
        ]);
        if (commands.length > 64 || commands.some(command => !allowed.has(command.type))) {
            throw new Error('This task contains unsupported management commands.');
        }
        if (!commands.length) return;
        let next = this.state;
        for (const command of commands) next = applyCommand(next, command, this.physicalContext());
        this.trend = { food: next.stocks.food - this.state.stocks.food,
            materials: next.stocks.materials - this.state.stocks.materials };
        this.state = next;
        this.invalidateRead();
    }
    pacing() {
        return { running: this.running, minutesPerWinter: this.minutesPerWinter,
            fractionalTicks: this.fractionalTicks };
    }
    restorePacing(pace: ReturnType<GameplaySession['pacing']>) {
        if (typeof pace.running !== 'boolean' || ![1, 3, 5].includes(pace.minutesPerWinter) ||
            !Number.isFinite(pace.fractionalTicks) || pace.fractionalTicks < 0 || pace.fractionalTicks >= 1)
            throw new Error('Invalid campaign pacing.');
        this.minutesPerWinter = pace.minutesPerWinter;
        this.fractionalTicks = pace.fractionalTicks;
        this.running = pace.running;
    }
    saveJSON(): string {
        return this.serializedState ??= serializeState(this.state);
    }
    loadJSON(serialized: string): void {
        const state = reconstructState(serialized);
        if (!state.mechanics)
            throw new Error('This save has no gameplay mechanics');
        this.replace(state, false);
    }
    newCampaign(seed: number, weatherEnabled = true, socialEnabled = true, foundingPhase = this.state.foundingPhase, calendarMode: BirthdayCalendarMode | undefined = birthdayCalendarMode(this.state), livestock?: CampaignLivestockRules): void {
        this.replace(createCampaign(seed, {}, {}, { enabled: weatherEnabled }, {}, { enabled: socialEnabled }, {}, foundingPhase, calendarMode, livestock));
    }
    /** Prepare a replay without taking ownership of the current campaign or its read state. */
    restartProposal(): GameplaySession {
        const proposal = new GameplaySession();
        proposal.loadJSON(this.saveJSON());
        proposal.restartCampaign(true);
        const replay = proposal.readSnapshot();
        const founders = this.state.landing?.founderIds;
        const identity = (person: SimulationState['personas'][string]) => JSON.stringify({
            id: person.id, name: person.name, dna: person.dna, birthWinter: person.birthWinter,
            birthTick: person.birthTick, parentIds: person.parentIds, originClanId: person.originClanId,
        });
        const partners = (state: Readonly<SimulationState>) => state.events
            .filter(event => event.type === 'FoundingPartnershipPresent')
            .map(event => JSON.stringify([...(event.details?.participants as string[] ?? [])].sort())).sort();
        if (!founders || founders.some(id => {
            const original = this.state.personas[id] ?? this.state.personaArchive?.[id];
            return !original || !replay.personas[id] || identity(original) !== identity(replay.personas[id]);
        }) || JSON.stringify(partners(this.state)) !== JSON.stringify(partners(replay))) {
            throw new Error('This save cannot faithfully recreate its original founders. Continue or start a new scenario.');
        }
        return proposal;
    }
    restartCampaign(sameFounders = false, drawSeed: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0], weatherEnabled = this.state.weather?.config.enabled ?? false, socialEnabled = this.state.social?.config.enabled ?? false, foundingPhase = this.state.foundingPhase): void {
        let seed = sameFounders ? this.state.seed : drawSeed();
        if (!sameFounders && seed === this.state.seed)
            seed = (seed + 1) >>> 0;
        const targetLandingConfigs = Object.fromEntries(Object.entries(this.state.world?.targetClans ?? {})
            .filter(([, target]) => target.landing)
            .map(([id, target]) => [id, target.landing!.config]));
        const livestock = {
            player: this.state.landing?.livestock,
            targetClans: Object.fromEntries(Object.entries(this.state.world?.targetClans ?? {})
                .filter(([, target]) => target.landing?.livestock)
                .map(([id, target]) => [id, target.landing!.livestock!])),
        };
        this.replace(createCampaign(seed, this.state.landing?.config, this.state.mechanics?.config, { ...this.state.weather?.config, enabled: weatherEnabled }, this.state.world?.config, { ...this.state.social?.config, enabled: socialEnabled }, targetLandingConfigs, foundingPhase, birthdayCalendarMode(this.state), livestock));
    }
    private replace(state: SimulationState, fresh = true): void {
        this.physicalWorld = undefined;
        this.physicalExclusions = undefined;
        this.attentionIndex = new AttentionHistoryIndex([wildlifeAttentionAdapter]);
        this.familyIndex = new FamilyTreeIndex();
        this.personalIndex = new PersonalHistoryIndex();
        this.wildlifeIndex = new WildlifeHistoryIndex();
        this.personalBookKey = '';
        this.historyGeneration++;
        this.state = state;
        this.invalidateRead();
        this.book = new ClanBook(state, fresh);
        this.running = false;
        this.fractionalTicks = 0;
        this.trend = { food: 0, materials: 0 };
    }
    elapse(milliseconds: number): void {
        if (!Number.isFinite(milliseconds) || milliseconds < 0)
            throw new Error('Invalid active elapsed time');
        if (!this.running)
            return;
        let remaining = milliseconds;
        // Cross the final expedition tick at its own pace, then spend remaining active time normally.
        // The normal user preference and fractional canonical tick are never replaced by mode state.
        while (remaining > 1e-9) {
            const tickMilliseconds = this.effectiveMinutesPerWinter * 60000 / this.state.ticksPerWinter;
            if (!this.expeditionMode) {
                const ticks = this.fractionalTicks + remaining / tickMilliseconds;
                const whole = Math.floor(ticks + 1e-9);
                if (whole) this.command({ type: 'AdvanceTicks', ticks: whole });
                this.fractionalTicks = Math.max(0, ticks - whole);
                break;
            }
            const untilTick = (1 - this.fractionalTicks) * tickMilliseconds;
            if (remaining + 1e-9 < untilTick) {
                this.fractionalTicks += remaining / tickMilliseconds;
                break;
            }
            remaining = Math.max(0, remaining - untilTick);
            this.command({ type: 'AdvanceTicks', ticks: 1 });
            this.fractionalTicks = 0;
        }
    }
}
