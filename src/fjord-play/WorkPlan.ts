import { applyCommand, inspectBuilding, landingSummary, occupationAptitude } from '../simulation/SimulationCore';
import type { Occupation, SimulationCommand, SimulationState } from '../simulation/SimulationCore';
import { commandAvailability } from '../play/SharedSettlement';

export interface WorkDraft {
    householdId: string;
    kind: 'work' | 'farmyard';
    occupation: Occupation;
    workerId: string;
    buildHouse: boolean;
    specialize: boolean;
    cattleIds: string[];
}

export function workCandidates(state: SimulationState, householdId: string, occupation: Occupation) {
    return (state.households[householdId]?.memberIds ?? []).filter(id =>
        state.personas[id]?.deathWinter === null && commandAvailability(state,
            { type: 'AssignOccupation', personaId: id, occupation }).allowed)
        .sort((a, b) => Number(state.personas[b].occupation === occupation) -
            Number(state.personas[a].occupation === occupation) ||
            occupationAptitude(state, b, occupation) - occupationAptitude(state, a, occupation));
}

export function proposeWork(state: SimulationState, householdId: string,
    occupation: Occupation, kind: WorkDraft['kind'] = 'work'): WorkDraft {
    const home = state.households[householdId];
    if (!home) throw new Error('Household no longer exists.');
    const residence = home.residenceId ? state.residences[home.residenceId] : undefined;
    const yard = residence?.buildingId && state.landing ?
        landingSummary(state).farmyards.find(y => y.id === residence.buildingId) : undefined;
    const freeCapacity = Math.max(0, (yard?.capacity ?? state.landing?.config.farmyardCapacity ?? 0) - (yard?.occupants ?? 0));
    return { householdId, occupation, kind, workerId: workCandidates(state, householdId, occupation)[0] ?? '',
        buildHouse: residence?.kind !== 'house', specialize: true,
        cattleIds: kind === 'farmyard' ? Object.values(state.landing?.cattle ?? {})
            .filter(c => c.deathWinter === null && c.farmyardId === null)
            .slice(0, freeCapacity).map(c => c.id) : [] };
}

/** Replay the existing authoritative commands without modifying the live campaign. */
export function previewWork(state: SimulationState, draft: WorkDraft) {
    const household = state.households[draft.householdId];
    if (!household?.memberIds.includes(draft.workerId)) throw new Error('Choose a current household member.');
    let next = state;
    const commands: SimulationCommand[] = [];
    const append = (command: SimulationCommand) => {
        next = applyCommand(next, command);
        commands.push(command);
    };
    const residence = household.residenceId ? state.residences[household.residenceId] : undefined;
    if (residence?.kind !== 'house' && draft.buildHouse) {
        append({ type: 'BuildHouse', householdId: household.id });
    }
    if (next.personas[draft.workerId].occupation !== draft.occupation) {
        append({ type: 'AssignOccupation', personaId: draft.workerId, occupation: draft.occupation });
    }
    const nextHome = next.households[household.id];
    const buildingId = nextHome.residenceId ? next.residences[nextHome.residenceId]?.buildingId : null;
    if (draft.specialize && buildingId && next.buildings[buildingId].specialization !== draft.occupation) {
        append({ type: 'SpecializeBuilding', buildingId, occupation: draft.occupation });
    }
    if (draft.kind === 'farmyard') {
        if (!buildingId || !landingSummary(next).farmyards.some(yard => yard.id === buildingId)) {
            throw new Error('A farmyard needs a permanent home and a living resident farmer.');
        }
        if (new Set(draft.cattleIds).size !== draft.cattleIds.length) throw new Error('Duplicate livestock selection.');
        for (const cattleId of draft.cattleIds) {
            if (next.landing?.cattle[cattleId]?.farmyardId !== buildingId) {
                append({ type: 'AssignCattle', cattleId, farmyardId: buildingId });
            }
        }
    }
    const unsheltered = Object.values(state.landing?.cattle ?? {}).filter(c => c.deathWinter === null &&
        c.farmyardId !== null && next.landing?.cattle[c.id]?.farmyardId === null).map(c => c.id);
    return { commands, state: next, buildingId, materials: state.stocks.materials - next.stocks.materials,
        upkeep: buildingId ? inspectBuilding(next, buildingId).upkeep : 0, unsheltered,
        farmyard: buildingId && next.landing ? landingSummary(next).farmyards.find(y => y.id === buildingId) : undefined };
}
