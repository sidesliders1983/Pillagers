import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {load} from './load-source.mjs';
const {hairAssetPath,availableHairStyles}=load('../src/character-lab/GeneratedHair.ts');
const {beardAssetPath,availableBeardStyles}=load('../src/character-lab/GeneratedBeard.ts');
test('every loaded appearance URL invalidates browser caches when published geometry changes',()=>{
    for(const [styles,path] of [[availableHairStyles,hairAssetPath],[availableBeardStyles,beardAssetPath]]){
        for(const style of styles)for(const lod of [0,1,2]){
            const url=new URL(path(style,lod),'http://local.test');
            const bytes=readFileSync(new URL(`../public${url.pathname}`,import.meta.url));
            assert.equal(url.searchParams.get('v'),createHash('sha256').update(bytes).digest('hex').slice(0,12));
        }
    }
});
