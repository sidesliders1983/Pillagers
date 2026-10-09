import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { verifyProfileStudy } from './verify-profile-study.mjs';
import { distribution } from './aptitude-statistics.mjs';
import { conditionKey } from './profile-statistics.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const number = value => value === null ? '—' : Number(value).toFixed(2);
const percent = bps => number(bps / 100);
const table = (header, rows) => ['| ' + header.join(' | ') + ' |',
    '| ' + header.map(() => '---').join(' | ') + ' |',
    ...rows.map(row => '| ' + row.join(' | ') + ' |')].join('\n');
const roles = ['farmer', 'herder', 'fisher', 'hunter', 'textileWorker', 'smith', 'woodworker',
    'boatbuilder', 'trader', 'leatherAndJewelleryMaker'];

function diagnostics(directory, manifest, summary) {
    const runs = [];
    for (let seed = manifest.seeds.start; seed < manifest.seeds.start + manifest.seeds.count; seed++) {
        const record = JSON.parse(gunzipSync(readFileSync(join(directory, 'runs/seed-' + seed + '.json.gz'))));
        runs.push(...record.runs);
    }
    const economy = summary.economy.map(group => {
        const sample = runs.filter(run => conditionKey(run) === group.key);
        const outcomes = sample.map(run => {
            const annual = run.annual.slice(1);
            const total = key => annual.reduce((sum, row) => sum + row[key], 0);
            const humanFood = annual.reduce((sum, row) =>
                sum + row.producedByRole.farmer + row.producedByRole.fisher + row.producedByRole.hunter, 0);
            const productive = total('productiveFoodWorkers');
            return { seed: run.seed, humanFood, cattleFood: total('cattleProduced'),
                productiveFoodPersonWinters: productive,
                humanFoodPerProductivePersonWinter: productive ? humanFood / productive : null,
                lowReserveWinters: annual.filter(row => row.reserveWinters !== null && row.reserveWinters < 2).length,
                finalReserveWinters: annual.at(-1).reserveWinters,
                weatherCounts: Object.fromEntries(['Mild', 'Normal', 'Harsh', 'Severe'].map(weather =>
                    [weather, annual.filter(row => row.weather === weather).length])),
                finalAssignments: Object.fromEntries(roles.map(role =>
                    [role, annual.at(-1).workers.filter(worker => worker.occupation === role).length])) };
        });
        return { key: group.key, outcomes,
            humanFood: distribution(outcomes.map(row => row.humanFood)),
            cattleFood: distribution(outcomes.map(row => row.cattleFood)),
            humanFoodPerProductivePersonWinter: distribution(outcomes.map(row =>
                row.humanFoodPerProductivePersonWinter).filter(value => value !== null)),
            lowReserveWinters: distribution(outcomes.map(row => row.lowReserveWinters)),
            finalReserveWinters: distribution(outcomes.map(row => row.finalReserveWinters).filter(value => value !== null)),
        };
    });
    const bounds = {};
    for (const cohort of ['founders', 'descendants']) {
        const rows = JSON.parse(gunzipSync(readFileSync(join(directory, cohort + '.json.gz'))));
        bounds[cohort] = Object.fromEntries(['A', 'B', 'C'].map(model => {
            const sample = rows.filter(row => row.model === model);
            return [model, { upperCapScores: sample.flatMap(row => Object.values(row.aptitudes))
                .filter(value => value === 10000).length, totalScores: sample.length * 10,
                topTwoTies: summary[cohort][model].people.filter(person => person.topTwo === 0).length }];
        }));
    }
    return { economy, bounds };
}

export function renderProfileReport(directory) {
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.seeds.start, 0, 'Final report requires the full frozen cohort');
    assert.equal(manifest.seeds.count, 100, 'Final report requires 100 seeds');
    assert.equal(manifest.winters, 25, 'Final report requires the declared 25 Winters');
    const audit = verifyProfileStudy(directory);
    for (const file of ['design.md', 'implementation-plan.md']) {
        const template = readFileSync(new URL('../../docs/qa/occupation-profiles-v03b/' + file, import.meta.url));
        writeFileSync(join(directory, file), template);
    }
    const semanticsLink = relative(resolve(directory), fileURLToPath(
        new URL('../../docs/gameplay/spec/02-PERSONAS-FAMILY.md', import.meta.url))).replace(/\\/g, '/');

    const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
    const details = diagnostics(directory, manifest, summary);
    const condition = (model, economy, policy = 'aware') => summary.economy.find(row =>
        row.key === [model, policy, economy].join('/'));
    const productionChange = (model, economy, field) => number(100 *
        (condition(model, economy)[field].mean / condition('A', economy)[field].mean - 1));
    const candidateFindings = ['base', 'protected'].map(economy => {
        const a = condition('A', economy), b = condition('B', economy), c = condition('C', economy);
        return 'Under aware/' + economy + ', B changes mean total Food production by ' +
            productionChange('B', economy, 'foodProduced') + '% and Materials by ' +
            productionChange('B', economy, 'materialsProduced') + '%. Mean final Food is ' +
            number(b.finalFood.mean) + ' versus A ' + number(a.finalFood.mean) +
            '; shortage seeds are ' + b.shortageSeeds + '/100 versus ' + a.shortageSeeds + '/100. ' +
            'C increases mean Food production by ' + productionChange('C', economy, 'foodProduced') +
            '% and Materials by ' + productionChange('C', economy, 'materialsProduced') +
            '%, with mean final Food ' + number(c.finalFood.mean) + '. Both candidates retain zero unmet Normal Winters under this aware policy.';
    }).join(' ');

    writeFileSync(join(directory, 'diagnostics.json'), JSON.stringify(details, null, 2) + '\n');
    const gapTable = cohort => table(['Model', 'People', 'Median top-two gap (pp)', 'Median best–worst gap (pp)',
        'Generalist', 'Specialist', 'Poor fit', 'Mixed', 'Scores at 100%', 'Top-two ties'],
    ['A', 'B', 'C'].map(model => {
        const record = summary[cohort][model], bounds = details.bounds[cohort][model];
        return [model, record.count, percent(record.gaps.topTwo.median), percent(record.gaps.bestWorst.median),
            ...['generalist', 'specialist', 'poorFit', 'mixed'].map(key => record.counts[key]),
            bounds.upperCapScores + '/' + bounds.totalScores, bounds.topTwoTies];
    }));
    const roleTable = table(['Occupation', 'A mean / SD / P10 / P90 (%)', 'B mean / SD / P10 / P90 (%)',
        'C mean / SD / P10 / P90 (%)', 'Best role A/B/C (founders)'],
    roles.map(role => [role, ...['A', 'B', 'C'].map(model => {
        const record = summary.founders[model].roles[role];
        return [record.mean, record.standardDeviation, record.p10, record.p90].map(percent).join(' / ');
    }), ['A', 'B', 'C'].map(model => summary.founders[model].bestRoles[role]).join('/')]));
    const pairs = [['textileWorker', 'leatherAndJewelleryMaker'], ['woodworker', 'boatbuilder'],
        ['farmer', 'herder'], ['fisher', 'hunter']];
    const pairTable = table(['Pair', 'A r', 'B r', 'C r'], pairs.map(([a, b]) => [
        a + ' / ' + b, ...['A', 'B', 'C'].map(model => number(summary.founders[model].correlations[a][b]))]));
    const matrixTables = ['A', 'B', 'C'].map(model => '### ' + model + ' founder role correlations\n\n' +
        table(['Role', ...roles], roles.map(a => [a, ...roles.map(b =>
            number(summary.founders[model].correlations[a][b]))]))).join('\n\n');
    const traitTables = ['A', 'B', 'C'].map(model => '### ' + model + ' trait-to-role correlations\n\n' +
        table(['Trait', ...roles], Object.entries(summary.founders[model].traitCorrelations).map(([trait, values]) =>
            [trait, ...roles.map(role => number(values[role]))]))).join('\n\n');
    const economyTable = table(['Condition', 'Mean Food produced', 'Mean Materials produced',
        'Final Food mean / median', 'Final Materials mean / median', 'Final population mean',
        'Any shortage seeds', '3+ consecutive shortage seeds', 'Normal shortage Winters'],
    summary.economy.map(row => [row.key, number(row.foodProduced.mean), number(row.materialsProduced.mean),
        number(row.finalFood.mean) + ' / ' + number(row.finalFood.median),
        number(row.finalMaterials.mean) + ' / ' + number(row.finalMaterials.median), number(row.finalPopulation.mean),
        row.shortageSeeds + '/100', row.sustainedShortageSeeds + '/100', row.normalShortageWinters]));
    const pairedTable = table(['Condition vs matched A', 'Food-production mean delta', 'Materials-production mean delta',
        'Final Food mean delta', 'Shortfall mean delta', 'Population mean delta'],
    summary.paired.map(row => [row.key, ...['foodProduced', 'materialsProduced', 'food', 'shortfall', 'population']
        .map(field => number(row[field].mean))]));
    const managementTable = table(['Condition', 'Mean low-reserve Winters', 'Final normal reserve Winters (median)',
        'Human Food / productive Food-person-Winter (mean)', 'Mean player changes', 'Mean total occupation changes',
        'Mean building specialization changes', 'Mean spoiled Food'],
    summary.economy.map(row => {
        const d = details.economy.find(other => other.key === row.key);
        return [row.key, number(d.lowReserveWinters.mean), number(d.finalReserveWinters.median),
            number(d.humanFoodPerProductivePersonWinter.mean), number(row.totals.playerOccupationChanges.mean),
            number(row.totals.occupationChanges.mean), number(row.totals.specializationChanges.mean), number(row.totals.spoiled.mean)];
    }));
    const report = [
        '# CharacterDNA v0.3B — occupation profiles and specialization',
        '**Scope:** Issue #85 research only. Current scoring, campaign defaults and historical #83/#84 evidence remain unchanged. No new CharacterDNA traits, gender assumptions or production modifiers were introduced.',
        '## Recommendation and limits',
        'B is the preferred **profile candidate for a separately reviewed follow-up**, because it materially reduces the two previously near-duplicate pairs using weights and preferences alone. Retain A in production for now. Do not adopt C as a default: wider best–worst spread and more specialists do not establish a larger top-two decision gap, preservation of useful generalists or economic neutrality under aptitude-aware management. The 5–10 point top-two band is exploratory; neither measured candidate meets it. Further revision should preserve generalists and check the remaining Farmer/Herder and Fisher/Hunter overlap before implementation.',
        candidateFindings,
        'B increases founder specialists from ' + summary.founders.A.counts.specialist + ' to ' + summary.founders.B.counts.specialist + ', while reducing strict generalists from ' + summary.founders.A.counts.generalist + ' to ' + summary.founders.B.counts.generalist + '. This is a substantial breadth trade-off. Under base/random allocation, B shortage seeds rise from ' + condition('A', 'base', 'random').shortageSeeds + ' to ' + condition('B', 'base', 'random').shortageSeeds + '; under passive play from ' + condition('A', 'base', 'default').shortageSeeds + ' to ' + condition('B', 'base', 'default').shortageSeeds + '. Review starting assignments and broad usefulness before adoption; do not silently change the frozen benchmark policies or classification boundaries to improve these outcomes.',
        'C saturates ' + details.bounds.founders.C.upperCapScores + '/' + details.bounds.founders.C.totalScores + ' founder scores at 100%, leaving ' + details.bounds.founders.C.topTwoTies + '/' + summary.founders.C.count + ' top-two ties. This helps explain why its median top-two gap does not improve beyond B, even as its specialist count rises sharply.',
        'C’s role-mean centering is an expectation under the rounded-uniform founder generator, not a guarantee about the selected workforce, inherited descendants or whole-campaign output. Raw means, matched deltas, shortages and reserves below determine how much this matters. Do not infer that a fixed policy algorithm produces identical assignments or later demographic/RNG paths.',
        '## Cohorts, recipes and reproducibility',
        audit.founders + ' frozen #83 founders and ' + audit.descendants + ' frozen inherited descendants are evaluated in every A/B/C model, across ten roles. The study regenerates all founders with the real current CharacterDNA generator and checks the complete control records against the archive. Descendants are the same recorded people from the original control/aware campaigns, including deceased people, not candidate-specific survivor samples.',
        audit.campaigns + ' main campaigns × 25 Winters = ' + audit.winterRows + ' domestic Winter resolutions. Seeds 0–99 cross three models, default/random/aware policies and base/protected economies: 18 conditions per seed. Primary data are domestic-only; full-world equivalence uses canonical CPU regions and no expeditions.',
        'A keeps saved current vectors and the canonical score. B uses the differentiated vectors documented in [design.md](design.md), retaining linear scoring. C uses B vectors and the unrounded linear score, then applies: legacy expected role mean + 1.5 × (candidate linear score − candidate expected role mean), rounds once to basis points and clamps to 15–100%. Expectations enumerate 0.00–1.00 with 0.005 endpoint probability and 0.01 interior probability, matching the real rounded-uniform founder marginal. No Expanded/Quadratic default or scores above 100% are introduced.',
        'The protected economy is #77’s isolated C10-safe recipe: after the complete domestic Winter, discard floor(10% × max(0, Food − 2 × current normal-Winter consumption)). Mortality, consumption, maintenance, careers, couples and births run before spoilage; the next weather is already drawn. Protection is an exemption from spoilage, not guaranteed Food or immunity from consumption. No capacity/diminishing-return modifier is applied.',
        'All ten occupations are scored. The current economy activates only Farmer, Fisher and Hunter for resident Food and Woodworker for Materials; Herder and the other crafts have no direct resource output yet. This comparison cannot calibrate their future production chains.',
        'Policies reuse the frozen public-command allocator: default is passive; random and aware assign roughly one quarter of available workers to woodwork, choose at least one farmer, shelter/upgrade households with upkeep reserves, and shelter cattle within the soft cap. Aware reads that model’s aptitude. It can change assignments as scores/populations change, but the algorithm, seeded random role choice and budgets are fixed. They are benchmark policies, not optimal play.',
        'All aggregate production totals are whole units per 25-Winter campaign. Final stocks are at Winter 825. “Any shortage” means an unmet resident/cattle consumption event; three consecutive shortage Winters is reported separately. Food shortage is nonlethal in the current prototype. Low reserve means stock below two normal Winters. Productive-person output excludes Harsh zero-productivity Winters and excludes cattle production from its numerator; it still reflects shelter, age, care, upgrades, work remainders and switching.',
        'Base source revision: `' + manifest.baseRevision + '`. Runtime: `' + manifest.runtime.node + ' / ' + manifest.runtime.platform + ' / ' + manifest.runtime.architecture + '`. Complete rules, numeric profiles, source/mapping identities, cohort and harness hashes: [manifest.json](manifest.json). Every seed’s full annual rows, commands and hashes: `runs/seed-N.json.gz`. Every person’s scores: [founders.json.gz](founders.json.gz) and [descendants.json.gz](descendants.json.gz).',
        '## Trait semantics and role identities',
        'Physicality describes physical strength and force; agility dexterity and nimbleness; intelligence analytical and technical facility; cunning tactical and opportunistic tendency. **Low temperament is calm, restrained, patient and steady; high temperament is impulsive, fiery, intense and quick to react.** It is not generic virtue or discipline. None of these traits assigns an occupation or applies a gender multiplier. See [canonical semantics](' + semanticsLink + '#person-004--characterdna-trait-meanings) and [all ten candidate vectors and role justifications](design.md#initial-differentiated-candidate).',
        '## Aptitude distributions',
        '### Founders\n\n' + gapTable('founders'),
        '### Frozen descendants\n\n' + gapTable('descendants'),
        'Classification retains #83’s exploratory boundaries: generalist = minimum ≥70% and best–worst gap ≤15 points; specialist = maximum ≥90%, minimum ≤60% and gap ≥25 points; poor fit = maximum <70%; otherwise mixed. These disjoint labels are not assignment restrictions. Wider score spreads mechanically reduce generalist counts under this definition; remaining generalists are not evidence that broad usefulness is fully preserved.',
        roleTable,
        'Per-role percentiles/extrema, per-person rankings/gaps/categories, best-role counts, original assignment gaps, complete founder/descendant role and trait matrices: [summary.json](summary.json). Correct 100% cap counts and top-two ties are above and in [diagnostics.json](diagnostics.json); the reused #83 summary’s legacy “125% cap” diagnostic is irrelevant for these bounded models.',
        '## Correlations and single-trait risk',
        pairTable,
        'Both weights and preferred values change. Textile emphasises repetitive dexterity/patience; Leather/Jewellery emphasises technical design/adaptive finishing. Woodwork favours physical joinery; boatbuilding favours structural planning. Residual Food-role overlap remains visible. A strong role-specific intelligence–boatbuilding or temperament–herding association does not mean a single trait controls every career; inspect all five trait rows, the ten winning-role counts and the remaining generalists together. C’s saturation can suppress top-two gaps even while best–worst gaps rise.',
        matrixTables,
        traitTables,
        '## Matched economy results',
        economyTable,
        '### Paired changes against the same A policy/economy/seed\n\n' + pairedTable,
        '### Reserves, effective work and switching\n\n' + managementTable,
        'Absolute final stocks can change through household formation, childcare, deaths, upgrades and role switches as well as immediate aptitude. ' + audit.divergentRngPairs + ' of 1,200 candidate/control pairs diverge in saved RNG state during the campaign. Same-seed deltas are descriptive matched experiments, not isolated causal effects with identical subsequent weather and births. Full per-seed deltas and annual stock distributions are in summary.json; per-seed reserves and output diagnostics are in diagnostics.json.',
        '## Weather, accounting and verification',
        'Current merged weather is used once: Mild produces 110% Food, Normal 100%, Harsh produces no resident/cattle Food or Materials and raises resident/adult-cattle demand by 50% with separate category ceilings, Severe produces 50% Food with normal Materials/resident demand and triple adult-cattle demand. Probabilities are 20/55/20/5%. Their descriptive labels are not interchangeable.',
        'The independent archive audit checks Food = opening Food + human/cattle production − consumption − spoilage, and Materials = opening Materials + woodwork + recovery − construction/upgrades − upkeep, on every annual row. It also checks exact spoilage rounding, no capacity loss, actual Harsh/Severe demand and production, initial reported scores against real worker scores, all 18 matched conditions, source identities, complete cohorts, derived summaries and artifact checksums.',
        audit.historicalControls + ' A/base controls match #83 final-state hashes and public command histories; ' + audit.spoilageControls + ' A/protected/aware controls match #84 C10-safe. ' + audit.repeatAndSave + ' repeated midpoint save/load runs, ' + audit.fullWorld + ' full-world/domestic equivalences and six partial-work replay checks passed. Mismatched model/economy saves are rejected by tests. [audit.json](audit.json) records the checks. Historical manifests describe their own source revisions; their files are not rewritten to match the extended adapter.',
        'The build, required character/Lab-preview validation and full test suite are verified for delivery and recorded in the PR. No project formatter is configured; source layout was reviewed manually against neighbouring modules. The research boundary is the public harness output and real Simulation Core commands/save/load; no new browser UI is introduced.',
        '## Production follow-up',
        'The existing save retains numeric vectors/progress but no scoring-formula ID. The QA envelope includes model, policy, economy, numeric-profile hash, mapping hash, adapter hash and underlying source/hook identity. It rejects incompatible continuation and keeps experimental files separate from ordinary campaign saves. This proves the research adapter, not a completed production migration.',
        'A later implementation must explicitly approve vectors/formula and save versioning, resolve missing formula IDs to legacy behaviour, preserve saved vectors/progress/RNG, and display the same campaign-aware innate fit in gameplay choices, careers and work. Keep productivity modifiers separate. Character Lab’s six illustrative roles are a separate presentation decision from the ten gameplay roles. See [implementation-plan.md](implementation-plan.md).',
        '## Reproduce',
        '```text\npnpm install --frozen-lockfile\nnode scripts/qa/run-occupation-profiles.mjs --output artifacts/occupation-profiles-v03b --seeds 100 --winters 25 --workers 4\nnode scripts/qa/verify-profile-study.mjs artifacts/occupation-profiles-v03b\nnode scripts/qa/render-profile-report.mjs artifacts/occupation-profiles-v03b\nnode --test tests/occupation-profiles.test.mjs\n```',
        'Report figures are generated from the audited raw archive. [report-provenance.json](report-provenance.json) fingerprints the generator, dependency lock, manifest, summary, audit, diagnostics, design, implementation plan and final Markdown. Small CLI/test runs intentionally cannot produce this complete-cohort report.',
    ].join('\n\n') + '\n';
    writeFileSync(join(directory, 'report.md'), report);
    const receipt = { compiler: { typescript: ts.version },
        dependencyLockHash: digest(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8').replace(/\r\n/g, '\n')),
        generatorHash: digest(readFileSync(new URL('./render-profile-report.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')),
        files: Object.fromEntries(['manifest.json', 'summary.json', 'audit.json', 'diagnostics.json', 'design.md', 'implementation-plan.md', 'report.md']
            .map(file => [file, digest(readFileSync(join(directory, file)))])) };
    writeFileSync(join(directory, 'report-provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    console.log(JSON.stringify(renderProfileReport(process.argv[2])));
}
