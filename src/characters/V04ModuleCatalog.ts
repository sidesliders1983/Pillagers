import type { CharacterAsset } from './CharacterAssets';
/** Exact source identity shared by Lab and the new-only module compatibility gate. */
export const v04BodyIdentity=Object.freeze({
    id:'lab-body/golden-v04-candidate-002-r3',
    sha256:'8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e',
});
/** Only genuine reviewed v0.4 sources are added here. Legacy assets are never fallback candidates. */
export const v04CharacterModules:readonly CharacterAsset[]=[
    {
        "id": "equipment/v04-sword",
        "type": "equipment",
        "version": 1,
        "style": "v04-sword",
        "scope": "lab-v04",
        "reviewStatus": "accepted",
        "compatibleBodies": [
            {
                "id": "lab-body/golden-v04-candidate-002-r3",
                "sha256": "8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e"
            }
        ],
        "lods": {
            "2": "/character-lab/modules/v04/equipment/sword/sword.glb"
        },
        "runtimeLOD": 2,
        "metadata": {
            "version": "pillagers-fit/0.1",
            "id": "equipment/v04-sword",
            "type": "equipment",
            "anchor": "socket_hand_R",
            "fitMode": "rigid",
            "clearance": 0.006,
            "authoringFrame": "canonical",
            "equipmentBindings": {
                "grip": {
                    "position": [
                        0,
                        -0.04,
                        0
                    ],
                    "quaternion": [
                        0,
                        0,
                        0,
                        1
                    ]
                },
                "sockets": {
                    "socket_hand_R": {
                        "position": [
                            0.04,
                            -0.045,
                            0
                        ],
                        "quaternion": [
                            0,
                            0,
                            0.8134155047893737,
                            0.5816830894638835
                        ]
                    },
                    "socket_hand_L": {
                        "position": [
                            -0.04,
                            -0.045,
                            0
                        ],
                        "quaternion": [
                            0,
                            0,
                            -0.8134155047893737,
                            0.5816830894638835
                        ]
                    },
                    "socket_hip_L": {
                        "position": [
                            0.08,
                            0.025,
                            0.07
                        ],
                        "quaternion": [
                            0,
                            0,
                            0.955336489125606,
                            -0.29552020666133955
                        ]
                    },
                    "socket_hip_R": {
                        "position": [
                            -0.08,
                            0.025,
                            0.1
                        ],
                        "quaternion": [
                            0,
                            0,
                            0.9800665778412416,
                            0.19866933079506124
                        ]
                    },
                    "socket_back": {
                        "position": [
                            0,
                            0.05,
                            -0.065
                        ],
                        "quaternion": [
                            0,
                            0,
                            1,
                            6.123233995736766e-17
                        ]
                    }
                },
                "proportions": {
                    "bodyCore": "hand_R",
                    "referenceRadius": 0.07847847822748248,
                    "sourceSHA256": "8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e"
                }
            }
        },
        "materialVariants": [
            "flat-item-palette"
        ],
        "tags": [
            "image-to-3d",
            "v04-prototype-accepted",
            "source-2d-reviewed",
            "rigid-canonical-grip"
        ],
        "budgets": {
            "triangles": {
                "2": 800
            },
            "materials": 1,
            "runtimeTriangles": 800
        }
    },
    {
        "id": "hair/v04-bun",
        "type": "hair",
        "version": 1,
        "style": "v04-bun",
        "scope": "lab-v04",
        "reviewStatus": "preview",
        "compatibleBodies": [
            {
                "id": "lab-body/golden-v04-candidate-002-r3",
                "sha256": "8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e"
            }
        ],
        "lods": {
            "2": "/character-lab/modules/v04/hair/bun/bun.glb"
        },
        "runtimeLOD": 2,
        "metadata": {
            "version": "pillagers-fit/0.1",
            "id": "hair/v04-bun",
            "type": "hair",
            "anchor": "socket_head_top",
            "fitCage": "HEAD_CAGE",
            "fitMode": "conform",
            "clearance": 0.004,
            "authoringFrame": "canonical",
            "sourceStyle": "v04-bun",
            "canonicalHeadSize": [
                0.15981943905353546,
                0.23388516902923584,
                0.1831979900598526
            ],
            "attachmentBand": {
                "minimumY": -0.45
            },
            "projection": "outward",
            "subdivisions": 0
        },
        "materialVariants": [
            "profile-hair-colour"
        ],
        "tags": [
            "image-to-3d",
            "v04-preview-pending-independent-browser",
            "source-2d-reviewed",
            "canonical-measured-source-cavity",
            "canonical-actual-body-contact"
        ],
        "budgets": {
            "triangles": {
                "2": 1000
            },
            "materials": 1,
            "runtimeTriangles": 1000
        }
    },
    {
        "id": "hair/v04-short",
        "type": "hair",
        "version": 1,
        "style": "v04-short",
        "scope": "lab-v04",
        "reviewStatus": "preview",
        "compatibleBodies": [
            {
                "id": "lab-body/golden-v04-candidate-002-r3",
                "sha256": "8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e"
            }
        ],
        "lods": {
            "2": "/character-lab/modules/v04/hair/short/short.glb"
        },
        "runtimeLOD": 2,
        "metadata": {
            "version": "pillagers-fit/0.1",
            "id": "hair/v04-short",
            "type": "hair",
            "anchor": "socket_head_top",
            "fitCage": "HEAD_CAGE",
            "fitMode": "conform",
            "clearance": 0.004,
            "authoringFrame": "canonical",
            "sourceStyle": "v04-short",
            "canonicalHeadSize": [
                0.15981943905353546,
                0.23388516902923584,
                0.1831979900598526
            ],
            "attachmentBand": {
                "minimumY": -0.45
            },
            "projection": "outward",
            "subdivisions": 0
        },
        "materialVariants": [
            "profile-hair-colour"
        ],
        "tags": [
            "image-to-3d",
            "v04-preview-pending-independent-browser",
            "source-2d-reviewed",
            "canonical-measured-source-cavity",
            "canonical-actual-body-contact"
        ],
        "budgets": {
            "triangles": {
                "2": 1000
            },
            "materials": 1,
            "runtimeTriangles": 1000
        }
    }
];
