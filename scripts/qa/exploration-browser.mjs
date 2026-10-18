// Loaded only by the loopback QA driver. No game entry imports this module.
const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');

export function installCommandTrace(audit) {
    const { session, campaign } = audit.references;
    const initialJSON = session.saveJSON();
    const initial = JSON.parse(initialJSON);
    const originalBind = session.bindPhysicalWorld;
    const originalCommand = session.command;
    let binding, current;
    const rows = [];
    session.bindPhysicalWorld = function (world, worldId, exclusions) {
        binding = { world, worldId, exclusions };
        return originalBind.call(this, world, worldId, exclusions && (() => {
            const value = exclusions();
            if (current) current.context.exclusions = structuredClone(value);
            return value;
        }));
    };
    // Public idempotent rebinding exposes the real callback arguments, never private session fields.
    campaign.enableDiscovery();
    if (session.saveJSON() !== initialJSON) throw new Error('QA rebinding changed canonical state.');
    session.command = function (command) {
        const before = this.saveJSON();
        const row = { command: structuredClone(command), context: { worldId: binding.worldId },
            before: hash(before) };
        current = row;
        const started = performance.now();
        try { return originalCommand.call(this, command); }
        catch (error) { row.rejected = String(error); throw error; }
        finally {
            row.milliseconds = performance.now() - started;
            row.after = hash(this.saveJSON());
            rows.push(row);
            current = undefined;
        }
    };
    return {
        async finish() {
            session.command = originalCommand;
            session.bindPhysicalWorld = originalBind;
            originalBind.call(session, binding.world, binding.worldId, binding.exclusions);
            return { version: 1, seed: initial.seed, initial, world: binding.world,
                commands: await Promise.all(rows.map(async row => ({ ...row,
                    before: await row.before, after: await row.after }))),
                checkpoints: [], final: await hash(session.saveJSON()) };
        },
    };
}

export function allocationSnapshot(audit) {
    const { scene, renderer, models, discoveryFog, rivalScene, lighting } = audit.references;
    const geometries = new Set(), buffers = new Set(), textures = new Set();
    let geometryBytes = 0, textureRgba8EquivalentBytes = 0, bones = 0;
    const addTexture = texture => {
        if (!texture?.isTexture || textures.has(texture)) return;
        textures.add(texture);
        const image = texture.image;
        if (image?.width && image?.height)
            textureRgba8EquivalentBytes += image.width * image.height * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
    };
    scene.traverse(node => {
        if (node.isSkinnedMesh) bones += node.skeleton.bones.length;
        if (!node.isMesh) return;
        if (!geometries.has(node.geometry)) {
            geometries.add(node.geometry);
            for (const attribute of [...Object.values(node.geometry.attributes), node.geometry.index]) {
                const array = attribute?.array ?? attribute?.data?.array;
                if (array && !buffers.has(array.buffer)) {
                    buffers.add(array.buffer);
                    geometryBytes += array.buffer.byteLength;
                }
            }
        }
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            for (const value of Object.values(material)) addTexture(value);
            for (const uniform of Object.values(material.uniforms ?? {})) addTexture(uniform.value);
        }
    });
    const rival = rivalScene?.describe() ?? [];
    return { renderer: { ...renderer.info.render }, memory: { ...renderer.info.memory },
        programs: renderer.info.programs?.length ?? null,
        heap: performance.memory ? performance.memory.usedJSHeapSize : null,
        geometryBytes, textureRgba8EquivalentBytes: Math.round(textureRgba8EquivalentBytes), bones,
        estimateLimits: 'Unique scene ArrayBuffers and RGBA8-equivalent images. Not driver VRAM; excludes inactive model caches, render targets and programs.',
        models: models.inspectResources(), rivalActors: rival.filter(item => item.kind === 'persona').length,
        rivalEntities: rival.length, rivalPlaceholders: rival.filter(item => item.placeholder).length,
        fog: discoveryFog?.inspect(), shadowCoverage: lighting.inspectShadowCoverage() };
}

export function installDrawCounters(audit) {
    const renderer = audit.references.renderer;
    const original = renderer.shadowMap.render;
    const stats = { shadowCalls: 0, shadowTriangles: 0 };
    renderer.shadowMap.render = function (...args) {
        const beforeCalls = renderer.info.render.calls;
        const beforeTriangles = renderer.info.render.triangles;
        try { return original.apply(this, args); }
        finally {
            stats.shadowCalls = renderer.info.render.calls - beforeCalls;
            stats.shadowTriangles = renderer.info.render.triangles - beforeTriangles;
        }
    };
    return () => ({ ...stats, totalCalls: renderer.info.render.calls,
        totalTriangles: renderer.info.render.triangles,
        mainCalls: renderer.info.render.calls - stats.shadowCalls,
        mainTriangles: renderer.info.render.triangles - stats.shadowTriangles });
}
