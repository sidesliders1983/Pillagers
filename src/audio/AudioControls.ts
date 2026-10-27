import type { FjordAudio, SoundPreferences } from './FjordAudio';
import './audio.css';

/** One movable settings view for the application-owned mixer. No sampling timer. */
export class AudioControls {
    readonly root = document.createElement('fieldset');
    private events = new AbortController();
    private disposed = false;
    constructor(private audio: FjordAudio, private proof: boolean) {
        this.root.className = 'audio-settings';
        this.root.innerHTML = `<legend>Sound</legend>
            <button type="button">Enable sound</button>
            <label><input type="checkbox" data-mute> Mute</label>
            <p role="status" aria-live="polite"></p>
            <label>Master volume<input type="range" data-volume="master" min="0" max="1" step="0.05"></label>
            <details><summary>Sound groups</summary>
                <label>Ambience<input type="range" data-volume="ambience" min="0" max="1" step="0.05"></label>
                <label>World<input type="range" data-volume="world" min="0" max="1" step="0.05"></label>
                <label>Interface<input type="range" data-volume="interface" min="0" max="1" step="0.05"></label>
            </details><small data-audio-pack></small><small data-audio-counts></small>`;
        this.root.querySelector('[data-audio-pack]')!.textContent = proof ?
            'Synthetic audio proof: test tones near the campfire and quiet noise. These are not nature or animal recordings.' :
            'Sounds follow nearby activity. Wildlife calls accompany new sightings.';
        this.root.querySelector('button')!.addEventListener('click', () => {
            void this.audio.enable().then(() => this.refresh());
        });
        this.root.querySelector<HTMLInputElement>('[data-mute]')!.addEventListener('change', event => {
            const muted = (event.target as HTMLInputElement).checked;
            if (muted) this.audio.configure({ muted });
            else void this.audio.enable().then(() => this.refresh());
        });
        for (const field of Array.from(this.root.querySelectorAll<HTMLInputElement>('[data-volume]'))) {
            const key = field.dataset.volume as keyof Omit<SoundPreferences, 'muted'>;
            field.value = String(this.audio.settings[key]);
            field.addEventListener('input', () => this.audio.configure({ [key]: Number(field.value) }));
        }
        const signal = this.events.signal;
        const restore = (event: Event) => {
            const target = event.target as Element | null;
            if (target?.closest?.('#campaign-start, #campaign-recovery, #fjord-play'))
                void this.audio.restoreFromGesture();
        };
        document.addEventListener('pointerdown', restore, { capture: true, signal });
        document.addEventListener('click', restore, { capture: true, signal });
        document.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') restore(event);
        }, { capture: true, signal });
        document.addEventListener('visibilitychange', () => this.audio.setHidden(document.hidden), { signal });
        window.addEventListener('pagehide', event => {
            if (event.persisted) this.audio.setHidden(true);
            else this.dispose();
        }, { signal });
        window.addEventListener('pageshow', () => this.audio.setHidden(document.hidden), { signal });
        this.audio.changed = () => this.refresh();
        this.audio.setHidden(document.hidden);
        this.refresh();
    }
    refresh() {
        if (this.disposed) return;
        const state = this.audio.inspect();
        this.root.querySelector<HTMLInputElement>('[data-mute]')!.checked = this.audio.settings.muted;
        this.root.querySelector('[role="status"]')!.textContent = state.failure ||
            (state.hidden ? 'Sound suspended while away.' : state.enabled ?
                state.state === 'running' ? 'Sound enabled.' : 'Sound suspended. Use Enable sound to resume.' : 'Sound off.');
        this.root.querySelector('[data-audio-counts]')!.textContent = this.proof ?
            `${state.playing} playing + ${state.retiring} fading · ${state.buffers} buffers · ` +
                `${(state.decodedBytes / 1048576).toFixed(2)} MiB PCM (not total memory)` : '';
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.events.abort();
        this.audio.changed = undefined;
        void this.audio.dispose();
    }
}
