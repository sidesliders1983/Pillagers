import { applyCommand, inspectBuilding, inspectWork } from '../simulation/SimulationCore';
import type { SimulationCommand, SimulationState } from '../simulation/SimulationCore';
import { commandAvailability } from '../play/SharedSettlement';

export function homeImprovements(state: SimulationState, buildingId: string) {
    const building = state.buildings[buildingId];
    if (!building || building.kind !== 'house') throw new Error('Permanent home required.');
    const status = inspectBuilding(state, buildingId);
    const households = Object.values(state.households).filter(home => home.residenceId &&
        state.residences[home.residenceId]?.buildingId === buildingId);
    const residents = households.flatMap(home => home.memberIds)
        .filter(id => state.personas[id]?.deathWinter === null);
    const matching = residents.filter(id => building.specialization !== null &&
        state.personas[id].occupation === building.specialization);
    const bonusBps = state.mechanics!.config.upgradeBonusBps[status.upgradeLevel];
    const cost = state.mechanics!.config.upgradeCosts[status.upgradeLevel];
    const command: SimulationCommand = { type: 'UpgradeBuilding', buildingId };
    const availability = commandAvailability(state, command);
    const next = availability.allowed ? applyCommand(state, command) : undefined;
    return {
        building, ...status, households, residents, matching, bonusBps, cost, command, availability,
        nextBonusBps: state.mechanics!.config.upgradeBonusBps[status.upgradeLevel + 1],
        nextUpkeep: state.mechanics!.config.baseUpkeep + status.upgradeLevel + 1,
        // Empty homes pay no upkeep; their existing vacancy/debt rules still apply.
        chargedUpkeep: status.occupied ? status.upkeep : 0,
        next: next ? {
            bonusBps: next.mechanics!.config.upgradeBonusBps[status.upgradeLevel + 1],
            upkeep: inspectBuilding(next, buildingId).upkeep,
            workers: matching.map(id => ({ id, before: inspectWork(state, id), after: inspectWork(next, id) })),
        } : undefined,
    };
}

/** A specialization preview changes the building alone, keeping occupations, level and upkeep. */
export function previewHomeSpecialization(state: SimulationState, buildingId: string,
    occupation: SimulationState['buildings'][string]['specialization']) {
    const command: SimulationCommand = { type: 'SpecializeBuilding', buildingId, occupation };
    const next = applyCommand(state, command);
    return { command, home: homeImprovements(next, buildingId) };
}

export const homeLevel = (level: number) => ['Base', 'I', 'II', 'III'][level] ?? String(level);
