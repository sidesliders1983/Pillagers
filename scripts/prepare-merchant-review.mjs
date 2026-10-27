import { mkdirSync, writeFileSync } from 'node:fs';
import { loadTypeScript } from './load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
const { currentIslandVersion } = loadTypeScript(new URL('../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { fjordLivestockRules } = loadTypeScript(new URL('../src/config/FjordLivestock.ts', import.meta.url));
const output = 'docs/qa/visiting-merchants-281';
mkdirSync(output, { recursive: true });
for (const [seed, profile] of [[1, 'supply'], [2, 'craft']]) {
    const session = new GameplaySession();
    // Explicit QA starting-stock fixture, not ordinary campaign defaults or free merchant delivery.
    session.loadJSON(core.serializeState(core.createCampaign(seed, { initialFood: 100, initialMaterials: 40 },
        {}, {}, {}, {}, {}, 'summer-800-v1', undefined, { player: fjordLivestockRules }, {}, {}, { enabled: true })));
    if (profile === 'craft') {
        const state = session.snapshot();
        const workers = Object.values(state.personas).filter(person => person.deathWinter === null &&
            core.personaAge(state, person.id) >= state.mechanics.config.workAge && !core.isProvidingCare(state, person.id)).slice(0, 3);
        for (const person of workers) session.command({ type: 'AssignOccupation', personaId: person.id, occupation: 'smith' });
        for (const item of ['woodenSpear', 'woodenShield']) session.command({ type: 'SetSmitheryTarget', item, target: 2 });
    }
    const owner = new SharedSettlement(session, undefined, true, currentIslandVersion);
    owner.fjord.enableDiscovery();
    session.command({ type: 'AdvanceTicks', ticks: 2000 });
    session.setRunning(false);
    if (session.snapshot().trade.visit.profile !== profile) throw new Error('Unexpected merchant fixture profile.');
    writeFileSync(output + '/' + profile + '-campaign.json', owner.fjord.exportJSON() + '\n');
    console.log(profile, session.snapshot().stocks, session.snapshot().smithery.stored);
}
