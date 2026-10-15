import {Material, Matrix4, Mesh, SkinnedMesh, Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {maskedBodyGeometry, type BodyCutPlane} from './BodyCoverage';
import type {NativeModuleSource} from './MeshyModuleRuntime';
import type {MeshyBodyFitAdapter} from './MeshyBodyFitAdapter';

// Coverage intersections are stored in the body's quantized float32 frame.
// Use the same small tolerance when stabilizing their weights and hiding the tank top.
const preparedOpeningTolerance = 1e-5;

function requireValue(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message);
}

/** Prepared review assets contain metre positions and four frozen native influences. */
export function validatePreparedOutfit(source: NativeModuleSource, fit: MeshyBodyFitAdapter) {
    const {binding, asset, source: gltf} = source;
    const prepared = binding.precomputedNative;
    requireValue((prepared?.version === 2 || prepared?.version === 3) && prepared.coordinateFrame === 'metre'
        && prepared.bodyBindings.length > 0,
    'Invalid prepared outfit contract');
    if (prepared.version === 3) {
        requireValue(prepared.moduleCoverage?.length && prepared.moduleCoverage.every(band =>
            band.regions.length > 0 && Number.isFinite(band.minimumY)
            && Number.isFinite(band.maximumY) && band.minimumY < band.maximumY
            && (band.preserveRegions === undefined || Array.isArray(band.preserveRegions)
                && band.preserveRegions.every(region => typeof region === 'string'))),
        'Prepared clothing must declare finite measured coverage bands');
        requireValue(prepared.lowerUnderlap === undefined
            || typeof prepared.lowerUnderlap.id === 'string'
            && /^[a-f0-9]{64}$/.test(prepared.lowerUnderlap.moduleSha256)
            && Number.isFinite(prepared.lowerUnderlap.maximumY)
            && (prepared.lowerUnderlap.radialInset === undefined
                || Number.isFinite(prepared.lowerUnderlap.radialInset)
                && prepared.lowerUnderlap.radialInset >= 0 && prepared.lowerUnderlap.radialInset <= .03)
            && (prepared.lowerUnderlap.hipBlendFromY === undefined
                || Number.isFinite(prepared.lowerUnderlap.hipBlendFromY)
                && Number.isFinite(prepared.lowerUnderlap.hipBlendToY)
                && prepared.lowerUnderlap.hipBlendFromY < prepared.lowerUnderlap.hipBlendToY!), 'Invalid lower garment underlap');
        requireValue(prepared.neckMaterial === undefined
            || [prepared.neckMaterial.minimumY, prepared.neckMaterial.maximumY,
                prepared.neckMaterial.halfWidth, prepared.neckMaterial.undershirtHalfWidth].every(Number.isFinite)
            && (prepared.neckMaterial.stabilizeSkinWeights === undefined
                || typeof prepared.neckMaterial.stabilizeSkinWeights === 'boolean')
            && prepared.neckMaterial.minimumY < prepared.neckMaterial.maximumY
            && prepared.neckMaterial.halfWidth > prepared.neckMaterial.undershirtHalfWidth
            && prepared.neckMaterial.undershirtHalfWidth >= 0, 'Invalid native neck material boundary');
        requireValue(prepared.bodyOpenings === undefined || prepared.bodyOpenings.every(opening =>
            Number.isFinite(opening.minimumY) && Number.isFinite(opening.maximumY)
            && opening.minimumY < opening.maximumY && opening.planes.length > 0
            && opening.planes.every(plane => plane.normal.length === 3
                && plane.normal.every(Number.isFinite) && Math.hypot(...plane.normal) > 0
                && Number.isFinite(plane.constant))), 'Invalid measured body opening');
    } else {
        const coverage = prepared.coverage;
        requireValue(coverage.arms.length === 2 && coverage.legs.length === 2
            && [coverage.headAbove, coverage.neckAbove, coverage.neckHalfWidth,
            coverage.chestAbove, coverage.chestFront, coverage.chestHalfWidth, coverage.chestSlope]
            .every(Number.isFinite)
            && coverage.chestAbove < coverage.neckAbove && coverage.neckAbove < coverage.headAbove
            && coverage.chestHalfWidth > 0 && coverage.neckHalfWidth > 0 && coverage.chestSlope > 0
            && [...coverage.arms, ...coverage.legs].every(plane => plane.normal.length === 3
                && plane.normal.every(Number.isFinite) && Number.isFinite(plane.constant)
                && Math.hypot(...plane.normal) > 0 && plane.regions.length > 0),
        'Prepared body coverage must contain finite measured boundaries');
    }
    requireValue(asset.scope === 'body-bound' && asset.reviewStatus === 'preview'
        && (binding.skinning === 'surface-barycentric-native'
            || prepared.version === 3 && binding.skinning === 'authored-four-native')
        && binding.materialPolicy?.kind === 'provider-original'
        && binding.materialPolicy.reviewOnly === true && !binding.dependency,
    'Prepared outfits require an explicit source-bound Lab review');
    requireValue(binding.materialPolicy.provider === 'Meshy'
        && /^[a-f0-9]{64}$/.test(binding.materialPolicy.sourceSha256),
    'Prepared outfit provider identity is missing');
    requireValue(binding.seams.length === 0 && binding.coverageRimContacts?.length === 0
        && binding.coverageClipPlanes?.length === 0
        && Object.values(binding.lods).every(lod => !lod.anchors.length
            && !lod.vertexAnchors.length && !lod.weights.length && !lod.coverageTriangles.length),
    'Prepared outfits must not mix precomputed and surface-refit bindings');
    gltf.scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    gltf.scene.traverse(node => {
        requireValue(!(node as import('three').Bone).isBone, 'Prepared outfit must not copy body bones');
        if ((node as Mesh).isMesh) meshes.push(node as Mesh);
    });
    requireValue(meshes.length === prepared.meshes.length, 'Prepared outfit mesh count differs');
    const names = new Set<string>();
    for (const mesh of meshes) {
        requireValue(!(mesh as SkinnedMesh).isSkinnedMesh && !names.has(mesh.name),
            'Prepared outfit must contain unique static mesh payloads');
        names.add(mesh.name);
        const identity = new Matrix4();
        requireValue(mesh.matrixWorld.elements.every((value, index) =>
            Math.abs(value - identity.elements[index]) < 1e-7), 'Prepared positions must be baked');
        const position = mesh.geometry.getAttribute('position');
        const normal = mesh.geometry.getAttribute('normal');
        const uv = mesh.geometry.getAttribute('uv');
        requireValue(normal?.itemSize === 3 && uv?.itemSize === 2
            && normal.count === position?.count && uv.count === position?.count,
        'Prepared outfit normals and UVs are required, for every clothing mesh');
        const joints = mesh.geometry.getAttribute('skinIndex');
        const weights = mesh.geometry.getAttribute('skinWeight');
        requireValue(position?.itemSize === 3 && joints?.itemSize === 4 && weights?.itemSize === 4
            && joints.count === position.count && weights.count === position.count,
        'Prepared native influences are missing');
        const expected = prepared.meshes.find(record => record.mesh === mesh.name)?.vertices;
        requireValue(position.count === expected, 'Prepared vertex counts differ');
        requireValue(mesh.name.startsWith('Module_'), 'Unexpected prepared helper mesh');
        for (let vertex = 0; vertex < position.count; vertex++) {
            let sum = 0;
            for (let axis = 0; axis < 3; axis++) requireValue(
                Number.isFinite(position.getComponent(vertex, axis)), 'Invalid prepared position');
            for (let influence = 0; influence < 4; influence++) {
                const joint = joints.getComponent(vertex, influence);
                const weight = weights.getComponent(vertex, influence);
                requireValue(Number.isInteger(joint) && joint >= 0 && joint < fit.nativeSkeleton.bones.length
                    && Number.isFinite(weight) && weight >= 0 && weight <= 1,
                'Invalid prepared native influence');
                sum += weight;
            }
            requireValue(Math.abs(sum - 1) < 1e-5, 'Prepared native weights are not normalized');
        }
    }
}

/** Clip the selected body's own surface, preserving its rig, UVs and source prefix. */
export function preparedCoverage(
    source: NativeModuleSource, fit: MeshyBodyFitAdapter, footwear: NativeModuleSource[] = [],
) {
    const prepared = source.binding.precomputedNative!;
    requireValue(prepared.version === 2, 'Full outfit coverage requires version 2');
    const config = prepared.coverage;
    const original = fit.source;
    const surface = {...original, regions: original.regions.map((region, vertex) =>
        region === 'FEET' ? (original.positions[vertex * 3] >= 0 ? 'FEET_L' : 'FEET_R') : region),
    };
    const regions = [...new Set(surface.regions)];
    const plane = (normal: number[], constant: number): BodyCutPlane => ({regions, normal, constant});
    const clip = (planes: BodyCutPlane[], covered = new Set<number>()) =>
        maskedBodyGeometry(fit.sourceGeometry, surface, covered, planes);
    const fragments = [
        clip([plane([0, 1, 0], -config.headAbove)]),
        clip([
            plane([0, 1, 0], -config.neckAbove), plane([0, -1, 0], config.headAbove),
            plane([1, 0, 0], config.neckHalfWidth), plane([-1, 0, 0], config.neckHalfWidth),
        ]),
        // Retain the native chest and undershirt inside the low V; the back remains covered by the tunic.
        clip([
            plane([0, 1, 0], -config.chestAbove), plane([0, -1, 0], config.neckAbove),
            plane([1, config.chestSlope, 0],
                config.chestHalfWidth - config.chestSlope * config.chestAbove),
            plane([-1, config.chestSlope, 0],
                config.chestHalfWidth - config.chestSlope * config.chestAbove),
            plane([0, 0, 1], -config.chestFront),
        ]),
    ];
    for (const cuff of config.arms) {
        const covered = new Set<number>();
        for (let triangle = 0; triangle < surface.triangles; triangle++) {
            if (!surface.indices.slice(triangle * 3, triangle * 3 + 3)
                .every(vertex => cuff.regions.includes(surface.regions[vertex]))) covered.add(triangle);
        }
        fragments.push(clip([{...cuff, regions}], covered));
    }
    const lowerCovered = new Set<number>();
    for (let triangle = 0; triangle < surface.triangles; triangle++) {
        const corners = surface.indices.slice(triangle * 3, triangle * 3 + 3);
        if (corners.some(vertex => surface.regions[vertex].includes('ARM_'))
            || corners.every(vertex => ['PELVIS', 'UPPER_LEG_L', 'UPPER_LEG_R']
                .includes(surface.regions[vertex]))) lowerCovered.add(triangle);
    }
    // Shoes remove only their measured bands from the exposed lower-body fragments.
    // Keep the source regions for masking: the legacy cuff planes use split FEET_L/R labels.
    const bands = footwear.flatMap(item => {
        const binding = item.binding.precomputedNative;
        requireValue(item.asset.metadata?.slot === 'footwear' && binding?.version === 3,
            'Only independently bound footwear may complement a full outfit');
        return binding.moduleCoverage;
    });
    const boundaries = [...new Set(bands.flatMap(band => [band.minimumY, band.maximumY]))]
        .sort((a, b) => a - b);
    const intervals = [-Infinity, ...boundaries, Infinity];
    for (let index = 0; index < intervals.length - 1; index++) {
        const minimum = intervals[index], maximum = intervals[index + 1];
        const middle = minimum === -Infinity ? maximum - 1 : maximum === Infinity
            ? minimum + 1 : (minimum + maximum) / 2;
        const active = bands.filter(band => middle > band.minimumY && middle < band.maximumY);
        const covered = new Set(lowerCovered);
        for (let triangle = 0; triangle < surface.triangles; triangle++) {
            const corners = surface.indices.slice(triangle * 3, triangle * 3 + 3);
            if (active.some(band => corners.some(vertex => band.regions.includes(original.regions[vertex]))
                && !corners.some(vertex => band.preserveRegions?.includes(original.regions[vertex])))) {
                covered.add(triangle);
            }
        }
        const planes = [plane([0, -1, 0], .97), ...config.legs];
        if (Number.isFinite(minimum)) planes.push(plane([0, 1, 0], -minimum));
        if (Number.isFinite(maximum)) planes.push(plane([0, -1, 0], maximum));
        fragments.push(clip(planes, covered));
    }
    const geometry = mergeGeometries(fragments, false);
    for (const fragment of fragments) fragment.dispose();
    requireValue(geometry, 'Selected body coverage could not be combined');
    geometry.computeBoundingSphere();
    return geometry;
}

/** Keep native skin and undershirt, with a small underlap behind the collar edge. */
export function preparedCoverageMaterial(
    original: Material,
    encoding: Matrix4,
    coverage: Extract<NonNullable<NativeModuleSource['binding']['precomputedNative']>, {version: 2}>['coverage'],
) {
    const material = original.clone();
    const compile = original.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        compile.call(original, shader, renderer);
        shader.uniforms.preparedCoverageEncoding = {value: encoding};
        shader.uniforms.preparedNeckline = {value: [
            coverage.chestAbove, coverage.chestHalfWidth, coverage.chestSlope, .012,
        ]};
        shader.vertexShader = 'uniform mat4 preparedCoverageEncoding;\nvarying vec3 vPreparedCoveragePosition;\n'
            + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nvPreparedCoveragePosition = '
            + '(preparedCoverageEncoding * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = 'uniform vec4 preparedNeckline;\nvarying vec3 vPreparedCoveragePosition;\n'
            + shader.fragmentShader;
        // The earlier broad discard removed the whole undershirt. Only its side edges
        // outside the V are hidden here; native skin and the centre remain untouched.
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            #ifdef USE_MAP
            float necklineWidth = max(0.01, preparedNeckline.y
                + preparedNeckline.z * (vPreparedCoveragePosition.y - preparedNeckline.x)
                - preparedNeckline.w);
            vec3 preparedSourceTexel = sRGBTransferOETF(vec4(sampledDiffuseColor.rgb, 1.0)).rgb;
            // Use the body's own skin classifier in the same colour space, including
            // blended atlas edges that looked white but passed the old linear test.
            bool nativeSkin = preparedSourceTexel.r >= 60.0 / 255.0
                && preparedSourceTexel.r >= preparedSourceTexel.g * 1.18
                && preparedSourceTexel.r >= preparedSourceTexel.b * 1.25;
            if (vPreparedCoveragePosition.y >= preparedNeckline.x
                && vPreparedCoveragePosition.y <= 1.45
                && abs(vPreparedCoveragePosition.x) <= 0.145
                && !nativeSkin && abs(vPreparedCoveragePosition.x) > necklineWidth) discard;
            #endif
        `);
    };
    material.customProgramCacheKey = () => original.customProgramCacheKey() + '/prepared-collar-underlap/1';
    return material;
}


/** Independent clothing masks combine by removing each covered band from the native surface. */
export function preparedModuleCoverage(sources: NativeModuleSource[], fit: MeshyBodyFitAdapter) {
    const surface = fit.source;
    const bands = sources.flatMap(source => {
        const prepared = source.binding.precomputedNative;
        if (!prepared) return [];
        requireValue(prepared.version === 3, 'Independent clothing coverage requires version 3');
        return prepared.moduleCoverage;
    });
    const fragments = [];
    // Split at every measured opening. Each fragment retains the original native influences.
    const boundaries = [...new Set(bands.flatMap(band => [band.minimumY, band.maximumY]))]
        .sort((a, b) => a - b);
    const allRegions = [...new Set(surface.regions)];
    const intervals = [-Infinity, ...boundaries, Infinity];
    for (let index = 0; index < intervals.length - 1; index++) {
        const minimum = intervals[index], maximum = intervals[index + 1];
        const middle = minimum === -Infinity ? maximum - 1 : maximum === Infinity
            ? minimum + 1 : (minimum + maximum) / 2;
        const activeBands = bands.filter(band => middle > band.minimumY && middle < band.maximumY);
        const covered = new Set(sources.flatMap(source =>
            source.binding.lods[fit.body.lod].coverageTriangles));
        for (let triangle = 0; triangle < surface.triangles; triangle++) {
            const corners = surface.indices.slice(triangle * 3, triangle * 3 + 3);
            const hidden = activeBands.some(band =>
                corners.some(vertex => band.regions.includes(surface.regions[vertex]))
                && !corners.some(vertex => band.preserveRegions?.includes(surface.regions[vertex])));
            if (hidden) covered.add(triangle);
        }
        const planes: BodyCutPlane[] = sources.flatMap(source => source.binding.coverageClipPlanes ?? []);
        if (Number.isFinite(minimum)) planes.push({regions: allRegions, normal: [0, 1, 0], constant: -minimum});
        if (Number.isFinite(maximum)) planes.push({regions: allRegions, normal: [0, -1, 0], constant: maximum});
        fragments.push(maskedBodyGeometry(fit.sourceGeometry, surface, covered, planes));
        // Restore only this garment's exposed body windows. Other modules keep their masks.
        for (const owner of sources) {
            const prepared = owner.binding.precomputedNative;
            if (prepared?.version !== 3) continue;
            const ownBands = prepared.moduleCoverage.filter(band =>
                middle > band.minimumY && middle < band.maximumY);
            const otherBands = sources.filter(source => source !== owner).flatMap(source => {
                const other = source.binding.precomputedNative;
                return other?.version === 3 ? other.moduleCoverage.filter(band =>
                    middle > band.minimumY && middle < band.maximumY) : [];
            });
            for (const opening of prepared.bodyOpenings ?? []) {
                if (opening.maximumY <= minimum || opening.minimumY >= maximum) continue;
                const excluded = new Set(sources.flatMap(source =>
                    source.binding.lods[fit.body.lod].coverageTriangles));
                for (let triangle = 0; triangle < surface.triangles; triangle++) {
                    const corners = surface.indices.slice(triangle * 3, triangle * 3 + 3);
                    const hides = (band: typeof bands[number]) => corners.some(vertex =>
                        band.regions.includes(surface.regions[vertex]))
                        && !corners.some(vertex => band.preserveRegions?.includes(surface.regions[vertex]));
                    if (!ownBands.some(hides) || otherBands.some(hides)) excluded.add(triangle);
                }
                const windowPlanes: BodyCutPlane[] = [
                    ...planes,
                    {regions: allRegions, normal: [0, 1, 0], constant: -opening.minimumY},
                    {regions: allRegions, normal: [0, -1, 0], constant: opening.maximumY},
                    ...opening.planes.map(plane => ({...plane, regions: allRegions})),
                ];
                fragments.push(maskedBodyGeometry(fit.sourceGeometry, surface, excluded, windowPlanes));
            }
        }
    }
    const result = mergeGeometries(fragments, false);
    for (const fragment of fragments) fragment.dispose();
    requireValue(result, 'Independent clothing body coverage could not be combined');
    const neck = sources.flatMap(source => {
        const prepared = source.binding.precomputedNative;
        return prepared?.version === 3 && prepared.neckMaterial?.stabilizeSkinWeights
            ? [prepared.neckMaterial] : [];
    });
    requireValue(neck.length <= 1, 'Only one exposed neck weight policy may be selected');
    if (neck.length) {
        const boundary = neck[0];
        const position = result.getAttribute('position');
        const joints = result.getAttribute('skinIndex'), weights = result.getAttribute('skinWeight');
        for (let vertex = 0; vertex < position.count; vertex++) {
            const point = new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(fit.encoding);
            if (point.y < boundary.minimumY - preparedOpeningTolerance
                || point.y > boundary.maximumY + preparedOpeningTolerance
                || Math.abs(point.x) > boundary.halfWidth + preparedOpeningTolerance) continue;
            const fraction = Math.max(0, Math.min(1, (point.y - 1.36) / .085));
            const amount = fraction * fraction * (3 - 2 * fraction);
            // Native neck corners contain stray arm influences. Keep the restored skin
            // on its anatomical spine/neck joints without copying any replacement body.
            joints.setXYZW(vertex, 3, 4, 0, 0);
            weights.setXYZW(vertex, 1 - amount, amount, 0, 0);
        }
    }
    result.computeBoundingSphere();
    return result;
}


/** Preserve native neck skin while keeping the body's original tank straps under the collar. */
export function preparedNeckMaterial(original: Material, encoding: Matrix4,
    boundary: NonNullable<Extract<NonNullable<NativeModuleSource['binding']['precomputedNative']>,
        {version: 3}>['neckMaterial']>) {
    const material = original.clone();
    const compile = original.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        compile.call(original, shader, renderer);
        shader.uniforms.preparedNeckEncoding = {value: encoding};
        shader.uniforms.preparedNeckTolerance = {value: preparedOpeningTolerance};
        shader.uniforms.preparedNeckBoundary = {value: [boundary.minimumY, boundary.maximumY,
            boundary.halfWidth, boundary.undershirtHalfWidth]};
        shader.vertexShader = 'uniform mat4 preparedNeckEncoding;\nvarying vec3 vPreparedNeckPosition;\n'
            + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nvPreparedNeckPosition = (preparedNeckEncoding * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = 'uniform vec4 preparedNeckBoundary;\nuniform float preparedNeckTolerance;\n'
            + 'varying vec3 vPreparedNeckPosition;\n'
            + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            #ifdef USE_MAP
            vec3 neckSourceTexel = sRGBTransferOETF(vec4(sampledDiffuseColor.rgb, 1.0)).rgb;
            bool neckNativeSkin = neckSourceTexel.r >= 60.0 / 255.0
                && neckSourceTexel.r >= neckSourceTexel.g * 1.18
                && neckSourceTexel.r >= neckSourceTexel.b * 1.25;
            bool insideFrontSlit = vPreparedNeckPosition.z >= 0.0
                && abs(vPreparedNeckPosition.x) <= preparedNeckBoundary.w;
            if (vPreparedNeckPosition.y >= preparedNeckBoundary.x - preparedNeckTolerance
                && vPreparedNeckPosition.y <= preparedNeckBoundary.y + preparedNeckTolerance
                && abs(vPreparedNeckPosition.x) <= preparedNeckBoundary.z + preparedNeckTolerance
                && !neckNativeSkin && !insideFrontSlit) discard;
            #endif
        `);
    };
    material.customProgramCacheKey = () => original.customProgramCacheKey() + '/prepared-native-neck-skin/1';
    return material;
}
