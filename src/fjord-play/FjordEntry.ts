import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { activeSettlementKey, inspectSettlementSave } from '../play/SharedSettlement';
import { readRecoverySources, type RecoveryCandidate } from '../play/SettlementRecovery';
import { chooseSettlementRecovery } from './CampaignRecovery';
import { projectFjordCalendar } from './FjordCalendar';
import './campaign-start.css';
import { lastIslandLoad } from './IslandLoadStatus';
import { LoadingRunDiagnostics } from './LoadingRunDiagnostics';
import { PlaytestPerformance } from './PlaytestPerformance';

export interface CampaignStartAttempt {
    kind: 'continue' | 'restart' | 'new';
    seed: number;
    source?: RecoveryCandidate;
    restart?: GameplaySession;
    resumePlayback?: boolean;
    signal: AbortSignal;
    /** Read-only preparation test: dispose before activation, playback or clock ownership. */
    diagnosticRun?: LoadingRunDiagnostics;
    /** Presentation-only diagnostics; never serialized into a campaign. */
    performance?: PlaytestPerformance;
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

function download(text: string, filename = 'fjordside-campaign.json') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
    const diagnostics = new PlaytestPerformance();
    const showShell = () => {
        const content = shell();
        content.parentElement!.append(diagnostics.settings());
        diagnostics.setMode('Start menu');
        diagnostics.mount();
        return content;
    };
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
        let diagnosticMode = new URLSearchParams(window.location.search).get('diagnostics') === 'load';
        const setDiagnosticMode = (enabled: boolean) => {
            diagnosticMode = enabled;
            const url = new URL(window.location.href);
            if (enabled) url.searchParams.set('diagnostics', 'load');
            else url.searchParams.delete('diagnostics');
            window.history.replaceState(null, '', url);
        };
        const showDiagnosticResult = async (report: ReturnType<LoadingRunDiagnostics['finish']>) => {
            const content = showShell();
            const completed = report.outcome === 'diagnostic-complete';
            content.innerHTML = `<h2>${completed ? 'Loading diagnostics complete' : 'Loading diagnostics stopped'}</h2>
                <p role="status" data-diagnostic-summary></p><p data-diagnostic-error></p>
                <p>The game has not started. Your saved campaigns are unchanged.</p>
                <div class="entry-actions"><button type="button" data-download>Download diagnostics JSON</button>
                    <button type="button" data-retry>Run again</button>
                    <button type="button" data-back>Back to start menu</button></div>
                <p class="entry-rules">If the download did not start automatically, use Download diagnostics JSON.
                The report stays on this device until you share it.</p>`;
            content.querySelector('[data-diagnostic-summary]')!.textContent =
                `${(report.elapsedMs / 1000).toFixed(1)} s · ${report.summary.resourceCount} observed resources · ` +
                `${report.summary.settlementModelCount} settlement models`;
            content.querySelector('[data-diagnostic-error]')!.textContent = report.error ?? report.loading?.error?.message ?? '';
            const text = JSON.stringify(report, null, 2);
            const save = () => download(text, `fjordside-loading-run-${report.loading?.attempt ?? Date.now()}.json`);
            content.querySelector('[data-download]')!.addEventListener('click', save);
            content.querySelector<HTMLButtonElement>('[data-download]')!.focus();
            try { save(); } catch { /* A user-initiated download remains available on restricted browsers. */ }
            return waitForChoice(content, target => target.hasAttribute('data-retry') ? true :
                target.hasAttribute('data-back') ? false : undefined);
        };
        let bypass = new URLSearchParams(window.location.search).get('entry');
        if (bypass) {
            const url = new URL(window.location.href);
            url.searchParams.delete('entry');
            window.history.replaceState(null, '', url);
        }
        for (;;) {
            lifetime.signal.throwIfAborted();
            let content = showShell();
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
                content = showShell();
                content.innerHTML = `<p data-context></p><p role="status" data-storage></p>
                    <div class="entry-actions">
                        <button type="button" data-entry="continue">Continue campaign<small>Return to your saved settlement.</small></button>
                        <p data-unavailable></p>
                        <button type="button" data-entry="restart">New campaign — same founders<small>Replay their original arrival on the same island.</small></button>
                        <p data-restart-reason></p>
                        <button type="button" data-entry="new">New scenario<small>A new seed, new people and a new history.</small></button>
                    </div><p class="entry-rules">Start with cattle, pigs, sheep or goats. Terrain comes from the validated island pool.</p>
                    <button class="entry-secondary" type="button" data-recover>Recover or import a campaign</button>
                    <button class="entry-secondary" type="button" data-diagnostics>Run loading diagnostics</button>
                    <button class="entry-secondary" type="button" data-play-mode hidden>Back to normal play</button>`;
                content.querySelector<HTMLButtonElement>('[data-diagnostics]')!.hidden = diagnosticMode;
                content.querySelector<HTMLButtonElement>('[data-play-mode]')!.hidden = !diagnosticMode;
                if (diagnosticMode) {
                    content.querySelector('.entry-rules')!.textContent =
                        'Loading diagnostics only. Prepare the island, download a JSON report and stop. Saved campaigns are unchanged.';
                    content.querySelector('[data-entry="continue"]')!.innerHTML =
                        'Test saved campaign<small>Measure loading your current settlement.</small>';
                    content.querySelector('[data-entry="restart"]')!.innerHTML =
                        'Test original arrival<small>Measure a replay with the same founders and island.</small>';
                    content.querySelector('[data-entry="new"]')!.innerHTML =
                        'Test a new scenario<small>Prepare a new island without saving or starting it.</small>';
                }
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
                    await waitForChoice(content, target => target.dataset.entry ??
                        (target.hasAttribute('data-recover') ? 'recover' :
                        target.hasAttribute('data-diagnostics') ? 'diagnostics' :
                        target.hasAttribute('data-play-mode') ? 'play-mode' : undefined));
                const qaNew = bypass === 'qa-new';
                const handoff = bypass === 'handoff';
                bypass = null;
                if (choice === 'diagnostics' || choice === 'play-mode') {
                    setDiagnosticMode(choice === 'diagnostics');
                    continue;
                }
                if (choice === 'recover') {
                    const text = await chooseSettlementRecovery(sources, '', 'Back to start menu');
                    if (text) selected = sources.candidates.find(candidate => candidate.text === text) ??
                        { text, source: 'Imported campaign', metadata: inspectSettlementSave(text) };
                    continue;
                }
                if (!diagnosticMode && choice !== 'continue' && (selected || sources.candidates.length || sources.damaged.length)) {
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
                    performance: diagnostics,
                    kind: choice as CampaignStartAttempt['kind'], seed, source: selected,
                    restart: choice === 'restart' ? restart : undefined,
                    resumePlayback: handoff, signal: lifetime.signal,
                    activate: text => {
                        lifetime.signal.throwIfAborted();
                        if (attempt.diagnosticRun) throw new Error('A diagnostic run cannot activate or save a campaign.');
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
                    content = showShell();
                    content.innerHTML = diagnosticMode ? '<p role="status">Starting loading diagnostics…</p>' :
                        '<p role="status">Opening your campaign…</p>';
                    attempt.diagnosticRun = diagnosticMode ? new LoadingRunDiagnostics() : undefined;
                    try {
                        await ports.open(attempt);
                        lifetime.signal.throwIfAborted();
                        if (attempt.diagnosticRun) {
                            const retry = await showDiagnosticResult(attempt.diagnosticRun.finish());
                            if (retry) continue;
                            break;
                        }
                        return;
                    } catch (error) {
                        const diagnosticReport = attempt.diagnosticRun?.finish(error);
                        lifetime.signal.throwIfAborted();
                        if (diagnosticReport) {
                            const retry = await showDiagnosticResult(diagnosticReport);
                            if (retry) continue;
                            break;
                        }
                        if (error instanceof DOMException && error.name === 'AbortError') break;
                        content = showShell();
                        content.innerHTML = `<h2>Campaign not opened</h2><p role="status"></p>
                            <p>Your previous saves have not been replaced.</p><div class="entry-confirm">
                            <button type="button" data-retry>Try again</button>
                            <button type="button" data-back>Back to start menu</button>
                            <button type="button" data-export>Export prepared campaign</button>
                            <button type="button" data-load-report>Save loading diagnostics</button></div><p data-load-context></p>`;
                        content.querySelector('[role="status"]')!.textContent = String(error);
                        content.querySelector<HTMLButtonElement>('[data-export]')!.hidden = !prepared;
                        content.querySelector('[data-export]')!.addEventListener('click', () => { if (prepared) download(prepared); });
                        const report = lastIslandLoad();
                        content.querySelector<HTMLButtonElement>('[data-load-report]')!.hidden = !report;
                        if (report) {
                            content.querySelector('[data-load-context]')!.textContent =
                                `${report.stage} · ${report.percent}% · attempt ${report.attempt}`;
                            content.querySelector('[data-load-report]')!.addEventListener('click', () =>
                                download(JSON.stringify(report, null, 2), `fjordside-load-${report.attempt}.json`));
                        }
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
        if (lifetime.signal.aborted) diagnostics.dispose();
        window.removeEventListener('pagehide', leaving);
    }
}
