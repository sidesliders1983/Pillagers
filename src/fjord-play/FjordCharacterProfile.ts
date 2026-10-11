import { Box3, PerspectiveCamera, Vector3 } from 'three';
import type { FjordEntity } from './FjordProjection';
import { renderCharacterProfile } from '../ui/CharacterProfileContent';
/** Shared selection owns picking; this card only presents and follows the selected outdoor resident. */
export class FjordCharacterProfile {
    private card = document.createElement('section');
    private identity = '';
    private signature = '';
    private dismissed = false;
    private expanded = false;
    private escape = (event: KeyboardEvent) => { if (event.key === 'Escape')
        this.close(); };
    constructor(private camera: PerspectiveCamera, private canvas: HTMLCanvasElement) {
        this.card.id = 'character-profile';
        this.card.className = 'character-profile';
        this.card.hidden = true;
        this.card.setAttribute('aria-label', 'Selected character profile');
        for (const edge of ['top', 'right', 'bottom', 'left'])
            this.card.style.setProperty('--safe-' + edge, 'env(safe-area-inset-' + edge + ', 0px)');
        document.body.append(this.card);
        this.card.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (target.closest('.profile-toggle')) {
                this.expanded = !this.expanded;
                this.updateExpansion();
            }
            else if (target.closest('.profile-close'))
                this.close();
        });
        window.addEventListener('keydown', this.escape);
    }
    select(entity: FjordEntity | undefined) {
        const identity = entity?.kind === 'persona' ? entity.id : '';
        if (identity !== this.identity) {
            this.identity = identity;
            this.dismissed = false;
            this.expanded = false;
            this.signature = '';
        }
        if (!entity?.dna || entity.kind !== 'persona' || !entity.transform || this.dismissed) {
            this.card.hidden = true;
            return;
        }
        const signature = JSON.stringify([entity.label, entity.dna]);
        if (signature !== this.signature) {
            const details = document.createElement('div');
            details.id = 'fjord-profile-details';
            details.className = 'profile-details';
            renderCharacterProfile(details, entity.dna, entity.label, entity.id);
            const name = details.querySelector('h2')!;
            name.title = entity.label;
            const header = document.createElement('div');
            header.className = 'profile-header';
            const toggle = document.createElement('button');
            toggle.className = 'profile-toggle';
            toggle.setAttribute('aria-controls', details.id);
            header.append(name, toggle);
            this.card.replaceChildren(header, details);
            this.card.dataset.characterId = entity.id;
            this.updateExpansion();
            this.signature = signature;
        }
    }
    private updateExpansion() {
        this.card.classList.toggle('profile-expanded', this.expanded);
        const details = this.card.querySelector<HTMLElement>('.profile-details')!;
        const toggle = this.card.querySelector<HTMLButtonElement>('.profile-toggle')!;
        details.hidden = !this.expanded;
        toggle.textContent = this.expanded ? '▼' : '▲';
        toggle.setAttribute('aria-expanded', String(this.expanded));
        toggle.setAttribute('aria-label', this.expanded ? 'Collapse character profile' : 'Expand character profile');
    }
    update(bounds: Box3 | undefined) {
        if (!bounds || !this.identity || this.dismissed || !this.signature) {
            this.card.hidden = true;
            return;
        }
        const point = bounds.getCenter(new Vector3());
        point.y = bounds.max.y + .35;
        point.project(this.camera);
        if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) {
            this.card.hidden = true;
            return;
        }
        this.card.hidden = false;
        const rect = this.canvas.getBoundingClientRect(), x = rect.left + (point.x + 1) * rect.width / 2, y = rect.top + (1 - point.y) * rect.height / 2, width = this.card.offsetWidth, height = this.card.offsetHeight;
        const style = getComputedStyle(this.card), safe = (edge: string) => Math.max(8, parseFloat(style.getPropertyValue('--safe-' + edge)) || 0);
        this.card.style.maxHeight = Math.max(80, rect.height - 16) + 'px';
        this.card.style.left = Math.max(safe('left'), Math.min(innerWidth - width - safe('right'), x - width / 2)) + 'px';
        this.card.style.top = Math.max(rect.top + 8, safe('top'), Math.min(rect.bottom - height - 8, innerHeight - height - safe('bottom'), y - height)) + 'px';
    }
    reopen() { this.dismissed = false; }
    private close() { this.dismissed = true; this.card.hidden = true; }
    dispose() { window.removeEventListener('keydown', this.escape); this.card.remove(); }
}
