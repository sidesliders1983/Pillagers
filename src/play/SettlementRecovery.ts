import { activeSettlementKey, inspectSettlementSave, localSettlementText } from './SharedSettlement';
import type { SettlementRestoreMetadata } from './SharedSettlement';
import { sharedCampaignKey, fjordCampaignKey } from '../fjord-play/FjordCampaign';

export const resumeCheckpointKey = 'fjordside.resume-checkpoint.v1';
type ReadStorage = (key: string) => string | null;
export interface RecoveryCandidate {
    source: string;
    text: string;
    metadata: SettlementRestoreMetadata;
}
export interface RecoverySources {
    active: string | null;
    candidates: RecoveryCandidate[];
    damaged: { source: string; text: string }[];
    warnings: string[];
    requiresChoice: boolean;
}
/** Reads only: neither probing a candidate nor rejecting it can replace a save. */
export function readRecoverySources(readSession: ReadStorage, readLocal: ReadStorage): RecoverySources {
    const result: RecoverySources = { active: null, candidates: [], damaged: [], warnings: [], requiresChoice: false };
    const read = (storage: ReadStorage, key: string) => {
        try { return storage(key); }
        catch {
            if (!result.warnings.includes('Browser storage is unavailable.'))
                result.warnings.push('Browser storage is unavailable.');
            return null;
        }
    };
    const inspect = (source: string, text: string | null) => {
        if (!text) return false;
        try {
            const metadata = inspectSettlementSave(text);
            if (!result.candidates.some(candidate => candidate.text === text))
                result.candidates.push({ source, text, metadata });
            return true;
        } catch {
            result.damaged.push({ source, text });
            return false;
        }
    };
    const active = read(readSession, activeSettlementKey);
    if (inspect('Active session', active)) { result.active = active; return result; }
    inspect('Last resume checkpoint', read(readLocal, resumeCheckpointKey));
    const canonical = read(readLocal, sharedCampaignKey);
    const sidecar = read(readLocal, fjordCampaignKey);
    if (canonical) {
        try {
            inspect('Local save', localSettlementText({ getItem: key => key === sharedCampaignKey ? canonical : sidecar }));
        } catch {
            inspect('Local campaign data only', canonical);
            if (sidecar) result.damaged.push({ source: 'Local Fjord sidecar', text: sidecar });
        }
        inspect('Local campaign data only', canonical);
    } else inspect('Local Fjord save', sidecar);
    result.requiresChoice = !result.active && !!(result.candidates.length || result.damaged.length || result.warnings.length);
    return result;
}
