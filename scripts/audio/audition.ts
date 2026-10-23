import { FjordAudio, type SoundManifest } from '../../src/audio/FjordAudio';
import { AudioControls } from '../../src/audio/AudioControls';

interface Entry {
    id: string;
    label: string;
    trigger: string;
    prepared: {
        seconds: number;
        channels: number;
        bytes: number;
        truePeakDbFS: number;
        rmsDbFS: number;
        monoFoldDownRelativeDb: number;
    };
    status: { technical: string; listening: string; distribution: string };
    provenance: { sourceTitle?: string; recordingOrAI: string; sourceUrl?: string; reviewNotes?: string[] };
}

const audio = new FjordAudio();
const controls = new AudioControls(audio, false);
const settings = document.querySelector('#settings')!;
settings.append(controls.root);
controls.root.querySelector('[data-audio-pack]')!.textContent =
    'Private candidate recordings. Source verification and listening approval are pending. No files are published.';

const status = document.querySelector<HTMLOutputElement>('#status')!;
const cards = document.querySelector('#candidates')!;
const manifest = await fetch('/manifest.json').then(response => response.json()) as SoundManifest;
const catalogue = await fetch('/catalogue.json').then(response => response.json()) as { entries: Entry[] };
const version = await fetch('/version.json').then(response => response.json());
const camera = { focus: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: -1 }, distance: 25 };
let current: Entry | undefined;
let world: ReturnType<FjordAudio['world']> | undefined;
let lastSample = 0;
let frame = 0;
let generation = 0;
const observations = new Map<string, { id: string; decoded: boolean; state: string; playing: number;
    buffers: number; decodedBytes: number; checkedUtc: string }>();
// Owner choice on 23 October 2026, after the frozen source-page audit.
// Retaining a candidate does not accept its mix, species identity or distribution.
const retainedAsSupplied = new Set(['wind-spring', 'wind-summer', 'campfire']);

function stop() {
    generation++;
    world?.dispose();
    world = undefined;
    current = undefined;
    status.value = 'Stopped.';
    audio.sample();
}

function update() {
    const now = performance.now() / 1000;
    if (world?.due && current) {
        world.update(camera, [{ id: current.id,
            cue: manifest.cues.find(cue => cue.variants.includes(current!.id))!.id, permitted: true,
            position: { x: 3, y: 0, z: -3 }, event: 'audition' }], false);
    }
    if (now - lastSample > .5) {
        lastSample = now;
        const state = audio.sample();
        if (current) {
            if (state.playing > 0) {
                observations.set(current.id, { id: current.id, decoded: true, state: state.state,
                    playing: state.playing, buffers: state.buffers, decodedBytes: state.decodedBytes,
                    checkedUtc: new Date().toISOString() });
                document.querySelector(`[data-decoded="${current.id}"]`)!.textContent = 'Browser decode: passed';
            }
            const mode = manifest.cues.find(cue => cue.variants.includes(current!.id))!.loop ? 'Loop' : 'Call / texture';
            status.value = `${mode}: ${current.label} · ${state.state} · ${state.playing} playing · ` +
                `${(state.decodedBytes / 1048576).toFixed(2)} MiB cached PCM`;
            if (state.failure) status.value += ' · ' + state.failure;
        }
        document.querySelector('#checked')!.textContent = `${observations.size} / ${catalogue.entries.length} browser decodes observed`;
    }
    frame = requestAnimationFrame(update);
}

async function play(entry: Entry) {
    stop();
    const attempt = generation;
    // This is called directly by the Play button so Safari receives the gesture.
    if (!await audio.enable() || attempt !== generation) return;
    const family = manifest.cues.find(cue => cue.variants.includes(entry.id))!;
    const cue = { ...family, variants: [entry.id] };
    current = entry;
    world = audio.world({ assets: manifest.assets.filter(asset => asset.id === entry.id), cues: [cue] });
    status.value = 'Loading ' + entry.label + '…';
}

for (const entry of catalogue.entries) {
    const card = document.createElement('article');
    const heading = document.createElement('h2');
    heading.textContent = entry.label;
    const detail = document.createElement('p');
    detail.textContent = `${entry.prepared.seconds.toFixed(2)} s · ` +
        `${entry.prepared.channels === 1 ? 'mono point source' : 'stereo bed'} · ` +
        `${Math.ceil(entry.prepared.bytes / 1024)} KiB · ${entry.prepared.truePeakDbFS.toFixed(1)} dBTP`;
    const intended = document.createElement('p');
    intended.textContent = 'Intended trigger: ' + entry.trigger;
    const provenance = document.createElement('p');
    provenance.textContent = `${entry.provenance.sourceTitle ?? 'Custom Foley'} · ${entry.provenance.recordingOrAI}`;
    const concerns = document.createElement('p');
    concerns.className = 'notice';
    const capturedNotes = entry.provenance.reviewNotes?.join(' ') ?? '';
    concerns.textContent = retainedAsSupplied.has(entry.id)
        ? capturedNotes.replace('; owner preference pending.', '.') +
            ' Owner approved retaining this supplied recording. Listening and publication review remain open.'
        : capturedNotes;
    concerns.hidden = !concerns.textContent;
    const button = document.createElement('button');
    button.textContent = 'Play ' + entry.id;
    button.addEventListener('click', () => { void play(entry); });
    const decoded = document.createElement('span');
    decoded.dataset.decoded = entry.id;
    decoded.textContent = 'Browser decode: not checked';
    const notes = document.createElement('textarea');
    notes.rows = 2;
    notes.dataset.notes = entry.id;
    notes.setAttribute('aria-label', 'Review notes for ' + entry.id);
    notes.placeholder = 'Call identity, voices/traffic, tail, loudness, loop seams…';
    card.append(heading, detail, intended, provenance, concerns, button, decoded, notes);
    cards.append(card);
}

document.querySelector('#stop')!.addEventListener('click', stop);
document.querySelector('#export')!.addEventListener('click', () => {
    const notes = Array.from(document.querySelectorAll<HTMLTextAreaElement>('[data-notes]')).map(field =>
        ({ id: field.dataset.notes, notes: field.value }));
    const result = { version: 1, recordedUtc: new Date().toISOString(),
        scope: 'Local candidate audition; decode observations do not prove audible quality or device output.',
        userAgent: navigator.userAgent, build: version, observations: [...observations.values()], notes };
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    link.href = url;
    link.download = 'fjordside-sound-review.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    stop();
});
window.addEventListener('pageshow', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
});
frame = requestAnimationFrame(update);
