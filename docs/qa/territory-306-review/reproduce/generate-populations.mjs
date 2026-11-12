import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const sourceRoot = process.env.PROFILE_SOURCE_ROOT || process.cwd();
const { loadTypeScript } = await import(pathToFileURL(join(sourceRoot, 'scripts/load-typescript.mjs')));

const load = path => loadTypeScript(pathToFileURL(join(sourceRoot, 'src', path + '.ts')));
const core = load('simulation/SimulationCore');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { SharedSettlement } = load('play/SharedSettlement');
const { adoptCampaignIsland } = load('fjord-play/CampaignIsland');
const { campaignIslandCatalog } = load('fjord-play/BakedIslandCatalog');
const { personaAge } = load('simulation/PersonaAge');
const directory = new URL('./', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const source = execFileSync((process.env.GIT_EXE || 'git'), ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const seed = 7;
const geography = 'island-pool-v1';
const entry = campaignIslandCatalog.entries.find(row => row.version === geography && row.seed === seed);
const compressed = await readFile(join(sourceRoot, 'public' + entry.path));
assert.equal(sha(compressed), entry.sha256);
const canonical = gunzipSync(compressed);
assert.equal(sha(canonical), entry.canonicalSha256);
const { world, plan } = JSON.parse(canonical);
adoptCampaignIsland(seed, world, plan);

const landing = { initialFood: 1000000, initialMaterials: 100000,
    foundingCoupleChanceBps: 10000, foundingCoupleCap: 3 };
const mechanics = { mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    fertilityChanceBps: 10000, partnershipChanceBps: 10000,
    birthCooldownWinters: 0, childcareWinters: 0 };
const campaign = core.createCampaign(seed, landing, mechanics, { enabled: false },
    {}, {}, {}, 'summer-800-v1', 'individual-v1');
const session = new GameplaySession(seed);
session.loadJSON(core.serializeState(campaign));
const shared = new SharedSettlement(session, undefined, true, geography);
shared.fjord.enableDiscovery();
shared.session.setRunning(false);

function clanFacts(clan) {
    const living = Object.values(clan.personas).filter(person => person.deathWinter === null);
    const ages = living.map(person => personaAge(clan, person.id));
    return { id: clan.clan.id, living: living.length,
        age0to4: ages.filter(age => age < 5).length,
        age5to15: ages.filter(age => age >= 5 && age < 16).length,
        age16plus: ages.filter(age => age >= 16).length,
        partnered: living.filter(person => person.partnerId !== null).length,
        households: Object.values(clan.households).filter(home => home.memberIds.length).length,
        births: clan.events.filter(event => event.type === 'ChildBorn').length,
        pendingBirths: clan.birthdayCalendar?.pendingBirths.length ?? 0,
        food: clan.stocks.food, materials: clan.stocks.materials };
}
async function writeCheckpoint(name, facts) {
    const text = shared.persist();
    const file = new URL(name + '.shared.json', directory);
    const temp = new URL(name + '.shared.tmp', directory);
    await writeFile(temp, text);
    await rename(temp, file);
    const coreText = shared.session.saveJSON();
    await writeFile(new URL(name + '.core.json', directory), coreText);
    const restored = SharedSettlement.restore(text, 'fjord');
    assert.equal(restored.persist(), text, 'Real progressed save/load parity: ' + name);
    return { sharedFile: name + '.shared.json', coreFile: name + '.core.json',
        sha256: sha(text), bytes: Buffer.byteLength(text), facts };
}
const report = { status: 'running', startingSource: source, seed, geography,
    worldId: shared.session.readSnapshot().world.island.worldId,
    setup: { landing, mechanics, weather: { enabled: false }, birthdayCalendar: 'individual-v1',
        note: 'Growth setup changes only documented public configuration. No personas, histories, births, locations or events are injected. Both clans inherit the same rules and funding. Territory remains disabled until comparative scenario creation.' },
    checkpoints: [], years: [] };
await writeFile(new URL('growth-report.json', directory), JSON.stringify(report, null, 2));
for (let year = 0; year < 100; year++) {
    const state = shared.session.readSnapshot();
    const facts = [state, ...Object.values(state.world.targetClans)].map(clanFacts);
    const summary = { time: state.time, clans: facts };
    report.years.push(summary);
    await writeCheckpoint('growth-latest', summary);
    console.log(JSON.stringify(summary));
    for (const threshold of [50, 100]) {
        if (facts.every(clan => clan.living >= threshold) &&
            !report.checkpoints.some(checkpoint => checkpoint.threshold === threshold)) {
            const checkpoint = await writeCheckpoint('population-' + threshold, summary);
            report.checkpoints.push({ threshold, ...checkpoint });
            await writeFile(new URL('growth-report.json', directory), JSON.stringify(report, null, 2));
            console.log('threshold-checkpoint', threshold, checkpoint.sharedFile);
        }
    }
    if (report.checkpoints.length === 2) { report.status = 'passed'; break; }
    shared.session.command({ type: 'AdvanceWinter' });
}
if (report.status !== 'passed') report.status = 'incomplete';
await writeFile(new URL('growth-report.json', directory), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, checkpoints: report.checkpoints }));
