import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { activeSettlementKey, inspectSettlementSave } from '../play/SharedSettlement';
import { readRecoverySources, type RecoveryCandidate } from '../play/SettlementRecovery';
import { chooseSettlementRecovery } from './CampaignRecovery';
import { projectFjordCalendar } from './FjordCalendar';
import './campaign-start.css';

export interface CampaignStartAttempt {
    kind: 'continue' | 'restart' | 'new';
    seed: number;
    source?: RecoveryCandidate;
    restart?: GameplaySession;
    resumePlayback?: boolean;
    signal: AbortSignal;
    /** Called once, after world, assets and camera are ready. A failed write keeps the prior save. */
    activate(text: string): void;
}

interface EntryPorts {
    session: Pick<Storage, 'getItem' | 'setItem'>;
    local: Pick<Storage, 'getItem'>;
    drawSeed(): number;
    open(attempt: CampaignStartAttempt): Promise<void>;
}

function restartProposal(text: string) {
    const data = JSON.parse(text);
    const fjord = data.sharedVersion === 1 ? data.fjord : data;
    const session = new GameplaySession();
    session.loadJSON(JSON.stringify(fjord.bridgeVersion ? fjord.campaign : fjord));
    return session.restartProposal();
}

function download(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fjordside-campaign.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function shell() {
    document.title = 'FjordSide';
    document.body.className = 'fjord-entry';
    const root = document.createElement('main');
    root.id = 'campaign-start';
    root.innerHTML = `<header><img src="/branding/fjordside/app-192.png" width="72" height="72" alt="">
        <div><p class="entry-eyebrow">A new shore. A shared history.</p><h1>FjordSide</h1></div></header>
        <section class="entry-content" aria-label="Campaign start"></section>`;
    document.body.replaceChildren(root);
    return root.querySelector<HTMLElement>('.entry-content')!;
}

/** One startup owner. Save inspection is read-only; expensive game code is imported after a choice. */
export async function runFjordEntry(ports: EntryPorts = {
    session: { getItem: key => sessionStorage.getItem(key), setItem: (key, text) => sessionStorage.setItem(key, text) },
    local: { getItem: key => localStorage.getItem(key) },
    drawSeed: () => crypto.getRandomValues(new Uint32Array(1))[0],
    open: async attempt => {
        const { FjordPlay } = await import('./FjordPlay');
        await new FjordPlay().start(attempt);
    },
}): Promise<void> {
    const lifetime = new AbortController();
    const leaving = (event: PageTransitionEvent) => { if (!event.persisted) lifetime.abort(); };
    window.addEventListener('pagehide', leaving);
    const waitForChoice = <T>(root: HTMLElement, choose: (target: HTMLElement) => T | undefined) =>
        new Promise<T>((resolve, reject) => {
            const events = new AbortController();
            const abort = () => {
                events.abort();
                reject(new DOMException('Start menu left.', 'AbortError'));
            };
            lifetime.signal.addEventListener('abort', abort, { once: true });
            root.addEventListener('click', event => {
                const target = (event.target as Element).closest<HTMLElement>('button');
                if (!target || (target as HTMLButtonElement).disabled) return;
                const choice = choose(target);
                if (choice === undefined) return;
                events.abort();
                lifetime.signal.removeEventListener('abort', abort);
                resolve(choice);
            }, { signal: events.signal });
            root.addEventListener('keydown', event => {
                if (event.key === 'Escape') root.querySelector<HTMLButtonElement>('[data-cancel], [data-back]')?.click();
            }, { signal: events.signal });
        });
    try {
        let bypass = new URLSearchParams(window.location.search).get('entry');
        if (bypass) {
            const url = new URL(window.location.href);
            url.searchParams.delete('entry');
            window.history.replaceState(null, '', url);
        }
        for (;;) {
            lifetime.signal.throwIfAborted();
            let content = shell();
            content.innerHTML = '<p role="status">Checking saved campaigns…</p>';
            await new Promise(resolve => setTimeout(resolve, 0));
            let expectedActive: string | null | undefined;
            const sources = readRecoverySources(key => {
                const value = ports.session.getItem(key);
                if (key === activeSettlementKey) expectedActive = value;
                return value;
            }, key => ports.local.getItem(key));
            let selected = sources.candidates.find(candidate => candidate.text === sources.active);
            const foundingChecks = new Map<string, { proposal?: GameplaySession; reason: string }>();
            for (;;) {
                lifetime.signal.throwIfAborted();
                let restart: GameplaySession | undefined;
                let restartReason = 'A valid founding campaign is needed.';
                if (selected) {
                    let check = foundingChecks.get(selected.text);
                    if (!check) {
                        try { check = { proposal: restartProposal(selected.text), reason: '' }; }
                        catch (error) { check = { reason: error instanceof Error ? error.message : String(error) }; }
                        foundingChecks.set(selected.text, check);
                    }
                    restart = check.proposal;
                    restartReason = check.reason;
                }
                content = shell();
                content.innerHTML = `<p data-context></p><p role="status" data-storage></p>
                    <div class="entry-actions">
                        <button type="button" data-entry="continue">Continue campaign<small>Return to your saved settlement.</small></button>
                        <p data-unavailable></p>
                        <button type="button" data-entry="restart">New campaign — same founders<small>Replay their original arrival on the same island.</small></button>
                        <p data-restart-reason></p>
                        <button type="button" data-entry="new">New scenario<small>A new seed, new people and a new history.</small></button>
                    </div><p class="entry-rules">Start with cattle, pigs, sheep or goats. Terrain comes from the validated island pool.</p>
                    <button class="entry-secondary" type="button" data-recover>Recover or import a campaign</button>`;
                const summary = selected && projectFjordCalendar(selected.metadata.time, selected.metadata.ticksPerWinter);
                content.querySelector('[data-context]')!.textContent = selected ?
                    `${selected.source} · ${summary!.season} ${summary!.year} · Seed ${selected.metadata.seed}` :
                    sources.candidates.length ? 'Choose a saved campaign to continue or replay its founding.' : 'No valid saved campaign is available.';
                content.querySelector('[data-storage]')!.textContent = sources.warnings.length ?
                    'Browser storage is unavailable. Progress may not be saved; export a recovery file before leaving.' :
                    sources.damaged.length ? 'A saved file could not be read. It is preserved in recovery.' : '';
                const continueButton = content.querySelector<HTMLButtonElement>('[data-entry="continue"]')!;
                continueButton.disabled = !selected;
                content.querySelector('[data-unavailable]')!.textContent = selected ? '' : 'Select a valid save to continue.';
                content.querySelector<HTMLButtonElement>('[data-entry="restart"]')!.disabled = !restart;
                content.querySelector('[data-restart-reason]')!.textContent = restart ? '' : restartReason;
                content.querySelector<HTMLButtonElement>('button:not(:disabled)')!.focus();
                const choice = bypass === 'handoff' || bypass === 'recovery' || bypass === 'qa-continue' ?
                    (selected ? 'continue' : 'recover') : bypass === 'qa-new' ? 'new' :
                    await waitForChoice(content, target => target.dataset.entry ?? (target.hasAttribute('data-recover') ? 'recover' : undefined));
                const qaNew = bypass === 'qa-new';
                const handoff = bypass === 'handoff';
                bypass = null;
                if (choice === 'recover') {
                    const text = await chooseSettlementRecovery(sources, '', 'Back to start menu');
                    if (text) selected = sources.candidates.find(candidate => candidate.text === text) ??
                        { text, source: 'Imported campaign', metadata: inspectSettlementSave(text) };
                    continue;
                }
                if (choice !== 'continue' && (selected || sources.candidates.length || sources.damaged.length)) {
                    content.innerHTML = `<h2>Replace the active campaign?</h2>
                        <p>Your current progress will be replaced. Manually saved checkpoints are kept.</p>
                        <div class="entry-confirm"><button type="button" data-cancel>Cancel</button>
                        <button type="button" data-confirm>Start new campaign</button></div>`;
                    content.querySelector<HTMLButtonElement>('[data-cancel]')!.focus();
                    const confirmed = await waitForChoice(content, target => target.hasAttribute('data-confirm') ? true : false);
                    if (!confirmed) continue;
                }
                let seed = selected?.metadata.seed ?? 32;
                if (choice === 'new') {
                    seed = qaNew ? Number(new URLSearchParams(window.location.search).get('seed') ?? 32) : ports.drawSeed();
                    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be uint32.');
                    const used = new Set(sources.candidates.map(candidate => candidate.metadata.seed));
                    if (selected) used.add(selected.metadata.seed);
                    while (!qaNew && used.has(seed)) seed = (seed + 1) >>> 0;
                }
                let prepared: string | undefined;
                let activated = false;
                const attempt: CampaignStartAttempt = {
                    kind: choice as CampaignStartAttempt['kind'], seed, source: selected,
                    restart: choice === 'restart' ? restart : undefined,
                    resumePlayback: handoff, signal: lifetime.signal,
                    activate: text => {
                        lifetime.signal.throwIfAborted();
                        prepared = text;
                        if (activated) throw new Error('This campaign already owns the session.');
                        let current: string | null;
                        try { current = ports.session.getItem(activeSettlementKey); }
                        catch {
                            throw new Error('Browser storage is unavailable. Progress cannot be saved. Export the prepared campaign or return to the start menu.');
                        }
                        if (current !== expectedActive)
                            throw new Error('The active session changed while loading. Return to the start menu.');
                        try { ports.session.setItem(activeSettlementKey, text); }
                        catch {
                            throw new Error('Browser storage is unavailable or full. Progress cannot be saved. Export the prepared campaign or try again.');
                        }
                        activated = true;
                    },
                };
                for (;;) {
                    content = shell();
                    content.innerHTML = '<p role="status">Opening your campaign…</p>';
                    try {
                        await ports.open(attempt);
                        lifetime.signal.throwIfAborted();
                        return;
                    } catch (error) {
                        lifetime.signal.throwIfAborted();
                        if (error instanceof DOMException && error.name === 'AbortError') break;
                        content = shell();
                        content.innerHTML = `<h2>Campaign not opened</h2><p role="status"></p>
                            <p>Your previous saves have not been replaced.</p><div class="entry-confirm">
                            <button type="button" data-retry>Try again</button>
                            <button type="button" data-back>Back to start menu</button>
                            <button type="button" data-export>Export prepared campaign</button></div>`;
                        content.querySelector('[role="status"]')!.textContent = String(error);
                        content.querySelector<HTMLButtonElement>('[data-export]')!.hidden = !prepared;
                        content.querySelector('[data-export]')!.addEventListener('click', () => { if (prepared) download(prepared); });
                        content.querySelector<HTMLButtonElement>('[data-retry]')!.focus();
                        const retry = await waitForChoice(content, target => target.hasAttribute('data-retry') ? true :
                            target.hasAttribute('data-back') ? false : undefined);
                        if (!retry) break;
                    }
                }
                break;
            }
        }
    } finally {
        window.removeEventListener('pagehide', leaving);
    }
}
