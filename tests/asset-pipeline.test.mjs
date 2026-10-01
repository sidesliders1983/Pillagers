import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('asset CLI rejects incomplete commands and invalid benchmark sets before publishing',()=>{
    const run=(...args)=>spawnSync(process.execPath,['scripts/asset-pipeline.mjs',...args],{encoding:'utf8'});
    assert.notEqual(run('optimize').status,0);
    assert.notEqual(run('publish').status,0);
    const directory=mkdtempSync(join(tmpdir(),'pillagers-publish-'));
    try{
        const source=join(directory,'source.glb'),report=join(directory,'report.json');
        writeFileSync(source,'placeholder');
        writeFileSync(report,JSON.stringify({schemaVersion:1,source:{sha256:'wrong'},lods:[{file:'fixture_LOD0.glb'},{file:'fixture_LOD1.glb'},{file:'fixture_LOD2.glb'}]}));
        const mismatch=run('publish',source,report);
        assert.notEqual(mismatch.status,0);
        assert.match(mismatch.stderr,/does not match report/);
        writeFileSync(report,JSON.stringify({schemaVersion:1,source:{},lods:[{file:'../escape_LOD0.glb'}, {file:'fixture_LOD1.glb'}, {file:'fixture_LOD2.glb'}]}));
        const traversal=run('publish',source,report);
        assert.notEqual(traversal.status,0);
        assert.match(traversal.stderr,/invalid local GLB/);
    }finally{rmSync(directory,{recursive:true,force:true});}
});
