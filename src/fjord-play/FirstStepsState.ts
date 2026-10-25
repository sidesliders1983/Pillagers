import { inspectBuilding, inspectWork, personaAway } from '../simulation/SimulationCore';
import type { SimulationCommand, SimulationState } from '../simulation/SimulationCore';
import { commandAvailability } from '../play/SharedSettlement';
import { previewWork, proposeWork, workCandidates } from './WorkPlan';

export interface FirstStepsProgress {
    version: 1;
    status: 'offered' | 'active' | 'skipped' | 'complete';
    collapsed: boolean;
    residentId: string | null;
    resourcesSeen: boolean;
    workerId: string | null;
    householdId: string | null;
    watch: { kind: 'home' | 'work'; id: string; afterEvent: number } | null;
    evidenceId: string | null;
}

export type FirstStepsInspection = 'resident' | 'household' | 'resources' | 'work';

/** Per-history presentation data. No seed, RNG draw, Core command or event is added. */
export function newFirstSteps(): FirstStepsProgress {
    return { version: 1, status: 'offered', collapsed: false, residentId: null,
        resourcesSeen: false, workerId: null, householdId: null, watch: null, evidenceId: null };
}

export function readFirstSteps(value: unknown, state: SimulationState): FirstStepsProgress | undefined {
    if (value === undefined) return undefined;
    const data = value as FirstStepsProgress;
    const id = (value: unknown) => value === null || typeof value === 'string' &&
        value.length > 0 && value.length <= 96;
    if (!data || data.version !== 1 || !['offered', 'active', 'skipped', 'complete'].includes(data.status) ||
        typeof data.collapsed !== 'boolean' || typeof data.resourcesSeen !== 'boolean' ||
        ![data.residentId, data.workerId, data.householdId, data.evidenceId].every(id) ||
        data.watch !== null && (!data.watch || !['home', 'work'].includes(data.watch.kind) ||
            !id(data.watch.id) || data.watch.id === null || !Number.isSafeInteger(data.watch.afterEvent) ||
            data.watch.afterEvent < 0 || data.watch.afterEvent > state.events.length))
        throw new Error('Invalid saved first-steps guidance.');
    if (data.evidenceId !== null && !firstStepsEvidence(state, data))
        throw new Error('Saved first-steps evidence is not present in this campaign.');
    // Copy only bounded, known fields; imported extra data never becomes UI state.
    return { version: 1, status: data.status, collapsed: data.collapsed,
        residentId: data.residentId, resourcesSeen: data.resourcesSeen, workerId: data.workerId,
        householdId: data.householdId, watch: data.watch ? { kind: data.watch.kind, id: data.watch.id, afterEvent: data.watch.afterEvent } : null,
        evidenceId: data.evidenceId };
}

export function firstStepsStep(progress: FirstStepsProgress): number {
    if (!progress.residentId) return 0;
    if (!progress.resourcesSeen || !progress.workerId) return 1;
    if (!progress.watch) return 2;
    return 3;
}

function available(state: SimulationState, id: string) {
    return state.personas[id]?.deathWinter === null && !personaAway(state, id);
}

export function firstStepsFacts(state: SimulationState, progress: FirstStepsProgress,
    availability: (command: SimulationCommand) => { allowed: boolean; reason: string } =
        command => commandAvailability(state, command)) {
    const people = Object.values(state.personas).filter(person => available(state, person.id));
    const homes = Object.values(state.households).filter(home => home.memberIds.some(id => available(state, id)));
    const permanent = (home: typeof homes[number]) => home.residenceId ?
        state.residences[home.residenceId]?.buildingId ?? null : null;
    const producers = people.filter(person => {
        const work = inspectWork(state, person.id);
        return work.resource === 'materials' && work.productivityBps > 0;
    });
    const worker = producers[0] ?? people.find(person => inspectWork(state, person.id).productivityBps > 0);
    const person = people.find(person => person.id === progress.residentId) ?? people[0];
    const home = homes.find(home => home.id === progress.householdId) ??
        homes.find(home => permanent(home)) ?? homes.find(home => home.memberIds.includes(worker?.id ?? '')) ?? homes[0];
    const buildingId = home && permanent(home);
    const cost = state.mechanics!.config.houseCost;
    const housing = home ? availability({ type: 'BuildHouse', householdId: home.id }) :
        { allowed: false, reason: 'No current household is available.' };
    let workPlan: ReturnType<typeof proposeWork> | undefined;
    if (!producers.length && state.stocks.materials < cost) {
        for (const candidate of homes) {
            if (!workCandidates(state, candidate.id, 'woodworker').length) continue;
            const draft = { ...proposeWork(state, candidate.id, 'woodworker'), buildHouse: false, specialize: false };
            try {
                if (previewWork(state, draft).commands.length) { workPlan = draft; break; }
            } catch { /* Another currently valid household may still offer Materials work. */ }
        }
    }
    return { person, worker, home, buildingId, cost, housing, workPlan,
        temporaryHome: homes.find(home => !permanent(home)),
        shortfall: Math.max(0, cost - state.stocks.materials),
        upkeep: buildingId ? inspectBuilding(state, buildingId).upkeep : state.mechanics!.config.baseUpkeep,
        work: worker ? inspectWork(state, worker.id) : undefined };
}

export function inspectFirstSteps(progress: FirstStepsProgress, state: SimulationState,
    kind: FirstStepsInspection, id?: string): FirstStepsProgress {
    if (progress.status !== 'active') return progress;
    const next = structuredClone(progress);
    if (kind === 'resources') next.resourcesSeen = true;
    if ((kind === 'resident' || kind === 'work') && id && available(state, id)) {
        if (kind === 'resident') next.residentId = id;
        const work = inspectWork(state, id);
        if (work.productivityBps > 0 && work.resource) next.workerId = id;
    }
    if (kind === 'household' && id && state.households[id]) {
        next.householdId = id;
        const residence = state.households[id].residenceId;
        const buildingId = residence ? state.residences[residence]?.buildingId : null;
        if (buildingId && !next.watch)
            next.watch = { kind: 'home', id: buildingId, afterEvent: state.events.length };
    }
    return next;
}

/** Only newly appended facts are visited, once per canonical revision, never once per frame. */
export function observeFirstSteps(progress: FirstStepsProgress, state: SimulationState,
    cursor: number): FirstStepsProgress {
    if (progress.status !== 'active') return progress;
    const next = structuredClone(progress);
    if (next.watch && !next.evidenceId && !watchedTargetAvailable(state, next.watch)) {
        next.watch = null;
        next.evidenceId = null;
    }
    for (const event of state.events.slice(cursor)) {
        if (event.type === 'HouseBuilt' && event.details?.householdId === next.householdId &&
            typeof event.details?.buildingId === 'string' && state.buildings[event.details.buildingId]) {
            next.watch = { kind: 'home', id: event.details.buildingId,
                afterEvent: Number(event.id.slice('event-'.length)) };
            next.evidenceId = null;
        }
        if (!next.watch || next.evidenceId || Number(event.id.slice(6)) <= next.watch.afterEvent) continue;
        if (matchesEvidence(state, next.watch, event)) next.evidenceId = event.id;
    }
    return next;
}

function watchedTargetAvailable(state: SimulationState, watch: NonNullable<FirstStepsProgress['watch']>) {
    if (watch.kind === 'work') {
        if (!available(state, watch.id)) return false;
        const work = inspectWork(state, watch.id);
        return work.resource === 'materials' && work.productivityBps > 0;
    }
    if (!state.buildings[watch.id]) return false;
    return Object.values(state.households).some(home => home.residenceId &&
        state.residences[home.residenceId]?.buildingId === watch.id &&
        home.memberIds.some(id => available(state, id)));
}

function matchesEvidence(state: SimulationState, watch: NonNullable<FirstStepsProgress['watch']>,
    event: SimulationState['events'][number]) {
    if (watch.kind === 'home' && ['BuildingMaintained', 'MaintenanceDebtIncreased'].includes(event.type))
        return event.details?.buildingId === watch.id;
    if (event.type !== 'ResourceProduced' || !event.personaId ||
        !['food', 'materials'].includes(String(event.details?.resource)) ||
        typeof event.details?.units !== 'number' || event.details.units <= 0) return false;
    if (watch.kind === 'work') return event.personaId === watch.id;
    return Object.values(state.households).some(home => home.memberIds.includes(event.personaId!) &&
        home.residenceId && state.residences[home.residenceId]?.buildingId === watch.id);
}

export function firstStepsEvidence(state: SimulationState, progress: FirstStepsProgress) {
    if (!progress.watch || !progress.evidenceId) return undefined;
    const event = state.events[Number(progress.evidenceId.slice(6)) - 1];
    if (event?.id !== progress.evidenceId || Number(event.id.slice(6)) <= progress.watch.afterEvent) return undefined;
    if (progress.watch.kind === 'work' && event.personaId !== progress.watch.id) return undefined;
    // Evidence is a historical fact, even if its worker later moves or the home collapses.
    if (['BuildingMaintained', 'MaintenanceDebtIncreased'].includes(event.type) && progress.watch.kind === 'home' &&
        event.details?.buildingId === progress.watch.id) return event;
    return event.type === 'ResourceProduced' && typeof event.personaId === 'string' &&
        ['food', 'materials'].includes(String(event.details?.resource)) &&
        typeof event.details?.units === 'number' && event.details.units > 0 ? event : undefined;
}
