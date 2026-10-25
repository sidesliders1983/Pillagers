import type { SoundManifest } from './FjordAudio';
import { publishedSoundPack } from './PublishedSoundPack';
import { settlementReviewPack } from './SettlementSoundPack';

/** The accepted game mix; playback still requires explicit user activation. */
export const approvedSoundPack: SoundManifest = publishedSoundPack;

/** Self-authored signal fixtures for mechanics, never passed off as recorded ambience. */
export const proofSoundPack: SoundManifest = {
    assets: [
        { id: 'qa-noise', proof: 'noise', seconds: 2, channels: 2 },
        { id: 'qa-low', proof: 'tone', seconds: .45, channels: 1, frequency: 440 },
        { id: 'qa-high', proof: 'tone', seconds: .35, channels: 1, frequency: 660 },
    ],
    cues: [
        { id: 'qa-bed', bus: 'ambience', variants: ['qa-noise'], gain: .5, loop: true,
            cooldown: [0, 0], range: 0, priority: 0, limit: 1, pitch: [1, 1] },
        { id: 'qa-local', bus: 'world', variants: ['qa-low', 'qa-high'], gain: .9, loop: false,
            cooldown: [3, 5], range: 45, priority: 1, limit: 2, pitch: [1, 1] },
    ],
};

/** Shared by settings and scene creation so a normal URL cannot select an empty QA path. */
export function selectFjordSoundPack(search: string): {
    mode: 'game' | 'proof' | 'review'; manifest: SoundManifest;
} {
    const query = new URLSearchParams(search);
    if (query.get('audioProof') === '1') return { mode: 'proof', manifest: proofSoundPack };
    if (query.get('audioMix') === '1') return { mode: 'review', manifest: settlementReviewPack };
    return { mode: 'game', manifest: approvedSoundPack };
}
