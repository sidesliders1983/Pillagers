// Shared parcel dimensions keep terrain, scenery and navigation clear of housing.
import {houseAssetFor} from '../config/HousingAssets';
export const settlementBounds={minX:-36,maxX:36,minZ:-7,maxZ:46};
export const buildings=[
 {key:houseAssetFor('greatHouse'),x:0,z:36,rotation:Math.PI,halfWidth:5.6,halfDepth:4.4,radius:7.8},
 {key:houseAssetFor('longhouse'),x:18,z:29,rotation:Math.PI+.15,halfWidth:4.8,halfDepth:3,radius:6.2},
 {key:houseAssetFor('homestead'),x:-18,z:29,rotation:Math.PI-.15,halfWidth:4.8,halfDepth:3.3,radius:6.5},
 {key:houseAssetFor('hut'),x:-4,z:14,rotation:Math.PI,halfWidth:2.3,halfDepth:2,radius:3.5},
 {key:houseAssetFor('hut','farmer'),terrainKey:'farmHutTerrain',x:18,z:6,rotation:-Math.PI/2,halfWidth:6,halfDepth:6,radius:8.7},
 {key:houseAssetFor('homestead','farmer'),terrainKey:'farmHomesteadTerrain',x:-22,z:7,rotation:Math.PI/2,halfWidth:8.6,halfDepth:9.4,radius:13.3},
 {key:'storehouse',x:32,z:24,rotation:-Math.PI/2,halfWidth:1.9,halfDepth:2.8,radius:3.6},
] as const;
export const hearth={x:.5,z:3,r:1.5},well={x:7.2,z:-3.8,r:1.4};
export const obstacles=[...buildings.map(b=>({x:b.x,z:b.z,r:b.radius})),hearth,well];
type Point=readonly [number,number];
export const routes:{points:readonly [Point,Point,Point];width:number}[]=[
 {points:[[-4.8,-10],[-4,-4],[-1.2,-1.6]],width:.85},
 {points:[[-1.2,-1.6],[4,12],[0,29.7]],width:1.15},
 {points:[[0,20],[-9,22],[-17.5,24.7]],width:.9},
 {points:[[0,20],[9,22],[18.5,24.8]],width:.9},
 {points:[[-1.2,-1.6],[-6,4],[-4,11]],width:.8},
 {points:[[2.6,1.3],[7,4],[10.7,6]],width:.9},
 {points:[[-1.2,-1.6],[-9,4],[-13.8,7]],width:.9},
 {points:[[21,19],[25,20],[28.3,24]],width:.75},
 {points:[[2.6,-1.2],[4,-4.8],[6,-4.2]],width:.65},
];
const segments=routes.flatMap(({points:[a,b,c],width})=>{const samples:{a:Point;b:Point;width:number}[]=[];let previous:Point=a;for(let i=1;i<=16;i++){const t=i/16,s=1-t;const next:Point=[s*s*a[0]+2*s*t*b[0]+t*t*c[0],s*s*a[1]+2*s*t*b[1]+t*t*c[1]];samples.push({a:previous,b:next,width});previous=next;}return samples;});
export function pathWeight(x:number,z:number){let weight=0;for(const {a,b,width} of segments){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));const d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);weight=Math.max(weight,Math.exp(-d*d/(width*width)));}return weight;}
export function buildingDistance(x:number,z:number,b:typeof buildings[number]){const dx=x-b.x,dz=z-b.z,c=Math.cos(b.rotation),s=Math.sin(b.rotation);return Math.max(Math.abs(dx*c-dz*s)-b.halfWidth,Math.abs(dx*s+dz*c)-b.halfDepth);}
