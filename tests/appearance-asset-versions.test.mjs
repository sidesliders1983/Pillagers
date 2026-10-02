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

test('body LOD changes retain the reviewed hair surface',()=>{
    for(const style of availableHairStyles){
        assert.equal(hairAssetPath(style,0),hairAssetPath(style,2));
        assert.equal(hairAssetPath(style,1),hairAssetPath(style,2));
        const path=new URL(hairAssetPath(style,2),'http://local.test').pathname;
        const record=JSON.parse(readFileSync(new URL(`../public${path.replace('.glb','.provenance.json')}`,import.meta.url)));
        const source=readFileSync(new URL(`../public/appearance/${style}/Hair_${style}_LOD0.glb`,import.meta.url));
        assert.equal(record.qualitySource.sha256,createHash('sha256').update(source).digest('hex'));
        assert.equal(record.reviewRequired,false);
        assert.ok(record.qualitySource.triangles<10000);
    }
});
