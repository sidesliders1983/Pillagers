import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const camera = { x: 0, y: 0, z: 0 };
const geography = { waterLevel: 0, coast: [{ a: { x: 0, z: -10 }, b: { x: 30, z: -10 } }] };
const frame = { focus: camera, season: 'Summer', weather: 'Normal', now: 0,
    known: () => true, visible: () => true,
    fire: { id: 'fire', position: { x: 2, y: 0, z: 0 }, lit: true }, actors: [] };

test('the real lit fire and observed adult cows enter the mix without hidden or invented animals', () => {
    const { SettlementSounds } = load('../src/audio/SettlementSounds.ts');
    const projection = new SettlementSounds(geography);
    const cow = { id: 'cow-1', kind: 'livestock', species: 'cattle', sex: 'female', stage: 'Adult',
        position: { x: 4, y: 0, z: 0 }, observable: true };
    const actors = [cow, { ...cow, id: 'calf', stage: 'Young' },
        { ...cow, id: 'bull', sex: 'male' }, { ...cow, id: 'goat', species: 'goat' },
        { ...cow, id: 'hidden', observable: false }];
    const sources = projection.project({ ...frame, actors });
    assert.deepEqual(sources.filter(s => s.cue === 'cow').map(s => s.id), ['cow-1']);
    assert.ok(sources.some(s => s.id === 'fire' && s.cue === 'campfire'));
    assert.ok(!projection.project({ ...frame, fire: { ...frame.fire, lit: false } }).some(s => s.id === 'fire'));
    assert.ok(!projection.project({ ...frame, visible: () => false, actors }).some(s =>
        s.cue === 'cow' || s.cue === 'gull' || s.cue === 'campfire'));
});

test('only a real observable gull receives its call, independently of render culling', () => {
    const { SettlementSounds } = load('../src/audio/SettlementSounds.ts');
    const projection = new SettlementSounds(geography);
    const gull = { id: 'gull-1', kind: 'wildlife', species: 'great-black-backed-gull',
        observable: true, position: camera };
    assert.deepEqual(projection.project({ ...frame, actors: [gull,
        { ...gull, id: 'submerged', observable: false }, { ...gull, id: 'seal', species: 'seal' }] })
        .filter(s => s.cue === 'gull').map(s => s.id), ['gull-1']);
});

test('a real animation crossing emits once; refresh, late observation and hitches never catch up impacts', () => {
    const { WorkContacts } = load('../src/audio/WorkContacts.ts');
    const contacts = new WorkContacts();
    const action = { id: 'worker', position: camera, target: 'tree-1', generation: 'model:1',
        loop: 0, clip: 'Attack', time: .8, duration: 2.8333332538604736 };
    assert.equal(contacts.sample(0, [action], true).fresh, false);
    const crossing = contacts.sample(.05, [{ ...action, time: 1.1 }], true);
    assert.equal(crossing.fresh, true);
    assert.equal(crossing.sources.length, 1);
    assert.equal(contacts.sample(.1, [{ ...action, time: 1.2 }], true).fresh, false);
    const removed = contacts.sample(.15, [], true);
    assert.deepEqual(removed.sources, []);
    assert.equal(removed.invalidated, true, 'A removed action must stop its tail before the ambient cadence');
    assert.equal(contacts.sample(.2, [{ ...action, time: 1.2, generation: 'model:2' }], true).fresh, false);
    contacts.sample(.25, [{ ...action, generation: 'model:3' }], true);
    assert.equal(contacts.sample(3, [{ ...action, time: 1.4, generation: 'model:3' }], true).fresh, false);
    assert.deepEqual(contacts.sample(3.1, [action], false).sources, []);
});

test('known coastline weights an independent shore bed and wind crossfades across seasons', () => {
    const { SettlementSounds } = load('../src/audio/SettlementSounds.ts');
    const projection = new SettlementSounds(geography);
    const summer = projection.project(frame);
    assert.equal(summer.find(s => s.cue === 'wind-summer').weight, 1);
    assert.ok(summer.find(s => s.cue === 'sea-waves').weight > .7);
    const change = projection.project({ ...frame, now: 1, season: 'Winter' });
    assert.ok(change.find(s => s.cue === 'wind-summer').weight > 0);
    assert.ok(change.find(s => s.cue === 'wind-normal-winter').weight > 0);
    assert.ok(!projection.project({ ...frame, now: 2, known: () => false }).some(s => s.cue === 'sea-waves'));
    assert.ok(!projection.project({ ...frame, focus: { x: 300, y: 0, z: 300 }, now: 3 }).some(s => s.cue === 'sea-waves'));
});
