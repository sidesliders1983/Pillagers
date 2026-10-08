import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';
const {characterAssets,characterAsset}=load('../src/characters/CharacterAssets.ts');
test('retired legacy clothing is absent from public discovery and lookup',()=>{
 for(const id of ['garment/cream-tunic','garment/long-dress','garment/mantle-tunic']){
  assert.equal(characterAssets.some(asset=>asset.id===id),false,id);
  assert.throws(()=>characterAsset(id),/Unknown character asset/);
 }
 assert.ok(characterAsset('body/universal-human'));
 assert.ok(characterAsset('hair/short'));
 assert.ok(characterAsset('beard/short'));
});
import {geometryAsset} from './glb-fixture.mjs';
const {CharacterFactory}=load('../src/characters/CharacterFactory.ts');
const {goldenCharacterDNA}=load('../src/characters/GoldenCharacters.ts');
test('default characters retain body and head appearance without requesting retired clothes',async()=>{
 const requests=[],factory=new CharacterFactory(url=>{requests.push(url);return geometryAsset(url.split('?')[0].slice(1));});
 const character=await factory.create(goldenCharacterDNA('golden_neutral_01'),2);
 try{
  assert.equal(character.root.userData.outfit,null);
  assert.ok(character.root.getObjectByName('UniversalHuman'));
  assert.ok(character.root.userData.selectedAssets.hair);
  assert.equal(requests.some(url=>url.startsWith('/clothing/')),false);
  for(const id of ['garment/cream-tunic','garment/long-dress','garment/mantle-tunic'])await assert.rejects(()=>factory.equip(character,id),/Unknown registered module/);
  for(const animation of ['Idle','Walk','Run']){character.setAnimation(animation);character.update(.1);}
 }finally{character.dispose();}
});
