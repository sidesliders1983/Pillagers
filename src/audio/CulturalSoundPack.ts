import type { SoundManifest } from './FjordAudio';

/** Owner-accepted prototype pair; ordinary release remains independently gated. */
export const culturalSoundPack: SoundManifest = {
    "assets": [
        {
            "id": "culture-murmur",
            "path": "game-assets/audio/culture/culture-murmur-34a6bca1-c16e4c0b.wav",
            "seconds": 3,
            "channels": 1
        },
        {
            "id": "culture-applause",
            "path": "game-assets/audio/culture/culture-applause-8180c951-c16e4c0b.wav",
            "seconds": 2,
            "channels": 1
        }
    ],
    "cues": [
        {
            "id": "culture-murmur",
            "bus": "world",
            "variants": [
                "culture-murmur"
            ],
            "gain": 0.4,
            "loop": false,
            "cooldown": [
                0,
                0
            ],
            "range": 36,
            "priority": 2,
            "limit": 1,
            "pitch": [
                1,
                1
            ]
        },
        {
            "id": "culture-applause",
            "bus": "world",
            "variants": [
                "culture-applause"
            ],
            "gain": 0.4,
            "loop": false,
            "cooldown": [
                0,
                0
            ],
            "range": 36,
            "priority": 2,
            "limit": 1,
            "pitch": [
                1,
                1
            ]
        }
    ],
    "decodedBudget": {
        "assetIds": [
            "culture-murmur",
            "culture-applause"
        ],
        "maximumBytes": 2097152
    }
};

/** Compose optional culture audio without changing the accepted base release or its validators. */
export function withCulturalSoundPack(base: SoundManifest): SoundManifest {
    if (base.decodedBudget || culturalSoundPack.assets.some(asset => base.assets.some(existing => existing.id === asset.id)))
        throw new Error('The base sound pack already has cultural assets or a decoded-family budget.');
    return { assets: [...base.assets, ...culturalSoundPack.assets],
        cues: [...base.cues, ...culturalSoundPack.cues], decodedBudget: culturalSoundPack.decodedBudget };
}
