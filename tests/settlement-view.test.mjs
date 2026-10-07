import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));
const {projectSettlement}=loadTypeScript(new URL('../src/play/SettlementView.ts',import.meta.url));
test('settlement projection keeps canonical identity, deterministic slots and excludes dead residents',()=>{
 const state=core.createCampaign(32),before=core.serializeState(state),view=projectSettlement(state);
 assert.equal(view.entities.filter(e=>e.kind==='persona').length,10);
 assert.equal(view.entities.filter(e=>e.kind==='cattle').length,3);
 assert.ok(view.entities.some(e=>e.kind==='household'));
 assert.deepEqual(projectSettlement(core.reconstructState(before)),view);
 assert.equal(core.serializeState(state),before);
 const dead=core.advanceWinter(core.createCampaign(32,{}, {mortalityBands:[{minAge:0,chanceBps:10000}]}));
 assert.equal(projectSettlement(dead).entities.some(e=>e.kind==='persona'&&e.id==='founder-1'),false);
});
test('building, Farmyard, upgrade and cattle assignment project real command results',()=>{
 let state=core.createCampaign(32,{initialMaterials:100,foundingCoupleChanceBps:0});
 state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
 state=core.applyCommand(state,{type:'HouseHousehold',householdId:'founder-1'});
 state=core.applyCommand(state,{type:'AssignCattle',cattleId:'cattle-1',farmyardId:'house-1'});
 let view=projectSettlement(state);const home=view.entities.find(e=>e.kind==='building'&&e.id==='house-1');
 assert.equal(home.farmyard,true);assert.equal(home.sprite,'house-0');assert.equal(view.entities.some(e=>e.kind==='household'&&e.id==='founder-1'),false);
 const assigned=view.entities.find(e=>e.id==='cattle-1');assert.ok(Math.abs(assigned.x-home.x)<300);
 state=core.applyCommand(state,{type:'SpecializeBuilding',buildingId:'house-1',occupation:'farmer'});
 state=core.applyCommand(state,{type:'UpgradeBuilding',buildingId:'house-1'});
 assert.equal(projectSettlement(state).entities.find(e=>e.id==='house-1').sprite,'house-1');
 state=core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-1'});
 assert.equal(projectSettlement(state).entities.some(e=>e.kind==='cattle'&&e.id==='cattle-1'),false);
});
