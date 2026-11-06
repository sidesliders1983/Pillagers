import type { GameTime, SimulationEvent, SimulationState } from './SimulationCore';
import { inspectCampfire } from './Campfire';
import { inspectWeather, personaWeatherExposure } from './Weather';
import { personaAway } from './WorldExpeditions';
import { personaAge } from './PersonaAge';
import { personaIdentity } from './Identity';

export type CommunityHearthTier = 0 | 1 | 2;
export type CommunityHearthPlacement = { x: number; z: number; rotation: number; worldId: string };
export type CommunityHearthCommand = { type: 'EnableCommunityHearth' } | {
    type: 'UpgradeCommunityHearth'; expectedTier: 0 | 1; quotedMaterials: number;
    placement: CommunityHearthPlacement;
};
export type CommunityHearthRisk = {
    personaId: string; naturalRiskBps: number; baselineWeatherExposureBps: number;
    heatedWeatherExposureBps: number; weatherExposureBps: number; mortalityRiskBps: number;
};
export type CommunityHearthAssessment = {
    eventId: string; time: GameTime; weatherWinter: number; heatReductionBps: number;
    risks: CommunityHearthRisk[]; supportEventId: string | null;
};
export type CommunityHearthState = {
    version: 1; rulesVersion: 'community-hearth-v1'; tier: CommunityHearthTier;
    enabledAt: GameTime; placement: CommunityHearthPlacement | null;
    coverage: { winter: number; observedTicks: number; heatedTicks: number; weightedReductionTicks: number };
    lastAssessment: CommunityHearthAssessment | null;
};
/** Experimental review values. Adoption is an explicit command, never a new-campaign default. */
export const communityHearthRules = {
    version: 'community-hearth-v1' as const,
    upgradeMaterials: [15, 30] as const,
    heatReductionBps: [1000, 2000, 3000] as const,
    venueMultiplierBps: [10000, 12500, 15000] as const,
    supportReductionCapBps: 10000,
};
const names = ['Campfire', 'Gathering Shelter', 'Clan Hall'] as const;
export const communityHearthTiers = names.map((name, tier) => ({ name,
    fullWinterHeatReductionBps: communityHearthRules.heatReductionBps[tier],
    venueMultiplierBps: communityHearthRules.venueMultiplierBps[tier],
})) as readonly { name: string; fullWinterHeatReductionBps: number; venueMultiplierBps: number }[];
const coldWindow = (state: SimulationState) => state.ticksPerWinter / 4;
const emptyCoverage = (winter: number) => ({ winter, observedTicks: 0, heatedTicks: 0, weightedReductionTicks: 0 });

export type CommunityHearthVenue = { rulesVersion: 'community-hearth-v1'; tier: CommunityHearthTier;
    multiplierBps: number; baseReductionBps: number; effectiveReductionBps: number };
export function communityHearthVenue(state: SimulationState): CommunityHearthVenue | null {
    if (!state.communityHearth || !state.culture) return null;
    const tier = state.communityHearth.tier;
    const multiplierBps = communityHearthRules.venueMultiplierBps[tier];
    const baseReductionBps = state.culture.config.exposureReductionBps;
    return { rulesVersion: communityHearthRules.version, tier, multiplierBps, baseReductionBps,
        effectiveReductionBps: Math.min(communityHearthRules.supportReductionCapBps,
            Math.floor(baseReductionBps * multiplierBps / 10000)) };
}
export function validateCommunityHearthVenue(value: unknown, tier: number, baseReductionBps: number): void {
    const venue = value as CommunityHearthVenue;
    const multiplierBps = communityHearthRules.venueMultiplierBps[tier];
    if (!venue || Object.keys(venue).sort().join(',') !==
        'baseReductionBps,effectiveReductionBps,multiplierBps,rulesVersion,tier' ||
        venue.rulesVersion !== communityHearthRules.version || venue.tier !== tier ||
        venue.multiplierBps !== multiplierBps || venue.baseReductionBps !== baseReductionBps ||
        venue.effectiveReductionBps !== Math.min(communityHearthRules.supportReductionCapBps,
            Math.floor(baseReductionBps * multiplierBps / 10000)))
        throw new Error('Invalid cultural Community Hearth venue receipt.');
}
export function inspectCommunityHearth(state: SimulationState) {
    const hearth = state.communityHearth;
    const tier = hearth?.tier ?? 0;
    const coverage = hearth?.coverage ?? emptyCoverage(state.time.winter);
    return {
        enabled: !!hearth, tier, name: names[tier], placement: hearth?.placement ? { ...hearth.placement } : null,
        nextTier: tier < 2 ? (tier + 1) as 1 | 2 : null,
        upgradeMaterials: tier < 2 ? communityHearthRules.upgradeMaterials[tier as 0 | 1] : null,
        fullWinterHeatReductionBps: communityHearthRules.heatReductionBps[tier],
        venueMultiplierBps: communityHearthRules.venueMultiplierBps[tier],
        ...inspectCampfire(state),
        coverage: { winter: coverage.winter, coldWindowTicks: coldWindow(state),
            observedTicks: coverage.observedTicks, heatedTicks: coverage.heatedTicks,
            effectiveHeatReductionBps: communityHearthHeatReduction(state) },
        affectedResidentIds: hearth && state.weather?.config.enabled ? Object.values(state.personas)
            .filter(person => person.deathWinter === null && !personaAway(state, person.id) &&
                personaWeatherExposure(state, person.id) > 0).map(person => person.id).sort() : [],
        lastAssessment: hearth?.lastAssessment ? structuredClone(hearth.lastAssessment) : null,
    };
}
function emit(state: SimulationState, type: string, details: Record<string, unknown>) {
    const event: SimulationEvent = { id: 'event-' + (state.events.length + 1), time: { ...state.time }, type,
        details: { rulesVersion: communityHearthRules.version, clanId: state.clan.id, ...details } };
    state.events.push(event);
    return event;
}
function requireLocal(state: SimulationState) {
    if (!state.mechanics || state.entityPrefix) throw new Error('Community Hearth requires the local player settlement.');
}
function validPlacement(value: CommunityHearthPlacement | null): value is CommunityHearthPlacement {
    return !!value && Object.keys(value).sort().join(',') === 'rotation,worldId,x,z' &&
        [value.x, value.z, value.rotation].every(Number.isFinite) &&
        Math.abs(value.x) <= 100000 && Math.abs(value.z) <= 100000 &&
        Math.abs(value.rotation) <= Math.PI * 2 && typeof value.worldId === 'string' &&
        value.worldId.trim().length > 0 && value.worldId.length <= 256;
}
export function applyCommunityHearthCommand(state: SimulationState, command: CommunityHearthCommand): void {
    requireLocal(state);
    if (command.type === 'EnableCommunityHearth') {
        if (state.communityHearth) return;
        state.communityHearth = { version: 1, rulesVersion: communityHearthRules.version, tier: 0,
            enabledAt: { ...state.time }, placement: null, coverage: emptyCoverage(state.time.winter), lastAssessment: null };
        emit(state, 'CommunityHearthEnabled', { campfire: inspectCampfire(state) });
        return;
    }
    const hearth = state.communityHearth;
    if (!hearth) throw new Error('Enable the experimental Community Hearth first.');
    if (![0, 1].includes(command.expectedTier) || command.expectedTier !== hearth.tier)
        throw new Error('The Community Hearth tier changed or already reached its maximum.');
    const cost = communityHearthRules.upgradeMaterials[command.expectedTier];
    if (command.quotedMaterials !== cost) throw new Error('The Community Hearth quote changed.');
    if (!validPlacement(command.placement) || hearth.placement &&
        JSON.stringify(command.placement) !== JSON.stringify(hearth.placement))
        throw new Error('The Community Hearth placement must remain fixed.');
    if (state.stocks.materials < cost) throw new Error('Not enough Materials for the Community Hearth upgrade.');
    state.stocks.materials -= cost;
    const previousTier = hearth.tier;
    hearth.tier = (hearth.tier + 1) as CommunityHearthTier;
    hearth.placement = { ...command.placement };
    emit(state, 'CommunityHearthUpgraded', { previousTier, tier: hearth.tier, cost, placement: { ...hearth.placement } });
}
/** Called once for the tick which actually burned paid fuel, before advancing the calendar. */
export function stepCommunityHearth(state: SimulationState, burned: boolean): void {
    const hearth = state.communityHearth;
    if (!hearth) return;
    if (hearth.coverage.winter !== state.time.winter) hearth.coverage = emptyCoverage(state.time.winter);
    if (state.time.tick >= coldWindow(state)) return;
    hearth.coverage.observedTicks++;
    if (burned) {
        hearth.coverage.heatedTicks++;
        hearth.coverage.weightedReductionTicks += communityHearthRules.heatReductionBps[hearth.tier];
    }
}
export function resetCommunityHearthWinter(state: SimulationState): void {
    if (state.communityHearth) state.communityHearth.coverage = emptyCoverage(state.time.winter);
}
export function communityHearthHeatReduction(state: SimulationState): number {
    const coverage = state.communityHearth?.coverage;
    const weather = inspectWeather(state);
    return coverage && weather.enabled && coverage.winter === weather.winter ?
        Math.floor(coverage.weightedReductionTicks / coldWindow(state)) : 0;
}
export function recordCommunityHearthAssessment(state: SimulationState, risks: CommunityHearthRisk[],
    supportEventId: string | null): void {
    const hearth = state.communityHearth;
    if (!hearth) return;
    const weather = inspectWeather(state);
    const details = { weatherEnabled: weather.enabled, weatherClass: weather.class, regionId: weather.regionId,
        weatherWinter: hearth.coverage.winter,
        heatReductionBps: communityHearthHeatReduction(state), coverage: { ...hearth.coverage },
        risks: risks.filter(risk => risk.baselineWeatherExposureBps > 0), supportEventId };
    const event = emit(state, 'CommunityHearthAssessed', details);
    hearth.lastAssessment = { eventId: event.id, time: { ...state.time }, weatherWinter: details.weatherWinter,
        heatReductionBps: details.heatReductionBps, risks: structuredClone(details.risks), supportEventId };
}
export function isCommunityHearthEvent(event: SimulationEvent): boolean {
    return ['CommunityHearthEnabled', 'CommunityHearthUpgraded', 'CommunityHearthAssessed'].includes(event.type);
}
export function validateCommunityHearth(state: SimulationState, events: readonly SimulationEvent[]): void {
    const hearth = state.communityHearth;
    const fail = (): never => { throw new Error('Invalid Community Hearth save or history.'); };
    if (hearth === undefined) { if (events.some(isCommunityHearthEvent)) fail(); return; }
    requireLocal(state);
    if (!hearth || hearth.version !== 1 || hearth.rulesVersion !== communityHearthRules.version ||
        Object.keys(hearth).sort().join(',') !== 'coverage,enabledAt,lastAssessment,placement,rulesVersion,tier,version' ||
        ![0, 1, 2].includes(hearth.tier) || (hearth.tier === 0 ? hearth.placement !== null : !validPlacement(hearth.placement))) fail();
    let tier: CommunityHearthTier = 0, enabled = false, lit = false, fuel = 0, lastTick = 0;
    let placement: CommunityHearthPlacement | null = null;
    let coverage = emptyCoverage(hearth.enabledAt?.winter);
    let latest: CommunityHearthAssessment | null = null;
    const overlap = (start: number, end: number, windowStart: number, windowEnd: number) =>
        Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
    // Save validation replays the compact fire/site events once. Runtime ticks never scan history.
    const advance = (now: number) => {
        const burningTicks = lit ? Math.min(fuel, now - lastTick) : 0;
        if (enabled) {
            const start = coverage.winter * state.ticksPerWinter;
            if (now > start + state.ticksPerWinter) fail();
            coverage.observedTicks += overlap(lastTick, now, start, start + coldWindow(state));
            const heated = overlap(lastTick, lastTick + burningTicks, start, start + coldWindow(state));
            coverage.heatedTicks += heated;
            coverage.weightedReductionTicks += heated * communityHearthRules.heatReductionBps[tier];
        }
        fuel -= burningTicks;
        lastTick = now;
    };
    const sourceEvent = (id: unknown) => {
        if (typeof id !== 'string' || !/^event-[1-9][0-9]*$/.test(id)) return undefined;
        const source = state.events[Number(id.slice(6)) - 1];
        return source?.id === id ? source : undefined;
    };
    for (const event of events) {
        // Earlier imports did not require fire receipts; freeze the valid live state at adoption.
        if (!enabled && !isCommunityHearthEvent(event)) continue;
        advance(event.time.winter * state.ticksPerWinter + event.time.tick);
        const details = event.details!;
        if (event.type === 'CampfireFuelConsumed') {
            if (details?.units !== 1 || details.fuelTicks !== state.ticksPerWinter) fail();
            fuel = state.ticksPerWinter;
            continue;
        }
        if (event.type === 'CampfireChanged') {
            if (typeof details?.lit !== 'boolean') fail();
            lit = details.lit as boolean;
            continue;
        }
        if (!details || details.rulesVersion !== communityHearthRules.version || details.clanId !== state.clan.id) fail();
        if (event.type === 'CommunityHearthEnabled') {
            if (enabled || JSON.stringify(event.time) !== JSON.stringify(hearth.enabledAt)) fail();
            const fire = details.campfire as { lit: boolean; fuelTicks: number } | null;
            if (!fire || Object.keys(fire).sort().join(',') !== 'fuelTicks,lit' ||
                typeof fire.lit !== 'boolean' || !Number.isSafeInteger(fire.fuelTicks) ||
                fire.fuelTicks < 0 || fire.fuelTicks > state.ticksPerWinter) fail();
            lit = fire!.lit;
            fuel = fire!.fuelTicks;
            enabled = true;
            coverage = emptyCoverage(event.time.winter);
        } else if (event.type === 'CommunityHearthUpgraded') {
            if (!enabled || tier >= 2 || details.previousTier !== tier || details.tier !== tier + 1 ||
                details.cost !== communityHearthRules.upgradeMaterials[tier as 0 | 1] ||
                !validPlacement(details.placement as CommunityHearthPlacement) ||
                placement && JSON.stringify(placement) !== JSON.stringify(details.placement)) fail();
            placement = details.placement as CommunityHearthPlacement;
            tier = (tier + 1) as CommunityHearthTier;
        } else if (event.type === 'CommunityHearthAssessed') {
            const heat = state.weather?.config.enabled ? Math.floor(coverage.weightedReductionTicks / coldWindow(state)) : 0;
            if (!enabled || event.time.tick !== 0 || event.time.winter !== coverage.winter + 1 ||
                details.weatherWinter !== coverage.winter || details.weatherEnabled !== (state.weather?.config.enabled ?? false) ||
                details.heatReductionBps !== heat || JSON.stringify(details.coverage) !== JSON.stringify(coverage) ||
                !Array.isArray(details.risks)) fail();
            const profile = details.weatherEnabled ? state.weather?.config.profiles[details.weatherClass as import('./Weather').WeatherClass] : null;
            if (details.weatherEnabled && (!profile || details.regionId !== state.landing?.region.id)) fail();
            const support = details.supportEventId === null ? null : sourceEvent(details.supportEventId);
            if (support && (support.type !== 'CultureWeatherSupportApplied' ||
                JSON.stringify(support.time) !== JSON.stringify(event.time) ||
                Number(support.id.slice(6)) >= Number(event.id.slice(6))) || details.supportEventId !== null && !support) fail();
            const ids: string[] = [];
            for (const row of details.risks as CommunityHearthRisk[]) {
                if (!row || !personaIdentity(state, row.personaId) || !profile || profile.tentMortalityBps <= 0) fail();
                const age = personaAge(state, row.personaId, event.time);
                const natural = [...state.mechanics!.config.mortalityBands].reverse().find(band => band.minAge <= age)?.chanceBps ?? 0;
                const baseExposure = profile!.tentMortalityBps;
                const heated = baseExposure - Math.floor(baseExposure * heat / 10000);
                const supportRow = (support?.details?.riskInputs as CommunityHearthRisk[] | undefined)?.find(risk => risk.personaId === row.personaId);
                const final = supportRow?.weatherExposureBps ?? heated;
                if (row.naturalRiskBps !== natural || row.baselineWeatherExposureBps !== baseExposure ||
                    row.heatedWeatherExposureBps !== heated || row.weatherExposureBps !== final ||
                    row.mortalityRiskBps !== Math.min(10000, natural + final) ||
                    supportRow && (supportRow.baselineWeatherExposureBps !== row.baselineWeatherExposureBps ||
                        supportRow.heatedWeatherExposureBps !== heated)) fail();
                ids.push(row.personaId);
            }
            if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify([...ids].sort())) fail();
            latest = { eventId: event.id, time: { ...event.time }, weatherWinter: coverage.winter,
                heatReductionBps: heat, risks: structuredClone(details.risks) as CommunityHearthRisk[],
                supportEventId: details.supportEventId as string | null };
            coverage = emptyCoverage(event.time.winter);
        }
    }
    advance(state.time.winter * state.ticksPerWinter + state.time.tick);
    const fire = inspectCampfire(state);
    if (!enabled || fire.lit !== lit || fire.fuelTicks !== fuel || tier !== hearth.tier || JSON.stringify(placement) !== JSON.stringify(hearth.placement) ||
        JSON.stringify(coverage) !== JSON.stringify(hearth.coverage) || JSON.stringify(latest) !== JSON.stringify(hearth.lastAssessment)) fail();
}
