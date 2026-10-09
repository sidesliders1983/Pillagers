import { distribution, summarizeAptitudes } from './aptitude-statistics.mjs';
export { summarizeAptitudes };
const total = (run, field) => run.annual.slice(1).reduce((sum, row) => sum + row[field], 0);
export const conditionKey = run => [run.model, run.policy, run.economy].join('/');
export function summarizeProfileEconomy(runs) {
    return [...new Set(runs.map(conditionKey))].map(key => {
        const group = runs.filter(run => conditionKey(run) === key);
        let longest = run => {
            let maximum = 0, streak = 0;
            for (const row of run.annual.slice(1)) {
                streak = row.shortfall > 0 ? streak + 1 : 0;
                maximum = Math.max(maximum, streak);
            }
            return maximum;
        };
        const fields = ['foodProduced', 'foodConsumed', 'spoiled', 'shortfall', 'births', 'deaths',
            'occupationChanges', 'playerOccupationChanges', 'specializationChanges'];
        return { key, count: group.length,
            finalFood: distribution(group.map(run => run.annual.at(-1).food)),
            finalMaterials: distribution(group.map(run => run.annual.at(-1).materials)),
            finalPopulation: distribution(group.map(run => run.annual.at(-1).population)),
            foodProduced: distribution(group.map(run => total(run, 'foodProduced'))),
            materialsProduced: distribution(group.map(run => run.annual.slice(1).reduce((sum, row) => sum + row.producedByRole.woodworker, 0))),
            totals: Object.fromEntries(fields.map(field => [field, distribution(group.map(run => total(run, field)))])),
            shortageSeeds: group.filter(run => run.annual.some(row => row.shortfall > 0)).length,
            sustainedShortageSeeds: group.filter(run => longest(run) >= 3).length,
            shortageWinters: distribution(group.map(run => run.annual.filter(row => row.shortfall > 0).length)),
            longestShortage: distribution(group.map(longest)),
            normalShortageWinters: group.reduce((sum, run) =>
                sum + run.annual.filter(row => row.weather === 'Normal' && row.shortfall > 0).length, 0),
            assignments: Object.fromEntries(Object.keys(group[0].ruleConfiguration.mechanics.occupations).map(role => [role,
                group.reduce((sum, run) => sum + run.annual.slice(1).reduce((years, row) =>
                    years + row.workers.filter(worker => worker.occupation === role).length, 0), 0)])),
            annual: group[0].annual.map((_, index) => ({ elapsedWinter: index,
                food: distribution(group.map(run => run.annual[index].food)),
                materials: distribution(group.map(run => run.annual[index].materials)),
                population: distribution(group.map(run => run.annual[index].population)),
            })),
        };
    });
}
export function pairProfileEconomy(runs) {
    return [...new Set(runs.filter(run => run.model !== 'A').map(conditionKey))].map(key => {
        const group = runs.filter(run => conditionKey(run) === key);
        const deltas = group.map(run => {
            const baseline = runs.find(other => other.seed === run.seed && other.model === 'A' &&
                other.policy === run.policy && other.economy === run.economy);
            if (!baseline) throw new Error('Missing matched control');
            const materialProduction = record => record.annual.slice(1).reduce((sum, row) => sum + row.producedByRole.woodworker, 0);
            return { seed: run.seed, food: run.annual.at(-1).food - baseline.annual.at(-1).food,
                materials: run.annual.at(-1).materials - baseline.annual.at(-1).materials,
                population: run.annual.at(-1).population - baseline.annual.at(-1).population,
                foodProduced: total(run, 'foodProduced') - total(baseline, 'foodProduced'),
                materialsProduced: materialProduction(run) - materialProduction(baseline),
                shortfall: total(run, 'shortfall') - total(baseline, 'shortfall'),
                spoiled: total(run, 'spoiled') - total(baseline, 'spoiled') };
        });
        return { key, deltas, ...Object.fromEntries(['food', 'materials', 'population', 'foodProduced',
            'materialsProduced', 'shortfall', 'spoiled'].map(field => [field, distribution(deltas.map(row => row[field]))])) };
    });
}
