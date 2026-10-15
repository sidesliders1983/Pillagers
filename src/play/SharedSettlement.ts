import type { CampaignGeography } from '../fjord-play/CampaignIsland';
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
    private availabilityRevision = -1;
    private availabilityCache = new Map<string, ReturnType<typeof commandAvailability>>();
    transferring = false;
    readonly session: GameplaySession;
    readonly fjord: FjordCampaign;
    constructor(seed: number | GameplaySession = 32, narrativeSeed?: number, socialEnabled = true, geography: CampaignGeography = 'legacy', foundingPhase?: FoundingPhase) {
        this.session = typeof seed === 'number' ?
            new GameplaySession(seed, narrativeSeed, socialEnabled, foundingPhase) : seed;
        this.fjord = new FjordCampaign(this.session, geography);
    }
    get selection(): SettlementSelection {
        return this.fjord.selection as SettlementSelection;
    }
    select(selection: SettlementSelection) {
        this.fjord.selection = selection;
    }
    selectionPresentation() {
        return projectSelection(this.session.readSnapshot(), this.selection, this.fjord.readProjection().entities);
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
        const selection = this.selection;
        const state = this.session.snapshot();
        const identities: Record<EntityKind, Record<string, unknown>> = { campfire: { 'settlement-campfire': true }, persona: { ...state.personas, ...state.personaArchive },
            household: state.households, building: state.buildings,
            cattle: state.landing?.cattle ?? {}, longship: state.landing?.longships ?? {} };
        if (selection && !(identities[selection.kind]?.[selection.id]))
            this.select(null);
    }
    newCampaign(seed: number, weatherEnabled: boolean, socialEnabled = true, geography?: CampaignGeography, foundingPhase = this.session.snapshot().foundingPhase) {
        const proposal = new GameplaySession();
        proposal.newCampaign(seed, weatherEnabled, socialEnabled, foundingPhase);
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
        const canonical = storage.getItem(sharedCampaignKey);
        if (!canonical)
            throw new Error('No shared campaign save found.');
        const sidecar = storage.getItem(fjordCampaignKey);
        const saved = sidecar ? JSON.parse(sidecar) : null;
        this.importJSON(saved && saved.campaign.seed === JSON.parse(canonical).seed ?
            JSON.stringify({ ...saved, campaign: JSON.parse(canonical),
                narrative: saved.narrative?.canonicalIdentity === historyIdentity(canonical) ? saved.narrative : undefined }) : canonical);
    }
    persist() {
        return JSON.stringify({ sharedVersion: 1, fjord: this.fjord.exportData(),
            pace: this.session.pacing() });
    }
    handoff(target: SettlementView) {
        const checkpoint = JSON.parse(this.persist());
        checkpoint.target = target;
        this.session.setRunning(false);
        this.transferring = true;
        return JSON.stringify(checkpoint);
    }
    static restore(text: string, view: SettlementView) {
        const data = JSON.parse(text);
        const next = new SharedSettlement();
        if (data.sharedVersion !== undefined && data.sharedVersion !== 1)
            throw new Error('Unsupported shared campaign version.');
        next.importJSON(data.sharedVersion === 1 ? JSON.stringify(data.fjord) : text);
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
