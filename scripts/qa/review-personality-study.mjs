import assert from 'node:assert/strict';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {loadTypeScript} from '../load-typescript.mjs';
const root = 'docs/qa/personality-life-events';
const summary = JSON.parse(readFileSync(root + '/summary.json', 'utf8'));
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const {ClanBook} = loadTypeScript(new URL('../../src/lore/ClanBook.ts', import.meta.url));
const runs = readdirSync(root + '/runs').map(path => JSON.parse(gunzipSync(readFileSync(root + '/runs/' + path))));
assert.equal(runs.length, 204);
for (const run of runs) {
    assert.equal(run.baselineParity, true);
    core.reconstructState(core.serializeState(run.final));
    for (const annual of run.annual) {
        const episodes = new Map();
        const events = run.events.filter(event => annual.eventIds.includes(event.id));
        assert.ok(events.filter(event => event.type === 'ResidentQuarrelled').length <= 1);
        const resolutions = events.filter(event => event.type === 'ResidentsReconciled');
        assert.ok(resolutions.length <= 1);
        assert.ok(annual.candidateChecks <= 128);
        for (const event of events.filter(event => event.type !== 'SocialIncidentEnded')) {
            for (const id of event.details.participants) {
                if (!episodes.has(id)) episodes.set(id, new Set());
                episodes.get(id).add(event.details.incidentId);
            }
        }
        assert.ok([...episodes.values()].every(incidents => incidents.size <= 1));
    }
}
const example = runs.filter(run => run.fixture).sort((a,b) => a.seed - b.seed)
    .find(run => run.events.some(event => event.type === 'ResidentsReconciled' && event.details.method === 'mediated'));
const resolution = example.events.find(event => event.type === 'ResidentsReconciled' && event.details.method === 'mediated');
const episode = example.events.filter(event => event.details.incidentId === resolution.details.incidentId);
const context = example.final.events.find(event => event.id === episode[0].details.contextEventId);
let state = example.initial;
const book = new ClanBook(state, false, 1);
const checkpoint = 800 + Math.ceil((resolution.time.winter - 800) / 5) * 5;
for (let year = 801; year <= checkpoint; year++) {
    state = core.advanceWinter(state);
    if ((year - 800) % 5 === 0) book.closeCheckpoint(state);
}
const chapter = book.snapshot().chapters.at(-1);
const paragraph = chapter.paragraphs.find(part => part.templateId.startsWith('clan-book.thread.social'));
assert.ok(episode.every(event => paragraph.sourceEventIds.includes(event.id)));
const record = {seed: example.seed, fixture: true, checkpoint, text: paragraph.text,
    sourceEventIds: paragraph.sourceEventIds, episode, context,
    note: 'An explicitly labelled scarcity/kin/helper fixture with approved social probabilities; not a default campaign story.'};
writeFileSync(root + '/episode.json', JSON.stringify(record, null, 2) + '\n');
const count = key => summary[key].totals;
const d = count('defaultCohort'), c = count('controlledCohort'), w = count('fullWorld');
const row = (label, key) => '| ' + label + ' | ' + [d[key], c[key], w[key]].join(' | ') + ' |';
const timings = Object.fromEntries(Object.entries(summary).map(([key, value]) => [key,
    Object.fromEntries(Object.entries(value.annualTimingMs).map(([field, ms]) => [field, Number(ms.toFixed(2))]))]));
const report = [
    '# Personality Life Events v0.1 · evidence and recommendation',
    '', 'Issue #120; all prototype values confirmed by the owner. This report measures the original explicit-on/off pilot. Owner rollout decision 2026-10-12 later enables new player campaigns by default while preserving existing saves and CPU defaults.',
    '', '## Scope and reproducibility',
    '', 'Two paired cohorts: 100 seeds (0–99) × 25 years each. One uses unchanged campaign balance and initial generation, with the optional world extension removed for domestic measurement. The other is a labelled Einar/Liv/Astrid shortage fixture: ages 32/30/20, no occupations, initial Food 0, Materials 100, mortality/partnership/fertility/career disabled and care duration 0. Social probabilities retain the approved settings. Four additional full-world seeds (0, 7, 32, 99) retain ordinary CPU targets. Total: 204 pairs / 408 campaigns / 10,200 campaign-year windows.',
    '', 'Every year compares all non-social canonical outcomes with social enabled/disabled. Only the added social extension/events and sequential event numbers are normalized, independently for each clan. No economic, demographic or existing RNG field is omitted. Exact repeat, batch and midpoint-save/load checks pass on all four verification seeds in all three cohorts (36 comparisons). Raw initial/final saves, configuration, windows, source events, per-person/pair counts and timings are retained in 204 compressed records.',
    '', 'Run: `node scripts/qa/run-personality-study.mjs`, then `node scripts/qa/review-personality-study.mjs`. [Manifest](manifest.json) records source revision, source hashes, environment, exact fixture recipe and raw-record digests; [summary](summary.json) retains every per-seed count. The source revision identifies the branch base at measurement time; the accompanying file hashes identify the implementation measured before its delivery commit.',
    '', '## Observed frequency',
    '', '| Metric | Default domestic (100) | Controlled (100) | Full world (4) |',
    '| --- | ---: | ---: | ---: |',
    ...[['Quarrel opportunities', 'quarrelOpportunities'], ['Quarrels opened', 'quarrels'],
        ['Mediation opportunities', 'mediationOpportunities'], ['Mediation attempts', 'mediationAttempts'],
        ['Successful mediation', 'mediationSuccesses'], ['Independent reconciliation opportunities', 'reconciliationOpportunities'],
        ['Independent reconciliations', 'independentReconciliations'], ['Total resolutions', 'reconciliations'],
        ['Expired unresolved', 'expired'], ['Inactive after death/departure', 'inactive'],
        ['Open at final boundary', 'unresolvedAtEnd'], ['Pairs recurring within a seed', 'repeatedPairs'],
        ['Uneventful runs', 'uneventful']].map(([label,key]) => row(label,key)),
    '', 'Successful mediation and its resolution refer to the same episode: they are not two successful aid episodes. Openings balance exactly with resolutions, expiry, inactivity and remaining open incidents in each cohort.',
    '', 'Default domestic rate: 90 openings in 2,500 annual windows (3.6% of windows); 49/100 runs have no social event. The controlled cohort deliberately supplies persistent pressure and a tied adult helper, so its higher frequency is not a prediction for normal play. Full-world samples are verification samples, too small for frequency inference.',
    '', '## Trait isolation, limits and fairness',
    '', 'Fixed-context public tests give 5%/30% quarrel at Temperament 0/1, 10%/30% helper initiative at helper Temperament 0/1, separate 50% mediation success, and 20%/10% independent reconciliation at mean Temperament 0/1. Recent reconciliation halves the pair chance. These isolate the formula without changing production DNA in a cohort and attributing economic differences to social behavior.',
    '', 'The post-run audit checks all 5,100 enabled annual windows for the 128 candidate-check budget, at most one new incident and one resolution, and no resident appearing in distinct actual episodes within a window. Per-person, per-pair, helper and recurrence counts are in the summary and raw files. Seeded starting points/reservoir selection remove an unconditional smallest-ID preference; this cohort does not prove equal demographic opportunity, and age, real ties, availability and shortage differ between residents. Very large clans use a bounded sample rather than an exhaustive pair scan.',
    '', 'Tests additionally cover the no-event branch, 0%/100% transitions, mediation failure/cooldown, opening-year exclusion, memory/expiry, death, actual mission absence, midyear transfer, duplicate/stale references, malformed saves, exact rollback, pause/render/read behavior and 2D/3D handoff. Temporary commitments are not falsely recorded as reconciliation.',
    '', '## Source-linked readable example',
    '', 'Controlled seed ' + example.seed + ':',
    '', '> ' + paragraph.text,
    '', '[Recorded episode](episode.json) includes the opening, attempt, resolution, exact resident FoodConsumed context and paragraph source references. Nothing in this prose asserts an insult, motive, personality judgment, unrecorded witness or ownership. Exact Food/Materials values remain in the factual ledger. Older plan versions and published chapters are retained.',
    '', '## Browser and cost',
    '', '[Browser report](browser/report.json): Gameplay Lab at 1440 px and 390 px, existing Clan Book reader at 1024 px with touch emulation. New-campaign-only setting, real imported Core transitions, stable disclosure, save/load rollback and no render-triggered rerolls pass without page errors. This is desktop Edge emulation, not a physical iPad certification.',
    '', 'Mean wall time per complete annual Core command (enabled / disabled): default domestic ' + timings.defaultCohort.enabledMean + ' / ' + timings.defaultCohort.disabledMean + ' ms; controlled ' + timings.controlledCohort.enabledMean + ' / ' + timings.controlledCohort.disabledMean + ' ms; full world ' + timings.fullWorld.enabledMean + ' / ' + timings.fullWorld.disabledMean + ' ms. Measurements ran with two workers alongside development checks on the old laptop. These are descriptive command/run totals, not isolated CPU overhead, frame samples or an FPS benchmark. No millisecond gate.',
    '', '## Recommendation',
    '', '**Keep the current coefficients; defer wider consequences.** The owner separately approved default-on new-player playtests on 12 October 2026, superseding the initial opt-in-only rollout recommendation. The source-linked sequence is recognizable and rare in the ordinary cohort. Helpers are scarce in normal play (30 opportunities, 10 attempts): widening real social opportunity should be assessed before raising success rates. Preserve the approved probabilities until an owner review; do not force a story by inventing witnesses or by giving every unrelated resident a tie. Working incidents expire and recent memory decays; no permanent escalation or economic penalties were added.',
    '', 'Family rules clarification: two complete Winters of birth cooldown and five Winters of childcare are the independently settled rules. Five-Winter care is correct. Historical measured configurations/results are preserved.',
    '', '## Delivery checks', '', 'Local build and unchanged asset validation passed. The full suite reports 630 tests (629 passed, zero failed, one inherited conditional GLB portability skip); the final targeted social/harness suite passes 18 tests, including three additional restore/memory/name checks. No formatter is configured; changed code was inspected manually and git diff --check passed. [Verification](verification.json). Required GitHub checks remain authoritative for the delivered head revision.', ''
].join('\n');
writeFileSync(root + '/report.md', report);
writeFileSync(root + '/review.html', '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Personality Life Events review · Pillagers</title><style>body{margin:0;background:#192c27;color:#eee7d3;font:18px/1.6 system-ui}main{max-width:960px;margin:auto;padding:24px}a{color:#dac99a}article{background:#263e35;padding:24px;border:1px solid #8e8864;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.5 monospace}td,th{padding:8px;text-align:right}th:first-child,td:first-child{text-align:left}table{width:100%;font-size:16px}summary{cursor:pointer}#error{color:#ffb4b4}</style><main><a href="/gameplay-lab">Gameplay Lab</a> · <a href="report.md">Full report</a><h1>Personality Life Events · opt-in pilot</h1><p>Approved experimental probabilities. Ordinary campaigns remain disabled.</p><div id="error"></div><table><thead><tr><th>Metric</th><th>Default</th><th>Controlled</th></tr></thead><tbody id="counts"></tbody></table><h2>A recorded episode</h2><p id="label"></p><article id="story"></article><details><summary>Sources and exact context</summary><pre id="sources"></pre></details><p>Core/save/replay and desktop touch checks passed. Physical iPad behavior is not certified. <a href="manifest.json">Run manifest</a> · <a href="summary.json">All counts</a></p><script type="module">try{const [s,e]=await Promise.all([fetch("summary.json").then(r=>r.json()),fetch("episode.json").then(r=>r.json())]);for(const [key,label] of [["quarrelOpportunities","Quarrel opportunities"],["quarrels","Quarrels"],["mediationAttempts","Mediation attempts"],["mediationSuccesses","Successful mediation"],["reconciliations","Resolutions"],["uneventful","Uneventful seeds"]]){const tr=document.createElement("tr");for(const value of [label,s.defaultCohort.totals[key],s.controlledCohort.totals[key]]){const td=document.createElement("td");td.textContent=value;tr.append(td)}document.getElementById("counts").append(tr)}document.getElementById("label").textContent="Controlled seed "+e.seed+"; labelled shortage, kin and helper fixture.";document.getElementById("story").textContent=e.text;document.getElementById("sources").textContent=JSON.stringify(e,null,2)}catch(e){document.getElementById("error").textContent=String(e)}</script></main></html>');
console.log(JSON.stringify({auditedRuns: runs.length, sourceLinkedSeed: example.seed, sourceEvents: episode.map(event => event.id)}));
