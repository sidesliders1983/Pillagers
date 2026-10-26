import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../../../scripts/load-typescript.mjs';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const directory = dirname(fileURLToPath(import.meta.url));
const work = join(root, 'scratch/contextual-support-278/normal-v1');
const protocolPath = join(directory, 'protocol-v1.json');
export const digest = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => digest(JSON.stringify(value));
export const readJSON = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const writeJSON = (path, value) =>
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const ts = createRequire(import.meta.url)('typescript');
export const core = loadTypeScript(new URL('../../../src/simulation/SimulationCore.ts', import.meta.url));
const { isProvidingCare } = loadTypeScript(new URL('../../../src/simulation/FamilyMechanics.ts', import.meta.url));
const { fjordLivestockRules } = loadTypeScript(new URL('../../../src/config/FjordLivestock.ts', import.meta.url));
export const protocol = readJSON(protocolPath);

export function sourceIdentity(extraEntries = []) {
    const files = new Set(['package.json', 'pnpm-lock.yaml', 'scripts/load-typescript.mjs',
        relative(root, protocolPath).replaceAll('\\', '/'),
        relative(root, fileURLToPath(import.meta.url)).replaceAll('\\', '/')]);
    const visit = file => {
        const path = relative(root, file).replaceAll('\\', '/');
        if (files.has(path)) return;
        files.add(path);
        for (const entry of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
            if (!entry.fileName.startsWith('.')) continue;
            let dependency = resolve(dirname(file), entry.fileName);
            if (!existsSync(dependency)) dependency += '.ts';
            assert.ok(existsSync(dependency), 'Missing dependency: ' + dependency);
            visit(dependency);
        }
    };
    for (const file of ['src/simulation/SimulationCore.ts', 'src/config/FjordLivestock.ts', ...extraEntries])
        visit(join(root, file));
    const exact = {};
    const portable = {};
    for (const path of [...files].sort()) {
        const bytes = readFileSync(join(root, path));
        exact[path] = digest(bytes);
        portable[path] = digest(bytes.toString('utf8').replaceAll('\r\n', '\n'));
    }
    return {
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        node: process.version, typescript: ts.version,
        exactFiles: exact, fingerprint: jsonHash(exact),
        portableFiles: portable, portableFingerprint: jsonHash(portable),
        scope: 'Actual transitive public Core/Fjord rule dependencies; exact worktree bytes identify uncommitted #278 implementation independently of base HEAD.',
    };
}

export function personStatus(state, id) {
    const person = state.personas[id];
    if (!person) return { id, present: false };
    const home = Object.values(state.households).find(item => item.memberIds.includes(id));
    const adult = core.personaAge(state, id) >= state.mechanics.config.adultAge;
    const away = core.personaAway(state, id);
    const providingCare = isProvidingCare(state, id);
    return {
        id, name: person.name, age: core.personaAge(state, id),
        living: person.deathWinter === null, adult, away, providingCare,
        available: person.deathWinter === null && adult && !away && !providingCare,
        deathWinter: person.deathWinter, parentIds: [...person.parentIds],
        partnerId: person.partnerId, occupation: person.occupation,
        householdId: home?.id ?? null,
        residence: home?.residenceId ? structuredClone(state.residences[home.residenceId]) : null,
    };
}

export function newCampaign(seed, arm) {
    return core.createCampaign(seed, {}, {}, {}, {}, { enabled: true }, {}, 'summer-800-v1',
        undefined, { player: fjordLivestockRules }, { enabled: true },
        arm === 'enabled' ? {} : { enabled: false });
}

export function initialCommands(state) {
    const occupied = Object.values(state.households)
        .filter(home => home.memberIds.some(id => state.personas[id]?.deathWinter === null))
        .sort((a, b) => a.id.localeCompare(b.id));
    const coupled = occupied.find(home => home.memberIds.some(id => {
        const person = state.personas[id];
        const partner = person?.partnerId ? state.personas[person.partnerId] : undefined;
        return person?.deathWinter === null && partner?.deathWinter === null &&
            partner.partnerId === person.id && home.memberIds.includes(partner.id) &&
            core.personaAge(state, id) >= state.mechanics.config.adultAge &&
            core.personaAge(state, partner.id) >= state.mechanics.config.adultAge;
    }));
    const first = coupled ?? occupied[0];
    const second = occupied.find(home => home.id !== first?.id);
    assert.ok(first && second, 'The fixed policy needs two actual occupied households.');
    return [
        { type: 'SalvageLongship', longshipId: 'founding-longship' },
        { type: 'BuildHouse', householdId: first.id },
        { type: 'BuildHouse', householdId: second.id },
        { type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' },
        { type: 'UpgradeBuilding', buildingId: 'house-1' },
    ];
}

export function occupationCommands(state) {
    return Object.keys(state.personas).sort().filter(id => personStatus(state, id).available)
        .map(personaId => ({ type: 'AssignOccupation', personaId, occupation: 'farmer' }));
}

function rules(state) {
    return {
        landing: state.landing.config, mechanics: state.mechanics.config,
        livestock: state.landing.livestock, weather: state.weather.config,
        social: state.social.config, culture: state.culture.config,
        contextualSupport: state.contextualSupport?.config ?? { enabled: false },
        birthdayCalendar: state.birthdayCalendar ?? null,
    };
}

export function endpoint(state) {
    const serialized = core.serializeState(state);
    assert.equal(core.serializeState(core.reconstructState(serialized)), serialized);
    return {
        time: { ...state.time }, stocks: { ...state.stocks }, stateSHA256: digest(serialized),
        saveLoadExact: true, culture: core.inspectCulture(state),
        living: Object.values(state.personas).filter(person => person.deathWinter === null).length,
        deaths: state.events.filter(event => event.type === 'PersonaDied').map(event => event.personaId),
        cpu: Object.values(state.world?.targetClans ?? {}).map(target => ({
            id: target.clan.id, name: target.clan.name, seed: target.seed,
            time: { ...target.time }, stocks: { ...target.stocks },
            living: Object.values(target.personas).filter(person => person.deathWinter === null).length,
            deaths: target.events.filter(event => event.type === 'PersonaDied').map(event => event.personaId),
        })),
    };
}

export function metrics(state) {
    const sum = (types, field, resource) => state.events.filter(event => types.includes(event.type) &&
        (resource === undefined || event.details?.resource === resource))
        .reduce((total, event) => total + Number(event.details?.[field] ?? 0), 0);
    const count = type => state.events.filter(event => event.type === type).length;
    return {
        food: state.stocks.food, materials: state.stocks.materials,
        residentFoodProduced: sum(['ResourceProduced'], 'units', 'food'),
        residentMaterialsProduced: sum(['ResourceProduced'], 'units', 'materials'),
        livestockFoodProduced: sum(['CattleFoodProduced'], 'units') +
            sum(['LivestockResourceProduced'], 'units', 'food'),
        livestockMaterialsProduced: sum(['LivestockResourceProduced'], 'units', 'materials'),
        residentFoodConsumed: sum(['FoodConsumed'], 'units'),
        residentFoodShortfall: sum(['FoodConsumed'], 'shortfall'),
        livestockFoodConsumed: sum(['CattleFoodConsumed', 'LivestockFoodConsumed'], 'units'),
        livestockFoodShortfall: sum(['CattleFoodConsumed', 'LivestockFoodConsumed'], 'shortfall'),
        actualUpkeepPaid: sum(['BuildingMaintained'], 'units'),
        actualCollapseSalvage: sum(['BuildingCollapsed'], 'salvage'),
        losses: count('BuildingCollapsed'), offers: count('SupportOffered'),
        accepted: count('SupportAccepted'), completed: count('SupportCompleted'),
        declined: count('SupportDeclined'), ended: count('SupportEnded'),
        contributions: sum(['SupportCompleted'], 'supportContribution'),
        zeroContributions: state.events.filter(event => event.type === 'SupportCompleted' &&
            event.details.supportContribution === 0).length,
        weatherApplications: count('CultureWeatherSupportApplied'),
        bankAtEnd: core.inspectCulture(state).supportCount, deaths: count('PersonaDied'),
        maximumBankObservedInEvents: Math.max(0, ...state.events.filter(event =>
            event.type === 'SupportCompleted' || event.type === 'CultureWeatherSupportApplied')
            .flatMap(event => [Number(event.details.supportBefore), Number(event.details.supportAfter)])),
    };
}

export function runCase(seed, arm) {
    let state = newCampaign(seed, arm);
    const initialRules = rules(state);
    assert.deepEqual(state.stocks, { food: 15, materials: 5 });
    assert.deepEqual(state.time, { winter: 800, tick: 500 });
    if (arm === 'enabled') assert.deepEqual(initialRules.contextualSupport, { enabled: true, ...protocol.rules.enabled });
    const commands = [];
    const transactions = [];
    const observations = [];
    const commit = command => {
        const before = { ...state.stocks };
        commands.push(structuredClone(command));
        state = core.applyCommand(state, command);
        if (command.type !== 'AdvanceTicks') transactions.push({
            commandIndex: commands.length - 1, time: { ...state.time }, command,
            stocksBefore: before, stocksAfter: { ...state.stocks },
            foodDelta: state.stocks.food - before.food,
            materialsDelta: state.stocks.materials - before.materials,
        });
    };
    for (const command of initialCommands(state)) commit(command);
    const observe = (stage, eventOffset) => {
        const newLosses = state.events.slice(eventOffset).filter(event => event.type === 'BuildingCollapsed');
        observations.push({
            stage, time: { ...state.time }, stocks: { ...state.stocks },
            bank: core.inspectCulture(state), pending: structuredClone(state.contextualSupport?.pending ?? []),
            newLosses: newLosses.map(source => ({
                source,
                peopleAtObservation: Object.keys(state.personas).sort().map(id => personStatus(state, id)),
                socialWindow: structuredClone(state.social.lastWindow),
            })),
        });
    };
    for (let year = 0; year < 10; year++) {
        for (const command of occupationCommands(state)) commit(command);
        for (const [stage, ticks] of [['loss-window', 500], ['resolution-window', 50], ['summer', 450]]) {
            const offset = state.events.length;
            commit({ type: 'AdvanceTicks', ticks });
            observe(stage, offset);
        }
    }
    const end = endpoint(state);
    return {
        schemaVersion: 1, seed, arm, status: 'complete',
        scope: protocol.cohort.scope, initialRules, commands, transactions, observations,
        endpoint: end, metrics: metrics(state), events: state.events,
        cpuInitialIdentities: end.cpu.map(({ id, name, seed: cpuSeed }) => ({ id, name, seed: cpuSeed })),
    };
}

function identity() {
    return {
        protocolSHA256: digest(readFileSync(protocolPath)),
        runnerSHA256: digest(readFileSync(fileURLToPath(import.meta.url))),
        source: sourceIdentity(),
    };
}
function assertIdentity(expected) {
    const current = identity();
    current.source.head = expected.source.head;
    assert.deepEqual(current, expected, 'Source, protocol or runner changed. Preserve this version and freeze a new one.');
}
function casesFor(limit) {
    const cases = [];
    for (let seed = 1; seed <= limit; seed++) for (const arm of ['disabled', 'enabled'])
        cases.push(readJSON(join(work, 'cases', String(seed).padStart(3, '0') + '-' + arm + '.json')));
    return cases;
}
function summarize(cases, phase) {
    const pairs = [];
    const completions = [];
    for (let seed = 1; seed <= phase; seed++) {
        const disabled = cases.find(item => item.seed === seed && item.arm === 'disabled');
        const enabled = cases.find(item => item.seed === seed && item.arm === 'enabled');
        pairs.push({
            seed, disabled: disabled.metrics ?? null, enabled: enabled.metrics ?? null,
            disabledStatus: disabled.status, enabledStatus: enabled.status,
            actualCompletedEvents: enabled.events?.filter(event => event.type === 'SupportCompleted') ?? [],
        });
        if (enabled.status === 'complete') for (const event of enabled.events)
            if (event.type === 'SupportCompleted' && event.details.supportContribution === 1)
                completions.push({ seed, event });
    }
    const totals = {};
    for (const arm of ['disabled', 'enabled']) {
        const complete = cases.filter(item => item.arm === arm && item.status === 'complete');
        totals[arm] = { complete: complete.length,
            failures: cases.filter(item => item.arm === arm && item.status !== 'complete').length };
        for (const key of Object.keys(complete[0]?.metrics ?? {}))
            totals[arm][key] = key === 'maximumBankObservedInEvents' ?
                Math.max(0, ...complete.map(item => item.metrics[key])) :
                complete.reduce((sum, item) => sum + item.metrics[key], 0);
    }
    return { schemaVersion: 1, phase, campaigns: cases.length, totals,
        representative: completions[0] ?? null, pairs,
        interpretation: protocol.observations.comparison };
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
    const mode = process.argv[2];
    assert.equal(process.argv.length, 3);
    assert.ok(['--freeze', '--phase16', '--phase32', '--phase64', '--verify'].includes(mode));
    if (mode === '--freeze') {
        mkdirSync(join(work, 'cases'), { recursive: true });
        writeJSON(join(work, 'identity.json'), { frozenAt: new Date().toISOString(), identity: identity() });
        console.log(JSON.stringify({ status: 'frozen-before-first-case', path: join(work, 'identity.json') }));
    } else if (mode === '--verify') {
        const manifest = readJSON(join(directory, 'manifest-v1.json'));
        assertIdentity(manifest.identity);
        for (const file of manifest.artifacts)
            assert.equal(digest(readFileSync(join(directory, file.path))), file.sha256);
        const raw = JSON.parse(gunzipSync(readFileSync(join(directory, manifest.rawFile))).toString('utf8'));
        assert.equal(raw.length, manifest.campaigns);
        console.log(JSON.stringify({ status: 'verified-without-simulation', campaigns: raw.length }));
    } else {
        const limit = Number(mode.slice('--phase'.length));
        const frozen = readJSON(join(work, 'identity.json'));
        assertIdentity(frozen.identity);
        if (limit > 16) {
            const priorLimit = limit / 2;
            const prior = readJSON(join(work, 'phase-' + priorLimit + '.json'));
            assert.equal(prior.representative, null, 'Stop once the completed phase has a representative.');
        }
        for (let seed = 1; seed <= limit; seed++) for (const arm of ['disabled', 'enabled']) {
            const path = join(work, 'cases', String(seed).padStart(3, '0') + '-' + arm + '.json');
            if (existsSync(path)) {
                const existing = readJSON(path);
                assert.equal(existing.status, 'complete', 'Investigate incomplete case; do not overwrite or silently reroll.');
                continue;
            }
            const started = Date.now();
            let result;
            try { result = runCase(seed, arm); }
            catch (error) {
                result = { schemaVersion: 1, seed, arm, status: 'technical-failure',
                    error: String(error.stack ?? error) };
            }
            writeJSON(path, result);
            console.log(JSON.stringify({ seed, arm, status: result.status, elapsedMs: Date.now() - started,
                metrics: result.metrics ?? null }));
            if (result.status !== 'complete') process.exitCode = 1;
        }
        assertIdentity(frozen.identity);
        const cases = casesFor(limit);
        const summary = summarize(cases, limit);
        writeJSON(join(work, 'phase-' + limit + '.json'), summary);
        if (summary.representative || limit === 64) {
            const rawFile = 'raw-v1.json.gz';
            const compressed = gzipSync(JSON.stringify(cases) + '\n', { level: 9 });
            writeFileSync(join(directory, rawFile), compressed, { flag: 'wx' });
            writeJSON(join(directory, 'summary-v1.json'), summary);
            const artifacts = [rawFile, 'summary-v1.json', 'protocol-v1.json', 'cohort-v1.mjs']
                .map(path => ({ path, bytes: readFileSync(join(directory, path)).length,
                    sha256: digest(readFileSync(join(directory, path))) }));
            writeJSON(join(directory, 'manifest-v1.json'), {
                schemaVersion: 1, frozenAt: frozen.frozenAt, finalizedAt: new Date().toISOString(),
                identity: frozen.identity, campaigns: cases.length, phase: limit, rawFile, artifacts,
            });
        }
        console.log(JSON.stringify({ status: 'phase-complete', phase: limit,
            representative: summary.representative, totals: summary.totals }));
    }
}

