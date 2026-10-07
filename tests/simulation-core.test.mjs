import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const {createFixtureClan, personaAge} = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
test('headless fixture starts at Winter 800 with persistent people and distinct domestic records', () => {
  const state = createFixtureClan(26);
  assert.equal(state.time.winter, 800);
  assert.equal(state.time.tick, 0);
  assert.equal(personaAge(state, 'einar'), 32);
  assert.equal(state.personas.astrid.parentIds[0], 'einar');
  assert.equal(state.households.home.residenceId, 'residence');
  assert.equal(state.residences.residence.buildingId, 'house');
  assert.equal(state.events[0].type, 'ClanInitialized');
  assert.ok(Number.isSafeInteger(state.stocks.food));
  assert.ok(Number.isSafeInteger(state.stocks.materials));
});

test('a Winter step equals 1000 ticks and retains the partial tick position', () => {
  const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
  const initial = createFixtureClan(26);
  const partial = core.applyCommand(initial, {type: 'AdvanceTicks', ticks: 430});
  const next = core.advanceWinter(partial);
  assert.deepEqual(next.time, {winter: 801, tick: 430});
  assert.equal(personaAge(next, 'astrid'), 1);
  assert.deepEqual(next.stocks, {food: 20, materials: 10});
  assert.equal(next.events.filter(e => e.type === 'WinterAdvanced').length, 1);
  assert.deepEqual(initial.time, {winter: 800, tick: 0});
  assert.deepEqual(core.applyCommand(initial, {type: 'AdvanceTicks', ticks: 16000}).time, {winter: 816, tick: 0});
  assert.equal(personaAge(core.applyCommand(initial, {type: 'AdvanceTicks', ticks: 16000}), 'astrid'), 16);
});

test('occupation commands preserve history and reject invalid assignments atomically', () => {
  const {applyCommand} = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
  const initial = createFixtureClan(26);
  const first = applyCommand(initial, {type: 'AssignOccupation', personaId: 'einar', occupation: 'smith'});
  const later = applyCommand(first, {type: 'AdvanceTicks', ticks: 430});
  const next = applyCommand(later, {type: 'AssignOccupation', personaId: 'einar', occupation: 'farmer'});
  assert.equal(next.personas.einar.occupation, 'farmer');
  assert.deepEqual(next.personas.einar.occupationHistory[0], {occupation: 'smith', startedAt: {winter: 800, tick: 0}, endedAt: {winter: 800, tick: 430}});
  assert.equal(next.events.at(-1).personaId, 'einar');
  assert.equal(initial.personas.einar.occupation, null);
  assert.throws(() => applyCommand(next, {type: 'AssignOccupation', personaId: 'missing', occupation: 'smith'}));
  assert.throws(() => applyCommand(next, {type: 'AssignOccupation', personaId: 'einar', occupation: 'wizard'}));
  assert.throws(() => applyCommand(next, {type: 'AdvanceTicks', ticks: 0.5}));
});

test('identical seed and commands replay identically, including after save/load without offline progress', () => {
  const {applyCommand, serializeState, reconstructState} = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
  const commands = [{type: 'AssignOccupation', personaId: 'einar', occupation: 'smith'}, {type: 'AdvanceTicks', ticks: 17430}, {type: 'AdvanceWinter'}];
  const run = () => commands.reduce(applyCommand, createFixtureClan(26));
  assert.deepEqual(run(), run());
  assert.notDeepEqual(createFixtureClan(26).personas.einar.dna, createFixtureClan(27).personas.einar.dna);
  const saved = serializeState(run());
  const clock = Date.now, random = Math.random;
  try {
    Date.now = () => {throw new Error('Wall-clock access forbidden');};
    Math.random = () => {throw new Error('Unseeded randomness forbidden');};
    const resumed = reconstructState(saved);
    assert.deepEqual(resumed.time, {winter: 818, tick: 430});
    assert.equal(serializeState(resumed), saved);
    assert.deepEqual(applyCommand(resumed, {type: 'AdvanceWinter'}), applyCommand(run(), {type: 'AdvanceWinter'}));
  } finally {Date.now = clock; Math.random = random;}
});

test('canonical saves and commands reject fractional or unsafe resources, progress and calendar values', () => {
  const {serializeState, reconstructState, advanceWinter} = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
  for (const mutate of [s => s.stocks.food = 1.5, s => s.stocks.materials = -1, s => s.stocks.food = Number.MAX_SAFE_INTEGER + 1, s => s.time.tick = 1000, s => s.time.winter = 799, s => s.ticksPerWinter = 0, s => s.personas.einar.workProgress = 0.5, s => s.personas.astrid.parentIds = ['missing'], s => s.schemaVersion = 2]) {
    const invalid = createFixtureClan(26); mutate(invalid);
    assert.throws(() => reconstructState(JSON.stringify(invalid)));
    assert.throws(() => serializeState(invalid));
    assert.throws(() => advanceWinter(invalid));
  }
});

test('save reconstruction rejects invalid occupation history and backwards events', () => {
  const {applyCommand, reconstructState} = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
  const base = applyCommand(createFixtureClan(26), {type: 'AssignOccupation', personaId: 'einar', occupation: 'smith'});
  for (const mutate of [s => s.personas.einar.occupation = 'wizard', s => s.personas.einar.occupationHistory[0].startedAt.tick = 0.5, s => s.personas.einar.occupationHistory[0].occupation = 'wizard', s => s.personas.einar.occupationHistory[0].endedAt = {winter: 799, tick: 0}]) {
    const invalid = structuredClone(base); mutate(invalid);
    assert.throws(() => reconstructState(JSON.stringify(invalid)));
  }
});
