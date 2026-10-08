import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {existsSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';import {MeshoptDecoder} from 'meshoptimizer';import sharp from 'sharp';
import {load} from './load-source.mjs';
const {houseAssetFor}=load('../src/config/HousingAssets.ts');
const {buildings}=load('../src/world/SettlementLayout.ts');
test('farmer housing replaces the corresponding size, with standard fallback for unavailable variants',()=>{
 assert.equal(houseAssetFor('hut','farmer'),'farmHut');assert.equal(houseAssetFor('homestead','farmer'),'farmHomestead');
 assert.equal(houseAssetFor('longhouse','farmer'),'longhouse');assert.equal(houseAssetFor('greatHouse'),'greatHall');assert.equal(houseAssetFor('hut','fisher'),'hut');
});
test('housing parcels and navigation exclusions have room between neighbouring buildings',()=>{
 for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++){
  const a=buildings[i],b=buildings[j];assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>a.radius+b.radius+.8,a.key+' overlaps '+b.key);
 }
});
const manifestURL=new URL('../public/game-assets/houses/manifest.json',import.meta.url),available=existsSync(manifestURL);
test('all generated houses and both yards decode with compact textures and contained footprints',{skip:!available},async()=>{
 const manifest=JSON.parse(await readFile(manifestURL,'utf8'));
 assert.equal(Object.keys(manifest.assets).length,8);
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 for(const [key,entry] of Object.entries(manifest.assets)){
  const bytes=await readFile(new URL('../public/game-assets/houses/'+entry.file,import.meta.url));
  const doc=await io.readBinary(bytes);assert.ok(bytes.length<entry.sourceBytes,key+' filesize');
  for(const texture of doc.getRoot().listTextures()){const meta=await sharp(texture.getImage()).metadata();assert.ok(meta.width<=1024&&meta.height<=1024,key+' texture size');assert.equal(meta.format,'webp');}
  const bounds=getBounds(doc.getRoot().listScenes()[0]);
  for(const side of ['min','max'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(bounds[side][axis]-entry.bounds[side][axis])<(entry.sourceTriangles>20000?.075:.005),key+' bounds');
  const parcel=buildings.find(b=>b.key===key||b.terrainKey===key);assert.ok(parcel,key+' parcel');
  assert.ok((bounds.max[0]-bounds.min[0])/2<=parcel.halfWidth,key+' width');
  assert.ok((bounds.max[2]-bounds.min[2])/2<=parcel.halfDepth,key+' depth');
  for(const material of doc.getRoot().listMaterials())assert.ok(material.getBaseColorTexture(),key+' original colour texture');
 }
});

