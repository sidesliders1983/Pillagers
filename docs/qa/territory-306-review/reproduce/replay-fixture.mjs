import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSource } from './fixture-tools.mjs';

const [root = process.env.PROFILE_SOURCE_ROOT || process.cwd(), fixture, label = 'replay', limit = '270'] = process.argv.slice(2);
const api = await loadSource(root);
const shared = api.SharedSettlement.restore(await readFile(fixture, 'utf8'), 'fjord');
const directory = fileURLToPath(new URL('./', import.meta.url));
const report = { source: api.pin, fixture, command: { type: 'AdvanceTicks', ticks: 1 },
    status: 'running', completedTicks: 0, transitions: [] };
for (let index = 0; index < Number(limit); index++) {
    try { shared.session.command(report.command); }
    catch (error) {
        report.status = 'blocked';
        report.failure = String(error.stack || error);
        report.timeBeforeFailure = shared.session.readSnapshot().time;
        await writeFile(join(directory, label + '-before-failure.shared.json'), shared.persist());
        await writeFile(join(directory, label + '-before-failure.core.json'), shared.session.saveJSON());
        console.log('public-session-replay-blocked', JSON.stringify({ index, time: report.timeBeforeFailure, error: String(error) }));
        break;
    }
    report.completedTicks++;
    const state = shared.session.readSnapshot();
    const phases = api.core.inspectTerritory(state).incidents.map(incident => incident.phase).join('+') || 'none';
    if (report.transitions.at(-1)?.phases !== phases) report.transitions.push({ time: state.time, phases });
}
if (report.status === 'running') report.status = 'passed';
report.endTime = shared.session.readSnapshot().time;
report.population = api.population(shared.session.readSnapshot());
await writeFile(join(directory, label + '-public-replay.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, completed: report.completedTicks, time: report.endTime, transitions: report.transitions }));
