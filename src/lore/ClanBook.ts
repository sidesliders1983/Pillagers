import { housingName } from '../simulation/HousingNames';
import { bookLedger } from './BookLedger';
import { projectChronicle } from './Chronicle';
import { planNarrative } from './NarrativePlan';
import type { NarrativePlan } from './NarrativePlan';
import { composeChapter, composeOpening } from './NarrativeComposer';
import type { NarrativeParagraph } from './NarrativeComposer';
import { narrativeMemory } from './NarrativeMemory';
import type { NarrativeMemory } from './NarrativeMemory';
import type { SimulationState } from '../simulation/SimulationCore';

export type OpeningFacts = {
    complete: boolean;
    livestock?: {
        youngAdultAge: number;
        adultAge: number;
        animals: { id: string; sex: 'female' | 'male'; birthWinter: number }[];
    };
    recordedReceipts?: { eventId: string; winter: number; resource: 'materials'; units: number }[];
    residences?: { id: string; kind: 'house' | 'tent' }[];
    ledger?: ReturnType<typeof bookLedger>;
    period?: { from: { winter: number; tick: number }; through: { winter: number; tick: number } };
    demographics?: { eventId: string; type: string; time: { winter: number; tick: number }; details: Record<string, unknown>; personaId?: string }[];
    founders: { id: string; name: string; occupation: string | null; partnerId: string | null }[];
    households: (SimulationState['households'][string] & { displayName?: string; residenceName?: string })[];
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
    plan?: NarrativePlan;
    paragraphs?: NarrativeParagraph[];
    composition?: { rejectedDuplicateBodies: number; usedFallback: boolean };
    checkpoint: { version: 1; time: { winter: number; tick: number }; eventEnd: number; identity: string };
};
export type BookData = {
    version: 1;
    id: string;
    narrativeSeed: number;
    memory?: NarrativeMemory;
    generatorVersion: 1 | 2;
    styleVersion: 1 | 2;
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
function livestockFacts(state: SimulationState): OpeningFacts['livestock'] {
    if (!state.landing) return undefined;
    return {
        youngAdultAge: state.landing.config.cattleYoungAdultAge,
        adultAge: state.landing.config.cattleAdultAge,
        animals: Object.values({ ...state.landing.cattleArchive, ...state.landing.cattle })
            .map(animal => ({ id: animal.id, sex: animal.sex, birthWinter: animal.birthWinter }))
    };
}
function validFacts(facts: OpeningFacts): boolean {
    if (!facts || typeof facts.complete !== 'boolean' ||
        !Array.isArray(facts.founders) || !Array.isArray(facts.households) ||
        !Array.isArray(facts.cattle) || !Array.isArray(facts.longships)) return false;
    if (facts.livestock && (!Number.isSafeInteger(facts.livestock.youngAdultAge) ||
        facts.livestock.youngAdultAge < 0 || !Number.isSafeInteger(facts.livestock.adultAge) ||
        facts.livestock.adultAge < facts.livestock.youngAdultAge || !Array.isArray(facts.livestock.animals) ||
        facts.livestock.animals.some(animal => !animal || typeof animal.id !== 'string' ||
            !['female', 'male'].includes(animal.sex) || !Number.isSafeInteger(animal.birthWinter)))) return false;
    if (facts.recordedReceipts && (!Array.isArray(facts.recordedReceipts) ||
        facts.recordedReceipts.some(receipt => !receipt || typeof receipt.eventId !== 'string' ||
            !Number.isSafeInteger(receipt.winter) || receipt.resource !== 'materials' ||
            !Number.isSafeInteger(receipt.units) || receipt.units < 0))) return false;
    if (facts.residences !== undefined && (!Array.isArray(facts.residences) || facts.residences.some(residence =>
        !residence || typeof residence.id !== 'string' || !['house', 'tent'].includes(residence.kind)))) return false;
    if (facts.founders.some(p => !p || typeof p.id !== 'string' || typeof p.name !== 'string')) return false;
    if (facts.households.some(h => !h || typeof (h as { id?: unknown }).id !== 'string' ||
        !Array.isArray((h as { memberIds?: unknown }).memberIds) ||
        h.displayName !== undefined && typeof h.displayName !== 'string' ||
        h.residenceName !== undefined && typeof h.residenceName !== 'string')) return false;
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
    constructor(state: SimulationState, fresh = true, suppliedSeed?: number) {
        const arrival = state.events.find(e => e.type === 'FoundingPartyLanded');
        const originWinter = arrival?.time.winter ?? state.events.find(e => e.type === 'ClanInitialized')?.time.winter ?? state.time.winter;
        const facts: OpeningFacts = fresh ? {
            complete: true, livestock: livestockFacts(state),
            residences: structuredClone(Object.values(state.residences)),
            founders: Object.values(state.personas).map(p => ({
                id: p.id, name: p.name, occupation: p.occupation, partnerId: p.partnerId
            })),
            households: Object.values(state.households).map(home => ({
                ...structuredClone(home),
                displayName: housingName(state, 'household', home.id),
                ...(home.residenceId ? { residenceName: housingName(state, 'residence', home.residenceId) } : {})
            })),
            cattle: structuredClone(Object.values(state.landing?.cattle ?? {})),
            longships: structuredClone(Object.values(state.landing?.longships ?? {})),
            stocks: { ...state.stocks }
        } : {
            complete: false, founders: [], households: [], cattle: [], longships: [],
            recordedReceipts: state.events.filter(event => event.type === 'FoundingLongshipSalvaged' &&
                Number.isSafeInteger(event.details?.materials)).map(event => ({
                    eventId: event.id, winter: event.time.winter, resource: 'materials',
                    units: Number(event.details!.materials)
                })),
            stocks: arrival?.details?.stocks as OpeningFacts['stocks'] ?? null
        };
        const narrativeSeed = suppliedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];
        if (!Number.isInteger(narrativeSeed) || narrativeSeed < 0 || narrativeSeed > 0xffffffff)
            throw new Error('Narrative seed must be uint32.');
        const openingSources = state.events.filter(event => event.type.startsWith('Founding')).map(event => event.id);
        const paragraphs = fresh ? composeOpening(facts, state.time.winter, narrativeSeed, openingSources) : undefined;
        const text = paragraphs ? paragraphs.map(paragraph => paragraph.text).join('\n\n') :
            'This book began from an imported campaign. Its founding details were incomplete.\n\n' +
            projectChronicle(state.events.filter(event => event.type.startsWith('Founding')))
                .reverse().flatMap(group => group.entries).map(entry => entry.text.replace(/ for \d+ (Food|Materials)/g, '')).join(' ');
        this.data = {
            version: 1, id: Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('-'), narrativeSeed,
            generatorVersion: 2, styleVersion: 2,
            originWinter,
            cursor: { eventEnd: state.events.length, stocks: { ...state.stocks }, time: { ...state.time } },
            nextWinter: originWinter + (Math.floor((state.time.winter - originWinter) / 5) + 1) * 5,
            chapters: [{ index: 0, milestoneIndex: 0, title: 'The founding', text, facts,
                sourceEventIds: state.events.filter(e => e.type.startsWith('Founding')).map(e => e.id),
                notified: !fresh, read: false, templateVersion: fresh ? 2 : 1,
                templateId: fresh ? 'clan-book.opening.v2' : 'clan-book.partial-opening.v1',
                ...(paragraphs ? { paragraphs } : {}),
                checkpoint: { version: 1, time: { ...state.time }, eventEnd: state.events.length,
                    identity: historyIdentity(JSON.stringify(state)) } }]
        };
        this.data.memory = narrativeMemory(this.data.chapters, state.events);
    }
    get nextWinter(): number { return this.data.nextWinter; }
    fork(state: SimulationState): ClanBook {
        const next = new ClanBook(state, false, this.data.narrativeSeed);
        next.data = this.snapshot();
        return next;
    }
    closeCheckpoint(state: SimulationState): void {
        if (state.time.winter !== this.data.nextWinter || state.time.tick !== 0)
            throw new Error('Clan Book requires a closed five-Winter checkpoint.');
        this.data.generatorVersion = 2;
        this.data.styleVersion = 2;
        const cursor = this.data.cursor;
        const events = state.events.slice(cursor.eventEnd);
        const ledger = bookLedger(events, cursor.stocks, state.stocks);
        this.data.chapters.push({
            plan: planNarrative(state.events, cursor.eventEnd),
            index: this.data.chapters.length,
            milestoneIndex: (state.time.winter - this.data.originWinter) / 5,
            title: 'Records ending Winter ' + state.time.winter,
            text: '', templateVersion: 2, templateId: 'clan-book.checkpoint.v2', notified: false, read: false,
            sourceEventIds: events.map(e => e.id),
            checkpoint: { version: 1, time: { ...state.time }, eventEnd: state.events.length,
                identity: historyIdentity(JSON.stringify(state)) },
            facts: { complete: cursor.time.tick === 0 &&
                cursor.time.winter === this.data.nextWinter - 5 && ledger.food.complete && ledger.materials.complete,
                period: { from: { ...cursor.time }, through: { ...state.time } },
                livestock: livestockFacts(state),
                founders: [], households: [], cattle: [], longships: [], stocks: { ...state.stocks }, ledger,
                demographics: events.filter(e => ['ChildBorn', 'PersonaDied', 'CattleBorn', 'CattleDied', 'CattleSlaughtered'].includes(e.type))
                    .map(e => ({ eventId: e.id, type: e.type, time: { ...e.time }, details: structuredClone(e.details ?? {}),
                        ...(e.personaId ? { personaId: e.personaId } : {}) })) }
        });
        const chapter = this.data.chapters.at(-1)!;
        const previous = this.data.chapters.slice(0, -1);
        const publishedBodies = new Set(previous.map(published => published.text));
        chapter.composition = { rejectedDuplicateBodies: 0, usedFallback: false };
        for (let attempt = 0; attempt < 24; attempt++) {
            chapter.paragraphs = composeChapter(state.events, chapter.plan!, chapter.facts, previous,
                (this.data.narrativeSeed + attempt) >>> 0);
            chapter.text = chapter.paragraphs.map(paragraph => paragraph.text).join('\n\n');
            if (!publishedBodies.has(chapter.text)) break;
            chapter.composition.rejectedDuplicateBodies++;
        }
        if (publishedBodies.has(chapter.text)) {
            chapter.composition.usedFallback = true;
            const paragraph: NarrativeParagraph = { templateId: 'clan-book.bounded-fallback', templateVersion: 2,
                text: 'Chapter ' + chapter.index + ' covered the observed interval from Winter ' +
                    chapter.facts.period!.from.winter + ' to Winter ' + chapter.facts.period!.through.winter + '.',
                sourceEventIds: [], factRefs: ['period', 'chapter.index'] };
            chapter.paragraphs!.push(paragraph);
            chapter.text += '\n\n' + paragraph.text;
        }
        this.data.memory = narrativeMemory(this.data.chapters, state.events);
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
        const eventPositions = new Map(state.events.map((event, index) => [event.id, index]));
        const validReference = (reference: unknown, chapterIndex: number): boolean => {
            if (typeof reference !== 'string') return false;
            if (['founders', 'households', 'residences', 'stocks', 'cattle', 'longships',
                'period', 'demographics', 'ledger', 'livestock', 'chapter.index'].includes(reference)) return true;
            const callback = /^chapters\.(\d+)\.ledger\.food$/.exec(reference);
            const index = callback ? Number(callback[1]) : -1;
            return index >= 0 && index < chapterIndex && !!saved.chapters[index]?.facts.ledger?.food.complete;
        };
        if (saved.version !== 1 || ![1, 2].includes(saved.generatorVersion) || ![1, 2].includes(saved.styleVersion) || saved.canonicalIdentity !== historyIdentity(JSON.stringify(state)) ||
            typeof saved.id !== 'string' || !Number.isSafeInteger(saved.narrativeSeed) || saved.narrativeSeed < 0 || saved.narrativeSeed > 0xffffffff ||
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
                c.facts.recordedReceipts?.some(receipt => {
                    const event = state.events[eventPositions.get(receipt.eventId) ?? -1];
                    return !event || event.type !== 'FoundingLongshipSalvaged' ||
                        event.details?.materials !== receipt.units || event.time.winter !== receipt.winter ||
                        (eventPositions.get(receipt.eventId) ?? Infinity) >= c.checkpoint.eventEnd;
                }) ||
                typeof c.notified !== 'boolean' || typeof c.read !== 'boolean' ||
                c.paragraphs !== undefined && (!Array.isArray(c.paragraphs) || c.paragraphs.some(paragraph =>
                    !paragraph || typeof paragraph.text !== 'string' || typeof paragraph.templateId !== 'string' ||
                    paragraph.templateVersion !== 2 || !Array.isArray(paragraph.factRefs) ||
                    !paragraph.factRefs.every(reference => validReference(reference, i)) ||
                    !Array.isArray(paragraph.sourceEventIds) || paragraph.sourceEventIds.some(id =>
                        (eventPositions.get(id) ?? Infinity) >= c.checkpoint.eventEnd))) ||
                c.plan !== undefined && (![1, 2].includes(c.plan.version) || JSON.stringify(c.plan) !== JSON.stringify(planNarrative(
                    state.events.slice(0, c.checkpoint.eventEnd),
                    i > 0 ? saved.chapters[i - 1].checkpoint.eventEnd : 0, c.plan.version
                )))))
            throw new Error('Clan Book does not match this campaign history.');
        if (saved.memory !== undefined && JSON.stringify(saved.memory) !==
            JSON.stringify(narrativeMemory(saved.chapters, state.events.slice(0, saved.cursor.eventEnd))))
            throw new Error('Clan Book planning memory does not match this campaign history.');
        const { canonicalIdentity: _identity, ...data } = saved;
        this.data = structuredClone(data);
    }
}
