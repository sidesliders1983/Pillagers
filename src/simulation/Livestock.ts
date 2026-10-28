import {weatherProfile,weatherProductionModifiers,weatherFacts} from './Weather';
import {farmyards, livestockHerdSpace} from './Farmyards';
import type {SimulationState, GameTime} from './SimulationCore';
import type {Cattle} from './Landing';
import { livestockName, livestockIdentity } from './LivestockNames';
import { animalProfile, animalSpecies, livestockSpecies, livestockSexTerm } from './LivestockSpecies';
import { eventFacts } from './EventFacts';
import { slaughterHides } from './SpecialistStocks';
import { ageEligibleForBreeding, compatibleLivestockPartner, livestockBirthIntervalReady,
    livestockBirthSpaceReady, livestockFeedingBlocked } from './LivestockBreeding';
export function cattleSheltered(state:SimulationState,cattle:Cattle):boolean {return cattle.farmyardId!==null&&farmyards(state).some(f=>f.id===cattle.farmyardId);}
function emit(state: SimulationState, type: string, details: Record<string, unknown>): void {
    // Production and feeding already have source IDs and exact amounts. Do not repeat the
    // complete identity snapshot for every resource unit or for the entire herd each year.
    const routine = ['CattleFoodProduced', 'CattleFoodConsumed',
        'LivestockResourceProduced', 'LivestockFoodConsumed'].includes(type);
    const recorded = state.landing?.livestock && !routine ? eventFacts(state, details) : details;
    state.events.push({ id: `event-${state.events.length + 1}`, time: { ...state.time }, type, details: recorded });
}
export function cattleFoodNeed(state: SimulationState): number {
    if (!state.landing) return 0;
    const modifiers = weatherProfile(state);
    let need = 0;
    for (const animal of Object.values(state.landing.cattle)) {
        if (animal.deathWinter !== null) continue;
        const profile = animalProfile(state, animal);
        const adult = state.time.winter - animal.birthWinter >= profile.adultAge;
        // Older weather campaigns applied their multiplier only to adult feeding.
        need += adult ? profile.adultFood * (modifiers.cattleConsumptionBps === undefined ?
            modifiers.cattleConsumptionMultiplier : 1) : profile.youngFood;
    }
    return modifiers.cattleConsumptionBps === undefined ? need :
        Math.ceil(need * modifiers.cattleConsumptionBps / 10000);
}
export function stepCattleOutput(state: SimulationState): void {
    const landing = state.landing;
    if (!landing) return;
    const winter = state.time.tick === 0 ? state.time.winter - 1 : state.time.winter;
    const shelteredIds = new Set(farmyards(state).map(yard => yard.id));
    const workedTick = (state.time.tick + state.ticksPerWinter - 1) % state.ticksPerWinter;
    const weather = weatherProductionModifiers(state, workedTick), scale = state.ticksPerWinter * 10000;
    for (const id of Object.keys(landing.cattle).sort()) {
        const animal = landing.cattle[id];
        if (animal.deathWinter !== null) continue;
        const profile = animalProfile(state, animal);
        if (winter - animal.birthWinter < profile.adultAge) continue;
        const sheltered = animal.farmyardId !== null && shelteredIds.has(animal.farmyardId);
        for (const resource of ['food', 'materials'] as const) {
            const rate = resource === 'food' ?
                (animal.sex === 'female' ? profile.femaleFoodPerWinter : profile.maleFoodPerWinter) :
                (animal.sex === 'female' ? profile.femaleMaterialsPerWinter : profile.maleMaterialsPerWinter);
            if (rate === 0) continue;
            const progress = resource === 'food' ? 'foodProgress' : 'materialsProgress';
            const weatherBps = resource === 'food' ? weather.foodProductionBps :
                (weather.materialsProductionBps ?? 10000);
            const gain = rate * Math.floor((sheltered ? 10000 : profile.exposedProductivityBps) *
                weatherBps / 10000);
            animal[progress] = (animal[progress] ?? 0) + gain;
            const units = Math.floor(animal[progress] / scale);
            if (!units) continue;
            animal[progress] %= scale;
            state.stocks[resource] += units;
            if (animalSpecies(animal) === 'cattle' && resource === 'food')
                emit(state, 'CattleFoodProduced', { cattleId: id, units, sheltered, ...weatherFacts(state) });
            else emit(state, 'LivestockResourceProduced', {
                livestockId: id, resource, units, sheltered, ...weatherFacts(state),
            });
        }
    }
}
export function consumeCattleFood(state: SimulationState): void {
    if (!state.landing) return;
    const animals = Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null);
    const need = cattleFoodNeed(state), units = Math.min(need, state.stocks.food);
    state.stocks.food -= units;
    const ids = animals.map(animal => animal.id).sort();
    const mixed = animals.some(animal => animalSpecies(animal) !== 'cattle');
    emit(state, mixed ? 'LivestockFoodConsumed' : 'CattleFoodConsumed', {
        units, required: need, shortfall: need - units, ...weatherFacts(state),
        ...(mixed ? { livestockIds: ids } : { cattleIds: ids }),
    });
}
export function inspectCattle(state:SimulationState,id:string) {
    const cattle=state.landing?.cattle[id];if(!cattle)throw new Error('Unknown cattle');
    const age=(cattle.deathWinter??state.time.winter)-cattle.birthWinter;
    const profile = animalProfile(state, cattle), species = animalSpecies(cattle);
    const descriptor = livestockSpecies[species];
    const slaughterFood = age < profile.youngAdultAge ? profile.youngSlaughterFood :
        age < profile.adultAge ? profile.youngAdultSlaughterFood : profile.slaughterFood;
    return {...cattle,age,slaughterFood,slaughterHides:slaughterHides(state,cattle),name:livestockName(state,id),species,
        speciesName:descriptor.name,sexTerm:livestockSexTerm(species, cattle.sex, age, profile),
        stage:age<profile.youngAdultAge?'Young':age<profile.adultAge?'Young Adult':'Adult',sheltered:cattle.deathWinter===null&&cattleSheltered(state,cattle),overcrowding:(livestockHerdSpace(state,cattle)?.overcrowdingUnits??0)/10000,mortalityRiskBps:cattle.deathWinter===null?cattleMortalityRisk(state,cattle):0};
}

/** Historical animals remain inspectable without inventing their current age or status. */
export function inspectLivestock(state: SimulationState, id: string) {
    if (state.landing?.cattle[id]) return {
        ...inspectCattle(state, id), parentIds: [...state.landing.cattle[id].parentIds],
        historical: false as const, observedAt: null,
    };
    const animal = state.landing?.cattleArchive?.[id];
    if (!animal) throw new Error('Unknown livestock');
    const identity = livestockIdentity(state, id), profile = animalProfile(state, animal);
    let observedAt: GameTime | null = null;
    let recorded: ReturnType<typeof livestockIdentity> | undefined;
    for (let index = state.events.length - 1; index >= 0; index--) {
        const event = state.events[index], details = event.details;
        if (event.type !== 'SettlementPillaged' ||
            !Array.isArray(details?.cattleIds) || !details.cattleIds.includes(id)) continue;
        observedAt = { ...event.time };
        const facts = details.livestock as { version?: number;
            animals?: ReturnType<typeof livestockIdentity>[] } | undefined;
        const candidate = facts?.version === 1 && Array.isArray(facts.animals) ?
            facts.animals.find(record => record.id === id) : undefined;
        if (candidate && candidate.species === identity.species && candidate.sex === animal.sex &&
            candidate.birthWinter === animal.birthWinter && typeof candidate.name === 'string')
            recorded = candidate;
        break;
    }
    const winter = animal.deathWinter ?? observedAt?.winter;
    const age = winter === undefined ? null : winter - animal.birthWinter;
    const stage = age === null ? null : age < profile.youngAdultAge ? 'Young' :
        age < profile.adultAge ? 'Young Adult' : 'Adult';
    return {
        ...animal, ...identity, name: recorded?.name ?? identity.name, age,
        sexTerm: age === null ? identity.sexTerm : livestockSexTerm(identity.species, animal.sex, age, profile),
        stage: recorded && ['Young', 'Young Adult', 'Adult'].includes(recorded.stage) ? recorded.stage : stage,
        historical: true as const, observedAt,
        slaughterFood: null, slaughterHides: null, sheltered: null, overcrowding: null, mortalityRiskBps: null,
    };
}

export function resolveCattleBirths(state:SimulationState,chance:(bps:number)=>boolean):void {
    const landing = state.landing;
    if (!landing) return;
    if (livestockFeedingBlocked(state)) return;
    const winter = state.time.winter;
    const eligible = Object.values(landing.cattle).filter(animal => ageEligibleForBreeding(state, animal))
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const mother of eligible.filter(animal => animal.sex === 'female')) {
        const profile = animalProfile(state, mother), species = animalSpecies(mother);
        if (!livestockBirthIntervalReady(state, mother) || !livestockBirthSpaceReady(state, mother)) continue;
        const father = eligible.find(animal => compatibleLivestockPartner(mother, animal));
        if (!father || !chance(profile.birthChanceBps)) continue;
        const prefix = (state.entityPrefix ?? '') + (species === 'cattle' ? 'cattle-' : 'livestock-');
        let serial = Object.keys(landing.cattle).length + 1;
        while (landing.cattle[prefix + serial] || landing.cattleArchive?.[prefix + serial]) serial++;
        const young: Cattle = {
            id: prefix + serial, sex: chance(5000) ? 'female' : 'male', birthWinter: winter,
            deathWinter: null, parentIds: [mother.id, father.id], origin: 'reproduction',
            lastCalvingWinter: null, farmyardId: mother.farmyardId, foodProgress: 0,
            ...(mother.species !== undefined ? { species } : {}),
        };
        landing.cattle[young.id] = young;
        mother.lastCalvingWinter = winter;
        const identity = species === 'cattle' ? { cattleId: young.id } : { livestockId: young.id };
        emit(state, species === 'cattle' ? 'CattleBorn' : 'LivestockBorn', {
            ...identity, parentIds: [...young.parentIds], sex: young.sex, age: 0,
            farmyardId: young.farmyardId,
        });
    }
}

export function cattleMortalityRisk(state: SimulationState, animal: Cattle): number {
    const profile = animalProfile(state, animal), age = state.time.winter - animal.birthWinter;
    let base = 0;
    for (const band of profile.mortalityBands) {
        if (band.minAge > age) break;
        base = band.chanceBps;
    }
    const units = livestockHerdSpace(state, animal)?.overcrowdingUnits ?? 0;
    const crowdingRisk = Math.floor(units * profile.crowdingBps / 10000);
    return Math.min(10000, base + crowdingRisk + profile.weatherMortalityBps +
        (cattleSheltered(state, animal) ? 0 : weatherProfile(state).exposedCattleMortalityBps));
}
export function resolveCattleMortality(state: SimulationState, chance: (bps: number) => boolean): void {
    if (!state.landing) return;
    // Snapshot risks before removing animals: every herd member faces the same occupancy.
    const deaths = Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(animal => ({ animal, risk: cattleMortalityRisk(state, animal),
            sheltered: cattleSheltered(state, animal),
            weatherExposureBps: cattleSheltered(state, animal) ? 0 : weatherProfile(state).exposedCattleMortalityBps }))
        .filter(({ risk }) => chance(risk));
    for (const { animal, risk, sheltered, weatherExposureBps } of deaths) {
        const farmyardId = animal.farmyardId;
        animal.deathWinter = state.time.winter;
        animal.farmyardId = null;
        const cattle = animalSpecies(animal) === 'cattle';
        emit(state, cattle ? 'CattleDied' : 'LivestockDied', {
            ...(cattle ? { cattleId: animal.id } : { livestockId: animal.id }),
            parentIds: [...animal.parentIds], sex: animal.sex, age: state.time.winter - animal.birthWinter,
            farmyardId, mortalityRiskBps: risk,
            ...(state.weather?.config.enabled ? { sheltered, weatherExposureBps, ...weatherFacts(state) } : {}),
        });
    }
}
