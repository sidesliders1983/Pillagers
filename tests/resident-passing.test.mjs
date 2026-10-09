import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { load } from './load-source.mjs';

const { MovementSystem, residentMovementConfig } = load('../src/systems/MovementSystem.ts');
const { Villager } = load('../src/entities/Villager.ts');

function besideWall() {
    const terrain = {
        walkable: (x, z) => x < .65 && x > -8 && Math.abs(z) < 8,
        heightAt: () => 0,
        randomPosition: random => ({ x: -1 - random() * 6, z: random() * 12 - 6 }),
    };
    const walker = new Villager(0, new Group());
    const neighbour = new Villager(1, new Group());
    const residents = [walker, neighbour];
    const movement = new MovementSystem(residents, undefined, terrain);
    residents.forEach(resident => { resident.socialEnabled = false; });
    walker.visual.position.set(0, 0, 0);
    Object.assign(walker.target, { x: 0, z: 5 });
    neighbour.visual.position.set(0, 0, 1.15);
    Object.assign(neighbour.target, { x: 0, z: 1.15 });
    neighbour.wait = 60;
    return { walker, neighbour, movement, terrain };
}

test('resident passes a waiting neighbour beside a wall using the open side', () => {
    const { walker, neighbour, movement, terrain } = besideWall();
    const destination = { ...walker.target };
    for (let frame = 0; frame < 160; frame++) {
        const before = walker.visual.position.clone();
        movement.update(.05);
        const position = walker.visual.position;
        assert.ok(terrain.walkable(position.x, position.z), 'resident enters the wall');
        assert.ok(position.distanceTo(neighbour.visual.position) >=
            2 * residentMovementConfig.radius - 1e-6, 'residents overlap');
        const dx = position.x - before.x, dz = position.z - before.z;
        if (Math.hypot(dx, dz) > 1e-8) {
            assert.ok(dx * Math.sin(walker.visual.rotation.y) +
                dz * Math.cos(walker.visual.rotation.y) > 0, 'resident walks backwards');
        }
    }
    assert.ok(walker.visual.position.z > 2.2, 'resident fails to pass despite an open route');
    assert.deepEqual(walker.target, destination, 'avoidance replaces the intended destination');
});
test('approaching social residents still meet before avoidance takes over', () => {
    const residents = [new Villager(0, new Group()), new Villager(1, new Group())];
    const terrain = {
        walkable: (x, z) => Math.abs(x) < 8 && Math.abs(z) < 8,
        heightAt: () => 0,
        randomPosition: random => ({ x: random() * 12 - 6, z: random() * 12 - 6 }),
    };
    const movement = new MovementSystem(residents, undefined, terrain);
    residents[0].visual.position.set(-1.5, 0, 0);
    residents[1].visual.position.set(1.5, 0, 0);
    Object.assign(residents[0].target, { x: 5, z: 0 });
    Object.assign(residents[1].target, { x: -5, z: 0 });
    residents[0].visual.rotation.y = Math.PI / 2;
    residents[1].visual.rotation.y = -Math.PI / 2;
    for (let frame = 0; frame < 60; frame++) movement.update(.05);
    assert.equal(residents[0].partnerId, residents[1].id);
    assert.equal(residents[1].partnerId, residents[0].id);
    assert.deepEqual(residents.map(resident => resident.interactionState), ['talking', 'listening']);
});
test('resident leaves a crowded wall corner by turning around before passing', () => {
    const { walker, neighbour, movement, terrain } = besideWall();
    walker.visual.position.set(.64, 0, .42);
    Object.assign(walker.target, { x: .64, z: 5 });
    neighbour.visual.position.set(.64, 0, 1.38);
    Object.assign(neighbour.target, { x: .64, z: 1.38 });
    const beside = new Villager(2, new Group());
    movement.villagers.push(beside);
    movement.spawn(beside);
    beside.socialEnabled = false;
    beside.visual.position.set(-.326, 0, .42);
    Object.assign(beside.target, { x: -.326, z: .42 });
    beside.wait = 60;
    const destination = { ...walker.target };
    let withdrew = false;
    for (let frame = 0; frame < 240; frame++) {
        const before = walker.visual.position.clone();
        movement.update(.05);
        const position = walker.visual.position;
        withdrew ||= position.z < -.5;
        assert.ok(terrain.walkable(position.x, position.z), 'resident enters the wall');
        for (const other of [neighbour, beside]) {
            assert.ok(position.distanceTo(other.visual.position) >=
                2 * residentMovementConfig.radius - 1e-6, 'residents overlap');
        }
        const dx = position.x - before.x, dz = position.z - before.z;
        if (Math.hypot(dx, dz) > 1e-8) {
            assert.ok(dx * Math.sin(walker.visual.rotation.y) +
                dz * Math.cos(walker.visual.rotation.y) > 0, 'resident walks backwards');
        }
    }
    assert.ok(withdrew, 'resident does not use the free route behind it');
    assert.ok(walker.visual.position.z > 2.2, 'resident does not resume its intended route');
    assert.deepEqual(walker.target, destination);
});
test('resident starts steering before reaching a building on its route', () => {
    const terrain = {
        walkable: (x, z) => Math.abs(x) < 8 && Math.abs(z) < 8 &&
            !(Math.abs(x) < .8 && z >= .8 && z <= 2.8),
        heightAt: () => 0,
        randomPosition: random => ({ x: random() * 12 - 6, z: -2 }),
    };
    const resident = new Villager(0, new Group());
    const movement = new MovementSystem([resident], undefined, terrain);
    resident.visual.position.set(0, 0, 0);
    Object.assign(resident.target, { x: 0, z: 5 });
    let turnedEarly = false;
    for (let frame = 0; frame < 20; frame++) {
        movement.update(.05);
        const position = resident.visual.position;
        turnedEarly ||= position.z < .4 && Math.abs(resident.visual.rotation.y) > .1;
        assert.ok(terrain.walkable(position.x, position.z), 'resident enters the building');
    }
    assert.ok(turnedEarly, 'resident waits until the building is immediately in front of it');
    assert.deepEqual(resident.target, { x: 0, z: 5 });
});
test('terrain steering does not prevent an approaching social encounter', () => {
    const terrain = {
        walkable: (x, z) => Math.abs(x) < 8 && Math.abs(z) < 8 &&
            !(Math.abs(x) < .8 && z >= .8 && z <= 2.8),
        heightAt: () => 0,
        randomPosition: random => ({ x: random() * 12 - 6, z: -2 }),
    };
    const residents = [new Villager(0, new Group()), new Villager(1, new Group())];
    const movement = new MovementSystem(residents, undefined, terrain);
    residents[0].visual.position.set(0, 0, 0);
    Object.assign(residents[0].target, { x: 0, z: 5 });
    residents[1].visual.position.set(-5, 0, -5);
    Object.assign(residents[1].target, { x: -5, z: -5 });
    residents[1].wait = 60;
    movement.update(.05);
    assert.ok(residents[0].visual.rotation.y > .1, 'resident has begun steering around the building');
    residents[1].visual.position.set(.9, 0, .5);
    Object.assign(residents[1].target, { x: 0, z: -5 });
    residents[1].wait = 0;
    movement.update(.05);
    assert.equal(residents[0].partnerId, residents[1].id);
    assert.equal(residents[1].partnerId, residents[0].id);
});
