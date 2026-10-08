import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const { garmentBindBones } = loadTypeScript(new URL('../../src/characters/AttachmentContract.ts', import.meta.url));

/** Output-frame comparison is metric, rather than a decimal-place comparison. */
export const garmentBindToleranceMetres = 1e-6;
export const garmentOutputBindFrame = Object.freeze({
  frame: 'universal-human-neutral-v1', units: 'metres', up: '+Y', front: '+Z', origin: 'ground',
});

/** Validate the designated FINAL output frame against the registry.
 * Source/ancestor calibration tables are deliberately never searched: an original
 * generated figure may have a different stance from its canonical output.
 * Optional sibling bytes additionally prove the authored table's exact file hash.
 * General generation/output-GLB hash ancestry is validated separately.
 */
export function validateGarmentBindProvenance(asset, lod, provenance, {
  toleranceMetres = garmentBindToleranceMetres, sidecarBytes,
} = {}) {
  const check = (condition, message) => assert.ok(condition, `${asset?.id ?? 'garment'} LOD${lod}: ${message}`);
  check(asset?.type === 'garment' && asset.metadata?.garmentBind, 'output bind validation requires registry garmentBind');
  check(Number.isFinite(toleranceMetres) && toleranceMetres >= 0, 'bind tolerance must be a finite nonnegative metre value');
  const frame = provenance?.outputGarmentBind;
  check(frame && typeof frame === 'object' && !Array.isArray(frame), 'missing designated final outputGarmentBind');
  for (const [key, value] of Object.entries(garmentOutputBindFrame)) {
    check(frame[key] === value, `outputGarmentBind.${key} must be ${value}`);
  }
  check(typeof frame.metadataSha256 === 'string' && /^[a-f0-9]{64}$/.test(frame.metadataSha256), 'output garment-bind sidecar SHA256 is invalid');

  const validateJoints = (joints, label) => {
    check(joints && typeof joints === 'object' && !Array.isArray(joints), `${label}: missing joint table`);
    const keys = Object.keys(joints);
    check(keys.length === garmentBindBones.length && keys.every(name => garmentBindBones.includes(name)) && garmentBindBones.every(name => Object.hasOwn(joints, name)), `${label}: expected exactly the declared ${garmentBindBones.length} canonical joints`);
    for (const name of garmentBindBones) {
      check(Array.isArray(joints[name]) && joints[name].length === 3 && [0, 1, 2].every(index => Number.isFinite(joints[name][index])), `${label}.${name}: expected a finite metre triple`);
    }
    return joints;
  };
  const registry = validateJoints(asset.metadata.garmentBind.joints, 'registry garmentBind');
  const output = validateJoints(frame.joints, 'outputGarmentBind');
  const compare = (candidate, authority, label) => garmentBindBones.map(name => {
    const errorMetres = Math.hypot(...candidate[name].map((value, index) => value - authority[name][index]));
    check(errorMetres <= toleranceMetres, `${label}.${name}: output bind differs by ${errorMetres}m (tolerance ${toleranceMetres}m)`);
    return { joint: name, errorMetres };
  });
  const errors = compare(output, registry, 'outputGarmentBind');
  let sidecarHashVerified = false;
  if (sidecarBytes !== undefined) {
    check(sidecarBytes instanceof Uint8Array, 'garment-bind sidecar must be supplied as exact bytes');
    const bytes = Buffer.from(sidecarBytes);
    check(createHash('sha256').update(bytes).digest('hex') === frame.metadataSha256, 'garment-bind sidecar hash differs from final output declaration');
    let sidecar;
    try { sidecar = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
    catch { check(false, 'garment-bind sidecar is invalid JSON'); }
    const joints = validateJoints(sidecar?.joints, 'garment-bind sidecar');
    compare(joints, output, 'garment-bind sidecar');
    sidecarHashVerified = true;
  }
  return {
    frame: frame.frame, jointCount: garmentBindBones.length, toleranceMetres,
    maximumErrorMetres: Math.max(...errors.map(entry => entry.errorMetres)),
    jointErrors: errors, metadataSha256: frame.metadataSha256, sidecarHashVerified,
  };
}
