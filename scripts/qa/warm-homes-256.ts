import { activeSettlementKey } from '../../src/play/SharedSettlement';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const select = (id: string) => element<HTMLSelectElement>(id).value;
const frame = element<HTMLIFrameElement>('game');
let saved = '', variant = 'baseline';
const measurements: unknown[] = [];
for (const id of ['phase', 'quality', 'view', 'effects']) element(id).onchange = () => {
    saved = '';
    for (const action of ['baseline', 'candidate']) element<HTMLButtonElement>(action).disabled = true;
    element('status').textContent = 'Selections changed. Prepare a fixed save again.';
};
element('prepare').onclick = async () => {
    try {
        const response = await fetch('/docs/qa/warm-homes-256/fixtures/phase-' + select('phase').replace('.', '-') + '.json');
        if (!response.ok) throw new Error('The fixed review save could not be loaded.');
        const state = JSON.parse(await response.text());
        state.presentation.quality = select('quality');
        state.presentation.effects = select('effects');
        if (select('view') !== 'normal') {
            const plot = state.fjord.layout.plots['building:' + select('view')];
            // Native minimum camera elevation is preserved; view the windowed gable obliquely.
            state.presentation.camera = { target: [plot.x, plot.y + 1.5, plot.z],
                position: [plot.x + Math.cos(plot.rotation) * 13 + Math.sin(plot.rotation) * 9,
                    plot.y + 10, plot.z - Math.sin(plot.rotation) * 13 + Math.cos(plot.rotation) * 9] };
        }
        saved = JSON.stringify(state);
        measurements.length = 0;
        for (const action of ['baseline', 'candidate']) element<HTMLButtonElement>(action).disabled = false;
        element('status').textContent = 'Fixed save ready. Compare Current lighting first, then Warm homes.';
    } catch (error) { element('status').textContent = String(error); }
};
function open(candidate: boolean) {
    if (!saved) return;
    sessionStorage.setItem(activeSettlementKey, saved);
    variant = candidate ? 'warm-v1' : 'baseline';
    frame.src = '/fjord-play?lighting=northern-v1&homes=' + variant;
    element('status').textContent = 'Opening ' + variant + ' from the fixed paused save.';
}
element('baseline').onclick = () => open(false);
element('candidate').onclick = () => open(true);
const timer = setInterval(() => {
    const data = frame.contentDocument?.querySelector('canvas')?.dataset;
    if (!data?.seasonalLight) return;
    const sample = { variant, light: JSON.parse(data.seasonalLight), homes: JSON.parse(data.homeLighting ?? '[]'),
        resources: JSON.parse(data.stability ?? '{}'), fire: JSON.parse(data.campfireEffect ?? '{}') };
    if (measurements.length < 300) measurements.push(sample);
    element('metrics').textContent = JSON.stringify(sample, null, 2);
}, 1000);
element('report').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ fixedSave: saved ? JSON.parse(saved) : null,
        userAgent: navigator.userAgent, devicePixelRatio, measurements }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'warm-homes-256.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
addEventListener('pagehide', () => clearInterval(timer));
