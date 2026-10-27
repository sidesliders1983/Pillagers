import './wildlife-cinematic.css';

/** Small optional controls over the ordinary scene, with no canvas shield or modal focus trap. */
export class WildlifeCinematicView {
    private readonly panel: HTMLElement;
    private readonly events: AbortController;
    constructor(root: HTMLElement, label: string, actions: { stop(): void; book(): void }) {
        const document = root.ownerDocument;
        this.events = new document.defaultView!.AbortController();
        this.panel = document.createElement('section');
        this.panel.className = 'wildlife-cinematic';
        this.panel.setAttribute('aria-label', 'Wildlife sighting camera');
        const title = document.createElement('strong');
        title.textContent = label;
        const hint = document.createElement('small');
        hint.textContent = 'Scroll or move the camera to take over.';
        const buttons = document.createElement('div');
        for (const [label, action] of [['Open wildlife in Clan Book', actions.book], ['Stop camera', actions.stop]] as const) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', action, { signal: this.events.signal });
            buttons.append(button);
        }
        this.panel.append(title, hint, buttons);
        root.append(this.panel);
    }
    dispose() {
        this.events.abort();
        this.panel.remove();
    }
}
