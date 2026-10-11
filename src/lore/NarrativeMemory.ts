import type { BookChapter } from './ClanBook';
import type { SimulationEvent } from '../simulation/SimulationCore';

/** Planning references only: these never establish facts or relationships. */
export type NarrativeMemory = {
    version: 1;
    featuredEventIds: string[];
    featuredSubjectIds: string[];
    unresolvedEventIds: string[];
    recent: { chapterIndex: number; focus: string[]; paragraphIds: string[] }[];
};
export function narrativeMemory(chapters: readonly BookChapter[], events: readonly SimulationEvent[]): NarrativeMemory {
    const plans = chapters.flatMap(chapter => chapter.plan ? [chapter.plan] : []);
    const recalled = new Set(plans.flatMap(plan => plan.callbackEventIds));
    return { version: 1,
        featuredEventIds: [...new Set(plans.flatMap(plan => [...plan.sourceEventIds, ...plan.callbackEventIds]))],
        featuredSubjectIds: [...new Set(plans.flatMap(plan => plan.threads.flatMap(thread => thread.subjectIds)))],
        // An unresolved record awaits a relevant later observation; it does not prove continued life/occupancy.
        unresolvedEventIds: events.filter(event => ['ChildBorn', 'HouseBuilt'].includes(event.type) &&
            !recalled.has(event.id)).map(event => event.id),
        recent: chapters.slice(-3).map(chapter => ({ chapterIndex: chapter.index,
            focus: chapter.plan?.focus ?? [], paragraphIds: chapter.paragraphs?.map(paragraph => paragraph.templateId) ?? [] })) };
}
