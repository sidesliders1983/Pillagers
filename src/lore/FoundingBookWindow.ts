import type { BookChapter } from './ClanBook';

/** A read-only view of the already-composed opening, retained until the player closes it. */
export class FoundingBookWindow {
    readonly root = document.createElement('section');
    private closed = false;
    constructor(chapter: BookChapter) {
        this.root.id = 'loading-clan-book';
        this.root.setAttribute('role', 'region');
        this.root.setAttribute('aria-labelledby', 'loading-clan-book-title');
        const header = document.createElement('header');
        const title = document.createElement('h2');
        title.id = 'loading-clan-book-title';
        title.textContent = chapter.title;
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Close founding chapter');
        close.addEventListener('click', () => this.close());
        header.append(title, close);
        const text = document.createElement('article');
        text.id = 'loading-clan-book-text';
        text.tabIndex = 0;
        // Preserve the published text verbatim, including its paragraph separators.
        text.textContent = chapter.text;
        this.root.append(header, text);
        this.root.addEventListener('keydown', event => {
            if (event.key !== 'Tab') event.stopPropagation();
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            this.close();
        });
        for (const event of ['pointerdown', 'pointerup', 'wheel'])
            this.root.addEventListener(event, e => e.stopPropagation());
        document.addEventListener('click', this.openFullBook);
    }
    get scrollTop() { return this.root.querySelector<HTMLElement>('article')!.scrollTop; }
    restoreScroll(position: number) {
        this.root.querySelector<HTMLElement>('article')!.scrollTop = position;
    }
    private openFullBook = (event: MouseEvent) => {
        if ((event.target as Element).closest('#clan-book-open')) this.dispose();
    };
    private close() {
        const loading = this.root.closest<HTMLElement>('#island-loading');
        this.dispose();
        (loading ?? document.querySelector<HTMLElement>('#fjord-menu > summary'))?.focus();
    }
    /** Loading can finish without cutting off the reader or restarting its scroll position. */
    release() {
        if (this.closed) return;
        const text = this.root.querySelector<HTMLElement>('article')!;
        const scroll = text.scrollTop;
        const bounds = this.root.getBoundingClientRect();
        this.root.style.setProperty('--founding-book-width', bounds.width + 'px');
        this.root.style.setProperty('--founding-book-height', bounds.height + 'px');
        this.root.classList.add('founding-book-ready');
        document.body.append(this.root);
        text.scrollTop = scroll;
    }
    dispose() {
        this.closed = true;
        this.root.closest('#island-loading')?.classList.remove('island-has-book');
        this.root.remove();
        document.removeEventListener('click', this.openFullBook);
    }
}
