import { projectChronicle } from './Chronicle';
import type { SimulationEvent } from '../simulation/SimulationCore';
import type { NarrativePlan } from './NarrativePlan';
import type { BookChapter, OpeningFacts } from './ClanBook';

export type NarrativeParagraph = {
    templateId: string;
    templateVersion: 2;
    text: string;
    sourceEventIds: string[];
    factRefs: string[];
};
export function composeChapter(
    events: readonly SimulationEvent[], plan: NarrativePlan, facts: OpeningFacts,
    previousChapters: readonly BookChapter[], narrativeSeed: number
): NarrativeParagraph[] {
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
    const date = (winter: number, sentence: string, variant: number): string => {
        const lower = sentence.replace(/^(Our longship|The founding party|A permanent home|A home|A household|An animal)\b/, word => word[0].toLowerCase() + word.slice(1));
        const action = sentence.replace(/\.$/, '');
        return ['In Winter ' + winter + ', ' + lower, action + ' in Winter ' + winter + '.',
            'During Winter ' + winter + ', ' + lower, action + ' during Winter ' + winter + '.'][variant];
    };
    const narrativeLine = (event: SimulationEvent, text: string): string => {
        const details = event.details ?? {};
        const mission = ({ Recon: 'reconnaissance', Surveillance: 'surveillance', Pillage: 'pillage' } as Record<string, string>)[String(details.mission)];
        if (event.type === 'ExpeditionDeparted' && mission && typeof details.groupName === 'string') {
            const provisions = Number.isSafeInteger(details.foodCost) ? ', carrying ' + details.foodCost + ' Food' : '';
            return details.groupName + ' departed on a ' + mission + ' expedition' + provisions + '.';
        }
        if (event.type === 'ExpeditionReturned' && mission && typeof details.success === 'boolean') {
            const sentences = ['The ' + mission + ' expedition ' +
                (details.success ? 'was completed.' : 'ended without success.')];
            const recovered = ['food', 'materials'].flatMap(resource =>
                Number.isSafeInteger(details[resource]) ? [details[resource] + ' ' +
                    (resource === 'food' ? 'Food' : 'Materials')] : []);
            for (const [key, label] of [['cattleIds', 'cattle'], ['personaIds', 'people']]) {
                if (Array.isArray(details[key])) recovered.push(details[key].length + ' ' + label);
            }
            if (recovered.length) sentences.push('It recovered ' + namesList(recovered) + '.');
            if (Array.isArray(details.casualtyIds)) sentences.push(details.casualtyIds.length ?
                details.casualtyIds.length + ' casualties were recorded for that expedition.' :
                'No casualties were recorded for that expedition.');
            return sentences.join(' ');
        }
        const animal = event.details?.cattleId;
        return typeof animal === 'string' ? text.replace('Animal ' + animal,
            event.type === 'CattleBorn' ? 'A calf' : 'An animal') : text;
    };
    // Variant pairs change chronology as well as wording; all clauses retain their own event date.
    const focus = [...plan.focus];
    if (base % 2) focus.reverse();
    for (const theme of focus) {
        const threads = plan.threads.filter(thread => thread.theme === theme);
        const sources = [...new Set(threads.flatMap(thread => [...thread.callbackEventIds, ...thread.sourceEventIds]))];
        const variant = choose('clan-book.thread.' + theme);
        const recalled = new Set<string>();
        const lines = threads.flatMap(thread => {
            const current = eventsById.get(thread.sourceEventIds[0]);
            const previous = eventsById.get(thread.callbackEventIds[0]);
            const currentEntry = byId.get(thread.sourceEventIds[0]);
            const previousEntry = byId.get(thread.callbackEventIds[0]);
            if (!current || !currentEntry) return [];
            const action = date(current.time.winter, narrativeLine(current, currentEntry.text), variant);
            if (!previous || !previousEntry) return [action];
            const elapsed = current.time.winter - previous.time.winter;
            const samePerson = !!current.personaId && current.personaId === previous.personaId;
            let link = '';
            if (current.type === 'PersonaDied' && previous.type === 'FoundingPartyLanded')
                return [action + ' The same resident had been among the founding party in Winter ' +
                    previous.time.winter + ', ' + elapsed + ' winters earlier.'];
            if (samePerson && current.type === 'OccupationAssigned' &&
                typeof current.details?.occupation === 'string' && previous.type === 'ChildBorn')
                link = elapsed + ' winters lay between the birth and the new occupation.';
            if (current.type === 'CattleBorn' && previous.type === 'CattleAssigned')
                link = 'The calf was assigned to the same Farmyard as its mother.';
            if (previous.type === 'HouseBuilt')
                link = 'The same home appeared again, ' + elapsed + ' winters after its construction.';
            if (samePerson && typeof current.details?.name === 'string' &&
                typeof previous.details?.name === 'string' && current.details.name !== previous.details.name)
                link += (link ? ' ' : '') + 'The same resident had been recorded as ' + previous.details.name +
                    ' in Winter ' + previous.time.winter + '.';
            // A callback shared by several current events is told once, but remains on every thread.
            const callback = recalled.has(previous.id) ? '' : date(previous.time.winter, current.type === 'CattleBorn' ?
                narrativeLine(previous, previousEntry.text).replace('An animal', 'The calf’s mother') :
                narrativeLine(previous, previousEntry.text), variant);
            recalled.add(previous.id);
            const clauses = variant < 2 ? [action, callback, link] : [callback, action, link];
            return [clauses.filter(Boolean).join(' ')];
        });
        if (lines.length) paragraphs.push({ templateId: 'clan-book.thread.' + theme + '.' + variant,
            templateVersion: 2, text: lines.join(' '), sourceEventIds: sources, factRefs: [] });
    }
    if (!plan.focus.length && facts.complete && facts.period && !facts.demographics?.length) {
        const from = facts.period.from.winter, through = facts.period.through.winter;
        const variant = choose('clan-book.quiet');
        const lines = [
            'No births or deaths were recorded between Winter ' + from + ' and the completed boundary at Winter ' + through + '.',
            'Between Winter ' + from + ' and Winter ' + through + ', no births or deaths were recorded.',
            'The interval from Winter ' + from + ' to Winter ' + through + ' contained no recorded births or deaths.',
            'No birth or death appeared in the observed interval ending at Winter ' + through + '.',
        ];
        paragraphs.push({ templateId: 'clan-book.quiet.' + variant, templateVersion: 2,
            text: lines[variant], sourceEventIds: [], factRefs: ['period', 'demographics'] });
    }
    const ledger = facts.ledger;
    const stocks = facts.stocks;
    if (ledger && stocks) {
        const complete = ledger.food.complete && ledger.materials.complete;
        const variant = choose(complete ? 'clan-book.reserves' : 'clan-book.partial-account');
        const winter = facts.period!.through.winter;
        const accounts = [
            'At Winter ' + winter + ', ' + stocks.food + ' Food and ' + stocks.materials + ' Materials remained.',
            'The interval closed with ' + stocks.food + ' Food and ' + stocks.materials + ' Materials in stock, at Winter ' + winter + '.',
            'There were ' + stocks.food + ' Food and ' + stocks.materials + ' Materials left when the interval closed at Winter ' + winter + '.',
            'At the completed Winter ' + winter + ' boundary, the reserves stood at ' + stocks.food + ' Food and ' + stocks.materials + ' Materials.',
        ];
        const shortage = complete && stocks.food > 0 && ledger.food.unmetNeed === 0 ?
            [...previousChapters].reverse().find(chapter => chapter.facts.ledger?.food.complete &&
                chapter.facts.ledger.food.closing === 0 && (chapter.facts.ledger.food.unmetNeed ?? 0) > 0) : undefined;
        const callback = shortage ? 'At Winter ' + shortage.checkpoint.time.winter +
            ', no Food had remained in stock; ' + shortage.facts.ledger!.food.unmetNeed +
            ' Food of need had gone unmet in that earlier interval. ' : '';
        const shortfall = ledger.food.unmetNeed;
        const need = shortfall ? [
            shortfall + ' Food of need had gone unmet in this interval.',
            shortfall + ' Food of recorded need remained unmet over these winters.',
            'The completed interval left ' + shortfall + ' Food of need unmet.',
            'Unmet Food need amounted to ' + shortfall + ' in the observed interval.'
        ][variant] : [
            'No Food need had gone unmet in this interval.',
            'All recorded Food need in this interval had been met.',
            'The complete account recorded no unmet Food need for these winters.',
            'No Food shortfall was recorded for the observed interval.'
        ][variant];
        paragraphs.push({ templateId: complete ? 'clan-book.reserves.' + variant : 'clan-book.partial-account.' + variant,
            templateVersion: 2, text: complete ? callback + accounts[variant] + ' ' + need :
                ['The Food and Materials account ending at Winter ' + winter + ' had gaps. Missing quantities were left unstated.',
                    'At Winter ' + winter + ', the Food and Materials account was incomplete. Missing quantities were left unstated.',
                    'Missing quantities remained unstated in the incomplete account ending at Winter ' + winter + '.',
                    'The observed interval ended at Winter ' + winter + ' with gaps in the Food and Materials account.'][variant],
            sourceEventIds: [...new Set([...ledger.transactions, ...(shortage?.facts.ledger?.transactions.filter(transaction => transaction.resource === 'food') ?? [])].map(transaction => transaction.eventId))],
            factRefs: ['ledger', 'stocks', 'period', ...(shortage ? ['chapters.' + shortage.index + '.ledger.food'] : [])] });
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
    facts: OpeningFacts, winter: number, narrativeSeed: number, sourceEventIds: string[]
): NarrativeParagraph[] {
    const paragraph = (templateId: string, text: string, factRefs: string[]): NarrativeParagraph =>
        ({ templateId, templateVersion: 2, text, sourceEventIds, factRefs });
    const names = namesList(facts.founders.map(person => person.name));
    const leads = [names + ' arrived in Winter ' + winter + '.',
        'In Winter ' + winter + ', the founding party arrived. It included ' + names + '.',
        names + ' were among the founding party in Winter ' + winter + '.'];
    const arrival = paragraph('clan-book.arrival.people.' + narrativeSeed % 3,
        leads[narrativeSeed % 3], ['founders']);
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
    const assets = paragraph('clan-book.arrival.reserves',
        'They began with ' + facts.stocks!.food + ' Food and ' + facts.stocks!.materials + ' Materials. ' +
        'The founding party had ' + facts.cattle.length + ' cattle and ' + facts.longships.length +
        (facts.longships.length === 1 ? ' longship.' : ' longships.'), ['stocks', 'cattle', 'longships']);
    const structures = [[homes, work, assets], [work, homes, assets], [homes, assets, work],
        [work, assets, homes], [assets, homes, work], [assets, work, homes]];
    return [arrival, ...structures[Math.floor(narrativeSeed / 3) % structures.length]
        .filter(part => part.text.trim())];
}
