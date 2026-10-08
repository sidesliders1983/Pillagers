export const generatedHouseFiles={
 greatHall:'house-greathouse.glb',hut:'house-hut.glb',homestead:'house-homestead.glb',longhouse:'house-longhouse.glb',
 farmHut:'farm-hut.glb',farmHomestead:'farm-homestead.glb',farmHutTerrain:'farm-hut-terrain.glb',farmHomesteadTerrain:'farm-homestead-terrain.glb',
} as const;
export type HouseSize='hut'|'homestead'|'longhouse'|'greatHouse';
/** Available occupation variants replace the standard dwelling at the same size. */
export function houseAssetFor(size:HouseSize,occupation?:string){
 if(occupation==='farmer'&&size==='hut')return 'farmHut';
 if(occupation==='farmer'&&size==='homestead')return 'farmHomestead';
 return size==='greatHouse'?'greatHall':size;
}
