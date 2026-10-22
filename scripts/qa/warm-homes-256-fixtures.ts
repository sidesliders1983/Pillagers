import { SharedSettlement } from '../../src/play/SharedSettlement';
import { GameplaySession } from '../../src/gameplay-lab/GameplaySession';
import { createCampaign } from '../../src/simulation/SimulationCore';

/** Ordinary commands build real occupied homes; only the isolated QA campaign is created. */
export function warmHomeFixture(progress: number) {
    const session = new GameplaySession();
    session.loadJSON(JSON.stringify(createCampaign(32, { initialFood: 5000, initialMaterials: 2000 })));
    const homes = Object.values(session.readSnapshot().households).slice(0, 5);
    for (const [index, home] of homes.entries()) {
        session.command({ type: 'BuildHouse', householdId: home.id });
        const state = session.readSnapshot();
        const buildingId = state.residences[state.households[home.id].residenceId!].buildingId!;
        const occupation = index >= 3 ? 'farmer' : 'woodworker';
        for (const personaId of home.memberIds) session.command({ type: 'AssignOccupation', personaId, occupation });
        session.command({ type: 'SpecializeBuilding', buildingId, occupation });
        const level = index < 3 ? index + 1 : index === 4 ? 1 : 0;
        for (let i = 0; i < level; i++) session.command({ type: 'UpgradeBuilding', buildingId });
    }
    const shared = new SharedSettlement(session, undefined, false, 'island-pool-v1');
    shared.fjord.enableDiscovery();
    if (progress) session.command({ type: 'AdvanceTicks', ticks: Math.floor(progress * 1000) });
    const view = shared.fjord.project(), fire = view.campfire.transform;
    shared.setPresentation({ quality: 'low', effects: 'off', camera: {
        target: [fire.x, fire.y, fire.z], position: [fire.x + 28, fire.y + 31, fire.z - 32],
    } });
    session.setRunning(false);
    return shared;
}
