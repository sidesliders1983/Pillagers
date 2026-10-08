import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [action,...args]=process.argv.slice(2);
if(action==='nature'){
 await (await import('./prepare-nature-assets.mjs')).prepareNature(args[0]);
}else if(action==='optimize'||action==='test'){
    const blender=process.env.BLENDER_PATH||[
        join(root,'tools/blender-4.5.9-windows-x64/blender.exe'),
        'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
        '/Applications/Blender.app/Contents/MacOS/Blender',
    ].find(existsSync)||'blender';
    if(action==='optimize'&&args.length<2){console.error('Usage: npm run assets:optimize -- source.glb output-directory [--name character]');process.exit(1);}
    const script=action==='test'?'test-optimize-character.py':'optimize-character.py';
    const result=spawnSync(blender,['--background','--factory-startup','--python-exit-code','1','--python',join(root,'scripts',script),'--',...args],{stdio:'inherit'});
    if(result.error)console.error(`${result.error.message}. Set BLENDER_PATH to Blender 4.5 or newer.`);
    process.exit(result.status??1);
}else if(action==='publish'){
    const [source,reportFile]=args;
    if(!source||!reportFile){console.error('Usage: npm run assets:publish -- source.glb character_report.json');process.exit(1);}
    const report=JSON.parse(readFileSync(reportFile,'utf8'));
    if(report.schemaVersion!==1||report.lods?.length!==3)throw new Error('Expected a pipeline v1 report with three LODs');
    const directory=join(root,'public/game-assets/characters');
    const sourceName=report.lods[0].file.replace(/_LOD0\.glb$/,'_source.glb');
    if(sourceName===report.lods[0].file)throw new Error('Invalid LOD0 filename');
    const assets=[{...report.source,label:'Source',file:sourceName},...report.lods];
    const files=[resolve(source),...report.lods.map(lod=>resolve(dirname(reportFile),lod.file))];
    // Validate the entire set before copying. Assets stay local and ignored by Git.
    for(let i=0;i<assets.length;i++){
        if(!/^[\w.-]+\.glb$/.test(assets[i].file)||!existsSync(files[i]))throw new Error('Missing or invalid local GLB');
        if(createHash('sha256').update(readFileSync(files[i])).digest('hex')!==assets[i].sha256)throw new Error('GLB does not match report: '+files[i]);
    }
    mkdirSync(directory,{recursive:true});
    for(let i=0;i<assets.length;i++)copyFileSync(files[i],join(directory,assets[i].file));
    const manifest={name:basename(reportFile).replace(/_report\.json$/,''),height:1.8,assets:assets.map(a=>({label:a.label,file:a.file,triangles:a.triangles,vertices:a.vertices,bytes:a.bytes,textureSize:a.textureSize}))};
    writeFileSync(join(directory,'benchmark.json'),JSON.stringify(manifest,null,2));
    console.log('Benchmark ready at /asset-lab');
}else{
    console.error('Expected optimize, publish or test');process.exit(1);
}
