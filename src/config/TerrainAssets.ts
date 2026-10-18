/** Published filenames for the original scenery kit. Authoring sources remain outside public/. */
export const terrainModels = {
    spruce: 'spruce-tree', birch: 'birch-tree', boulder: 'boulder', cliff: 'fjord-cliff-rock',
    greatHall: 'great-hall', hut: 'turf-dwelling', storehouse: 'stabbur-storehouse',
    hearth: 'cooking-hearth', well: 'village-well', logs: 'log-pile', barrel: 'barrel',
    crate: 'storage-crate', boat: 'faering-rowboat', jetty: 'jetty-pier',
    heather: 'heather-shrub', grass: 'grass-tuft', fish: 'fish-drying-rack', rune: 'runestone'
} as const;

export const longshipModel = 'longship-drakkar';
export const terrainAssetPath = (name: string) => 'terrain/' + name + '.glb';
