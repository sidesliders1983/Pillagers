import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { load } from './load-source.mjs';
const { CameraObstacles } = load('../src/camera/CameraObstacles.ts');

test('local orbit clearance includes the actual transformed tree instances and rejects blocked eye-to-animal views', () => {
    const geometry = new BoxGeometry(2, 4, 2), material = new MeshBasicMaterial();
    const forest = new InstancedMesh(geometry, material, 2);
    forest.name = 'conifer-test';
    forest.setMatrixAt(0, new Matrix4().makeTranslation(0, 2, 0));
    forest.setMatrixAt(1, new Matrix4().makeTranslation(100, 2, 0));
    const root = new Group(); root.add(forest); root.updateMatrixWorld(true);
    try {
        const obstacles = new CameraObstacles([root], [0, 1, 0], 20, []);
        assert.equal(obstacles.limited, false);
        assert.equal(obstacles.count, 1, 'Distant forest is not retained in the local orbit path');
        assert.equal(obstacles.allows({ position: [-5, 2, 0], target: [5, 2, 0] }), false);
        assert.equal(obstacles.allows({ position: [0, 2, 0], target: [5, 2, 0] }), false);
        assert.equal(obstacles.allows({ position: [-5, 6, 0], target: [5, 6, 0] }), true);
    } finally { geometry.dispose(); material.dispose(); forest.dispose(); }
});

test('current visible house, tent and longship roots block the orbit without including hidden structures', () => {
    const geometry = new BoxGeometry(4, 5, 4), material = new MeshBasicMaterial();
    const root = new Group();
    const house = new Group(); house.name = 'building:observed-home';
    house.add(new Mesh(geometry, material)); house.position.set(0, 2.5, 0);
    const hidden = house.clone(); hidden.name = 'household:unobserved'; hidden.visible = false;
    hidden.position.x = 10;
    const ship = house.clone(); ship.name = 'longship:landing'; ship.position.x = -10;
    root.add(house, hidden, ship);
    try {
        const obstacles = new CameraObstacles([root], [0, 2, 0], 30, []);
        assert.equal(obstacles.count, 2);
        assert.equal(obstacles.allows({ position: [-5, 2, 0], target: [5, 2, 0] }), false);
        assert.equal(obstacles.allows({ position: [10, 2, -5], target: [10, 2, 5] }), true);
        assert.equal(obstacles.allows({ position: [-10, 2, -5], target: [-10, 2, 5] }), false);
    } finally { geometry.dispose(); material.dispose(); }
});
