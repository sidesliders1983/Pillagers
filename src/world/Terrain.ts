import {regionalGroundConfig,groundRegions,GroundTier} from '../config/RegionalGroundConfig';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Color, MathUtils, Texture, Vector2, Group } from 'three';
import { worldConfig } from '../config/worldConfig';
import { buildings, buildingDistance, pathWeight } from './SettlementLayout';
import {groundTreatment} from './GroundTreatment';
export function shoreAt(x: number) { return -11 + 1.6 * Math.sin(x * .11) + .55 * Math.sin(x * .29 + .7); }
function naturalHeight(x: number, z: number) { const coast = MathUtils.smoothstep(z - shoreAt(x), -1, 4), hill = 5 * Math.exp(-((x + 19) ** 2 / 150 + (z - 19) ** 2 / 140)), undulation = .24 * Math.sin(x * .19 + z * .12) + .13 * Math.cos(z * .37 - x * .08) + .08 * Math.sin(x * .53 + z * .44); return -.65 + coast * (1.45 + hill + undulation); }
export function heightAt(x: number, z: number) { let h = naturalHeight(x, z); for (const b of buildings) {
    const influence = 1 - MathUtils.smoothstep(buildingDistance(x, z, b), .3, 2.8);
    h = MathUtils.lerp(h, naturalHeight(b.x, b.z), influence);
} return h; }
// Interpolate the actual alternating terrain triangles, rather than the smooth field.
export function surfaceHeightAt(x: number, z: number) {
    const x0 = Math.floor(x / 2) * 2, z0 = Math.floor(z / 2) * 2;
    const u = (x - x0) / 2, v = (z - z0) / 2;
    const a = heightAt(x0, z0), b = heightAt(x0, z0 + 2);
    const c = heightAt(x0 + 2, z0), d = heightAt(x0 + 2, z0 + 2);
    if (Math.round((x0 + z0) / 2) % 2 === 0) {
        return u + v <= 1 ? a * (1-u-v) + b*v + c*u : b*(1-u) + c*(1-v) + d*(u+v-1);
    }
    return v >= u ? a*(1-v) + b*(v-u) + d*u : a*(1-u) + d*v + c*(u-v);
}
export interface TerrainOptions {treatment?:'legacy'|'ground-v02';seed?:number;maps?:{normalMap:Texture;roughnessMap:Texture;normalScale:number}}
export function createTerrain(options:TerrainOptions={}) {
    const positions: number[] = [], colors: number[] = [], uvs:number[]=[];
    const treatment=options.treatment==='ground-v02'?groundTreatment(heightAt,shoreAt,options.seed):null;
    const p = worldConfig.palette;
    const ground = new Color(p.ground), moss = new Color(p.moss), earth = new Color(p.earth), sand = new Color(p.sand), color = new Color();
    for (let x = -58; x < 58; x += 2)
        for (let z = -18; z < 62; z += 2) {
            const corners = Math.round((x + z) / 2) % 2 === 0 ? [[0, 0], [0, 2], [2, 0], [2, 0], [0, 2], [2, 2]] : [[0, 0], [0, 2], [2, 2], [0, 0], [2, 2], [2, 0]];
            for (const [dx, dz] of corners) {
                const px = x + dx, pz = z + dz;
                positions.push(px, heightAt(px, pz), pz);
                if(options.treatment==='ground-v02')uvs.push((px+58)/116,(pz+18)/80);
                const organic = .5 + .24 * Math.sin(px * .17 + pz * .09) + .19 * Math.cos(pz * .24 - px * .13), clearing = Math.exp(-((px - 1) ** 2 / 175 + (pz - 1) ** 2 / 95)), worn = Math.max(pathWeight(px, pz), clearing * .7), foundation = Math.max(...buildings.map(b => 1 - MathUtils.smoothstep(buildingDistance(px, pz, b), 0, 2.7)));
                color.copy(ground).lerp(moss, MathUtils.clamp(organic * (1 - clearing * .7), 0, 1) * .72).lerp(earth, Math.max(worn, foundation * .6) * .8).lerp(sand, 1 - MathUtils.smoothstep(pz - shoreAt(px), 1.5, 5));
                if(treatment)treatment(px,pz,color);
                colors.push(color.r, color.g, color.b);
            }
        }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    if(uvs.length)geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
    geometry.computeVertexNormals();
    const maps=treatment?options.maps:undefined;
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1,
        normalMap:maps?.normalMap??null,roughnessMap:maps?.roughnessMap??null,normalScale:new Vector2(maps?.normalScale??1,maps?.normalScale??1) }));
    mesh.receiveShadow = true;
    return mesh;
}

/** Partition rendering only: triangles, normals and height authority stay canonical. */
export function createRegionalTerrain(maps:ReadonlyMap<string,{map:Texture;normalMap:Texture|null;roughnessMap:Texture}>=new Map(),tier:GroundTier='standard') {
 const source=createTerrain(),group=new Group(),p=source.geometry.getAttribute('position'),n=source.geometry.getAttribute('normal');
 const config=regionalGroundConfig,{size,gutter}=config.tiers[tier],inset=gutter/size,coverage=1-2*inset;
 for(const region of groundRegions()){
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
  for(let i=0;i<p.count;i+=3){const cx=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,cz=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
   if(cx<region.minX||cx>=region.maxX||cz<region.minZ||cz>=region.maxZ)continue;
   for(let j=i;j<i+3;j++){positions.push(p.getX(j),p.getY(j),p.getZ(j));normals.push(n.getX(j),n.getY(j),n.getZ(j));uvs.push(inset+(p.getX(j)-region.minX)/config.regionWidth*coverage,inset+(p.getZ(j)-region.minZ)/config.regionDepth*coverage);}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
  const texture=maps.get(region.id),material=new MeshStandardMaterial({map:texture?.map??null,normalMap:tier==='low'?null:texture?.normalMap??null,roughnessMap:texture?.roughnessMap??null,roughness:1,flatShading:true,vertexColors:false,normalScale:new Vector2(config.normalScale,config.normalScale)});
  const mesh=new Mesh(geometry,material);mesh.name='Ground region '+region.id;mesh.receiveShadow=true;group.add(mesh);
 }
 source.geometry.dispose();source.material.dispose();return group;
}
