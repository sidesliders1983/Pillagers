import { composeChapter as styleThreeChapter, composeOpening as styleThreeOpening } from './LegacyNarrativeComposerV3';
import { cardinal, ordinal } from './NarrativeTime';
import { composeChapter as legacyChapter, composeOpening as legacyOpening } from './LegacyNarrativeComposerV2';
import { livestockAction, livestockGroups, livestockQuantity } from './LivestockNarrative';
import { projectChronicle } from './Chronicle';
import type { SimulationEvent } from '../simulation/SimulationCore';
import type { NarrativePlan } from './NarrativePlan';
import type { BookChapter, OpeningFacts } from './ClanBook';

export type NarrativeParagraph = {
    templateId: string;
    templateVersion: 2 | 3 | 4;
    text: string;
    sourceEventIds: string[];
    factRefs: string[];
};
type DatedClause = { event: SimulationEvent; text: string };

function elapsedWords(years: number): string {
    return cardinal(years);
}
type StoryOrigin = { winter: number; action: string; sourceIds: string[]; factRefs: string[] };
function storyOrigin(events: readonly SimulationEvent[], facts: OpeningFacts,
    previousChapters: readonly BookChapter[]): StoryOrigin | undefined {
    const arrival = events.find(event => event.type === 'FoundingPartyLanded');
    const initialized = events.find(event => event.type === 'ClanInitialized');
    const event = arrival ?? initialized;
    if (event) return { winter: event.time.winter,
        action: arrival ? 'the founding party arrived' : 'the clan began', sourceIds: [event.id], factRefs: [] };
    const opening = previousChapters[0];
    if (opening) return { winter: opening.checkpoint.time.winter, action: 'this account began',
        sourceIds: [], factRefs: ['chapters.0.checkpoint.time'] };
    return facts.period ? { winter: facts.period.from.winter, action: 'these recorded years began',
        sourceIds: [], factRefs: ['period'] } : undefined;
}
function ordinalTime(winter: number, origin: StoryOrigin, unit = 'winter'): string {
    const gap = winter - origin.winter;
    return gap === 0 ? 'the ' + unit + ' ' + origin.action :
        'the ' + ordinal(Math.abs(gap)) + ' ' + unit + (gap < 0 ? ' before ' : ' after ') + origin.action;
}
function lowerSubject(sentence: string): string {
    return sentence.replace(/^(Our longship|The founding party|A permanent home|A home|A household|An animal|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\b/,
        word => word[0].toLowerCase() + word.slice(1));
}

/** Each paragraph owns its anchor; independently selected variants cannot inherit a foreign date. */
function datedPassage(
    clauses: DatedClause[], events: readonly SimulationEvent[], origin: StoryOrigin | undefined
): { text: string; anchorIds: string[]; factRefs: string[] } {
    const positions = new Map(events.map((event, index) => [event.id, index]));
    clauses.sort((a, b) => a.event.time.winter - b.event.time.winter ||
        a.event.time.tick - b.event.time.tick || (positions.get(a.event.id) ?? 0) - (positions.get(b.event.id) ?? 0));
    if (!clauses.length) return { text: '', anchorIds: [], factRefs: [] };
    const first = clauses[0].event;
    const used = new Set(clauses.map(clause => clause.event.id));
    const anchor = events.filter(event => !used.has(event.id) &&
        ['FoundingPartyLanded', 'FoundingLongshipSalvaged'].includes(event.type) &&
        (event.time.winter < first.time.winter || event.time.winter === first.time.winter && event.time.tick <= first.time.tick))
        .sort((a, b) => b.time.winter - a.time.winter || b.time.tick - a.time.tick ||
            (positions.get(b.id) ?? 0) - (positions.get(a.id) ?? 0))[0];
    let previous: SimulationEvent | undefined;
    const lines = clauses.map(({ event, text }) => {
        const winters = event.time.tick === 0 && (previous?.time.tick ?? anchor?.time.tick ?? 0) === 0;
        const unit = winters ? 'winter' : 'year';
        let prefix: string;
        if (previous) {
            const gap = event.time.winter - previous.time.winter;
            prefix = gap === 0 ? 'That same ' + unit : gap === 1 ? 'The following ' + unit :
                elapsedWords(gap)[0].toUpperCase() + elapsedWords(gap).slice(1) + ' ' + unit + 's later';
        } else if (anchor) {
            const gap = event.time.winter - anchor.time.winter;
            const action = anchor.type === 'FoundingLongshipSalvaged' ? 'the longship was salvaged' : 'the founding party arrived';
            prefix = gap === 0 ? 'In the ' + unit + ' ' + action : gap === 1 ? 'In the ' + unit + ' after ' + action :
                elapsedWords(gap)[0].toUpperCase() + elapsedWords(gap).slice(1) + ' ' + unit + 's after ' + action;
        } else prefix = origin ? 'In ' + ordinalTime(event.time.winter, origin, unit) : 'In those years';
        previous = event;
        return prefix + ', ' + lowerSubject(text);
    });
    return { text: lines.join(' '), anchorIds: anchor ? [anchor.id] : origin?.sourceIds ?? [],
        factRefs: anchor ? [] : origin?.factRefs ?? [] };
}

function narrativeLine(event: SimulationEvent, original: string): string {
    const details = event.details ?? {};
    const mission = ({ Recon: 'reconnaissance', Surveillance: 'surveillance', Pillage: 'pillage' } as Record<string, string>)[String(details.mission)];
    if (event.type === 'ExpeditionDeparted' && mission && typeof details.groupName === 'string')
        return details.groupName + ' departed on a ' + mission + ' expedition' +
            (Number(details.foodCost) > 0 ? ', carrying Food for the journey.' : '.');
    if (event.type === 'ExpeditionReturned' && mission && typeof details.success === 'boolean') {
        const lines = ['The ' + mission + ' expedition ' + (details.success ? 'was completed.' : 'ended without success.')];
        const recovered = ['food', 'materials'].flatMap(resource =>
            Number.isSafeInteger(details[resource]) && Number(details[resource]) > 0 ?
                [resource === 'food' ? 'Food' : 'Materials'] : []);
        for (const [key, label] of [['cattleIds', 'cattle'], ['personaIds', 'people']])
            if (Array.isArray(details[key]) && details[key].length) recovered.push(details[key].length + ' ' + label);
        if (recovered.length) lines.push('It recovered ' + namesList(recovered) + '.');
        if (Array.isArray(details.casualtyIds)) lines.push(details.casualtyIds.length ?
            details.casualtyIds.length + ' casualties were recorded for that expedition.' : 'No casualties were recorded for that expedition.');
        return lines.join(' ');
    }
    if (event.type === 'BuildingCollapsed') original = original.replace(/; \d+ Materials were salvaged/,
        Number(details.salvage) > 0 ? '; some Materials were salvaged' : '; no Materials were salvaged');
    return original.replace(/ for \d+ (Food|Materials)/g, '');
}

export function composeChapter(
    events: readonly SimulationEvent[], plan: NarrativePlan, facts: OpeningFacts,
    previousChapters: readonly BookChapter[], narrativeSeed: number, version: 2 | 3 | 4 = 4
): NarrativeParagraph[] {
    if (version === 2) return legacyChapter(events, plan, facts, previousChapters, narrativeSeed);
    if (version === 3) return styleThreeChapter(events, plan, facts, previousChapters, narrativeSeed);
    const origin = storyOrigin(events, facts, previousChapters);
    const entries = projectChronicle(events).reverse().flatMap(group => group.entries);
    const byId = new Map(entries.flatMap(entry => entry.sourceEventIds.map(id => [id, entry] as const)));
    const eventsById = new Map(events.map(event => [event.id, event]));
    const paragraphs: NarrativeParagraph[] = [];
    const recentIds = previousChapters.slice(-2).flatMap(chapter => chapter.paragraphs?.map(part => part.templateId) ?? []);
    const base = (narrativeSeed + previousChapters.length) >>> 0;
    const choose = (prefix: string): number => {
        for (let offset = 0; offset < 4; offset++) {
            const variant = (base + offset) % 4;
            if (!recentIds.includes(prefix + '.' + variant)) return variant;
        }
        return base % 4;
    };
    const focus = base % 2 ? [...plan.focus].reverse() : [...plan.focus];
    for (const theme of focus) {
        const threads = plan.threads.filter(thread => thread.theme === theme);
        const sources = [...new Set(threads.flatMap(thread => [...thread.callbackEventIds, ...thread.sourceEventIds]))];
        const selected = sources.flatMap(id => eventsById.has(id) ? [eventsById.get(id)!] : []);
        const variant = choose('clan-book.thread.' + theme);
        let clauses: DatedClause[];
        const links: string[] = [];
        if (theme === 'herd') {
            clauses = livestockGroups(selected).map(group => ({ event: group[0], text: livestockAction(group, facts) }));
            if (threads.some(thread => thread.callbackEventIds.length))
                links.push('A calf was assigned to the same Farmyard as its mother.');
        } else {
            clauses = selected.filter(event => byId.has(event.id) && event.type !== 'FoundingPartyLanded')
                .map(event => ({ event, text: narrativeLine(event, byId.get(event.id)!.text) }));
            for (const thread of threads) {
                const current = eventsById.get(thread.sourceEventIds[0]);
                const previous = eventsById.get(thread.callbackEventIds[0]);
                if (!current || !previous) continue;
                const elapsed = current.time.winter - previous.time.winter;
                if (current.type === 'PersonaDied' && previous.type === 'FoundingPartyLanded')
                    links.push((byId.get(current.id)?.text.split(' died')[0] ?? 'The resident') +
                        ' had been among the founding party, ' + cardinal(elapsed) + ' winters earlier.');
                if (previous.type === 'HouseBuilt')
                    links.push('The same home appeared again, ' + cardinal(elapsed) + ' winters after its construction.');
                if (current.personaId && current.personaId === previous.personaId &&
                    typeof current.details?.name === 'string' && typeof previous.details?.name === 'string' &&
                    current.details.name !== previous.details.name)
                    links.push('The same resident had been recorded as ' + previous.details.name + '.');
            }
        }
        const passage = datedPassage(clauses, events, origin);
        if (passage.text) paragraphs.push({ templateId: 'clan-book.thread.' + theme + '.' + variant,
            templateVersion: 4, text: [passage.text, ...new Set(links)].join(' '),
            sourceEventIds: [...new Set([...sources, ...passage.anchorIds])], factRefs: [...(theme === 'herd' ? ['livestock'] : []), ...passage.factRefs] });
    }
    if (!plan.focus.length && facts.complete && facts.period && !facts.demographics?.length) {
        const years = facts.period.through.winter - facts.period.from.winter;
        const variant = choose('clan-book.quiet');
        const lines = ['Over these ' + elapsedWords(years) + ' years, no births or deaths were recorded.',
            'No births or deaths were recorded across these ' + elapsedWords(years) + ' years.',
            'These ' + elapsedWords(years) + ' years brought no recorded births or deaths.',
            'No birth or death was recorded over these ' + elapsedWords(years) + ' years.'];
        paragraphs.push({ templateId: 'clan-book.quiet.' + variant, templateVersion: 4,
            text: facts.period.from.tick === facts.period.through.tick ? lines[variant] :
                'No births or deaths were recorded across this interval.', sourceEventIds: [], factRefs: ['period', 'demographics'] });
    }
    const ledger = facts.ledger;
    if (ledger && facts.stocks && ledger.food.complete && ledger.materials.complete) {
        const variant = choose('clan-book.reserves');
        const foodRemains = facts.stocks.food > 0;
        const lines = foodRemains ? ['There was still Food in store.', 'Some Food remained in store.',
            'The stores still held Food.', 'There was Food left in store.'] :
            ['There was no Food left in store.', 'The Food stores were empty.',
                'No Food remained in the stores.', 'The stores held no Food.'];
        const shortage = foodRemains && ledger.food.unmetNeed === 0 ? [...previousChapters].reverse().find(chapter =>
            chapter.facts.ledger?.food.complete && chapter.facts.ledger.food.closing === 0 &&
            (chapter.facts.ledger.food.unmetNeed ?? 0) > 0) : undefined;
        const callback = shortage ? ' ' + elapsedWords(facts.period!.through.winter - shortage.checkpoint.time.winter)[0].toUpperCase() +
            elapsedWords(facts.period!.through.winter - shortage.checkpoint.time.winter).slice(1) +
            ' years earlier, the Food stores had been empty.' : '';
        const need = (ledger.food.unmetNeed ?? 0) > 0 ?
            ' The Food available had not covered all that was needed over these years.' : '';
        const resourceSources = [...ledger.transactions,
            ...(shortage?.facts.ledger?.transactions.filter(transaction => transaction.resource === 'food') ?? [])]
            .map(transaction => transaction.eventId);
        paragraphs.push({ templateId: 'clan-book.reserves.' + variant, templateVersion: 4,
            text: (origin ? 'By ' + ordinalTime(facts.period!.through.winter, origin) : 'By then') + ', ' +
                lines[variant][0].toLowerCase() + lines[variant].slice(1) + callback + need,
            sourceEventIds: [...new Set([...(origin?.sourceIds ?? []), ...resourceSources])],
            factRefs: ['ledger', 'stocks', 'period', ...(origin?.factRefs ?? []), ...(shortage ? ['chapters.' + shortage.index + '.ledger.food'] : [])] });
    }
    if (!paragraphs.length && facts.period) {
        paragraphs.push({ templateId: 'clan-book.partial-history', templateVersion: 4,
            text: 'Only part of the story of these years is known.', sourceEventIds: [], factRefs: ['period'] });
    }
    return paragraphs;
}

const roleLabels: Record<string, string> = {
    farmer: 'farmer', herder: 'herder', fisher: 'fisher', hunter: 'hunter',
    woodworker: 'woodworker', smith: 'smith', textileWorker: 'textile worker',
    boatbuilder: 'boatbuilder', trader: 'trader',
    leatherAndJewelleryMaker: 'leather and jewellery maker',
};
function namesList(names: string[]): string {
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
}
export function composeOpening(
    facts: OpeningFacts, winter: number, narrativeSeed: number, sourceEventIds: string[], version: 2 | 3 | 4 = 4
): NarrativeParagraph[] {
    if (version === 2) return legacyOpening(facts, winter, narrativeSeed, sourceEventIds);
    if (version === 3) return styleThreeOpening(facts, winter, narrativeSeed, sourceEventIds);
    const paragraph = (templateId: string, text: string, factRefs: string[]): NarrativeParagraph =>
        ({ templateId, templateVersion: 4, text, sourceEventIds, factRefs });
    const names = namesList(facts.founders.map(person => person.name));
    const leads = facts.arrival ? [names + ' arrived together in summer.',
        'The founding party arrived in summer. It included ' + names + '.',
        names + ' were among those who arrived in summer.'] : [names + ' arrived together.',
        'The founding party arrived. It included ' + names + '.',
        names + ' were among those who arrived.'];
    const arrival = paragraph('clan-book.arrival.people.' + narrativeSeed % 3,
        leads[narrativeSeed % 3], facts.arrival ? ['founders', 'arrival'] : ['founders']);
    const pairs = facts.founders.filter(person => person.partnerId && person.id < person.partnerId)
        .flatMap(person => {
            const partner = facts.founders.find(other => other.id === person.partnerId && other.partnerId === person.id);
            return partner ? [person.name + ' and ' + partner.name + ' were already partners.'] : [];
        });
    const shelters = facts.residences ?? [];
    const allTents = shelters.length > 0 && shelters.every(residence => residence.kind === 'tent');
    const homes = paragraph('clan-book.arrival.households', pairs.join(' ') +
        (allTents ? ' Their first households lived in tents.' : ''), ['founders', 'households', 'residences']);
    const roles = [...new Set(facts.founders.map(person => person.occupation))];
    const work = paragraph('clan-book.arrival.work', roles.map(role => {
        const people = facts.founders.filter(person => person.occupation === role);
        const named = namesList(people.map(person => person.name));
        const label = role && roleLabels[role];
        return label ? named + (people.length === 1 ? ' worked as a ' + label : ' worked as ' + label + 's') + '.' :
            named + ' had no assigned occupation.';
    }).join(' '), ['founders']);
    const foundingCattle = facts.cattle.map(animal => ({
        id: animal.id, type: 'CattleAssigned', time: { winter, tick: 0 }, details: { cattleId: animal.id }
    }));
    const assets = paragraph('clan-book.arrival.reserves',
        'The founding party had ' + (foundingCattle.length ? livestockQuantity(foundingCattle, facts) : 'no cattle') +
        ' and ' + facts.longships.length +
        (facts.longships.length === 1 ? ' longship.' : ' longships.'), ['stocks', 'cattle', 'livestock', 'longships']);
    const structures = [[homes, work, assets], [work, homes, assets], [homes, assets, work],
        [work, assets, homes], [assets, homes, work], [assets, work, homes]];
    return [arrival, ...structures[Math.floor(narrativeSeed / 3) % structures.length]
        .filter(part => part.text.trim())];
}
