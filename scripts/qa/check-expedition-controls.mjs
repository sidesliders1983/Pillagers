import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
await mkdir('artifacts/spatial-expeditions',{recursive:true});
const entry=resolve('artifacts/spatial-expeditions/controls-entry.ts');
await writeFile(entry,"export { ExpeditionPanel } from '../../src/fjord-play/ExpeditionPanel';\nexport { GameplaySession } from '../../src/gameplay-lab/GameplaySession';\n");
const bundle=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,
    lib:{entry,name:'ExpeditionControls',formats:['iife']},outDir:'artifacts/spatial-expeditions/controls-build'}});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
    const page=await browser.newPage();
    await page.setContent('<section id="groups"></section>');
    await page.addScriptTag({content:(Array.isArray(bundle)?bundle[0]:bundle).output.find(file=>file.type==='chunk').code});
    const result=await page.evaluate(() => {
        const { GameplaySession, ExpeditionPanel }=ExpeditionControls;
        const session=new GameplaySession();
        session.command({type:'CreateExpeditionGroup',name:'Group 1',memberIds:['founder-2']});
        const panel=new ExpeditionPanel(document.querySelector('#groups'),session,
            command=>session.command(command),()=>{},()=>({kind:'persona',id:'founder-1'}),()=>({}));
        panel.refresh();
        const picker=document.querySelector('#expedition-join');
        picker.focus();
        for (let i=0;i<3;i++) { session.command({type:'AdvanceTicks',ticks:1}); panel.refresh(); }
        return {focused:document.activeElement===picker,group:picker.value};
    });
    assert.equal(result.focused,true,'The resident group picker remains focused through ordinary campaign ticks');
    assert.equal(result.group,'group-1');
    console.log('Resident group picker retains focus through real session ticks.');
} finally {await browser.close();}
