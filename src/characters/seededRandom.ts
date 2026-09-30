// Named streams keep identity samples stable when adding fields or changing age/traits.
export function seededRandom(seed: number, stream = 'identity') {
    let state = seed >>> 0;
    for (let i = 0; i < stream.length; i++) state = Math.imul(state ^ stream.charCodeAt(i), 16777619) >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let value = Math.imul(state ^ state >>> 15, state | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}
export function identitySample(seed: number, field: string) { return seededRandom(seed, field)(); }
