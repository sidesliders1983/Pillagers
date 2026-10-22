import { activeSettlementKey } from '../../src/play/SharedSettlement';
import { northernReviewPresentation, northernReviewPhases } from './northern-light-236-fixtures';
import type { PresentationQuality } from '../../src/config/PresentationQuality';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const sunlightReview = document.body.dataset.sunlightReview === 'true';
const reportName = sunlightReview ? 'unified-sunlight-237' : 'northern-light-236';
const frame = element<HTMLIFrameElement>('game'), status = element('status');
const phase = element<HTMLSelectElement>('phase');
for (const [index, entry] of northernReviewPhases.entries()) phase.add(new Option(entry.name, String(index)));
if (sunlightReview) phase.value = '3';
let saved = '', variant = 'baseline', recorder: MediaRecorder | undefined;
const measurements: unknown[] = [];
for (const id of ['island', 'phase', 'quality', 'camera', ...(sunlightReview ? ['bearing'] : [])]) element(id).onchange = () => {
    saved = '';
    for (const action of ['baseline', 'candidate', 'save']) element<HTMLButtonElement>(action).disabled = true;
    status.textContent = 'Selections changed. Prepare a new fixed save to compare these settings.';
};
function download(data: Blob, name: string) {
    const link = document.createElement('a'), url = URL.createObjectURL(data);
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function open(candidate: boolean) {
    if (!saved) return;
    if (recorder?.state === 'recording') recorder.stop();
    // The entry controller reads its active campaign from sessionStorage, ahead of local saves.
    sessionStorage.setItem(activeSettlementKey, saved);
    variant = sunlightReview ? (candidate ? 'unified-v1' : 'northern-v1') : candidate ? 'northern-v1' : 'baseline';
    frame.src = sunlightReview ? '/fjord-play?lighting=northern-v1&sunlight=' + variant : '/fjord-play?lighting=' + variant;
    status.textContent = `Opening ${variant} from the fixed paused review save. Use the game's existing Play control to advance time.`;
}
element('prepare').onclick = async () => {
    if (recorder?.state === 'recording') recorder.stop();
    element<HTMLButtonElement>('prepare').disabled = true;
    status.textContent = 'Preparing the ordinary settlement and its canonical phase…';
    await new Promise(resolve => requestAnimationFrame(resolve));
    try {
        const seed = element<HTMLSelectElement>('island').value;
        const progress = String(northernReviewPhases[Number(phase.value)].progress).replace('.', '-');
        const response = await fetch(`/docs/qa/northern-light-236/fixtures/seed-${seed}-phase-${progress}.json`);
        if (!response.ok) throw new Error('The fixed review save could not be loaded.');
        saved = northernReviewPresentation(await response.text(),
            element<HTMLSelectElement>('quality').value as PresentationQuality,
            element<HTMLSelectElement>('camera').value === 'low');
        if (sunlightReview && element<HTMLSelectElement>('bearing').value === 'sunward') {
            const state = JSON.parse(saved), { position, target } = state.presentation.camera;
            position[0] = target[0] - (position[0] - target[0]);
            position[2] = target[2] - (position[2] - target[2]);
            saved = JSON.stringify(state);
        }
        measurements.length = 0;
        previous = '';
        for (const id of ['baseline', 'candidate', 'save', 'report']) element<HTMLButtonElement>(id).disabled = false;
        status.textContent = 'Fixed save ready. Both variants restore the same campaign, camera and quality.';
    } catch (error) { status.textContent = String(error); }
    finally { element<HTMLButtonElement>('prepare').disabled = false; }
};
element('baseline').onclick = () => open(false);
element('candidate').onclick = () => open(true);
element('save').onclick = () => download(new Blob([saved], { type: 'application/json' }), reportName + '-save.json');
element('record').onclick = () => {
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    const canvas = frame.contentDocument?.querySelector('canvas');
    if (!canvas?.captureStream || typeof MediaRecorder === 'undefined') {
        status.textContent = 'Canvas recording is unavailable in this browser. Use the device screen recorder.';
        return;
    }
    const stream = canvas.captureStream(30), chunks: BlobPart[] = [];
    const capture = recorder = new MediaRecorder(stream);
    capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    capture.onstop = () => {
        const extension = capture.mimeType.includes('mp4') ? 'mp4' : 'webm';
        download(new Blob(chunks, { type: capture.mimeType }), reportName + '-capture.' + extension);
        stream.getTracks().forEach(track => track.stop());
        element('record').textContent = 'Record canvas';
    };
    capture.start(); element('record').textContent = 'Stop recording';
    status.textContent = 'Recording the actual WebGL canvas. Press Play in the game; its canonical annual clock drives the light.';
};
element('report').onclick = () => download(new Blob([JSON.stringify({ version: 1, variant, review: reportName,
    fixedSave: saved ? JSON.parse(saved) : null,
    userAgent: navigator.userAgent, devicePixelRatio, viewport: [frame.clientWidth, frame.clientHeight],
    measurements }, null, 2)], { type: 'application/json' }), reportName + '-measurements.json');
let previous = '';
const telemetry = setInterval(() => {
    const canvas = frame.contentDocument?.querySelector('canvas');
    if (!canvas?.dataset.seasonalLight || !canvas.dataset.stability) return;
    const value = JSON.stringify({ variant, light: JSON.parse(canvas.dataset.seasonalLight),
        calendar: JSON.parse(canvas.dataset.calendar ?? '{}'), resources: JSON.parse(canvas.dataset.stability),
        sunlight: JSON.parse(canvas.dataset.sunlight ?? 'null'),
        shadows: JSON.parse(canvas.dataset.shadowCoverage ?? 'null'), camera: JSON.parse(canvas.dataset.camera ?? 'null') });
    if (value !== previous) {
        if (measurements.length < 180) measurements.push(JSON.parse(value));
        element('metrics').textContent = value; previous = value;
    }
    element<HTMLButtonElement>('record').disabled = false;
}, 1000); // Review telemetry only; this never advances the campaign or changes light.
addEventListener('pagehide', () => {
    clearInterval(telemetry);
    if (recorder?.state === 'recording') recorder.stop();
});
