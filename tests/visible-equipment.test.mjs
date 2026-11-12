import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { fjordLivestockRules } = load('../src/config/FjordLivestock.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');

function equippedSession() {
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(core.createCampaign(32,
        { initialFood: 100000, initialMaterials: 1000, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, {}, {}, {}, undefined, undefined, { player: fjordLivestockRules })));
    session.command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    session.command({ type: 'AssignOccupation', personaId: 'founder-2', occupation: 'leatherAndJewelleryMaker' });
    session.command({ type: 'SlaughterLivestock', livestockId: Object.keys(session.readSnapshot().landing.cattle)[0] });
    for (const [item, target] of [['woodenSpear', 2], ['woodenShield', 1], ['leatherShield', 1]])
        session.command({ type: 'SetSmitheryTarget', item, target });
    session.command({ type: 'AdvanceTicks', ticks: 3000 });
    assert.ok(session.readSnapshot().smithery.stored.woodenSpear >= 2);
    assert.ok(session.readSnapshot().smithery.stored.woodenShield >= 1);
    assert.ok(session.readSnapshot().smithery.stored.leatherShield >= 1);
    for (const [personaId, slot, item] of [
        ['founder-3', 'weapon', 'woodenSpear'], ['founder-3', 'shield', 'woodenShield'],
        ['founder-4', 'weapon', 'woodenSpear'], ['founder-5', 'shield', 'leatherShield'],
    ]) session.command({ type: 'AssignEquipment', personaId, slot, item });
    return session;
}

test('four real residents expose their own crafted both, spear-only, shield-only and empty loadouts without spending on projection', () => {
    const session = equippedSession();
    const state = session.readSnapshot();
    const before = session.saveJSON();
    const world = generateWorld({ seed: state.seed });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const expected = [
        ['founder-3', { weapon: 'woodenSpear', shield: 'woodenShield' }],
        ['founder-4', { weapon: 'woodenSpear', shield: null }],
        ['founder-5', { weapon: null, shield: 'leatherShield' }],
        ['founder-6', { weapon: null, shield: null }],
    ];
    for (const [id, equipment] of expected) {
        const actor = view.entities.find(entity => entity.kind === 'persona' && entity.id === id);
        assert.deepEqual(actor.status.equipment, equipment, actor.label + ' retains individual assignments');
    }
    assert.equal(session.saveJSON(), before, 'Opening the world cannot equip, craft or spend inventory');
    assert.equal(core.serializeState(core.reconstructState(before)), before);
});

function nativeFactory() {
    return Promise.all([import('node:fs/promises'), import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/libs/meshopt_decoder.module.js')]).then(([{ readFile }, { GLTFLoader }, { MeshoptDecoder }]) => {
        globalThis.self = globalThis;
        globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
        const bytes = async path => {
            const buffer = await readFile(new URL('../public' + path.split('?')[0], import.meta.url));
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        };
        return new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
    });
}

test('the native factory installs two independently authored hand props together while legacy scalar choices retain their body', async () => {
    const factory = await nativeFactory();
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const dna = { ...defaultDNA(), age: 32 };
    const bare = { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none' };
    const human = await factory.create(dna, 2, undefined, bare);
    try {
        const root = human.root, skeleton = human.fit.nativeSkeleton;
        const equipmentItems = ['equipment/occupation-smith', 'equipment/occupation-hunter'];
        await factory.equip(human, { ...bare, equipmentItems });
        assert.ok(equipmentItems.every(id => human.fit.modules.has(id)), 'Both actual left and right native props are installed');
        assert.deepEqual(human.root.userData.selectedAssets.equipmentItems, equipmentItems);
        assert.equal(human.root, root);
        assert.equal(human.fit.nativeSkeleton, skeleton);
        assert.deepEqual(human.dna, dna);
        const revision = human.fit.revision;
        for (const gait of ['Idle', 'Walk', 'Run']) human.sampleAnimation(gait, .4);
        assert.equal(human.fit.revision, revision, 'Playing native motion does not refit equipment');
        await factory.equip(human, { ...bare, equipment: equipmentItems[0] });
        assert.equal(human.fit.modules.has(equipmentItems[0]), true);
        assert.equal(human.fit.modules.has(equipmentItems[1]), false);
        assert.equal(human.root.userData.selectedAssets.equipment, equipmentItems[0]);
        assert.equal(human.root, root, 'Legacy single-item consumers keep the same verified native body');
        const installed = [...human.fit.modules.keys()];
        await assert.rejects(factory.equip(human, { ...bare, equipment: 'equipment/occupation-smith',
            equipmentItems: ['equipment/occupation-fisher'] }), /each native hand/);
        assert.deepEqual([...human.fit.modules.keys()], installed, 'An explicit invalid same-hand stack retains the last valid presentation');
    } finally { human.dispose(); }
});

test('expedition gear is layered over the normal tunic with no occupation hat or same-hand tool and work clothes return at home', () => {
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { fjordWardrobePresentation } = load('../src/fjord-play/FjordWardrobe.ts');
    const resident = { kind: 'persona', dna: { ...defaultDNA(), age: 32 },
        status: { living: true, occupation: 'fisher',
            equipment: { weapon: 'woodenSpear', shield: 'woodenShield' } } };
    const before = structuredClone(resident);
    const away = fjordWardrobePresentation({ ...resident, status: { ...resident.status, expedition: 'explore-1' } });
    assert.equal(away.outfit, 'garment/meshy-grid-trial-001');
    assert.equal(away.headwear, 'none');
    assert.equal(away.equipment, 'none');
    assert.deepEqual(away.equipmentItems, ['equipment/native-wooden-spear', 'equipment/native-wooden-shield']);
    const home = fjordWardrobePresentation(resident);
    assert.equal(home.top, 'garment/meshy-fisherman-tunic-009');
    assert.equal(home.equipment, 'equipment/occupation-fisher', 'At home the worker restores the tool in its authored hand');
    assert.deepEqual(home.equipmentItems, ['equipment/native-wooden-shield'],
        'The owned spear is stowed while the work tool occupies the right hand');
    assert.equal(home.hair, away.hair);
    assert.equal(home.beard, away.beard);
    const shieldOnly = fjordWardrobePresentation({ ...resident, status: { ...resident.status,
        equipment: { weapon: null, shield: 'leatherShield' } } });
    assert.equal(shieldOnly.equipment, 'equipment/occupation-fisher', 'A free opposite hand retains the work tool');
    assert.deepEqual(shieldOnly.equipmentItems, ['equipment/native-leather-shield']);
    const unarmed = fjordWardrobePresentation({ ...resident, status: { ...resident.status,
        expedition: 'explore-2', equipment: { weapon: null, shield: null } } });
    assert.deepEqual(unarmed.equipmentItems, [], 'An expedition never creates unassigned gear');
    assert.deepEqual(resident, before, 'Wardrobe selection cannot change identity or canonical assignments');
});

test('the Character Card portrait receives the same actual two-item loadout and refreshes after a real unequip without changing inventory', async () => {
    const { JSDOM } = await import('jsdom');
    const { loadDOMSource } = await import('./load-dom-source.mjs');
    const dom = new JSDOM('<main id="fjord-play"><nav id="fjord-navigation"></nav>' +
        '<section id="fjord-management"><div id="entity-panel"></div></section>' +
        '<section id="fjord-workspace" hidden></section><button id="fjord-attention"></button>' +
        '<span id="fjord-attention-count"></span></main>', { url: 'http://localhost/fjord-play' });
    const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLDetailsElement', 'AbortController', 'matchMedia'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    globalThis.matchMedia = () => ({ matches: true });
    let ui;
    try {
        const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
        const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
        const session = equippedSession();
        session.command({ type: 'AssignOccupation', personaId: 'founder-3', occupation: null });
        const owner = new SharedSettlement(session);
        owner.select({ kind: 'persona', id: 'founder-3' });
        const rendered = [];
        const refresh = () => ui.refresh(session.readSnapshot(), owner.selection, '', () => '');
        ui = new FjordInterface(owner, { refresh, select() {}, notify() {}, commit() {},
            renderPortrait: async input => {
                rendered.push(structuredClone(input));
                return 'data:image/png;base64,gear-' + rendered.length;
            } });
        const before = session.saveJSON();
        refresh();
        assert.ok(await ui.requestPortrait('founder-3'));
        assert.deepEqual(rendered.at(-1).presentation.equipmentItems,
            ['equipment/native-wooden-spear', 'equipment/native-wooden-shield']);
        assert.equal(rendered.at(-1).framing, 'equipment', 'The shared renderer must include the visible shield in its crop');
        assert.equal(session.saveJSON(), before);
        const first = await ui.requestPortrait('founder-3');
        const count = rendered.length;
        assert.equal(await ui.requestPortrait('founder-3'), first);
        assert.equal(rendered.length, count, 'A matching loadout reuses its portrait');
        session.command({ type: 'AssignEquipment', personaId: 'founder-3', slot: 'shield', item: null });
        const unequipped = session.saveJSON();
        refresh();
        assert.ok(await ui.requestPortrait('founder-3'));
        assert.deepEqual(rendered.at(-1).presentation.equipmentItems, ['equipment/native-wooden-spear']);
        assert.equal(session.saveJSON(), unequipped, 'Portrait refresh cannot spend or recreate equipment');
    } finally {
        ui?.dispose();
        dom.window.close();
        Object.assign(globalThis, previous);
    }
});

test('mobilised defenders layer their actual gear over the same tunic while ordinary watch keeps work clothes', () => {
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { fjordWardrobePresentation } = load('../src/fjord-play/FjordWardrobe.ts');
    const defender = { kind: 'persona', dna: { ...defaultDNA(), age: 32, sex: 'female' },
        status: { living: true, occupation: 'fisher', equipment: { weapon: 'woodenSpear', shield: 'leatherShield' },
            presence: { duty: { incidentId: 'incident-1', role: 'mobilise' } } } };
    const combat = fjordWardrobePresentation(defender);
    assert.equal(combat.outfit, 'garment/meshy-grid-trial-001');
    assert.equal(combat.headwear, 'none');
    assert.equal(combat.equipment, 'none');
    assert.deepEqual(combat.equipmentItems, ['equipment/native-wooden-spear', 'equipment/native-leather-shield']);
    const watch = fjordWardrobePresentation({ ...defender, status: { ...defender.status,
        presence: { duty: { incidentId: 'incident-1', role: 'watch' } } } });
    assert.equal(watch.top, 'garment/meshy-fisherman-tunic-009');
    assert.equal(watch.equipment, 'equipment/occupation-fisher');
    const explicit = fjordWardrobePresentation({ ...defender, status: { ...defender.status, presence: undefined,
        encounter: { id: 'encounter-1', phase: 'engaging', facing: null } } });
    assert.equal(explicit.outfit, combat.outfit);
    assert.deepEqual(explicit.equipmentItems, combat.equipmentItems);
});

test('eligible sixteen and seventeen year old expedition bodies retain real fitted tunic coverage underneath both supplied props', async () => {
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
    const { Vector3 } = await import('three');
    const factory = await nativeFactory();
    for (const age of [16, 17]) for (const sex of ['male', 'female']) {
        const dna = { ...defaultDNA(), age, sex };
        const human = await factory.create(dna, 2, undefined,
            { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none' });
        const diagnostics = [];
        const wardrobe = new FjordWardrobe(factory, message => diagnostics.push(message));
        try {
            await wardrobe.reconcile(human, { kind: 'persona', id: sex + '-' + age, dna,
                status: { living: true, occupation: 'fisher', expedition: 'explore-1',
                    equipment: { weapon: 'woodenSpear', shield: 'leatherShield' } } });
            assert.ok(human.fit.modules.has('garment/meshy-grid-trial-001'), sex + ' ' + age + ' keeps the actual base tunic');
            assert.ok(human.fit.modules.has('garment/meshy-low-shoes-005'));
            assert.ok(human.fit.modules.has('equipment/native-wooden-spear'));
            assert.ok(human.fit.modules.has('equipment/native-leather-shield'));
            assert.ok(human.fit.mesh.geometry.index.count < human.fit.sourceGeometry.index.count,
                'The real tunic and shoes retain their native body coverage mask');
            const fitRuns = human.modules.fitRuns;
            for (const pose of ['Idle', 'Walk', 'Run']) {
                human.sampleAnimation(pose, .4);
                human.root.updateMatrixWorld(true);
                for (const id of ['garment/meshy-grid-trial-001', 'garment/meshy-low-shoes-005']) {
                    const group = human.fit.modules.get(id);
                    group.traverse(mesh => {
                        if (!mesh.isSkinnedMesh) return;
                        assert.equal(mesh.skeleton, human.fit.nativeSkeleton);
                        const count = mesh.geometry.getAttribute('position').count;
                        for (const vertex of [0, Math.floor(count / 2), count - 1])
                            assert.ok(mesh.getVertexPosition(vertex, new Vector3()).toArray().every(Number.isFinite));
                    });
                }
            }
            assert.equal(human.modules.fitRuns, fitRuns, 'Motion does not repeatedly refit teenage garments');
            assert.deepEqual(human.dna, dna);
            assert.deepEqual(diagnostics, []);
        } finally { human.dispose(); }
    }
});

test('the existing portrait renderer keeps a recognisable head and actual gear references in the emblem, with a full-prop QA frame', async () => {
    const { ResidentPortraitStudio } = load('../src/characters/ResidentPortraitStudio.ts');
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { Group, Color, Vector3, Vector4, SRGBColorSpace } = await import('three');
    const factory = await nativeFactory();
    const human = await factory.create({ ...defaultDNA(), age: 32, sex: 'female' }, 2, undefined,
        { hair: 'none', beard: 'none', outfit: 'garment/meshy-grid-trial-001', shoes: 'garment/meshy-low-shoes-005',
            equipment: 'none', equipmentItems: ['equipment/native-wooden-spear', 'equipment/native-leather-shield'] });
    const world = new Group();
    world.position.set(90, 2, -30);
    world.add(human.root);
    human.root.position.set(8, 1, 4);
    human.root.rotation.y = .8;
    human.root.scale.setScalar(1.15);
    human.sampleAnimation('Walk', .4);
    world.updateMatrixWorld(true);
    const saved = { parent: human.root.parent, matrix: human.root.matrix.toArray(),
        pose: human.animationState, fitRuns: human.modules.fitRuns };
    let target = null, draws = 0, vertices = 0, framing = 'equipment';
    const renderer = {
        toneMapping: 3, toneMappingExposure: .7, autoClear: false, outputColorSpace: SRGBColorSpace,
        shadowMap: { enabled: true }, getRenderTarget: () => target,
        getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
        setRenderTarget(value) { target = value; },
        getViewport: out => out.copy(new Vector4(0, 0, 800, 600)), setViewport() {},
        getScissor: out => out.copy(new Vector4(0, 0, 800, 600)), setScissor() {},
        getScissorTest: () => false, setScissorTest() {},
        getClearColor: out => out.copy(new Color('#123456')), getClearAlpha: () => 1, setClearColor() {},
        render(scene, camera) {
            if (scene.isMesh) return;
            draws++;
            assert.equal(scene.children.includes(human.root), true);
            camera.updateMatrixWorld(true);
            let headVertices = 0, headMin = Infinity, headMax = -Infinity;
            for (let vertex = 0; vertex < human.fit.source.regions.length; vertex++) {
                if (human.fit.source.regions[vertex] !== 'HEAD') continue;
                const ndc = human.fit.mesh.getVertexPosition(vertex, new Vector3())
                    .applyMatrix4(human.fit.mesh.matrixWorld).project(camera);
                assert.ok(Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1,
                    'The actual resident head remains inside the same equipment frame');
                headMin = Math.min(headMin, ndc.y);
                headMax = Math.max(headMax, ndc.y);
                headVertices++;
            }
            assert.ok(headVertices > 0);
            if (framing === 'equipment') assert.ok(headMax - headMin >= 1 / 3,
                'At least twelve of the 72 emblem pixels retain the actual head; projected span=' + (headMax - headMin));
            const hand = human.fit.nativeSkeleton.bones[24].getWorldPosition(new Vector3());
            if (framing === 'equipment') for (const joint of [11, 24]) {
                const ndc = human.fit.nativeSkeleton.bones[joint].getWorldPosition(new Vector3()).project(camera);
                assert.ok(Math.abs(ndc.x) <= 8 / 9 && Math.abs(ndc.y) <= 1, 'Both actual hands stay within the emblem crop');
            }
            for (const id of ['equipment/native-wooden-spear', 'equipment/native-leather-shield']) {
                let total = 0, inside = 0, nearHand = 0, visibleGrip = 0;
                human.fit.modules.get(id).traverse(mesh => {
                    if (!mesh.isSkinnedMesh) return;
                    for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
                        const point = mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld);
                        const ndc = point.clone().project(camera);
                        const visible = Math.abs(ndc.x) <= (framing === 'equipment' ? 8 / 9 : 1) &&
                            Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
                        if (framing === 'equipment-full') assert.ok(visible,
                            id + ' remains complete in the deliberate full-prop QA frame');
                        if (visible) inside++;
                        if (point.distanceTo(hand) < .25 * human.root.getWorldScale(new Vector3()).y) {
                            nearHand++;
                            if (visible) visibleGrip++;
                        }
                        vertices++;
                        total++;
                    }
                });
                if (framing === 'equipment' && id.includes('shield')) assert.ok(inside / total >= .35,
                    'A meaningful actual shield surface stays visible in the head/chest crop');
                if (framing === 'equipment' && id.includes('spear')) assert.ok(nearHand > 0 && visibleGrip / nearHand >= .5,
                    'The actual spear hand/grip and shaft remain visible while its long extent may be cropped');
            }
        },
        readRenderTargetPixels(_target, _x, _y, _width, _height, pixels) { pixels.fill(0); },
    };
    const studio = new ResidentPortraitStudio(renderer, () => 'data:image/png;base64,equipped',
        async () => { throw new Error('A live equipped portrait must reuse its existing rig'); });
    try {
        assert.equal(await studio.render({ framing, pixelRatio: 1 }, human), 'data:image/png;base64,equipped');
        framing = 'equipment-full';
        assert.equal(await studio.render({ framing, pixelRatio: 1 }, human), 'data:image/png;base64,equipped');
        assert.ok(vertices > 12000, 'Both actual supplied props were measured in the two deliberate frames');
        assert.equal(draws, 2, 'The same renderer performs the two on-demand captures');
        assert.equal(human.root.parent, saved.parent);
        assert.deepEqual(human.root.matrix.toArray(), saved.matrix);
        assert.deepEqual(human.animationState, saved.pose);
        assert.equal(human.modules.fitRuns, saved.fitRuns);
        assert.equal(target, null);
    } finally { studio.dispose(); human.dispose(); }
});

test('rival observation shows only actually carried personal gear and hides the entire loadout when the actors leave sight', () => {
    const { inspectRivalSettlement } = load('../src/fjord-play/RivalSettlement.ts');
    const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
    const world = { config: { seed: 32 }, waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
        navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'equipment-rival', center: { x: 352, z: 128 },
            bounds: { minX: 288, maxX: 416, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 16384 } };
    const context = { world, worldId: 'visible-equipment-fixture' };
    let state = core.initializeIslandClans(core.createCampaign(32,
        { initialFood: 100000, initialMaterials: 1000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0, careerReviewWinters: 0, switchTicks: 0, workPerUnit: 100000 },
        { enabled: false }), world, context.worldId);
    const sourceId = state.world.island.clanId;
    // Reference fixture: CPU management is composed from real public Core commands, never phantom items.
    let source = state.world.targetClans[sourceId];
    source = core.applyCommand(source, { type: 'AssignOccupation', personaId: sourceId + ':founder-1', occupation: 'smith' });
    for (const item of ['woodenSpear', 'woodenShield']) source = core.applyCommand(source,
        { type: 'SetSmitheryTarget', item, target: 10 });
    state.world.targetClans[sourceId] = source;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 }, context);
    source = state.world.targetClans[sourceId];
    for (const personaId of Object.keys(source.personas)) {
        source = core.applyCommand(source, { type: 'AssignEquipment', personaId, slot: 'weapon', item: 'woodenSpear' });
        source = core.applyCommand(source, { type: 'AssignEquipment', personaId, slot: 'shield', item: 'woodenShield' });
    }
    state.world.targetClans[sourceId] = source;
    assert.deepEqual(inspectRivalSettlement(state, world).entities, []);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Observed shore', memberIds: ['founder-1'] }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 140 }, context);
    const before = core.serializeState(state);
    const observed = inspectRivalSettlement(state, world);
    const people = observed.entities.filter(entity => entity.kind === 'persona');
    assert.ok(people.length > 0, 'A real outward route brings actual resident bodies into sight');
    for (const person of people) {
        const occupation = state.world.targetClans[sourceId].personas[person.id].occupation;
        assert.equal(person.label, 'Observed resident');
        assert.deepEqual(person.status.equipment, {
            weapon: ['farmer', 'fisher', 'smith'].includes(occupation) ? null : 'woodenSpear',
            shield: occupation === 'hunter' ? null : 'woodenShield',
        }, 'Stowed items do not become hidden inventory intelligence');
    }
    assert.equal(core.serializeState(state), before);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, context);
    const unseen = inspectRivalSettlement(state, world);
    assert.equal(unseen.known, true);
    assert.deepEqual(unseen.entities, []);
    assert.doesNotMatch(JSON.stringify(unseen), /woodenSpear|woodenShield|assignments|stored/);
});

test('a real equipped fisher restores its work tools and garments on the same native body after expedition presentation', async () => {
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
    const factory = await nativeFactory();
    const dna = { ...defaultDNA(), age: 32, sex: 'female' };
    const resident = { kind: 'persona', id: 'working-fisher', dna,
        status: { living: true, occupation: 'fisher', equipment: { weapon: 'woodenSpear', shield: 'woodenShield' } } };
    const diagnostics = [], wardrobe = new FjordWardrobe(factory, message => diagnostics.push(message));
    const human = await factory.create(dna, 2, undefined, { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none' });
    try {
        const root = human.root;
        await wardrobe.reconcile(human, resident);
        const hair = human.root.userData.selectedAssets.hair;
        assert.ok(human.fit.modules.has('equipment/occupation-fisher'));
        assert.ok(human.fit.modules.has('equipment/native-wooden-shield'));
        assert.equal(human.fit.modules.has('equipment/native-wooden-spear'), false);
        assert.ok(human.fit.modules.has('garment/meshy-fisherman-tunic-009'));
        await wardrobe.reconcile(human, { ...resident, status: { ...resident.status, expedition: 'explore-1' } });
        assert.ok(human.fit.modules.has('garment/meshy-grid-trial-001'));
        assert.ok(human.fit.modules.has('equipment/native-wooden-spear'));
        assert.ok(human.fit.modules.has('equipment/native-wooden-shield'));
        assert.equal(human.fit.modules.has('equipment/occupation-fisher'), false);
        assert.equal([...human.fit.modules.keys()].some(id => id.startsWith('headwear/occupation-')), false);
        await wardrobe.reconcile(human, resident);
        assert.ok(human.fit.modules.has('garment/meshy-fisherman-tunic-009'));
        assert.ok(human.fit.modules.has('equipment/occupation-fisher'));
        assert.ok(human.fit.modules.has('equipment/native-wooden-shield'));
        assert.equal(human.fit.modules.has('equipment/native-wooden-spear'), false);
        assert.equal(human.root, root);
        assert.equal(human.root.userData.selectedAssets.hair, hair);
        assert.deepEqual(human.dna, dna);
        assert.deepEqual(resident.status.equipment, { weapon: 'woodenSpear', shield: 'woodenShield' });
        assert.deepEqual(diagnostics, []);
    } finally { human.dispose(); }
});
