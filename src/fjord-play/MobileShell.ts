/** Phone landscape, portrait fallback, and compact touch tablets share the Horizon layout. */
export const mobileLayoutQuery = '(max-width: 600px), (max-width: 1100px) and (pointer: coarse)';
export const isMobileLayout = () => matchMedia(mobileLayoutQuery).matches;

/** Presentation only: moving controls or resizing never changes the campaign or its clock. */
export class MobileShell {
    private media = matchMedia(mobileLayoutQuery);
    private abort = new AbortController();
    private menu: HTMLButtonElement;
    private drawer: HTMLElement;

    constructor(private root: HTMLElement) {
        this.menu = root.querySelector('#fjord-mobile-menu')!;
        this.drawer = root.querySelector('#fjord-navigation-drawer')!;
        this.media.addEventListener('change', this.layout, { signal: this.abort.signal });
        window.visualViewport?.addEventListener('resize', this.viewport, { signal: this.abort.signal });
        this.menu.addEventListener('click', () => this.setOpen(!this.open), { signal: this.abort.signal });
        document.addEventListener('pointerdown', event => {
            if (event.target instanceof Node && !this.drawer.contains(event.target) &&
                !this.menu.contains(event.target)) this.setOpen(false);
        }, { signal: this.abort.signal });
        this.drawer.addEventListener('click', event => {
            if ((event.target as Element).closest('button')) this.setOpen(false);
        }, { signal: this.abort.signal });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.open) {
                this.setOpen(false);
                this.menu.focus();
                event.stopImmediatePropagation();
            }
        }, { capture: true, signal: this.abort.signal });
        this.layout();
    }
    private get open() { return this.menu.getAttribute('aria-expanded') === 'true'; }
    private setOpen(open: boolean) {
        this.menu.setAttribute('aria-expanded', String(open));
        this.drawer.classList.toggle('is-open', open);
    }
    private viewport = () => {
        const height = window.visualViewport?.height ?? window.innerHeight;
        this.root.style.setProperty('--fjord-viewport-height', `${height}px`);
    };
    private layout = () => {
        this.root.classList.toggle('fjord-mobile', this.media.matches);
        this.setOpen(false);
        this.viewport();
        document.dispatchEvent(new Event('fjord-layout-change'));
    };
    dispose() { this.abort.abort(); }
}
