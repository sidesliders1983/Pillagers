import { ClanBook } from '../lore/ClanBook';
import { createCampaign, applyCommand, serializeState, reconstructState } from '../simulation/SimulationCore';
import type { SimulationCommand, SimulationState } from '../simulation/SimulationCore';
/** Browser pacing is transient; only explicit commands change canonical state. */
export class GameplaySession {
    private state: SimulationState;
    book: ClanBook;
    private fractionalTicks = 0;
    trend = { food: 0, materials: 0 };
    running = false;
    minutesPerWinter = 3;
    constructor(seed = 32) {
        this.state = createCampaign(seed);
        this.book = new ClanBook(this.state);
    }
    snapshot(): SimulationState {
        return structuredClone(this.state);
    }
    setRunning(running: boolean): void {
        this.running = running;
    }
    setMinutesPerWinter(minutes: number): void {
        if (![1, 3, 5].includes(minutes))
            throw new Error('Choose 1, 3 or 5 minutes per Winter');
        this.minutesPerWinter = minutes;
    }
    command(command: SimulationCommand): void {
        let next: SimulationState;
        let book = this.book;
        const ticks = command.type === 'AdvanceWinter' ? this.state.ticksPerWinter :
            command.type === 'AdvanceTicks' ? command.ticks : 0;
        const untilChapter = (book.nextWinter - this.state.time.winter) * this.state.ticksPerWinter - this.state.time.tick;
        if (Number.isSafeInteger(ticks) && Number.isSafeInteger(this.state.time.tick + ticks) &&
            Number.isSafeInteger(this.state.time.winter + Math.floor((this.state.time.tick + ticks) / this.state.ticksPerWinter)) &&
            ticks >= untilChapter && untilChapter > 0) {
            next = this.state;
            book = this.book.fork(this.state);
            let remaining = ticks;
            while (remaining > 0) {
                const until = (book.nextWinter - next.time.winter) * next.ticksPerWinter - next.time.tick;
                const step = Math.min(remaining, until);
                next = applyCommand(next, { type: 'AdvanceTicks', ticks: step });
                remaining -= step;
                if (step === until) book.closeCheckpoint(next);
            }
        } else next = applyCommand(this.state, command);
        this.trend = { food: next.stocks.food - this.state.stocks.food, materials: next.stocks.materials - this.state.stocks.materials };
        this.state = next;
        this.book = book;
    }
    pacing() {
        return { running: this.running, minutesPerWinter: this.minutesPerWinter,
            fractionalTicks: this.fractionalTicks };
    }
    restorePacing(pace: ReturnType<GameplaySession['pacing']>) {
        if (typeof pace.running !== 'boolean' || ![1, 3, 5].includes(pace.minutesPerWinter) ||
            !Number.isFinite(pace.fractionalTicks) || pace.fractionalTicks < 0 || pace.fractionalTicks >= 1)
            throw new Error('Invalid campaign pacing.');
        this.minutesPerWinter = pace.minutesPerWinter;
        this.fractionalTicks = pace.fractionalTicks;
        this.running = pace.running;
    }
    saveJSON(): string {
        return serializeState(this.state);
    }
    loadJSON(serialized: string): void {
        const state = reconstructState(serialized);
        if (!state.mechanics)
            throw new Error('This save has no gameplay mechanics');
        this.replace(state, false);
    }
    newCampaign(seed: number, weatherEnabled = true): void {
        this.replace(createCampaign(seed, {}, {}, { enabled: weatherEnabled }));
    }
    restartCampaign(sameFounders = false, drawSeed: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0], weatherEnabled = this.state.weather?.config.enabled ?? false): void {
        let seed = sameFounders ? this.state.seed : drawSeed();
        if (!sameFounders && seed === this.state.seed)
            seed = (seed + 1) >>> 0;
        this.replace(createCampaign(seed, this.state.landing?.config, this.state.mechanics?.config, { ...this.state.weather?.config, enabled: weatherEnabled }, this.state.world?.config));
    }
    private replace(state: SimulationState, fresh = true): void {
        this.state = state;
        this.book = new ClanBook(state, fresh);
        this.running = false;
        this.fractionalTicks = 0;
        this.trend = { food: 0, materials: 0 };
    }
    elapse(milliseconds: number): void {
        if (!Number.isFinite(milliseconds) || milliseconds < 0)
            throw new Error('Invalid active elapsed time');
        if (!this.running)
            return;
        const ticks = this.fractionalTicks + milliseconds * this.state.ticksPerWinter / (this.minutesPerWinter * 60000);
        const whole = Math.floor(ticks + 1e-9);
        if (whole)
            this.command({ type: 'AdvanceTicks', ticks: whole });
        this.fractionalTicks = Math.max(0, ticks - whole);
    }
}
