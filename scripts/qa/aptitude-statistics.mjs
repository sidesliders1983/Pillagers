/** All distribution values are basis points; standard deviation uses the measured population. */
export function distribution(values) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    const quantile = p => {
        const position = (sorted.length - 1) * p;
        const left = Math.floor(position);
        return sorted[left] + (sorted[Math.ceil(position)] - sorted[left]) * (position - left);
    };
    return { min: sorted[0], max: sorted.at(-1), mean, median: quantile(.5),
        p10: quantile(.1), p25: quantile(.25), p75: quantile(.75), p90: quantile(.9),
        standardDeviation: Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length) };
}
function correlation(a, b) {
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const ma = mean(a), mb = mean(b);
    const covariance = a.reduce((sum, value, i) => sum + (value - ma) * (b[i] - mb), 0);
    const denominator = Math.sqrt(a.reduce((sum, value) => sum + (value - ma) ** 2, 0) *
        b.reduce((sum, value) => sum + (value - mb) ** 2, 0));
    return denominator ? covariance / denominator : null;
}
export const classificationThresholds = {
    highBps: 9000, lowBps: 6000, exceptionalBps: 11000,
    generalist: 'minimum >= 7000 and best–worst gap <= 1500',
    specialist: 'maximum >= 9000 and minimum <= 6000 and best–worst gap >= 2500',
    poorFit: 'maximum < 7000',
    otherwise: 'mixed; categories are disjoint exploratory labels, not gameplay rules',
};
export function summarizeAptitudes(rows) {
    const result = {};
    for (const model of [...new Set(rows.map(row => row.model))]) {
        const cohort = rows.filter(row => row.model === model);
        const roles = Object.keys(cohort[0].aptitudes);
        const ranked = cohort.map(row => {
            const ranking = [...roles].sort((a, b) => row.aptitudes[b] - row.aptitudes[a] || roles.indexOf(a) - roles.indexOf(b));
            const scores = ranking.map(role => row.aptitudes[role]);
            const minimum = scores.at(-1), maximum = scores[0], spread = maximum - minimum;
            return { campaignSeed: row.campaignSeed, personaId: row.personaId, name: row.name, ranking,
                bestWorst: spread, topTwo: maximum - scores[1], high: scores.filter(value => value >= 9000).length,
                low: scores.filter(value => value <= 6000).length, exceptional: scores.filter(value => value >= 11000).length,
                category: minimum >= 7000 && spread <= 1500 ? 'generalist'
                    : maximum >= 9000 && minimum <= 6000 && spread >= 2500 ? 'specialist'
                        : maximum < 7000 ? 'poorFit' : 'mixed' };
        });
        const values = role => cohort.map(row => row.aptitudes[role]);
        result[model] = {
            count: cohort.length, thresholds: classificationThresholds,
            roles: Object.fromEntries(roles.map(role => [role, distribution(values(role))])),
            gaps: { bestWorst: distribution(ranked.map(row => row.bestWorst)), topTwo: distribution(ranked.map(row => row.topTwo)) },
            counts: Object.fromEntries(['generalist', 'specialist', 'poorFit', 'mixed'].map(category =>
                [category, ranked.filter(row => row.category === category).length])),
            highCount: distribution(ranked.map(row => row.high)), lowCount: distribution(ranked.map(row => row.low)),
            universalHigh: ranked.filter(row => row.high === roles.length).length,
            upperCapScores: cohort.flatMap(row => Object.values(row.aptitudes)).filter(value => value === 12500).length,
            lowerCapScores: cohort.flatMap(row => Object.values(row.aptitudes)).filter(value => value === 1500).length,
            bestRoles: Object.fromEntries(roles.map(role => [role, ranked.filter(row => row.ranking[0] === role).length])),
            originalAssignment: {
                bestRoleMatches: cohort.filter((row, i) => row.assignedOccupation === ranked[i].ranking[0]).length,
                missedFit: distribution(cohort.filter(row => row.assignedOccupation).map(row =>
                    Math.max(...Object.values(row.aptitudes)) - row.aptitudes[row.assignedOccupation])),
            },
            correlations: Object.fromEntries(roles.map(a => [a, Object.fromEntries(roles.map(b => [b, correlation(values(a), values(b))]))])),
            traitCorrelations: Object.fromEntries(Object.keys(cohort[0].traits || {}).map(trait => [trait,
                Object.fromEntries(roles.map(role => [role, correlation(cohort.map(row => row.traits[trait]), values(role))]))])),
            traits: Object.fromEntries(Object.keys(cohort[0].traits || {}).map(trait => [trait, distribution(cohort.map(row => row.traits[trait]))])),
            people: ranked,
        };
    }
    return result;
}
