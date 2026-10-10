import { projectSelection } from './SelectionPresentation';
import { applyCommand } from '../simulation/SimulationCore';
import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { sharedCampaignKey, fjordCampaignKey, FjordCampaign } from '../fjord-play/FjordCampaign';
import type { EntityKind } from './SettlementView';
import type { SimulationCommand, SimulationState } from '../simulation/SimulationCore';
export type SettlementView = 'board' | 'fjord';
export type SettlementSelection = {
    kind: EntityKind;
    id: string;
} | null;
export const activeSettlementKey = 'pillagers.fjord-play.active.v1';
/** One canonical campaign, transferred explicitly when a full-page view switch replaces its owner. */
export class SharedSettlement {
    transferring = false;
    readonly session: GameplaySession;
    readonly fjord: FjordCampaign;
    constructor(seed = 32) {
        this.session = new GameplaySession(seed);
        this.fjord = new FjordCampaign(this.session);
    }
    get selection(): SettlementSelection {
        return this.fjord.selection as SettlementSelection;
    }
    select(selection: SettlementSelection) {
        this.fjord.selection = selection;
    }
    selectionPresentation() {
        return projectSelection(this.session.snapshot(), this.selection, this.fjord.project().entities);
    }
    availability(command: SimulationCommand) {
        return commandAvailability(this.session.snapshot(), command);
    }
    command(command: SimulationCommand) {
        this.session.command(command);
    }
    importJSON(text: string) {
        this.fjord.importJSON(text);
        const selection = this.selection;
        const state = this.session.snapshot();
        const identities = { persona: { ...state.personas, ...state.personaArchive },
            household: state.households, building: state.buildings,
            cattle: state.landing?.cattle ?? {}, longship: state.landing?.longships ?? {} };
        if (selection && !(identities[selection.kind]?.[selection.id]))
            this.select(null);
    }
    newCampaign(seed: number, weatherEnabled: boolean) {
        const proposal = new GameplaySession();
        proposal.newCampaign(seed, weatherEnabled);
        this.importJSON(proposal.saveJSON());
        // New campaigns reset all presentation plots, even when their seed repeats.
        this.fjord.restart(true, weatherEnabled);
    }
    restart(sameFounders: boolean, weatherEnabled = this.session.snapshot().weather?.config.enabled ?? false) {
        this.fjord.restart(sameFounders, weatherEnabled);
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
            JSON.stringify({ ...saved, campaign: JSON.parse(canonical) }) : canonical);
    }
    persist() {
        return JSON.stringify({ sharedVersion: 1, fjord: JSON.parse(this.fjord.exportJSON()),
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
