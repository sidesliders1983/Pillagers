export const regionalGroundConfig = {
 version: 'ground-v04', seed: 1983,
 bounds: { minX: -58, maxX: 58, minZ: -18, maxZ: 62 },
 regionWidth: 30, regionDepth: 28,
 tiers: { standard: { size: 1024, gutter: 32 }, low: { size: 512, gutter: 16 } },
 fieldSpacing: .2, normalScale: .45, anisotropy: 4,
 sources: { Ground037: { repeatMeters: 3, saturation: .8, tint: [.72,.95,.66] }, Ground054: { repeatMeters: 3, saturation: .8, tint: [1.03,1.02,.96] }, mossy_rock: { repeatMeters: 4, saturation: .65, tint: [.95,.97,.95] }, grass_path_2: { repeatMeters: 3, saturation: .65, tint: [1,1,1] } },
 pathCandidate: true,
 sampling: { filterOversampling: 2, secondaryAngle: .71, secondaryBlend: .35, warpMeters: .65 },
};
export type GroundTier = keyof typeof regionalGroundConfig.tiers;
export function groundRegions() {
 const c=regionalGroundConfig, rows=[];
 for(let x=c.bounds.minX, col=0;x<c.bounds.maxX;x+=c.regionWidth,col++)
  for(let z=c.bounds.minZ,row=0;z<c.bounds.maxZ;z+=c.regionDepth,row++)
   rows.push({id:`${col}-${row}`,minX:x,minZ:z,maxX:Math.min(x+c.regionWidth,c.bounds.maxX),maxZ:Math.min(z+c.regionDepth,c.bounds.maxZ)});
 return rows;
}
