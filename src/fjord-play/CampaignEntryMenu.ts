import './player-menu.css';
import { playerFeedbackLinkHTML } from './PlayerFeedback';

/** Reuses the entry owner's existing actions; navigation never prepares or activates a campaign. */
export function organizeCampaignEntry(
    root: HTMLElement,
    audio: HTMLElement,
    performanceSetting: HTMLElement,
    saveDetails?: string,
): void {
    const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
    const context = find('[data-context]');
    const warning = find('[data-storage]');
    const continueButton = find('[data-entry="continue"]') as HTMLButtonElement;
    const newButton = find('[data-entry="new"]');
    const replayButton = find('[data-entry="restart"]');
    const replayReason = find('[data-restart-reason]');
    const rules = find('.entry-rules');
    const loadButton = find('[data-recover]');
    const diagnosticsButton = find('[data-diagnostics]');
    const panels = document.createElement('div');
    panels.innerHTML = `<section data-start-panel="home">
        <div class="entry-actions" data-start-primary></div>
        <div class="entry-secondary-actions">
            <button type="button" data-start-view="settings">Settings</button>
            <button type="button" data-start-view="help">Help &amp; support</button>
        </div>
        <details class="entry-about"><summary>About / Credits</summary><p>FjordSide · A new shore. A shared history.</p>
            <a href="/game-assets/wetlands/ATTRIBUTION.txt" target="_blank" rel="noopener">Nature asset credits</a></details>
    </section>
    <section data-start-panel="new" hidden>
        <button type="button" data-start-back>Back</button>
        <h2 tabindex="-1">New game</h2><div class="entry-actions" data-start-choices></div>
    </section>
    <section data-start-panel="settings" hidden>
        <button type="button" data-start-back>Back</button>
        <h2 tabindex="-1">Settings</h2><div data-start-audio></div>
        <p class="entry-rules">Graphics settings are available while playing.</p>
    </section>
    <section data-start-panel="help" hidden>
        <button type="button" data-start-back>Back</button>
        <h2 tabindex="-1">Help &amp; support</h2>
        <h3>How to play</h3>
        <p>Help an autonomous community, explore the island and build a home for the next generation.
            The optional Founding Journey is available after starting a campaign.</p>
        <details><summary>Controls</summary><p>Touch: drag to orbit, pinch to zoom and tap open ground to centre the camera.
            Mouse: left drag to pan, right drag to rotate and wheel to zoom.</p></details>
        <h3>Having trouble?</h3>
        <p>Load game lets you choose a saved campaign or import a campaign file.
            Keep a downloaded campaign file before replacing progress or clearing browser data.</p>
        ${playerFeedbackLinkHTML()}
        <button type="button" data-start-view="diagnostics">Diagnostics</button>
    </section>
    <section data-start-panel="diagnostics" hidden>
        <button type="button" data-start-back>Back</button>
        <h2 tabindex="-1">Diagnostics</h2>
        <p>Optional tools for troubleshooting. Reports stay on this device until you share them.</p>
        <div data-start-performance></div><div class="entry-actions" data-start-load-test></div>
        <p class="entry-rules">The performance overlay preference is saved in this browser. Choose Off to stop it.</p>
    </section>`;
    continueButton.hidden = continueButton.disabled;
    loadButton.textContent = 'Load game';
    newButton.innerHTML = 'New arrival<small>A new seed, new people and a new history. The island may repeat.</small>';
    replayButton.innerHTML = 'Replay original founding<small>The original founders and island, when available.</small>';
    const newMenuButton = document.createElement('button');
    newMenuButton.type = 'button';
    newMenuButton.dataset.startView = 'new';
    newMenuButton.textContent = 'New game';
    panels.querySelector('[data-start-primary]')!.append(continueButton, newMenuButton, loadButton);
    panels.querySelector('[data-start-choices]')!.append(newButton, replayButton, replayReason, rules);
    panels.querySelector('[data-start-audio]')!.append(audio);
    panels.querySelector('[data-start-performance]')!.append(performanceSetting);
    panels.querySelector('[data-start-load-test]')!.append(diagnosticsButton);
    if (saveDetails) {
        const details = document.createElement('details');
        details.className = 'entry-save-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Campaign details';
        const description = document.createElement('p');
        description.textContent = saveDetails;
        details.append(summary, description);
        panels.querySelector('[data-start-panel="home"]')!.append(details);
    }
    root.replaceChildren(context, warning, panels);
    let view = 'home';
    const trail: { view: string; opener: HTMLElement }[] = [];
    const display = () => {
        for (const panel of Array.from(panels.querySelectorAll<HTMLElement>('[data-start-panel]')))
            panel.hidden = panel.dataset.startPanel !== view;
    };
    const back = () => {
        const previous = trail.pop();
        if (!previous) return;
        view = previous.view;
        display();
        previous.opener.focus();
    };
    root.addEventListener('click', event => {
        const target = (event.target as Element).closest<HTMLElement>('button');
        if (target?.hasAttribute('data-start-back')) back();
        else if (target?.dataset.startView) {
            trail.push({ view, opener: target });
            view = target.dataset.startView;
            display();
            panels.querySelector<HTMLElement>(`[data-start-panel="${view}"] h2`)!.focus();
        }
    });
    root.addEventListener('keydown', event => {
        if (event.key === 'Escape' && view !== 'home') {
            event.preventDefault();
            event.stopImmediatePropagation();
            back();
        }
    });
    (continueButton.hidden ? newMenuButton : continueButton).focus();
}
