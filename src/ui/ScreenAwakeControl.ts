import NoSleep from 'nosleep.js';
import './screen-awake.css';

/** An opt-in browser resource, independent of the campaign clock and saved game. */
export class ScreenAwakeControl {
    private wanted = false;
    private active = false;
    private pending = false;
    private disposed = false;
    private revision = 0;
    private lock: WakeLockSentinel | null = null;
    private compatibility: NoSleep | null = null;
    private status = '';

    constructor(private root: HTMLElement) {
        root.addEventListener('click', this.click);
        document.addEventListener('visibilitychange', this.visibility);
        window.addEventListener('pagehide', this.pagehide);
        window.addEventListener('pageshow', this.pageshow);
    }

    html(): string {
        const engaged = this.wanted && (this.active || this.pending);
        return `<span id="screen-awake-control" class="screen-awake-control">
            <button type="button" data-screen-awake aria-pressed="${this.active}"
                aria-describedby="screen-awake-status">${engaged ? 'Allow screen sleep' : 'Keep screen awake'}</button>
            <small id="screen-awake-status" role="status">${this.status}</small>
        </span>`;
    }

    private click = (event: Event): void => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-screen-awake]'))
            return;
        if (this.wanted && (this.active || this.pending)) {
            this.wanted = false;
            this.suspend('');
        } else {
            this.wanted = true;
            // Start directly inside the user gesture: the LAN media fallback requires it.
            void this.acquire();
        }
    };

    private visibility = (): void => {
        if (document.hidden) {
            this.suspend(this.wanted ? 'Screen lock paused.' : '');
        } else if (this.wanted) {
            void this.acquire();
        }
    };

    private async acquire(): Promise<void> {
        if (this.disposed || document.hidden || this.pending || this.active || !this.wanted)
            return;
        const revision = this.revision;
        this.pending = true;
        this.status = 'Requesting screen lock…';
        this.paint();
        try {
            if ('wakeLock' in navigator) {
                const lock = await navigator.wakeLock.request('screen');
                if (!this.isCurrent(revision)) {
                    await lock.release();
                    return;
                }
                this.lock = lock;
                lock.addEventListener('release', () => {
                    if (this.lock !== lock)
                        return;
                    this.lock = null;
                    this.active = false;
                    this.status = 'Screen lock ended. Tap to retry.';
                    this.paint();
                });
            } else {
                // NoSleep supplies the embedded media fallback; native lifecycle is owned here.
                this.compatibility ??= new NoSleep();
                await this.compatibility.enable();
                if (!this.isCurrent(revision)) {
                    this.compatibility.disable();
                    return;
                }
            }
            this.active = true;
            this.status = 'Screen awake';
        } catch {
            if (this.isCurrent(revision)) {
                this.active = false;
                this.status = 'Screen lock unavailable. Tap to retry.';
            }
        } finally {
            this.pending = false;
            this.paint();
            // A hidden/visible transition during an outstanding request needs a fresh lock.
            if (revision !== this.revision && this.wanted && !document.hidden && !this.disposed)
                void this.acquire();
        }
    }

    private isCurrent(revision: number): boolean {
        return revision === this.revision && this.wanted && !document.hidden && !this.disposed;
    }

    private suspend(status: string): void {
        this.revision++;
        const lock = this.lock;
        this.lock = null;
        if (lock)
            void lock.release().catch(() => {});
        this.compatibility?.disable();
        this.active = false;
        this.status = status;
        this.paint();
    }

    private paint(): void {
        const button = this.root.querySelector<HTMLButtonElement>('[data-screen-awake]');
        const status = this.root.querySelector('#screen-awake-status');
        if (button) {
            button.textContent = this.wanted && (this.active || this.pending) ?
                'Allow screen sleep' : 'Keep screen awake';
            button.setAttribute('aria-pressed', String(this.active));
        }
        if (status)
            status.textContent = this.status;
    }

    private pagehide = (event: PageTransitionEvent): void => {
        if (event.persisted)
            this.suspend(this.wanted ? 'Screen lock paused.' : '');
        else
            this.dispose();
    };

    private pageshow = (): void => {
        if (this.wanted)
            void this.acquire();
    };

    dispose = (): void => {
        this.disposed = true;
        this.wanted = false;
        this.suspend('');
        this.root.removeEventListener('click', this.click);
        document.removeEventListener('visibilitychange', this.visibility);
        window.removeEventListener('pagehide', this.pagehide);
        window.removeEventListener('pageshow', this.pageshow);
    };
}
