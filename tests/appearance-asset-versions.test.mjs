import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {load} from './load-source.mjs';
import {readGLB,geometryGLTF,measureGLB,publicFile} from '../scripts/characters/glb-inspection.mjs';
import {validateModuleProvenance} from '../scripts/characters/provenance-validation.mjs';
const {characterAsset,assetMeasurement}=load('../src/characters/CharacterAssets.ts');
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

test('body LOD changes retain the registered runtime hair surface with valid lineage and budgets',async()=>{
    for(const style of availableHairStyles){
        const asset=characterAsset(`hair/${style}`);
        assert.equal(asset.runtimeLOD,2,`${asset.id}: fixed runtime LOD policy`);
        assert.equal(hairAssetPath(style,0),hairAssetPath(style,2));
        assert.equal(hairAssetPath(style,1),hairAssetPath(style,2));
        const path=new URL(hairAssetPath(style,2),'http://local.test').pathname;
        assert.equal(path,asset.lods[asset.runtimeLOD],`${asset.id}: resolves the authoritative runtime surface`);
        const output=readGLB(path),actual=measureGLB(output,await geometryGLTF(output)),registered=assetMeasurement(path);
        assert.deepEqual(actual,registered,`${asset.id}: actual output hash/counts/bounds/bytes match registry`);
        const provenance=JSON.parse(readFileSync(publicFile(path.replace('.glb','.provenance.json')),'utf8').replace(/^\uFEFF/,''));
        assert.equal(provenance.outputSha256,output.sha256,`${asset.id}: sidecar describes these exact runtime bytes`);
        // Audit historical provenance flags/parent hashes with the unchanged validator.
        // Those flags do not qualify these inspection assets for v0.4 visual acceptance.
        const lineage=validateModuleProvenance(asset,asset.runtimeLOD,provenance,output.sha256);
        assert.ok(lineage.generationSources.includes(asset.sourceFrame.sourceSha256),`${asset.id}: measured canonical frame traces to the actual generated source`);
        assert.ok(actual.triangles<=asset.budgets.triangles[asset.runtimeLOD],`${asset.id}: source triangle budget`);
        assert.ok(actual.triangles<=asset.budgets.runtimeTriangles,`${asset.id}: runtime surface triangle budget`);
        assert.ok(actual.materials>0&&actual.materials<=asset.budgets.materials,`${asset.id}: material budget`);
    }
});
