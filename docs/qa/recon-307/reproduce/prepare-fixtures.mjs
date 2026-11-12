import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadSource, digest } from './fixture-tools.mjs';

const pin = String(process.env.QA_GO || '');
assert.match(pin, /^[a-f0-9]{40}$/, 'HOLD: final fixture preparation needs the root source pin.');
const api = await loadSource(process.cwd());
assert.equal(api.pin.head, pin);
const draft = process.env.QA_DRAFT === '1';
if (!draft) assert.equal(api.pin.dirtyTracked, null);
const directory = fileURLToPath(new URL('./', import.meta.url));
const inputPath = process.env.QA_LEGACY_INPUT ||
    'D:/CodexSites/Pillagers/scratch/territorial-awareness-306/scratch/territory-review-306/warning.original.shared.json';
const input = await readFile(inputPath, 'utf8');
const shared = api.SharedSettlement.restore(input, 'fjord');
shared.session.setRunning(false);
const report = { status: 'running', source: api.pin, input: { path: inputPath, sha256: digest(input) },
    method: 'Historical genuine production seed7 checkpoint; all new progress and Recon use public GameplaySession commands.',
    preparedAt: new Date().toISOString(), fixtures: [], probes: [],
    limits: 'Production parcel may permit only a partial arc or refusal within the existing250tick budget. Full mapped-area circuits do not imply full known-site coverage.' };
const command = value => shared.session.command(value);
const current = () => shared.session.readSnapshot();
const mission = () => Object.values(current().world.spatial?.missions || {}).at(-1);
async function save(name, subject, extra = {}) {
    subject.session.setRunning(false);
    const text = subject.persist(), core = subject.session.saveJSON();
    assert.equal(api.core.serializeState(api.core.reconstructState(core)), core);
    const again = api.SharedSettlement.restore(text, 'fjord');
    assert.equal(again.session.saveJSON(), core);
    assert.equal(again.persist(), text);
    await writeFile(join(directory, name + '.shared.json'), text);
    const item = { name, sha256: digest(text), bytes: Buffer.byteLength(text),
        time: { ...subject.session.readSnapshot().time }, ...extra };
    report.fixtures.push(item);
    return item;
}
await save('legacy-direct-warning', shared, { historical: true });
if (mission()?.status !== 'Returned') {
    command({ type: 'RecallExpedition', groupId: mission().groupId });
    for (let tick = 0; mission().status !== 'Returned' && tick < 1000; tick++)
        command({ type: 'AdvanceTicks', ticks: 1 });
    assert.equal(mission().status, 'Returned');
}
const baseText = shared.persist();
const groupId = Object.keys(current().world.groups)[0];
assert.ok(groupId);
const site = api.core.inspectIslandMissions(current()).sites[0];
assert.ok(site, 'The original party really sighted the production site.');
const coreBefore = shared.session.saveJSON();
function offer(target) {
    const start = performance.now();
    try {
        const quote = shared.session.islandMissionOffer(groupId, target, 'Recon');
        report.probes.push({ target, elapsedMs: performance.now() - start, quote });
        return { target, quote };
    } catch (error) {
        report.probes.push({ target, elapsedMs: performance.now() - start, error: String(error.message) });
        return { target, error: String(error.message) };
    }
}
const known = offer({ kind: 'site', siteId: site.id });
let full, partial = known.quote?.observationRoute?.coverage === 'partial' ? known : null;
let refused = known.error ? known : null;
const view = api.load('simulation/ClanDiscovery').inspectClanDiscovery(current().discovery, current().clan.id);
const discoveryAt = api.load('simulation/ClanDiscovery').discoveryAt;
const surface = api.load('world-generation/TerrainQueries').createBlueprintSurface(api.world);
const nav = api.world.navigation, home = api.world.settlement.center;
const candidates = [];
for (let row = 0; row < nav.rows; row += 2) for (let col = 0; col < nav.columns; col += 2) {
    const point = { x: nav.bounds.minX + col * nav.spacing, z: nav.bounds.minZ + row * nav.spacing };
    if (!nav.cells[row * nav.columns + col] || surface.surfaceHeightAt(point.x, point.z) <= api.world.waterLevel + .25 ||
        discoveryAt(view, point.x, point.z) === 'unknown') continue;
    candidates.push(point);
}
const near = [...candidates].sort((a, b) => Math.abs(Math.hypot(a.x - home.x, a.z - home.z) - 40) -
    Math.abs(Math.hypot(b.x - home.x, b.z - home.z) - 40));
for (const position of near.slice(0, 16)) {
    const probe = offer({ kind: 'area', position });
    if (probe.quote?.observationRoute?.coverage === 'circuit') { full = probe; break; }
}
const coastal = candidates.map(position => {
    let blocked = 0;
    for (let angle = 0; angle < 8; angle++) {
        const x = position.x + Math.cos(angle * Math.PI / 4) * 16;
        const z = position.z + Math.sin(angle * Math.PI / 4) * 16;
        const col = Math.round((x - nav.bounds.minX) / nav.spacing);
        const row = Math.round((z - nav.bounds.minZ) / nav.spacing);
        if (col < 0 || row < 0 || col >= nav.columns || row >= nav.rows ||
            !nav.cells[row * nav.columns + col] || surface.surfaceHeightAt(x, z) <= api.world.waterLevel + .25)
            blocked++;
    }
    return { position, blocked, homeDistance: Math.hypot(position.x - home.x, position.z - home.z) };
}).filter(value => value.blocked > 0 && value.homeDistance > 24 && value.homeDistance < 180)
    .sort((a, b) => b.blocked - a.blocked || a.homeDistance - b.homeDistance);
if (!partial) for (const { position } of coastal.slice(0, 30)) {
    const probe = offer({ kind: 'area', position });
    if (probe.quote?.observationRoute?.coverage === 'partial') { partial = probe; break; }
}
if (!refused) for (const position of [...candidates].sort((a, b) =>
    Math.hypot(b.x - home.x, b.z - home.z) - Math.hypot(a.x - home.x, a.z - home.z)).slice(0, 16)) {
    const probe = offer({ kind: 'area', position });
    if (probe.error === 'No safe observation route fits this mission.') { refused = probe; break; }
}
assert.equal(shared.session.saveJSON(), coreBefore, 'All public quote/refusal probes are read-only.');
assert.ok(full, 'A genuine production mapped-area circuit is required.');
assert.ok(partial || known.error, 'Production known-site partial/refusal is recorded truthfully.');
assert.ok(refused, 'A genuine mapped/known target must provide a safe refusal.');
await save('ready-at-home', shared, { groupId, knownSite: site, knownSiteResult: known, full, partial, refused });
report.geography = { bounds: api.world.terrain.bounds, points: [full, partial, refused].filter(Boolean).filter(value => value.target.kind === 'area').map(value => ({ ...value.target.position, height: surface.surfaceHeightAt(value.target.position.x, value.target.position.z) })) };
for (const [name, chosen] of [['area-circuit', full], ['partial-arc', partial]]) {
    if (!chosen) continue;
    const trial = api.SharedSettlement.restore(baseText, 'fjord');
    trial.session.command({ type: 'DispatchIslandMission', groupId, target: chosen.target, mission: 'Recon' });
    for (let tick = 0; tick < 250; tick++) {
        const active = Object.values(trial.session.readSnapshot().world.spatial.missions).at(-1);
        if (active.task.recon.reachedViewpoints >= 2) break;
        trial.session.command({ type: 'AdvanceTicks', ticks: 1 });
    }
    const active = Object.values(trial.session.readSnapshot().world.spatial.missions).at(-1);
    assert.ok(active.task.recon.reachedViewpoints >= 2);
    await save(name + '-mid', trial, { groupId, target: chosen.target, quote: chosen.quote,
        reached: active.task.recon.reachedViewpoints, samples: active.task.recon.samples,
        missionId: active.id });
}
report.status = draft ? 'draft-fixtures-only' : 'passed';
await writeFile(join(directory, 'fixtures.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, source: pin, groupId,
    full: full.quote.observationRoute, partial: partial?.quote.observationRoute,
    refused, probes: report.probes.length }));
