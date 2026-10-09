const capacity = fullWorkers => ({ fullWorkers, marginalBps: [7500, 5000, 2500], floorBps: 1000 });

export const foodScenarios = {
    D2: { policy: 'aware', spoilageBps: 0, protectedWinters: 0, capacity: capacity(2) },
    D4: { policy: 'aware', spoilageBps: 0, protectedWinters: 0, capacity: capacity(4) },
    A: { policy: 'default', spoilageBps: 0, protectedWinters: 0, capacity: null },
    B: { policy: 'aware', spoilageBps: 0, protectedWinters: 0, capacity: null },
    C05: { policy: 'aware', spoilageBps: 500, protectedWinters: 0, capacity: null },
    C10: { policy: 'aware', spoilageBps: 1000, protectedWinters: 0, capacity: null },
    C15: { policy: 'aware', spoilageBps: 1500, protectedWinters: 0, capacity: null },
    E05: { policy: 'aware', spoilageBps: 500, protectedWinters: 0, capacity: capacity(2) },
    E10: { policy: 'aware', spoilageBps: 1000, protectedWinters: 0, capacity: capacity(2) },
    E15: { policy: 'aware', spoilageBps: 1500, protectedWinters: 0, capacity: capacity(2) },
    'E10-N4': { policy: 'aware', spoilageBps: 1000, protectedWinters: 0, capacity: capacity(4) },
    'E10-safe': { policy: 'aware', spoilageBps: 1000, protectedWinters: 2, capacity: capacity(2) },
    'C10-safe': { policy: 'aware', spoilageBps: 1000, protectedWinters: 2, capacity: null },
};
