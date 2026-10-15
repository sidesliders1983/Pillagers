/** Frozen measurements for the restored Lab clothing candidates. */
export const additionalOutfitMeasurements = {
    "/character-lab/candidates/meshy-additional-005/long-skirt.glb": {
        "sha256": "77f3957563e94b01211a8204e85621e2196a619380b7b1dd9d7719cfa259a1a0",
        "bytes": 2569216,
        "triangles": 17999,
        "materials": 1,
        "bounds": {
            "min": [
                -0.275390625,
                0.12442187500000007,
                -0.19919921875
            ],
            "max": [
                0.2790625,
                0.9561015625,
                0.13953125
            ]
        }
    },
    "/character-lab/candidates/meshy-additional-005/low-shoes.glb": {
        "sha256": "0bd55b3eeb8abadaecc1e9ab4d824a5beaee454833473524173e17b14d7c2e2c",
        "bytes": 5108840,
        "triangles": 55064,
        "materials": 1,
        "bounds": {
            "min": [
                -0.3060322403907776,
                -0.01029236987233162,
                -0.17632542550563812
            ],
            "max": [
                0.3060322403907776,
                0.19706207513809204,
                0.1845759004354477
            ]
        }
    },
    "/character-lab/candidates/meshy-additional-005/high-shoes.glb": {
        "sha256": "4b5250ee6b1a06b6f148a21f7428ea570632ab88f636c3a458d0904441d4d688",
        "bytes": 2718016,
        "triangles": 18904,
        "materials": 1,
        "bounds": {
            "min": [
                0.05564741152595301,
                -0.010546874999999983,
                -0.17648166989576414
            ],
            "max": [
                0.303498974025953,
                0.4857421875,
                0.18386989260423586
            ]
        }
    },
    "/character-lab/candidates/meshy-short-trousers-006/short-trousers.glb": {
        "sha256": "c37cfa685911390ff9ba0f9462c44c1331a686b388281573840b5012a98904f3",
        "bytes": 2443800,
        "triangles": 14266,
        "materials": 1,
        "bounds": {
            "min": [
                -0.19347655773162842,
                0.5977063179016113,
                -0.1131865456700325
            ],
            "max": [
                0.1902785450220108,
                0.9414219856262207,
                0.10899987816810608
            ]
        }
    }
};
export const additionalOutfitRecords = [
    {
        "id": "garment/meshy-long-skirt-005",
        "label": "Long woven skirt",
        "path": "/character-lab/candidates/meshy-additional-005/long-skirt.glb",
        "bindingPath": "/character-lab/candidates/meshy-additional-005/long-skirt.binding.json",
        "bindingSha256": "851d86cb3e3aa37b1bdc499bca1e86254d7d277129ecac04266f85878885fb7c",
        "slot": "lower",
        "triangles": 17999,
        "materials": 1
    },
    {
        "id": "garment/meshy-low-shoes-005",
        "label": "Low leather shoes",
        "path": "/character-lab/candidates/meshy-additional-005/low-shoes.glb",
        "bindingPath": "/character-lab/candidates/meshy-additional-005/low-shoes.binding.json",
        "bindingSha256": "ad27c923a926d59c8c1de43649129749e7856108d45cf440bb31eed35d5ded97",
        "slot": "footwear",
        "triangles": 55064,
        "materials": 1
    },
    {
        "id": "garment/meshy-high-shoes-005",
        "label": "High leather boots",
        "path": "/character-lab/candidates/meshy-additional-005/high-shoes.glb",
        "bindingPath": "/character-lab/candidates/meshy-additional-005/high-shoes.binding.json",
        "bindingSha256": "20b04401fb107b2b8ac6590ef6e8234347a1bbb577e1ac70d78f9c2e07ae85ee",
        "slot": "footwear",
        "triangles": 18904,
        "materials": 1
    },
    {
        "id": "garment/meshy-short-trousers-006",
        "label": "Short woven trousers",
        "path": "/character-lab/candidates/meshy-short-trousers-006/short-trousers.glb",
        "bindingPath": "/character-lab/candidates/meshy-short-trousers-006/short-trousers.binding.json",
        "bindingSha256": "41b69b9c926c5401be8f98647e382fcb5235b8c981122a97fb14e3c719ac8333",
        "slot": "lower",
        "triangles": 14266,
        "materials": 1
    }
] as const;
