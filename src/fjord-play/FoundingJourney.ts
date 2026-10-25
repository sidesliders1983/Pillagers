import { inspectBuilding, inspectWork, personaAway } from '../simulation/SimulationCore';
import type { SimulationCommand, SimulationEvent, SimulationState } from '../simulation/SimulationCore';
import { inspectIslandMissions } from '../simulation/IslandMissions';
import { expeditionEligible, groupMission } from '../simulation/WorldExpeditions';
import { weatherProfile } from '../simulation/Weather';
import { equipmentItems, equipmentOwned } from '../simulation/Smithery';
import { wildlifeSighting } from '../simulation/WildlifeSightings';
import { wildlifeSpecies } from '../wildlife/WildlifeSpecies';
import type { GameplaySession } from '../gameplay-lab/GameplaySession';
import { firstStepsFacts, type FirstStepsProgress } from './FirstStepsState';
import { newJourney, type JourneyChapter, type JourneyObjective } from './JourneyProgress';

type Evidence = 'home' | 'specialization' | 'upgrade' | 'kept' | 'salvaged' | 'explore' |
    'reconStarted' | 'reconResult' | 'crafted' | 'equipped' | 'pillage' | 'result' |
    'embarked' | 'sailed' | 'disembarked' | 'seaTrip';
const eventEvidence: Record<string, Evidence> = {
    HouseBuilt: 'home', BuildingSpecialized: 'specialization', BuildingUpgraded: 'upgrade',
    FoundingLongshipKept: 'kept', FoundingLongshipSalvaged: 'salvaged',
    LongshipEmbarked: 'embarked', LongshipDestinationSet: 'sailed', LongshipDisembarked: 'disembarked',
    EquipmentCrafted: 'crafted', EquipmentAssigned: 'equipped',
};

/** Rebuild once on history restore, then consume only appended events. No derived facts are saved. */
export class FoundingJourneyIndex {
    private cursor = 0;
    private seaTrips = new Map<string, { sailedAt?: number }>();
    readonly events: Partial<Record<Evidence, string>> = {};
    readonly species = new Map<string, string>();

    update(state: SimulationState): number {
        let visited = 0;
        for (; this.cursor < state.events.length; this.cursor++) {
            visited++;
            const event = state.events[this.cursor], details = event.details ?? {};
            const fact = eventEvidence[event.type];
            const tick = event.time.winter * state.ticksPerWinter + event.time.tick;
            const missionId = typeof details.missionId === 'string' ? details.missionId : '';
            if (event.type === 'LongshipEmbarked') this.seaTrips.set(missionId, {});
            const seaTrip = this.seaTrips.get(missionId);
            if (event.type === 'LongshipDestinationSet' && seaTrip) seaTrip.sailedAt = tick;
            if (event.type === 'LongshipDisembarked' && seaTrip?.sailedAt !== undefined && tick > seaTrip.sailedAt)
                this.events.seaTrip = event.id;
            if (['LongshipDisembarked', 'ExploreAreaReturned', 'ExploreAreaCancelled',
                'ExploreAreaStranded', 'LongshipBoardingCancelled'].includes(event.type))
                this.seaTrips.delete(missionId);
            if (fact && (fact !== 'specialization' || typeof details.occupation === 'string') &&
                (fact !== 'equipped' || equipmentItems.includes(details.item as typeof equipmentItems[number])))
                this.events[fact] = event.id;
            if (event.type === 'ExploreAreaDeparted') {
                const mission = state.world?.spatial?.missions[String(details.missionId)];
                if (mission?.memberIds.length && mission.foodCost > 0) this.events.explore = event.id;
            }
            if (event.type === 'LongshipEmbarked') {
                const mission = state.world?.spatial?.missions[String(details.missionId)];
                if (mission?.provisions && mission.foodCost > 0) this.events.explore = event.id;
            }
            if (event.type === 'ExpeditionDeparted' && details.mission === 'Recon')
                this.events.reconStarted = event.id;
            if (event.type === 'ExpeditionDeparted' && details.mission === 'Pillage')
                this.events.pillage = event.id;
            if (event.type === 'ExpeditionReturned' && details.mission === 'Recon')
                this.events.reconResult = event.id;
            if (event.type === 'ExpeditionReturned' && details.mission === 'Pillage')
                this.events.result = event.id;
            const sighting = wildlifeSighting(event);
            if (sighting && sighting.clanId === state.clan.id &&
                sighting.worldId === state.wildlife?.worldId && sighting.witnessPersonaIds.length &&
                sighting.witnessPersonaIds.every(id => state.personas[id] || state.personaArchive?.[id]) &&
                !this.species.has(sighting.speciesId))
                this.species.set(sighting.speciesId, event.id);
        }
        return visited;
    }
}

export function journeyEvent(state: SimulationState, id?: string | null): SimulationEvent | undefined {
    if (!id || !/^event-[1-9][0-9]*$/.test(id)) return;
    const event = state.events[Number(id.slice(6)) - 1];
    return event?.id === id ? event : undefined;
}

export const chapterCopy: Record<JourneyChapter, { title: string; why: string }> = {
    home: {
        title: 'I · A Home for Your People',
        why: 'Your people live, work and grow older on their own. You choose how to help them endure.',
    },
    discovery: {
        title: 'II · Beyond the Settlement',
        why: 'Your home is only part of this island. Discover what your people can actually witness.',
    },
    conflict: {
        title: 'III · The Price of Conflict',
        why: 'Decide what to learn, whom to risk and what you are prepared to lose. Conflict is optional.',
    },
};

export type JourneyStatus = 'completed' | 'available' | 'later' | 'skipped' | 'blocked';
export type JourneyAction = 'resident' | 'household' | 'livestock' | 'materials' | 'work' |
    'improvements' | 'ship' | 'expeditions' | 'wildlife' | 'recon' | 'smithery' | 'pillage' | 'report';
export interface JourneyCheck {
    id: string;
    label: string;
    done: boolean;
    action: JourneyAction;
}
export interface JourneyGoal {
    id: JourneyObjective;
    chapter: JourneyChapter;
    title: string;
    why: string;
    status: JourneyStatus;
    detail: string;
    action: JourneyAction;
    checklist: JourneyCheck[];
    optional?: boolean;
}

/** Public, dated knowledge only. Never consult targetClans or generated rival locations. */
export function foundingJourney(state: SimulationState, progress: FirstStepsProgress,
    index: FoundingJourneyIndex, availability: (command: SimulationCommand) => { allowed: boolean; reason: string },
    session?: Pick<GameplaySession, 'startExpeditionOffer'>) {
    const journey = progress.journey ?? newJourney();
    const facts = firstStepsFacts(state, progress, availability);
    const people = Object.values(state.personas).filter(person =>
        person.deathWinter === null && !personaAway(state, person.id));
    const animals = Object.values({ ...state.landing?.cattleArchive, ...state.landing?.cattle });
    const livestock = animals.find(animal => animal.deathWinter === null && animal.origin === 'founding') ??
        animals.find(animal => animal.origin === 'founding') ?? animals.find(animal => animal.deathWinter === null);
    const homes = Object.values(state.buildings).filter(building => building.kind === 'house');
    const building = (facts.buildingId && state.buildings[facts.buildingId]) || homes[0];
    const home = building ? Object.values(state.households).find(home => home.residenceId &&
        state.residences[home.residenceId]?.buildingId === building.id) : facts.home;
    const familyHome = Object.values(state.households).find(home => home.id === journey.householdId) ??
        Object.values(state.households).find(home => home.memberIds.includes(facts.person?.id ?? '')) ?? home;
    const ships = Object.values(state.landing?.longships ?? {});
    const retained = ships.find(ship => ship.salvagedWinter === null);
    const salvaged = ships.find(ship => ship.salvagedWinter !== null);
    const shipAway = !!retained && (!!retained.transport?.groupId || Object.values(state.world?.missions ?? {})
        .some(mission => mission.status === 'Away' && mission.shipId === retained.id));
    const shipState = retained ? shipAway ? 'away' : 'kept' : salvaged ? 'salvaged' : 'not present';
    const groups = Object.values(state.world?.groups ?? {});
    const group = groups.find(group => group.memberIds.length &&
        group.memberIds.every(id => expeditionEligible(state, id, group.id))) ?? groups[0];
    const sites = inspectIslandMissions(state).sites;
    const knownSite = sites.find(site => site.knowledge?.opportunity) ??
        sites.find(site => site.knowledge?.settlementName) ?? sites[0];
    const smith = people.find(person => ['smith', 'leatherAndJewelleryMaker'].includes(person.occupation ?? ''));
    const owned = equipmentItems.reduce((sum, item) => sum + equipmentOwned(state, item), 0);
    const assigned = Object.entries(state.smithery?.assignments ?? {})
        .filter(([id, gear]) => (state.personas[id] || state.personaArchive?.[id]) && (gear.weapon || gear.shield));
    const resultId = journey.resultEventId ?? index.events.result;
    const candidate = journeyEvent(state, resultId);
    const result = candidate?.type === 'ExpeditionReturned' && candidate.details?.mission === 'Pillage' ? candidate : undefined;
    const goals: JourneyGoal[] = [];
    const add = (goal: Omit<JourneyGoal, 'status'>, complete: boolean, reason = '', later = false) => {
        const status: JourneyStatus = complete ? 'completed' : journey.skipped.includes(goal.id) ? 'skipped' :
            journey.later.includes(goal.id) || later ? 'later' : reason ? 'blocked' : 'available';
        goals.push({ ...goal, status, detail: reason && !complete ? [goal.detail, reason].filter(Boolean).join(' ') : goal.detail });
    };
    const offerReason = (mission: 'Recon' | 'Pillage') => {
        if (!state.discovery || state.world?.version !== 2) return 'Physical island missions are not enabled in this campaign.';
        if (!knownSite) return 'No settlement has been sighted. Explore normally before choosing a rival target.';
        if (!group) return 'Create an Expedition Group from available residents first.';
        if (groupMission(state, group.id)) return 'Group already active or unavailable.';
        if (!group.memberIds.length || group.memberIds.some(id => !expeditionEligible(state, id, group.id)))
            return 'Group needs living eligible members without childcare.';
        if (mission === 'Pillage' && !knownSite.knowledge?.settlementName)
            return 'Identify this neighbouring clan through returned Recon first.';
        if (mission === 'Pillage' && !knownSite.knowledge?.opportunity)
            return 'No known viable pillage opportunity.';
        const config = state.world.config;
        const duration = Math.ceil(config.durations[mission] * weatherProfile(state).travelDurationBps / 10000);
        const food = Math.ceil(config.provisions[mission] * duration / config.durations[mission]) * group.memberIds.length;
        return state.stocks.food < food ? `Mission needs ${food} Food.` : '';
    };

    add({
        id: 'meet-people', chapter: 'home', title: 'Meet your people',
        why: 'A person has work and family. A household shares a home; livestock are individual animals.',
        detail: '',
        checklist: [
            { id: 'resident', label: 'Inspect a resident’s full profile', done: !!progress.residentId, action: 'resident' },
            { id: 'household', label: 'Inspect their household', done: !!journey.householdId, action: 'household' },
            { id: 'home-resident', label: 'Open a named resident from the home’s list',
                done: !!journey.homeResidentId, action: 'household' },
            { id: 'livestock', label: 'Inspect an individual founding animal',
                done: !!journey.livestockId, action: 'livestock' },
        ],
        action: 'resident',
    }, !!progress.residentId && !!journey.householdId && !!journey.homeResidentId && !!journey.livestockId,
    !people.length && !progress.residentId ? 'No local living resident is currently available.' :
        !livestock && !journey.livestockId ? 'No living livestock remain. Return later or set this objective aside.' : '');
    add({
        id: 'understand-work', chapter: 'home', title: 'Influence, don’t command',
        why: 'Residents work autonomously. Assign or specialize suitable work; individual footsteps are not orders.',
        detail: `${state.stocks.food} Food · ${state.stocks.materials} Materials. Production takes time;
            setting a target is not finished stock. Keep a suitable occupation.
            ${facts.workPlan ? 'No Materials producer is working: review an eligible woodworker plan.' : ''}`,
        checklist: [
            { id: 'stocks', label: 'Inspect Food and Materials', done: progress.resourcesSeen, action: 'materials' },
            { id: 'work', label: 'Inspect a resident doing productive work', done: !!progress.workerId,
                action: facts.workPlan ? 'work' : 'resident' },
        ],
        action: 'materials',
    }, progress.resourcesSeen && !!progress.workerId);
    add({
        id: 'permanent-home', chapter: 'home', title: 'Give a family a permanent home',
        why: 'A home supports a household’s future. The building cost and yearly maintenance are separate.',
        detail: building || index.events.home ? 'A real permanent home already counts; no second house is needed.' :
            `${facts.cost} Materials upfront · ${facts.upkeep} Materials/year when occupied.
            ${facts.shortfall ? `Save ${facts.shortfall} more Materials through actual work. Use Play to let production progress.` : ''}`,
        checklist: [
            { id: 'home', label: 'Give a household a permanent home', done: !!building || !!index.events.home,
                action: !building && facts.workPlan ? 'work' : 'household' },
        ],
        action: 'household',
    }, !!building || !!index.events.home, !building && !index.events.home && !facts.housing.allowed ? facts.housing.reason : '');
    add({
        id: 'specialize-home', chapter: 'home', title: 'Give the home a purpose',
        why: 'Specialization supports matching residents’ work; it does not change their occupation.',
        detail: 'Review the real matching-work bonus and upkeep in Specialization & upgrades. Choose a useful specialization.',
        checklist: [
            { id: 'specialization', label: 'Choose a useful home specialization',
                done: !!index.events.specialization || homes.some(home => !!home.specialization), action: 'improvements' },
        ],
        action: 'improvements',
    }, !!index.events.specialization || homes.some(home => !!home.specialization),
    !building ? 'Build a permanent home first. Other chapters remain available.' : '');
    const upgrade = building ? availability({ type: 'UpgradeBuilding', buildingId: building.id }) : null;
    const level = building ? inspectBuilding(state, building.id).upgradeLevel : 0;
    const cost = building ? state.mechanics!.config.upgradeCosts[level] : undefined;
    add({
        id: 'upgrade-home', chapter: 'home', title: 'Plan for a larger future',
        why: 'An upgrade changes the building’s matching-work bonus and annual upkeep. It is not another initial house.',
        detail: building && cost !== undefined ?
            `Next upgrade: ${cost} Materials. Occupied upkeep ${inspectBuilding(state, building.id).upkeep} → ${state.mechanics!.config.baseUpkeep + level + 1} Materials/year.
            Open the existing preview for matching residents’ productivity. This can wait.` :
            'Review a permanent home’s actual upgrade preview when one is available. This can wait.',
        checklist: [
            { id: 'upgrade', label: 'Upgrade a permanent home',
                done: !!index.events.upgrade || homes.some(home => inspectBuilding(state, home.id).upgradeLevel > 0),
                action: 'improvements' },
        ],
        action: 'improvements',
    }, !!index.events.upgrade || homes.some(home => inspectBuilding(state, home.id).upgradeLevel > 0),
    !building ? 'A permanent home is needed.' : upgrade && !upgrade.allowed && !level ? upgrade.reason : '');
    const salvageAmount = state.landing?.config.longshipSalvage;
    add({
        id: 'longship-choice', chapter: 'home', title: 'A ship, or Materials now?',
        why: 'Keeping the Longship preserves sea travel. Salvaging is irreversible; neither choice is required.',
        detail: shipState === 'salvaged' ? 'Your Longship was salvaged. Its Materials were credited by the actual decision; exploration continues on foot.' :
            shipState === 'not present' ? 'No Longship is present in this save. No sailing objective is required.' :
            `Longship ${shipAway ? 'away with an expedition' : 'retained'}.
            ${salvageAmount === undefined ? '' : `Salvage offers ${salvageAmount} Materials under this campaign’s rules.`}
            Keep for now leaves sea travel available. You can reconsider salvage later.`,
        checklist: [
            { id: 'choice', label: 'Choose to keep or salvage the Longship',
                done: !!index.events.salvaged || !!salvaged || !!index.events.kept ||
                    !!retained && journey.keptShipId === retained.id, action: 'ship' },
        ],
        action: 'ship',
    }, !!index.events.salvaged || !!salvaged || !!index.events.kept ||
        !!retained && journey.keptShipId === retained.id,
    shipState === 'not present' ? 'You can set this unavailable choice aside.' : '');
    const prepared = Object.values(state.world?.spatial?.missions ?? {}).find(mission =>
        mission.groupId === group?.id && mission.status === 'Prepared');
    let expeditionReason = '';
    if (!state.discovery || !state.world) expeditionReason = 'Physical exploration is not enabled in this save.';
    else if (!group) expeditionReason = 'Create a group using eligible residents; they will be absent from settlement work while away.';
    else if (session && !prepared) {
        try { session.startExpeditionOffer(group.id); }
        catch (error) { expeditionReason = error instanceof Error ? error.message : String(error); }
    }
    add({
        id: 'prepare-expedition', chapter: 'discovery', title: 'Prepare people for a journey',
        why: 'A real group spends Food and leaves work behind. Reserve supplies for a safe return.',
        detail: `${group ? group.name + ': ' + group.memberIds.length + ' selected people.' : 'No Expedition Group yet.'}
            ${prepared ? 'Supplies are packed. Choose a valid destination or board your retained ship.' : 'Review the current Explore offer before packing or departing.'} A new clan’s 15 Food cannot fund a normal two-person 16 Food pack.
            Choose a smaller eligible group or build up Food through ordinary work.`,
        checklist: [
            { id: 'group', label: 'Create an Expedition Group with members',
                done: !!index.events.explore || !!group?.memberIds.length, action: 'expeditions' },
            { id: 'supplies', label: 'Pack the group’s real Food supplies',
                done: !!index.events.explore || !!prepared, action: 'expeditions' },
            { id: 'depart', label: 'Depart to explore on foot or aboard the Longship',
                done: !!index.events.explore, action: 'expeditions' },
        ],
        action: 'expeditions',
    }, !!index.events.explore, expeditionReason);
    const seen = [...index.species.keys()].map(id => wildlifeSpecies.find(species => species.id === id)!.label);
    add({
        id: 'wildlife-species', chapter: 'discovery', title: 'Witness three wild species',
        why: 'Discoveries belong to actual expedition witnesses, not the camera. Livestock do not count.',
        detail: 'Multiple groups and earlier sightings count. Explore beyond familiar ground; recorded witnesses remain in the Clan Book. This longer journey can wait.',
        checklist: ['first', 'second', 'third'].map((ordinal, i) => ({
            id: `species-${i + 1}`,
            label: seen[i] ? `Witnessed: ${seen[i]}` : `Witness a ${ordinal} distinct wild species`,
            done: !!seen[i],
            action: 'expeditions',
        })),
        action: 'wildlife',
    }, index.species.size >= 3, !state.wildlife ? 'Witnessed wildlife is not enabled in this save.' : '');
    add({
        id: 'find-neighbours', chapter: 'discovery', title: 'Find the neighbouring clan',
        why: 'Knowledge comes from exploration and reports. An unseen settlement stays unknown.',
        detail: sites.length ? 'Your clan has legitimately sighted a settlement. Review only its dated known-place record.' :
            'Explore beyond familiar ground. Your group must sight a settlement before you can review its known-place record.',
        checklist: [
            { id: 'settlement', label: 'Sight a neighbouring settlement through exploration',
                done: sites.length > 0, action: 'expeditions' },
        ],
        action: 'expeditions',
    }, sites.length > 0, !state.discovery ? 'Physical discovery is not enabled in this save.' : '');
    add({
        id: 'sea-travel', chapter: 'discovery', title: retained ? 'Try the sea route' : 'Continue on foot',
        why: 'A kept Longship offers mobility and carried supplies. Sailing is an optional branch.',
        detail: retained ? `Board a provisioned real group, choose a valid sea destination, then disembark on a safe shore.
            ${shipAway ? 'The Longship is currently away; use its existing group controls.' : ''}
            Boarding, sailing and landing are recorded separately. No reachable shore is guaranteed.` :
            `The Longship is ${shipState}. Use ordinary on-foot routes and reserve supplies for the return.
            You may set the sailing demonstration aside.`,
        checklist: retained || index.events.seaTrip ? [
            { id: 'embark', label: 'Board the Longship with a provisioned group',
                done: !!index.events.embarked || !!index.events.seaTrip, action: 'expeditions' },
            { id: 'sail', label: 'Choose a valid sea destination',
                done: !!index.events.sailed || !!index.events.seaTrip, action: 'expeditions' },
            { id: 'land', label: 'Sail, then disembark on a safe shore',
                done: !!index.events.seaTrip, action: 'expeditions' },
        ] : [],
        action: 'expeditions', optional: true,
    }, !!index.events.seaTrip,
    !retained ? 'Sea travel is unavailable; on-foot exploration remains playable.' : '');
    add({
        id: 'recon', chapter: 'conflict', title: 'Learn before you risk people',
        why: 'Recon returns dated knowledge, not certainty. A failed reconnaissance still has a real consequence.',
        detail: index.events.reconResult ? 'A real Recon returned. Its existing report records what was learned or missed.' :
            index.events.reconStarted ? 'Recon is underway. Use Play for the real journey and review its return.' :
            'Choose a legitimately sighted site or a mapped Recon area. Show me reviews the exact route and current offer in the existing mission controls.',
        checklist: [
            { id: 'depart', label: 'Send a real Recon mission',
                done: !!index.events.reconStarted || !!index.events.reconResult, action: 'recon' },
            { id: 'return', label: 'Let Recon return with its actual report',
                done: !!index.events.reconResult, action: 'expeditions' },
        ],
        action: 'recon',
    }, !!index.events.reconResult, index.events.reconStarted && !index.events.reconResult ? '' : offerReason('Recon'),
    !!index.events.reconStarted && !index.events.reconResult);
    add({
        id: 'personal-gear', chapter: 'conflict', title: 'Prepare named raiders',
        why: 'Equip named people: a Wooden Spear supports their raid, and a shield protects its wearer.',
        detail: `${owned} supported items currently owned · ${assigned.length} named people equipped.
            ${smith ? smith.name + ' can craft through real stock targets and work.' : 'Review an eligible Smith work plan, then actual production targets.'}
            Wooden equipment uses Materials; a Leather-reinforced Shield also needs a Hide.
            Existing gear counts. Assign it to available named residents in Expedition groups.`,
        checklist: [
            { id: 'produce', label: 'Produce or obtain supported gear',
                done: owned > 0 || !!index.events.crafted || !!index.events.equipped || assigned.length > 0,
                action: 'smithery' },
            { id: 'equip', label: 'Assign gear to a named person in Expedition groups',
                done: !!index.events.equipped || assigned.length > 0, action: 'expeditions' },
        ],
        action: 'smithery',
    }, !!index.events.equipped || assigned.length > 0);
    add({
        id: 'pillage', chapter: 'conflict', title: 'Choose whether to raid',
        why: 'Review actual crew, equipment, provisions, risks and cargo priorities. Dispatch is entirely your decision.',
        detail: 'Use a known viable opportunity. Show me reviews the exact route, costs and eligibility. Taking People or livestock is never required. You may postpone all conflict.',
        checklist: [
            { id: 'dispatch', label: 'Choose to dispatch a Pillage mission',
                done: !!index.events.pillage, action: 'pillage' },
        ],
        action: 'pillage', optional: true,
    }, !!index.events.pillage, offerReason('Pillage'));
    add({
        id: 'mission-result', chapter: 'conflict', title: 'Understand what came home',
        why: 'Success, loss and legitimately empty loot all count as consequences. A lost raid is not a failed tutorial.',
        detail: result ? 'Open this real mission’s Activity Center report for success/failure, returned crew, casualties, loot and retained/lost gear.' :
            'When a voluntary Pillage returns, open its report to see what happened.',
        checklist: [
            { id: 'return', label: 'Let the voluntary raid resolve',
                done: !!result, action: 'expeditions' },
            { id: 'read', label: 'Open the returned raid’s Activity Center report',
                done: !!journey.resultEventId && !!result, action: 'report' },
        ],
        action: 'report', optional: true,
    }, !!journey.resultEventId && !!result, !result ? 'No returned Pillage report is available yet.' : '');
    return { goals, facts, journey, person: facts.person, home, familyHome, building, livestock, retained, shipState,
        smith, group, knownSite, result, species: [...index.species.entries()] };
}
