import { eventFacts } from './EventFacts';
import type { HousingResidents } from './EventFacts';
import { personaAge } from './PersonaAge';
import { personaIdentity } from './Identity';
import { prohibitedKinship } from './FamilyMechanics';
import { socialParticipantAvailable, socialParticipantsTied } from './PersonalityLifeEvents';
import type { SimulationEvent, SimulationState } from './SimulationCore';

/** Experimental, campaign-owned values. Only fresh culture/social campaigns opt in. */
export const defaultContextualSupportConfig = {
    enabled: true, offerBps: 1000, acceptanceBps: 5000, resolutionTicks: 50, candidateBudget: 128,
};
export type ContextualSupportConfig = typeof defaultContextualSupportConfig;
export type SupportOffer = {
    id: string; sourceEventId: string; householdId: string; recipientId: string; helperId: string;
    offeredEventId: string; resolutionAt: number;
};
export type ContextualSupportState = {
    version: 1; config: ContextualSupportConfig; rngState: number; nextOffer: number;
    lastReviewedWinter: number; lastSourceEventId: string | null; pending: SupportOffer[];
};
const supportTypes = new Set(['SupportOffered', 'SupportAccepted', 'SupportCompleted', 'SupportDeclined', 'SupportEnded']);
export function isContextualSupportEvent(event: SimulationEvent): boolean {
    return supportTypes.has(event.type);
}
function fail(): never { throw new Error('Invalid contextual support state or source history.'); }
function uint(value: unknown, maximum = Number.MAX_SAFE_INTEGER): boolean {
    return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}
function validateConfig(config: ContextualSupportConfig): void {
    if (!config || typeof config.enabled !== 'boolean' ||
        Object.keys(config).sort().join(',') !== Object.keys(defaultContextualSupportConfig).sort().join(',') ||
        !uint(config.offerBps, 10000) || !uint(config.acceptanceBps, 10000) ||
        !uint(config.resolutionTicks, 50) || config.resolutionTicks !== 50 ||
        !uint(config.candidateBudget, 1024) || config.candidateBudget < 1) fail();
}
export function initializeContextualSupport(state: SimulationState,
    overrides: Partial<ContextualSupportConfig> = {}): void {
    const config = { ...defaultContextualSupportConfig, ...overrides };
    validateConfig(config);
    if (!config.enabled || !state.social || !state.culture) return;
    state.contextualSupport = { version: 1, config, rngState: (state.seed ^ 0x61696431) >>> 0,
        nextOffer: 1, lastReviewedWinter: state.time.winter - 1, lastSourceEventId: null, pending: [] };
}
const absoluteTick = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
function draw(state: SimulationState): number {
    const support = state.contextualSupport!;
    support.rngState = (Math.imul(support.rngState, 1664525) + 1013904223) >>> 0;
    return support.rngState / 0x100000000;
}
function roll(state: SimulationState, bps: number): boolean {
    return bps > 0 && draw(state) * 10000 < bps;
}
function housingLoss(event: SimulationEvent): HousingResidents | undefined {
    const facts = event.details?.housingResidents as HousingResidents | undefined;
    return event.type === 'BuildingCollapsed' && facts?.version === 1 &&
        typeof event.details?.buildingId === 'string' && facts.buildingId === event.details.buildingId &&
        Array.isArray(facts.householdIds) && facts.householdIds.length > 0 &&
        Array.isArray(facts.residentIds) && facts.residentIds.length > 0 && Array.isArray(facts.people) ? facts : undefined;
}
function selectPair(state: SimulationState, facts: HousingResidents) {
    // Annual social participants retain their one-opportunity cap; support never draws from that RNG.
    const used = new Set(state.social?.lastWindow.winter === state.time.winter ?
        state.social.lastWindow.opportunities.filter(item => item.result !== 'no-event')
            .flatMap(item => item.participants) : []);
    const residents = [...facts.residentIds].sort().filter(id => socialParticipantAvailable(state, id) && !used.has(id));
    const helpers = Object.keys(state.personas).sort().filter(id => socialParticipantAvailable(state, id) && !used.has(id));
    const total = residents.length * helpers.length;
    if (!total) return;
    const start = Math.floor(draw(state) * total);
    let selected: { recipientId: string; helperId: string; householdId: string } | undefined;
    let eligible = 0;
    for (let offset = 0; offset < Math.min(total, state.contextualSupport!.config.candidateBudget); offset++) {
        const index = (start + offset) % total;
        const recipientId = residents[Math.floor(index / helpers.length)];
        const helperId = helpers[index % helpers.length];
        const householdId = facts.householdIds.find(id => state.households[id]?.memberIds.includes(recipientId));
        if (recipientId === helperId || !householdId || !socialParticipantsTied(state, recipientId, helperId)) continue;
        if (draw(state) * ++eligible < 1) selected = { recipientId, helperId, householdId };
    }
    return selected;
}
function sourceEvent(state: SimulationState, id: string): SimulationEvent {
    const event = state.events[Number(id.slice('event-'.length)) - 1];
    if (!event || event.id !== id) fail();
    return event;
}
function emit(state: SimulationState, type: string, offer: Omit<SupportOffer, 'offeredEventId'> & { offeredEventId?: string },
    extra: Record<string, unknown> = {}): string {
    const source = sourceEvent(state, offer.sourceEventId);
    const participants = [offer.recipientId, offer.helperId].sort();
    const details = eventFacts(state, { supportVersion: 1, clanId: state.clan.id, offerId: offer.id,
        sourceEventId: offer.sourceEventId, householdId: offer.householdId,
        recipientId: offer.recipientId, helperId: offer.helperId, participants,
        resolutionAt: offer.resolutionAt, supportContribution: 0,
        ...(offer.offeredEventId ? { offeredEventId: offer.offeredEventId } : {}),
        housingResidents: source.details!.housingResidents, housingNames: source.details!.housingNames, ...extra });
    // Departed participants retain canonical historical identity; names/ages are frozen now.
    details.people = participants.map(id => ({ id, name: personaIdentity(state, id)!.name, age: personaAge(state, id, state.time) }));
    const id = 'event-' + (state.events.length + 1);
    state.events.push({ id, type, time: { ...state.time }, details });
    return id;
}
/** Receives only this tick's new events, so neither reload nor an empty bank can rediscover old losses. */
export function stepContextualSupport(state: SimulationState, tickEvents: readonly SimulationEvent[]): void {
    const support = state.contextualSupport;
    if (!support) return;
    for (const offer of support.pending) {
        if (offer.resolutionAt > absoluteTick(state)) continue;
        const available = socialParticipantAvailable(state, offer.recipientId) &&
            socialParticipantAvailable(state, offer.helperId) &&
            socialParticipantsTied(state, offer.recipientId, offer.helperId);
        if (!available) emit(state, 'SupportEnded', offer, { reason: 'unavailable' });
        else if (!roll(state, support.config.acceptanceBps))
            emit(state, 'SupportDeclined', offer, { acceptanceBps: support.config.acceptanceBps });
        else {
            const acceptedEventId = emit(state, 'SupportAccepted', offer, { acceptanceBps: support.config.acceptanceBps });
            const culture = state.culture!;
            const supportBefore = culture.supportSourceEventIds.length;
            const supportContribution = supportBefore < culture.config.supportCapacity ? 1 : 0;
            const completedEventId = emit(state, 'SupportCompleted', offer, { acceptedEventId,
                cultureVersion: 1, supportBefore, supportAfter: supportBefore + supportContribution, supportContribution });
            if (supportContribution) culture.supportSourceEventIds.push(completedEventId);
        }
    }
    support.pending = support.pending.filter(offer => offer.resolutionAt > absoluteTick(state));
    for (const source of tickEvents) {
        const facts = housingLoss(source);
        if (!facts || support.lastReviewedWinter >= source.time.winter) continue;
        support.lastReviewedWinter = source.time.winter;
        support.lastSourceEventId = source.id;
        const pair = selectPair(state, facts);
        if (!pair || !roll(state, support.config.offerBps)) continue;
        const offer = { id: 'support-' + support.nextOffer++, sourceEventId: source.id, ...pair,
            resolutionAt: absoluteTick(state) + support.config.resolutionTicks };
        const offeredEventId = emit(state, 'SupportOffered', offer, { probabilityBps: support.config.offerBps });
        support.pending.push({ id: offer.id, sourceEventId: offer.sourceEventId, householdId: offer.householdId,
            recipientId: offer.recipientId, helperId: offer.helperId, offeredEventId, resolutionAt: offer.resolutionAt });
    }
}

/** Source ledger validation is linear at the public save/command seam; tick processing stays bounded. */
export function validateContextualSupport(state: SimulationState): void {
    const support = state.contextualSupport;
    if (support === undefined) {
        if (state.events.some(isContextualSupportEvent)) fail();
        return;
    }
    if (!support || typeof support !== 'object' || Array.isArray(support)) fail();
    validateConfig(support.config);
    if (support.version !== 1 || !support.config.enabled || !state.social || !state.culture ||
        !uint(support.rngState, 0xffffffff) || !uint(support.nextOffer) || !Array.isArray(support.pending) ||
        support.pending.length > 1 || !uint(support.lastReviewedWinter)) fail();
    const reviewed = new Map<number, SimulationEvent>();
    const active = new Map<string, SupportOffer>();
    const accepted = new Map<string, string>();
    const offeredSources = new Set<string>();
    const partners = new Map<string, string>();
    // Parentage survives departure. This read-only view reuses the existing kinship rule.
    const identities = { ...state, personas: { ...state.personaArchive, ...state.personas } };
    const endPartnership = (id: string) => {
        const former = partners.get(id);
        if (former && partners.get(former) === id) partners.delete(former);
        partners.delete(id);
    };
    let nextOffer = 1;
    let latestSource: SimulationEvent | undefined;
    let previous: SimulationEvent | undefined;
    for (const event of state.events) {
        if (event.type === 'FoundingPartnershipPresent' || event.type === 'PartnershipFormed') {
            const pair = event.details?.participants;
            if (Array.isArray(pair) && pair.length === 2 && pair.every(id => typeof id === 'string')) {
                endPartnership(pair[0]); endPartnership(pair[1]);
                partners.set(pair[0], pair[1]); partners.set(pair[1], pair[0]);
            }
        } else if (event.type === 'PersonaDied' || event.type === 'PersonaTransferredOut') {
            const id = event.personaId ?? event.details?.personaId;
            if (typeof id === 'string') endPartnership(id);
        }
        const factsAtLoss = housingLoss(event);
        if (factsAtLoss) {
            if (event.time.tick !== 0 || previous?.type !== 'MaintenanceDebtIncreased' ||
                previous.time.winter !== event.time.winter || previous.time.tick !== 0 ||
                previous.details?.buildingId !== event.details?.buildingId ||
                previous.details?.debtWinters !== state.mechanics!.config.collapseDebtWinters ||
                JSON.stringify(previous.details?.housingResidents) !== JSON.stringify(factsAtLoss) ||
                new Set(factsAtLoss.residentIds).size !== factsAtLoss.residentIds.length ||
                new Set(factsAtLoss.householdIds).size !== factsAtLoss.householdIds.length ||
                factsAtLoss.people.length !== factsAtLoss.residentIds.length ||
                factsAtLoss.residentIds.some((id, index) => !personaIdentity(state, id) ||
                    factsAtLoss.people[index]?.id !== id || !factsAtLoss.people[index]?.name ||
                    factsAtLoss.people[index]?.age !== personaAge(state, id, event.time))) fail();
        }
        previous = event;
        if (factsAtLoss && !reviewed.has(event.time.winter)) {
            reviewed.set(event.time.winter, event);
            latestSource = event;
        }
        if (!isContextualSupportEvent(event)) continue;
        const d = event.details!;
        const source = typeof d?.sourceEventId === 'string' ? sourceEvent(state, d.sourceEventId) : undefined;
        const facts = source && housingLoss(source);
        if (!d || !facts || reviewed.get(source!.time.winter)?.id !== source!.id ||
            d.supportVersion !== 1 || d.clanId !== state.clan.id || typeof d.offerId !== 'string' ||
            !facts.householdIds.includes(String(d.householdId)) ||
            !facts.residentIds.includes(String(d.recipientId)) || d.recipientId === d.helperId ||
            typeof d.recipientId !== 'string' || typeof d.helperId !== 'string' ||
            !personaIdentity(state, d.recipientId) || !personaIdentity(state, d.helperId) ||
            JSON.stringify(d.participants) !== JSON.stringify([d.recipientId, d.helperId].sort()) ||
            JSON.stringify(d.housingResidents) !== JSON.stringify(source!.details!.housingResidents) ||
            JSON.stringify(d.housingNames) !== JSON.stringify(source!.details!.housingNames) ||
            !Array.isArray(d.people) || d.people.length !== 2 || d.people.some((person, index) =>
                !person || person.id !== (d.participants as string[])[index] || typeof person.name !== 'string' ||
                !person.name.trim() || !uint(person.age) || person.age < state.mechanics!.config.adultAge ||
                person.age !== personaAge(state, person.id, event.time)) ||
            !uint(d.resolutionAt)) fail();
        const offer: SupportOffer = { id: d.offerId, sourceEventId: source!.id, householdId: String(d.householdId),
            recipientId: d.recipientId, helperId: d.helperId, offeredEventId: event.id, resolutionAt: Number(d.resolutionAt) };
        const now = event.time.winter * state.ticksPerWinter + event.time.tick;
        if (event.type === 'SupportOffered') {
            if (d.offerId !== 'support-' + nextOffer++ || active.size || d.offeredEventId !== undefined ||
                source!.time.winter !== event.time.winter || source!.time.tick !== event.time.tick ||
                d.resolutionAt !== now + support.config.resolutionTicks || d.probabilityBps !== support.config.offerBps ||
                offeredSources.has(source!.id) ||
                !(facts.residentIds.includes(d.helperId) || partners.get(d.recipientId) === d.helperId ||
                    prohibitedKinship(identities, d.recipientId, d.helperId))) fail();
            offeredSources.add(source!.id);
            active.set(d.offerId, offer);
        } else {
            const pending = active.get(d.offerId);
            if (!pending || d.offeredEventId !== pending.offeredEventId || now !== pending.resolutionAt ||
                d.sourceEventId !== pending.sourceEventId || d.householdId !== pending.householdId ||
                d.recipientId !== pending.recipientId || d.helperId !== pending.helperId ||
                d.resolutionAt !== pending.resolutionAt) fail();
            if (event.type === 'SupportAccepted') {
                if (accepted.has(d.offerId) || d.acceptanceBps !== support.config.acceptanceBps) fail();
                accepted.set(d.offerId, event.id);
            } else if (event.type === 'SupportCompleted') {
                if (!accepted.has(d.offerId) || d.acceptedEventId !== accepted.get(d.offerId) ||
                    d.cultureVersion !== 1 || ![0, 1].includes(Number(d.supportContribution))) fail();
                const prior = state.events[Number(event.id.slice(6)) - 2];
                if (prior?.id !== d.acceptedEventId || prior?.type !== 'SupportAccepted') fail();
                active.delete(d.offerId); accepted.delete(d.offerId);
            } else {
                if (accepted.has(d.offerId) || event.type === 'SupportEnded' && d.reason !== 'unavailable' ||
                    event.type === 'SupportDeclined' && d.acceptanceBps !== support.config.acceptanceBps) fail();
                active.delete(d.offerId);
            }
        }
        if (event.type !== 'SupportCompleted' && d.supportContribution !== 0) fail();
    }
    if (accepted.size || support.nextOffer !== nextOffer ||
        JSON.stringify(support.pending) !== JSON.stringify([...active.values()]) ||
        [...active.values()].some(offer => offer.resolutionAt <= absoluteTick(state)) ||
        support.lastSourceEventId !== (latestSource?.id ?? null) ||
        (latestSource ? support.lastReviewedWinter !== latestSource.time.winter :
            support.lastReviewedWinter !== 799)) fail();
}
