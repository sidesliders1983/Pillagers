import { bookLedger } from './BookLedger';
import { projectChronicle } from './Chronicle';
import type { SimulationState } from '../simulation/SimulationCore';

export type OpeningFacts = {
    complete: boolean;
    ledger?: ReturnType<typeof bookLedger>;
    period?: { from: { winter: number; tick: number }; through: { winter: number; tick: number } };
    demographics?: { eventId: string; type: string; time: { winter: number; tick: number }; details: Record<string, unknown>; personaId?: string }[];
    founders: { id: string; name: string; occupation: string | null; partnerId: string | null }[];
    households: SimulationState['households'][string][];
    cattle: NonNullable<SimulationState['landing']>['cattle'][string][];
    longships: NonNullable<SimulationState['landing']>['longships'][string][];
    stocks: { food: number; materials: number } | null;
};
export type BookChapter = {
    index: number;
    milestoneIndex: number;
    title: string;
    text: string;
    facts: OpeningFacts;
    sourceEventIds: string[];
    notified: boolean;
    read: boolean;
    templateVersion: number;
    templateId: string;
    checkpoint: { version: 1; time: { winter: number; tick: number }; eventEnd: number; identity: string };
};
export type BookData = {
    version: 1;
    id: string;
    narrativeSeed: number;
    generatorVersion: 1;
    styleVersion: 1;
    originWinter: number;
    chapters: BookChapter[];
    cursor: { eventEnd: number; stocks: { food: number; materials: number }; time: { winter: number; tick: number } };
    nextWinter: number;
};
export type BookSave = BookData & { canonicalIdentity: string };

/** Presentation identity only; this never draws from the Simulation RNG. */
export function historyIdentity(text: string): string {
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
        a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
        b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b);
    }
    return text.length + ':' + (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16);
}

function validTime(time: { winter: number; tick: number }, state: SimulationState): boolean {
    return !!time && Number.isSafeInteger(time.winter) && time.winter >= 0 &&
        Number.isSafeInteger(time.tick) && time.tick >= 0 && time.tick < state.ticksPerWinter &&
        time.winter * state.ticksPerWinter + time.tick <= state.time.winter * state.ticksPerWinter + state.time.tick;
}
function validFacts(facts: OpeningFacts): boolean {
    if (!facts || typeof facts.complete !== 'boolean' ||
        !Array.isArray(facts.founders) || !Array.isArray(facts.households) ||
        !Array.isArray(facts.cattle) || !Array.isArray(facts.longships)) return false;
    if (facts.founders.some(p => !p || typeof p.id !== 'string' || typeof p.name !== 'string')) return false;
    if (facts.households.some(h => !h || typeof (h as { id?: unknown }).id !== 'string' ||
        !Array.isArray((h as { memberIds?: unknown }).memberIds))) return false;
    if ([...facts.cattle, ...facts.longships].some(a => !a || typeof (a as { id?: unknown }).id !== 'string')) return false;
    if (facts.stocks !== null && (!facts.stocks ||
        ![facts.stocks.food, facts.stocks.materials].every(n => Number.isSafeInteger(n) && n >= 0))) return false;
    if (facts.ledger) {
        for (const resource of ['food', 'materials'] as const) {
            const row = facts.ledger[resource];
            if (!row || typeof row.complete !== 'boolean' ||
                Object.entries(row).some(([key, n]) => key !== 'complete' &&
                    !(key === 'unmetNeed' && n === null) && !Number.isSafeInteger(n))) return false;
        }
        if (!Array.isArray(facts.ledger.transactions) || facts.ledger.transactions.some(t =>
            !t || typeof t.eventId !== 'string' || !['food', 'materials'].includes(t.resource) ||
            !['production', 'otherReceipts', 'spending', 'losses'].includes(t.category) ||
            !Number.isSafeInteger(t.units) || t.units < 0)) return false;
    }
    return !facts.demographics || Array.isArray(facts.demographics) && facts.demographics.every(e =>
        e && typeof e.type === 'string' && typeof e.eventId === 'string' && e.time &&
        Number.isSafeInteger(e.time.winter) && Number.isSafeInteger(e.time.tick) &&
        !!e.details && typeof e.details === 'object' &&
        (e.details.people === undefined || Array.isArray(e.details.people) && e.details.people.every(p =>
            p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string')) &&
        (e.details.parentIds === undefined || Array.isArray(e.details.parentIds) &&
            e.details.parentIds.every(id => typeof id === 'string')));
}

export class ClanBook {
    private data: BookData;
    constructor(state: SimulationState, fresh = true) {
        const arrival = state.events.find(e => e.type === 'FoundingPartyLanded');
        const originWinter = arrival?.time.winter ?? state.events.find(e => e.type === 'ClanInitialized')?.time.winter ?? state.time.winter;
        const facts: OpeningFacts = fresh ? {
            complete: true,
            founders: Object.values(state.personas).map(p => ({
                id: p.id, name: p.name, occupation: p.occupation, partnerId: p.partnerId
            })),
            households: structuredClone(Object.values(state.households)),
            cattle: structuredClone(Object.values(state.landing?.cattle ?? {})),
            longships: structuredClone(Object.values(state.landing?.longships ?? {})),
            stocks: { ...state.stocks }
        } : {
            complete: false, founders: [], households: [], cattle: [], longships: [],
            stocks: arrival?.details?.stocks as OpeningFacts['stocks'] ?? null
        };
        const narrativeSeed = crypto.getRandomValues(new Uint32Array(1))[0];
        const names = facts.founders.map(p => p.name).join(', ');
        const recordedOpening = projectChronicle(state.events.filter(e => e.type.startsWith('Founding')))
            .reverse().flatMap(w => w.entries).map(e => e.text).join(' ');
        const openingLead = [
            'In Winter ' + state.time.winter + ', the founding party arrived: ',
            'The founding record of Winter ' + state.time.winter + ' named the arrivals: ',
            'The party that arrived in Winter ' + state.time.winter + ' included '
        ][narrativeSeed % 3];
        const text = fresh ?
            openingLead + names + '.\n\n' +
            facts.founders.map(p => p.name + ' was a ' + (p.occupation ?? 'resident without an assigned occupation') + '.').join(' ') +
            '\n\nThe party began with ' + facts.stocks!.food + ' Food, ' + facts.stocks!.materials +
            ' Materials, ' + facts.cattle.length + ' cattle and ' + facts.longships.length + ' longship(s).' :
            'This book begins from an imported campaign. The complete founding identities and households were not frozen in this save. Only recorded historical facts can be used; founding coverage is incomplete.\n\n' + recordedOpening;
        this.data = {
            version: 1, id: Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('-'), narrativeSeed,
            generatorVersion: 1, styleVersion: 1,
            originWinter,
            cursor: { eventEnd: state.events.length, stocks: { ...state.stocks }, time: { ...state.time } },
            nextWinter: originWinter + (Math.floor((state.time.winter - originWinter) / 5) + 1) * 5,
            chapters: [{ index: 0, milestoneIndex: 0, title: 'The founding', text, facts,
                sourceEventIds: state.events.filter(e => e.type.startsWith('Founding')).map(e => e.id),
                notified: !fresh, read: false, templateVersion: 1, templateId: 'clan-book.opening.v1',
                checkpoint: { version: 1, time: { ...state.time }, eventEnd: state.events.length,
                    identity: historyIdentity(JSON.stringify(state)) } }]
        };
    }
    get nextWinter(): number { return this.data.nextWinter; }
    fork(state: SimulationState): ClanBook {
        const next = new ClanBook(state, false);
        next.data = this.snapshot();
        return next;
    }
    closeCheckpoint(state: SimulationState): void {
        if (state.time.winter !== this.data.nextWinter || state.time.tick !== 0)
            throw new Error('Clan Book requires a closed five-Winter checkpoint.');
        const cursor = this.data.cursor;
        const events = state.events.slice(cursor.eventEnd);
        const ledger = bookLedger(events, cursor.stocks, state.stocks);
        const completeAccounting = ledger.food.complete && ledger.materials.complete;
        const text = 'The records closed at Winter ' + state.time.winter + '.\n\n' +
            projectChronicle(events).reverse().flatMap(w => w.entries).filter(e => !e.routine)
                .slice(0, 10).map(e => e.text).join(' ') + '\n\n' +
            (completeAccounting ? 'Residents produced ' + ledger.food.residentProduction + ' Food and the herd produced ' +
            ledger.food.cattleProduction + ' Food. ' + ledger.food.spending +
            ' Food was consumed or spent; ' + ledger.food.unmetNeed + ' Food of need went unmet. ' +
            ledger.materials.production + ' Materials were produced and ' + ledger.materials.spending +
            ' Materials were spent. The remaining stocks were ' + state.stocks.food +
            ' Food and ' + state.stocks.materials + ' Materials.' :
            'Resource accounting for this observed interval is incomplete. The factual overview shows known recorded quantities; missing quantities are not assumed to be zero.');
        this.data.chapters.push({
            index: this.data.chapters.length,
            milestoneIndex: (state.time.winter - this.data.originWinter) / 5,
            title: 'Records ending Winter ' + state.time.winter,
            text, templateVersion: 1, templateId: 'clan-book.checkpoint.v1', notified: false, read: false,
            sourceEventIds: events.map(e => e.id),
            checkpoint: { version: 1, time: { ...state.time }, eventEnd: state.events.length,
                identity: historyIdentity(JSON.stringify(state)) },
            facts: { complete: cursor.time.tick === 0 &&
                cursor.time.winter === this.data.nextWinter - 5 && ledger.food.complete && ledger.materials.complete,
                period: { from: { ...cursor.time }, through: { ...state.time } },
                founders: [], households: [], cattle: [], longships: [], stocks: { ...state.stocks }, ledger,
                demographics: events.filter(e => ['ChildBorn', 'PersonaDied', 'CattleBorn', 'CattleDied', 'CattleSlaughtered'].includes(e.type))
                    .map(e => ({ eventId: e.id, type: e.type, time: { ...e.time }, details: structuredClone(e.details ?? {}),
                        ...(e.personaId ? { personaId: e.personaId } : {}) })) }
        });
        this.data.cursor = { eventEnd: state.events.length, stocks: { ...state.stocks }, time: { ...state.time } };
        this.data.nextWinter += 5;
    }
    notifyPending(): void {
        for (const chapter of this.data.chapters) chapter.notified = true;
    }
    markRead(index: number): void {
        if (!this.data.chapters[index]) throw new Error('Unknown Clan Book chapter.');
        this.data.chapters[index].read = true;
    }
    snapshot(): BookData { return structuredClone(this.data); }
    save(state: SimulationState): BookSave {
        return { ...this.snapshot(), canonicalIdentity: historyIdentity(JSON.stringify(state)) };
    }
    restore(saved: BookSave, state: SimulationState): void {
        const eventIds = new Set(state.events.map(e => e.id));
        if (saved.version !== 1 || saved.generatorVersion !== 1 || saved.styleVersion !== 1 || saved.canonicalIdentity !== historyIdentity(JSON.stringify(state)) ||
            typeof saved.id !== 'string' || !Number.isSafeInteger(saved.narrativeSeed) ||
            !Number.isSafeInteger(saved.originWinter) || saved.originWinter > state.time.winter || !Number.isSafeInteger(saved.nextWinter) ||
            saved.nextWinter <= state.time.winter || !saved.cursor ||
            !Number.isSafeInteger(saved.cursor.eventEnd) || saved.cursor.eventEnd < 0 ||
            saved.cursor.eventEnd > state.events.length ||
            !Number.isSafeInteger(saved.cursor.stocks?.food) || saved.cursor.stocks.food < 0 ||
            !Number.isSafeInteger(saved.cursor.stocks?.materials) || saved.cursor.stocks.materials < 0 ||
            !validTime(saved.cursor.time, state) ||
            !Array.isArray(saved.chapters) || !saved.chapters.length ||
            saved.chapters.some((c, i) => c.index !== i || typeof c.text !== 'string' || typeof c.title !== 'string' || !validFacts(c.facts) ||
                c.checkpoint?.version !== 1 || typeof c.checkpoint.identity !== 'string' ||
                !Number.isSafeInteger(c.checkpoint.eventEnd) || c.checkpoint.eventEnd < 0 ||
                c.checkpoint.eventEnd > state.events.length || !validTime(c.checkpoint.time, state) || !Array.isArray(c.sourceEventIds) ||
                c.sourceEventIds.some(id => !eventIds.has(id)) ||
                typeof c.notified !== 'boolean' || typeof c.read !== 'boolean'))
            throw new Error('Clan Book does not match this campaign history.');
        const { canonicalIdentity: _identity, ...data } = saved;
        this.data = structuredClone(data);
    }
}
