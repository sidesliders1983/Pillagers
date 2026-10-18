import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { projectFjordGround } = load('../src/fjord-play/FjordGround.ts');

function flatWorld() {
    let surfaceReads = 0;
    const heights = Array(31 * 31).fill(10);
    const world = {
        waterLevel: 0,
        terrain: {
            bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
            spacing: 4, columns: 31, rows: 31,
            get heights() { surfaceReads++; return heights; }
        }
    };
    return { world, reads: () => surfaceReads };
}

function settlement(id, x) {
    const campfire = {
        id, transform: { x, y: 10, z: 0, rotation: 0, scale: 2 },
        clearingRadius: 7, obstacleRadius: 4.4
    };
    const entities = [{
        id: id + ':house', selectionKey: 'building:' + id + ':house', kind: 'building',
        plot: { x: x + 15, y: 10, z: 0, rotation: 0, scale: 1, halfWidth: 3, halfDepth: 3 }
    }];
    return { campfire, entities };
}

test('alternating clan projections retain independent paths without rescanning unchanged terrain', () => {
    const fixture = flatWorld();
    const home = settlement('home', 20), rival = settlement('rival', -30);
    const project = site => projectFjordGround(fixture.world,
        structuredClone(site.entities), structuredClone(site.campfire));
    const homeGround = project(home), rivalGround = project(rival);
    assert.equal(homeGround.paths.length, 1);
    assert.equal(rivalGround.paths.length, 1);
    const originalHome = structuredClone(homeGround);
    const originalRival = structuredClone(rivalGround);
    const initialReads = fixture.reads();
    for (let revision = 0; revision < 5; revision++) {
        assert.deepEqual(project(home), originalHome);
        assert.deepEqual(project(rival), originalRival);
    }
    assert.equal(fixture.reads(), initialReads,
        'An unrelated clan projection must not discard an unchanged settlement path network');
    homeGround.paths[0].points[0].x = -999;
    homeGround.plots[0].plot.x = -999;
    rivalGround.paths.length = 0;
    assert.deepEqual(project(home), originalHome, 'Readers own their nested path and plot data');
    assert.deepEqual(project(rival), originalRival);
});

test('house, tent and campfire changes invalidate only the affected settlement', () => {
    const fixture = flatWorld();
    const home = settlement('home', 20), rival = settlement('rival', -30);
    const project = site => projectFjordGround(fixture.world, site.entities, site.campfire);
    const rivalGround = project(rival);
    project(home);
    const changes = [
        () => { home.entities[0].plot.rotation = Math.PI / 2; },
        () => { home.entities.push({ ...structuredClone(home.entities[0]),
            id: 'home:second', selectionKey: 'building:home:second',
            plot: { ...home.entities[0].plot, x: 20, z: 16 } }); },
        () => { home.entities.push({ id: 'home:tent', kind: 'household',
            selectionKey: 'household:home:tent',
            plot: { x: 28, y: 10, z: -10, rotation: 0, scale: 1, halfWidth: 3, halfDepth: 3 } }); },
        () => { home.campfire.transform.z = -3; },
        () => { home.entities.splice(0, 1); }
    ];
    for (const change of changes) {
        const before = fixture.reads();
        change();
        const actual = project(home);
        const independent = flatWorld();
        assert.deepEqual(actual,
            projectFjordGround(independent.world, home.entities, home.campfire));
        assert.equal(fixture.reads(), before + 1, 'Changed geometry must rebuild its path network');
        assert.deepEqual(project(rival), rivalGround);
        assert.deepEqual(project(home), actual);
        assert.equal(fixture.reads(), before + 1, 'Other clans retain their verified paths');
    }
});

test('settlement caches stay bounded per world and never cross geography instances', () => {
    const fixture = flatWorld();
    const sites = Array.from({ length: 9 }, (_, index) => settlement('site-' + index, 0));
    const project = site => projectFjordGround(fixture.world, site.entities, site.campfire);
    const first = project(sites[0]);
    for (const site of sites.slice(1)) project(site);
    const before = fixture.reads();
    project(sites.at(-1));
    assert.equal(fixture.reads(), before, 'The newest site remains reusable');
    assert.deepEqual(project(sites[0]), first);
    assert.equal(fixture.reads(), before + 1, 'The oldest overflow entry is recomputed safely');
    const another = flatWorld();
    assert.deepEqual(projectFjordGround(another.world, sites[0].entities, sites[0].campfire), first);
    assert.equal(another.reads(), 1, 'Another geography must perform its own terrain queries');
});
