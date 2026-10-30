import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { prepareAlphaSource, sealAlphaArtifact, verifyAlphaArtifact } from './build-info.mjs';

const { values } = parseArgs({ options: {
    output: { type: 'string' }, seal: { type: 'string' }, verify: { type: 'string' }, commit: { type: 'string' },
} });
if (values.output && !values.seal && !values.verify) {
    const prepared = prepareAlphaSource(process.cwd(), resolve(values.output));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'source=' + prepared.sourceDirectory + '\n');
    console.log(JSON.stringify(prepared, null, 2));
} else if (values.seal && !values.output && !values.verify) {
    console.log(JSON.stringify(sealAlphaArtifact(resolve(values.seal)), null, 2));
} else if (values.verify && !values.output && !values.seal) {
    console.log(JSON.stringify(verifyAlphaArtifact(resolve(values.verify), { commit: values.commit }), null, 2));
} else throw new Error('Use --output DIRECTORY, --seal SOURCE, or --verify ARTIFACT [--commit SHA].');
