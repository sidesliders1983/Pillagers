import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { garmentBindToleranceMetres, garmentOutputBindFrame, validateGarmentBindProvenance } from '../scripts/characters/garment-bind-validation.mjs';

const { garmentBindBones } = loadTypeScript(new URL('../src/characters/AttachmentContract.ts', import.meta.url));
const clone = value => structuredClone(value);
const triples = {
  Hips: [0, .9, 0], Chest: [0, 1.29, 0], Neck: [0, 1.43, 0],
  UpperArm_L: [.235, 1.4, 0], LowerArm_L: [.33, 1.1, 0], Hand_L: [.39, .91, 0],
  UpperLeg_L: [.13, .9, 0], LowerLeg_L: [.18, .49, 0], Foot_L: [.21, .105, 0], Toe_L: [.21, .05, .13],
  UpperArm_R: [-.235, 1.4, 0], LowerArm_R: [-.33, 1.1, 0], Hand_R: [-.39, .91, 0],
  UpperLeg_R: [-.13, .9, 0], LowerLeg_R: [-.18, .49, 0], Foot_R: [-.21, .105, 0], Toe_R: [-.21, .05, .13],
};
const canonicalJoints = Object.fromEntries(garmentBindBones.map(name => [name, triples[name]]));
function fixture() {
  const registry = clone(canonicalJoints), output = clone(canonicalJoints);
  const sidecarBytes = Buffer.from(JSON.stringify({ joints: output }, null, 2) + '\n');
  const asset = { id: 'garment/contract-fixture', type: 'garment', metadata: { garmentBind: { joints: registry } } };
  const provenance = { outputSha256: 'a'.repeat(64), outputGarmentBind: {
    ...garmentOutputBindFrame, joints: output, metadataSha256: createHash('sha256').update(sidecarBytes).digest('hex'),
  } };
  return { asset, provenance, sidecarBytes };
}
const validate = ({ asset, provenance }, options) => validateGarmentBindProvenance(asset, 2, provenance, options);

test('final canonical output and exact sidecar agree with all declared registry joints', () => {
  const data = fixture(), result = validate(data, { sidecarBytes: data.sidecarBytes });
  assert.equal(result.jointCount, 17);
  assert.equal(result.jointErrors.length, garmentBindBones.length);
  assert.equal(result.maximumErrorMetres, 0);
  assert.equal(result.toleranceMetres, 1e-6);
  assert.equal(result.sidecarHashVerified, true);
  assert.equal(validate(data).sidecarHashVerified, false, 'absence of bytes must not imply hash verification');
  data.provenance.outputGarmentBind.joints = Object.fromEntries(Object.entries(data.provenance.outputGarmentBind.joints).reverse());
  assert.equal(validate(data).maximumErrorMetres, 0, 'JSON key order is not a coordinate frame');
});

test('every joint is compared; a single altered output joint fails despite matching source ancestry', () => {
  for (const name of garmentBindBones) {
    const data = fixture();
    data.provenance.sourceProvenance = { fit: { garmentBind: clone(data.asset.metadata.garmentBind) } };
    data.provenance.outputGarmentBind.joints[name][2] += .001;
    assert.throws(() => validate(data), new RegExp(`outputGarmentBind\\.${name}: output bind differs`));
  }
});

test('original measured source-frame may differ; only the designated final output is authoritative', () => {
  const data = fixture();
  const original = Object.fromEntries(Object.entries(canonicalJoints).map(([name, [x, y, z]]) => [name, [x * 1.4 + .03, y * .8 - .1, z - .2]]));
  data.provenance.fit = { garmentBind: { joints: original } };
  data.provenance.sourceProvenance = { outputGarmentBind: { ...garmentOutputBindFrame, joints: original }, fit: { garmentBind: { joints: original } } };
  assert.equal(validate(data).maximumErrorMetres, 0);
  data.provenance.outputGarmentBind.joints = original;
  data.provenance.sourceProvenance.fit.garmentBind.joints = clone(canonicalJoints);
  assert.throws(() => validate(data), /output bind differs/, 'a matching ancestor cannot excuse an incorrect final output');
  delete data.provenance.outputGarmentBind;
  data.provenance.sourceProvenance.outputGarmentBind.joints = clone(canonicalJoints);
  assert.throws(() => validate(data), /missing designated final outputGarmentBind/, 'missing final frame cannot fall back to an ancestor');
});

test('missing, renamed or extra output and registry joints fail the shared canonical vocabulary', () => {
  for (const source of ['output', 'registry']) for (const alteration of ['missing', 'renamed', 'extra']) {
    const data = fixture(), joints = source === 'output' ? data.provenance.outputGarmentBind.joints : data.asset.metadata.garmentBind.joints;
    if (alteration === 'missing') delete joints.Toe_R;
    else if (alteration === 'renamed') { joints.OtherToe = joints.Toe_R; delete joints.Toe_R; }
    else joints.UnexpectedJoint = [0, 0, 0];
    assert.throws(() => validate(data), /expected exactly the declared 17 canonical joints/);
  }
});

test('nonfinite, nonnumeric or incomplete coordinate triples fail without coercion', () => {
  for (const source of ['output', 'registry']) for (const point of [[NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity], ['0', 0, 0], [0, 0], [0, 0, 0, 0], new Array(3), null]) {
    const data = fixture(), joints = source === 'output' ? data.provenance.outputGarmentBind.joints : data.asset.metadata.garmentBind.joints;
    joints.Hand_L = point;
    assert.throws(() => validate(data), /Hand_L: expected a finite metre triple/);
  }
});

test('comparison uses explicit Euclidean metre tolerance rather than separate per-axis limits', () => {
  const within = fixture();
  within.provenance.outputGarmentBind.joints.Hips[0] += garmentBindToleranceMetres * .75;
  assert.ok(validate(within).maximumErrorMetres > 0);
  assert.throws(() => validate(within, { toleranceMetres: 0 }), /output bind differs/);
  const beyond = fixture();
  beyond.provenance.outputGarmentBind.joints.Hips[0] += garmentBindToleranceMetres * .8;
  beyond.provenance.outputGarmentBind.joints.Hips[2] += garmentBindToleranceMetres * .8;
  assert.throws(() => validate(beyond), /output bind differs/, 'combined XYZ distance exceeds one micron');
  for (const toleranceMetres of [NaN, Infinity, -.001, '0.001']) assert.throws(() => validate(fixture(), { toleranceMetres }), /bind tolerance must be a finite nonnegative metre value/);
});

test('output frame conventions and metadata hash are explicit, never inferred from numeric coincidence', () => {
  for (const [key, value] of Object.entries({ frame: 'original-generated-source', units: 'centimetres', up: '+Z', front: '-Z', origin: 'head' })) {
    const data = fixture(); data.provenance.outputGarmentBind[key] = value;
    assert.throws(() => validate(data), new RegExp(`outputGarmentBind\\.${key} must be`));
  }
  for (const metadataSha256 of [undefined, 'invalid', 'A'.repeat(64), 123]) {
    const data = fixture(); data.provenance.outputGarmentBind.metadataSha256 = metadataSha256;
    assert.throws(() => validate(data), /sidecar SHA256 is invalid/);
  }
});

test('optional exact sibling bytes require both their recorded hash and final joint-table parity', () => {
  const data = fixture();
  assert.throws(() => validate(data, { sidecarBytes: Buffer.concat([data.sidecarBytes, Buffer.from(' ')]) }), /sidecar hash differs/);
  assert.throws(() => validate(data, { sidecarBytes: data.sidecarBytes.toString() }), /sidecar must be supplied as exact bytes/);
  const mismatched = clone(canonicalJoints); mismatched.Neck[1] += .01;
  const bytes = Buffer.from(JSON.stringify({ joints: mismatched }));
  data.provenance.outputGarmentBind.metadataSha256 = createHash('sha256').update(bytes).digest('hex');
  assert.throws(() => validate(data, { sidecarBytes: bytes }), /garment-bind sidecar.Neck: output bind differs/, 'a true sibling hash does not excuse a different table');
  const invalid = Buffer.from('{not-json');
  data.provenance.outputGarmentBind.metadataSha256 = createHash('sha256').update(invalid).digest('hex');
  assert.throws(() => validate(data, { sidecarBytes: invalid }), /sidecar is invalid JSON/);
});
