import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { fjordLivestockRules } from '../config/FjordLivestock';

/** Approved fresh Fjord start. Replay/restore use the selected save's own rules instead. */
export function newFjordScenario(seed: number, contextualSupportPrototype = false, tradeEnabled = true): GameplaySession {
    const session = new GameplaySession(seed, undefined, true, 'summer-800-v1', undefined,
        { player: fjordLivestockRules }, { enabled: true }, { enabled: contextualSupportPrototype },
        tradeEnabled ? { enabled: true } : undefined);
    useSeasonalFjordProduction(session);
    return session;
}

/** Only the live Fjord surface adopts the owner-approved timing correction. */
export function useSeasonalFjordProduction(session: GameplaySession): void {
    const state = session.readSnapshot();
    const clans = [state, ...Object.values(state.world?.targetClans ?? {})];
    if (clans.some(clan => clan.weather && clan.weather.productionTiming !== 'winter-quarter-v1'))
        session.command({ type: 'UseSeasonalWeatherProduction' });
}

/** Owner-approved Fjord adoption. Raw Core imports and research keep their original rules. */
export function useFjordCulturalOccasions(session: GameplaySession): void {
    const state = session.readSnapshot();
    if ([state, ...Object.values(state.world?.targetClans ?? {})].some(clan => !clan.culture))
        session.command({ type: 'UseCulturalOccasions' });
}
