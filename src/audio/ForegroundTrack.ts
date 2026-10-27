export interface ForegroundAsset { path: string; seconds: number; }
export interface ForegroundHost {
    createMedia(): HTMLAudioElement;
    allowed(): boolean;
    connect(media: HTMLAudioElement): { gain(value: number): void; dispose(): void };
    duck(active: boolean): void;
    resolve?(path: string): string;
}

/** One bounded native media stream, routed by the existing application audio owner. */
export class ForegroundTrack {
    private media?: HTMLAudioElement;
    private route?: ReturnType<ForegroundHost['connect']>;
    private ended = false;
    private disposed = false;
    private wanted = false;
    private blocked = false;
    private failed = false;
    private pending?: Promise<boolean>;
    private elapsed = 0;
    private running = false;
    private envelope = 1;
    constructor(private readonly asset: ForegroundAsset, private readonly host: ForegroundHost) {
        if (!/^game-assets\/wedding\/[a-z0-9-]+\.mp3$/.test(asset.path) ||
            !Number.isFinite(asset.seconds) || asset.seconds <= 0 || asset.seconds > 180)
            throw new Error('Invalid prepared wedding music.');
    }
    get duration() {
        const duration = this.media?.duration;
        return duration && Number.isFinite(duration) && duration > 0 && duration <= 180 ? duration : this.asset.seconds;
    }
    inspect() {
        return { state: this.disposed ? 'released' : this.failed ? 'unavailable' : this.blocked ? 'blocked' :
            this.pending ? 'loading' : this.ended ? 'ended' : this.media && !this.media.paused ? 'playing' : 'paused',
            seconds: this.media?.currentTime ?? this.elapsed, duration: this.duration };
    }
    update(elapsed: number, running: boolean, envelope = 1) {
        if (this.disposed) return;
        this.elapsed = Number.isFinite(elapsed) ? Math.max(0, Math.min(this.duration, elapsed)) : 0;
        this.running = running;
        this.envelope = Math.max(0, Math.min(1, envelope));
        if (!running || !this.host.allowed()) {
            this.media?.pause();
            this.host.duck(false);
        } else if (this.wanted && !this.blocked && !this.failed && !this.ended && !this.pending && (!this.media || this.media.paused)) {
            void this.requestPlay();
        }
        this.route?.gain(this.envelope);
    }
    play(): Promise<boolean> {
        if (this.disposed) return Promise.resolve(false);
        this.wanted = true;
        this.blocked = false;
        this.failed = false;
        return this.requestPlay();
    }
    private openMedia(): HTMLAudioElement {
        if (!this.media) {
            this.media = this.host.createMedia();
            this.media.preload = 'metadata';
            this.media.src = this.host.resolve?.(this.asset.path) ?? this.asset.path;
            this.media.onended = () => { this.ended = true; this.host.duck(false); };
            this.media.onerror = () => { this.failed = true; this.host.duck(false); };
            this.route = this.host.connect(this.media);
        }
        return this.media;
    }
    /** Unlock the selected native element inside the paid wedding's user gesture.
     * Gain stays zero; actual music and ducking wait for the arrived cast. */
    prime(): Promise<boolean> {
        if (this.disposed || !this.host.allowed()) return Promise.resolve(false);
        if (this.pending) return this.pending;
        try {
            const media = this.openMedia();
            this.route!.gain(0);
            const operation = media.play().then(() => {
                media.pause();
                try { media.currentTime = 0; } catch { /* Metadata can arrive later. */ }
                return !this.disposed;
            }).catch(() => false).finally(() => {
                if (this.pending === operation) this.pending = undefined;
            });
            this.pending = operation;
            return operation;
        } catch { return Promise.resolve(false); }
    }
    private requestPlay(): Promise<boolean> {
        if (this.pending) return this.pending;
        if (!this.running || !this.host.allowed() || this.disposed) return Promise.resolve(false);
        try {
            const media = this.openMedia();
            try { media.currentTime = this.elapsed; } catch { /* Metadata may still be arriving. */ }
            this.route!.gain(this.envelope);
            const operation = media.play().then(() => {
                if (this.disposed || !this.running || !this.host.allowed()) {
                    media.pause();
                    return false;
                }
                // A first native seek can be deferred until loadedmetadata on Safari.
                if (Math.abs(media.currentTime - this.elapsed) > .75)
                    try { media.currentTime = this.elapsed; } catch { /* Native stream remains optional. */ }
                this.host.duck(true);
                return true;
            }).catch(() => {
                this.blocked = true;
                this.host.duck(false);
                return false;
            }).finally(() => { if (this.pending === operation) this.pending = undefined; });
            this.pending = operation;
            return operation;
        } catch {
            this.failed = true;
            this.host.duck(false);
            return Promise.resolve(false);
        }
    }
    refreshVolume() { this.route?.gain(this.envelope); }
    suspend() { this.media?.pause(); this.host.duck(false); }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.media) {
            this.media.pause();
            this.media.onended = this.media.onerror = null;
            this.media.removeAttribute('src');
            this.media.load();
        }
        this.route?.dispose();
        this.route = undefined;
        this.host.duck(false);
    }
}
