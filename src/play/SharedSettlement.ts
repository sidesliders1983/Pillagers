import { birthdayCalendarMode } from '../simulation/BirthdayCalendar';
import type { PresentationQuality, EffectQuality } from '../config/PresentationQuality';
import { islandRecipe, type IslandRecipe, type CampaignGeography } from '../fjord-play/CampaignIsland';
import { historyIdentity } from '../lore/ClanBook';
import { projectSelection } from './SelectionPresentation';
import { applyCommand } from '../simulation/SimulationCore';
import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { sharedCampaignKey, fjordCampaignKey, FjordCampaign } from '../fjord-play/FjordCampaign';
import type { EntityKind } from './SettlementView';
import type { FoundingPhase, SimulationCommand, SimulationState } from '../simulation/SimulationCore';
export type SettlementView = 'board' | 'fjord';
export type SettlementSelection = {
    kind: EntityKind;
    id: string;
} | null;
export const activeSettlementKey = 'pillagers.fjord-play.active.v1';
/** One canonical campaign, transferred explicitly when a full-page view switch replaces its owner. */
export class SharedSettlement {
    private savedPresentation?: SettlementPresentation;
    get presentation() { return this.savedPresentation ? structuredClone(this.savedPresentation) : undefined; }
    setPresentation(presentation: SettlementPresentation) { this.savedPresentation = copyPresentation(presentation); }
    private availabilityRevision = -1;
    private availabilityCache = new Map<string, ReturnType<typeof commandAvailability>>();
    transferring = false;
    readonly session: GameplaySession;
    readonly fjord: FjordCampaign;
    constructor(seed: number | GameplaySession = 32, narrativeSeed?: number, socialEnabled = true, geography: CampaignGeography = 'legacy', foundingPhase?: FoundingPhase, restored?: string) {
        this.session = typeof seed === 'number' ?
            new GameplaySession(seed, narrativeSeed, socialEnabled, foundingPhase) : seed;
        this.fjord = new FjordCampaign(this.session, geography, restored);
        if (restored !== undefined) this.validateSelection();
    }
    get selection(): SettlementSelection {
        return this.fjord.selection as SettlementSelection;
    }
    select(selection: SettlementSelection) {
        this.fjord.selection = selection;
    }
    selectionPresentation(state = this.session.readSnapshot(), entities = this.fjord.readProjection().entities) {
        return projectSelection(state, this.selection, entities);
    }
    availability(command: SimulationCommand) {
        if (this.availabilityRevision !== this.session.revision) {
            this.availabilityRevision = this.session.revision;
            this.availabilityCache.clear();
        }
        let cacheable = true;
        let key: string;
        try {
            key = JSON.stringify(command, (_field, value) => {
                if (value === undefined || typeof value === 'number' && !Number.isFinite(value) ||
                    typeof value === 'function' || typeof value === 'symbol') cacheable = false;
                return value;
            });
        } catch { cacheable = false; key = ''; }
        if (!cacheable) return commandAvailability(this.session.readSnapshot(), command);
        let status = this.availabilityCache.get(key);
        if (!status) {
            status = commandAvailability(this.session.readSnapshot(), command);
            // Bound noncanonical UI probes even if an input produces many different commands.
            if (this.availabilityCache.size >= 128) this.availabilityCache.clear();
            this.availabilityCache.set(key, status);
        }
        return { ...status };
    }
    command(command: SimulationCommand) {
        this.session.command(command);
    }
    importJSON(text: string) {
        this.fjord.importJSON(text);
        this.validateSelection();
    }
    private validateSelection() {
        const selection = this.selection;
        const state = this.session.readSnapshot();
        const identities: Record<EntityKind, Record<string, unknown>> = { campfire: { 'settlement-campfire': true }, persona: { ...state.personas, ...state.personaArchive },
            household: state.households, building: state.buildings,
            cattle: { ...state.landing?.cattleArchive, ...state.landing?.cattle }, longship: state.landing?.longships ?? {} };
        if (selection && !(identities[selection.kind]?.[selection.id]))
            this.select(null);
    }
    newCampaign(seed: number, weatherEnabled: boolean, socialEnabled = true, geography?: CampaignGeography, foundingPhase = this.session.snapshot().foundingPhase) {
        const proposal = new GameplaySession();
        proposal.newCampaign(seed, weatherEnabled, socialEnabled, foundingPhase, birthdayCalendarMode(this.session.readSnapshot()));
        this.fjord.startCampaign(proposal, geography);
    }
    restart(sameFounders: boolean, weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false, foundingPhase = this.session.snapshot().foundingPhase) {
        this.fjord.restart(sameFounders, weatherEnabled, foundingPhase);
    }
    saveLocal(storage: Pick<Storage, 'getItem' | 'setItem'>) {
        storage.setItem(fjordCampaignKey, this.fjord.exportJSON());
        storage.setItem(sharedCampaignKey, this.session.saveJSON());
    }
    loadLocal(storage: Pick<Storage, 'getItem' | 'setItem'>) {
        this.importJSON(localSettlementText(storage));
    }
    persist() {
        return JSON.stringify({ sharedVersion: 1, fjord: this.fjord.exportData(),
            pace: this.session.pacing(), ...(this.savedPresentation ? { presentation: this.savedPresentation } : {}) });
    }
    handoff(target: SettlementView) {
        const checkpoint = JSON.parse(this.persist());
        checkpoint.target = target;
        this.session.setRunning(false);
        this.transferring = true;
        return JSON.stringify(checkpoint);
    }
    static async restoreAsync(text: string, view: SettlementView,
        prepare: (metadata: SettlementRestoreMetadata) => Promise<void>) {
        const metadata = inspectSettlementSave(text);
        await prepare(metadata);
        return SharedSettlement.restore(text, view);
    }
    static restore(text: string, view: SettlementView) {
        if (text.length > 24000000) throw new Error('Campaign file exceeds the 24MB limit.');
        const data = JSON.parse(text);
        if (data.sharedVersion !== undefined && data.sharedVersion !== 1)
            throw new Error('Unsupported shared campaign version.');
        if (data.sharedVersion === 1 && (!data.fjord || typeof data.fjord !== 'object'))
            throw new Error('Missing shared campaign.');
        const next = new SharedSettlement(32, undefined, true, 'legacy', undefined,
            data.sharedVersion === 1 ? JSON.stringify(data.fjord) : text);
        if (data.presentation !== undefined) next.setPresentation(data.presentation);
        if (data.sharedVersion === 1)
            next.session.restorePacing({ ...data.pace, running: data.target === view && data.pace.running });
        return next;
    }
}
/** Evaluate the authoritative command without committing its returned state. */
export function commandAvailability(state: SimulationState, command: SimulationCommand) {
    try {
        applyCommand(state, command);
        return { allowed: true, reason: '' };
    }
    catch (error) {
        return { allowed: false, reason: error instanceof Error ? error.message : String(error) };
    }
}

export interface SettlementRestoreMetadata {
    seed: number;
    time: { winter: number; tick: number };
    ticksPerWinter: number;
    island?: IslandRecipe;
    book?: { id: string; title: string; text: string };
}
/** Validate authoritative small campaign/story data before requesting expensive geography. */
export function inspectSettlementSave(text: string): SettlementRestoreMetadata {
    if (text.length > 24000000) throw new Error('Campaign file exceeds the 24MB limit.');
    const data = JSON.parse(text);
    if (data.sharedVersion !== undefined && data.sharedVersion !== 1)
        throw new Error('Unsupported shared campaign version.');
    if (data.presentation !== undefined) copyPresentation(data.presentation);
    const saved = data.sharedVersion === 1 ? data.fjord : data;
    if (!saved || saved.bridgeVersion !== undefined && ![1, 2].includes(saved.bridgeVersion))
        throw new Error('Unsupported Fjord campaign version.');
    const session = new GameplaySession();
    session.loadJSON(saved.bridgeVersion ? JSON.stringify(saved.campaign) : JSON.stringify(saved));
    if (data.sharedVersion === 1) session.restorePacing(data.pace);
    const state = session.readSnapshot();
    if (saved.narrative) session.book.restore(saved.narrative, session.snapshot());
    if (saved.bridgeVersion === 2) {
        const actual = saved.island, expected = islandRecipe(state.seed, actual?.version);
        if (!actual || expected.version !== actual.version || expected.seed !== actual.seed ||
            expected.generatorVersion !== actual.generatorVersion)
            throw new Error('Saved island recipe does not match the campaign seed or supported version.');
    }
    const book = session.book.snapshot();
    const chapter = book.chapters.at(-1);
    return { seed: state.seed, time: { ...state.time }, ticksPerWinter: state.ticksPerWinter,
        ...(saved.bridgeVersion === 2 ? { island: { ...saved.island } } : {}),
        ...(saved.narrative && chapter ? { book: { id: book.id, title: chapter.title, text: chapter.text } } : {}) };
}

/** Canonical local save remains authoritative; a matching sidecar adds saved presentation and story. */
export function localSettlementText(storage: Pick<Storage, 'getItem'>): string {
    const canonical = storage.getItem(sharedCampaignKey);
    if (!canonical)
        throw new Error('No shared campaign save found.');
    const sidecar = storage.getItem(fjordCampaignKey);
    const saved = sidecar ? JSON.parse(sidecar) : null;
    const campaign = JSON.parse(canonical);
    const matchingHistory = saved && historyIdentity(JSON.stringify(saved.campaign)) === historyIdentity(canonical);
    return (saved && saved.campaign.seed === campaign.seed ?
        JSON.stringify({ ...saved, campaign,
            attention: matchingHistory ? saved.attention : undefined,
            wildlifeReadIds: matchingHistory ? saved.wildlifeReadIds : undefined,
            narrative: saved.narrative?.canonicalIdentity === historyIdentity(canonical) ? saved.narrative : undefined }) : canonical);
}

export interface SettlementPresentation {
    quality: PresentationQuality;
    effects: EffectQuality;
    camera: { position: number[]; target: number[] };
}
function copyPresentation(value: SettlementPresentation): SettlementPresentation {
    const point = (coordinates: number[]) => Array.isArray(coordinates) && coordinates.length === 3 &&
        coordinates.every(coordinate => Number.isFinite(coordinate) && Math.abs(coordinate) <= 20000);
    if (!value || !['low', 'standard'].includes(value.quality) || !['off', 'low', 'normal'].includes(value.effects) ||
        !value.camera || !point(value.camera.position) || !point(value.camera.target) ||
        Math.hypot(...value.camera.position.map((coordinate, axis) => coordinate - value.camera.target[axis])) < 1e-6)
        throw new Error('Invalid saved presentation controls or camera.');
    return { quality: value.quality, effects: value.effects,
        camera: { position: [...value.camera.position], target: [...value.camera.target] } };
}
