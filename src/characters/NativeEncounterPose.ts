/** Presentation of one already recorded action, sampled only against the known canonical clock. */
export interface NativeEncounterPoseRequest {
    key: string;
    action: 'ready' | 'spear' | 'strike' | 'shield' | 'brace' | 'withdraw' | 'death';
    startedAt: number;
    durationTicks: number;
    tick: number;
    hasSpear: boolean;
    hasShield: boolean;
}

export function nativeEncounterPhase(request: NativeEncounterPoseRequest): number {
    if (!request.key || !Number.isFinite(request.tick) || !Number.isFinite(request.startedAt) ||
        !Number.isFinite(request.durationTicks) || request.durationTicks <= 0)
        throw new Error('Invalid native encounter presentation sample');
    return Math.max(0, Math.min(1, (request.tick - request.startedAt) / request.durationTicks));
}
