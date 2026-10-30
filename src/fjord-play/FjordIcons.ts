import type { Occupation } from '../simulation/SimulationCore';

const paths = {
    settings: [
        'M10.436 2.123 L13.564 2.123 L13.814 4.723 L15.863 5.571',
        'L17.878 3.910 L20.090 6.122 L18.429 8.137 L19.277 10.186',
        'L21.877 10.436 L21.877 13.564 L19.277 13.814 L18.429 15.863',
        'L20.090 17.878 L17.878 20.090 L15.863 18.429 L13.814 19.277',
        'L13.564 21.877 L10.436 21.877 L10.186 19.277 L8.137 18.429',
        'L6.122 20.090 L3.910 17.878 L5.571 15.863 L4.723 13.814',
        'L2.123 13.564 L2.123 10.436 L4.723 10.186 L5.571 8.137',
        'L3.910 6.122 L6.122 3.910 L8.137 5.571 L10.186 4.723 Z',
        'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
    ].join(' '),
    map: 'm2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3V5Zm6-3v17m8-14v17',
    food: 'M12 21V4M12 7C5 8 4 3 5 2c4 0 7 1 7 5Zm0 5c7 0 8-4 7-6-4 0-7 2-7 6Zm0 5c-7 0-8-4-7-6 4 0 7 2 7 6Z',
    materials: 'm3 8 6-4 12 5-6 4L3 8Zm0 0v7l12 5 6-4V9M9 4v7m6 2v7M3 12l12 5 6-4',
    people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 7m1 3a6 6 0 0 1 4 6',
    cattle: 'M7 8 3 4 2 8l4 4m11-4 4-4 1 4-4 4M8 5V2m8 3V2M7 7l2-2h6l2 2 1 9-3 5H9l-3-5 1-9Zm2 9h6M9 11h.1M15 11h.1',
    home: 'm2 11 10-9 10 9M5 9v12h14V9M10 21v-8h4v8',
    tent: 'm2 21 10-18 10 18H2Zm10-18v18m0-10-5 10m5-10 5 10',
    route: 'M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 16h5a4 4 0 0 0 0-8H8m1-3L6 8l3 3',
    book: 'M12 5C8 2 4 2 2 3v17c4-1 7 0 10 2 3-2 6-3 10-2V3c-2-1-6-1-10 2Zm0 0v17M5 7l4 1M5 11l4 1m6-4 4-1m-4 5 4-1',
    close: 'm5 5 14 14M19 5 5 19',
    play: 'm7 3 14 9-14 9V3Z',
    pause: 'M7 3v18M17 3v18',
    fastForward: 'M2 4l10 8-10 8V4Zm10 0 10 8-10 8V4Z',
    menu: 'M4 5h16M4 12h16M4 19h16',
    alert: 'm12 2 10 19H2L12 2Zm0 6v6m0 3v.1',
    work: 'm4 20 12-12m-1-6 7 7-3 3-7-7 3-3ZM2 7l5-5m-3 2 16 16',
    fisher: 'M3 12c5-8 12-8 16 0-4 8-11 8-16 0Zm16 0 3-4v8l-3-4ZM13 8v8m-6-5h.1',
    hunter: 'M5 3c18 5 18 13 0 18L5 3Zm0 9h17m-4-4 4 4-4 4',
    textile: 'm5 3 14 18M19 3 5 21M3 8h18M3 16h18',
    wood: 'm4 18 14-14 3 3L7 21H4v-3ZM4 3l8 8M3 4l2-2 5 5-2 2',
    ship: 'M2 17h20l-4 5H6l-4-5Zm10 0V2l8 11h-8M9 4 4 13h5',
    jewel: 'm3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18',
    destination: 'M5 22V3m0 1c5-5 9 5 15 0v11c-6 5-10-5-15 0',
    locate: 'M12 2v4m0 12v4M2 12h4m12 0h4M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4v.1',
    check: 'm4 12 5 5L20 6',
    plus: 'M12 4v16M4 12h16',
    back: 'm10 5-7 7 7 7M3 12h18',
};
export type FjordIcon = keyof typeof paths;
export function icon(name: FjordIcon): string {
    return `<svg class="fjord-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
}
export const occupationLabel = (role: Occupation | null) => role === null ? 'No occupation' :
    ({ textileWorker: 'Textile worker', leatherAndJewelleryMaker: 'Leather & jewellery maker' } as
        Partial<Record<Occupation, string>>)[role] ?? role[0].toUpperCase() + role.slice(1);
export const workLabel = (role: Occupation) => ({ farmer: 'Farming', herder: 'Herding', fisher: 'Fishing',
    hunter: 'Hunting', textileWorker: 'Textile work', smith: 'Smithing', woodworker: 'Woodworking',
    boatbuilder: 'Boatbuilding', miner: 'Mining', trader: 'Trading', leatherAndJewelleryMaker: 'Leather & jewellery' })[role];
export const occupationIcon = (role: Occupation | null): FjordIcon => ({ farmer: 'food', herder: 'cattle',
    fisher: 'fisher', hunter: 'hunter', textileWorker: 'textile', woodworker: 'wood', boatbuilder: 'ship',
    trader: 'materials', leatherAndJewelleryMaker: 'jewel' } as Partial<Record<Occupation, FjordIcon>>)[role ?? 'smith'] ?? 'work';
