/** Entry and lifecycle intent only; canonical ticks remain owned by GameplaySession. */
export class CampaignPlayback {
    private epoch = 0;
    private ready = false;
    private played = false;

    constructor(private setRunning: (running: boolean) => void,
        private eligible: () => boolean) {
        this.reset();
    }

    get canPlay() { return this.ready && this.eligible(); }
    get canStep() { return this.played && this.canPlay; }

    /** New, restart, Continue and import all need a fresh deliberate Play. */
    reset() {
        this.ready = false;
        this.played = false;
        this.pause();
    }

    pause() {
        this.epoch++;
        this.setRunning(false);
    }

    play() {
        this.epoch++;
        if (!this.canPlay) return;
        this.played = true;
        this.setRunning(true);
    }

    loaded() { this.ready = true; }

    /** Only an intentional internal view handoff may carry prior playback intent. */
    pendingHandoff(resume: boolean) {
        const intent = this.epoch;
        return () => {
            if (resume && intent === this.epoch && this.canPlay) this.play();
        };
    }
}
