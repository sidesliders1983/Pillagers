import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const digest = value => createHash('sha256').update(value).digest('hex');

export async function loadSource(root) {
    root = resolve(root);
    const { loadTypeScript } = await import(pathToFileURL(join(root, 'scripts/load-typescript.mjs')));
    const load = name => loadTypeScript(pathToFileURL(join(root, 'src', name + '.ts')));
    const core = load('simulation/SimulationCore');
    const { SharedSettlement } = load('play/SharedSettlement');
    const { GameplaySession } = load('gameplay-lab/GameplaySession');
    const { personaAge } = load('simulation/PersonaAge');
    const { providingCareIds } = load('simulation/FamilyMechanics');
    const { adoptCampaignIsland, campaignIslandPlan } = load('fjord-play/CampaignIsland');
    const { campaignIslandCatalog } = load('fjord-play/BakedIslandCatalog');
    const { settlementCampfire } = load('fjord-play/SettlementCampfire');
    const { projectRivalSettlement } = load('fjord-play/RivalSettlement');
    const entry = campaignIslandCatalog.entries.find(row => row.version === 'island-pool-v1' && row.seed === 7);
    const compressed = await readFile(join(root, 'public' + entry.path));
    assert.equal(digest(compressed), entry.sha256);
    const canonical = gunzipSync(compressed);
    assert.equal(digest(canonical), entry.canonicalSha256);
    const { world, plan } = JSON.parse(canonical);
    adoptCampaignIsland(7, world, plan);
    const git = 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe';
    const head = execFileSync(git, ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const sourceFiles = ['src/simulation/TerritorialAwareness.ts', 'src/simulation/ResidentPresence.ts',
        'src/simulation/SimulationCore.ts', 'src/fjord-play/FjordCampaign.ts',
        'src/world-generation/LandRoutes.ts', 'src/simulation/ReconRoutes.ts',
        'src/simulation/IslandMissions.ts', 'src/simulation/SpatialExpeditions.ts',
        'src/fjord-play/IslandMissionPanel.ts', 'src/fjord-play/ExpeditionPanel.ts',
        'src/fjord-play/BakedIslandCatalog.ts'];
    const hashes = Object.fromEntries(await Promise.all(sourceFiles.map(async name =>
        [name, digest(await readFile(join(root, name)))])));
    const dirty = execFileSync(git, ['-C', root, 'status', '--porcelain', '--untracked-files=no'],
        { encoding: 'utf8' }).trim();

    function cohort(clan) {
        const residents = Object.values(clan.personas).filter(person => person.deathWinter === null);
        const ages = residents.map(person => personaAge(clan, person.id));
        return { id: clan.clan.id, living: residents.length, indoorUnder5: ages.filter(age => age < 5).length,
            outdoorAge5plus: ages.filter(age => age >= 5).length,
            workAge: ages.filter(age => age >= clan.mechanics.config.workAge).length,
            adultAge: ages.filter(age => age >= clan.mechanics.config.adultAge).length,
            providingCare: providingCareIds(clan).size,
            pendingBirths: clan.birthdayCalendar?.pendingBirths.length ?? 0,
            births: clan.events.filter(event => event.type === 'ChildBorn').length,
            secondGeneration: residents.filter(person => person.parentIds.some(id =>
                (clan.personas[id] || clan.personaArchive?.[id])?.parentIds.length)).length,
            households: Object.values(clan.households).filter(home => home.memberIds.length).length,
            events: clan.events.length };
    }
    function population(state) {
        return [state, ...Object.values(state.world.targetClans)].map(cohort);
    }
    function presenceSummary(state) {
        return [state, ...Object.values(state.world.targetClans)].map(clan => {
            const care = providingCareIds(clan);
            const ids = Object.keys(clan.residentPresence?.residents || {});
            return { id: clan.clan.id, savedResidents: ids.length,
                outdoorAvailableAtHome: ids.filter(id => {
                    const actor = core.inspectResidentPresence(clan, id);
                    return actor && !actor.placement && personaAge(clan, id) >= 5 && !care.has(id);
                }).length };
        });
    }
    function context(shared) {
        shared.fjord.project();
        const data = shared.fjord.exportData();
        const state = shared.session.readSnapshot();
        const target = state.world.targetClans[state.world.island.clanId];
        const rival = projectRivalSettlement(target, world, data.rivalLayout);
        const fire = settlementCampfire(world).transform;
        const rivalFire = rival.campfire.transform;
        const plots = [...Object.values(data.layout.plots), ...(campaignIslandPlan(world)?.plots ?? []),
            ...Object.values(data.rivalLayout?.plots ?? {})];
        const exclusions = plots.map(plot => ({ minX: plot.x - plot.halfWidth, maxX: plot.x + plot.halfWidth,
            minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth }));
        for (const point of [fire, rivalFire]) exclusions.push({ minX: point.x - 5, maxX: point.x + 5,
            minZ: point.z - 5, maxZ: point.z + 5 });
        return { world, worldId: state.world.island.worldId, exclusions };
    }
    return { root, load, core, SharedSettlement, GameplaySession, world, population, presenceSummary, context,
        pin: { head, sourceHashes: hashes, dirtyTracked: dirty || null, bakedSHA256: entry.sha256,
            bakedCanonicalSHA256: entry.canonicalSha256 } };
}
