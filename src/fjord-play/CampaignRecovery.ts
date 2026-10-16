import { inspectSettlementSave } from '../play/SharedSettlement';
import type { RecoverySources } from '../play/SettlementRecovery';
import { projectFjordCalendar } from './FjordCalendar';

/** A full-page recovery choice. Reading, importing and downloading never writes storage. */
export function chooseSettlementRecovery(sources: RecoverySources, error = ''): Promise<string | null> {
    const root = document.createElement('main');
    root.id = 'campaign-recovery';
    root.className = 'fjord-bootstrap';
    root.innerHTML = `<h1>Return to your settlement</h1><p role="status"></p>
        <p>Your existing saves have not been replaced. Choose a saved campaign, import a file, or start a new campaign.</p>
        <section aria-label="Available saved campaigns"></section>
        <label>Import campaign<input type="file" accept="application/json,.json"></label>
        <section aria-label="Damaged save recovery files"></section>
        <button type="button" data-new>Start a new campaign</button>`;
    const status = root.querySelector<HTMLElement>('[role="status"]')!;
    status.textContent = error || sources.warnings.join(' ') ||
        'The active session is missing or could not be restored.';
    document.body.replaceChildren(root);
    return new Promise((resolve, reject) => {
        const events = new AbortController();
        const finish = (text: string | null) => { events.abort(); root.remove(); resolve(text); };
        window.addEventListener('pagehide', event => {
            if (event.persisted) return;
            events.abort();
            reject(new DOMException('Campaign recovery left.', 'AbortError'));
        }, { signal: events.signal });
        for (const candidate of sources.candidates) {
            const calendar = projectFjordCalendar(candidate.metadata.time, candidate.metadata.ticksPerWinter);
            const item = document.createElement('p');
            const button = document.createElement('button');
            button.textContent = 'Restore ' + candidate.source.toLowerCase();
            button.addEventListener('click', () => finish(candidate.text), { signal: events.signal });
            item.append(button, document.createTextNode(' ' + calendar.season + ' ' + calendar.year +
                ' · campaign ' + candidate.metadata.seed));
            if (candidate.source === 'Local campaign data only') {
                const note = document.createElement('small');
                note.textContent = ' This copy contains campaign data only; saved scenery and published book passages are not included.';
                item.append(note);
            }
            root.querySelector('[aria-label="Available saved campaigns"]')!.append(item);
        }
        for (const damaged of sources.damaged) {
            const button = document.createElement('button');
            button.textContent = 'Download ' + damaged.source + ' recovery file';
            button.addEventListener('click', () => {
                const url = URL.createObjectURL(new Blob([damaged.text], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'fjordside-recovery.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, { signal: events.signal });
            root.querySelector('[aria-label="Damaged save recovery files"]')!.append(button);
        }
        root.querySelector('input')!.addEventListener('change', async event => {
            const input = event.target as HTMLInputElement, file = input.files?.[0];
            if (!file) return;
            try {
                if (file.size > 24000000) throw new Error('Campaign file exceeds the 24MB limit.');
                const text = await file.text();
                inspectSettlementSave(text);
                if (!events.signal.aborted) finish(text);
            } catch (cause) {
                status.textContent = 'Could not read that campaign. ' + String(cause);
                input.value = '';
            }
        }, { signal: events.signal });
        root.querySelector('[data-new]')!.addEventListener('click', () => finish(null), { signal: events.signal });
        root.querySelector<HTMLElement>('button, input')!.focus();
    });
}
