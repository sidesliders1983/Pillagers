import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

/** Reuse Three.js's locked decoder; no downloaded tool or source kit is needed to validate GLBs. */
export async function terrainIO() {
    const require = createRequire(import.meta.url);
    const decoderFile = require.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js');
    const module = { exports: {} };
    runInNewContext(await readFile(decoderFile, 'utf8'), {
        module, exports: module.exports, process, require, __dirname: dirname(decoderFile),
        Buffer, console, setTimeout, clearTimeout
    }, { filename: decoderFile });
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.decoder': await module.exports(),
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder
    });
}
