import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const {GameplaySession}=loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts',import.meta.url));
test('new campaign weather choice survives save/load and can change at restart with the same founders',()=>{
 const session=new GameplaySession(32);session.newCampaign(32,false);
 assert.equal(session.snapshot().weather.config.enabled,false);
 const founders=session.snapshot().personas;
 session.loadJSON(session.saveJSON());assert.equal(session.snapshot().weather.config.enabled,false);
 session.restartCampaign(true,()=>{throw new Error('No new seed');},true);
 assert.equal(session.snapshot().weather.config.enabled,true);assert.deepEqual(session.snapshot().personas,founders);
 session.restartCampaign(true,()=>32,false);assert.equal(session.snapshot().weather.config.enabled,false);
 assert.equal(session.running,false);
});
