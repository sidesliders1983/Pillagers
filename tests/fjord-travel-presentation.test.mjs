import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { loadDOMSource as load } from './load-dom-source.mjs';

const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { spatialMemberPosition } = load('../src/simulation/SpatialExpeditions.ts');
const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
    navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
    settlement: { center: { x: 16, z: 64 }, harbor: null },
};
const models = {
    async create() {
        const root = new Group();
        root.add(new Mesh(new BoxGeometry(.6, 1.5, .6), new MeshBasicMaterial()));
        return root;
    },
    async reconcile() {}, boundsShape: () => 'fixed', pace: () => 1,
    animate(model, clip) { model.userData.testClip = clip; },
    release(root) {
        root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
        return true;
    },
};
function departure() {
    const session = new GameplaySession(32);
    session.initializeDiscovery(world, 'travel-cadence-fixture');
    for (const command of [
        { type: 'CreateExplorationGroup' },
        { type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-1', included: true },
        { type: 'StartExpedition', groupId: 'group-1' },
        { type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } },
    ]) session.command(command);
    session.setRunning(true);
    return session;
}

test('expedition running has no repeated standstill between 500 ms updates of a 600 ms Core tick', async () => {
    const session = departure(), layer = new FjordEntities(models);
    const emptyMotion = { inspect: () => [] };
    const refresh = async () => {
        const state = session.readSnapshot(), mission = state.world.spatial.missions['explore-1'];
        layer.prepareExpeditions(state, world, .5,
            session.effectiveMinutesPerWinter * 60 / state.ticksPerWinter);
        const point = spatialMemberPosition(mission, 'founder-1');
        await layer.sync([{ kind: 'persona', id: 'founder-1', selectionKey: 'persona:founder-1',
            asset: 'resident', transform: { ...point, y: 0, scale: 1 },
            status: { living: true, expedition: mission.id } }]);
    };
    try {
        await refresh();
        const resident = layer.root.getObjectByName('persona:founder-1');
        let previous = resident.position.x, standstillFrames = 0;
        for (let frame = 1; frame <= 120; frame++) {
            layer.advance(emptyMotion, .1, true);
            if (frame > 20 && Math.abs(resident.position.x - previous) < 1e-6) standstillFrames++;
            const mission = session.readSnapshot().world.spatial.missions['explore-1'];
            assert.ok(resident.position.x <= spatialMemberPosition(mission, 'founder-1').x + 1e-6,
                'Presentation never predicts travel beyond the confirmed route position');
            previous = resident.position.x;
            if (frame % 5 === 0) { session.elapse(500); await refresh(); }
        }
        assert.equal(standstillFrames, 0, 'A running resident must keep progressing between ordinary clock batches');
        const before = session.saveJSON(), paused = resident.position.clone();
        layer.advance(emptyMotion, 3, false);
        assert.deepEqual(resident.position, paused, 'Pausing holds the displayed position');
        assert.equal(session.saveJSON(), before, 'Rendering cannot spend provisions or advance Core');
    } finally { layer.dispose(); }
});
