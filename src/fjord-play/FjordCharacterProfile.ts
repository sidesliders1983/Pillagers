import { Box3, PerspectiveCamera, Vector3 } from 'three';
import type { FjordEntity } from './FjordProjection';
import { renderCharacterProfile } from '../ui/CharacterProfileContent';
/** Shared selection owns picking; this card only presents and follows the selected outdoor resident. */
export class FjordCharacterProfile {
    private card = document.createElement('section');
    private identity = '';
    private signature = '';
    private dismissed = false;
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
        this.card.addEventListener('click', event => { if ((event.target as HTMLElement).closest('.profile-close'))
            this.close(); });
        window.addEventListener('keydown', this.escape);
    }
    select(entity: FjordEntity | undefined) {
        const identity = entity?.kind === 'persona' ? entity.id : '';
        if (identity !== this.identity) {
            this.identity = identity;
            this.dismissed = false;
            this.signature = '';
        }
        if (!entity?.dna || entity.kind !== 'persona' || !entity.transform || this.dismissed) {
            this.card.hidden = true;
            return;
        }
        const signature = JSON.stringify([entity.label, entity.dna]);
        if (signature !== this.signature) {
            renderCharacterProfile(this.card, entity.dna, entity.label, entity.id);
            this.signature = signature;
        }
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
