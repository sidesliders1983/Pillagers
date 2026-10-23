import type { SoundManifest } from './FjordAudio';

/** Opt-in local mixed-scene review only. Audio bytes remain outside Git.
 * Autumn source correction, listening and publication remain open gates. */
export const settlementReviewPack: SoundManifest = {
    "assets": [
        {
            "id": "wind-spring",
            "path": "game-assets/audio/wind-spring-8e186307-82e9438d.wav",
            "seconds": 10,
            "channels": 2
        },
        {
            "id": "wind-summer",
            "path": "game-assets/audio/wind-summer-c2444dd9-82e9438d.wav",
            "seconds": 10,
            "channels": 2
        },
        {
            "id": "wind-normal-winter",
            "path": "game-assets/audio/wind-normal-winter-e778feae-82e9438d.wav",
            "seconds": 10,
            "channels": 2
        },
        {
            "id": "wind-harsh-winter",
            "path": "game-assets/audio/wind-harsh-winter-65f21e93-82e9438d.wav",
            "seconds": 10,
            "channels": 2
        },
        {
            "id": "sea-waves",
            "path": "game-assets/audio/sea-waves-b19277d2-82e9438d.wav",
            "seconds": 10,
            "channels": 1
        },
        {
            "id": "campfire",
            "path": "game-assets/audio/campfire-5971f130-82e9438d.wav",
            "seconds": 6,
            "channels": 1
        },
        {
            "id": "gull",
            "path": "game-assets/audio/gull-ef91c26d-82e9438d.wav",
            "seconds": 3.744,
            "channels": 1
        },
        {
            "id": "cow",
            "path": "game-assets/audio/cow-38d8c93b-82e9438d.wav",
            "seconds": 2.769,
            "channels": 1
        },
        {
            "id": "axe-a",
            "path": "game-assets/audio/axe-a-c305cdb2-82e9438d.wav",
            "seconds": 1.48,
            "channels": 1
        }
    ],
    "cues": [
        {
            "id": "wind-spring",
            "bus": "ambience",
            "variants": [
                "wind-spring"
            ],
            "gain": 0.28,
            "loop": true,
            "cooldown": [
                0,
                0
            ],
            "range": 0,
            "priority": 0,
            "limit": 1,
            "pitch": [
                1,
                1
            ],
            "loopStart": 0,
            "loopEnd": 10
        },
        {
            "id": "wind-summer",
            "bus": "ambience",
            "variants": [
                "wind-summer"
            ],
            "gain": 0.25,
            "loop": true,
            "cooldown": [
                0,
                0
            ],
            "range": 0,
            "priority": 0,
            "limit": 1,
            "pitch": [
                1,
                1
            ],
            "loopStart": 0,
            "loopEnd": 10
        },
        {
            "id": "wind-normal-winter",
            "bus": "ambience",
            "variants": [
                "wind-normal-winter"
            ],
            "gain": 0.28,
            "loop": true,
            "cooldown": [
                0,
                0
            ],
            "range": 0,
            "priority": 0,
            "limit": 1,
            "pitch": [
                1,
                1
            ],
            "loopStart": 0,
            "loopEnd": 10
        },
        {
            "id": "wind-harsh-winter",
            "bus": "ambience",
            "variants": [
                "wind-harsh-winter"
            ],
            "gain": 0.3,
            "loop": true,
            "cooldown": [
                0,
                0
            ],
            "range": 0,
            "priority": 0,
            "limit": 1,
            "pitch": [
                1,
                1
            ],
            "loopStart": 0,
            "loopEnd": 10
        },
        {
            "id": "sea-waves",
            "bus": "ambience",
            "variants": [
                "sea-waves"
            ],
            "gain": 0.2,
            "loop": false,
            "cooldown": [
                40,
                75
            ],
            "range": 70,
            "priority": 1,
            "limit": 1,
            "pitch": [
                1,
                1
            ]
        },
        {
            "id": "campfire",
            "bus": "world",
            "variants": [
                "campfire"
            ],
            "gain": 0.35,
            "loop": false,
            "cooldown": [
                30,
                60
            ],
            "range": 25,
            "priority": 1,
            "limit": 1,
            "pitch": [
                1,
                1
            ]
        },
        {
            "id": "gull",
            "bus": "world",
            "variants": [
                "gull"
            ],
            "gain": 0.55,
            "loop": false,
            "cooldown": [
                35,
                75
            ],
            "range": 60,
            "priority": 1,
            "limit": 1,
            "pitch": [
                1,
                1
            ]
        },
        {
            "id": "cow",
            "bus": "world",
            "variants": [
                "cow"
            ],
            "gain": 0.6,
            "loop": false,
            "cooldown": [
                35,
                75
            ],
            "range": 45,
            "priority": 1,
            "limit": 1,
            "pitch": [
                1,
                1
            ]
        },
        {
            "id": "axe-impact",
            "bus": "world",
            "variants": [
                "axe-a"
            ],
            "gain": 0.6,
            "loop": false,
            "cooldown": [
                0.35,
                0.8
            ],
            "range": 25,
            "priority": 1,
            "limit": 1,
            "pitch": [
                1,
                1
            ],
            "contactOffset": 0.0005416666666666666
        }
    ]
};
