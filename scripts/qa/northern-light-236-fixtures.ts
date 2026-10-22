import { SharedSettlement } from '../../src/play/SharedSettlement';
import { GameplaySession } from '../../src/gameplay-lab/GameplaySession';
import { createCampaign } from '../../src/simulation/SimulationCore';
import type { PresentationQuality } from '../../src/config/PresentationQuality';
import type { SettlementPresentation } from '../../src/play/SharedSettlement';

export const northernReviewPhases = [
    { name: 'Midwinter', progress: 0 },
    { name: 'Returning light, snow held', progress: .125 },
    { name: 'Early spring', progress: .28 },
    { name: 'Late spring', progress: .4 },
    { name: 'High summer', progress: .5 },
    { name: 'Autumn twilight', progress: .875 },
    { name: 'Year boundary', progress: .99 },
] as const;

/** Change only presentation outside the archived canonical campaign and pacing payload. */
export function northernReviewPresentation(source: string, quality: PresentationQuality, lowCamera: boolean) {
    const save = JSON.parse(source) as { presentation: SettlementPresentation };
    const [x, y, z] = save.presentation.camera.target;
    save.presentation = { quality, effects: 'low', camera: {
        target: [x, y, z], position: [x + 28, y + (lowCamera ? 25 : 31), z - (lowCamera ? 42 : 32)],
    } };
    return JSON.stringify(save);
}

/** Ordinary Core commands create a well-supplied, inhabited review save; no renderer-owned time. */
export function northernReviewFixture(seed: number, progress: number, quality: PresentationQuality, lowCamera: boolean) {
    const session = new GameplaySession();
    session.loadJSON(JSON.stringify(createCampaign(seed, { initialFood: 500, initialMaterials: 100 })));
    for (const home of Object.values(session.readSnapshot().households).slice(0, 2))
        session.command({ type: 'BuildHouse', householdId: home.id });
    const ticks = Math.floor(progress * session.readSnapshot().ticksPerWinter);
    if (ticks) session.command({ type: 'AdvanceTicks', ticks });
    const shared = new SharedSettlement(session, undefined, false, 'island-pool-v1');
    shared.fjord.enableDiscovery();
    const fire = shared.fjord.readProjection().campfire.transform;
    shared.setPresentation({ quality, effects: 'low', camera: {
        position: [fire.x + 28, fire.y + (lowCamera ? 25 : 31), fire.z - (lowCamera ? 42 : 32)],
        target: [fire.x, fire.y, fire.z],
    } });
    session.setRunning(false);
    session.setMinutesPerWinter(1);
    return shared;
}
