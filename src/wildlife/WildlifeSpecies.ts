export type WildlifeMovement = 'ground' | 'air' | 'water' | 'shore';
export type HabitatTag = 'coast' | 'fjord_water' | 'deep_coastal_water' | 'outer_coast' | 'rocky_shore' | 'cliff' | 'forest_edge' | 'deep_forest' | 'lowland' | 'wet_lowland' | 'foothill' | 'mountain' | 'alpine';
export interface MarineEncounterProfile {
    behavior: 'humpback_surface_sighting';
    canonicalLength: number;
    rarity: 'rare';
    initialDelay: readonly [number, number];
    cooldown: readonly [number, number];
}
export interface WildlifeVariant {
    id: string;
    asset: string;
    movement: WildlifeMovement;
    count: number;
    habitats: readonly HabitatTag[];
    radius: number;
    speed: number;
    clearance: number;
    avoidSettlement: number;
    shyDistance?: number;
    fleeSpeed?: number;
    maximumCoastDistance?: number;
    minimumCoastDistance?: number;
    minimumElevation?: number;
    minimumDepth?: number;
    encounter?: MarineEncounterProfile;
    behavior?: 'otter_shore_water';
    flightHeight?: readonly [
        number,
        number
    ];
}
export interface WildlifeSpecies {
    id: string;
    label: string;
    group: 'solo' | 'pair' | 'small_group' | 'flock';
    groupRadius?: number;
    variants: readonly WildlifeVariant[];
}
export const wildlifeTerritoryGap = 40;
/** Population and habitat rules are independent of simulation residents and Core RNG. */
export const wildlifeSpecies: readonly WildlifeSpecies[] = [
    { id: 'brown-bear', label: 'Brown bear', group: 'solo', variants: [
            { id: 'roaming', asset: 'bear', movement: 'ground', count: 1,
                habitats: ['deep_forest', 'foothill'], radius: 28, speed: .65, clearance: .95, avoidSettlement: 135, minimumCoastDistance: 40, shyDistance: 42, fleeSpeed: 2.2 },
        ] },
    { id: 'red-fox', label: 'Red fox', group: 'solo', variants: [
            { id: 'roaming', asset: 'fox', movement: 'ground', count: 1,
                habitats: ['forest_edge', 'lowland'], radius: 14, speed: .8, clearance: .45, avoidSettlement: 100, minimumCoastDistance: 25, shyDistance: 28, fleeSpeed: 2.1 },
        ] },
    { id: 'wolf', label: 'Wolf', group: 'solo', variants: [
            { id: 'roaming', asset: 'wolf', movement: 'ground', count: 1,
                habitats: ['deep_forest', 'forest_edge', 'foothill'], radius: 38, speed: .9, clearance: .85, avoidSettlement: 145, minimumCoastDistance: 45, shyDistance: 45, fleeSpeed: 2.6 },
        ] },
    { id: 'moose', label: 'Moose', group: 'solo', variants: [
            { id: 'roaming', asset: 'moose', movement: 'ground', count: 1,
                habitats: ['wet_lowland', 'forest_edge'], radius: 22, speed: .65, clearance: 1.5, avoidSettlement: 125, minimumCoastDistance: 40, shyDistance: 35, fleeSpeed: 2 },
        ] },
    { id: 'reindeer', label: 'Reindeer', group: 'solo', variants: [
            { id: 'alpine', asset: 'reindeer', movement: 'ground', count: 1,
                habitats: ['alpine'], radius: 24, speed: .7, clearance: 1.05, avoidSettlement: 125, minimumCoastDistance: 0, shyDistance: 42, fleeSpeed: 2.5 },
        ] },
    { id: 'lynx', label: 'Lynx', group: 'solo', variants: [
            { id: 'roaming', asset: 'lynx', movement: 'ground', count: 1,
                habitats: ['deep_forest', 'foothill'], radius: 18, speed: .6, clearance: .6, avoidSettlement: 135, minimumCoastDistance: 35, shyDistance: 38, fleeSpeed: 2.2 },
        ] },
    { id: 'great-black-backed-gull', label: 'Great black-backed gull', group: 'flock', groupRadius: 36, variants: [
            { id: 'airborne', asset: 'gull-flying', movement: 'air', count: 6,
                habitats: ['coast', 'fjord_water', 'cliff'], radius: 44, speed: 6, clearance: .85,
                avoidSettlement: 0, maximumCoastDistance: 65, flightHeight: [12, 30] },
            { id: 'grounded', asset: 'gull-standing', movement: 'shore', count: 3,
                habitats: ['coast', 'rocky_shore'], radius: 3, speed: 0, clearance: 1.1,
                avoidSettlement: 12, maximumCoastDistance: 10 },
        ] },
    { id: 'puffin', label: 'Puffin', group: 'small_group', groupRadius: 16, variants: [
            { id: 'land', asset: 'puffin', movement: 'shore', count: 3,
                habitats: ['coast', 'rocky_shore'], radius: 3, speed: .12, clearance: .16,
                avoidSettlement: 25, shyDistance: 12, fleeSpeed: .7, maximumCoastDistance: 10, minimumElevation: .6 },
            { id: 'water', asset: 'puffin', movement: 'water', count: 2,
                habitats: ['fjord_water'], radius: 5, speed: .18, clearance: .16,
                avoidSettlement: 25, maximumCoastDistance: 22 },
        ] },
    { id: 'otter', label: 'Otter', group: 'pair', groupRadius: 12, variants: [
            { id: 'shore', asset: 'otter', movement: 'shore', count: 1,
                habitats: ['coast', 'rocky_shore'], radius: 5, speed: .3, clearance: .6,
                avoidSettlement: 35, shyDistance: 18, fleeSpeed: 1.2, maximumCoastDistance: 9 },
            { id: 'water', asset: 'otter', movement: 'water', count: 1,
                behavior: 'otter_shore_water',
                habitats: ['fjord_water'], radius: 6, speed: .4, clearance: .25,
                avoidSettlement: 35, maximumCoastDistance: 22 },
        ] },
    { id: 'seal', label: 'Seal', group: 'small_group', groupRadius: 20, variants: [
            { id: 'haul-out', asset: 'seal', movement: 'shore', count: 2,
                habitats: ['coast', 'rocky_shore'], radius: 3, speed: 0, clearance: .55,
                avoidSettlement: 35, maximumCoastDistance: 10 },
            { id: 'water', asset: 'seal', movement: 'water', count: 2,
                habitats: ['fjord_water'], radius: 9, speed: .45, clearance: .55,
                avoidSettlement: 35, maximumCoastDistance: 28 },
        ] },
    { id: 'humpback-whale', label: 'Humpback whale', group: 'solo', variants: [
            { id: 'visiting', asset: 'humpback', movement: 'water', count: 1,
                habitats: ['fjord_water', 'deep_coastal_water', 'outer_coast'],
                radius: 0, speed: 2, clearance: 7.1, avoidSettlement: 0, minimumDepth: 6.5,
                encounter: { behavior: 'humpback_surface_sighting', canonicalLength: 14,
                    rarity: 'rare', initialDelay: [240, 480], cooldown: [720, 1200] } },
        ] },
    { id: 'rabbit', label: 'Rabbit', group: 'pair', groupRadius: 16, variants: [
            { id: 'hopping', asset: 'rabbit', movement: 'ground', count: 2,
                habitats: ['forest_edge', 'lowland'], radius: 12, speed: .65, clearance: .24,
                avoidSettlement: 60, minimumCoastDistance: 18, shyDistance: 16, fleeSpeed: 1.8 },
        ] },
];
