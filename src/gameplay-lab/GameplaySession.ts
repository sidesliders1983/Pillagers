import { birthdayCalendarMode } from '../simulation/BirthdayCalendar';
import { freezeReadView } from './ReadView';
import { FamilyTreeIndex } from '../lore/FamilyTree';
import { PersonalHistoryIndex } from '../lore/PersonalHistory';
import { ClanBook } from '../lore/ClanBook';
import { createCampaign, applyCommand, serializeState, reconstructState } from '../simulation/SimulationCore';
import type { BirthdayCalendarMode, FoundingPhase, SimulationCommand, SimulationState } from '../simulation/SimulationCore';
/** Browser pacing is transient; only explicit commands change canonical state. */
export class GameplaySession {
    private state: SimulationState;
    private canonicalRevision = 0;
    private readState?: Readonly<SimulationState>;
    private serializedState?: string;
    get revision(): number { return this.canonicalRevision; }
    /** One deeply frozen, isolated UI copy per committed revision. snapshot() still returns owned copies. */
    readSnapshot(): Readonly<SimulationState> {
        return this.readState ??= freezeReadView(this.snapshot());
    }
    private invalidateRead(): void {
        this.canonicalRevision++;
        this.readState = undefined;
        this.serializedState = undefined;
    }
    private familyIndex = new FamilyTreeIndex();
    familyTree() {
        return this.familyIndex.read(this.state);
    }
    private personalIndex = new PersonalHistoryIndex();
    private personalBookKey = '';
    private historyGeneration = 0;
    get personalHistoryEpoch(): number {
        return this.historyGeneration;
    }
    personalHistory(personaId: string, limit = 10, offset = 0) {
        if (!this.state.personas[personaId] && !this.state.personaArchive?.[personaId])
            return {personaId, records:[], totalRecords:0, partialAttribution:false};
        this.personalIndex.append(this.state.events);
        if (this.personalBookKey !== this.book.publicationKey) {
            this.personalIndex.publish(this.book.snapshot().chapters);
            this.personalBookKey = this.book.publicationKey;
        }
        return this.personalIndex.read(personaId, limit, offset);
    }
    personalHistoryReference(personaId: string, eventId: string,
        chapterIndex: number, paragraphIndex: number | null): boolean {
        this.personalHistory(personaId);
        return this.personalIndex.hasReference(personaId, eventId, chapterIndex, paragraphIndex);
    }
    book: ClanBook;
    private fractionalTicks = 0;
    trend = { food: 0, materials: 0 };
    running = false;
    minutesPerWinter = 3;
    constructor(seed = 32, narrativeSeed?: number, socialEnabled = true, foundingPhase?: FoundingPhase, calendarMode?: BirthdayCalendarMode) {
        this.state = createCampaign(seed, {}, {}, {}, {}, {enabled: socialEnabled}, {}, foundingPhase, calendarMode);
        this.book = new ClanBook(this.state, true, narrativeSeed);
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
        this.invalidateRead();
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
        return this.serializedState ??= serializeState(this.state);
    }
    loadJSON(serialized: string): void {
        const state = reconstructState(serialized);
        if (!state.mechanics)
            throw new Error('This save has no gameplay mechanics');
        this.replace(state, false);
    }
    newCampaign(seed: number, weatherEnabled = true, socialEnabled = true, foundingPhase = this.state.foundingPhase, calendarMode: BirthdayCalendarMode | undefined = birthdayCalendarMode(this.state)): void {
        this.replace(createCampaign(seed, {}, {}, { enabled: weatherEnabled }, {}, { enabled: socialEnabled }, {}, foundingPhase, calendarMode));
    }
    restartCampaign(sameFounders = false, drawSeed: () => number = () => crypto.getRandomValues(new Uint32Array(1))[0], weatherEnabled = this.state.weather?.config.enabled ?? false, socialEnabled = this.state.social?.config.enabled ?? false, foundingPhase = this.state.foundingPhase): void {
        let seed = sameFounders ? this.state.seed : drawSeed();
        if (!sameFounders && seed === this.state.seed)
            seed = (seed + 1) >>> 0;
        const targetLandingConfigs = Object.fromEntries(Object.entries(this.state.world?.targetClans ?? {})
            .filter(([, target]) => target.landing)
            .map(([id, target]) => [id, target.landing!.config]));
        this.replace(createCampaign(seed, this.state.landing?.config, this.state.mechanics?.config, { ...this.state.weather?.config, enabled: weatherEnabled }, this.state.world?.config, { ...this.state.social?.config, enabled: socialEnabled }, targetLandingConfigs, foundingPhase, birthdayCalendarMode(this.state)));
    }
    private replace(state: SimulationState, fresh = true): void {
        this.familyIndex = new FamilyTreeIndex();
        this.personalIndex = new PersonalHistoryIndex();
        this.personalBookKey = '';
        this.historyGeneration++;
        this.state = state;
        this.invalidateRead();
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
