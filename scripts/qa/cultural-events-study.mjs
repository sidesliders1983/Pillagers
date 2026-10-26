import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, appendFileSync, copyFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadTypeScript } from '../load-typescript.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runnerPath = 'scripts/qa/cultural-events-study.mjs';
const defaultProtocol = 'docs/qa/cultural-events/calibration-protocol.json';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { fjordLivestockRules } = loadTypeScript(new URL('../../src/config/FjordLivestock.ts', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => digest(JSON.stringify(value));
const readProtocol = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));

function createStart(job, protocol) {
    if (job.phase === 'controlled') {
        const weather = structuredClone(core.defaultWeatherConfig);
        assert.ok(protocol.controlled.weatherClasses.includes(job.weather));
        for (const kind of core.weatherClasses)
            weather.profiles[kind].probabilityBps = kind === job.weather ? 10000 : 0;
        return core.createCampaign(job.seed, protocol.controlled.landingOverrides,
            protocol.controlled.mechanicsOverrides, weather, {}, {}, {}, undefined, undefined,
            undefined, protocol.experimentalCulture);
    }
    return core.createCampaign(job.seed, {}, {}, {}, {}, protocol.strategies.social, {},
        protocol.strategies.foundingPhase, undefined, { player: fjordLivestockRules },
        protocol.experimentalCulture);
}
function actualRules(state) {
    return { landing: state.landing.config, mechanics: state.mechanics.config,
        weather: state.weather.config, social: state.social?.config ?? null,
        culture: state.culture.config, livestock: state.landing.livestock,
        foundingPhase: state.foundingPhase ?? null, birthdayCalendar: state.birthdayCalendar?.birthPolicy ?? 'annual',
        targetRules: Object.values(state.world.targetClans).map(target => ({
            landing: target.landing.config, mechanics: target.mechanics.config,
            weather: target.weather.config, culture: target.culture?.config ?? null,
            livestock: target.landing.livestock,
        })) };
}
function eventRow(event) {
    return { id: event.id, time: event.time, type: event.type,
        ...(event.personaId ? { personaId: event.personaId } : {}), details: event.details ?? {} };
}
function living(state) {
    return Object.values(state.personas).filter(person => person.deathWinter === null).length;
}
function stockAccounting(before, state, offset) {
    const events = state.events.slice(offset);
    const sum = (types, key, resource) => events.filter(event => types.includes(event.type) &&
        (resource === undefined || event.details?.resource === resource))
        .reduce((total, event) => total + Number(event.details?.[key] ?? 0), 0);
    const foodProduced = sum(['ResourceProduced', 'LivestockResourceProduced'], 'units', 'food') +
        sum(['CattleFoodProduced'], 'units');
    const materialsProduced = sum(['ResourceProduced', 'LivestockResourceProduced'], 'units', 'materials');
    const foodConsumed = sum(['FoodConsumed', 'CattleFoodConsumed', 'LivestockFoodConsumed'], 'units');
    const foodPaid = sum(['CulturalGatheringHeld'], 'foodCost');
    const materialsSpent = sum(['HouseBuilt', 'BuildingUpgraded'], 'cost') + sum(['BuildingMaintained'], 'units');
    const materialsSalvaged = sum(['BuildingCollapsed', 'BuildingSalvaged'], 'salvage');
    assert.equal(state.stocks.food, before.food + foodProduced - foodConsumed - foodPaid, 'Food ledger');
    assert.equal(state.stocks.materials, before.materials + materialsProduced + materialsSalvaged - materialsSpent,
        'Materials ledger');
    return { foodProduced, materialsProduced, foodConsumed, foodPaid, materialsSpent, materialsSalvaged,
        residentShortfall: sum(['FoodConsumed'], 'shortfall'),
        livestockShortfall: sum(['CattleFoodConsumed', 'LivestockFoodConsumed'], 'shortfall') };
}
function sponsorPolicy(input, job, protocol) {
    let state = input;
    const decisions = [];
    const target = job.phase === 'controlled' ? protocol.controlled.interventions[job.arm] :
        job.arm === 'none' ? 0 : job.arm === 'one' ?
            (core.inspectCulture(state).supportCount === 0 ? 1 : 0) : core.inspectCulture(state).supportCapacity;
    while (core.inspectCulture(state).supportCount < target) {
        const offer = core.gatheringOffer(state);
        const decision = { time: { ...state.time }, food: state.stocks.food, quote: offer.foodCost,
            support: offer.supportCount, allowed: offer.allowed, reason: offer.reason,
            participantIds: [...offer.participantIds], submitted: false };
        decisions.push(decision);
        if (!offer.allowed) break;
        if (job.phase !== 'controlled' && state.stocks.food - offer.foodCost <
            protocol.strategies.policy.reserveFoodAfterPayment) {
            decision.reason = 'QA reserve after payment';
            break;
        }
        const beforeRng = state.rngState, beforeFood = state.stocks.food;
        state = core.applyCommand(state, { type: 'SponsorGathering', occasion: offer.occasion,
            expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
            expectedParticipantIds: offer.participantIds });
        assert.equal(state.rngState, beforeRng, 'Sponsorship cannot consume mechanics RNG');
        assert.equal(beforeFood - state.stocks.food, offer.foodCost);
        const event = state.events.at(-1);
        assert.equal(event.type, 'CulturalGatheringHeld');
        Object.assign(decision, { submitted: true, reason: null, eventId: event.id,
            people: event.details.people, foodPaid: event.details.foodCost });
    }
    return { state, decisions };
}
function cpuSnapshot(state) {
    return Object.fromEntries(Object.entries(state.world.targetClans).sort().map(([id, target]) => [id, {
        stateHash: digest(core.serializeState(target)), stocks: { ...target.stocks }, population: living(target),
        weather: core.inspectWeather(target), supportCount: core.inspectCulture(target).supportCount,
        gatheringCount: target.events.filter(event => event.type === 'CulturalGatheringHeld').length,
    }]));
}
function baselineInputs(beforeBoundary, afterBoundary, weather) {
    return core.inspectWeatherExposure(beforeBoundary).residentIds.map(id => {
        const age = core.personaAge(afterBoundary, id);
        const naturalRiskBps = [...beforeBoundary.mechanics.config.mortalityBands].reverse()
            .find(band => band.minAge <= age)?.chanceBps ?? 0;
        const baselineWeatherExposureBps = weather.modifiers.tentMortalityBps;
        return { personaId: id, age, naturalRiskBps, baselineWeatherExposureBps,
            baselineRiskBps: Math.min(10000, naturalRiskBps + baselineWeatherExposureBps) };
    });
}
/** Public study boundary: every state transition uses the real Core command/serialization API. */
export function runCase(job, protocol = readProtocol(defaultProtocol)) {
    assert.ok(['controlled', 'strategy'].includes(job.phase));
    assert.ok(protocol.arms.includes(job.arm));
    let state = createStart(job, protocol);
    const initialStateHash = digest(core.serializeState(state));
    const rules = actualRules(state);
    const openingOffer = core.gatheringOffer(state);
    const initial = { offer: { allowed: openingOffer.allowed, reason: openingOffer.reason,
        foodCost: openingOffer.foodCost, participants: openingOffer.participantIds.length }, time: { ...state.time }, stocks: { ...state.stocks }, population: living(state),
        rngState: state.rngState, cpu: cpuSnapshot(state) };
    const annual = [], timeline = [];
    const count = job.phase === 'controlled' ? 1 : protocol.strategies.years;
    for (let year = 0; year < count; year++) {
        const beforeStocks = { ...state.stocks }, offset = state.events.length;
        const targetBefore = Object.fromEntries(Object.entries(state.world.targetClans)
            .map(([id, target]) => [id, { stocks: { ...target.stocks }, offset: target.events.length }]));
        const periodStarted = { ...state.time }, openingWeather = core.inspectWeather(state);
        const supportBefore = core.inspectCulture(state).supportCount;
        const policy = sponsorPolicy(state, job, protocol);
        state = policy.state;
        const untilBoundary = state.ticksPerWinter - state.time.tick;
        if (untilBoundary > 1) state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: untilBoundary - 1 });
        const beforeBoundary = state, assessedWeather = core.inspectWeather(state);
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 });
        const observerBaselineInputs = baselineInputs(beforeBoundary, state, assessedWeather);
        if (job.phase === 'strategy') state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
        if (year === Math.floor(count / 2)) {
            const saved = core.serializeState(state);
            state = core.reconstructState(saved);
            assert.equal(core.serializeState(state), saved, 'Save/load roundtrip');
        }
        const events = state.events.slice(offset);
        const economy = stockAccounting(beforeStocks, state, offset);
        const cpuEconomy = Object.fromEntries(Object.entries(state.world.targetClans).map(([id, target]) =>
            [id, stockAccounting(targetBefore[id].stocks, target, targetBefore[id].offset)]));
        const residentDeaths = events.filter(event => event.type === 'PersonaDied').map(eventRow);
        const livestockDeaths = events.filter(event => ['CattleDied', 'LivestockDied'].includes(event.type)).map(eventRow);
        const supportApplied = events.filter(event => event.type === 'CultureWeatherSupportApplied').map(event =>
            ({ id: event.id, time: event.time, ...event.details }));
        assert.ok(supportApplied.length <= 1);
        assert.ok(core.inspectCulture(state).supportCount <= protocol.experimentalCulture.supportCapacity);
        annual.push({ periodStarted, time: { ...state.time }, openingWeather, assessedWeather,
            policy: policy.decisions, supportBefore, supportAfter: core.inspectCulture(state).supportCount,
            observerBaselineInputs, supportApplied, residentDeaths, livestockDeaths, economy, cpuEconomy,
            stocks: { ...state.stocks }, population: living(state),
            livestock: Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null).length,
            weatherDetermined: events.filter(event => event.type === 'WinterWeatherDetermined').map(eventRow),
            cpu: cpuSnapshot(state) });
        timeline.push(...events.filter(event => ['CulturalGatheringHeld', 'CultureWeatherSupportApplied',
            'PersonaDied', 'BuildingCollapsed'].includes(event.type)).map(eventRow));
    }
    const total = key => annual.reduce((sum, row) => sum + row.economy[key], 0);
    const final = { time: { ...state.time }, stocks: { ...state.stocks }, population: living(state),
        supportCount: core.inspectCulture(state).supportCount,
        stateHash: digest(core.serializeState(state)), cpu: cpuSnapshot(state) };
    return { status: 'complete', ...job, initialStateHash, rulesHash: jsonHash(rules), initial, final,
        accounting: 'passed', totals: { foodPaid: total('foodPaid'), foodProduced: total('foodProduced'),
            materialsProduced: total('materialsProduced'), foodConsumed: total('foodConsumed'),
            materialsSpent: total('materialsSpent'), residentShortfall: total('residentShortfall'),
            livestockShortfall: total('livestockShortfall'),
            residentDeaths: annual.reduce((sum, row) => sum + row.residentDeaths.length, 0),
            livestockDeaths: annual.reduce((sum, row) => sum + row.livestockDeaths.length, 0),
            gatherings: annual.flatMap(row => row.policy).filter(decision => decision.submitted).length,
            reserveSkips: annual.flatMap(row => row.policy).filter(decision => decision.reason === 'QA reserve after payment').length,
            unavailableOffers: annual.flatMap(row => row.policy).filter(decision => !decision.allowed).length,
            supportUsed: annual.reduce((sum, row) => sum + row.supportApplied.length, 0),
            exposedChecks: annual.reduce((sum, row) => sum + row.observerBaselineInputs.length, 0),
            modifiedChecks: annual.reduce((sum, row) => sum + row.supportApplied.reduce((n, event) => n + event.riskInputs.length, 0), 0),
            shortageIntervals: annual.filter(row => row.economy.residentShortfall + row.economy.livestockShortfall > 0).length,
            population: final.population, food: final.stocks.food, materials: final.stocks.materials }, annual, timeline };
}
function dependencyFiles(entry, files = new Set()) {
    const path = resolve(root, entry);
    if (files.has(path)) return files;
    files.add(path);
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
        const name = node.moduleSpecifier?.text;
        if (typeof name !== 'string' || !name.startsWith('.')) continue;
        const requested = resolve(dirname(path), name);
        const dependency = [requested, requested + '.ts', requested + '.mjs', join(requested, 'index.ts')]
            .find(candidate => existsSync(candidate) && /\.(?:ts|mjs|js)$/.test(candidate));
        if (!dependency) throw new Error('Unresolved local dependency: ' + name);
        dependencyFiles(relative(root, dependency), files);
    }
    return files;
}
function fingerprint(protocolPath, protocol) {
    const files = dependencyFiles('src/simulation/SimulationCore.ts');
    dependencyFiles('src/config/FjordLivestock.ts', files);
    for (const path of [runnerPath, protocolPath, 'scripts/load-typescript.mjs', 'package.json', 'pnpm-lock.yaml'])
        files.add(resolve(root, path));
    const sources = Object.fromEntries([...files].sort().map(path => [relative(root, path).replaceAll('\\', '/'),
        digest(readFileSync(path))]));
    const rules = { controlledHarsh: actualRules(createStart({ phase: 'controlled', seed: 1, weather: 'Harsh' }, protocol)),
        controlledSevere: actualRules(createStart({ phase: 'controlled', seed: 1, weather: 'Severe' }, protocol)),
        strategies: actualRules(createStart({ phase: 'strategy', seed: 1 }, protocol)) };
    return { id: jsonHash(sources), runnerHash: sources[runnerPath], protocolHash: digest(readFileSync(resolve(root, protocolPath))),
        policyHash: jsonHash(protocol.strategies.policy), rulesHash: jsonHash(rules), sources, rules };
}
const keyOf = row => [row.phase, row.weather ?? '', row.seed, row.arm].join(':');
function recoverPartialTail(file) {
    if (!existsSync(file) || statSync(file).size === 0) return null;
    const size = statSync(file).size, last = Buffer.alloc(1), handle = openSync(file, 'r');
    try { readSync(handle, last, 0, 1, size - 1); } finally { closeSync(handle); }
    if (last[0] === 10) return null;
    assert.ok(size <= 64 * 1024 * 1024, 'Interrupted raw file exceeds bounded recovery size; preserve it for manual recovery');
    const raw = readFileSync(file), boundary = raw.lastIndexOf(10) + 1, tail = raw.subarray(boundary);
    try { JSON.parse(tail.toString()); appendFileSync(file, '\n');
        return { file, action: 'completed terminal newline', tailHash: digest(tail) };
    } catch {}
    const backup = file + '.interrupted-' + Date.now() + '-' + digest(tail).slice(0, 12);
    copyFileSync(file, backup);
    assert.equal(digest(readFileSync(backup)), digest(raw), 'Interrupted evidence backup');
    truncateSync(file, boundary);
    return { file, action: 'archived incomplete tail before recovery', backup, tailBytes: tail.length, tailHash: digest(tail) };
}
async function* readRows(file) {
    if (!existsSync(file)) return;
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}
function pairedInterval(values) {
    const n = values.length, mean = values.reduce((sum, value) => sum + value, 0) / (n || 1);
    const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
    const radius = n > 1 ? 1.96 * Math.sqrt(variance / n) : null;
    return { pairs: n, mean, lower95: radius === null ? null : mean - radius,
        upper95: radius === null ? null : mean + radius,
        limitation: variance === 0 ? 'No observed variation; do not infer zero uncertainty for rare outcomes.' : null };
}
function wilson(successes, count) {
    if (!count) return { successes, count, lower95: null, upper95: null };
    const z2 = 1.96 ** 2, fraction = successes / count, denominator = 1 + z2 / count;
    const centre = (fraction + z2 / (2 * count)) / denominator;
    const radius = 1.96 * Math.sqrt(fraction * (1 - fraction) / count + z2 / (4 * count * count)) / denominator;
    return { successes, count, lower95: Math.max(0, centre - radius), upper95: Math.min(1, centre + radius) };
}
async function summarize(output, manifest) {
    const compact = [];
    const counts = { complete: 0, 'technically-failed': 0 };
    for (const file of ['controlled.jsonl', 'strategies.jsonl']) for await (const row of readRows(join(output, file))) {
        assert.equal(row.fingerprint, manifest.fingerprint.id);
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (row.status !== 'complete') continue;
        compact.push({ phase: row.phase, seed: row.seed, weather: row.weather, arm: row.arm, totals: row.totals,
            initialStateHash: row.initialStateHash, initialFood: row.initial.stocks.food,
            initialPopulation: row.initial.population,
            firstPaid: row.annual[0].policy.filter(decision => decision.submitted).length,
            weatherTrace: row.annual.map(annual => annual.assessedWeather.class),
            cpuTrajectoryHash: jsonHash(row.annual.map(annual => annual.cpu)),
            cpuGatherings: Object.values(row.final.cpu).reduce((n, clan) => n + clan.gatheringCount, 0) });
    }
    const groups = [];
    for (const phase of ['controlled', 'strategy']) for (const weather of phase === 'controlled' ? ['Harsh', 'Severe'] : [null]) {
        const rows = compact.filter(row => row.phase === phase && (weather === null || row.weather === weather));
        const seeds = [...new Set(rows.map(row => row.seed))].sort((a, b) => a - b);
        const paired = [];
        for (const seed of seeds) {
            const match = Object.fromEntries(rows.filter(row => row.seed === seed).map(row => [row.arm, row]));
            if (!['none', 'one', 'two'].every(arm => match[arm])) continue;
            assert.equal(match.none.initialStateHash, match.one.initialStateHash, 'Paired founding state');
            assert.equal(match.none.initialStateHash, match.two.initialStateHash, 'Paired founding state');
            assert.equal(match.none.cpuTrajectoryHash, match.one.cpuTrajectoryHash, 'CPU isolation');
            assert.equal(match.none.cpuTrajectoryHash, match.two.cpuTrajectoryHash, 'CPU isolation');
            assert.equal(match.one.cpuGatherings + match.two.cpuGatherings, 0, 'No free CPU gatherings');
            paired.push(match);
        }
        const comparisons = [['one', 'none'], ['two', 'none'], ['two', 'one']].map(([intervention, baseline]) => {
            const fields = ['residentDeaths', 'foodPaid', 'food', 'materials', 'residentShortfall',
                'livestockShortfall', 'population', 'supportUsed', 'gatherings', 'shortageIntervals'];
            const deltas = Object.fromEntries(fields.map(field => [field,
                pairedInterval(paired.map(pair => pair[intervention].totals[field] - pair[baseline].totals[field]))]));
            return { intervention, baseline, deltas, changedDeathCount: wilson(paired.filter(pair =>
                pair[intervention].totals.residentDeaths !== pair[baseline].totals.residentDeaths).length, paired.length),
                weatherDivergences: paired.filter(pair => JSON.stringify(pair[intervention].weatherTrace) !==
                    JSON.stringify(pair[baseline].weatherTrace)).length };
        });
        const arms = Object.fromEntries(['none', 'one', 'two'].map(arm => {
            const armRows = rows.filter(row => row.arm === arm);
            return [arm, { campaigns: armRows.length,
                totals: Object.fromEntries(Object.keys(armRows[0]?.totals ?? {}).map(field =>
                    [field, armRows.reduce((sum, row) => sum + row.totals[field], 0)])),
                extinctClans: armRows.filter(row => row.totals.population === 0).length,
                starting15Food: armRows.filter(row => row.initialFood === 15).length,
                firstPaid: armRows.filter(row => row.firstPaid > 0).length }];
        }));
        groups.push({ phase, weather, pairedSeeds: paired.length, arms, comparisons });
    }
    const summary = { status: counts['technically-failed'] || Object.values(manifest.phases).some(phase => phase.status === 'technically-failed') ? 'technically-failed' : 'complete',
        fingerprint: manifest.fingerprint.id, counts, groups,
        invariants: { accounting: 'passed for every complete case', pairedFounding: 'passed',
            CPUIsolation: 'passed', CPUFreeSponsorship: 'absent' },
        interpretation: readProtocol(manifest.protocolPath).interpretation };
    writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    return summary;
}
function jobsFor(phase, protocol, summary) {
    const range = (first, last) => Array.from({ length: last - first + 1 }, (_, index) => index + first);
    if (phase === 'controlled') return protocol.controlled.weatherClasses.flatMap(weather =>
        range(protocol.seeds.first, protocol.seeds.controlledInitialLast).flatMap(seed =>
            protocol.arms.map(arm => ({ phase: 'controlled', weather, seed, arm }))));
    if (phase === 'expand') return protocol.controlled.weatherClasses.flatMap(weather => {
        const group = summary.groups.find(group => group.phase === 'controlled' && group.weather === weather);
        assert.ok(group && group.pairedSeeds >= protocol.seeds.controlledInitialLast, 'Initial controlled matrix required');
        const changed = group.comparisons.find(comparison => comparison.intervention === 'one' && comparison.baseline === 'none')
            .changedDeathCount.successes;
        return changed >= 10 ? [] : range(protocol.seeds.controlledInitialLast + 1,
            protocol.seeds.controlledExpandedLast).flatMap(seed => protocol.arms.map(arm =>
                ({ phase: 'controlled', weather, seed, arm })));
    });
    return range(phase === 'full' ? protocol.seeds.strategyPilotLast + 1 : protocol.seeds.first,
        phase === 'full' ? protocol.seeds.strategyFinalLast : protocol.seeds.strategyPilotLast)
        .flatMap(seed => protocol.arms.map(arm => ({ phase: 'strategy', seed, arm })));
}
function git(args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
async function main() {
    const args = process.argv.slice(2), phase = args[0] ?? 'summary', protocolPath = args[1] ?? defaultProtocol;
    assert.ok(['freeze', 'controlled', 'expand', 'pilot', 'full', 'summary'].includes(phase));
    const protocol = readProtocol(protocolPath), current = fingerprint(protocolPath, protocol);
    assert.match(protocol.study, /^[a-z0-9-]+$/);
    const output = join(root, 'docs/qa/cultural-events/calibration-' + protocol.study);
    mkdirSync(output, { recursive: true });
    const manifestPath = join(output, 'manifest.json');
    if (phase === 'freeze') {
        if (existsSync(manifestPath)) {
            assert.equal(JSON.parse(readFileSync(manifestPath)).fingerprint.id, current.id, 'Existing frozen protocol differs');
            console.log('Existing identical measurement freeze retained.');
            return;
        }
        writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, study: protocol.study, protocolPath,
            frozenAt: new Date().toISOString(), node: process.version, head: git(['rev-parse', 'HEAD']),
            branch: git(['symbolic-ref', '--quiet', '--short', 'HEAD']), dirtyStatus: git(['status', '--porcelain']),
            fingerprint: current, phases: {}, rawFiles: {} }, null, 2) + '\n');
        console.log(JSON.stringify({ frozen: current.id, dependencyFiles: Object.keys(current.sources).length, output }));
        return;
    }
    assert.ok(existsSync(manifestPath), 'Run freeze before any measurement');
    const manifest = JSON.parse(readFileSync(manifestPath));
    assert.equal(current.id, manifest.fingerprint.id, 'Frozen source/protocol changed; preserve old evidence and use a new study version');
    for (const name of ['controlled.jsonl', 'strategies.jsonl']) {
        const recovery = recoverPartialTail(join(output, name));
        if (recovery) {
            (manifest.recoveries ??= []).push(recovery);
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        }
    }
    let summary = await summarize(output, manifest);
    if (phase === 'summary') { console.log(JSON.stringify(summary, null, 2)); return; }
    assert.equal(summary.counts['technically-failed'], 0, 'Preserve failed evidence and use a new version after correcting the runner');
    if (phase === 'full') assert.equal(manifest.phases.pilot?.status, 'complete', 'Validated pilot required');
    const jobs = jobsFor(phase, protocol, summary), file = join(output,
        ['controlled', 'expand'].includes(phase) ? 'controlled.jsonl' : 'strategies.jsonl');
    const done = new Set();
    for await (const row of readRows(file)) { assert.equal(row.fingerprint, current.id); done.add(keyOf(row)); }
    const started = Date.now(), phaseRecord = { status: 'complete', startedAt: new Date().toISOString(),
        requested: jobs.length, alreadyComplete: jobs.filter(job => done.has(keyOf(job))).length, newlyComplete: 0,
        fingerprintBefore: current.id };
    for (const job of jobs) {
        if (done.has(keyOf(job))) continue;
        if (Date.now() - started > protocol.execution.maxMinutesPerInvocation * 60000) {
            phaseRecord.status = 'resource-limited'; break;
        }
        try {
            if (phaseRecord.newlyComplete % protocol.execution.sourceCheckEveryCases === 0)
                assert.equal(fingerprint(protocolPath, protocol).id, current.id, 'Source changed during measurement');
            const result = runCase(job, protocol);
            appendFileSync(file, JSON.stringify({ fingerprint: current.id, ...result }) + '\n');
            phaseRecord.newlyComplete++;
            if (phaseRecord.newlyComplete % 30 === 0) console.log(`${phase}: ${phaseRecord.newlyComplete} new campaigns`);
        } catch (error) {
            appendFileSync(file, JSON.stringify({ fingerprint: current.id, ...job,
                status: 'technically-failed', error: error.message }) + '\n');
            phaseRecord.status = 'technically-failed'; phaseRecord.error = error.message; break;
        }
    }
    if (phase === 'pilot' && phaseRecord.status === 'complete') {
        const sample = runCase({ phase: 'strategy', seed: 1, arm: 'one' }, protocol);
        let prior;
        for await (const row of readRows(file)) if (keyOf(row) === keyOf(sample)) { const { fingerprint, ...result } = row; prior = result; break; }
        assert.deepEqual(sample, prior, 'Representative full deterministic repeat');
        phaseRecord.representativeRepeat = 'passed';
    }
    phaseRecord.completedAt = new Date().toISOString();
    phaseRecord.fingerprintAfter = fingerprint(protocolPath, protocol).id;
    if (phaseRecord.fingerprintAfter !== current.id) {
        phaseRecord.status = 'technically-failed';
        phaseRecord.error = 'Source changed during measurement';
    }
    (manifest.attempts ??= []).push({ phase, ...phaseRecord });
    manifest.phases[phase] = phaseRecord;
    for (const rawName of ['controlled.jsonl', 'strategies.jsonl']) if (existsSync(join(output, rawName))) {
        const hash = createHash('sha256');
        for await (const bytes of createReadStream(join(output, rawName))) hash.update(bytes);
        manifest.rawFiles[rawName] = hash.digest('hex');
    }
    manifest.dirtyStatusAfter = git(['status', '--porcelain']);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    summary = await summarize(output, manifest);
    console.log(JSON.stringify({ phase, ...phaseRecord, counts: summary.counts,
        pairedGroups: summary.groups.map(group => ({ phase: group.phase, weather: group.weather, pairs: group.pairedSeeds })) }));
    if (phaseRecord.status === 'technically-failed') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
