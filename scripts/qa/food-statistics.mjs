import { distribution } from './aptitude-statistics.mjs';
export function shortageEpisodes(annual) {
    const episodes = [];
    for (let index = 1; index < annual.length; index++) {
        if (!annual[index].shortfall) continue;
        const first = index;
        while (index + 1 < annual.length && annual[index + 1].shortfall) index++;
        const last = index;
        const recovered = annual.findIndex((row, next) => next > last && row.reserveWinters !== null && row.reserveWinters >= 2);
        episodes.push({ start: annual[first].winter, end: annual[last].winter, length: last - first + 1,
            recoveryWinters: recovered < 0 ? null : recovered - last });
    }
    return episodes;
}
export function summarizeFoodRuns(runs) {
    return [...new Set(runs.map(run => run.scenario))].map(scenario => {
        const group = runs.filter(run => run.scenario === scenario);
        const years = run => run.annual.slice(1);
        const total = field => distribution(group.map(run => years(run).reduce((sum, row) => sum + row[field], 0)));
        const end = field => distribution(group.map(run => run.annual.at(-1)[field]));
        const episodes = group.flatMap(run => shortageEpisodes(run.annual).map(episode => ({ seed: run.seed, ...episode })));
        const weatherRows = weather => group.flatMap(run => run.annual.map((row, index) => ({ row, next: run.annual[index + 1] }))
            .filter(record => record.row.weather === weather));
        const weather = Object.fromEntries(['Mild', 'Normal', 'Harsh', 'Severe'].map(kind => {
            const rows = weatherRows(kind);
            return [kind, { observedWinters: rows.length, food: distribution(rows.map(record => record.row.food)),
                shortageWinters: rows.filter(record => record.row.shortfall > 0).length,
                healthyEnteringButShortage: rows.filter(record => record.row.previousFood >= 2 * record.row.openingNormalNeed && record.row.shortfall > 0).length,
                nextBoundaryFood: distribution(rows.filter(record => record.next).map(record => record.next.food)),
                production: distribution(rows.map(record => record.row.foodProduced)),
                foodDelta: distribution(rows.map(record => record.row.food - record.row.previousFood)) }];
        }));
        return { scenario, seeds: group.length, winters: group[0].winters, recipe: group[0].recipe,
            finalFood: end('food'), finalMaterials: end('materials'), finalPopulation: end('population'),
            finalReserves: distribution(group.map(run => run.annual.at(-1).reserveWinters).filter(value => value !== null)),
            minimumFood: distribution(group.map(run => Math.min(...run.annual.map(row => row.food)))),
            checkpoints: Object.fromEntries([5, 10, 15, 20, 25, 50].filter(index => index <= group[0].winters).map(index =>
                [800 + index, { food: distribution(group.map(run => run.annual[index].food)),
                    materials: distribution(group.map(run => run.annual[index].materials)),
                    population: distribution(group.map(run => run.annual[index].population)) }])),
            foodProduced: total('foodProduced'), foodConsumed: total('foodConsumed'), spoiled: total('spoiled'),
            capacityLostEquivalent: total('capacityLostEquivalent'), cattleProduced: total('cattleProduced'), cattleConsumed: total('cattleConsumed'),
            roleProduction: Object.fromEntries(['farmer', 'fisher', 'hunter', 'woodworker'].map(role => [role,
                distribution(group.map(run => years(run).reduce((sum, row) => sum + row.producedByRole[role], 0)))])),
            unmetConsumptionEvents: total('unmetConsumptionEvents'), unmetFood: total('shortfall'), seedsWithShortage: group.filter(run => years(run).some(row => row.shortfall > 0)).length,
            shortageWinters: distribution(group.map(run => years(run).filter(row => row.shortfall > 0).length)),
            longestStreak: distribution(group.map(run => Math.max(0, ...shortageEpisodes(run.annual).map(episode => episode.length)))),
            sustainedShortageSeeds: group.filter(run => shortageEpisodes(run.annual).some(episode => episode.length >= 3)).length,
            lowReserveWinters: distribution(group.map(run => years(run).filter(row => row.reserveWinters !== null && row.reserveWinters < 1).length)),
            populationDeclineSeeds: group.filter(run => run.annual.at(-1).population < 10).length,
            hitZeroSeeds: group.filter(run => years(run).some(row => row.food === 0)).length,
            recovery: { episodes, resolved: episodes.filter(episode => episode.recoveryWinters !== null).length,
                unresolved: episodes.filter(episode => episode.recoveryWinters === null).length,
                recoveredDelay: distribution(episodes.map(episode => episode.recoveryWinters).filter(value => value !== null)) },
            materialsSpent: total('materialsSpent'), upkeep: total('upkeep'), finalHouses: end('houses'), finalUpgrades: end('upgrades'),
            finalFarmyards: end('farmyards'), finalCattle: end('cattle'), finalExposedCattle: end('unshelteredCattle'),
            overcrowdingCattleWinters: total('overcrowding'), childcarePersonWinters: total('childcarePersonWinters'),
            ageReducedPersonWinters: total('ageReducedWorkers'), activeFoodPersonWinters: total('activeFood'), activeMaterialsPersonWinters: total('activeMaterials'),
            productiveFoodPersonWinters: total('productiveFoodWorkers'), productiveMaterialsPersonWinters: total('productiveMaterialsWorkers'),
            births: total('births'), deaths: total('deaths'), occupationChanges: total('occupationChanges'), specializationChanges: total('specializationChanges'),
            commandAttempts: distribution(group.map(run => run.commands.length)),
            commandAccepted: distribution(group.map(run => run.commands.filter(command => command.accepted).length)),
            commandRejected: distribution(group.map(run => run.commands.filter(command => !command.accepted).length)),
            weather,
            annual: group[0].annual.map((_, index) => ({ winter: 800 + index, food: distribution(group.map(run => run.annual[index].food)),
                materials: distribution(group.map(run => run.annual[index].materials)), population: distribution(group.map(run => run.annual[index].population)) })),
            outliers: [...group].sort((a, b) => a.annual.at(-1).food - b.annual.at(-1).food || a.seed - b.seed)
                .filter((_, index) => index < 3 || index >= group.length - 3)
                .map(run => ({ seed: run.seed, food: run.annual.at(-1).food,
                    shortages: years(run).filter(row => row.shortfall > 0).map(row => row.winter), finalStateHash: run.finalStateHash })),
        };
    });
}
export function pairedFoodRuns(runs, reference = 'B') {
    return [...new Set(runs.map(run => run.scenario))].filter(scenario => scenario !== reference).map(scenario => {
        const deltas = runs.filter(run => run.scenario === scenario).map(run => {
            const control = runs.find(other => other.seed === run.seed && other.scenario === reference);
            const unmet = record => record.annual.slice(1).reduce((sum, row) => sum + row.shortfall, 0);
            return { seed: run.seed, food: run.annual.at(-1).food - control.annual.at(-1).food,
                unmetFood: unmet(run) - unmet(control), population: run.annual.at(-1).population - control.annual.at(-1).population,
                rngDivergenceWinter: run.annual.findIndex((row, index) => row.rngState !== control.annual[index].rngState) };
        });
        return { scenario, reference, deltas, finalFoodDelta: distribution(deltas.map(row => row.food)),
            unmetFoodDelta: distribution(deltas.map(row => row.unmetFood)), populationDelta: distribution(deltas.map(row => row.population)),
            divergedSeeds: deltas.filter(row => row.rngDivergenceWinter > 0).length };
    });
}
