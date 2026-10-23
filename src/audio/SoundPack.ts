import type { SoundManifest } from './FjordAudio';

/** #229 installs reviewed runtime assets here; missing production cues remain silent. */
export const approvedSoundPack: SoundManifest = { assets: [], cues: [] };

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
