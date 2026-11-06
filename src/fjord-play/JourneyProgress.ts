export const journeyChapters = ['orientation', 'home', 'discovery', 'conflict'] as const;
export type JourneyChapter = typeof journeyChapters[number];
export const orientationObjectives = [
    'ui-camera', 'ui-resident', 'ui-connections', 'ui-home', 'ui-time', 'ui-navigation',
] as const;
export type OrientationObjective = typeof orientationObjectives[number];
export const journeyObjectives = [
    ...orientationObjectives,
    'meet-people', 'understand-work', 'permanent-home', 'specialize-home', 'upgrade-home', 'longship-choice',
    'prepare-expedition', 'wildlife-species', 'find-neighbours', 'sea-travel',
    'recon', 'personal-gear', 'pillage', 'mission-result',
] as const;
export type JourneyObjective = typeof journeyObjectives[number];

/** Only presentation facts which cannot be reconstructed from Core belong in the save. */
export interface JourneyProgress {
    version: 1;
    chapter: JourneyChapter;
    selected: JourneyObjective | null;
    householdId: string | null;
    homeResidentId: string | null;
    livestockId: string | null;
    improvementsSeen: boolean;
    smitherySeen: boolean;
    keptShipId: string | null;
    resultEventId: string | null;
    skipped: JourneyObjective[];
    later: JourneyObjective[];
    orientation?: OrientationObjective[];
    tour?: { step: OrientationObjective; dismissed: boolean };
}

export function newJourney(chapter: JourneyChapter = 'home'): JourneyProgress {
    return {
        version: 1, chapter, selected: null, householdId: null, homeResidentId: null,
        livestockId: null, improvementsSeen: false, smitherySeen: false, keptShipId: null,
        resultEventId: null, skipped: [], later: [],
    };
}

export function readJourney(value: unknown): JourneyProgress | undefined {
    if (value === undefined) return undefined;
    const data = value as JourneyProgress;
    const id = (value: unknown) => value === null || typeof value === 'string' &&
        value.length > 0 && value.length <= 96;
    const objectives = (value: unknown): value is JourneyObjective[] => Array.isArray(value) &&
        value.length <= journeyObjectives.length && new Set(value).size === value.length &&
        value.every(id => journeyObjectives.includes(id));
    if (!data || data.version !== 1 || !journeyChapters.includes(data.chapter) ||
        data.selected !== null && !journeyObjectives.includes(data.selected) ||
        ![data.householdId, data.homeResidentId, data.livestockId, data.keptShipId, data.resultEventId].every(id) ||
        typeof data.improvementsSeen !== 'boolean' || typeof data.smitherySeen !== 'boolean' ||
        !objectives(data.skipped) || !objectives(data.later) ||
        data.skipped.some(id => data.later.includes(id)) ||
        data.orientation !== undefined && (!Array.isArray(data.orientation) ||
            data.orientation.length > orientationObjectives.length ||
            new Set(data.orientation).size !== data.orientation.length ||
            !data.orientation.every(id => orientationObjectives.includes(id))) ||
        data.tour !== undefined && (!data.tour || typeof data.tour !== 'object' || Array.isArray(data.tour) ||
            Object.keys(data.tour).sort().join(',') !== 'dismissed,step' ||
            !orientationObjectives.includes(data.tour.step) || typeof data.tour.dismissed !== 'boolean'))
        throw new Error('Invalid saved Founding Journey.');
    return {
        version: 1, chapter: data.chapter, selected: data.selected,
        householdId: data.householdId, homeResidentId: data.homeResidentId, livestockId: data.livestockId,
        improvementsSeen: data.improvementsSeen, smitherySeen: data.smitherySeen,
        keptShipId: data.keptShipId, resultEventId: data.resultEventId,
        skipped: [...data.skipped], later: [...data.later],
        ...(data.orientation !== undefined ? { orientation: [...data.orientation] } : {}),
        ...(data.tour !== undefined ? { tour: { step: data.tour.step, dismissed: data.tour.dismissed } } : {}),
    };
}
