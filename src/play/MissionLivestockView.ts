import type { SimulationState } from '../simulation/SimulationCore';
import { inspectIslandMissionLivestock } from '../simulation/MissionLivestock';

const escape = (value: string) => value.replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const ageStatus = {
    young: 'Not yet breeding age; a possible future replacement',
    'within-window': 'Within the breeding age window; partners and conditions are still required',
    'past-window': 'Past the breeding age window', deceased: 'Deceased',
};

export function renderMissionLivestock(state: SimulationState, missionId: string) {
    const rows = inspectIslandMissionLivestock(state, missionId);
    if (!rows.length) return '<p>No livestock was recovered.</p>';
    return `<section aria-label="Recovered livestock"><h5>Recovered livestock</h5>` + rows.map(row => {
        const current = row.current, recorded = row.atReturn;
        const name = current?.name ?? recorded?.name ?? 'Recorded livestock';
        return `<article>${row.inspectable ? `<button type="button" data-island-livestock="${escape(row.id)}">${escape(name)}</button>` : `<strong>${escape(name)}</strong>`}` +
            (current ? `<p>Now: ${escape(current.speciesName)} · ${escape(current.sexTerm)} · ${current.sex} · ` +
                `${current.age} Winters. ${ageStatus[current.breedingAge]}.</p>` :
                '<p>Current status is not observed in this clan.</p>') +
            (recorded ? `<details><summary>Recorded at return</summary><p>${escape(recorded.name)} · ` +
                `${escape(recorded.speciesName)} · ${recorded.sex} · ${recorded.age} Winters · ${escape(recorded.stage)}.</p></details>` :
                '<p>Return-time animal details were not recorded.</p>') + '</article>';
    }).join('') + '</section>';
}
