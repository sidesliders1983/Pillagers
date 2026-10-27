import { GameplaySession } from '../gameplay-lab/GameplaySession';
import { fjordLivestockRules } from '../config/FjordLivestock';

/** Approved fresh Fjord start. Replay/restore use the selected save's own rules instead. */
export function newFjordScenario(seed: number, culturePrototype = false, tradePrototype = false): GameplaySession {
    return new GameplaySession(seed, undefined, true, 'summer-800-v1', undefined,
        { player: fjordLivestockRules }, culturePrototype ? { enabled: true } : undefined, undefined,
        tradePrototype ? { enabled: true } : undefined);
}
