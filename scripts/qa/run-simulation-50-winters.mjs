import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadTypeScript} from '../load-typescript.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const {generateCharacterDNA} = loadTypeScript(new URL('../../src/characters/generateCharacterDNA.ts', import.meta.url));
const output = new URL('../../artifacts/qa/simulation-10-personas-50-winters/', import.meta.url);
mkdirSync(output, {recursive: true});
const seed = 26;
const occupations = ['farmer', 'herder', 'fisher', 'hunter', 'textileWorker', 'smith', 'woodworker', 'boatbuilder', 'trader', 'leatherAndJewelleryMaker'];
const initial = core.createFixtureClan(seed);
const extra = [['bjorn', 'Bjorn', 18], ['freya', 'Freya', 24], ['torsten', 'Torsten', 41], ['ingrid', 'Ingrid', 55], ['olaf', 'Olaf', 12], ['sigrid', 'Sigrid', 7], ['runa', 'Runa', 36]];
extra.forEach(([id, name, age], index) => {
    initial.personas[id] = {id, name, birthWinter: 800 - age, deathWinter: null, originClanId: initial.clan.id,
        dna: {...generateCharacterDNA(seed + index + 3), age}, parentIds: [], partnerId: null,
        occupation: null, occupationHistory: [], workProgress: index * 17};
});
const extraIds = extra.map(([id]) => id);
initial.families.other = {id: 'other', memberIds: extraIds};
initial.households.other = {id: 'other', memberIds: extraIds, residenceId: 'tent'};
initial.residences.tent = {id: 'tent', kind: 'tent', buildingId: null};
// Occupations on children are API coverage only; age eligibility is not a Pass A rule.
const ids = Object.keys(initial.personas);
const initialSaved = core.serializeState(initial);
const checks = [];
function check(name, operation) {
    try { operation(); checks.push({name, status: 'PASS'}); }
    catch (error) {checks.push({name, status: 'FAIL', error: error.message});}
}
const checkpoints = [];
const commandLog = [];
function assign(state, command, log) {if (log) commandLog.push(command); return core.applyCommand(state, command);}
function execute(mode, resume = false, log = false) {
    let state = core.reconstructState(initialSaved);
    ids.forEach((id, index) => {state = assign(state, {type: 'AssignOccupation', personaId: id, occupation: occupations[index]}, log);});
    for (let year = 1; year <= 50; year++) {
        if (mode === 'split') {
            state = assign(state, {type: 'AdvanceTicks', ticks: 137}, log);
            state = assign(state, {type: 'AdvanceTicks', ticks: 863}, log);
        } else state = assign(state, {type: 'AdvanceWinter'}, log);
        if (year === 25) {
            for (const command of [{type: 'AssignOccupation', personaId: 'einar', occupation: 'woodworker'},
                {type: 'AssignOccupation', personaId: 'liv', occupation: null},
                {type: 'AssignOccupation', personaId: 'liv', occupation: 'smith'}]) state = assign(state, command, log);
            if (resume) state = core.reconstructState(core.serializeState(state));
        }
        assert.equal(Object.keys(state.personas).length, 10);
        assert.deepEqual(state.time, {winter: 800 + year, tick: 0});
        assert.deepEqual(state.stocks, {food: 20, materials: 10});
        for (const id of ids) {
            assert.equal(core.personaAge(state, id), 800 - initial.personas[id].birthWinter + year);
            assert.deepEqual(state.personas[id].dna, initial.personas[id].dna);
            assert.equal(state.personas[id].workProgress, initial.personas[id].workProgress);
        }
        core.serializeState(state);
        if (log) checkpoints.push({winter: state.time.winter, tick: state.time.tick, personas: 10, stocks: {...state.stocks}, events: state.events.length});
    }
    return state;
}
let final;
check('50 Winterstappen: kalender, 10 identiteiten, leeftijden en integer-invarianten bij elke stap', () => {final = execute('winter', false, true);});
if (final) {
    check('Exact dezelfde seed en commands leveren identieke canonieke state en events', () => assert.deepEqual(execute('winter'), final));
    check('137 + 863 ticks per Winter zijn gelijk aan advanceWinter()', () => assert.deepEqual(execute('split'), final));
    check('Save/load halverwege behoudt alle volgende uitkomsten', () => assert.deepEqual(execute('winter', true), final));
    check('Geen wall-clock of ongesede randomness in initialisatie, stappen of save/load', () => {
        const now = Date.now, random = Math.random;
        try {
            Date.now = () => {throw new Error('Date.now accessed');};
            Math.random = () => {throw new Error('Math.random accessed');};
            assert.deepEqual(core.createFixtureClan(seed), core.createFixtureClan(seed));
            assert.deepEqual(execute('winter', true), final);
        } finally {Date.now = now; Math.random = random;}
    });
    check('Finale JSON roundtrip is byte-identiek', () => assert.equal(core.serializeState(core.reconstructState(core.serializeState(final))), core.serializeState(final)));
    check('50 Winter-events, 13 beroeps-events en unieke stabiele event-IDs', () => {
        assert.equal(final.events.filter(e => e.type === 'WinterAdvanced').length, 50);
        assert.equal(final.events.filter(e => e.type === 'OccupationAssigned').length, 13);
        assert.equal(final.events.length, 64);
        assert.equal(new Set(final.events.map(e => e.id)).size, 64);
    });
    check('Beroepswissel bewaart oude periode en event-time leeftijd', () => {
        assert.deepEqual(final.personas.einar.occupationHistory[0], {occupation: 'farmer', startedAt: {winter: 800, tick: 0}, endedAt: {winter: 825, tick: 0}});
        assert.equal(final.events.find(e => e.personaId === 'einar' && e.time.winter === 825).details.age, 57);
        assert.equal(final.personas.liv.occupationHistory.length, 2);
    });
    check('Familie-, household-, residence- en buildingrecords blijven behouden', () => {
        for (const key of ['families', 'households', 'residences', 'buildings']) assert.deepEqual(final[key], initial[key]);
        assert.deepEqual(final.personas.astrid.parentIds, ['einar', 'liv']);
    });
    check('De oorspronkelijke invoer is niet gemuteerd', () => assert.equal(core.serializeState(initial), initialSaved));
}
const testRun = spawnSync(process.execPath, ['--test', 'tests/simulation-core.test.mjs'], {cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8'});
writeFileSync(new URL('automated-tests.txt', output), (testRun.stdout ?? '') + (testRun.stderr ?? '') + (testRun.error?.message ?? ''));
check('Bestaande 6 Simulation Core tests', () => assert.equal(testRun.status, 0));
const rows = final ? ids.map(id => ({id, name: final.personas[id].name, startAge: 800 - initial.personas[id].birthWinter,
    endAge: core.personaAge(final, id), occupation: final.personas[id].occupation, historyPeriods: final.personas[id].occupationHistory.length})) : [];
const hash = final ? createHash('sha256').update(core.serializeState(final)).digest('hex') : null;
const result = {scenario: '10 personas, 50 Winters', seed, start: initial.time, end: final?.time, checks, personas: rows,
    checkpoints, finalStateSha256: hash, limitations: ['No production/consumption, birth/death, housing decay or age eligibility in Pass A.', 'Child occupations only exercise the command API.', 'DNA.age is the initial snapshot; personaAge is the current age.']};
writeFileSync(new URL('results.json', output), JSON.stringify(result, null, 2));
writeFileSync(new URL('initial-state.json', output), initialSaved);
writeFileSync(new URL('commands.json', output), JSON.stringify(commandLog, null, 2));
if (final) writeFileSync(new URL('final-state.json', output), core.serializeState(final));
const failed = checks.filter(c => c.status === 'FAIL');
const report = `# QA-rapport: 10 personas, 50 Winters\n\nDatum: 7 oktober 2026. Seed: ${seed}. Core: Simulation Core v0.1A (#26).\n\nResultaat: **${failed.length ? 'FAIL' : 'PASS'}**, ${checks.length - failed.length}/${checks.length} controles geslaagd.\n\nWinter 800/tick 0 → Winter ${final?.time.winter}/tick ${final?.time.tick}; 50.000 ticks. 10 personas behouden. Food 20 en Materials 10 blijven gelijk. ${final?.events.length ?? 0} events: 1 initialisatie, 10 eerste beroepsopdrachten, 3 wijzigingen in Winter 825, 50 Winter-events.\n\n## Testopzet\n\nEen QA-fixture breidt de bestaande clan uit van 3 naar 10 personas, met gesede DNA, een tweede huishouden en tent. Beroepsopdrachten doorlopen alle tien ondersteunde categorieën. Einar wisselt in Winter 825 van farmer naar woodworker; Liv stopt als herder en begint als smith. Elke jaarlijkse checkpoint valideert kalender, identiteit, leeftijd, DNA, voortgang en voorraden. Dezelfde scenario-run wordt herhaald, opgesplitst in 137/863 ticks en hervat na save/load in Winter 825.\n\n## Controles\n\n| Controle | Resultaat |\n|---|---|\n${checks.map(c => `| ${c.name} | ${c.status}${c.error ? ': ' + c.error.replaceAll('|', '/') : ''} |`).join('\n')}\n\n## Personas\n\n| Naam | Leeftijd Winter 800 | Leeftijd Winter 850 | Eindberoep | Beroepsperiodes |\n|---|---:|---:|---|---:|\n${rows.map(p => `| ${p.name} | ${p.startAge} | ${p.endAge} | ${p.occupation} | ${p.historyPeriods} |`).join('\n')}\n\n## Interpretatie en grenzen\n\nDeze run bewijst de deterministische foundation, geen economische of demografische balans. Productie, consumptie, geboorte, sterfte en woningverval ontbreken in Pass A. Daardoor blijven alle personas leven, ook op 105 winters, en voorraden gelijk. Ook kinderen krijgen hier een beroep om de API te testen; leeftijdsregels voor werk zijn nog niet geïmplementeerd. DNA.age blijft een begin-snapshot; de actuele leeftijd komt uit personaAge. Geen tijdafhankelijke random mechanics worden in deze pass uitgevoerd.\n\n## Reproduceren\n\nVanaf de repository-root: \`node scripts/qa/run-simulation-50-winters.mjs\`. De runner stopt met exitcode 1 als een controle faalt.\n\nBijlagen: results.json (50 jaarlijkse checkpoints), initial-state.json, commands.json, final-state.json en automated-tests.txt.\n\nSHA-256 finale JSON: \`${hash}\`.\n\nDeze runner voert de zes core-tests uit. De volledige repository-suite en app-build worden apart uitgevoerd bij oplevering; hun uitkomsten staan in het vastgelegde opleveringsrapport.\n`;
writeFileSync(new URL('report.md', output), report);
console.log(JSON.stringify({status: failed.length ? 'FAIL' : 'PASS', checks: checks.length, failed: failed.length, end: final?.time, events: final?.events.length, report: fileURLToPath(new URL('report.md', output))}, null, 2));
process.exitCode = failed.length ? 1 : 0;
