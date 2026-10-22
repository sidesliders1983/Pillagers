import { SharedSettlement, activeSettlementKey } from '../../src/play/SharedSettlement';
import { GameplaySession } from '../../src/gameplay-lab/GameplaySession';
import { createCampaign } from '../../src/simulation/SimulationCore';

async function launch(embarked: boolean) {
    const status = document.querySelector<HTMLOutputElement>('#status')!;
    for (const button of document.querySelectorAll('button')) button.disabled = true;
    status.textContent = 'Preparing the production island and a paid QA expedition…';
    await new Promise(resolve => setTimeout(resolve, 30));
    try {
        const session = new GameplaySession();
        session.loadJSON(JSON.stringify(createCampaign(32, { initialFood: 500 },
            { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false })));
        const shared = new SharedSettlement(session, undefined, false, 'island-pool-v1');
        shared.fjord.enableDiscovery();
        const members = ['founder-1', 'founder-2', 'founder-3', 'founder-4', 'founder-5'];
        shared.command({ type: 'CreateExpeditionGroup', name: 'Sea scouts', memberIds: members });
        shared.command({ type: 'StartExpedition', groupId: 'group-1' });
        if (embarked) {
            const origins = Object.fromEntries(shared.fjord.project().entities.filter(entity =>
                entity.kind === 'persona' && members.includes(entity.id) && entity.transform).map(entity =>
                [entity.id, { x: entity.transform!.x, z: entity.transform!.z }]));
            shared.command({ type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship', origins });
            for (let i = 0; i < 200; i++) {
                const mission = Object.values(session.readSnapshot().world!.spatial!.missions)[0];
                if (mission.transport?.phase === 'embarked') break;
                shared.command({ type: 'AdvanceTicks', ticks: 1 });
            }
        }
        session.setRunning(false);
        shared.saveLocal(localStorage);
        localStorage.setItem(activeSettlementKey, shared.persist());
        location.assign('/fjord-play');
    } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        for (const button of document.querySelectorAll('button')) button.disabled = false;
    }
}
document.querySelector('#prepare')!.addEventListener('click', () => void launch(false));
document.querySelector('#aboard')!.addEventListener('click', () => void launch(true));
