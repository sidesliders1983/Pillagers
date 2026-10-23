/** Presentation switches only; never persisted into the canonical campaign. */
export function fjordLighting(query: URLSearchParams) {
    const unified = query.has('sunlight') ? query.get('sunlight') === 'unified-v1' :
        query.get('lighting') !== 'baseline';
    return {
        northern: query.get('lighting') !== 'baseline' || unified,
        unified,
        warmHomes: query.has('homes') ? query.get('homes') === 'warm-v1' : true,
    };
}
