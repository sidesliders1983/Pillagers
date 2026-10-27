import './wedding-cinematic.css';

/** Transient controls; confirmation/payment remain in the existing wedding invitation. */
export class WeddingCinematicView {
    private readonly shell: HTMLDivElement;
    private readonly names: HTMLElement;
    private readonly status: HTMLElement;
    private readonly music: HTMLButtonElement;
    private readonly key: (event: KeyboardEvent) => void;
    private disposed = false;
    constructor(private readonly root: HTMLElement, actions: { skip(): void; play(): void }) {
        const document = root.ownerDocument;
        this.shell = document.createElement('div');
        this.shell.className = 'wedding-cinematic';
        const shield = document.createElement('div');
        shield.className = 'wedding-cinematic__shield';
        const panel = document.createElement('section');
        panel.className = 'wedding-cinematic__controls';
        panel.setAttribute('aria-label', 'Wedding cinematic');
        const title = document.createElement('strong');
        title.textContent = 'Wedding celebration';
        this.names = document.createElement('span');
        this.names.className = 'wedding-cinematic__names';
        this.status = document.createElement('span');
        this.status.setAttribute('role', 'status');
        const buttons = document.createElement('div');
        this.music = document.createElement('button');
        this.music.type = 'button';
        this.music.dataset.weddingPlay = '';
        this.music.textContent = 'Play music';
        this.music.title = 'Enable sound and play Firelight Vow';
        this.music.onclick = () => actions.play();
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.dataset.weddingSkip = '';
        skip.textContent = 'Skip';
        skip.setAttribute('aria-label', 'Skip wedding cinematic');
        skip.onclick = () => actions.skip();
        buttons.append(this.music, skip);
        panel.append(title, this.names, this.status, buttons);
        this.shell.append(shield, panel); root.append(this.shell);
        this.key = event => { if (event.key === 'Escape') { event.stopPropagation(); actions.skip(); } };
        document.addEventListener('keydown', this.key);
    }
    update(names: readonly string[], phase: string, audio: string, running: boolean, remaining: number) {
        this.names.textContent = names.join(' & ');
        this.status.textContent = !running ? 'Clock paused' : phase === 'approach' ? 'Gathering guests' :
            audio === 'blocked' ? 'Tap Play music to listen' : Math.max(0, Math.ceil(remaining)) + ' seconds';
        this.music.disabled = !running || phase === 'approach';
        this.music.hidden = audio === 'playing' || audio === 'loading';
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.root.ownerDocument.removeEventListener('keydown', this.key);
        this.music.onclick = null;
        this.shell.remove();
    }
}
