import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTypeScript } from '../load-typescript.mjs';
const baseline = mkdtempSync(join(tmpdir(), 'pillagers-housing-baseline-'));
const archive = join(baseline, 'source.tar');
execFileSync('git', ['archive', '--format=tar', '--output=' + archive, 'bbdaaa9729f63ac59dd76ec2fcce7664f7dad8d3', 'src']);
execFileSync('tar', ['-xf', archive, '-C', baseline]);
const oldCore = loadTypeScript(pathToFileURL(join(baseline, 'src/simulation/SimulationCore.ts')));
const newCore = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const withoutNames = state => {
    const copy = structuredClone(state);
    for (const event of copy.events) if (event.details) delete event.details.housingNames;
    if (copy.world?.targetClans) for (const [id, clan] of Object.entries(copy.world.targetClans)) copy.world.targetClans[id] = withoutNames(clan);
    return copy;
};
for (const seed of [17, 32, 1983]) {
    let previous = oldCore.createCampaign(seed, { initialMaterials: 1000, initialFood: 1000 });
    let current = newCore.createCampaign(seed, { initialMaterials: 1000, initialFood: 1000 });
    const commands = [
        { type: 'BuildHouse', householdId: 'founder-1' },
        { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' },
        { type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' },
        { type: 'UpgradeBuilding', buildingId: 'house-1' },
        { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: 'house-1' },
        { type: 'AdvanceTicks', ticks: 5000 },
        { type: 'SalvageBuilding', buildingId: 'house-1' },
        { type: 'AdvanceTicks', ticks: 5000 }
    ];
    for (const command of commands) {
        previous = oldCore.applyCommand(previous, command);
        current = newCore.applyCommand(current, command);
        assert.deepEqual(withoutNames(current), previous);
    }
}
console.log('PASS: three seeds, eight command checkpoints each; only housingNames metadata differs from bbdaaa9.');
